CREATE TABLE games (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('browser', 'room')),
  mode TEXT NOT NULL CHECK (mode IN ('local', 'computer', 'free', 'online')),
  version INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  ended_at INTEGER,
  updated_at INTEGER NOT NULL,
  shots INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  outcome TEXT,
  end_reason TEXT,
  initial_settings TEXT NOT NULL,
  settings TEXT NOT NULL,
  settings_changes INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX games_started ON games(started_at);
CREATE INDEX games_mode_started ON games(mode, started_at);
