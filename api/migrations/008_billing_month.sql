-- Add billingMonth column for annual/semiannual recurring items
ALTER TABLE recurring ADD COLUMN billingMonth INTEGER DEFAULT 1;
