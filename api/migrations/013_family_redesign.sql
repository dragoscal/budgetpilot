-- 013_family_redesign.sql
-- Family Redesign: Shared Lens model

-- 1. Add visibility to transactions (NULL = not set, excluded from feed)
ALTER TABLE transactions ADD COLUMN visibility TEXT;

-- 2. Add familyId to goals (for shared family goals)
ALTER TABLE goals ADD COLUMN familyId TEXT;

-- 3. Backfill NULL invite codes so UNIQUE index doesn't collide on NULLs
UPDATE families SET inviteCode = hex(randomblob(4)) WHERE inviteCode IS NULL;

-- 4. Unique constraint on invite codes
CREATE UNIQUE INDEX IF NOT EXISTS idx_families_inviteCode ON families(inviteCode);

-- 5. Family invites table (in-app notification, not email delivery)
CREATE TABLE IF NOT EXISTS family_invites (
  id TEXT PRIMARY KEY,
  familyId TEXT NOT NULL,
  email TEXT NOT NULL,
  invitedBy TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (familyId) REFERENCES families(id),
  FOREIGN KEY (invitedBy) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_family_invites_email ON family_invites(email);
CREATE INDEX IF NOT EXISTS idx_family_invites_familyId ON family_invites(familyId);

-- 6. Index on visibility for feed queries
CREATE INDEX IF NOT EXISTS idx_transactions_visibility ON transactions(visibility);

-- 7. Drop old tables
DROP TABLE IF EXISTS shared_expenses;
DROP TABLE IF EXISTS settlement_history;

-- 8. Clean up virtual family members
DELETE FROM family_members WHERE isVirtual = 1;
