-- Migration 002: Add virtual member support to family_members
-- Virtual members are household members who don't have their own app accounts
-- Their userId is set to the creator's userId so API ownership filtering still works

-- Add virtual flag
ALTER TABLE family_members ADD COLUMN isVirtual INTEGER DEFAULT 0;

-- Add display name (for all members, not just virtual)
ALTER TABLE family_members ADD COLUMN displayName TEXT;

-- Add emoji avatar (for all members, not just virtual)
ALTER TABLE family_members ADD COLUMN emoji TEXT DEFAULT '👤';
