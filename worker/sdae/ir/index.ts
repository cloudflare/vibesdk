/**
 * SDAE Intermediate Representation
 *
 * The IR is the single formal definition of the execution plan. After the
 * spec-to-bible compiler produces a MasterBible, everything downstream
 * (compiler, runner, cache, audit) operates exclusively on these types.
 *
 * Key design decisions:
 * - Every op type has its OWN strict Zod parameter schema (no Dict[str, Any]).
 * - nodeId is a stable, human-readable business identifier; contentHash is a
 *   deterministic SHA-256 computed from the node's semantic content. This
 *   separation lets us rename nodes without invalidating caches and lets us
 *   detect content-identical nodes across projects.
 * - ExecutionPolicy is separated from the plan so the same Bible can be
 *   re-run with different operational characteristics.
 * - GovernanceSpec is non-optional — autonomous code generation requires
 *   explicit security boundaries.
 */

import { z } from 'zod';
import type {
	OpType,
	NodeStatus,
	RunStatus,
} from '../types';

// ---------------------------------------------------------------------------
// Zod schema for the OpType union (mirrors the TS type for runtime checks)
// ---------------------------------------------------------------------------
export const OpTypeSchema = z.enum([
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
]);

export const OnFailActionSchema = z.enum(['stop', 'skip', 'retry', 'fallback']);
export const NodeStatusSchema = z.enum([
	'pending', 'running', 'success', 'failed', 'skipped', 'cached',
]);
export const RunStatusSchema = z.enum([
	'pending', 'running', 'partial', 'resumed', 'success', 'failed',
]);
export const SandboxIsolationSchema = z.enum(['microvm', 'container', 'namespace']);
export const AuditLevelSchema = z.enum(['trace', 'info']);

// ---------------------------------------------------------------------------
// Per-op parameter schemas
//
// Each operation type gets its own strict Zod schema — this is the key
// innovation that replaces loose Record<string, unknown> parameter bags.
// At compile time the compiler validates node.params against
// OP_SCHEMAS[node.op], catching misconfigurations before execution.
// ---------------------------------------------------------------------------

export const ScrapeDynamicParamsSchema = z.object({
	url: z.string().url(),
	selector: z.string(),
	format: z.enum(['json', 'csv', 'html']),
	headers: z.record(z.string()).optional(),
	timeoutMs: z.number().default(10000),
});

export const ScrapeStaticParamsSchema = z.object({
	url: z.string().url(),
	selector: z.string(),
	format: z.enum(['json', 'csv', 'html']),
	headers: z.record(z.string()).optional(),
});

export const ParseHtmlParamsSchema = z.object({
	html: z.string().optional(),
	sourceNodeId: z.string().optional(),
	selectors: z.record(z.string()),
	outputFormat: z.enum(['json', 'text', 'structured']).default('json'),
});

export const ExtractJsonLdParamsSchema = z.object({
	url: z.string().url().optional(),
	html: z.string().optional(),
	sourceNodeId: z.string().optional(),
	schemaTypes: z.array(z.string()).optional(),
});

export const LoginFormParamsSchema = z.object({
	url: z.string().url(),
	usernameSelector: z.string(),
	passwordSelector: z.string(),
	submitSelector: z.string(),
	credentials: z.object({
		usernameSecret: z.string(),
		passwordSecret: z.string(),
	}),
	waitAfterLoginMs: z.number().default(3000),
});

export const ApiCallParamsSchema = z.object({
	url: z.string().url(),
	method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
	headers: z.record(z.string()).optional(),
	body: z.unknown().optional(),
	auth: z.object({
		type: z.enum(['bearer', 'basic', 'api-key', 'oauth2']),
		secretRef: z.string(),
		headerName: z.string().optional(),
	}).optional(),
	timeoutMs: z.number().default(30000),
	expectedStatus: z.number().optional(),
});

export const CodeGenerateParamsSchema = z.object({
	language: z.string(),
	description: z.string(),
	outputFile: z.string(),
	styleGuide: z.string().optional(),
	context: z.array(z.string()).optional(),
	maxTokens: z.number().default(4096),
});

export const FileWriteParamsSchema = z.object({
	path: z.string(),
	content: z.string(),
	encoding: z.enum(['utf-8', 'base64', 'binary']).default('utf-8'),
	overwrite: z.boolean().default(true),
});

const AssertionSchema = z.object({
	type: z.enum(['equals', 'contains', 'matches', 'truthy', 'custom']),
	expected: z.unknown().optional(),
	expression: z.string().optional(),
});

export const TestRunParamsSchema = z.object({
	testFile: z.string(),
	framework: z.enum(['vitest', 'jest', 'mocha', 'playwright', 'custom']),
	assertions: z.array(AssertionSchema).default([]),
	timeoutMs: z.number().default(60000),
	env: z.record(z.string()).optional(),
});

const BrowserActionStepSchema = z.object({
	type: z.enum([
		'click', 'type', 'select', 'scroll', 'hover',
		'wait', 'screenshot', 'evaluate', 'navigate',
	]),
	selector: z.string().optional(),
	value: z.string().optional(),
	waitMs: z.number().optional(),
});

export const BrowserActionParamsSchema = z.object({
	url: z.string().url(),
	actions: z.array(BrowserActionStepSchema).min(1),
	viewport: z.object({
		width: z.number().default(1280),
		height: z.number().default(720),
	}).optional(),
	screenshotAfter: z.boolean().default(false),
});

export const WaitForSelectorParamsSchema = z.object({
	selector: z.string(),
	timeoutMs: z.number().default(10000),
	visible: z.boolean().default(true),
	sourceNodeId: z.string().optional(),
});

export const TransformDataParamsSchema = z.object({
	sourceNodeId: z.string().optional(),
	input: z.unknown().optional(),
	transform: z.enum(['map', 'filter', 'reduce', 'jq', 'jsonpath', 'custom']),
	expression: z.string(),
	outputFormat: z.enum(['json', 'csv', 'text']).default('json'),
});

export const ValidateOutputParamsSchema = z.object({
	sourceNodeId: z.string(),
	schema: z.record(z.unknown()).optional(),
	rules: z.array(z.object({
		field: z.string(),
		condition: z.enum([
			'required', 'type', 'min', 'max', 'pattern', 'custom',
		]),
		value: z.unknown().optional(),
		message: z.string().optional(),
	})).default([]),
});

export const NotifyUserParamsSchema = z.object({
	channel: z.enum(['websocket', 'email', 'webhook', 'log']),
	message: z.string(),
	level: z.enum(['info', 'warn', 'error', 'success']).default('info'),
	metadata: z.record(z.unknown()).optional(),
});

export const DbMigrateParamsSchema = z.object({
	direction: z.enum(['up', 'down']),
	sqlStatements: z.array(z.string()).min(1),
	dryRun: z.boolean().default(false),
	backupFirst: z.boolean().default(true),
});

export const DeployAppParamsSchema = z.object({
	platform: z.enum([
		'cloudflare-workers', 'cloudflare-pages', 'vercel',
		'netlify', 'docker', 'custom',
	]),
	config: z.record(z.unknown()),
	envVars: z.record(z.string()).optional(),
	dryRun: z.boolean().default(false),
});

export const StyleGenerateParamsSchema = z.object({
	target: z.string(),
	rules: z.array(z.object({
		selector: z.string(),
		properties: z.record(z.string()),
	})),
	tokens: z.record(z.string()).optional(),
	framework: z.enum(['tailwind', 'css-modules', 'styled-components', 'vanilla']).default('tailwind'),
});

export const ComponentGenerateParamsSchema = z.object({
	name: z.string(),
	framework: z.enum(['react', 'vue', 'svelte', 'solid', 'web-component']),
	props: z.array(z.object({
		name: z.string(),
		type: z.string(),
		required: z.boolean().default(true),
		defaultValue: z.unknown().optional(),
	})),
	styles: z.object({
		framework: z.enum(['tailwind', 'css-modules', 'styled-components', 'vanilla']).default('tailwind'),
		tokens: z.record(z.string()).optional(),
	}).optional(),
	children: z.boolean().default(false),
	outputFile: z.string(),
});

// ---------------------------------------------------------------------------
// OP_SCHEMAS registry — maps every OpType to its parameter schema.
// The compiler uses this to validate node params at compile time.
// ---------------------------------------------------------------------------
export const OP_SCHEMAS: Record<OpType, z.ZodType> = {
	SCRAPE_DYNAMIC: ScrapeDynamicParamsSchema,
	SCRAPE_STATIC: ScrapeStaticParamsSchema,
	PARSE_HTML: ParseHtmlParamsSchema,
	EXTRACT_JSON_LD: ExtractJsonLdParamsSchema,
	LOGIN_FORM: LoginFormParamsSchema,
	API_CALL: ApiCallParamsSchema,
	CODE_GENERATE: CodeGenerateParamsSchema,
	FILE_WRITE: FileWriteParamsSchema,
	TEST_RUN: TestRunParamsSchema,
	BROWSER_ACTION: BrowserActionParamsSchema,
	WAIT_FOR_SELECTOR: WaitForSelectorParamsSchema,
	TRANSFORM_DATA: TransformDataParamsSchema,
	VALIDATE_OUTPUT: ValidateOutputParamsSchema,
	NOTIFY_USER: NotifyUserParamsSchema,
	DB_MIGRATE: DbMigrateParamsSchema,
	DEPLOY_APP: DeployAppParamsSchema,
	STYLE_GENERATE: StyleGenerateParamsSchema,
	COMPONENT_GENERATE: ComponentGenerateParamsSchema,
};

// ---------------------------------------------------------------------------
// RetryPolicy — controls automatic retry behaviour per node.
// ---------------------------------------------------------------------------
export const RetryPolicySchema = z.object({
	maxAttempts: z.number().min(1).default(3),
	backoff: z.enum(['exponential', 'linear', 'fixed']).default('exponential'),
	baseDelayMs: z.number().min(0).default(1000),
	maxDelayMs: z.number().min(0).default(30000),
});

export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

// ---------------------------------------------------------------------------
// DAGNode — the atomic, hashable, cacheable unit of work.
//
// nodeId is a stable business identifier (e.g. "scrape-product-page").
// contentHash is computed after creation from the node's semantic fields
// and used as the cache key. This separation is critical:
// - Renaming a node doesn't bust the cache.
// - Two structurally-identical nodes in different projects won't collide
//   because tenantId+projectId are part of the hash.
// ---------------------------------------------------------------------------
export const DAGNodeSchema = z.object({
	nodeId: z.string().min(1),
	contentHash: z.string().optional(),
	op: OpTypeSchema,
	params: z.record(z.unknown()),
	dependsOn: z.array(z.string()).default([]),
	dslVersion: z.string().default('2.1'),
	tenantId: z.string().min(1),
	projectId: z.string().min(1),
	envFingerprint: z.string().min(1),
	onFail: OnFailActionSchema.default('stop'),
	retryPolicy: RetryPolicySchema.optional(),
	timeoutSeconds: z.number().min(1).default(300),
	cacheable: z.boolean().default(true),
	metadata: z.record(z.unknown()).default({}),
	createdAt: z.string().datetime().optional(),
});

export type DAGNode = z.infer<typeof DAGNodeSchema>;

// ---------------------------------------------------------------------------
// Content hash computation
//
// Deterministic SHA-256 over the fields that define semantic identity.
// Uses Web Crypto API (crypto.subtle) — works in Cloudflare Workers.
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic SHA-256 content hash for a DAG node.
 *
 * Included fields: op, params, dependsOn (sorted for stability),
 * dslVersion, tenantId, projectId, envFingerprint, onFail,
 * retryPolicy, timeoutSeconds, cacheable.
 *
 * The hash is hex-encoded and prefixed with "sha256:" for clarity.
 */
export async function computeContentHash(node: DAGNode): Promise<string> {
	const payload = {
		op: node.op,
		params: node.params,
		dependsOn: [...node.dependsOn].sort(),
		dslVersion: node.dslVersion,
		tenantId: node.tenantId,
		projectId: node.projectId,
		envFingerprint: node.envFingerprint,
		onFail: node.onFail,
		retryPolicy: node.retryPolicy ?? null,
		timeoutSeconds: node.timeoutSeconds,
		cacheable: node.cacheable,
	};

	// Deterministic JSON — sorted keys at every nesting level
	const canonical = JSON.stringify(payload, Object.keys(payload).sort());
	const encoded = new TextEncoder().encode(canonical);
	const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);

	// Convert ArrayBuffer to hex string
	const hashArray = new Uint8Array(hashBuffer);
	const hex = Array.from(hashArray)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	return `sha256:${hex}`;
}

// ---------------------------------------------------------------------------
// ExecutionPolicy — operational knobs separated from the plan itself.
// The same MasterBible can be re-run with a different policy (e.g. lower
// parallelism in staging, higher in production).
// ---------------------------------------------------------------------------
export const ExecutionPolicySchema = z.object({
	defaultRetry: RetryPolicySchema,
	maxParallelism: z.number().min(1).default(8),
	timeoutGlobalSeconds: z.number().min(1).default(3600),
	humanApprovalGates: z.array(z.string()).default([]),
	auditLevel: AuditLevelSchema.default('trace'),
});

export type ExecutionPolicy = z.infer<typeof ExecutionPolicySchema>;

// ---------------------------------------------------------------------------
// GovernanceSpec — non-optional security boundaries for autonomous operation.
// Without explicit governance, the engine refuses to run.
// ---------------------------------------------------------------------------
export const GovernanceSpecSchema = z.object({
	requiredSecrets: z.array(z.string()).default([]),
	sandboxIsolationLevel: SandboxIsolationSchema.default('container'),
	allowedRegistries: z.array(z.string()),
	artifactProvenance: z.boolean().default(true),
	auditLogLevel: AuditLevelSchema.default('trace'),
	humanInLoopNodes: z.array(z.string()).default([]),
});

export type GovernanceSpec = z.infer<typeof GovernanceSpecSchema>;

// ---------------------------------------------------------------------------
// BibleMetadata — provenance and identity for the MasterBible.
// ---------------------------------------------------------------------------
export const BibleMetadataSchema = z.object({
	dslVersion: z.string().default('2.1'),
	projectId: z.string().min(1),
	tenantId: z.string().min(1),
	createdAt: z.string().datetime(),
	humanApproved: z.boolean().default(false),
	approvalGateNotes: z.string().optional(),
});

export type BibleMetadata = z.infer<typeof BibleMetadataSchema>;

// ---------------------------------------------------------------------------
// MasterBible — the SINGLE SOURCE OF TRUTH for an execution plan.
//
// After the spec-to-bible compiler produces this, no natural language is
// consulted. Every downstream component (compiler, runner, cache, audit)
// operates exclusively on this structure.
// ---------------------------------------------------------------------------
export const MasterBibleSchema = z.object({
	metadata: BibleMetadataSchema,
	constraints: z.array(z.string()).min(1),
	edgeCases: z.array(z.string()).min(1),
	dosAndDonts: z.object({
		do: z.array(z.string()),
		dont: z.array(z.string()),
	}),
	executionGraph: z.array(DAGNodeSchema),
	executionPolicy: ExecutionPolicySchema,
	governance: GovernanceSpecSchema,
	artifactsExpected: z.array(z.string()),
	nonGoals: z.array(z.string()).default([]),
	validationRules: z.array(z.string()).default([]),
	failureRecoveryPlan: z.string().optional(),
});

export type MasterBible = z.infer<typeof MasterBibleSchema>;

// ---------------------------------------------------------------------------
// Compilation result types (used by the compiler module)
// ---------------------------------------------------------------------------
export interface ValidationResult {
	nodeId: string;
	valid: boolean;
	errors: string[];
}

export interface CompilationResult {
	nodes: DAGNode[];
	executionOrder: string[];
	parallelGroups: string[][];
	warnings: string[];
	errors: string[];
	isValid: boolean;
}

// ---------------------------------------------------------------------------
// Runtime result types (used by the runner module)
// ---------------------------------------------------------------------------
export interface NodeOutput {
	data: unknown;
	artifacts?: string[];
	logs?: string[];
}

export interface NodeResult {
	nodeId: string;
	status: NodeStatus;
	output: unknown;
	durationMs: number;
	tokenSpend: number;
	cacheHit: boolean;
	error?: string;
	retryCount: number;
}

export interface RunResult {
	runId: string;
	status: RunStatus;
	nodeResults: Map<string, NodeResult>;
	totalDurationMs: number;
	totalTokenSpend: number;
	cacheHitRate: number;
	errors: string[];
}

export interface RunContext {
	tenantId: string;
	projectId: string;
	envFingerprint: string;
	secrets: Map<string, string>;
	previousNodeOutputs: Map<string, unknown>;
}

export interface NodeContext extends RunContext {
	nodeId: string;
	runId: string;
	attemptNumber: number;
}

export interface CachedResult {
	contentHash: string;
	tenantId: string;
	output: unknown;
	createdAt: string;
	ttlSeconds?: number;
}
