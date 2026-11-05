import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { hashPassword } from '../admin-auth.mjs';

if (!process.stdin.isTTY) { console.error('Run this command in an interactive terminal. Do not put your password in command arguments.'); process.exit(1); }
let muted = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
const input = createInterface({ input: process.stdin, output, terminal: true });
async function hidden(prompt) { process.stdout.write(prompt); muted = true; const value = await input.question(''); muted = false; process.stdout.write('\n'); return value; }
try {
  const password = await hidden('Choose an admin password (at least 16 characters): ');
  const confirmation = await hidden('Confirm password: ');
  if (password !== confirmation) throw new Error('Passwords did not match. Run the command again.');
  const hash = await hashPassword(password);
  console.log('\nAdd this value to ADMIN_PASSWORD_HASH in Render Environment:\n' + hash);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { input.close(); }


