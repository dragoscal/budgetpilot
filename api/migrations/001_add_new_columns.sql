-- Migration 001: Add columns for subcategories, recurring frequencies, and budget months
-- Safe to re-run (ALTER TABLE ADD COLUMN IF NOT EXISTS is not supported in SQLite,
-- so we use a try-and-ignore approach via the migration runner)

-- Transactions: add subcategory support
ALTER TABLE transactions ADD COLUMN subcategory TEXT;

-- Recurring: add frequency and end date support
ALTER TABLE recurring ADD COLUMN frequency TEXT DEFAULT 'monthly';
ALTER TABLE recurring ADD COLUMN endDate TEXT;

-- Budgets: add month scope
ALTER TABLE budgets ADD COLUMN month TEXT;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_transactions_subcategory ON transactions(subcategory);
CREATE INDEX IF NOT EXISTS idx_recurring_frequency ON recurring(frequency);
CREATE INDEX IF NOT EXISTS idx_budgets_month ON budgets(month);
