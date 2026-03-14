// JWT-like auth for Cloudflare Workers using Web Crypto API

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function hmacSign(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmacVerify(message, signature, secret) {
  const expected = await hmacSign(message, secret);
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

function base64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

export async function createToken(payload, secret, expiresIn = 86400 * 7) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresIn }));
  const signature = await hmacSign(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

export async function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token');

  const [header, body, signature] = parts;
  const valid = await hmacVerify(`${header}.${body}`, signature, secret);
  if (!valid) throw new Error('Invalid signature');

  const payload = JSON.parse(fromBase64url(body));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload;
}

// Legacy SHA-256 hash (for verifying old passwords during migration)
async function hashPasswordLegacy(password, salt) {
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

// PBKDF2 with 100K iterations — proper password KDF
export async function hashPassword(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return 'pbkdf2:' + btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

// Constant-time string comparison to prevent timing attacks on password hashes
function constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Verify password against stored hash (supports both legacy SHA-256 and PBKDF2)
export async function verifyPassword(password, salt, storedHash) {
  if (storedHash.startsWith('pbkdf2:')) {
    const newHash = await hashPassword(password, salt);
    return constantTimeEquals(newHash, storedHash);
  }
  // Legacy SHA-256 verification
  const legacyHash = await hashPasswordLegacy(password, salt);
  return constantTimeEquals(legacyHash, storedHash);
}

// Check if a hash needs migration to PBKDF2
export function needsHashMigration(storedHash) {
  return !storedHash.startsWith('pbkdf2:');
}

export function generateSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr));
}

export function generateId() {
  return crypto.randomUUID();
}
