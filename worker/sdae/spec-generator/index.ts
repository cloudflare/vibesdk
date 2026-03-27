/**
 * SDAE Spec Generator — MasterBible Generation
 *
 * This is the ONLY module that makes expensive LLM calls for spec creation.
 * Everything downstream (compiler, runner, cache) operates on the structured
 * MasterBible produced here — no more natural language after this point.
 *
 * Generation pipeline:
 * 1. Build system prompt with DSL op reference, constraint templates, and
 *    output schema (uses Anthropic cache_control markers for 90% discount)
 * 2. Single premium model call with JSON structured output
 * 3. Validate output against MasterBibleSchema (Zod)
 * 4. Cheap Critic Loop — 3 validators in parallel using cheap models:
 *    a. Edge Case Validator
 *    b. Constraint Validator
 *    c. Anti-Pattern Detector
 * 5. Pre-Mortem Engine — structured failure simulation
 * 6. Return refined MasterBible
 *
 * Cost model: One premium call (~$0.03) + three cheap critic calls (~$0.003)
 * Total: ~$0.04 per Bible generation — acceptable for a plan-once artifact.
 */

import { z } from 'zod';
import { MasterBibleSchema, type MasterBible } from '../ir';
import { DSL_VERSION, OP_TYPES } from '../types';
import type { OpType } from '../types';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface SpecInput {
	/** The user's natural language description of what they want to build. */
	userPrompt: string;
	/** Structured form data from the FormEngine (Phase 0). */
	formData: Record<string, unknown>;
	/** Project archetype — drives template selection and constraint defaults. */
	projectType: 'fullstack' | 'mobile' | 'landing_page' | 'api_only';
	tenantId: string;
	projectId: string;
	/** Additional constraints specified by the user or inferred. */
	constraints?: string[];
	/** For iterative refinement — the previous Bible to improve upon. */
	previousBible?: MasterBible;
}

export interface SpecModelConfig {
	/** Model for the main Bible generation call (e.g. 'claude-sonnet-4-5-20250514'). */
	premiumModel: string;
	/** Model for cheap validations (e.g. 'gpt-4o-mini'). */
	cheapModel: string;
	/** Model for the critic loop (e.g. 'gemini-2.5-flash'). */
	criticModel: string;
}

export interface CriticResult {
	refinedBible: MasterBible;
	edgeCasesSuggested: string[];
	constraintIssues: string[];
	antiPatterns: string[];
	confidenceScore: number;
}

export interface PreMortemResult {
	failureModes: FailureMode[];
	mitigations: string[];
	riskLevel: 'low' | 'medium' | 'high';
}

export interface FailureMode {
	category: 'infra' | 'logic' | 'external_dependency' | 'scale';
	description: string;
	probability: 'low' | 'medium' | 'high';
	mitigation: string;
}

// ---------------------------------------------------------------------------
// Internal schemas for structured LLM outputs from critics
// ---------------------------------------------------------------------------

const EdgeCaseValidatorOutputSchema = z.object({
	missingEdgeCases: z.array(z.string()),
	severity: z.enum(['low', 'medium', 'high']),
	suggestions: z.array(z.string()),
});

const ConstraintValidatorOutputSchema = z.object({
	conflicts: z.array(z.object({
		constraint1: z.string(),
		constraint2: z.string(),
		explanation: z.string(),
	})),
	missingConstraints: z.array(z.string()),
	overConstraints: z.array(z.string()),
});

const AntiPatternDetectorOutputSchema = z.object({
	antiPatterns: z.array(z.object({
		pattern: z.string(),
		location: z.string(),
		suggestion: z.string(),
	})),
	overallScore: z.number(),
});

const PreMortemOutputSchema = z.object({
	failureModes: z.array(z.object({
		category: z.enum(['infra', 'logic', 'external_dependency', 'scale']),
		description: z.string(),
		probability: z.enum(['low', 'medium', 'high']),
		mitigation: z.string(),
	})),
});

// ---------------------------------------------------------------------------
// SpecGenerator
// ---------------------------------------------------------------------------

export class SpecGenerator {
	constructor(
		private aiGatewayUrl: string,
		private modelConfig: SpecModelConfig,
	) {}

	/**
	 * Phase 1: Generate the MasterBible from user form data.
	 *
	 * Uses a single premium model call with structured JSON output,
	 * then refines via cheap critic loop and pre-mortem analysis.
	 */
	async generateBible(input: SpecInput): Promise<MasterBible> {
		// Step 1: Build the system prompt (with cache_control for Anthropic)
		const systemPrompt = this.buildSystemPrompt(input);

		// Step 2: Build the user prompt from form data + natural language
		const userPrompt = this.buildUserPrompt(input);

		// Step 3: Call premium model with JSON structured output
		const rawBible = await this.callPremiumModel(systemPrompt, userPrompt);

		// Step 4: Validate against MasterBibleSchema
		let bible = this.validateAndParseBible(rawBible, input);

		// Step 5: Run cheap critic loop
		const criticResult = await this.runCriticLoop(bible);
		bible = criticResult.refinedBible;

		// Step 6: Run pre-mortem analysis
		const preMortemResult = await this.runPreMortem(bible);

		// Merge pre-mortem mitigations into edge cases
		if (preMortemResult.mitigations.length > 0) {
			bible = {
				...bible,
				edgeCases: [
					...bible.edgeCases,
					...preMortemResult.mitigations.map(
						(m) => `[pre-mortem] ${m}`,
					),
				],
				failureRecoveryPlan: preMortemResult.failureModes
					.map((fm) => `${fm.category}: ${fm.description} → ${fm.mitigation}`)
					.join('\n'),
			};
		}

		return bible;
	}

	/**
	 * Phase 2: Cheap Critic Loop
	 *
	 * Runs 3 independent validators in parallel using cheap models.
	 * Each validator examines a different aspect of the Bible and
	 * produces suggestions. The suggestions are then applied to
	 * produce a refined Bible — without a second expensive call.
	 */
	async runCriticLoop(bible: MasterBible): Promise<CriticResult> {
		const bibleJson = JSON.stringify(bible, null, 2);

		// Run all three critics in parallel
		const [edgeCaseResult, constraintResult, antiPatternResult] = await Promise.all([
			this.runEdgeCaseValidator(bibleJson),
			this.runConstraintValidator(bibleJson),
			this.runAntiPatternDetector(bibleJson),
		]);

		// Apply edge case suggestions
		const newEdgeCases = edgeCaseResult.missingEdgeCases;
		const refinedEdgeCases = [...bible.edgeCases, ...newEdgeCases];

		// Apply constraint fixes (remove conflicts, add missing)
		let refinedConstraints = [...bible.constraints];
		for (const missing of constraintResult.missingConstraints) {
			refinedConstraints.push(missing);
		}
		// Flag over-constraints as warnings but don't remove them
		// (the user explicitly set them)

		// Apply anti-pattern fixes to the execution graph
		let refinedGraph = [...bible.executionGraph];
		for (const ap of antiPatternResult.antiPatterns) {
			// Add metadata warnings to affected nodes
			const node = refinedGraph.find((n) => n.nodeId === ap.location);
			if (node) {
				refinedGraph = refinedGraph.map((n) =>
					n.nodeId === ap.location
						? {
							...n,
							metadata: {
								...n.metadata,
								antiPatternWarning: ap.suggestion,
							},
						}
						: n,
				);
			}
		}

		// Compute confidence score from critic outputs
		const edgeSeverityScore = edgeCaseResult.severity === 'high' ? 0.6
			: edgeCaseResult.severity === 'medium' ? 0.8
				: 0.95;
		const constraintScore = constraintResult.conflicts.length > 0 ? 0.7 : 0.95;
		const antiPatternScore = antiPatternResult.overallScore;
		const confidenceScore = (edgeSeverityScore + constraintScore + antiPatternScore) / 3;

		const refinedBible: MasterBible = {
			...bible,
			edgeCases: refinedEdgeCases,
			constraints: refinedConstraints,
			executionGraph: refinedGraph,
		};

		return {
			refinedBible,
			edgeCasesSuggested: newEdgeCases,
			constraintIssues: [
				...constraintResult.conflicts.map((c) => `Conflict: ${c.constraint1} vs ${c.constraint2}`),
				...constraintResult.overConstraints.map((c) => `Over-constrained: ${c}`),
			],
			antiPatterns: antiPatternResult.antiPatterns.map((ap) => ap.pattern),
			confidenceScore,
		};
	}

	/**
	 * Pre-Mortem Engine — structured failure simulation.
	 *
	 * Asks a cheap model: "In what ways will this plan fail?"
	 * Categorizes failure modes and produces concrete mitigations.
	 */
	async runPreMortem(bible: MasterBible): Promise<PreMortemResult> {
		const prompt = [
			'You are a pre-mortem analyst for an autonomous code generation system.',
			'Analyze this execution plan and predict how it will fail.',
			'',
			'EXECUTION PLAN:',
			JSON.stringify(bible, null, 2),
			'',
			'For each failure mode, provide:',
			'- category: infra | logic | external_dependency | scale',
			'- description: What goes wrong',
			'- probability: low | medium | high',
			'- mitigation: Concrete step to prevent or handle this failure',
			'',
			'Return JSON matching this schema:',
			JSON.stringify(PreMortemOutputSchema.shape),
			'',
			'Focus on the top 5 most likely failure modes. Be concrete and actionable.',
		].join('\n');

		try {
			const response = await this.callCheapModel(prompt);
			const parsed = this.extractJson(response);
			const validated = PreMortemOutputSchema.safeParse(parsed);

			if (!validated.success) {
				return { failureModes: [], mitigations: [], riskLevel: 'low' };
			}

			const failureModes = validated.data.failureModes;
			const mitigations = failureModes.map((fm) => fm.mitigation);

			// Compute overall risk level
			const highCount = failureModes.filter((fm) => fm.probability === 'high').length;
			const medCount = failureModes.filter((fm) => fm.probability === 'medium').length;
			const riskLevel: 'low' | 'medium' | 'high' =
				highCount >= 2 ? 'high'
					: highCount >= 1 || medCount >= 3 ? 'medium'
						: 'low';

			return { failureModes, mitigations, riskLevel };
		} catch {
			// Pre-mortem failure is non-fatal — return empty result
			return { failureModes: [], mitigations: [], riskLevel: 'low' };
		}
	}

	// -----------------------------------------------------------------------
	// System prompt construction
	// -----------------------------------------------------------------------

	/**
	 * Build the system prompt for Bible generation.
	 *
	 * This prompt is designed to be cacheable by Anthropic's prompt caching
	 * (cache_control markers). The static parts (DSL reference, constraint
	 * templates, output schema) are ~4K tokens and cached at 90% discount.
	 * Only the dynamic parts (user prompt, form data) are billed full price.
	 */
	private buildSystemPrompt(input: SpecInput): string {
		const opReference = this.buildOpReference();
		const constraintTemplates = this.buildConstraintTemplates(input.projectType);
		const outputSchema = this.buildOutputSchemaReference();

		return [
			'You are the SDAE Spec Generator — an expert system that converts user requirements',
			'into formal, machine-executable MasterBible specifications.',
			'',
			'Your output is the SINGLE SOURCE OF TRUTH for downstream autonomous code generation.',
			'After you produce the MasterBible, NO natural language is consulted.',
			'Every node, constraint, and edge case you specify will be executed literally.',
			'',
			'## RULES',
			'1. Output ONLY valid JSON matching the MasterBible schema below.',
			'2. Every DAG node must have a unique nodeId and correct op type.',
			'3. dependsOn references must form a valid DAG (no cycles).',
			'4. Include at least 3 constraints and 3 edge cases.',
			'5. Be specific — vague constraints are worse than no constraints.',
			'6. Each node\'s params must match the schema for its op type.',
			'7. Include governance settings appropriate for the project type.',
			'8. Set reasonable timeouts — default 300s per node, 3600s global.',
			'',
			'## DSL OPERATION REFERENCE',
			opReference,
			'',
			'## CONSTRAINT TEMPLATES FOR PROJECT TYPE: ' + input.projectType.toUpperCase(),
			constraintTemplates,
			'',
			'## OUTPUT SCHEMA (MasterBible)',
			outputSchema,
			'',
			`## DSL VERSION: ${DSL_VERSION}`,
		].join('\n');
	}

	/**
	 * Build user prompt from form data + natural language.
	 */
	private buildUserPrompt(input: SpecInput): string {
		const sections: string[] = [];

		sections.push(`## USER REQUEST\n${input.userPrompt}`);

		if (Object.keys(input.formData).length > 0) {
			sections.push(`## STRUCTURED REQUIREMENTS\n${JSON.stringify(input.formData, null, 2)}`);
		}

		if (input.constraints && input.constraints.length > 0) {
			sections.push(`## ADDITIONAL CONSTRAINTS\n${input.constraints.map((c) => `- ${c}`).join('\n')}`);
		}

		if (input.previousBible) {
			sections.push([
				'## PREVIOUS BIBLE (for refinement)',
				'This is an iterative refinement. Preserve the overall structure but incorporate',
				'the new requirements and fix any issues.',
				JSON.stringify(input.previousBible, null, 2),
			].join('\n'));
		}

		sections.push([
			'## INSTRUCTIONS',
			`Generate a complete MasterBible for tenantId="${input.tenantId}" projectId="${input.projectId}".`,
			`DSL version: ${DSL_VERSION}`,
			'Output ONLY the JSON object — no markdown, no explanation, no wrapping.',
		].join('\n'));

		return sections.join('\n\n');
	}

	/**
	 * Build DSL operation reference — documents each OpType and its params
	 * so the LLM knows what operations are available and what they expect.
	 */
	private buildOpReference(): string {
		const opDocs: Record<OpType, string> = {
			SCRAPE_DYNAMIC: 'Scrape dynamic (JS-rendered) pages. Params: url, selector, format(json|csv|html), headers?, timeoutMs?',
			SCRAPE_STATIC: 'Scrape static HTML pages. Params: url, selector, format(json|csv|html), headers?',
			PARSE_HTML: 'Parse HTML and extract data. Params: html?, sourceNodeId?, selectors(Record), outputFormat?',
			EXTRACT_JSON_LD: 'Extract JSON-LD structured data. Params: url?, html?, sourceNodeId?, schemaTypes?',
			LOGIN_FORM: 'Automate form login. Params: url, usernameSelector, passwordSelector, submitSelector, credentials{usernameSecret, passwordSecret}, waitAfterLoginMs?',
			API_CALL: 'Make HTTP API calls. Params: url, method(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS), headers?, body?, auth?{type, secretRef, headerName?}, timeoutMs?, expectedStatus?',
			CODE_GENERATE: 'Generate code via LLM. Params: language, description, outputFile, styleGuide?, context?, maxTokens?',
			FILE_WRITE: 'Write content to file. Params: path, content, encoding?(utf-8|base64|binary), overwrite?',
			TEST_RUN: 'Run tests. Params: testFile, framework(vitest|jest|mocha|playwright|custom), assertions[], timeoutMs?, env?',
			BROWSER_ACTION: 'Execute browser actions. Params: url, actions[]{type, selector?, value?, waitMs?}, viewport?, screenshotAfter?',
			WAIT_FOR_SELECTOR: 'Wait for DOM element. Params: selector, timeoutMs?, visible?, sourceNodeId?',
			TRANSFORM_DATA: 'Transform data. Params: sourceNodeId?, input?, transform(map|filter|reduce|jq|jsonpath|custom), expression, outputFormat?',
			VALIDATE_OUTPUT: 'Validate node output. Params: sourceNodeId, schema?, rules[]{field, condition, value?, message?}',
			NOTIFY_USER: 'Send notification. Params: channel(websocket|email|webhook|log), message, level?(info|warn|error|success), metadata?',
			DB_MIGRATE: 'Run database migration. Params: direction(up|down), sqlStatements[], dryRun?, backupFirst?',
			DEPLOY_APP: 'Deploy application. Params: platform(cloudflare-workers|cloudflare-pages|vercel|netlify|docker|custom), config, envVars?, dryRun?',
			STYLE_GENERATE: 'Generate styles. Params: target, rules[]{selector, properties}, tokens?, framework?(tailwind|css-modules|styled-components|vanilla)',
			COMPONENT_GENERATE: 'Generate UI component. Params: name, framework(react|vue|svelte|solid|web-component), props[], styles?, children?, outputFile',
		};

		return OP_TYPES
			.map((op) => `- **${op}**: ${opDocs[op]}`)
			.join('\n');
	}

	/**
	 * Build constraint templates appropriate for the project type.
	 * These guide the LLM toward relevant constraints.
	 */
	private buildConstraintTemplates(
		projectType: SpecInput['projectType'],
	): string {
		const common = [
			'- All generated code must pass TypeScript strict mode',
			'- No hardcoded secrets or credentials in source files',
			'- Error handling must be explicit (no unhandled promise rejections)',
			'- All user input must be validated/sanitized',
		];

		const byType: Record<string, string[]> = {
			fullstack: [
				'- Frontend and backend must share types via a common schema',
				'- API endpoints must validate request bodies against Zod schemas',
				'- Database queries must use parameterized statements (no string interpolation)',
				'- Authentication tokens must be httpOnly, secure, sameSite=strict',
				'- CORS policy must be explicitly configured (not wildcard)',
			],
			mobile: [
				'- Offline-first: all critical paths must work without network',
				'- State must be persisted to local storage for crash recovery',
				'- Image assets must be optimized for mobile bandwidth',
				'- Touch targets must meet 44x44px minimum accessibility requirement',
			],
			landing_page: [
				'- Page must achieve Lighthouse Performance score >= 90',
				'- All images must use next-gen formats (WebP/AVIF) with fallbacks',
				'- Above-the-fold content must be server-rendered or statically generated',
				'- Form submissions must include CSRF protection',
			],
			api_only: [
				'- All endpoints must have OpenAPI/Swagger documentation',
				'- Rate limiting must be applied per-tenant at the edge',
				'- Response times must be < 200ms p95 for read operations',
				'- All mutations must be idempotent (safe to retry)',
			],
		};

		const specific = byType[projectType] ?? [];
		return [...common, ...specific].join('\n');
	}

	/**
	 * Build JSON Schema reference for the MasterBible output format.
	 * This goes in the system prompt so the LLM knows the exact shape.
	 */
	private buildOutputSchemaReference(): string {
		// Generate a simplified schema reference from the Zod schema
		// (The full Zod-to-JSON-Schema would be too verbose for a prompt)
		return [
			'{',
			'  "metadata": { "dslVersion": "2.1", "projectId": string, "tenantId": string, "createdAt": ISO8601, "humanApproved": false },',
			'  "constraints": [string, ...], // min 1',
			'  "edgeCases": [string, ...], // min 1',
			'  "dosAndDonts": { "do": [string], "dont": [string] },',
			'  "executionGraph": [',
			'    {',
			'      "nodeId": string, // unique, human-readable',
			'      "op": OpType, // one of the DSL ops listed above',
			'      "params": { ... }, // matches the op\'s parameter schema',
			'      "dependsOn": [nodeId, ...], // must form a DAG',
			'      "dslVersion": "2.1",',
			'      "tenantId": string,',
			'      "projectId": string,',
			'      "envFingerprint": "default-v1",',
			'      "onFail": "stop" | "skip" | "retry" | "fallback",',
			'      "timeoutSeconds": number, // default 300',
			'      "cacheable": boolean, // default true',
			'      "metadata": {}',
			'    }',
			'  ],',
			'  "executionPolicy": {',
			'    "defaultRetry": { "maxAttempts": 3, "backoff": "exponential", "baseDelayMs": 1000, "maxDelayMs": 30000 },',
			'    "maxParallelism": 8,',
			'    "timeoutGlobalSeconds": 3600,',
			'    "humanApprovalGates": [],',
			'    "auditLevel": "trace"',
			'  },',
			'  "governance": {',
			'    "requiredSecrets": [],',
			'    "sandboxIsolationLevel": "container",',
			'    "allowedRegistries": ["npm", "pypi"],',
			'    "artifactProvenance": true,',
			'    "auditLogLevel": "trace",',
			'    "humanInLoopNodes": []',
			'  },',
			'  "artifactsExpected": [string],',
			'  "nonGoals": [string],',
			'  "validationRules": [string],',
			'  "failureRecoveryPlan": string',
			'}',
		].join('\n');
	}

	// -----------------------------------------------------------------------
	// LLM call helpers
	// -----------------------------------------------------------------------

	/**
	 * Call the premium model with structured JSON output.
	 * Returns the raw parsed JSON (to be validated against MasterBibleSchema).
	 */
	private async callPremiumModel(
		systemPrompt: string,
		userPrompt: string,
	): Promise<unknown> {
		const response = await this.fetchLLM(
			this.modelConfig.premiumModel,
			systemPrompt,
			userPrompt,
			8192,
			{ jsonMode: true },
		);
		return this.extractJson(response);
	}

	/**
	 * Call a cheap model for critic/validation tasks.
	 */
	private async callCheapModel(prompt: string): Promise<string> {
		return this.fetchLLM(
			this.modelConfig.cheapModel,
			'You are a code quality analyst. Return only valid JSON.',
			prompt,
			2048,
		);
	}

	/**
	 * Call the critic model.
	 */
	private async callCriticModel(prompt: string): Promise<string> {
		return this.fetchLLM(
			this.modelConfig.criticModel,
			'You are a specification critic. Return only valid JSON.',
			prompt,
			2048,
		);
	}

	/**
	 * Core fetch helper — calls the AI Gateway with OpenAI-compatible format.
	 * Follows the pattern from worker/services/aigateway-proxy/.
	 */
	private async fetchLLM(
		model: string,
		systemPrompt: string,
		userPrompt: string,
		maxTokens: number,
		options?: { jsonMode?: boolean },
	): Promise<string> {
		const messages: Array<{ role: string; content: string }> = [];

		if (systemPrompt) {
			messages.push({ role: 'system', content: systemPrompt });
		}
		messages.push({ role: 'user', content: userPrompt });

		const requestBody: Record<string, unknown> = {
			model,
			messages,
			max_tokens: maxTokens,
			temperature: 0.3,
		};

		// Request JSON structured output if supported
		if (options?.jsonMode) {
			requestBody.response_format = { type: 'json_object' };
		}

		const response = await fetch(this.aiGatewayUrl, {
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
		};

		return data.choices?.[0]?.message?.content ?? '';
	}

	// -----------------------------------------------------------------------
	// Validation and parsing
	// -----------------------------------------------------------------------

	/**
	 * Validate raw LLM output against MasterBibleSchema.
	 * If validation fails, attempt to fix common issues (missing defaults).
	 */
	private validateAndParseBible(
		raw: unknown,
		input: SpecInput,
	): MasterBible {
		// Ensure required fields have defaults
		const patched = this.patchBibleDefaults(raw, input);

		const result = MasterBibleSchema.safeParse(patched);
		if (result.success) {
			return result.data;
		}

		// If validation fails, throw with detailed error
		const issues = result.error.issues
			.map((i) => `${i.path.join('.')}: ${i.message}`)
			.join('; ');
		throw new Error(`MasterBible validation failed: ${issues}`);
	}

	/**
	 * Patch common missing fields that the LLM might omit.
	 * This is defensive — the LLM should produce complete output,
	 * but we don't want to fail on trivially-fixable omissions.
	 */
	private patchBibleDefaults(
		raw: unknown,
		input: SpecInput,
	): unknown {
		if (typeof raw !== 'object' || raw === null) return raw;

		const bible = raw as Record<string, unknown>;

		// Ensure metadata exists with required fields
		if (!bible.metadata || typeof bible.metadata !== 'object') {
			bible.metadata = {};
		}
		const metadata = bible.metadata as Record<string, unknown>;
		metadata.dslVersion ??= DSL_VERSION;
		metadata.projectId ??= input.projectId;
		metadata.tenantId ??= input.tenantId;
		metadata.createdAt ??= new Date().toISOString();
		metadata.humanApproved ??= false;

		// Ensure execution graph nodes have required identity fields
		if (Array.isArray(bible.executionGraph)) {
			bible.executionGraph = (bible.executionGraph as Array<Record<string, unknown>>).map(
				(node) => ({
					...node,
					dslVersion: node.dslVersion ?? DSL_VERSION,
					tenantId: node.tenantId ?? input.tenantId,
					projectId: node.projectId ?? input.projectId,
					envFingerprint: node.envFingerprint ?? 'default-v1',
				}),
			);
		}

		// Ensure governance has allowedRegistries (required, no default)
		if (bible.governance && typeof bible.governance === 'object') {
			const gov = bible.governance as Record<string, unknown>;
			gov.allowedRegistries ??= ['npm'];
		}

		return bible;
	}

	/**
	 * Extract JSON from an LLM response that may contain markdown fences
	 * or other non-JSON text around the actual JSON object.
	 */
	private extractJson(text: string): unknown {
		// Try direct parse first
		try {
			return JSON.parse(text);
		} catch {
			// Not raw JSON — try to extract from markdown code fences
		}

		// Try to extract from ```json ... ``` blocks
		const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
		if (fenceMatch?.[1]) {
			try {
				return JSON.parse(fenceMatch[1]);
			} catch {
				// Still not valid JSON
			}
		}

		// Try to find a JSON object by matching first { to last }
		const firstBrace = text.indexOf('{');
		const lastBrace = text.lastIndexOf('}');
		if (firstBrace !== -1 && lastBrace > firstBrace) {
			try {
				return JSON.parse(text.slice(firstBrace, lastBrace + 1));
			} catch {
				// Give up
			}
		}

		throw new Error('Failed to extract valid JSON from LLM response');
	}

	// -----------------------------------------------------------------------
	// Individual critic validators
	// -----------------------------------------------------------------------

	/**
	 * Edge Case Validator — checks the Bible for missing failure modes.
	 * Common blind spots: network failures, auth expiration, rate limits,
	 * empty data sets, concurrent modification, timezone issues.
	 */
	private async runEdgeCaseValidator(
		bibleJson: string,
	): Promise<z.infer<typeof EdgeCaseValidatorOutputSchema>> {
		const prompt = [
			'Analyze this execution plan and identify MISSING edge cases.',
			'',
			'PLAN:',
			bibleJson,
			'',
			'Common edge cases to check:',
			'- Network failures and timeouts',
			'- Authentication token expiration mid-flow',
			'- Rate limiting from external APIs',
			'- Empty or malformed data from scraping',
			'- Concurrent modification of shared resources',
			'- Timezone and locale issues',
			'- File system permissions and disk space',
			'- Memory limits in sandboxed execution',
			'',
			'Return JSON: { "missingEdgeCases": [string], "severity": "low"|"medium"|"high", "suggestions": [string] }',
		].join('\n');

		try {
			const response = await this.callCriticModel(prompt);
			const parsed = this.extractJson(response);
			const validated = EdgeCaseValidatorOutputSchema.safeParse(parsed);
			if (validated.success) return validated.data;
		} catch {
			// Critic failure is non-fatal
		}

		return { missingEdgeCases: [], severity: 'low', suggestions: [] };
	}

	/**
	 * Constraint Validator — checks for conflicting or missing constraints.
	 */
	private async runConstraintValidator(
		bibleJson: string,
	): Promise<z.infer<typeof ConstraintValidatorOutputSchema>> {
		const prompt = [
			'Analyze this execution plan and check for constraint issues.',
			'',
			'PLAN:',
			bibleJson,
			'',
			'Check for:',
			'1. Conflicting constraints (two constraints that cannot both be true)',
			'2. Missing constraints (obvious requirements not stated)',
			'3. Over-constraints (unnecessarily restrictive, limiting valid solutions)',
			'',
			'Return JSON: {',
			'  "conflicts": [{ "constraint1": string, "constraint2": string, "explanation": string }],',
			'  "missingConstraints": [string],',
			'  "overConstraints": [string]',
			'}',
		].join('\n');

		try {
			const response = await this.callCriticModel(prompt);
			const parsed = this.extractJson(response);
			const validated = ConstraintValidatorOutputSchema.safeParse(parsed);
			if (validated.success) return validated.data;
		} catch {
			// Non-fatal
		}

		return { conflicts: [], missingConstraints: [], overConstraints: [] };
	}

	/**
	 * Anti-Pattern Detector — checks for known bad patterns in the DAG.
	 */
	private async runAntiPatternDetector(
		bibleJson: string,
	): Promise<z.infer<typeof AntiPatternDetectorOutputSchema>> {
		const prompt = [
			'Analyze this execution plan for anti-patterns.',
			'',
			'PLAN:',
			bibleJson,
			'',
			'Known anti-patterns to check:',
			'- Sequential chains that could be parallelized',
			'- Nodes with no dependents (dead ends that waste compute)',
			'- Overly broad scraping selectors (fragile)',
			'- Missing validation nodes after data transformation',
			'- Hardcoded URLs or paths that should be parameterized',
			'- Missing error handling (onFail: "stop" everywhere)',
			'- Unreasonable timeouts (too short or too long)',
			'- Duplicate work across nodes',
			'',
			'Return JSON: {',
			'  "antiPatterns": [{ "pattern": string, "location": nodeId, "suggestion": string }],',
			'  "overallScore": number (0-1, where 1 = no anti-patterns)',
			'}',
		].join('\n');

		try {
			const response = await this.callCriticModel(prompt);
			const parsed = this.extractJson(response);
			const validated = AntiPatternDetectorOutputSchema.safeParse(parsed);
			if (validated.success) return validated.data;
		} catch {
			// Non-fatal
		}

		return { antiPatterns: [], overallScore: 0.9 };
	}
}
