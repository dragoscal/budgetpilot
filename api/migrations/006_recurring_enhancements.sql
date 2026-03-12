ALTER TABLE recurring ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE recurring ADD COLUMN pausedAt TEXT;
ALTER TABLE recurring ADD COLUMN cancelledAt TEXT;
ALTER TABLE transactions ADD COLUMN recurringId TEXT;
CREATE INDEX IF NOT EXISTS idx_transactions_recurringId ON transactions(recurringId);
