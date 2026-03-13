-- Add tokenIssuedAt column to users (for JWT invalidation on password change)
ALTER TABLE users ADD COLUMN tokenIssuedAt TEXT;
