-- Fix families: add inviteCode and defaultCurrency (frontend sends these but they were stripped)
ALTER TABLE families ADD COLUMN inviteCode TEXT;
ALTER TABLE families ADD COLUMN defaultCurrency TEXT DEFAULT 'RON';

-- Fix family_members: add monthlyIncome (frontend sends this but it was stripped)
ALTER TABLE family_members ADD COLUMN monthlyIncome REAL;
