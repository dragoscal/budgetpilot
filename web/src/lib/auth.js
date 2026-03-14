import { getAll, add, getById, getSetting } from './storage';
import { generateId } from './helpers';
import { deriveEncryptionKey, storeEncryptionKey, clearEncryptionKey, pullEncryptedKeys } from './crypto';

const SESSION_KEY = 'lumet_session';
const TOKEN_KEY = 'bp_token';

async function getApiUrl() {
  return (await getSetting('apiUrl')) || import.meta.env.VITE_API_URL || '';
}

// Legacy SHA-256 hash (for verifying old local passwords)
async function hashPasswordLegacy(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

// PBKDF2 with 100K iterations — must match backend auth.js
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return 'pbkdf2:' + btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));
}

// Verify password against stored hash (supports both legacy and PBKDF2)
async function verifyLocalPassword(password, salt, storedHash) {
  if (storedHash.startsWith('pbkdf2:')) {
    const newHash = await hashPassword(password, salt);
    return newHash === storedHash;
  }
  const legacyHash = await hashPasswordLegacy(password, salt);
  return legacyHash === storedHash;
}

// NOTE: Must match backend auth.js format: base64 output
function generateSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

function generateToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function register({ name, email, password, defaultCurrency = 'RON' }) {
  const apiUrl = await getApiUrl();

  if (apiUrl) {
    // Server mode — try API, fall through to local on network error
    try {
      const res = await fetch(`${apiUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, defaultCurrency }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Registration failed');
      }
      const data = await res.json();
      // Use localStorage so new users stay logged in across sessions
      localStorage.setItem(TOKEN_KEY, data.token);
      const session = { userId: data.user.id, token: data.token, createdAt: new Date().toISOString() };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));

      // Derive encryption key from password for future AI key encryption
      try {
        const encKey = await deriveEncryptionKey(password, email.toLowerCase());
        await storeEncryptionKey(encKey, true);
      } catch (e) {
        console.warn('Encryption key setup failed:', e.message);
      }

      return data.user;
    } catch (err) {
      // Network error (API unreachable) — fall through to local mode
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        console.warn('API unreachable, using local registration:', err.message);
      } else {
        throw err; // Re-throw server validation errors (e.g. "Email already exists")
      }
    }
  }

  // Local mode
  const users = await getAll('users');
  if (users.find((u) => u.email === email.toLowerCase())) {
    throw new Error('An account with this email already exists');
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const id = generateId();

  const user = {
    id,
    email: email.toLowerCase(),
    name,
    passwordHash,
    salt,
    defaultCurrency,
    avatar: name.charAt(0).toUpperCase(),
    onboardingComplete: false,
    createdAt: new Date().toISOString(),
  };

  await add('users', user);

  const token = generateToken();
  const session = { userId: id, token, createdAt: new Date().toISOString() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));

  const { passwordHash: _, salt: __, ...safeUser } = user;
  return safeUser;
}

export async function login({ email, password, remember = false }) {
  const apiUrl = await getApiUrl();

  if (apiUrl) {
    // Server mode — try API, fall through to local on network error
    try {
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Login failed');
      }
      const data = await res.json();
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem(TOKEN_KEY, data.token);
      const session = { userId: data.user.id, token: data.token, createdAt: new Date().toISOString() };
      storage.setItem(SESSION_KEY, JSON.stringify(session));

      // Derive encryption key from password and store for AI key decryption
      try {
        const encKey = await deriveEncryptionKey(password, email.toLowerCase());
        await storeEncryptionKey(encKey, remember);
        // Pull encrypted AI keys from server (non-blocking)
        pullEncryptedKeys().catch(() => {});
      } catch (e) {
        console.warn('Encryption key setup failed:', e.message);
      }

      return data.user;
    } catch (err) {
      // Network error (API unreachable) — fall through to local mode
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        console.warn('API unreachable, trying local login:', err.message);
      } else {
        throw err; // Re-throw server validation errors (e.g. "Invalid credentials")
      }
    }
  }

  // Local mode
  const users = await getAll('users');
  const user = users.find((u) => u.email === email.toLowerCase());

  if (!user) {
    // If we fell through from a network error, the user's account likely exists
    // only on the server — give a clearer error than "invalid password"
    if (apiUrl) {
      throw new Error('Server is currently unreachable. Please check your connection and try again.');
    }
    throw new Error('Invalid email or password');
  }

  const passwordValid = await verifyLocalPassword(password, user.salt, user.passwordHash);
  if (!passwordValid) {
    throw new Error('Invalid email or password');
  }

  const token = generateToken();
  const session = { userId: user.id, token, createdAt: new Date().toISOString() };

  if (remember) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  const { passwordHash: _, salt: __, ...safeUser } = user;
  return safeUser;
}

export async function getCurrentUser() {
  const apiUrl = await getApiUrl();
  const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);

  if (apiUrl && token) {
    // Server mode — validate token with backend
    try {
      const res = await fetch(`${apiUrl}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) { logout(); return null; }
      if (res.ok) {
        const data = await res.json();
        return data.user;
      }
      // Server error (500 etc.) — fall through to local
    } catch (err) {
      // Network error — fall through to local session restore
      console.error('Server session restore failed, using local:', err);
    }
  }

  // Local mode
  const sessionStr =
    localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);

  if (!sessionStr) return null;

  try {
    const session = JSON.parse(sessionStr);
    const user = await getById('users', session.userId);
    if (!user) {
      logout();
      return null;
    }
    const { passwordHash: _, salt: __, ...safeUser } = user;
    return safeUser;
  } catch (err) {
    console.error('Session restore failed:', err);
    logout();
    return null;
  }
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  clearEncryptionKey();
}

export async function updateProfile(userId, changes) {
  const apiUrl = await getApiUrl();
  const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);

  if (apiUrl && token) {
    const res = await fetch(`${apiUrl}/api/auth/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(changes),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Profile update failed');
    }
    // Re-fetch full user from server
    const meRes = await fetch(`${apiUrl}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (meRes.ok) {
      const data = await meRes.json();
      return data.user;
    }
    return { id: userId, ...changes };
  }

  // Local mode
  const { update } = await import('./storage');
  const updated = await update('users', userId, changes);
  const { passwordHash: _, salt: __, ...safeUser } = updated;
  return safeUser;
}

export async function changePassword(userId, currentPassword, newPassword) {
  const apiUrl = await getApiUrl();
  const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);

  if (apiUrl && token) {
    const res = await fetch(`${apiUrl}/api/auth/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Password change failed');
    }
    // Server returns a new token after password change (old token is invalidated)
    const result = await res.json().catch(() => ({}));
    if (result.token) {
      const storage = localStorage.getItem(TOKEN_KEY) ? localStorage : sessionStorage;
      storage.setItem(TOKEN_KEY, result.token);
    }
    return;
  }

  // Local mode
  const user = await getById('users', userId);
  if (!user) throw new Error('User not found');

  const passwordValid = await verifyLocalPassword(currentPassword, user.salt, user.passwordHash);
  if (!passwordValid) {
    throw new Error('Current password is incorrect');
  }

  const newSalt = generateSalt();
  const newHash = await hashPassword(newPassword, newSalt);

  const { update } = await import('./storage');
  await update('users', userId, { passwordHash: newHash, salt: newSalt });
}

export async function deleteAccount() {
  const apiUrl = await getApiUrl();
  const token = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);

  if (apiUrl && token) {
    const res = await fetch(`${apiUrl}/api/auth/account`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Account deletion failed');
    }
  }
  logout();
}
