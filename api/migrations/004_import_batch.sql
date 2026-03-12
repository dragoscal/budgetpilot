ALTER TABLE transactions ADD COLUMN importBatch TEXT;
CREATE INDEX IF NOT EXISTS idx_transactions_importBatch ON transactions(importBatch);
