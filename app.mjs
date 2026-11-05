import {readFile} from 'node:fs/promises';
import {configuration,quote,digest,purchasePolicies} from './catalog.mjs';
import {createProviders} from './providers.mjs';
import {createStore} from './store.mjs';
import {CheckoutError,nonce,signCookie,readCookie,makeReference,readReference,equal,stripeSignature} from './security.mjs';
import {validPasswordHash,verifyPassword} from './admin-auth.mjs';
import {page,landing,configure,review,result} from './views.mjs';
const css=await readFile(new URL('./checkout.css',import.meta.url));
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; form-action 'self' https://checkout.stripe.com https://www.paypal.com https://paypal.com https://www.sandbox.paypal.com https://sandbox.paypal.com; base-uri 'none'; frame-ancestors 'none'"};
export const send=(res,status,value,html=false,extra={})=>{res.writeHead(status,{...headers,'Content-Type':html?'text/html; charset=utf-8':'application/json; charset=utf-8',...extra});res.end(typeof value==='string'?value:JSON.stringify(value));};
async function body(req,max=4096){const parts=[];let count=0;for await(const p of req){count+=p.length;if(count>max)throw new CheckoutError(413,'Request too large.');parts.push(p);}return Buffer.concat(parts);}
const addressDigest=a=>digest(['name','line1','line2','city','postal'].map(k=>a?.[k]||''));
const json=raw=>{try{const d=JSON.parse(raw);if(!d||typeof d!=='object'||Array.isArray(d))throw 0;return d;}catch{throw new CheckoutError(400,'Invalid request.');}};
export function createApp(env,catalog,options={}){
 const cfg=configuration(env,catalog),store=options.store||createStore(env),providers=options.providers||createProviders(cfg,catalog,options.fetcher),buckets=new Map();
 if(!cfg.baseUrl)throw new Error('Valid PUBLIC_BASE_URL or RENDER_EXTERNAL_URL required');
 const cookieName=cfg.baseUrl.startsWith('https:')?'__Host-payments':'payments';
 const rate=req=>{const ip=env.RENDER==='true'?req.headers['x-forwarded-for']?.split(',').at(-1)?.trim():req.socket.remoteAddress;const now=Date.now();for(const[k,v]of buckets)if(v.until<now)buckets.delete(k);const k=ip||'unknown';if(buckets.size>=10000&&!buckets.has(k))throw new CheckoutError(429,'Please try again later.');const v=buckets.get(k)||{n:0,until:now+60000};buckets.set(k,v);if(++v.n>25)throw new CheckoutError(429,'Please try again in a minute.');};
 const sameOrigin=req=>{if(req.headers.origin!==cfg.baseUrl)throw new CheckoutError(403,'Open checkout from the payment page.');};
 const available=sku=>{if(!(catalog.items.find(p=>p.id===sku)?.testOnly?cfg.verificationReady:cfg.ready))throw new CheckoutError(503,'Checkout is being configured. Please contact us through the shop.');};
 const getOrder=async reference=>{const q=readReference(reference,cfg.signingSecret),o=await store.get(q.id);if(!o||o.reference!==reference||o.amount!==q.amount||o.currency!==q.currency||o.termsHash!==q.termsHash||q.free&&(!o.testOnly||o.sku!=='checkout-test-free'))throw new CheckoutError(404,'Payment reference not found.');return o;};
 async function status(order,capture=false){return store.lock(order.id,async o=>{if(!o.checkout)throw new CheckoutError(409,'Checkout has not started.');const r=await providers.status(o,capture);o.status=r.status;o.subscription=r.subscription||null;return {...r,reference:o.checkout.id};});}
 async function handle(req,res){let isHtml=false,verificationRequest=false;try{
  const url=new URL(req.url,cfg.baseUrl),path=url.pathname;
  isHtml=req.method==='GET'&&!['/api/shop','/healthz','/readyz'].includes(path)||path==='/payments/create';
  if(req.method==='GET'&&path==='/healthz'){send(res,200,{status:'ok',service:catalog.id+'-payments',paymentMode:cfg.mode});return;}
  if(req.method==='GET'&&path==='/readyz'){await store.ready();send(res,200,{status:'ok'});return;}
  if(req.method==='GET'&&path==='/api/shop'){send(res,200,{product:catalog.id,currency:catalog.currency,paymentMode:cfg.mode,ready:cfg.ready,providers:cfg.ready?cfg.providers:[],verification:{ready:cfg.verificationReady,checks:cfg.verificationChecks,providers:cfg.verificationReady?cfg.providers.filter(p=>['stripe','paypal'].includes(p)):[]},items:catalog.items.filter(p=>!p.testOnly||cfg.verificationReady),delivery:catalog.delivery,policies:catalog.policies});return;}
  if(req.method==='GET'&&path==='/payments/checkout.css'){send(res,200,css.toString(),false,{'Content-Type':'text/css; charset=utf-8'});return;}
  if(req.method==='GET'&&path==='/robots.txt'){send(res,200,'User-agent: *\nDisallow: /\n',false,{'Content-Type':'text/plain'});return;}
  if(req.method==='GET'&&['/','/shop'].includes(path)){send(res,200,landing(catalog,cfg),true);return;}
  if(req.method==='GET'&&path==='/admin'){
   rate(req);if(!env.ADMIN_USERNAME||!validPasswordHash(env.ADMIN_PASSWORD_HASH))throw new CheckoutError(503,'Configure ADMIN_USERNAME and ADMIN_PASSWORD_HASH in Render to enable administration.');
   const h=req.headers.authorization||'',decoded=h.startsWith('Basic ')?Buffer.from(h.slice(6),'base64').toString():'';const sep=decoded.indexOf(':');if(sep<0||!equal(decoded.slice(0,sep),env.ADMIN_USERNAME)||!await verifyPassword(decoded.slice(sep+1),env.ADMIN_PASSWORD_HASH)){send(res,401,{error:'Authentication required'},false,{'WWW-Authenticate':'Basic realm="Payments", charset="UTF-8"'});return;}
   send(res,200,{service:catalog.id,mode:cfg.mode,checkoutReady:cfg.ready,providers:cfg.providers,policiesReady:cfg.policiesReady,catalogApproved:env.CATALOG_APPROVED==='true',fulfillmentReady:cfg.fulfillmentReady,credentials:{stripe:!!cfg.stripeSecret,stripeWebhook:!!cfg.stripeWebhookSecret,paypal:!!cfg.paypalClient&&!!cfg.paypalSecret,paypalWebhook:!!cfg.paypalWebhookId},catalog});return;
  }
  if(req.method==='GET'&&path==='/checkout'){
   available(url.searchParams.get('sku')||catalog.items[0].id);rate(req);if([...url.searchParams.keys()].some(k=>!['sku','quantity','country','region','installation'].includes(k))||[...url.searchParams.keys()].some(k=>url.searchParams.getAll(k).length!==1)||url.searchParams.has('installation')&&!['true','false'].includes(url.searchParams.get('installation')))throw new CheckoutError(400,'Invalid configuration.');
   const input={sku:url.searchParams.get('sku')||catalog.items[0].id,quantity:Number(url.searchParams.get('quantity')||1),country:url.searchParams.get('country')||'US',region:url.searchParams.get('region')??'',installation:url.searchParams.get('installation')==='true'};if(catalog.items.find(p=>p.id===input.sku)?.kind==='physical'&&input.country==='US'&&!input.region){send(res,200,configure(catalog,cfg,input),true);return;}const q=quote(catalog,input);
   const termsHash=digest(purchasePolicies(catalog,q));
   const value=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1),old=readCookie(value,cfg.signingSecret);
   const ticket=old&&old.termsHash===termsHash&&digest(old.input)===digest(input)&&old.catalogHash===q.catalogHash&&old.expires>Date.now()/1000+1900?old:{nonce:nonce(),input,catalogHash:q.catalogHash,termsHash,expires:Math.floor(Date.now()/1000)+7200};
   send(res,200,review(catalog,cfg,q,ticket),true,{'Set-Cookie':`${cookieName}=${signCookie(ticket,cfg.signingSecret)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200${cfg.baseUrl.startsWith('https:')?'; Secure':''}`});return;
  }
  if(req.method==='POST'&&path==='/payments/create'){
   sameOrigin(req);rate(req);if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded'))throw new CheckoutError(415,'Use the checkout form.');const form=new URLSearchParams((await body(req)).toString());if([...form.keys()].some(k=>!['csrf','accept','provider','name','line1','line2','city','postal'].includes(k))||[...form.keys()].some(k=>form.getAll(k).length!==1))throw new CheckoutError(400,'Invalid checkout request.');
   const value=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1),ticket=readCookie(value,cfg.signingSecret);
   if(!ticket||!equal(ticket.nonce,form.get('csrf')))throw new CheckoutError(403,'Checkout expired. Return to the shop.');
   const q=quote(catalog,ticket.input);verificationRequest=q.testOnly===true;available(q.sku);if(q.catalogHash!==ticket.catalogHash||ticket.termsHash!==digest(purchasePolicies(catalog,q))||ticket.expires<Date.now()/1000+1800)throw new CheckoutError(409,'Review the current price and terms.');
   const provider=form.get('provider');if(!cfg.providers.includes(provider)||q.testOnly&&!q.allowedProviders.includes(provider)||form.get('accept')!=='yes')throw new CheckoutError(400,'Select a payment method and accept the purchase terms.');
   if(provider==='affirm'&&(q.kind!=='physical'||q.monthly||q.country!=='US'||q.once<3500||q.once>3000000))throw new CheckoutError(400,'Affirm is not available for this configuration.');
   const address=Object.fromEntries(['name','line1','line2','city','postal'].map(k=>[k,(form.get(k)||'').trim()]));if(!address.name||Object.values(address).some(v=>v.length>140)||q.kind==='physical'&&['line1','city','postal'].some(k=>!address[k]))throw new CheckoutError(400,'Complete the delivery details.');
   const termsHash=digest(purchasePolicies(catalog,q)),reference=makeReference({nonce:ticket.nonce,amount:q.amount,currency:q.currency,expires:ticket.expires,termsHash},q.country,cfg.signingSecret);
   const order={...q,id:ticket.nonce,reference,provider,address,expires:ticket.expires,termsHash,status:'creating'};await store.put(order);
   const checkout=await store.lock(order.id,async o=>{if(o.reference!==reference||o.provider!==provider||addressDigest(o.address)!==addressDigest(address))throw new CheckoutError(409,'This checkout has already started. Return to the shop for a new configuration.');if(!o.checkout)o.checkout=await providers.create(o);return o.checkout;});
   send(res,303,'',false,{Location:checkout.url});return;
  }
  if(req.method==='GET'&&['/payments/stripe/return','/payments/paypal/return'].includes(path)){
   rate(req);const o=await getOrder(url.searchParams.get('state'));if(!o.checkout)throw new CheckoutError(409,'Checkout has not started.');const stripe=path.includes('/stripe/');if(stripe?!['stripe','affirm'].includes(o.provider):o.provider!=='paypal')throw new CheckoutError(400,'Invalid payment provider.');const id=stripe?url.searchParams.get('session_id'):url.searchParams.get(o.monthly?'subscription_id':'token');if(id!==o.checkout.id)throw new CheckoutError(409,'Payment reference mismatch.');send(res,200,result(catalog,cfg,(await status(o,!stripe&&!o.monthly)).status,o.checkout.id,o.testOnly),true);return;
  }
  if(req.method==='GET'&&path==='/payments/cancel'){send(res,200,page(catalog,cfg,'Checkout cancelled','<section class="card"><h1>Checkout cancelled.</h1><p>Check your provider receipt before starting another payment.</p></section>'),true);return;}
  if(req.method==='POST'&&path==='/payments/webhooks/stripe'){
   const raw=await body(req,262144);if(!stripeSignature(raw,req.headers['stripe-signature'],cfg.stripeWebhookSecret))throw new CheckoutError(400,'Invalid webhook signature.');const event=json(raw);
   if(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed'].includes(event.type)&&event.data?.object?.metadata?.brand===catalog.id){if(typeof event.id!=='string'||event.id.length>200)throw new CheckoutError(400,'Invalid event.');const s=event.data.object,o=await getOrder(s.metadata.payment_reference);if(!['stripe','affirm'].includes(o.provider)||o.checkout?.id!==s.id)throw new CheckoutError(409,'Payment mismatch.');const r=await status(o);await store.event('stripe',event.id,o.id,r.status);}
   send(res,200,{received:true});return;
  }
  if(req.method==='POST'&&path==='/payments/webhooks/paypal'){
   const event=json(await body(req,262144));if(!await providers.verifyPayPal(req.headers,event))throw new CheckoutError(400,'Invalid webhook signature.');
   if(event.event_type?.startsWith('BILLING.SUBSCRIPTION.')||event.event_type?.startsWith('PAYMENT.SALE.')||['CHECKOUT.ORDER.APPROVED','PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.PENDING','PAYMENT.CAPTURE.DENIED','PAYMENT.CAPTURE.REFUNDED','PAYMENT.CAPTURE.REVERSED'].includes(event.event_type)){
    const ref=await providers.paypalReference(event);if(ref){try{readReference(ref,cfg.signingSecret);}catch{send(res,200,{received:true});return;}if(typeof event.id!=='string'||event.id.length>200)throw new CheckoutError(400,'Invalid event.');const o=await getOrder(ref);if(o.provider!=='paypal')throw new CheckoutError(409,'Payment mismatch.');const r=await status(o,event.event_type==='CHECKOUT.ORDER.APPROVED');await store.event('paypal',event.id,o.id,r.status);}
   }send(res,200,{received:true});return;
  }
  send(res,404,{error:'Not found'});
 }catch(e){const status=e instanceof CheckoutError?e.status:503,message=(e instanceof CheckoutError?e.message:'Payment service temporarily unavailable.')+(verificationRequest&&Number.isInteger(e.providerStatus)?' Provider response: HTTP '+e.providerStatus+(e.providerCode?' ('+e.providerCode+')':'')+'.':'');if(status>=500)console.error(JSON.stringify({event:'payment_error',status,code:e.code||'service_unavailable'}));send(res,status,isHtml?page(catalog,cfg,'Payment service',`<section class="card"><h1>${status>=500?'Checkout unavailable':'Please review your order'}</h1><p>${message}</p></section>`):{error:message},isHtml);}}
 return {handle,close:()=>store.close()};
}
