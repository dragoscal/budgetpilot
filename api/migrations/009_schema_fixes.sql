-- Fix debts: add missing columns that frontend uses
ALTER TABLE debts ADD COLUMN status TEXT DEFAULT 'active';
ALTER TABLE debts ADD COLUMN settledDate TEXT;
ALTER TABLE debts ADD COLUMN dueDate TEXT;
ALTER TABLE debts ADD COLUMN reason TEXT;

-- Fix budgets: add familyId for family budget support
ALTER TABLE budgets ADD COLUMN familyId TEXT;

-- Fix challenges: add title and target columns (frontend uses these instead of name/targetAmount)
ALTER TABLE challenges ADD COLUMN title TEXT;
ALTER TABLE challenges ADD COLUMN target REAL;
ALTER TABLE challenges ADD COLUMN durationDays INTEGER;

-- Migrate existing challenges data: copy name→title, targetAmount→target
UPDATE challenges SET title = name WHERE title IS NULL AND name IS NOT NULL;
UPDATE challenges SET target = targetAmount WHERE target IS NULL AND targetAmount IS NOT NULL;

-- Migrate existing debts: set status based on settled flag
UPDATE debts SET status = 'settled' WHERE settled = 1 AND (status IS NULL OR status = 'active');
UPDATE debts SET status = 'active' WHERE settled = 0 AND (status IS NULL);

-- Add settlement_history table (frontend has CRUD but backend was missing)
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

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_budgets_familyId ON budgets(familyId);
CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
CREATE INDEX IF NOT EXISTS idx_settlement_history_userId ON settlement_history(userId);
