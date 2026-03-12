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
  originalText TEXT,
  scope TEXT DEFAULT 'personal',
  paidBy TEXT,
  splitType TEXT,
  beneficiaries TEXT,
  source TEXT DEFAULT 'manual',
  recurringId TEXT,
  items TEXT DEFAULT '[]',
  splitFrom TEXT,
  importBatch TEXT,
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
  familyId TEXT,
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
  billingMonth INTEGER DEFAULT 1,
  endDate TEXT,
  active INTEGER DEFAULT 1,
  autoDetected INTEGER DEFAULT 0,
  autoDebit INTEGER DEFAULT 0,
  isVariable INTEGER DEFAULT 0,
  recurringType TEXT DEFAULT 'bill',
  status TEXT DEFAULT 'active',
  pausedAt TEXT,
  cancelledAt TEXT,
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
  reason TEXT,
  date TEXT NOT NULL,
  dueDate TEXT,
  settled INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  settledDate TEXT,
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
  ip TEXT,
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

-- User feedback (bug reports & suggestions)
CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bug',  -- 'bug', 'suggestion', 'other'
  title TEXT NOT NULL,
  description TEXT,
  screenshot TEXT,  -- base64 or URL
  status TEXT DEFAULT 'open',  -- 'open', 'in_progress', 'resolved', 'closed'
  adminNote TEXT,
  page TEXT,  -- which page the user was on
  userAgent TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

-- Bank loans
CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'personal',
  lender TEXT,
  principalAmount REAL NOT NULL,
  remainingBalance REAL NOT NULL,
  interestRate REAL DEFAULT 0,
  interestType TEXT DEFAULT 'fixed',
  interestPeriod TEXT DEFAULT 'annual',
  monthlyPayment REAL DEFAULT 0,
  currency TEXT DEFAULT 'RON',
  startDate TEXT NOT NULL,
  endDate TEXT,
  paymentDay INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  notes TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS loan_payments (
  id TEXT PRIMARY KEY,
  userId TEXT,
  loanId TEXT NOT NULL,
  amount REAL NOT NULL,
  principalPortion REAL DEFAULT 0,
  interestPortion REAL DEFAULT 0,
  date TEXT NOT NULL,
  note TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT,
  FOREIGN KEY (loanId) REFERENCES loans(id),
  FOREIGN KEY (userId) REFERENCES users(id)
);

-- Families
CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  emoji TEXT DEFAULT '👨‍👩‍👧‍👦',
  inviteCode TEXT,
  defaultCurrency TEXT DEFAULT 'RON',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (createdBy) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY,
  familyId TEXT NOT NULL,
  userId TEXT NOT NULL,
  role TEXT DEFAULT 'member',
  isVirtual INTEGER DEFAULT 0,
  displayName TEXT,
  emoji TEXT DEFAULT '👤',
  monthlyIncome REAL,
  joinedAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (familyId) REFERENCES families(id),
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS shared_expenses (
  id TEXT PRIMARY KEY,
  familyId TEXT NOT NULL,
  paidByUserId TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'RON',
  description TEXT,
  category TEXT DEFAULT 'other',
  date TEXT NOT NULL,
  splitMethod TEXT DEFAULT 'equal',
  settled INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (familyId) REFERENCES families(id),
  FOREIGN KEY (paidByUserId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  name TEXT,
  title TEXT,
  type TEXT NOT NULL,
  targetAmount REAL,
  target REAL,
  category TEXT,
  startDate TEXT NOT NULL,
  endDate TEXT NOT NULL,
  durationDays INTEGER,
  status TEXT DEFAULT 'active',
  progress REAL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  merchant TEXT,
  total REAL,
  currency TEXT DEFAULT 'RON',
  category TEXT,
  transactionId TEXT,
  processedAt TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

-- Settlement History (for debt settlements)
CREATE TABLE IF NOT EXISTS settlement_history (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  settlements TEXT DEFAULT '[]',
  totalSettled REAL DEFAULT 0,
  currency TEXT DEFAULT 'RON',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_settlement_history_userId ON settlement_history(userId);
CREATE INDEX IF NOT EXISTS idx_budgets_familyId ON budgets(familyId);
CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
CREATE INDEX IF NOT EXISTS idx_loans_userId ON loans(userId);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_type ON loans(type);
CREATE INDEX IF NOT EXISTS idx_loan_payments_loanId ON loan_payments(loanId);
CREATE INDEX IF NOT EXISTS idx_loan_payments_date ON loan_payments(date);
CREATE INDEX IF NOT EXISTS idx_feedback_userId ON feedback(userId);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_createdAt ON feedback(createdAt);
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
CREATE INDEX IF NOT EXISTS idx_api_logs_ip ON api_logs(ip);
CREATE INDEX IF NOT EXISTS idx_activity_log_userId ON activity_log(userId);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_transactions_subcategory ON transactions(subcategory);
CREATE INDEX IF NOT EXISTS idx_recurring_frequency ON recurring(frequency);
CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);
CREATE INDEX IF NOT EXISTS idx_families_createdBy ON families(createdBy);
CREATE INDEX IF NOT EXISTS idx_family_members_familyId ON family_members(familyId);
CREATE INDEX IF NOT EXISTS idx_family_members_userId ON family_members(userId);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_familyId ON shared_expenses(familyId);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_paidByUserId ON shared_expenses(paidByUserId);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_date ON shared_expenses(date);
CREATE INDEX IF NOT EXISTS idx_challenges_userId ON challenges(userId);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_type ON challenges(type);
CREATE INDEX IF NOT EXISTS idx_receipts_userId ON receipts(userId);
CREATE INDEX IF NOT EXISTS idx_receipts_transactionId ON receipts(transactionId);
