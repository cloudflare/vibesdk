-- Concurrent Coder sessions table
CREATE TABLE IF NOT EXISTS cc_sessions (
  id TEXT PRIMARY KEY,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cc_sessions_created_at ON cc_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_cc_sessions_status ON cc_sessions(status);
