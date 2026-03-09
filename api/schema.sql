-- BudgetPilot D1 Database Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  passwordHash TEXT NOT NULL,
  salt TEXT NOT NULL,
  defaultCurrency TEXT DEFAULT 'RON',
  onboardingComplete INTEGER DEFAULT 0,
  role TEXT DEFAULT 'user',
  suspended INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  merchant TEXT,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'RON',
  category TEXT DEFAULT 'other',
  subcategory TEXT,
  date TEXT NOT NULL,
  description TEXT,
  tags TEXT DEFAULT '[]',
  source TEXT DEFAULT 'manual',
  items TEXT DEFAULT '[]',
  splitFrom TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  deletedAt TEXT,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'RON',
  month TEXT,
  rollover INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'save_up',
  targetAmount REAL NOT NULL,
  currentAmount REAL DEFAULT 0,
  currency TEXT DEFAULT 'RON',
  targetDate TEXT,
  interestRate REAL DEFAULT 0,
  color TEXT DEFAULT '#3a7d5c',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  balance REAL DEFAULT 0,
  currency TEXT DEFAULT 'RON',
  color TEXT DEFAULT '#3a7d5c',
  isLiability INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS recurring (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT NOT NULL,
  merchant TEXT,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'RON',
  category TEXT DEFAULT 'subscriptions',
  frequency TEXT DEFAULT 'monthly',
  billingDay INTEGER DEFAULT 1,
  endDate TEXT,
  active INTEGER DEFAULT 1,
  autoDetected INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '👤',
  phone TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  personId TEXT NOT NULL,
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  remaining REAL NOT NULL,
  currency TEXT DEFAULT 'RON',
  description TEXT,
  date TEXT NOT NULL,
  settled INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id),
  FOREIGN KEY (personId) REFERENCES people(id)
);

CREATE TABLE IF NOT EXISTS debt_payments (
  id TEXT PRIMARY KEY,
  userId TEXT,
  debtId TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  note TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT,
  FOREIGN KEY (debtId) REFERENCES debts(id),
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS wishlist (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT NOT NULL,
  estimatedPrice REAL DEFAULT 0,
  currency TEXT DEFAULT 'RON',
  category TEXT DEFAULT 'other',
  priority INTEGER DEFAULT 3,
  url TEXT,
  notes TEXT,
  purchased INTEGER DEFAULT 0,
  purchasedDate TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS settings (
  userId TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY (userId, key),
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  tableName TEXT NOT NULL,
  recordId TEXT NOT NULL,
  action TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

-- API request logs (for admin monitoring)
CREATE TABLE IF NOT EXISTS api_logs (
  id TEXT PRIMARY KEY,
  userId TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  responseTime INTEGER NOT NULL,
  error TEXT,
  userAgent TEXT,
  timestamp TEXT NOT NULL
);

-- User activity log (for feature usage tracking)
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  action TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  timestamp TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_userId ON transactions(userId);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_budgets_userId ON budgets(userId);
CREATE INDEX IF NOT EXISTS idx_goals_userId ON goals(userId);
CREATE INDEX IF NOT EXISTS idx_accounts_userId ON accounts(userId);
CREATE INDEX IF NOT EXISTS idx_recurring_userId ON recurring(userId);
CREATE INDEX IF NOT EXISTS idx_people_userId ON people(userId);
CREATE INDEX IF NOT EXISTS idx_debts_userId ON debts(userId);
CREATE INDEX IF NOT EXISTS idx_wishlist_userId ON wishlist(userId);
CREATE INDEX IF NOT EXISTS idx_api_logs_userId ON api_logs(userId);
CREATE INDEX IF NOT EXISTS idx_api_logs_timestamp ON api_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_api_logs_status ON api_logs(status);
CREATE INDEX IF NOT EXISTS idx_activity_log_userId ON activity_log(userId);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_transactions_subcategory ON transactions(subcategory);
CREATE INDEX IF NOT EXISTS idx_recurring_frequency ON recurring(frequency);
CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);
