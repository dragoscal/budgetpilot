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

export const SUBCATEGORIES = {
  groceries: [
    { id: 'groceries:produce', name: 'Produce', icon: '🥬' },
    { id: 'groceries:dairy', name: 'Dairy', icon: '🥛' },
    { id: 'groceries:meat', name: 'Meat & Fish', icon: '🥩' },
    { id: 'groceries:bakery', name: 'Bakery', icon: '🍞' },
    { id: 'groceries:snacks', name: 'Snacks & Sweets', icon: '🍫' },
    { id: 'groceries:beverages', name: 'Beverages', icon: '🥤' },
    { id: 'groceries:frozen', name: 'Frozen', icon: '🧊' },
    { id: 'groceries:pantry', name: 'Pantry Staples', icon: '🫙' },
  ],
  dining: [
    { id: 'dining:restaurant', name: 'Restaurant', icon: '🍽' },
    { id: 'dining:fast_food', name: 'Fast Food', icon: '🍔' },
    { id: 'dining:cafe', name: 'Cafe & Coffee', icon: '☕' },
    { id: 'dining:delivery', name: 'Delivery', icon: '🛵' },
    { id: 'dining:bar', name: 'Bar & Drinks', icon: '🍺' },
  ],
  transport: [
    { id: 'transport:fuel', name: 'Fuel', icon: '⛽' },
    { id: 'transport:rideshare', name: 'Rideshare', icon: '🚕' },
    { id: 'transport:public', name: 'Public Transit', icon: '🚌' },
    { id: 'transport:parking', name: 'Parking', icon: '🅿️' },
    { id: 'transport:maintenance', name: 'Car Maintenance', icon: '🔧' },
  ],
  shopping: [
    { id: 'shopping:clothing', name: 'Clothing', icon: '👕' },
    { id: 'shopping:electronics', name: 'Electronics', icon: '📱' },
    { id: 'shopping:home', name: 'Home & Decor', icon: '🏡' },
    { id: 'shopping:online', name: 'Online Shopping', icon: '📦' },
  ],
  health: [
    { id: 'health:pharmacy', name: 'Pharmacy', icon: '💊' },
    { id: 'health:doctor', name: 'Doctor Visit', icon: '🩺' },
    { id: 'health:dental', name: 'Dental', icon: '🦷' },
    { id: 'health:gym', name: 'Gym & Fitness', icon: '💪' },
  ],
  subscriptions: [
    { id: 'subscriptions:streaming', name: 'Streaming', icon: '📺' },
    { id: 'subscriptions:music', name: 'Music', icon: '🎵' },
    { id: 'subscriptions:software', name: 'Software', icon: '💻' },
    { id: 'subscriptions:gaming', name: 'Gaming', icon: '🎮' },
    { id: 'subscriptions:news', name: 'News & Media', icon: '📰' },
  ],
  utilities: [
    { id: 'utilities:electricity', name: 'Electricity', icon: '⚡' },
    { id: 'utilities:water', name: 'Water', icon: '💧' },
    { id: 'utilities:gas', name: 'Gas', icon: '🔥' },
    { id: 'utilities:internet', name: 'Internet', icon: '🌐' },
    { id: 'utilities:phone', name: 'Phone', icon: '📱' },
  ],
  entertainment: [
    { id: 'entertainment:movies', name: 'Movies', icon: '🎬' },
    { id: 'entertainment:games', name: 'Games', icon: '🎮' },
    { id: 'entertainment:concerts', name: 'Concerts & Events', icon: '🎵' },
    { id: 'entertainment:sports', name: 'Sports', icon: '⚽' },
  ],
  housing: [
    { id: 'housing:rent', name: 'Rent', icon: '🏠' },
    { id: 'housing:repairs', name: 'Repairs', icon: '🔨' },
    { id: 'housing:cleaning', name: 'Cleaning', icon: '🧹' },
    { id: 'housing:furniture', name: 'Furniture', icon: '🛋' },
  ],
  personal: [
    { id: 'personal:haircare', name: 'Hair & Beauty', icon: '💇' },
    { id: 'personal:skincare', name: 'Skincare', icon: '🧴' },
    { id: 'personal:items', name: 'Personal Items', icon: '👤' },
  ],
  education: [
    { id: 'education:courses', name: 'Courses', icon: '🎓' },
    { id: 'education:books', name: 'Books', icon: '📖' },
    { id: 'education:supplies', name: 'Supplies', icon: '✏️' },
  ],
  travel: [
    { id: 'travel:flights', name: 'Flights', icon: '✈️' },
    { id: 'travel:hotels', name: 'Hotels', icon: '🏨' },
    { id: 'travel:activities', name: 'Activities', icon: '🗺' },
  ],
};

export const RECURRING_FREQUENCIES = [
  { id: 'daily', label: 'Daily', multiplierToMonthly: 30.44 },
  { id: 'weekly', label: 'Weekly', multiplierToMonthly: 4.33 },
  { id: 'biweekly', label: 'Every 2 weeks', multiplierToMonthly: 2.17 },
  { id: 'monthly', label: 'Monthly', multiplierToMonthly: 1 },
  { id: 'bimonthly', label: 'Every 2 months', multiplierToMonthly: 0.5 },
  { id: 'quarterly', label: 'Quarterly (3 months)', multiplierToMonthly: 1 / 3 },
  { id: 'semiannual', label: 'Every 6 months', multiplierToMonthly: 1 / 6 },
  { id: 'annual', label: 'Annually', multiplierToMonthly: 1 / 12 },
  { id: 'biannual', label: 'Every 2 years', multiplierToMonthly: 1 / 24 },
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

export const LOAN_TYPES = [
  { id: 'mortgage', name: 'Mortgage', icon: '🏠', description: 'Home loan' },
  { id: 'auto', name: 'Auto Loan', icon: '🚗', description: 'Vehicle financing' },
  { id: 'personal', name: 'Personal Loan', icon: '💰', description: 'Personal / consumer loan' },
  { id: 'student', name: 'Student Loan', icon: '🎓', description: 'Education loan' },
  { id: 'credit_card', name: 'Credit Card', icon: '💳', description: 'Credit card balance' },
  { id: 'business', name: 'Business Loan', icon: '🏢', description: 'Business financing' },
  { id: 'medical', name: 'Medical Loan', icon: '🏥', description: 'Medical / healthcare' },
  { id: 'other', name: 'Other Loan', icon: '📋', description: 'Other type of loan' },
];

export const LOAN_STATUSES = [
  { id: 'active', name: 'Active', color: 'text-info', bg: 'bg-info/10' },
  { id: 'paid_off', name: 'Paid Off', color: 'text-success', bg: 'bg-success/10' },
  { id: 'defaulted', name: 'Defaulted', color: 'text-danger', bg: 'bg-danger/10' },
  { id: 'refinanced', name: 'Refinanced', color: 'text-warning', bg: 'bg-warning/10' },
];

export const MERCHANT_CATEGORY_MAP = {
  // Food delivery (longer keys MUST come before shorter to match first)
  'bolt food': 'dining', 'uber eats': 'dining',
  glovo: 'dining', tazz: 'dining', wolt: 'dining', foodpanda: 'dining',
  // Groceries
  lidl: 'groceries', kaufland: 'groceries', carrefour: 'groceries',
  'mega image': 'groceries', megaimage: 'groceries', auchan: 'groceries',
  profi: 'groceries', penny: 'groceries', cora: 'groceries', selgros: 'groceries',
  // Transport (rideshare + fuel)
  bolt: 'transport', uber: 'transport', taxi: 'transport', 'free now': 'transport',
  omv: 'transport', petrom: 'transport', rompetrol: 'transport', mol: 'transport', lukoil: 'transport',
  // Shopping
  emag: 'shopping', altex: 'shopping', dedeman: 'shopping', flanco: 'shopping',
  ikea: 'shopping', jysk: 'shopping', decathlon: 'shopping', pepco: 'shopping',
  zara: 'shopping', 'h&m': 'shopping', reserved: 'shopping',
  amazon: 'shopping', temu: 'shopping', aliexpress: 'shopping',
  // Subscriptions
  netflix: 'subscriptions', spotify: 'subscriptions', youtube: 'subscriptions',
  hbo: 'subscriptions', disney: 'subscriptions',
  'microsoft 365': 'subscriptions', 'microsoft*microsoft': 'subscriptions',
  'google one': 'subscriptions', 'apple.com': 'subscriptions',
  'focus sat': 'subscriptions', focussat: 'subscriptions',
  // Entertainment/gaming
  steam: 'entertainment', blizzard: 'entertainment', xbox: 'entertainment',
  playstation: 'entertainment', nintendo: 'entertainment', epic: 'entertainment',
  // Utilities
  enel: 'utilities', engie: 'utilities', digi: 'utilities', vodafone: 'utilities',
  'e.on': 'utilities', orange: 'utilities', rcs: 'utilities', telekom: 'utilities',
  // Health
  farmacia: 'health', catena: 'health', sensiblu: 'health',
  dona: 'health', helpnet: 'health', 'ana pharm': 'health',
  // Dining
  mcdonalds: 'dining', kfc: 'dining', 'burger king': 'dining',
  subway: 'dining', starbucks: 'dining', restaurant: 'dining',
  pizz: 'dining', mattina: 'dining', cuptorul: 'dining',
  // Pets
  'maxi pet': 'pets', 'pet shop': 'pets', liprac: 'pets',
  // Apple (general — subscriptions)
  apple: 'subscriptions',
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
  apiUrl: 'https://budgetpilot-api.budgetpilot.workers.dev',
  apiKey: '',
  anthropicApiKey: '',
  openaiApiKey: '',
  openrouterApiKey: '',
  aiProvider: 'anthropic',
  aiModel: 'claude-sonnet-4-20250514',
  hideAmounts: 'none',
  language: 'ro',
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
