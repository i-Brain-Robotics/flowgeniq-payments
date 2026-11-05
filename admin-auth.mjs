import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const parameters = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const hashToken = value => createHash('sha256').update(value).digest('hex');
export function validPasswordHash(value) { return /^scrypt:32768:8:3:[a-f0-9]{32}:[a-f0-9]{128}$/.test(value || ''); }
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 16 || Buffer.byteLength(password) > 1024) throw new Error('Use a password of at least 16 characters (maximum 1,024 bytes).');
  const salt = randomBytes(16).toString('hex');
  const result = await scrypt(password, salt, 64, parameters);
  return `scrypt:32768:8:3:${salt}:${result.toString('hex')}`;
}
export async function verifyPassword(password, hash) {
  if (!validPasswordHash(hash) || typeof password !== 'string' || Buffer.byteLength(password) > 1024) return false;
  const [, , , , salt, expected] = hash.split(':');
  const result = await scrypt(password, salt, 64, parameters);
  return timingSafeEqual(result, Buffer.from(expected, 'hex'));
}
export function createSession(username, passwordHash, now = Date.now()) {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: hashToken(token), csrf: randomBytes(32).toString('hex'), username,
    credentialVersion: hashToken(`${username}:${passwordHash}`), expires: now + 8 * 60 * 60 * 1000 };
}


