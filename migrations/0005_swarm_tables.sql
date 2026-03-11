-- Migration: Add swarm and multi-agent tables
-- Created: 2026-03-11

-- Agents table - defines custom agents for swarm orchestration
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    model_provider TEXT NOT NULL,
    api_key_vault_ref TEXT,
    instructions TEXT NOT NULL,
    max_tokens INTEGER,
    temperature REAL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);

-- Swarm sessions table - tracks multi-agent swarm executions
CREATE TABLE IF NOT EXISTS swarm_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    manager_agent_id TEXT REFERENCES agents(id),
    status TEXT NOT NULL,
    final_output TEXT,
    max_concurrent INTEGER DEFAULT 3,
    timeout_ms INTEGER DEFAULT 300000,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_swarm_sessions_user_id ON swarm_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_swarm_sessions_status ON swarm_sessions(status);

-- Swarm agents table - links swarm sessions to worker agents
CREATE TABLE IF NOT EXISTS swarm_agents (
    swarm_session_id TEXT REFERENCES swarm_sessions(id) NOT NULL,
    agent_id TEXT REFERENCES agents(id) NOT NULL,
    role TEXT NOT NULL,
    PRIMARY KEY (swarm_session_id, agent_id)
);

-- Agent tasks table - tracks individual task execution within a swarm
CREATE TABLE IF NOT EXISTS agent_tasks (
    id TEXT PRIMARY KEY NOT NULL,
    swarm_session_id TEXT REFERENCES swarm_sessions(id) NOT NULL,
    agent_id TEXT REFERENCES agents(id) NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    output TEXT,
    error TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_swarm_id ON agent_tasks(swarm_session_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
