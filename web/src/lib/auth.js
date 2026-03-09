import { getAll, add, getById } from './storage';
import { generateId } from './helpers';

const SESSION_KEY = 'budgetpilot_session';

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
  // Check if email already exists
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

  // Create session
  const token = generateToken();
  const session = { userId: id, token, createdAt: new Date().toISOString() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));

  const { passwordHash: _, salt: __, ...safeUser } = user;
  return safeUser;
}

export async function login({ email, password, remember = false }) {
  const users = await getAll('users');
  const user = users.find((u) => u.email === email.toLowerCase());

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) {
    throw new Error('Invalid email or password');
  }

  // Create session
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
}

export async function updateProfile(userId, changes) {
  const { update } = await import('./storage');
  const updated = await update('users', userId, changes);
  const { passwordHash: _, salt: __, ...safeUser } = updated;
  return safeUser;
}

export async function changePassword(userId, currentPassword, newPassword) {
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
