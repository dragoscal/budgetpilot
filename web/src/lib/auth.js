import { getAll, add, getById, getSetting } from './storage';
import { generateId } from './helpers';
import { deriveEncryptionKey, storeEncryptionKey, clearEncryptionKey, pullEncryptedKeys } from './crypto';

const SESSION_KEY = 'budgetpilot_session';
const TOKEN_KEY = 'bp_token';

async function getApiUrl() {
  return (await getSetting('apiUrl')) || import.meta.env.VITE_API_URL || '';
}

// Hash password using Web Crypto API (SHA-256 with salt)
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
    // Server mode
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
    // Server mode
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
  }

  // Local mode
  const users = await getAll('users');
  const user = users.find((u) => u.email === email.toLowerCase());

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
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
    } catch {
      // Network error — fall through to local
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
  } catch {
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
    return;
  }

  // Local mode
  const user = await getById('users', userId);
  if (!user) throw new Error('User not found');

  const currentHash = await hashPassword(currentPassword, user.salt);
  if (currentHash !== user.passwordHash) {
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
