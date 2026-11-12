import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

// Stored format: "<salt hex>:<hash hex>".
export function hashPassword(password) {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, KEY_LENGTH).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !/^[a-f0-9]{32}:[a-f0-9]{128}$/i.test(stored)) return false;
  const [salt, hash] = stored.split(':');
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), KEY_LENGTH);
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
