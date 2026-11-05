import { createHash } from 'node:crypto';
import { CheckoutError } from './security.mjs';

export const money = n => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(n/100);
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,12);
const integer = (n,min=0,max=99999999) => Number.isSafeInteger(n)&&n>=min&&n<=max;
export const isVerificationItem = p => p?.testOnly===true&&p.kind==='digital'&&p.monthly===0&&!p.credits&&!p.planId&&((p.id==='checkout-test-free'&&p.once===0&&JSON.stringify(p.allowedProviders)===JSON.stringify(['stripe']))||(p.id==='checkout-test-paypal'&&p.once===10&&JSON.stringify(p.allowedProviders)===JSON.stringify(['paypal'])));
export const purchasePolicies=(c,q)=>q.testOnly?{purchase:'One-time checkout verification order for '+money(q.amount)+' USD. No equipment, software access, credits, subscription, delivery or recurring billing is included.'}:c.policies;
export function validateCatalog(c) {
  if (!c || !/^[a-z][a-z0-9-]{2,30}$/.test(c.id) || !c.name || c.currency!=='USD' || !Array.isArray(c.items) || !c.items.length || new Set(c.items.map(x=>x.id)).size!==c.items.length) throw new Error('Invalid catalog');
  for(const p of c.items) if(!/^[a-z0-9][a-z0-9-]{0,79}$/.test(p.id)||!p.name||p.name.length>160||![p.once,p.monthly].every(x=>integer(x))||(p.once+p.monthly<1&&!isVerificationItem(p))||(p.testOnly!==undefined&&!isVerificationItem(p))||!['physical','digital'].includes(p.kind)) throw new Error('Invalid catalog item');
  if(!integer(c.delivery.us)||!integer(c.delivery.global)||!integer(c.delivery.installation)||!integer(c.delivery.floridaBps,0,10000))throw new Error('Invalid delivery rules');
  return c;
}
export function quote(c,input={}) {
  if(Object.keys(input).some(k=>!['sku','quantity','country','region','installation'].includes(k)))throw new CheckoutError(400,'Choose a product from the catalog.');
  const item=c.items.find(p=>p.id===input.sku);
  if(!item)throw new CheckoutError(400,'Choose an available product.');
  if(input.region!==undefined&&typeof input.region!=='string')throw new CheckoutError(400,'Choose a valid state.');
  const quantity=input.quantity??1,country=input.country??'US',region=(input.region??'').trim().toUpperCase(),installation=input.installation??false;
  if(!integer(quantity,1,item.kind==='digital'?1:10)||!c.countries.includes(country)||typeof installation!=='boolean'||region.length>80)throw new CheckoutError(400,'Check the quantity and delivery details.');
  if(installation&&(country!=='US'||item.kind!=='physical'||!c.delivery.installation))throw new CheckoutError(400,'Installation is only available for supported US device deliveries.');
  if(item.kind==='physical'&&country==='US'&&!/^[A-Z]{2}$/.test(region))throw new CheckoutError(400,'Choose your two-letter delivery state.');
  const hardware=item.once*quantity,monthly=item.monthly*quantity;
  const shipping=item.kind==='physical'?(country==='US'?c.delivery.us:c.delivery.global):0;
  const install=installation?c.delivery.installation:0;
  const tax=item.kind==='physical'&&country==='US'&&region==='FL'?Math.round((hardware+shipping+install)*c.delivery.floridaBps/10000):0;
  const once=hardware+shipping+install+tax,amount=once+monthly;
  if(!integer(amount,isVerificationItem(item)&&item.once===0?0:1))throw new CheckoutError(400,'Please contact us for an order of this size.');
  return {sku:item.id,name:item.name,kind:item.kind,quantity,country,region,installation,hardware,shipping,install,tax,once,monthly,amount,currency:'USD',catalogHash:digest(c),credits:item.credits||0,planId:item.planId||null,...(isVerificationItem(item)?{testOnly:true,allowedProviders:item.allowedProviders}:{})};
}
export function origin(value,dev=false){try{const u=new URL(value);if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||!(u.protocol==='https:'||dev&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))return null;return u.origin;}catch{return null;}}
export function configuration(env,catalog){
  const mode=env.PAYMENT_MODE||'test',baseUrl=origin(env.PUBLIC_BASE_URL||env.RENDER_EXTERNAL_URL,env.NODE_ENV!=='production');
  const stripeReady=new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9_]{8,}$`).test(env.STRIPE_SECRET_KEY||'')&&/^whsec_[A-Za-z0-9_]{8,}$/.test(env.STRIPE_WEBHOOK_SECRET||'');
  const paypalReady=[env.PAYPAL_CLIENT_ID,env.PAYPAL_CLIENT_SECRET,env.PAYPAL_WEBHOOK_ID].every(v=>typeof v==='string'&&v.length>=8&&!/placeholder|replace.?me|\s/i.test(v))&&(env.PAYPAL_MODE||(mode==='live'?'live':'sandbox'))===(mode==='live'?'live':'sandbox');
  const enabled=(env.ENABLED_PROVIDERS||'stripe,paypal').split(',');
  const providers=[stripeReady&&'stripe',paypalReady&&'paypal',stripeReady&&env.AFFIRM_MERCHANT_APPROVED==='true'&&'affirm'].filter(p=>p&&enabled.includes(p));
  const signingReady=Buffer.byteLength(env.CHECKOUT_SIGNING_SECRET||'')>=32;
  const policiesReady=Object.values(catalog.policies).every(v=>typeof v==='string'&&v.trim().length>=10);
  const fulfillmentReady=catalog.id!=='flowgeniq'||env.FLOWGENIQ_ENTITLEMENTS_READY==='true';
  const ready=!!baseUrl&&['live','test'].includes(mode)&&signingReady&&!!env.DATABASE_URL&&providers.length>0&&env.SHOP_ENABLED==='true'&&(mode==='test'||policiesReady&&env.CATALOG_APPROVED==='true'&&fulfillmentReady);
  const verificationReady=env.PAYMENT_VERIFICATION_ENABLED==='true'&&!!baseUrl&&signingReady&&!!env.DATABASE_URL&&['live','test'].includes(mode)&&providers.some(p=>['stripe','paypal'].includes(p));
  const verificationChecks={stripeKeyMatchesMode:new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9_]{8,}$`).test(env.STRIPE_SECRET_KEY||''),stripeWebhookConfigured:/^whsec_[A-Za-z0-9_]{8,}$/.test(env.STRIPE_WEBHOOK_SECRET||''),paypalCredentialsConfigured:[env.PAYPAL_CLIENT_ID,env.PAYPAL_CLIENT_SECRET].every(v=>typeof v==='string'&&v.length>=8&&!/placeholder|replace.?me|\s/i.test(v)),paypalWebhookConfigured:typeof env.PAYPAL_WEBHOOK_ID==='string'&&env.PAYPAL_WEBHOOK_ID.length>=8&&!/placeholder|replace.?me|\s/i.test(env.PAYPAL_WEBHOOK_ID),paypalModeMatches:(env.PAYPAL_MODE||(mode==='live'?'live':'sandbox'))===(mode==='live'?'live':'sandbox')};
  return {verificationChecks,verificationReady,baseUrl,storefrontUrl:catalog.storefront,mode,providers,ready,signingReady,policiesReady,fulfillmentReady,signingSecret:env.CHECKOUT_SIGNING_SECRET||'',stripeSecret:env.STRIPE_SECRET_KEY||'',stripeWebhookSecret:env.STRIPE_WEBHOOK_SECRET||'',paypalClient:env.PAYPAL_CLIENT_ID||'',paypalSecret:env.PAYPAL_CLIENT_SECRET||'',paypalWebhookId:env.PAYPAL_WEBHOOK_ID||'',paypalBase:mode==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com'};
}
