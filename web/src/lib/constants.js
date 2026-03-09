export const CATEGORIES = [
  { id: 'groceries', name: 'Groceries', icon: '🛒', color: '#059669' },
  { id: 'dining', name: 'Dining', icon: '🍽', color: '#d97706' },
  { id: 'transport', name: 'Transport', icon: '🚗', color: '#6366f1' },
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
  { id: 'savings', name: 'Savings', icon: '🏦', color: '#059669' },
  { id: 'income', name: 'Income', icon: '💰', color: '#059669' },
  { id: 'transfer', name: 'Transfer', icon: '🔄', color: '#6366f1' },
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

export const AI_PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    keyName: 'anthropicApiKey',
    models: [
      { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5 (fastest, cheapest)' },
      { id: 'claude-sonnet-4-20250514', name: 'Sonnet 4 (balanced)' },
      { id: 'claude-opus-4-20250514', name: 'Opus 4 (best quality)' },
    ],
    defaultModel: 'claude-sonnet-4-20250514',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    keyName: 'openaiApiKey',
    models: [
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (cheapest)' },
      { id: 'gpt-4o', name: 'GPT-4o (balanced)' },
      { id: 'gpt-4.1', name: 'GPT-4.1 (latest)' },
    ],
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    keyName: 'openrouterApiKey',
    models: [
      { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
      { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'openai/gpt-4o', name: 'GPT-4o' },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick' },
      { id: 'deepseek/deepseek-chat-v3', name: 'DeepSeek V3' },
      { id: 'mistralai/mistral-medium', name: 'Mistral Medium' },
    ],
    defaultModel: 'anthropic/claude-sonnet-4',
  },
];

export const HIDE_AMOUNTS_OPTIONS = [
  { id: 'none', label: 'Show all amounts' },
  { id: 'all', label: 'Hide all amounts' },
  { id: 'income', label: 'Hide income only' },
];

export const DEFAULT_SETTINGS = {
  defaultCurrency: 'RON',
  defaultCategory: 'other',
  firstDayOfWeek: 1, // Monday
  darkMode: false,
  apiUrl: '',
  apiKey: '',
  anthropicApiKey: '',
  openaiApiKey: '',
  openrouterApiKey: '',
  aiProvider: 'anthropic',
  aiModel: 'claude-sonnet-4-20250514',
  hideAmounts: 'none',
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
