/**
 * SDAE Core Types
 *
 * Shared type definitions for the Spec-Driven Autonomous Engine.
 * These types form the foundation of the entire SDAE DSL — every operation,
 * status, and policy references types defined here.
 */

// ---------------------------------------------------------------------------
// DSL version — bumped when the IR schema changes in a breaking way
// ---------------------------------------------------------------------------
export const DSL_VERSION = '2.1' as const;

// ---------------------------------------------------------------------------
// OpType — the full vocabulary of operations the DAG can express.
// Each op maps to a concrete worker function at runtime and has a dedicated
// Zod parameter schema in the IR module (OP_SCHEMAS registry).
// ---------------------------------------------------------------------------
export type OpType =
	| 'SCRAPE_DYNAMIC'
	| 'SCRAPE_STATIC'
	| 'PARSE_HTML'
	| 'EXTRACT_JSON_LD'
	| 'LOGIN_FORM'
	| 'API_CALL'
	| 'CODE_GENERATE'
	| 'FILE_WRITE'
	| 'TEST_RUN'
	| 'BROWSER_ACTION'
	| 'WAIT_FOR_SELECTOR'
	| 'TRANSFORM_DATA'
	| 'VALIDATE_OUTPUT'
	| 'NOTIFY_USER'
	| 'DB_MIGRATE'
	| 'DEPLOY_APP'
	| 'STYLE_GENERATE'
	| 'COMPONENT_GENERATE';

/** Exhaustive list for iteration / registry validation. */
export const OP_TYPES: readonly OpType[] = [
	'SCRAPE_DYNAMIC',
	'SCRAPE_STATIC',
	'PARSE_HTML',
	'EXTRACT_JSON_LD',
	'LOGIN_FORM',
	'API_CALL',
	'CODE_GENERATE',
	'FILE_WRITE',
	'TEST_RUN',
	'BROWSER_ACTION',
	'WAIT_FOR_SELECTOR',
	'TRANSFORM_DATA',
	'VALIDATE_OUTPUT',
	'NOTIFY_USER',
	'DB_MIGRATE',
	'DEPLOY_APP',
	'STYLE_GENERATE',
	'COMPONENT_GENERATE',
] as const;

// ---------------------------------------------------------------------------
// Node lifecycle status — tracks an individual DAG node through execution.
// ---------------------------------------------------------------------------
export type NodeStatus =
	| 'pending'
	| 'running'
	| 'success'
	| 'failed'
	| 'skipped'
	| 'cached';

// ---------------------------------------------------------------------------
// Run-level status — tracks the overall DAG execution.
// 'partial' means some nodes succeeded but at least one failed with
// onFail='skip'; 'resumed' means a previously-failed run was continued.
// ---------------------------------------------------------------------------
export type RunStatus =
	| 'pending'
	| 'running'
	| 'partial'
	| 'resumed'
	| 'success'
	| 'failed';

// ---------------------------------------------------------------------------
// Failure strategy per node — determines what happens when a node fails.
// 'stop'     → abort the entire run
// 'skip'     → mark as skipped, continue with dependents removed
// 'retry'    → honour the node's RetryPolicy then fail if exhausted
// 'fallback' → execute an alternative node (specified in metadata)
// ---------------------------------------------------------------------------
export type OnFailAction = 'stop' | 'skip' | 'retry' | 'fallback';

// ---------------------------------------------------------------------------
// Sandbox isolation levels — ordered from strongest to weakest isolation.
// ---------------------------------------------------------------------------
export type SandboxIsolation = 'microvm' | 'container' | 'namespace';

// ---------------------------------------------------------------------------
// Audit verbosity — 'trace' records every intermediate value and timing;
// 'info' records high-level transitions only.
// ---------------------------------------------------------------------------
export type AuditLevel = 'trace' | 'info';

// ---------------------------------------------------------------------------
// Bible version — semver string identifying the MasterBible format.
// ---------------------------------------------------------------------------
export type BibleVersion = string;
