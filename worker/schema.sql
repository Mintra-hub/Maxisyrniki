CREATE TABLE IF NOT EXISTS customers (
  tg_id      INTEGER PRIMARY KEY,
  name       TEXT,
  phone      TEXT,
  address    TEXT,
  username   TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tg_id      INTEGER,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  address    TEXT NOT NULL,
  when_text  TEXT,
  comment    TEXT,
  items      TEXT NOT NULL,
  total      INTEGER NOT NULL,
  lang       TEXT,
  ip         TEXT,
  phone_norm TEXT,
  bonus      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS orders_tg ON orders (tg_id, id);
CREATE INDEX IF NOT EXISTS orders_time ON orders (created_at);
CREATE INDEX IF NOT EXISTS orders_phone ON orders (phone_norm);
