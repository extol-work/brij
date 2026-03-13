-- Add recurring activity support
CREATE TYPE recurring_frequency AS ENUM ('weekly', 'biweekly', 'monthly');

ALTER TABLE activities ADD COLUMN is_recurring boolean NOT NULL DEFAULT false;
ALTER TABLE activities ADD COLUMN recurring_frequency recurring_frequency;
ALTER TABLE activities ADD COLUMN series_id uuid;
