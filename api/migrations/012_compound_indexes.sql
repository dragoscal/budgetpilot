-- Compound indexes for common query patterns at scale
-- These cover the most frequent WHERE clauses across CRUD and sync operations

CREATE INDEX IF NOT EXISTS idx_transactions_userId_date ON transactions(userId, date);
CREATE INDEX IF NOT EXISTS idx_transactions_userId_category ON transactions(userId, category);
CREATE INDEX IF NOT EXISTS idx_transactions_userId_deletedAt ON transactions(userId, deletedAt);
CREATE INDEX IF NOT EXISTS idx_budgets_userId_month ON budgets(userId, month);
CREATE INDEX IF NOT EXISTS idx_family_members_familyId_userId ON family_members(familyId, userId);
CREATE INDEX IF NOT EXISTS idx_shared_expenses_familyId ON shared_expenses(familyId);
CREATE INDEX IF NOT EXISTS idx_settings_userId_key ON settings(userId, key);
CREATE INDEX IF NOT EXISTS idx_recurring_userId_status ON recurring(userId, status);
CREATE INDEX IF NOT EXISTS idx_debts_userId_personId ON debts(userId, personId);
CREATE INDEX IF NOT EXISTS idx_sync_log_userId_timestamp ON sync_log(userId, timestamp);
