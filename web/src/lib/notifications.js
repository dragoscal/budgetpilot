// Web Notification API wrapper for BudgetPilot

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
      tag: options.tag || 'budgetpilot',
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
export async function checkAndNotifyBudgetAlerts(transactions) {
  const { getSetting, setSetting } = await import('./storage.js');
  const enabled = await getSetting('notificationsEnabled');
  if (!enabled || Notification.permission !== 'granted') return;

  const today = new Date().toISOString().split('T')[0];
  const lastNotified = await getSetting('lastBudgetNotifyDate');
  if (lastNotified === today) return; // Already notified today

  // Import and run budget alert check
  const { checkBudgetAlerts } = await import('./smartFeatures.js');
  const alerts = await checkBudgetAlerts(transactions);

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

// Check recurring bills due today
export async function checkAndNotifyRecurringDue(recurringItems) {
  const { getSetting } = await import('./storage.js');
  const enabled = await getSetting('notificationsEnabled');
  if (!enabled || Notification.permission !== 'granted') return;

  const today = new Date();
  const dueToday = recurringItems.filter(r => {
    // Check if due today based on frequency and nextDueDate
    if (!r.nextDueDate) return false;
    return r.nextDueDate.startsWith(today.toISOString().split('T')[0]);
  });

  if (dueToday.length > 0) {
    const names = dueToday.map(r => r.name).join(', ');
    sendNotification(
      'Bills Due Today',
      `${dueToday.length} bill(s) due: ${names}`,
      { tag: 'recurring-due', url: '/recurring' }
    );
  }
}
