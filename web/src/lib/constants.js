export const CATEGORIES = [
  { id: 'groceries', name: 'Groceries', icon: '🛒', color: '#3a7d5c' },
  { id: 'dining', name: 'Dining', icon: '🍽', color: '#c9773c' },
  { id: 'transport', name: 'Transport', icon: '🚗', color: '#4a7fa5' },
  { id: 'shopping', name: 'Shopping', icon: '🛍', color: '#9b59b6' },
  { id: 'health', name: 'Health', icon: '💊', color: '#e74c3c' },
  { id: 'subscriptions', name: 'Subscriptions', icon: '📺', color: '#8e44ad' },
  { id: 'utilities', name: 'Utilities', icon: '💡', color: '#f39c12' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', color: '#e67e22' },
  { id: 'education', name: 'Education', icon: '📚', color: '#2980b9' },
  { id: 'travel', name: 'Travel', icon: '✈️', color: '#1abc9c' },
  { id: 'housing', name: 'Housing', icon: '🏠', color: '#34495e' },
  { id: 'personal', name: 'Personal', icon: '👤', color: '#7f8c8d' },
  { id: 'gifts', name: 'Gifts', icon: '🎁', color: '#e91e63' },
  { id: 'insurance', name: 'Insurance', icon: '🛡', color: '#607d8b' },
  { id: 'pets', name: 'Pets', icon: '🐾', color: '#795548' },
  { id: 'savings', name: 'Savings', icon: '🏦', color: '#2d8a4e' },
  { id: 'income', name: 'Income', icon: '💰', color: '#2d8a4e' },
  { id: 'transfer', name: 'Transfer', icon: '🔄', color: '#4a7fa5' },
  { id: 'other', name: 'Other', icon: '📦', color: '#95a5a6' },
];

export const CURRENCIES = [
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu', position: 'suffix', locale: 'ro-RO' },
  { code: 'EUR', symbol: '€', name: 'Euro', position: 'prefix', locale: 'de-DE' },
  { code: 'USD', symbol: '$', name: 'US Dollar', position: 'prefix', locale: 'en-US' },
  { code: 'GBP', symbol: '£', name: 'British Pound', position: 'prefix', locale: 'en-GB' },
];

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer'];

export const TRANSACTION_SOURCES = {
  manual: { label: 'Manual', icon: '✏️' },
  nlp: { label: 'Quick Add', icon: '💬' },
  receipt: { label: 'Receipt', icon: '🧾' },
  telegram: { label: 'Telegram', icon: '📱' },
  import: { label: 'Import', icon: '📥' },
};

export const ACCOUNT_TYPES = [
  { id: 'checking', name: 'Checking', icon: '🏦' },
  { id: 'savings', name: 'Savings', icon: '💰' },
  { id: 'cash', name: 'Cash', icon: '💵' },
  { id: 'credit_card', name: 'Credit Card', icon: '💳' },
  { id: 'loan', name: 'Loan', icon: '📋' },
  { id: 'investment', name: 'Investment', icon: '📈' },
  { id: 'crypto', name: 'Crypto', icon: '₿' },
  { id: 'property', name: 'Property', icon: '🏡' },
];

export const GOAL_TYPES = {
  save_up: { label: 'Save Up', icon: '🎯' },
  pay_down: { label: 'Pay Down', icon: '💳' },
};

export const MERCHANT_CATEGORY_MAP = {
  lidl: 'groceries', kaufland: 'groceries', carrefour: 'groceries',
  'mega image': 'groceries', auchan: 'groceries', profi: 'groceries',
  penny: 'groceries', cora: 'groceries', selgros: 'groceries',
  bolt: 'transport', uber: 'transport', taxi: 'transport',
  emag: 'shopping', altex: 'shopping', dedeman: 'shopping',
  netflix: 'subscriptions', spotify: 'subscriptions', youtube: 'subscriptions',
  hbo: 'subscriptions', disney: 'subscriptions', apple: 'subscriptions',
  enel: 'utilities', digi: 'utilities', vodafone: 'utilities',
  'e.on': 'utilities', orange: 'utilities', rcs: 'utilities',
  farmacia: 'health', catena: 'health', sensiblu: 'health',
  dona: 'health', helpnet: 'health',
  mcdonalds: 'dining', kfc: 'dining', 'burger king': 'dining',
  subway: 'dining', starbucks: 'dining', restaurant: 'dining',
};

export const DEFAULT_SETTINGS = {
  defaultCurrency: 'RON',
  defaultCategory: 'other',
  firstDayOfWeek: 1, // Monday
  darkMode: false,
  apiUrl: '',
  apiKey: '',
  anthropicApiKey: '',
  userName: '',
  budgetAlerts: { 50: false, 80: true, 100: true },
  weeklyDigest: false,
  locale: 'ro-RO',
};

export const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'amount-desc', label: 'Highest amount' },
  { value: 'amount-asc', label: 'Lowest amount' },
  { value: 'merchant-asc', label: 'Merchant A-Z' },
];
