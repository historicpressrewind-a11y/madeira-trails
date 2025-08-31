PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS trails (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  island TEXT NOT NULL,
  status TEXT NOT NULL,
  difficulty TEXT,
  distance_km REAL,
  duration_min INTEGER,
  url TEXT,
  image TEXT,
  notes TEXT,
  UNIQUE(code)
);
CREATE INDEX IF NOT EXISTS idx_trails_island ON trails(island);
CREATE INDEX IF NOT EXISTS idx_trails_status ON trails(status);
CREATE INDEX IF NOT EXISTS idx_trails_diff ON trails(difficulty);
