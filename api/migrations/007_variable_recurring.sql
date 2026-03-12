-- Add variable amount support and recurring type (bill vs subscription)
ALTER TABLE recurring ADD COLUMN isVariable INTEGER DEFAULT 0;
ALTER TABLE recurring ADD COLUMN recurringType TEXT DEFAULT 'bill';
