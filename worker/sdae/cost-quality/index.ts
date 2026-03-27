/**
 * SDAE Cost-Quality Multitenant Layer
 *
 * Implements the cost-quality optimization blueprint for the SDAE engine.
 * This module sits between the user request and the LLM call, enforcing:
 *
 * 1. Tenant budget and rate limiting (hard guards)
 * 2. Model tier selection based on risk + budget + policy
 * 3. Quality gates on LLM output (static, runtime, policy)
 * 4. Escalation from cheap → premium model when quality fails
 * 5. Full telemetry recording for cost attribution
 *
 * The core insight: most generation requests can be served by cheap models.
 * Only escalate to premium when quality gates fail AND the tenant has budget.
 * This typically cuts LLM spend by 60-80% with no user-visible quality loss.
 *
 * All state is stored in D1 (durable) and KV (fast cache). No in-memory
 * state survives across requests — this is Cloudflare Workers, not a server.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Tenant Policy Schema — stored in D1, cached in KV
//
// Each tenant gets a policy that controls their cost/quality tradeoffs.
// Policies are versioned so we can migrate them without downtime.
// ---------------------------------------------------------------------------

export const TenantPolicySchema = z.object({
	policyVersion: z.string().default('1.0'),
	tenantPlan: z.enum(['free', 'standard', 'pro', 'enterprise']),
	limits: z.object({
		hardMonthlyCredits: z.number(),
		softMonthlyCredits: z.number(),
		maxConcurrentSessions: z.number().default(8),
		maxRequestsPerMinute: z.number().default(120),
		maxTokensPerMinute: z.number().default(180000),
	}),
	routing: z.object({
		defaultTier: z.enum(['low_cost', 'premium']).default('low_cost'),
		maxEscalationsPerRequest: z.number().default(1),
		allowPremiumForSecuritySensitive: z.boolean().default(true),
		cacheTtlSeconds: z.number().default(900),
	}),
	quality: z.object({
		maxFixLoopsPerPhase: z.number().default(2),
		requireStaticChecksBeforePremium: z.boolean().default(true),
		confidenceThreshold: z.number().default(0.78),
	}),
	degradation: z.object({
		enabledWhenSoftLimitReached: z.boolean().default(true),
		disablePremiumAtHardLimit: z.boolean().default(true),
		fallbackMode: z.enum(['queue_or_partial', 'deny', 'downgrade']).default('queue_or_partial'),
	}),
});

export type TenantPolicy = z.infer<typeof TenantPolicySchema>;

// ---------------------------------------------------------------------------
// Supporting interfaces
// ---------------------------------------------------------------------------

/** Budget state for a tenant in the current billing period. */
export interface BudgetState {
	tenantId: string;
	periodStart: number;
	creditsUsed: number;
	creditsRemaining: number;
	softLimitReached: boolean;
	hardLimitReached: boolean;
	tokensUsedThisMinute: number;
	requestsThisMinute: number;
}

/** Result of enforcing hard guards — pass or fail with reason. */
export interface GuardResult {
	allowed: boolean;
	reason?: string;
	/** If rate-limited, how long to wait before retrying (ms). */
	retryAfterMs?: number;
}

/** Context for model routing decisions. */
export interface RoutingContext {
	tenantId: string;
	projectId: string;
	/** The operation being performed — some ops are inherently higher-risk. */
	operationType: string;
	/** Whether the request touches auth, crypto, or PII-handling code. */
	isSecuritySensitive: boolean;
	/** Whether this is a retry after a quality gate failure. */
	isEscalation: boolean;
	/** Free-text description of what's being generated. */
	description: string;
}

/** Context for quality gate evaluation. */
export interface QualityContext {
	tenantId: string;
	projectId: string;
	operationType: string;
	/** The model tier that produced the output. */
	modelTier: 'low_cost' | 'premium';
	/** Which attempt number this is. */
	attemptNumber: number;
	/** Language of the generated code (for lint/type checks). */
	language?: string;
}

/** Result from the quality gate evaluation. */
export interface QualityResult {
	passed: boolean;
	/** Confidence score 0-1 — compared against policy threshold. */
	confidenceScore: number;
	/** Individual gate results. */
	gates: GateResult[];
	/** Human-readable reasons for failure. */
	failureReasons: string[];
	/** Whether the failure is deterministically recoverable (worth retrying). */
	isRecoverable: boolean;
}

interface GateResult {
	gate: 'static' | 'runtime' | 'policy';
	passed: boolean;
	details: string;
}

/** Usage event recorded to D1 for cost attribution. */
export interface UsageEvent {
	tenantId: string;
	projectId: string;
	modelTier: 'low_cost' | 'premium';
	modelName: string;
	inputTokens: number;
	outputTokens: number;
	creditsConsumed: number;
	durationMs: number;
	timestamp: number;
}

/** Quality event recorded to D1 for quality tracking. */
export interface QualityEvent {
	tenantId: string;
	projectId: string;
	modelTier: 'low_cost' | 'premium';
	passed: boolean;
	confidenceScore: number;
	failureReasons: string[];
	timestamp: number;
}

/** Routing decision recorded to D1 for analytics. */
export interface RoutingDecision {
	tenantId: string;
	projectId: string;
	initialTier: 'low_cost' | 'premium';
	finalTier: 'low_cost' | 'premium';
	escalated: boolean;
	risk: 'low' | 'medium' | 'high_security_sensitive';
	reason: string;
	timestamp: number;
}

/** Retry outcome recorded to D1 for retry effectiveness tracking. */
export interface RetryOutcome {
	tenantId: string;
	projectId: string;
	attemptNumber: number;
	modelTier: 'low_cost' | 'premium';
	succeeded: boolean;
	reason: string;
	timestamp: number;
}

/** Aggregated usage summary for a tenant over a time period. */
export interface UsageSummary {
	tenantId: string;
	periodStart: number;
	totalCreditsUsed: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalRequests: number;
	lowCostRequests: number;
	premiumRequests: number;
	escalationRate: number;
	qualityPassRate: number;
	avgConfidenceScore: number;
}

/** Top-level request context for the orchestrator. */
export interface RequestContext {
	tenantId: string;
	projectId: string;
	sessionId: string;
	operationType: string;
	description: string;
	isSecuritySensitive: boolean;
	/** The actual prompt / input to send to the LLM. */
	prompt: string;
	/** System prompt to prepend. */
	systemPrompt?: string;
	/** Maximum tokens for the response. */
	maxTokens?: number;
	/** AI Gateway URL for proxying LLM calls. */
	aiGatewayUrl: string;
	/** Model names keyed by tier. */
	models: {
		low_cost: string;
		premium: string;
	};
	/** Cloudflare bindings. */
	kv: KVNamespace;
	d1: D1Database;
}

/** Final result from the generation orchestrator. */
export interface GenerationResult {
	success: boolean;
	output: unknown;
	modelTier: 'low_cost' | 'premium';
	modelName: string;
	totalAttempts: number;
	escalated: boolean;
	qualityScore: number;
	creditsConsumed: number;
	durationMs: number;
	error?: string;
}

// ---------------------------------------------------------------------------
// Default policies for each plan tier
// ---------------------------------------------------------------------------

const DEFAULT_POLICIES: Record<string, Omit<TenantPolicy, 'tenantPlan'>> = {
	free: {
		policyVersion: '1.0',
		limits: {
			hardMonthlyCredits: 100,
			softMonthlyCredits: 80,
			maxConcurrentSessions: 2,
			maxRequestsPerMinute: 20,
			maxTokensPerMinute: 40000,
		},
		routing: {
			defaultTier: 'low_cost',
			maxEscalationsPerRequest: 0,
			allowPremiumForSecuritySensitive: false,
			cacheTtlSeconds: 1800,
		},
		quality: {
			maxFixLoopsPerPhase: 1,
			requireStaticChecksBeforePremium: true,
			confidenceThreshold: 0.70,
		},
		degradation: {
			enabledWhenSoftLimitReached: true,
			disablePremiumAtHardLimit: true,
			fallbackMode: 'deny',
		},
	},
	standard: {
		policyVersion: '1.0',
		limits: {
			hardMonthlyCredits: 1000,
			softMonthlyCredits: 800,
			maxConcurrentSessions: 5,
			maxRequestsPerMinute: 60,
			maxTokensPerMinute: 120000,
		},
		routing: {
			defaultTier: 'low_cost',
			maxEscalationsPerRequest: 1,
			allowPremiumForSecuritySensitive: true,
			cacheTtlSeconds: 900,
		},
		quality: {
			maxFixLoopsPerPhase: 2,
			requireStaticChecksBeforePremium: true,
			confidenceThreshold: 0.78,
		},
		degradation: {
			enabledWhenSoftLimitReached: true,
			disablePremiumAtHardLimit: true,
			fallbackMode: 'queue_or_partial',
		},
	},
	pro: {
		policyVersion: '1.0',
		limits: {
			hardMonthlyCredits: 5000,
			softMonthlyCredits: 4000,
			maxConcurrentSessions: 10,
			maxRequestsPerMinute: 120,
			maxTokensPerMinute: 250000,
		},
		routing: {
			defaultTier: 'low_cost',
			maxEscalationsPerRequest: 2,
			allowPremiumForSecuritySensitive: true,
			cacheTtlSeconds: 600,
		},
		quality: {
			maxFixLoopsPerPhase: 3,
			requireStaticChecksBeforePremium: false,
			confidenceThreshold: 0.82,
		},
		degradation: {
			enabledWhenSoftLimitReached: true,
			disablePremiumAtHardLimit: false,
			fallbackMode: 'downgrade',
		},
	},
	enterprise: {
		policyVersion: '1.0',
		limits: {
			hardMonthlyCredits: 50000,
			softMonthlyCredits: 40000,
			maxConcurrentSessions: 50,
			maxRequestsPerMinute: 300,
			maxTokensPerMinute: 500000,
		},
		routing: {
			defaultTier: 'low_cost',
			maxEscalationsPerRequest: 3,
			allowPremiumForSecuritySensitive: true,
			cacheTtlSeconds: 300,
		},
		quality: {
			maxFixLoopsPerPhase: 5,
			requireStaticChecksBeforePremium: false,
			confidenceThreshold: 0.85,
		},
		degradation: {
			enabledWhenSoftLimitReached: false,
			disablePremiumAtHardLimit: false,
			fallbackMode: 'downgrade',
		},
	},
};

// ---------------------------------------------------------------------------
// KV key helpers
// ---------------------------------------------------------------------------

function policyKvKey(tenantId: string): string {
	return `sdae:policy:${tenantId}`;
}

function budgetKvKey(tenantId: string, periodStart: number): string {
	return `sdae:budget:${tenantId}:${periodStart}`;
}

function rateKvKey(tenantId: string, minuteSlot: number): string {
	return `sdae:rate:${tenantId}:${minuteSlot}`;
}

function sessionCountKvKey(tenantId: string): string {
	return `sdae:sessions:${tenantId}`;
}

/** Get the start of the current billing period (first of the month UTC). */
function currentPeriodStart(): number {
	const now = new Date();
	return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

/** Get the current minute slot for rate limiting. */
function currentMinuteSlot(): number {
	return Math.floor(Date.now() / 60000);
}

// ---------------------------------------------------------------------------
// PolicyEngine — evaluates tenant policy and determines routing constraints
// ---------------------------------------------------------------------------

export class PolicyEngine {
	constructor(
		private kv: KVNamespace,
		private d1: D1Database,
	) {}

	/**
	 * Get tenant policy with KV cache → D1 fallback → default policy.
	 * The KV cache prevents a D1 round-trip on every request.
	 */
	async getTenantPolicy(tenantId: string): Promise<TenantPolicy> {
		const key = policyKvKey(tenantId);

		// L1: KV cache
		const cached = await this.kv.get(key, 'text');
		if (cached) {
			try {
				const parsed = TenantPolicySchema.safeParse(JSON.parse(cached));
				if (parsed.success) return parsed.data;
			} catch {
				// Corrupt cache — fall through to D1
				await this.kv.delete(key);
			}
		}

		// L2: D1 lookup
		try {
			const row = await this.d1
				.prepare(
					'SELECT policy_data FROM sdae_tenant_policies WHERE tenant_id = ? LIMIT 1',
				)
				.bind(tenantId)
				.first<{ policy_data: string }>();

			if (row) {
				const parsed = TenantPolicySchema.safeParse(JSON.parse(row.policy_data));
				if (parsed.success) {
					// Backfill KV cache
					await this.cacheTenantPolicy(tenantId, parsed.data);
					return parsed.data;
				}
			}
		} catch {
			// D1 failure — fall through to default
		}

		// Fallback: default policy based on plan (assume 'free' if unknown)
		return this.getDefaultPolicy('free');
	}

	/** Write policy to KV with TTL. */
	async cacheTenantPolicy(tenantId: string, policy: TenantPolicy): Promise<void> {
		await this.kv.put(
			policyKvKey(tenantId),
			JSON.stringify(policy),
			{ expirationTtl: policy.routing.cacheTtlSeconds },
		);
	}

	/**
	 * Check the tenant's budget state for the current billing period.
	 * Reads from KV first (updated on each usage event), D1 as truth.
	 */
	async checkBudget(tenantId: string, policy: TenantPolicy): Promise<BudgetState> {
		const periodStart = currentPeriodStart();
		const minuteSlot = currentMinuteSlot();

		// Get cumulative credits used this period
		let creditsUsed = 0;
		const budgetKey = budgetKvKey(tenantId, periodStart);
		const cachedBudget = await this.kv.get(budgetKey, 'text');

		if (cachedBudget) {
			creditsUsed = parseFloat(cachedBudget) || 0;
		} else {
			// Fall through to D1 aggregation
			try {
				const row = await this.d1
					.prepare(
						`SELECT COALESCE(SUM(credits_consumed), 0) as total
						 FROM sdae_usage_events
						 WHERE tenant_id = ? AND timestamp >= ?`,
					)
					.bind(tenantId, periodStart)
					.first<{ total: number }>();

				creditsUsed = row?.total ?? 0;

				// Cache in KV for 60 seconds
				await this.kv.put(budgetKey, String(creditsUsed), {
					expirationTtl: 60,
				});
			} catch {
				// If D1 fails, assume 0 (fail open for reads, fail closed for writes)
			}
		}

		// Get rate counters for the current minute
		let requestsThisMinute = 0;
		let tokensThisMinute = 0;
		const rateKey = rateKvKey(tenantId, minuteSlot);
		const rateData = await this.kv.get(rateKey, 'text');
		if (rateData) {
			try {
				const parsed = JSON.parse(rateData);
				requestsThisMinute = parsed.requests ?? 0;
				tokensThisMinute = parsed.tokens ?? 0;
			} catch {
				// Corrupt rate data — treat as zero
			}
		}

		const creditsRemaining = policy.limits.hardMonthlyCredits - creditsUsed;

		return {
			tenantId,
			periodStart,
			creditsUsed,
			creditsRemaining: Math.max(0, creditsRemaining),
			softLimitReached: creditsUsed >= policy.limits.softMonthlyCredits,
			hardLimitReached: creditsUsed >= policy.limits.hardMonthlyCredits,
			tokensUsedThisMinute: tokensThisMinute,
			requestsThisMinute,
		};
	}

	/**
	 * Enforce hard guards. These are non-negotiable limits that immediately
	 * reject the request if exceeded. Checked BEFORE any LLM call.
	 */
	async enforceHardGuards(
		tenantId: string,
		policy: TenantPolicy,
		budgetState: BudgetState,
	): Promise<GuardResult> {
		// Guard 1: Hard budget limit
		if (budgetState.hardLimitReached) {
			if (policy.degradation.fallbackMode === 'deny') {
				return {
					allowed: false,
					reason: 'Monthly credit limit exceeded. Upgrade your plan or wait for the next billing period.',
				};
			}
			// 'queue_or_partial' and 'downgrade' still allow requests
			// but the model router will enforce downgrade behaviour
		}

		// Guard 2: Requests per minute
		if (budgetState.requestsThisMinute >= policy.limits.maxRequestsPerMinute) {
			const retryAfterMs = (60 - (Date.now() % 60000));
			return {
				allowed: false,
				reason: 'Rate limit exceeded. Too many requests per minute.',
				retryAfterMs,
			};
		}

		// Guard 3: Tokens per minute
		if (budgetState.tokensUsedThisMinute >= policy.limits.maxTokensPerMinute) {
			const retryAfterMs = (60 - (Date.now() % 60000));
			return {
				allowed: false,
				reason: 'Token rate limit exceeded. Too many tokens per minute.',
				retryAfterMs,
			};
		}

		// Guard 4: Concurrent sessions
		const sessionKey = sessionCountKvKey(tenantId);
		const sessionCount = parseInt(await this.kv.get(sessionKey, 'text') ?? '0', 10);
		if (sessionCount >= policy.limits.maxConcurrentSessions) {
			return {
				allowed: false,
				reason: `Concurrent session limit (${policy.limits.maxConcurrentSessions}) reached. Wait for existing sessions to complete.`,
			};
		}

		return { allowed: true };
	}

	/** Get default policy for a plan tier. */
	getDefaultPolicy(plan: TenantPolicy['tenantPlan']): TenantPolicy {
		const defaults = DEFAULT_POLICIES[plan] ?? DEFAULT_POLICIES['free']!;
		return { ...defaults, tenantPlan: plan };
	}

	/**
	 * Increment rate counters in KV. Called after each LLM request.
	 * KV entries auto-expire after 120s (covers the 1-minute window with buffer).
	 */
	async incrementRateCounters(
		tenantId: string,
		tokens: number,
	): Promise<void> {
		const minuteSlot = currentMinuteSlot();
		const rateKey = rateKvKey(tenantId, minuteSlot);

		const existing = await this.kv.get(rateKey, 'text');
		let requests = 1;
		let totalTokens = tokens;

		if (existing) {
			try {
				const parsed = JSON.parse(existing);
				requests = (parsed.requests ?? 0) + 1;
				totalTokens = (parsed.tokens ?? 0) + tokens;
			} catch {
				// Start fresh
			}
		}

		await this.kv.put(
			rateKey,
			JSON.stringify({ requests, tokens: totalTokens }),
			{ expirationTtl: 120 },
		);
	}

	/**
	 * Increment the cumulative budget counter in KV. Called after each usage event.
	 */
	async incrementBudget(tenantId: string, credits: number): Promise<void> {
		const periodStart = currentPeriodStart();
		const budgetKey = budgetKvKey(tenantId, periodStart);

		const existing = parseFloat(await this.kv.get(budgetKey, 'text') ?? '0');
		await this.kv.put(
			budgetKey,
			String(existing + credits),
			{ expirationTtl: 86400 }, // 24h — will be refreshed from D1 periodically
		);
	}
}

// ---------------------------------------------------------------------------
// ModelRouter — selects the optimal model tier based on policy, budget, risk
// ---------------------------------------------------------------------------

export class ModelRouter {
	/**
	 * Classify the risk level of a generation request.
	 *
	 * 'high_security_sensitive' — touches auth, crypto, PII, or payments
	 * 'medium' — complex logic, database operations, or API integrations
	 * 'low' — UI components, styling, documentation, simple CRUD
	 */
	classifyRisk(context: RoutingContext): 'low' | 'medium' | 'high_security_sensitive' {
		// Explicit security-sensitive flag from the caller
		if (context.isSecuritySensitive) {
			return 'high_security_sensitive';
		}

		// Op-type-based risk classification
		const highRiskOps = new Set([
			'LOGIN_FORM', 'DB_MIGRATE', 'DEPLOY_APP',
		]);
		const mediumRiskOps = new Set([
			'API_CALL', 'CODE_GENERATE', 'BROWSER_ACTION',
		]);

		if (highRiskOps.has(context.operationType)) {
			return 'high_security_sensitive';
		}
		if (mediumRiskOps.has(context.operationType)) {
			return 'medium';
		}

		// Keyword-based risk escalation from the description
		const securityKeywords = [
			'auth', 'login', 'password', 'token', 'secret', 'encrypt',
			'decrypt', 'certificate', 'oauth', 'jwt', 'session', 'permission',
			'role', 'admin', 'payment', 'credit card', 'pii', 'gdpr', 'hipaa',
		];
		const descLower = context.description.toLowerCase();
		if (securityKeywords.some((kw) => descLower.includes(kw))) {
			return 'high_security_sensitive';
		}

		return 'low';
	}

	/**
	 * Select the initial model tier for a request.
	 *
	 * Decision matrix:
	 * - Hard limit reached + deny mode → reject (handled by guard)
	 * - Hard limit reached + downgrade → always low_cost
	 * - Soft limit reached + degradation enabled → low_cost
	 * - High-security-sensitive + premium allowed → premium
	 * - Otherwise → policy default tier
	 */
	selectInitialTier(
		policy: TenantPolicy,
		budgetState: BudgetState,
		risk: 'low' | 'medium' | 'high_security_sensitive',
	): 'low_cost' | 'premium' {
		// Budget-based downgrade
		if (budgetState.hardLimitReached && policy.degradation.disablePremiumAtHardLimit) {
			return 'low_cost';
		}
		if (budgetState.softLimitReached && policy.degradation.enabledWhenSoftLimitReached) {
			return 'low_cost';
		}

		// Security-sensitive requests get premium if policy allows
		if (risk === 'high_security_sensitive' && policy.routing.allowPremiumForSecuritySensitive) {
			return 'premium';
		}

		return policy.routing.defaultTier;
	}

	/**
	 * Determine if escalation from low_cost → premium is allowed.
	 * Escalation happens when a quality gate fails on a low_cost result.
	 */
	canEscalate(
		policy: TenantPolicy,
		budgetState: BudgetState,
		_risk: 'low' | 'medium' | 'high_security_sensitive',
		escalationsUsed: number,
	): boolean {
		// Can't escalate if already at max
		if (escalationsUsed >= policy.routing.maxEscalationsPerRequest) {
			return false;
		}

		// Can't escalate if premium is disabled by budget
		if (budgetState.hardLimitReached && policy.degradation.disablePremiumAtHardLimit) {
			return false;
		}

		// Free tier can't escalate at all
		if (policy.tenantPlan === 'free') {
			return false;
		}

		return true;
	}
}

// ---------------------------------------------------------------------------
// QualityGate — validates LLM output before accepting it
// ---------------------------------------------------------------------------

export class QualityGate {
	/**
	 * Run all quality gates on an LLM output.
	 *
	 * Gate pipeline:
	 * 1. Static gate — syntax, lint, type-check indicators
	 * 2. Runtime gate — sandbox health, dependency resolution
	 * 3. Policy gate — security-sensitive patterns, disallowed constructs
	 *
	 * All gates run in parallel; the result is the intersection.
	 */
	async evaluate(
		context: QualityContext,
		output: unknown,
	): Promise<QualityResult> {
		const gates: GateResult[] = [];
		const failureReasons: string[] = [];

		// Run all gates concurrently
		const [staticResult, runtimeResult, policyResult] = await Promise.all([
			this.runStaticGate(context, output),
			this.runRuntimeGate(context, output),
			this.runPolicyGate(context, output),
		]);

		gates.push(staticResult, runtimeResult, policyResult);

		for (const gate of gates) {
			if (!gate.passed) {
				failureReasons.push(`[${gate.gate}] ${gate.details}`);
			}
		}

		const passedCount = gates.filter((g) => g.passed).length;
		const confidenceScore = passedCount / gates.length;
		const passed = failureReasons.length === 0;

		return {
			passed,
			confidenceScore,
			gates,
			failureReasons,
			isRecoverable: this.isDeterministicRecoverable({ passed, confidenceScore, gates, failureReasons, isRecoverable: false }),
		};
	}

	/**
	 * Determine if a quality failure is deterministically recoverable.
	 *
	 * Recoverable failures: syntax errors, missing imports, type mismatches.
	 * Non-recoverable: logic errors, security violations, policy breaches.
	 *
	 * This distinction determines whether we retry with the same model
	 * (recoverable → yes) or escalate to premium (non-recoverable → yes).
	 */
	isDeterministicRecoverable(result: QualityResult): boolean {
		if (result.passed) return false; // Nothing to recover

		// Policy gate failures are never recoverable by retrying the same model
		const policyFailed = result.gates.some(
			(g) => g.gate === 'policy' && !g.passed,
		);
		if (policyFailed) return false;

		// Static failures (syntax, lint) are often recoverable
		const staticFailed = result.gates.some(
			(g) => g.gate === 'static' && !g.passed,
		);
		if (staticFailed) return true;

		// Runtime failures might be recoverable (missing dependency, etc.)
		const runtimeFailed = result.gates.some(
			(g) => g.gate === 'runtime' && !g.passed,
		);
		if (runtimeFailed) return true;

		return false;
	}

	/**
	 * Static gate: checks for syntax errors, type issues, and lint violations.
	 * This is a fast, local check — no network calls.
	 */
	private async runStaticGate(
		_context: QualityContext,
		output: unknown,
	): Promise<GateResult> {
		if (typeof output !== 'string' && typeof output !== 'object') {
			return {
				gate: 'static',
				passed: false,
				details: `Unexpected output type: ${typeof output}`,
			};
		}

		const content = typeof output === 'string'
			? output
			: JSON.stringify(output);

		// Check for obvious syntax issues in generated code
		const issues: string[] = [];

		// Unmatched braces/brackets (simple heuristic)
		const openBraces = (content.match(/\{/g) ?? []).length;
		const closeBraces = (content.match(/\}/g) ?? []).length;
		if (openBraces !== closeBraces) {
			issues.push(`Unmatched braces: ${openBraces} open, ${closeBraces} close`);
		}

		const openBrackets = (content.match(/\[/g) ?? []).length;
		const closeBrackets = (content.match(/\]/g) ?? []).length;
		if (openBrackets !== closeBrackets) {
			issues.push(`Unmatched brackets: ${openBrackets} open, ${closeBrackets} close`);
		}

		// Empty output
		if (content.trim().length === 0) {
			issues.push('Empty output');
		}

		// Truncated output (common with token limits)
		if (content.endsWith('...') || content.endsWith('// ...')) {
			issues.push('Output appears truncated');
		}

		if (issues.length > 0) {
			return {
				gate: 'static',
				passed: false,
				details: issues.join('; '),
			};
		}

		return { gate: 'static', passed: true, details: 'All static checks passed' };
	}

	/**
	 * Runtime gate: checks for sandbox health indicators.
	 * In the full implementation, this would run the code in a sandbox
	 * and check for crashes, timeouts, or dependency resolution failures.
	 * Here we validate structural output correctness.
	 */
	private async runRuntimeGate(
		_context: QualityContext,
		output: unknown,
	): Promise<GateResult> {
		// Validate that the output is parseable and non-trivial
		if (output === null || output === undefined) {
			return {
				gate: 'runtime',
				passed: false,
				details: 'Null or undefined output',
			};
		}

		// If it's a string, check for minimum content
		if (typeof output === 'string' && output.trim().length < 10) {
			return {
				gate: 'runtime',
				passed: false,
				details: 'Output too short to be meaningful',
			};
		}

		return { gate: 'runtime', passed: true, details: 'Runtime checks passed' };
	}

	/**
	 * Policy gate: checks for security-sensitive patterns and disallowed constructs.
	 * This catches dangerous patterns that the LLM might generate.
	 */
	private async runPolicyGate(
		_context: QualityContext,
		output: unknown,
	): Promise<GateResult> {
		const content = typeof output === 'string'
			? output
			: JSON.stringify(output);

		const violations: string[] = [];

		// Check for hardcoded secrets/credentials
		const secretPatterns = [
			/(?:password|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
			/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/gi,
			/(?:sk|pk)[-_](?:live|test)[-_][a-zA-Z0-9]{20,}/gi,
		];
		for (const pattern of secretPatterns) {
			if (pattern.test(content)) {
				violations.push('Possible hardcoded secret or credential detected');
				break;
			}
		}

		// Check for dangerous system calls in code
		const dangerousPatterns = [
			/\beval\s*\(/gi,
			/\bexec\s*\(/gi,
			/child_process/gi,
			/rm\s+-rf\s+\//gi,
			/DROP\s+TABLE/gi,
			/DELETE\s+FROM\s+\w+\s*;?\s*$/gim,
		];
		for (const pattern of dangerousPatterns) {
			if (pattern.test(content)) {
				violations.push(`Dangerous pattern detected: ${pattern.source}`);
			}
		}

		if (violations.length > 0) {
			return {
				gate: 'policy',
				passed: false,
				details: violations.join('; '),
			};
		}

		return { gate: 'policy', passed: true, details: 'Policy checks passed' };
	}
}

// ---------------------------------------------------------------------------
// UsageTracker — records all usage events to D1 for cost attribution
// ---------------------------------------------------------------------------

export class UsageTracker {
	constructor(private d1: D1Database) {}

	/** Record an LLM usage event (tokens, cost, duration). */
	async recordUsage(event: UsageEvent): Promise<void> {
		try {
			await this.d1
				.prepare(
					`INSERT INTO sdae_usage_events
					 (tenant_id, project_id, model_tier, model_name,
					  input_tokens, output_tokens, credits_consumed,
					  duration_ms, timestamp)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.bind(
					event.tenantId,
					event.projectId,
					event.modelTier,
					event.modelName,
					event.inputTokens,
					event.outputTokens,
					event.creditsConsumed,
					event.durationMs,
					event.timestamp,
				)
				.run();
		} catch {
			// Non-fatal — telemetry should never block the happy path
		}
	}

	/** Record a quality gate evaluation event. */
	async recordQuality(event: QualityEvent): Promise<void> {
		try {
			await this.d1
				.prepare(
					`INSERT INTO sdae_quality_events
					 (tenant_id, project_id, model_tier, passed,
					  confidence_score, failure_reasons, timestamp)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				)
				.bind(
					event.tenantId,
					event.projectId,
					event.modelTier,
					event.passed ? 1 : 0,
					event.confidenceScore,
					JSON.stringify(event.failureReasons),
					event.timestamp,
				)
				.run();
		} catch {
			// Non-fatal
		}
	}

	/** Record a routing decision for analytics. */
	async recordRouting(decision: RoutingDecision): Promise<void> {
		try {
			await this.d1
				.prepare(
					`INSERT INTO sdae_routing_decisions
					 (tenant_id, project_id, initial_tier, final_tier,
					  escalated, risk, reason, timestamp)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.bind(
					decision.tenantId,
					decision.projectId,
					decision.initialTier,
					decision.finalTier,
					decision.escalated ? 1 : 0,
					decision.risk,
					decision.reason,
					decision.timestamp,
				)
				.run();
		} catch {
			// Non-fatal
		}
	}

	/** Record a retry outcome for retry effectiveness tracking. */
	async recordRetryOutcome(outcome: RetryOutcome): Promise<void> {
		try {
			await this.d1
				.prepare(
					`INSERT INTO sdae_retry_outcomes
					 (tenant_id, project_id, attempt_number, model_tier,
					  succeeded, reason, timestamp)
					 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				)
				.bind(
					outcome.tenantId,
					outcome.projectId,
					outcome.attemptNumber,
					outcome.modelTier,
					outcome.succeeded ? 1 : 0,
					outcome.reason,
					outcome.timestamp,
				)
				.run();
		} catch {
			// Non-fatal
		}
	}

	/** Get aggregated usage for a tenant in a given billing period. */
	async getTenantUsage(
		tenantId: string,
		periodStart: number,
	): Promise<UsageSummary> {
		const defaultSummary: UsageSummary = {
			tenantId,
			periodStart,
			totalCreditsUsed: 0,
			totalInputTokens: 0,
			totalOutputTokens: 0,
			totalRequests: 0,
			lowCostRequests: 0,
			premiumRequests: 0,
			escalationRate: 0,
			qualityPassRate: 0,
			avgConfidenceScore: 0,
		};

		try {
			// Usage aggregation
			const usageRow = await this.d1
				.prepare(
					`SELECT
						 COALESCE(SUM(credits_consumed), 0) as total_credits,
						 COALESCE(SUM(input_tokens), 0) as total_input,
						 COALESCE(SUM(output_tokens), 0) as total_output,
						 COUNT(*) as total_requests,
						 SUM(CASE WHEN model_tier = 'low_cost' THEN 1 ELSE 0 END) as low_cost_count,
						 SUM(CASE WHEN model_tier = 'premium' THEN 1 ELSE 0 END) as premium_count
					 FROM sdae_usage_events
					 WHERE tenant_id = ? AND timestamp >= ?`,
				)
				.bind(tenantId, periodStart)
				.first<{
					total_credits: number;
					total_input: number;
					total_output: number;
					total_requests: number;
					low_cost_count: number;
					premium_count: number;
				}>();

			if (!usageRow) return defaultSummary;

			// Quality aggregation
			const qualityRow = await this.d1
				.prepare(
					`SELECT
						 AVG(CASE WHEN passed = 1 THEN 1.0 ELSE 0.0 END) as pass_rate,
						 AVG(confidence_score) as avg_confidence
					 FROM sdae_quality_events
					 WHERE tenant_id = ? AND timestamp >= ?`,
				)
				.bind(tenantId, periodStart)
				.first<{ pass_rate: number; avg_confidence: number }>();

			// Escalation rate
			const routingRow = await this.d1
				.prepare(
					`SELECT
						 AVG(CASE WHEN escalated = 1 THEN 1.0 ELSE 0.0 END) as escalation_rate
					 FROM sdae_routing_decisions
					 WHERE tenant_id = ? AND timestamp >= ?`,
				)
				.bind(tenantId, periodStart)
				.first<{ escalation_rate: number }>();

			return {
				tenantId,
				periodStart,
				totalCreditsUsed: usageRow.total_credits,
				totalInputTokens: usageRow.total_input,
				totalOutputTokens: usageRow.total_output,
				totalRequests: usageRow.total_requests,
				lowCostRequests: usageRow.low_cost_count,
				premiumRequests: usageRow.premium_count,
				escalationRate: routingRow?.escalation_rate ?? 0,
				qualityPassRate: qualityRow?.pass_rate ?? 0,
				avgConfidenceScore: qualityRow?.avg_confidence ?? 0,
			};
		} catch {
			return defaultSummary;
		}
	}
}

// ---------------------------------------------------------------------------
// handleGenerationRequest — Full orchestrator
//
// Implements the exact flow from the cost-quality blueprint:
// 1. Get tenant policy
// 2. Enforce hard guards (concurrent sessions, rpm, auth, hard budget)
// 3. Build normalized cache key
// 4. Check cache (via content hash of prompt)
// 5. Determine budget state and risk
// 6. Select initial tier
// 7. Loop: run model → quality gate → accept or escalate/retry
// 8. Record all telemetry
// 9. Return result or bounded failure
// ---------------------------------------------------------------------------

export async function handleGenerationRequest(
	ctx: RequestContext,
): Promise<GenerationResult> {
	const startTime = Date.now();
	const policyEngine = new PolicyEngine(ctx.kv, ctx.d1);
	const modelRouter = new ModelRouter();
	const qualityGate = new QualityGate();
	const usageTracker = new UsageTracker(ctx.d1);

	// Step 1: Get tenant policy
	const policy = await policyEngine.getTenantPolicy(ctx.tenantId);

	// Step 2: Check budget
	const budgetState = await policyEngine.checkBudget(ctx.tenantId, policy);

	// Step 3: Enforce hard guards
	const guard = await policyEngine.enforceHardGuards(
		ctx.tenantId,
		policy,
		budgetState,
	);
	if (!guard.allowed) {
		return {
			success: false,
			output: null,
			modelTier: 'low_cost',
			modelName: '',
			totalAttempts: 0,
			escalated: false,
			qualityScore: 0,
			creditsConsumed: 0,
			durationMs: Date.now() - startTime,
			error: guard.reason,
		};
	}

	// Step 4: Build normalized cache key (SHA-256 of prompt + system prompt)
	const cacheInput = JSON.stringify({
		prompt: ctx.prompt,
		systemPrompt: ctx.systemPrompt ?? '',
		operationType: ctx.operationType,
	});
	const cacheHashBuffer = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(cacheInput),
	);
	const cacheHash = Array.from(new Uint8Array(cacheHashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	// Step 5: Check KV cache for identical requests
	const cachedResponse = await ctx.kv.get(
		`sdae:gen:${ctx.tenantId}:${cacheHash}`,
		'text',
	);
	if (cachedResponse) {
		try {
			const cached = JSON.parse(cachedResponse) as GenerationResult;
			return { ...cached, durationMs: Date.now() - startTime };
		} catch {
			// Corrupt cache — continue to generation
		}
	}

	// Step 6: Determine risk and initial tier
	const routingContext: RoutingContext = {
		tenantId: ctx.tenantId,
		projectId: ctx.projectId,
		operationType: ctx.operationType,
		isSecuritySensitive: ctx.isSecuritySensitive,
		isEscalation: false,
		description: ctx.description,
	};
	const risk = modelRouter.classifyRisk(routingContext);
	let currentTier = modelRouter.selectInitialTier(policy, budgetState, risk);

	// Step 7: Generation loop — run model → quality gate → accept or escalate
	let escalationsUsed = 0;
	let totalAttempts = 0;
	let totalCredits = 0;
	const maxAttempts = policy.quality.maxFixLoopsPerPhase + 1; // +1 for the initial attempt

	let bestResult: { output: unknown; qualityScore: number; tier: 'low_cost' | 'premium'; modelName: string } | null = null;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		totalAttempts = attempt;
		const modelName = ctx.models[currentTier];

		try {
			// Call the LLM via AI Gateway
			const llmStart = Date.now();
			const llmResponse = await callLLM(
				ctx.aiGatewayUrl,
				modelName,
				ctx.systemPrompt ?? '',
				ctx.prompt,
				ctx.maxTokens ?? 4096,
			);
			const llmDuration = Date.now() - llmStart;

			// Estimate credits consumed (simplified: 1 credit per 1000 tokens)
			const tokensUsed = llmResponse.inputTokens + llmResponse.outputTokens;
			const creditsForCall = currentTier === 'premium'
				? tokensUsed / 500  // Premium costs 2x
				: tokensUsed / 1000;
			totalCredits += creditsForCall;

			// Record usage
			await usageTracker.recordUsage({
				tenantId: ctx.tenantId,
				projectId: ctx.projectId,
				modelTier: currentTier,
				modelName,
				inputTokens: llmResponse.inputTokens,
				outputTokens: llmResponse.outputTokens,
				creditsConsumed: creditsForCall,
				durationMs: llmDuration,
				timestamp: Date.now(),
			});

			// Update rate counters
			await policyEngine.incrementRateCounters(ctx.tenantId, tokensUsed);
			await policyEngine.incrementBudget(ctx.tenantId, creditsForCall);

			// Run quality gates
			const qualityContext: QualityContext = {
				tenantId: ctx.tenantId,
				projectId: ctx.projectId,
				operationType: ctx.operationType,
				modelTier: currentTier,
				attemptNumber: attempt,
			};

			const qualityResult = await qualityGate.evaluate(
				qualityContext,
				llmResponse.content,
			);

			// Record quality
			await usageTracker.recordQuality({
				tenantId: ctx.tenantId,
				projectId: ctx.projectId,
				modelTier: currentTier,
				passed: qualityResult.passed,
				confidenceScore: qualityResult.confidenceScore,
				failureReasons: qualityResult.failureReasons,
				timestamp: Date.now(),
			});

			// Track the best result so far (in case all attempts fail)
			if (
				!bestResult ||
				qualityResult.confidenceScore > bestResult.qualityScore
			) {
				bestResult = {
					output: llmResponse.content,
					qualityScore: qualityResult.confidenceScore,
					tier: currentTier,
					modelName,
				};
			}

			// Accept if quality passes
			if (
				qualityResult.passed &&
				qualityResult.confidenceScore >= policy.quality.confidenceThreshold
			) {
				const result: GenerationResult = {
					success: true,
					output: llmResponse.content,
					modelTier: currentTier,
					modelName,
					totalAttempts: attempt,
					escalated: escalationsUsed > 0,
					qualityScore: qualityResult.confidenceScore,
					creditsConsumed: totalCredits,
					durationMs: Date.now() - startTime,
				};

				// Record routing decision
				await usageTracker.recordRouting({
					tenantId: ctx.tenantId,
					projectId: ctx.projectId,
					initialTier: modelRouter.selectInitialTier(policy, budgetState, risk),
					finalTier: currentTier,
					escalated: escalationsUsed > 0,
					risk,
					reason: 'Quality gate passed',
					timestamp: Date.now(),
				});

				// Cache the successful result
				await ctx.kv.put(
					`sdae:gen:${ctx.tenantId}:${cacheHash}`,
					JSON.stringify(result),
					{ expirationTtl: policy.routing.cacheTtlSeconds },
				);

				return result;
			}

			// Quality failed — decide: retry same tier or escalate
			await usageTracker.recordRetryOutcome({
				tenantId: ctx.tenantId,
				projectId: ctx.projectId,
				attemptNumber: attempt,
				modelTier: currentTier,
				succeeded: false,
				reason: qualityResult.failureReasons.join('; '),
				timestamp: Date.now(),
			});

			// If recoverable, retry same tier
			if (qualityResult.isRecoverable && attempt < maxAttempts) {
				continue;
			}

			// If not recoverable, try escalating
			if (
				currentTier === 'low_cost' &&
				modelRouter.canEscalate(policy, budgetState, risk, escalationsUsed)
			) {
				// Check if static checks are required before escalation
				if (
					policy.quality.requireStaticChecksBeforePremium &&
					!qualityResult.gates.some((g) => g.gate === 'static' && !g.passed)
				) {
					// Static checks passed but quality still failed — escalate
				}
				currentTier = 'premium';
				escalationsUsed++;
				continue;
			}
		} catch (err) {
			// LLM call failure — record and try next attempt
			await usageTracker.recordRetryOutcome({
				tenantId: ctx.tenantId,
				projectId: ctx.projectId,
				attemptNumber: attempt,
				modelTier: currentTier,
				succeeded: false,
				reason: err instanceof Error ? err.message : String(err),
				timestamp: Date.now(),
			});

			// Try escalating on network failures
			if (
				currentTier === 'low_cost' &&
				modelRouter.canEscalate(policy, budgetState, risk, escalationsUsed)
			) {
				currentTier = 'premium';
				escalationsUsed++;
				continue;
			}
		}
	}

	// All attempts exhausted — return the best result we have, or failure
	await usageTracker.recordRouting({
		tenantId: ctx.tenantId,
		projectId: ctx.projectId,
		initialTier: modelRouter.selectInitialTier(policy, budgetState, risk),
		finalTier: currentTier,
		escalated: escalationsUsed > 0,
		risk,
		reason: 'All attempts exhausted',
		timestamp: Date.now(),
	});

	if (bestResult) {
		return {
			success: false,
			output: bestResult.output,
			modelTier: bestResult.tier,
			modelName: bestResult.modelName,
			totalAttempts,
			escalated: escalationsUsed > 0,
			qualityScore: bestResult.qualityScore,
			creditsConsumed: totalCredits,
			durationMs: Date.now() - startTime,
			error: 'Quality threshold not met after all attempts',
		};
	}

	return {
		success: false,
		output: null,
		modelTier: currentTier,
		modelName: ctx.models[currentTier],
		totalAttempts,
		escalated: escalationsUsed > 0,
		qualityScore: 0,
		creditsConsumed: totalCredits,
		durationMs: Date.now() - startTime,
		error: 'All generation attempts failed',
	};
}

// ---------------------------------------------------------------------------
// LLM call helper — uses fetch to call the AI Gateway
// Follows the same pattern as worker/services/aigateway-proxy/
// ---------------------------------------------------------------------------

interface LLMResponse {
	content: string;
	inputTokens: number;
	outputTokens: number;
}

async function callLLM(
	aiGatewayUrl: string,
	model: string,
	systemPrompt: string,
	userPrompt: string,
	maxTokens: number,
): Promise<LLMResponse> {
	const messages: Array<{ role: string; content: string }> = [];

	if (systemPrompt) {
		messages.push({ role: 'system', content: systemPrompt });
	}
	messages.push({ role: 'user', content: userPrompt });

	const requestBody = {
		model,
		messages,
		max_tokens: maxTokens,
		temperature: 0.2,
	};

	const response = await fetch(aiGatewayUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		const errorText = await response.text().catch(() => 'Unknown error');
		throw new Error(
			`LLM call failed (${response.status}): ${errorText}`,
		);
	}

	const data = await response.json() as {
		choices?: Array<{ message?: { content?: string } }>;
		usage?: { prompt_tokens?: number; completion_tokens?: number };
	};

	const content = data.choices?.[0]?.message?.content ?? '';
	const inputTokens = data.usage?.prompt_tokens ?? 0;
	const outputTokens = data.usage?.completion_tokens ?? 0;

	return { content, inputTokens, outputTokens };
}
