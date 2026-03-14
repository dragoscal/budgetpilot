// IndexedDB-backed notification storage with dedup + event-based updates
import { getDB } from './storage.js';

export async function addNotification({ type, title, message, actionUrl }) {
  const db = await getDB();

  // Dedup: check for same type+title created today
  const today = new Date().toISOString().slice(0, 10);
  const all = await db.getAll('notifications');
  const existing = all.find(n => n.type === type && n.title === title && n.createdAt?.startsWith(today));
  if (existing) return existing; // Already exists today, skip

  const notification = {
    id: crypto.randomUUID(),
    type, // 'budget_warning', 'budget_exceeded', 'recurring_due', 'achievement', 'pace_alert', 'info'
    title,
    message,
    actionUrl: actionUrl || null,
    read: false,
    createdAt: new Date().toISOString()
  };
  await db.put('notifications', notification);

  // Dispatch custom event for real-time updates (no polling needed)
  window.dispatchEvent(new CustomEvent('notification-added', { detail: notification }));
  return notification;
}

export async function getNotifications(limit = 50) {
  const db = await getDB();
  const all = await db.getAll('notifications');
  return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, limit);
}

export async function getUnreadCount() {
  const db = await getDB();
  const all = await db.getAll('notifications');
  return all.filter(n => !n.read).length;
}

export async function markRead(id) {
  const db = await getDB();
  const n = await db.get('notifications', id);
  if (n) { n.read = true; await db.put('notifications', n); }
  window.dispatchEvent(new Event('notifications-changed'));
}

export async function markAllRead() {
  const db = await getDB();
  const all = await db.getAll('notifications');
  const tx = db.transaction('notifications', 'readwrite');
  for (const n of all) {
    if (!n.read) { n.read = true; tx.store.put(n); }
  }
  await tx.done;
  window.dispatchEvent(new Event('notifications-changed'));
}

export async function clearOldNotifications(daysOld = 30) {
  const db = await getDB();
  const cutoff = new Date(Date.now() - daysOld * 86400000).toISOString();
  const all = await db.getAll('notifications');
  const tx = db.transaction('notifications', 'readwrite');
  for (const n of all) {
    if (n.createdAt < cutoff) tx.store.delete(n.id);
  }
  await tx.done;
}

export async function getAllNotifications() {
  const db = await getDB();
  const all = await db.getAll('notifications');
  return all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export async function clearAllNotifications() {
  const db = await getDB();
  const tx = db.transaction('notifications', 'readwrite');
  await tx.store.clear();
  await tx.done;
  window.dispatchEvent(new Event('notifications-changed'));
}
