import { getSetting } from './storage';

function getAuthToken() {
  return sessionStorage.getItem('bp_token') || localStorage.getItem('bp_token');
}

async function adminFetch(path, options = {}) {
  const apiUrl = (await getSetting('apiUrl')) || import.meta.env.VITE_API_URL || '';
  if (!apiUrl) throw new Error('API URL not configured. Set it in Settings first.');

  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${apiUrl}${path}`, { ...options, headers });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error ${res.status}`);
  }

  const data = await res.json();
  return data.data !== undefined ? data.data : data;
}

export const adminApi = {
  getUsers: () => adminFetch('/api/admin/users'),
  resetPassword: (userId, newPassword) => adminFetch(`/api/admin/users/${userId}/reset-password`, {
    method: 'PUT', body: JSON.stringify({ newPassword }),
  }),
  toggleUser: (userId) => adminFetch(`/api/admin/users/${userId}/toggle`, { method: 'PUT' }),
  toggleAiAccess: (userId, allowed) => adminFetch(`/api/admin/users/${userId}/ai-access`, {
    method: 'PUT', body: JSON.stringify({ allowed }),
  }),
  deleteUser: (userId) => adminFetch(`/api/admin/users/${userId}`, { method: 'DELETE' }),
  getStats: () => adminFetch('/api/admin/stats'),
  getActivity: (filters = {}) => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    return adminFetch(`/api/admin/activity${params ? '?' + params : ''}`);
  },
  getErrors: (limit = 50) => adminFetch(`/api/admin/errors?limit=${limit}`),
  getPerformance: () => adminFetch('/api/admin/performance'),
  getAiCosts: () => adminFetch('/api/admin/ai-costs'),
  cleanupLogs: () => adminFetch('/api/admin/cleanup', { method: 'POST' }),
  // Feedback
  getFeedback: async (filters = {}) => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    const apiUrl = (await getSetting('apiUrl')) || import.meta.env.VITE_API_URL || '';
    const token = getAuthToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${apiUrl}/api/admin/feedback${params ? '?' + params : ''}`, { headers });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'API error'); }
    return res.json(); // Return full { data, counts } without stripping
  },
  updateFeedback: (id, data) => adminFetch(`/api/admin/feedback/${id}`, {
    method: 'PUT', body: JSON.stringify(data),
  }),
  deleteFeedback: (id) => adminFetch(`/api/admin/feedback/${id}`, { method: 'DELETE' }),
};
