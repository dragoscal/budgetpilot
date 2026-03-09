// ─── Encrypted AI Key Sync ────────────────────────────────
// Uses PBKDF2 for key derivation and AES-256-GCM for encryption.
// AI keys are encrypted client-side before syncing to the server,
// so the server never sees plaintext API keys.

const PBKDF2_ITERATIONS = 100000;
const ENC_KEY_STORAGE = 'bp_encKey';

// ─── Key Derivation ──────────────────────────────────────

/** Derive an AES-256-GCM key from password + email (deterministic salt) */
export async function deriveEncryptionKey(password, email) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(`budgetpilot_${email.toLowerCase()}`),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // extractable so we can export to sessionStorage
    ['encrypt', 'decrypt']
  );
}

/** Store derived key in browser storage (same storage as auth token) */
export async function storeEncryptionKey(key, useLocalStorage = false) {
  const raw = await crypto.subtle.exportKey('raw', key);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(raw)));
  const storage = useLocalStorage ? localStorage : sessionStorage;
  storage.setItem(ENC_KEY_STORAGE, b64);
}

/** Retrieve derived key from browser storage */
export async function getStoredEncryptionKey() {
  const b64 = sessionStorage.getItem(ENC_KEY_STORAGE) || localStorage.getItem(ENC_KEY_STORAGE);
  if (!b64) return null;
  try {
    const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return crypto.subtle.importKey(
      'raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  } catch {
    return null;
  }
}

/** Check if encryption key is available */
export function hasEncryptionKey() {
  return !!(sessionStorage.getItem(ENC_KEY_STORAGE) || localStorage.getItem(ENC_KEY_STORAGE));
}

/** Clear encryption key from all storages */
export function clearEncryptionKey() {
  sessionStorage.removeItem(ENC_KEY_STORAGE);
  localStorage.removeItem(ENC_KEY_STORAGE);
}

// ─── Encrypt / Decrypt ───────────────────────────────────

/** Encrypt plaintext → base64(IV + ciphertext) */
export async function encrypt(plaintext, key) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return btoa(String.fromCharCode(...combined));
}

/** Decrypt base64(IV + ciphertext) → plaintext */
export async function decrypt(base64Blob, key) {
  const combined = Uint8Array.from(atob(base64Blob), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plainBuffer);
}

// ─── High-Level: Push / Pull Encrypted AI Keys ──────────

/** Encrypt AI keys and push to server settings */
export async function pushEncryptedKeys(aiKeys) {
  const { getSetting } = await import('./storage');
  const apiUrl = await getSetting('apiUrl');
  if (!apiUrl) return false;

  const key = await getStoredEncryptionKey();
  if (!key) return false;

  const token = sessionStorage.getItem('bp_token') || localStorage.getItem('bp_token');
  if (!token) return false;

  try {
    const blob = JSON.stringify(aiKeys);
    const encrypted = await encrypt(blob, key);

    const res = await fetch(`${apiUrl}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ encryptedAiKeys: encrypted }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Failed to push encrypted AI keys:', err.message);
    return false;
  }
}

/** Pull encrypted AI keys from server and decrypt into local settings */
export async function pullEncryptedKeys() {
  const { getSetting, setSetting } = await import('./storage');
  const apiUrl = await getSetting('apiUrl');
  if (!apiUrl) return null;

  const key = await getStoredEncryptionKey();
  if (!key) return null;

  const token = sessionStorage.getItem('bp_token') || localStorage.getItem('bp_token');
  if (!token) return null;

  try {
    const res = await fetch(`${apiUrl}/api/settings`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const settings = data.data || {};

    if (!settings.encryptedAiKeys) return null;

    const decrypted = await decrypt(settings.encryptedAiKeys, key);
    const aiKeys = JSON.parse(decrypted);

    // Write decrypted keys to local IndexedDB settings
    if (aiKeys.anthropicApiKey) await setSetting('anthropicApiKey', aiKeys.anthropicApiKey);
    if (aiKeys.openaiApiKey) await setSetting('openaiApiKey', aiKeys.openaiApiKey);
    if (aiKeys.openrouterApiKey) await setSetting('openrouterApiKey', aiKeys.openrouterApiKey);
    if (aiKeys.aiProvider) await setSetting('aiProvider', aiKeys.aiProvider);
    if (aiKeys.aiModel) await setSetting('aiModel', aiKeys.aiModel);

    console.log('Encrypted AI keys synced from server');
    return aiKeys;
  } catch (err) {
    console.warn('Failed to pull encrypted AI keys:', err.message);
    return null;
  }
}
