// Web Notification API wrapper for LUMET

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  const result = await Notification.requestPermission();
  // Store in IndexedDB settings
  const { setSetting } = await import('./storage.js');
  await setSetting('notificationPermission', result);
  return result;
}

export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'granted', 'denied', 'default'
}

export function sendNotification(title, body, options = {}) {
  if (Notification.permission !== 'granted') return null;
  try {
    const notification = new Notification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: options.tag || 'lumet',
      renotify: !!options.tag,
      ...options
    });
    notification.onclick = () => {
      window.focus();
      if (options.url) window.location.href = options.url;
      notification.close();
    };
    return notification;
  } catch (err) {
    console.warn('Failed to send notification:', err);
    return null;
  }
}

// Check budget alerts and send OS notifications (deduped per day)
export async function checkAndNotifyBudgetAlerts(transactions, userId) {
  const { getSetting, setSetting } = await import('./storage.js');
  const enabled = await getSetting('notificationsEnabled');
  if (!enabled || Notification.permission !== 'granted') return;

  const today = new Date().toISOString().split('T')[0];
  const lastNotified = await getSetting('lastBudgetNotifyDate');
  if (lastNotified === today) return; // Already notified today

  // Import and run budget alert check
  const { checkBudgetAlerts } = await import('./smartFeatures.js');
  const alerts = await checkBudgetAlerts(transactions, userId);

  if (alerts.length > 0) {
    const alert = alerts[0]; // Send the most critical one
    sendNotification(
      alert.type === 'over' ? 'Budget Exceeded' : 'Budget Warning',
      alert.message,
      { tag: `budget-${alert.category}`, url: '/budgets' }
    );
    await setSetting('lastBudgetNotifyDate', today);
  }
}

// Check recurring bills due today (uses billingDay field, not nextDueDate which doesn't exist)
export async function checkAndNotifyRecurringDue(recurringItems) {
  const { getSetting } = await import('./storage.js');
  const enabled = await getSetting('notificationsEnabled');
  if (!enabled || Notification.permission !== 'granted') return;

  const today = new Date().toISOString().split('T')[0];
  const lastNotified = await getSetting('lastRecurringNotifyDate');
  if (lastNotified === today) return; // Already notified today

  const now = new Date();
  const currentDay = now.getDate();
  const currentMonthNum = now.getMonth(); // 0-indexed

  const dueToday = recurringItems.filter(r => {
    if (r.status === 'cancelled' || r.status === 'paused') return false;
    if (r.active === false) return false;
    const billingDay = r.billingDay || 1;
    if (billingDay !== currentDay) return false;

    // For annual/semiannual/biannual: check if current month matches billingMonth
    if (['annual', 'semiannual', 'biannual'].includes(r.frequency)) {
      const billingMonth = (r.billingMonth || 1) - 1; // convert to 0-indexed
      if (r.frequency === 'annual' && currentMonthNum !== billingMonth) return false;
      if (r.frequency === 'semiannual' && currentMonthNum !== billingMonth && currentMonthNum !== (billingMonth + 6) % 12) return false;
      if (r.frequency === 'biannual') {
        if (currentMonthNum !== billingMonth) return false;
        const startYear = r.createdAt ? new Date(r.createdAt).getFullYear() : now.getFullYear();
        if ((now.getFullYear() - startYear) % 2 !== 0) return false;
      }
    }

    return true;
  });

  if (dueToday.length > 0) {
    const names = dueToday.map(r => r.name).join(', ');
    sendNotification(
      'Bills Due Today',
      `${dueToday.length} bill(s) due: ${names}`,
      { tag: 'recurring-due', url: '/recurring' }
    );
    const { setSetting } = await import('./storage.js');
    await setSetting('lastRecurringNotifyDate', today);
  }
}
