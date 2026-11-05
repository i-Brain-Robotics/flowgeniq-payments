import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export class CheckoutError extends Error {
  constructor(status, message, code = 'checkout_error') { super(message); this.status = status; this.code = code; }
}
const hmac = (text, secret) => createHmac('sha256', secret).update(text).digest('hex');
export const nonce = () => randomBytes(12).toString('hex');
export const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function signCookie(data, secret) {
  const text = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${text}.${hmac(text, secret)}`;
}
export function readCookie(value, secret, now = Date.now()) {
  try {
    if (typeof value !== 'string' || value.length > 2000) return null;
    const [text, signature, extra] = value.split('.');
    if (extra || !equal(signature, hmac(text, secret))) return null;
    const data = JSON.parse(Buffer.from(text, 'base64url').toString());
    if (!Number.isSafeInteger(data.expires) || data.expires < Math.floor(now / 1000) || !/^[a-f0-9]{24}$/.test(data.nonce)) return null;
    return data;
  } catch { return null; }
}

// Under PayPal's 127-character custom_id limit. The signed reference permanently
// binds the provider's order to the agreed total, terms and delivery country.
export function makeReference(ticket, country, secret) {
  if (ticket.monthly) {
    const value = [ticket.provider === 'affirm' ? 'fd3' : 'fd2',ticket.nonce,ticket.hardware.toString(36),ticket.monthly.toString(36),ticket.currency,ticket.expires.toString(36),ticket.termsHash,country,ticket.selection].join('.');
    return `${value}.${hmac(value,secret).slice(0,32)}`;
  }
  const value = ['fd1', ticket.nonce, ticket.amount, ticket.currency, ticket.expires, ticket.termsHash, country].join('.');
  return `${value}.${hmac(value, secret).slice(0, 32)}`;
}
export function readReference(value, secret) {
  if (typeof value !== 'string' || value.length > 127) throw new CheckoutError(400, 'This checkout reference is invalid. Return to the shop.', 'invalid_reference');
  const parts = value.split('.');
  const signature = parts.pop();
  if (['fd2', 'fd3'].includes(parts[0])) {
    const [prefix,id,hardwareText,monthlyText,currency,expiresText,termsHash,country,choice] = parts;
    const hardware=parseInt(hardwareText,36), monthly=parseInt(monthlyText,36), expires=parseInt(expiresText,36);
    if (parts.length!==9 || !equal(signature,hmac(parts.join('.'),secret).slice(0,32)) || !/^[a-f0-9]{24}$/.test(id) || ![hardware,monthly].every(x=>Number.isSafeInteger(x)&&x>0) || hardware+monthly>99999999 || hardware.toString(36)!==hardwareText || monthly.toString(36)!==monthlyText || !Number.isSafeInteger(expires) || expires.toString(36)!==expiresText || !/^[A-Z]{3}$/.test(currency) || !/^[a-f0-9]{12}$/.test(termsHash) || !/^[A-Z]{2}$/.test(country) || !/^[0-7]$/.test(choice)) throw new CheckoutError(400,'Invalid checkout reference.','invalid_reference');
    return {id,hardware,monthly,amount:hardware+monthly,currency,expires,termsHash,country,selection:Number(choice), ...(prefix === 'fd3' ? { affirm: true } : {})};
  }
  if (parts.length !== 7 || !equal(signature, hmac(parts.join('.'), secret).slice(0, 32))) throw new CheckoutError(400, 'This checkout reference is invalid. Return to the shop.', 'invalid_reference');
  const [prefix, id, amount, currency, expires, termsHash, country] = parts;
  if (prefix !== 'fd1' || !/^[a-f0-9]{24}$/.test(id) || !/^[1-9]\d{0,7}$/.test(amount) || !/^[A-Z]{3}$/.test(currency) || !/^\d{10}$/.test(expires) || !/^[a-f0-9]{12}$/.test(termsHash) || !/^[A-Z]{2}$/.test(country)) throw new CheckoutError(400, 'Invalid checkout reference.', 'invalid_reference');
  return { id, amount: Number(amount), currency, expires: Number(expires), termsHash, country };
}

export function stripeSignature(raw, header, secret, now = Date.now()) {
  if (!secret || typeof header !== 'string') return false;
  const fields = header.split(',').map(field => field.trim().split('='));
  const timestamps = fields.filter(([key]) => key === 't');
  const timestamp = timestamps[0]?.[1];
  if (timestamps.length !== 1 || !/^\d+$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex');
  return fields.some(([key, value]) => key === 'v1' && equal(value, expected));
}

export function providerUrl(value, provider, mode) {
  try {
    const u = new URL(value);
    const hosts = provider === 'stripe' ? ['checkout.stripe.com'] : mode === 'live' ? ['www.paypal.com', 'paypal.com'] : ['www.sandbox.paypal.com', 'sandbox.paypal.com'];
    if (u.protocol === 'https:' && !u.username && !u.password && !u.port && hosts.includes(u.hostname)) return u.href;
  } catch { /* fail closed */ }
  throw new CheckoutError(502, 'The payment provider did not return a valid checkout page. Please try again.', 'invalid_redirect');
}


