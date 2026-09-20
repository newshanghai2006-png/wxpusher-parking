CREATE TABLE IF NOT EXISTS parking_cards (
  id TEXT PRIMARY KEY,
  owner_secret_hash TEXT NOT NULL,
  uid TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'green',
  style TEXT NOT NULL DEFAULT 'clean',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_sent_at INTEGER,
  send_count INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_parking_cards_updated_at
  ON parking_cards(updated_at);
