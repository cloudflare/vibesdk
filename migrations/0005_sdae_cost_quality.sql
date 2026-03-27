-- SDAE Cost-Quality Multitenant Tables
-- Migration: 0005_sdae_cost_quality
-- Implements the Cost-Quality Multitenant Blueprint for the Spec-Driven Autonomous Engine (SDAE)

-- ========================================
-- TENANT BUDGET AND POLICY
-- ========================================

-- Tenant budget and policy envelope
CREATE TABLE IF NOT EXISTS tenant_budgets (
    tenant_id TEXT PRIMARY KEY,
    plan TEXT NOT NULL DEFAULT 'free',
    hard_monthly_credits INTEGER NOT NULL DEFAULT 100000,
    soft_monthly_credits INTEGER NOT NULL DEFAULT 85000,
    max_concurrent_sessions INTEGER NOT NULL DEFAULT 4,
    max_requests_per_minute INTEGER NOT NULL DEFAULT 60,
    max_tokens_per_minute INTEGER NOT NULL DEFAULT 90000,
    policy_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ========================================
-- USAGE EVENTS AND COST TRACKING
-- ========================================

-- Raw usage events for cost accounting and throttling
CREATE TABLE IF NOT EXISTS usage_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    credits_charged INTEGER NOT NULL DEFAULT 0,
    cache_hit INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_usage_events_tenant_created
    ON usage_events (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_request
    ON usage_events (request_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_session
    ON usage_events (session_id);

-- ========================================
-- QUALITY GATE OUTCOMES
-- ========================================

-- Quality outcomes for adaptive routing and product KPIs
CREATE TABLE IF NOT EXISTS quality_events (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    gate_name TEXT NOT NULL,
    passed INTEGER NOT NULL,
    confidence_score REAL,
    reason TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_quality_events_tenant_created
    ON quality_events (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_quality_events_request
    ON quality_events (request_id);

-- ========================================
-- MODEL ROUTING DECISIONS
-- ========================================

-- Explainability and auditability of model selection
CREATE TABLE IF NOT EXISTS model_routing_decisions (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    selected_tier TEXT NOT NULL,
    selected_provider TEXT,
    selected_model TEXT,
    escalation_trigger TEXT,
    confidence_score REAL,
    budget_state TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_routing_tenant_created
    ON model_routing_decisions (tenant_id, created_at);

-- ========================================
-- RETRY/FIX LOOP ANALYTICS
-- ========================================

-- Retry/fix loop analytics for controlling runaway cost
CREATE TABLE IF NOT EXISTS retry_outcomes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    phase_name TEXT NOT NULL,
    retry_count INTEGER NOT NULL,
    escalated_to_premium INTEGER NOT NULL DEFAULT 0,
    final_status TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_retry_outcomes_tenant
    ON retry_outcomes (tenant_id, created_at);

-- ========================================
-- SDAE DAG EXECUTION STATE
-- ========================================

-- DAG run records for idempotency and resumability
CREATE TABLE IF NOT EXISTS sdae_runs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    bible_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at INTEGER,
    completed_at INTEGER,
    total_duration_ms INTEGER,
    total_token_spend INTEGER DEFAULT 0,
    cache_hit_rate REAL DEFAULT 0,
    error_message TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sdae_runs_tenant
    ON sdae_runs (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sdae_runs_project
    ON sdae_runs (project_id);
CREATE INDEX IF NOT EXISTS idx_sdae_runs_status
    ON sdae_runs (status);

-- Node execution records with content hash for caching
CREATE TABLE IF NOT EXISTS sdae_node_runs (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES sdae_runs(id),
    node_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    op TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    output_snapshot TEXT,
    duration_ms INTEGER,
    token_spend INTEGER DEFAULT 0,
    cache_hit INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sdae_node_runs_run
    ON sdae_node_runs (run_id);
CREATE INDEX IF NOT EXISTS idx_sdae_node_runs_content_hash
    ON sdae_node_runs (content_hash);
CREATE INDEX IF NOT EXISTS idx_sdae_node_runs_status
    ON sdae_node_runs (status);

-- SDAE audit log for governance compliance
CREATE TABLE IF NOT EXISTS sdae_audit_log (
    id TEXT PRIMARY KEY,
    run_id TEXT REFERENCES sdae_runs(id),
    node_id TEXT,
    tenant_id TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sdae_audit_tenant
    ON sdae_audit_log (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sdae_audit_run
    ON sdae_audit_log (run_id);

-- ========================================
-- SPEC/BIBLE STORAGE AND VERSIONING
-- ========================================

-- Store generated Master Bibles for versioning and golden template reuse
CREATE TABLE IF NOT EXISTS sdae_bibles (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0',
    content_hash TEXT NOT NULL,
    bible_json TEXT NOT NULL,
    human_approved INTEGER NOT NULL DEFAULT 0,
    approval_notes TEXT,
    success_score REAL,
    reuse_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sdae_bibles_tenant
    ON sdae_bibles (tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_sdae_bibles_hash
    ON sdae_bibles (content_hash);
CREATE INDEX IF NOT EXISTS idx_sdae_bibles_success
    ON sdae_bibles (success_score);

-- ========================================
-- DYNAMIC FORM TEMPLATES (Golden Templates)
-- ========================================

-- Store successful form templates for zero-LLM reuse
CREATE TABLE IF NOT EXISTS sdae_form_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    project_type TEXT NOT NULL,
    domain TEXT NOT NULL DEFAULT 'general',
    form_json TEXT NOT NULL,
    default_constraints TEXT DEFAULT '[]',
    default_edge_cases TEXT DEFAULT '[]',
    usage_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sdae_form_templates_type
    ON sdae_form_templates (project_type, domain);
CREATE INDEX IF NOT EXISTS idx_sdae_form_templates_success
    ON sdae_form_templates (success_rate);
