/**
 * SDAE Dynamic Form Engine
 *
 * Phase 0 of the SDAE pipeline — this happens BEFORE the expensive LLM call.
 * The Form Engine converts a vague 1-sentence prompt into a structured
 * requirement-gathering form, which then feeds into the SpecGenerator.
 *
 * Why this exists:
 * Users type "build me an e-commerce store" and expect the system to
 * know exactly what they mean. Without structured requirements, the
 * SpecGenerator hallucinates assumptions. The Form Engine eliminates
 * guesswork by asking exactly the right questions.
 *
 * Architecture:
 * 1. classifyIntent() — tiny model determines project type + complexity
 * 2. matchTemplate() — if a golden template matches, skip LLM entirely (zero cost)
 * 3. generateForm() — cheap model produces a JSON Schema form tailored to the intent
 * 4. updateFormFromChat() — real-time Chat↔Form Bridge for frictionless input
 *
 * Cost model: 1 tiny call (~$0.001) + 1 cheap call (~$0.003) = ~$0.004 total.
 * Template match path: $0 (pure logic, no LLM).
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface IntentClassification {
	projectType: string;
	complexity: 'simple' | 'medium' | 'complex';
	domain: string;
	confidence: number;
	/** Template ID if a golden template matched, null otherwise. */
	templateMatch: string | null;
	/** Named entities extracted from the prompt (e.g. "product" → "shoes"). */
	extractedEntities: Record<string, string>;
}

/** JSON Schema-based dynamic form for requirement gathering. */
export interface DynamicForm {
	id: string;
	title: string;
	description: string;
	sections: FormSection[];
	prefilledValues: Record<string, unknown>;
	requiredFields: string[];
	/** JSON Schema representation for programmatic validation. */
	schema: Record<string, unknown>;
}

export interface FormSection {
	id: string;
	title: string;
	description: string;
	fields: FormField[];
	/** Show this section only if condition is met (field ID reference). */
	condition?: string;
}

export interface FormField {
	id: string;
	type: 'text' | 'textarea' | 'select' | 'multiselect' | 'toggle' | 'number' | 'url' | 'code';
	label: string;
	description?: string;
	placeholder?: string;
	required: boolean;
	defaultValue?: unknown;
	/** For select/multiselect field types. */
	options?: Array<{ value: string; label: string }>;
	/** Validation rules (JSON Schema subset). */
	validation?: Record<string, unknown>;
}

export interface FormUpdate {
	updatedFields: Record<string, unknown>;
	newSections?: FormSection[];
	removedFields?: string[];
	suggestions: string[];
}

export interface FormTemplate {
	id: string;
	name: string;
	form: DynamicForm;
	defaultConstraints: string[];
	defaultEdgeCases: string[];
}

// ---------------------------------------------------------------------------
// Internal Zod schemas for structured LLM outputs
// ---------------------------------------------------------------------------

const IntentOutputSchema = z.object({
	projectType: z.string(),
	complexity: z.enum(['simple', 'medium', 'complex']),
	domain: z.string(),
	confidence: z.number().min(0).max(1),
	extractedEntities: z.record(z.string()),
});

const FormOutputSchema = z.object({
	title: z.string(),
	description: z.string(),
	sections: z.array(z.object({
		id: z.string(),
		title: z.string(),
		description: z.string(),
		fields: z.array(z.object({
			id: z.string(),
			type: z.enum(['text', 'textarea', 'select', 'multiselect', 'toggle', 'number', 'url', 'code']),
			label: z.string(),
			description: z.string().optional(),
			placeholder: z.string().optional(),
			required: z.boolean(),
			defaultValue: z.unknown().optional(),
			options: z.array(z.object({
				value: z.string(),
				label: z.string(),
			})).optional(),
		})),
		condition: z.string().optional(),
	})),
});

const ChatUpdateOutputSchema = z.object({
	updatedFields: z.record(z.unknown()),
	suggestions: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// FormEngine
// ---------------------------------------------------------------------------

export class FormEngine {
	constructor(
		private aiGatewayUrl: string,
		private cheapModel: string,
	) {}

	/**
	 * Step 1: Classify intent from a short user prompt.
	 *
	 * Uses a tiny model call to determine project type, complexity,
	 * domain, and whether a template match exists. This classification
	 * drives everything downstream — form generation, constraint
	 * defaults, and cost estimation.
	 */
	async classifyIntent(prompt: string): Promise<IntentClassification> {
		// First, try keyword-based classification (zero LLM cost)
		const keywordResult = this.keywordClassify(prompt);
		if (keywordResult && keywordResult.confidence >= 0.85) {
			// High-confidence keyword match — check for template
			const templateMatch = this.matchTemplate(keywordResult);
			return {
				...keywordResult,
				templateMatch: templateMatch?.id ?? null,
			};
		}

		// Fall back to LLM classification for ambiguous prompts
		const classificationPrompt = [
			'Classify this user request for a code generation platform.',
			'',
			`USER PROMPT: "${prompt}"`,
			'',
			'Determine:',
			'- projectType: one of [fullstack, mobile, landing_page, api_only, scraper, dashboard, ecommerce, chat_app, blog, portfolio]',
			'- complexity: simple (1-3 pages/endpoints), medium (4-10), complex (10+)',
			'- domain: the business domain (e.g. finance, health, education, ecommerce, social, general)',
			'- confidence: how confident you are in this classification (0-1)',
			'- extractedEntities: key entities mentioned (e.g. {"product": "shoes", "audience": "teens"})',
			'',
			'Return ONLY valid JSON matching: { "projectType": string, "complexity": string, "domain": string, "confidence": number, "extractedEntities": {} }',
		].join('\n');

		try {
			const response = await this.fetchLLM(classificationPrompt, 512);
			const parsed = this.extractJson(response);
			const validated = IntentOutputSchema.safeParse(parsed);

			if (validated.success) {
				const result = validated.data;
				const templateMatch = this.matchTemplate(result);
				return {
					...result,
					templateMatch: templateMatch?.id ?? null,
				};
			}
		} catch {
			// LLM failure — fall back to keyword result or defaults
		}

		// Fallback: use keyword result or generic defaults
		const fallback = keywordResult ?? {
			projectType: 'fullstack',
			complexity: 'medium' as const,
			domain: 'general',
			confidence: 0.3,
			extractedEntities: {},
		};

		return {
			...fallback,
			templateMatch: this.matchTemplate(fallback)?.id ?? null,
		};
	}

	/**
	 * Step 2: Generate a dynamic JSON Schema form tailored to the intent.
	 *
	 * If a template matched in classifyIntent(), returns the template form
	 * directly (zero LLM cost). Otherwise, uses a cheap model to generate
	 * a custom form with sections for: core requirements, technical
	 * constraints, edge cases, design preferences, and integrations.
	 */
	async generateForm(
		intent: IntentClassification,
		prompt: string,
	): Promise<DynamicForm> {
		// Zero-cost path: use template if available
		if (intent.templateMatch) {
			const template = BUILT_IN_TEMPLATES.find(
				(t) => t.id === intent.templateMatch,
			);
			if (template) {
				// Pre-fill with extracted entities
				const prefilledValues: Record<string, unknown> = {};
				for (const [key, value] of Object.entries(intent.extractedEntities)) {
					prefilledValues[key] = value;
				}
				return {
					...template.form,
					prefilledValues: {
						...template.form.prefilledValues,
						...prefilledValues,
					},
				};
			}
		}

		// LLM-generated form for non-template cases
		const formPrompt = [
			'Generate a structured requirements form for a code generation platform.',
			'',
			`USER REQUEST: "${prompt}"`,
			`PROJECT TYPE: ${intent.projectType}`,
			`COMPLEXITY: ${intent.complexity}`,
			`DOMAIN: ${intent.domain}`,
			`EXTRACTED ENTITIES: ${JSON.stringify(intent.extractedEntities)}`,
			'',
			'Generate a form with these sections:',
			'1. Core Requirements — what the app must do (auto-detect from prompt)',
			'2. Technical Stack — language, framework, hosting preferences',
			'3. Design & UX — styling, branding, responsive requirements',
			'4. Edge Cases — special handling, error states, boundary conditions',
			'5. Integrations — third-party services, APIs, databases',
			'',
			'Each field must have: id, type (text|textarea|select|multiselect|toggle|number|url|code),',
			'label, description, required, and options (for select/multiselect).',
			'',
			'Pre-fill values you can confidently infer from the prompt.',
			'Mark truly required fields (max 5) and leave the rest optional.',
			'',
			'Return ONLY valid JSON: { "title": string, "description": string, "sections": [...] }',
		].join('\n');

		try {
			const response = await this.fetchLLM(formPrompt, 4096);
			const parsed = this.extractJson(response);
			const validated = FormOutputSchema.safeParse(parsed);

			if (validated.success) {
				return this.buildDynamicForm(validated.data, intent);
			}
		} catch {
			// LLM failure — return a generic form
		}

		// Fallback: return a generic form for the project type
		return this.buildGenericForm(intent);
	}

	/**
	 * Step 3: Chat↔Form Bridge — update the form in real-time from chat.
	 *
	 * The user types casually ("oh and I need Stripe payments") and the
	 * system updates the structured form in real-time. This eliminates
	 * the friction of filling out forms while maintaining structure.
	 */
	async updateFormFromChat(
		currentForm: DynamicForm,
		message: string,
	): Promise<FormUpdate> {
		const updatePrompt = [
			'A user is providing additional requirements via chat.',
			'Update the structured form based on their message.',
			'',
			`USER MESSAGE: "${message}"`,
			'',
			'CURRENT FORM:',
			JSON.stringify(currentForm, null, 2),
			'',
			'Determine:',
			'- updatedFields: field IDs and their new values based on the message',
			'- suggestions: follow-up questions to clarify ambiguities (max 3)',
			'',
			'Only update fields that the message clearly addresses.',
			'Do NOT change fields the user didn\'t mention.',
			'',
			'Return ONLY valid JSON: { "updatedFields": {}, "suggestions": [] }',
		].join('\n');

		try {
			const response = await this.fetchLLM(updatePrompt, 1024);
			const parsed = this.extractJson(response);
			const validated = ChatUpdateOutputSchema.safeParse(parsed);

			if (validated.success) {
				return {
					updatedFields: validated.data.updatedFields,
					suggestions: validated.data.suggestions,
				};
			}
		} catch {
			// Non-fatal — return no updates
		}

		return { updatedFields: {}, suggestions: [] };
	}

	/**
	 * Template matching — check if the intent matches a built-in template.
	 * Templates provide pre-built forms with sensible defaults, eliminating
	 * the need for an LLM call entirely.
	 */
	matchTemplate(intent: Pick<IntentClassification, 'projectType' | 'domain' | 'complexity'>): FormTemplate | null {
		// Direct project type match
		const directMatch = BUILT_IN_TEMPLATES.find(
			(t) => t.id === intent.projectType,
		);
		if (directMatch) return directMatch;

		// Domain-based matching
		const domainMap: Record<string, string> = {
			ecommerce: 'ecommerce',
			'e-commerce': 'ecommerce',
			shopping: 'ecommerce',
			store: 'ecommerce',
			blog: 'blog',
			cms: 'blog',
			dashboard: 'dashboard',
			admin: 'dashboard',
			analytics: 'dashboard',
			chat: 'chat_app',
			messaging: 'chat_app',
			realtime: 'chat_app',
			landing: 'landing_page',
			marketing: 'landing_page',
			portfolio: 'landing_page',
			api: 'api_only',
			backend: 'api_only',
			microservice: 'api_only',
		};

		const templateId = domainMap[intent.domain.toLowerCase()];
		if (templateId) {
			return BUILT_IN_TEMPLATES.find((t) => t.id === templateId) ?? null;
		}

		return null;
	}

	// -----------------------------------------------------------------------
	// Keyword-based classification (zero LLM cost)
	// -----------------------------------------------------------------------

	private keywordClassify(
		prompt: string,
	): Omit<IntentClassification, 'templateMatch'> | null {
		const lower = prompt.toLowerCase();
		const entities: Record<string, string> = {};

		// Project type detection by keywords
		type ProjectMatch = {
			type: string;
			domain: string;
			keywords: string[];
		};

		const matchers: ProjectMatch[] = [
			{
				type: 'ecommerce',
				domain: 'ecommerce',
				keywords: ['ecommerce', 'e-commerce', 'online store', 'shop', 'cart', 'checkout', 'product catalog', 'storefront'],
			},
			{
				type: 'dashboard',
				domain: 'analytics',
				keywords: ['dashboard', 'admin panel', 'admin interface', 'analytics', 'monitoring', 'metrics'],
			},
			{
				type: 'landing_page',
				domain: 'marketing',
				keywords: ['landing page', 'marketing page', 'homepage', 'portfolio', 'brochure'],
			},
			{
				type: 'blog',
				domain: 'content',
				keywords: ['blog', 'cms', 'content management', 'articles', 'posts'],
			},
			{
				type: 'api_only',
				domain: 'backend',
				keywords: ['api', 'rest api', 'graphql', 'backend', 'microservice', 'webhook'],
			},
			{
				type: 'chat_app',
				domain: 'social',
				keywords: ['chat', 'messaging', 'real-time', 'realtime', 'websocket', 'collaboration'],
			},
			{
				type: 'mobile',
				domain: 'mobile',
				keywords: ['mobile app', 'ios', 'android', 'react native', 'flutter'],
			},
		];

		let bestMatch: ProjectMatch | null = null;
		let bestScore = 0;

		for (const matcher of matchers) {
			let score = 0;
			for (const kw of matcher.keywords) {
				if (lower.includes(kw)) {
					score += kw.split(' ').length; // Multi-word matches score higher
				}
			}
			if (score > bestScore) {
				bestScore = score;
				bestMatch = matcher;
			}
		}

		if (!bestMatch || bestScore === 0) {
			return null;
		}

		// Complexity estimation by word count and modifier keywords
		const wordCount = prompt.split(/\s+/).length;
		const complexityKeywords = {
			simple: ['simple', 'basic', 'minimal', 'quick', 'small'],
			complex: ['complex', 'enterprise', 'full-featured', 'comprehensive', 'advanced', 'scalable'],
		};

		let complexity: 'simple' | 'medium' | 'complex' = 'medium';
		if (complexityKeywords.simple.some((kw) => lower.includes(kw)) || wordCount < 10) {
			complexity = 'simple';
		} else if (complexityKeywords.complex.some((kw) => lower.includes(kw)) || wordCount > 50) {
			complexity = 'complex';
		}

		const confidence = Math.min(0.95, 0.5 + bestScore * 0.15);

		return {
			projectType: bestMatch.type,
			complexity,
			domain: bestMatch.domain,
			confidence,
			extractedEntities: entities,
		};
	}

	// -----------------------------------------------------------------------
	// Form building helpers
	// -----------------------------------------------------------------------

	/**
	 * Build a DynamicForm from validated LLM output + intent metadata.
	 */
	private buildDynamicForm(
		llmOutput: z.infer<typeof FormOutputSchema>,
		intent: IntentClassification,
	): DynamicForm {
		const allFields: FormField[] = [];
		const requiredFields: string[] = [];
		const prefilledValues: Record<string, unknown> = {};

		for (const section of llmOutput.sections) {
			for (const field of section.fields) {
				allFields.push(field);
				if (field.required) {
					requiredFields.push(field.id);
				}
				if (field.defaultValue !== undefined) {
					prefilledValues[field.id] = field.defaultValue;
				}
			}
		}

		// Merge extracted entities as pre-filled values
		for (const [key, value] of Object.entries(intent.extractedEntities)) {
			prefilledValues[key] = value;
		}

		// Build JSON Schema from fields
		const schema = this.buildJsonSchema(allFields, requiredFields);

		return {
			id: `form-${intent.projectType}-${Date.now()}`,
			title: llmOutput.title,
			description: llmOutput.description,
			sections: llmOutput.sections,
			prefilledValues,
			requiredFields,
			schema,
		};
	}

	/**
	 * Build a generic fallback form when LLM fails or isn't needed.
	 */
	private buildGenericForm(intent: IntentClassification): DynamicForm {
		const sections: FormSection[] = [
			{
				id: 'core',
				title: 'Core Requirements',
				description: 'What should your application do?',
				fields: [
					{
						id: 'app_name',
						type: 'text',
						label: 'Application Name',
						placeholder: 'My Awesome App',
						required: true,
					},
					{
						id: 'description',
						type: 'textarea',
						label: 'Detailed Description',
						description: 'Describe your application in detail — features, user flows, expected behavior.',
						placeholder: 'This app should...',
						required: true,
					},
					{
						id: 'target_users',
						type: 'text',
						label: 'Target Users',
						placeholder: 'e.g. Small business owners, students, developers',
						required: false,
					},
				],
			},
			{
				id: 'technical',
				title: 'Technical Stack',
				description: 'Technical preferences and constraints.',
				fields: [
					{
						id: 'framework',
						type: 'select',
						label: 'Frontend Framework',
						required: false,
						defaultValue: 'react',
						options: [
							{ value: 'react', label: 'React' },
							{ value: 'vue', label: 'Vue' },
							{ value: 'svelte', label: 'Svelte' },
							{ value: 'none', label: 'No frontend (API only)' },
						],
					},
					{
						id: 'database',
						type: 'select',
						label: 'Database',
						required: false,
						defaultValue: 'd1',
						options: [
							{ value: 'd1', label: 'Cloudflare D1 (SQLite)' },
							{ value: 'postgres', label: 'PostgreSQL' },
							{ value: 'kv', label: 'Cloudflare KV (Key-Value)' },
							{ value: 'none', label: 'No database' },
						],
					},
					{
						id: 'auth',
						type: 'select',
						label: 'Authentication',
						required: false,
						options: [
							{ value: 'none', label: 'No authentication' },
							{ value: 'email', label: 'Email / Password' },
							{ value: 'oauth', label: 'OAuth (Google, GitHub)' },
							{ value: 'magic_link', label: 'Magic link' },
						],
					},
				],
			},
			{
				id: 'design',
				title: 'Design & UX',
				description: 'Visual and interaction preferences.',
				fields: [
					{
						id: 'style',
						type: 'select',
						label: 'Design Style',
						required: false,
						defaultValue: 'modern',
						options: [
							{ value: 'modern', label: 'Modern / Clean' },
							{ value: 'minimal', label: 'Minimalist' },
							{ value: 'playful', label: 'Playful / Colorful' },
							{ value: 'corporate', label: 'Corporate / Professional' },
						],
					},
					{
						id: 'responsive',
						type: 'toggle',
						label: 'Responsive Design',
						description: 'Should the app work on mobile devices?',
						required: false,
						defaultValue: true,
					},
					{
						id: 'dark_mode',
						type: 'toggle',
						label: 'Dark Mode Support',
						required: false,
						defaultValue: false,
					},
				],
			},
			{
				id: 'integrations',
				title: 'Integrations',
				description: 'Third-party services and APIs.',
				fields: [
					{
						id: 'integrations',
						type: 'multiselect',
						label: 'External Services',
						required: false,
						options: [
							{ value: 'stripe', label: 'Stripe (Payments)' },
							{ value: 'sendgrid', label: 'SendGrid (Email)' },
							{ value: 'cloudflare_r2', label: 'Cloudflare R2 (Storage)' },
							{ value: 'analytics', label: 'Analytics (Plausible/GA)' },
						],
					},
				],
			},
		];

		const allFields = sections.flatMap((s) => s.fields);
		const requiredFields = allFields.filter((f) => f.required).map((f) => f.id);
		const prefilledValues: Record<string, unknown> = {};

		for (const field of allFields) {
			if (field.defaultValue !== undefined) {
				prefilledValues[field.id] = field.defaultValue;
			}
		}

		// Merge extracted entities
		for (const [key, value] of Object.entries(intent.extractedEntities)) {
			prefilledValues[key] = value;
		}

		return {
			id: `form-generic-${Date.now()}`,
			title: `New ${intent.projectType} Project`,
			description: `Configure your ${intent.projectType} application.`,
			sections,
			prefilledValues,
			requiredFields,
			schema: this.buildJsonSchema(allFields, requiredFields),
		};
	}

	/**
	 * Build a JSON Schema object from form fields for programmatic validation.
	 */
	private buildJsonSchema(
		fields: FormField[],
		requiredFields: string[],
	): Record<string, unknown> {
		const properties: Record<string, unknown> = {};

		for (const field of fields) {
			const prop: Record<string, unknown> = {};

			switch (field.type) {
				case 'text':
				case 'textarea':
				case 'url':
				case 'code':
					prop.type = 'string';
					break;
				case 'number':
					prop.type = 'number';
					break;
				case 'toggle':
					prop.type = 'boolean';
					break;
				case 'select':
					prop.type = 'string';
					if (field.options) {
						prop.enum = field.options.map((o) => o.value);
					}
					break;
				case 'multiselect':
					prop.type = 'array';
					prop.items = { type: 'string' };
					if (field.options) {
						(prop.items as Record<string, unknown>).enum = field.options.map((o) => o.value);
					}
					break;
			}

			if (field.description) {
				prop.description = field.description;
			}
			if (field.defaultValue !== undefined) {
				prop.default = field.defaultValue;
			}
			if (field.validation) {
				Object.assign(prop, field.validation);
			}

			properties[field.id] = prop;
		}

		return {
			type: 'object',
			properties,
			required: requiredFields,
		};
	}

	// -----------------------------------------------------------------------
	// LLM call helper
	// -----------------------------------------------------------------------

	private async fetchLLM(prompt: string, maxTokens: number): Promise<string> {
		const response = await fetch(this.aiGatewayUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: this.cheapModel,
				messages: [
					{ role: 'system', content: 'You are a form generation assistant. Return only valid JSON.' },
					{ role: 'user', content: prompt },
				],
				max_tokens: maxTokens,
				temperature: 0.2,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unknown error');
			throw new Error(`LLM call failed (${response.status}): ${errorText}`);
		}

		const data = await response.json() as {
			choices?: Array<{ message?: { content?: string } }>;
		};

		return data.choices?.[0]?.message?.content ?? '';
	}

	/**
	 * Extract JSON from LLM response (handles markdown fences).
	 */
	private extractJson(text: string): unknown {
		try {
			return JSON.parse(text);
		} catch {
			// Try markdown fence extraction
		}

		const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
		if (fenceMatch?.[1]) {
			try {
				return JSON.parse(fenceMatch[1]);
			} catch {
				// Still not valid
			}
		}

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
}

// ---------------------------------------------------------------------------
// Built-in templates
//
// Golden templates for common project types. When a template matches,
// the Form Engine returns it directly — zero LLM cost. Each template
// includes default constraints and edge cases that feed into the
// SpecGenerator's MasterBible.
// ---------------------------------------------------------------------------

const BUILT_IN_TEMPLATES: FormTemplate[] = [
	{
		id: 'ecommerce',
		name: 'E-commerce Store',
		defaultConstraints: [
			'All payment processing must use Stripe Elements (no raw card data handling)',
			'Product prices must be stored as integers (cents) to avoid floating-point issues',
			'Cart state must persist across sessions (server-side or localStorage with sync)',
			'All user input in search and reviews must be sanitized against XSS',
			'Order confirmation emails must be idempotent (safe to retry)',
		],
		defaultEdgeCases: [
			'Product goes out of stock between cart addition and checkout',
			'Payment succeeds but order creation fails (webhook reconciliation needed)',
			'User applies expired or invalid coupon code',
			'Concurrent checkout of the last item in stock',
			'Currency conversion rounding discrepancies',
		],
		form: {
			id: 'form-ecommerce',
			title: 'E-commerce Store',
			description: 'Configure your online store — products, payments, shipping, and more.',
			sections: [
				{
					id: 'products',
					title: 'Products & Catalog',
					description: 'How your products are organized and displayed.',
					fields: [
						{ id: 'product_type', type: 'select', label: 'Product Type', required: true, options: [{ value: 'physical', label: 'Physical goods' }, { value: 'digital', label: 'Digital downloads' }, { value: 'subscription', label: 'Subscriptions' }, { value: 'mixed', label: 'Mixed' }] },
						{ id: 'catalog_size', type: 'select', label: 'Catalog Size', required: false, defaultValue: 'medium', options: [{ value: 'small', label: '1-50 products' }, { value: 'medium', label: '50-500 products' }, { value: 'large', label: '500+ products' }] },
						{ id: 'categories', type: 'toggle', label: 'Product Categories', description: 'Organize products into categories and subcategories', required: false, defaultValue: true },
						{ id: 'search', type: 'toggle', label: 'Product Search', required: false, defaultValue: true },
						{ id: 'filters', type: 'toggle', label: 'Filter & Sort', description: 'Price, rating, category filters', required: false, defaultValue: true },
					],
				},
				{
					id: 'payments',
					title: 'Payments & Checkout',
					description: 'How customers pay for products.',
					fields: [
						{ id: 'payment_provider', type: 'select', label: 'Payment Provider', required: true, defaultValue: 'stripe', options: [{ value: 'stripe', label: 'Stripe' }, { value: 'paypal', label: 'PayPal' }, { value: 'both', label: 'Stripe + PayPal' }] },
						{ id: 'guest_checkout', type: 'toggle', label: 'Guest Checkout', description: 'Allow purchases without account creation', required: false, defaultValue: true },
						{ id: 'coupons', type: 'toggle', label: 'Coupon Codes', required: false, defaultValue: false },
					],
				},
				{
					id: 'user_features',
					title: 'User Features',
					description: 'User accounts and social features.',
					fields: [
						{ id: 'user_accounts', type: 'toggle', label: 'User Accounts', required: false, defaultValue: true },
						{ id: 'reviews', type: 'toggle', label: 'Product Reviews', required: false, defaultValue: false },
						{ id: 'wishlist', type: 'toggle', label: 'Wishlist', required: false, defaultValue: false },
						{ id: 'order_tracking', type: 'toggle', label: 'Order Tracking', required: false, defaultValue: true },
					],
				},
			],
			prefilledValues: { product_type: 'physical', payment_provider: 'stripe' },
			requiredFields: ['product_type', 'payment_provider'],
			schema: {},
		},
	},
	{
		id: 'dashboard',
		name: 'Dashboard / Admin Panel',
		defaultConstraints: [
			'All data tables must support pagination, sorting, and filtering',
			'Role-based access control (RBAC) must be enforced at the API layer',
			'Dashboard queries must have < 500ms p95 latency',
			'Export functionality must handle datasets up to 100k rows without timeout',
			'All state changes must be audit-logged with timestamp and actor',
		],
		defaultEdgeCases: [
			'User with read-only role attempts to modify data',
			'Export request for a very large dataset (timeout handling)',
			'Dashboard loaded with no data (empty state UX)',
			'Concurrent edits to the same record by two admins',
			'Session expires during a multi-step form submission',
		],
		form: {
			id: 'form-dashboard',
			title: 'Dashboard / Admin Panel',
			description: 'Configure your admin dashboard — data views, user management, and analytics.',
			sections: [
				{
					id: 'data',
					title: 'Data & Views',
					description: 'What data does the dashboard display?',
					fields: [
						{ id: 'data_sources', type: 'textarea', label: 'Data Sources', description: 'Describe the data your dashboard will display (users, orders, metrics, etc.)', placeholder: 'e.g. User accounts, order history, revenue metrics...', required: true },
						{ id: 'chart_types', type: 'multiselect', label: 'Visualization Types', required: false, options: [{ value: 'line', label: 'Line charts' }, { value: 'bar', label: 'Bar charts' }, { value: 'pie', label: 'Pie charts' }, { value: 'table', label: 'Data tables' }] },
						{ id: 'realtime', type: 'toggle', label: 'Real-time Updates', description: 'Auto-refresh data via WebSocket', required: false, defaultValue: false },
					],
				},
				{
					id: 'users',
					title: 'User Management',
					description: 'How are users and permissions handled?',
					fields: [
						{ id: 'rbac', type: 'toggle', label: 'Role-Based Access Control', required: false, defaultValue: true },
						{ id: 'roles', type: 'text', label: 'User Roles', placeholder: 'e.g. admin, editor, viewer', required: false, defaultValue: 'admin, editor, viewer' },
						{ id: 'audit_log', type: 'toggle', label: 'Audit Log', description: 'Track all user actions', required: false, defaultValue: true },
					],
				},
				{
					id: 'features',
					title: 'Additional Features',
					description: 'Extra functionality.',
					fields: [
						{ id: 'export', type: 'toggle', label: 'Data Export (CSV/Excel)', required: false, defaultValue: true },
						{ id: 'notifications', type: 'toggle', label: 'Alert Notifications', description: 'Email/webhook alerts for threshold breaches', required: false, defaultValue: false },
						{ id: 'dark_mode', type: 'toggle', label: 'Dark Mode', required: false, defaultValue: true },
					],
				},
			],
			prefilledValues: { rbac: true, export: true },
			requiredFields: ['data_sources'],
			schema: {},
		},
	},
	{
		id: 'landing_page',
		name: 'Landing Page / Marketing Site',
		defaultConstraints: [
			'Lighthouse Performance score must be >= 90',
			'All images must use WebP/AVIF with <img> fallbacks',
			'Above-the-fold content must render in < 1.5s on 3G',
			'All external scripts must be loaded async or deferred',
			'Form submissions must include CSRF and honeypot protection',
		],
		defaultEdgeCases: [
			'User visits with JavaScript disabled (SSR fallback)',
			'Image CDN is down (graceful degradation)',
			'Contact form submission with extremely long input',
			'Mobile viewport with landscape orientation',
			'Screen reader navigation through hero section',
		],
		form: {
			id: 'form-landing',
			title: 'Landing Page',
			description: 'Configure your landing page — hero, features, CTA, and more.',
			sections: [
				{
					id: 'content',
					title: 'Page Content',
					description: 'What sections should your landing page include?',
					fields: [
						{ id: 'business_name', type: 'text', label: 'Business / Product Name', required: true },
						{ id: 'tagline', type: 'text', label: 'Tagline', placeholder: 'Your one-line value proposition', required: false },
						{ id: 'sections', type: 'multiselect', label: 'Page Sections', required: true, defaultValue: ['hero', 'features', 'cta'], options: [{ value: 'hero', label: 'Hero / Header' }, { value: 'features', label: 'Features Grid' }, { value: 'testimonials', label: 'Testimonials' }, { value: 'pricing', label: 'Pricing Table' }, { value: 'faq', label: 'FAQ' }, { value: 'cta', label: 'Call to Action' }, { value: 'contact', label: 'Contact Form' }] },
					],
				},
				{
					id: 'style',
					title: 'Design',
					description: 'Visual style preferences.',
					fields: [
						{ id: 'color_scheme', type: 'select', label: 'Color Scheme', required: false, defaultValue: 'modern_blue', options: [{ value: 'modern_blue', label: 'Modern Blue' }, { value: 'dark', label: 'Dark / Night' }, { value: 'warm', label: 'Warm / Earthy' }, { value: 'vibrant', label: 'Vibrant / Colorful' }] },
						{ id: 'animations', type: 'toggle', label: 'Scroll Animations', required: false, defaultValue: true },
					],
				},
			],
			prefilledValues: { sections: ['hero', 'features', 'cta'] },
			requiredFields: ['business_name', 'sections'],
			schema: {},
		},
	},
	{
		id: 'blog',
		name: 'Blog / CMS',
		defaultConstraints: [
			'All pages must be statically generated or ISR (< 200ms TTFB)',
			'Markdown content must be sanitized before rendering (no script injection)',
			'RSS feed must be auto-generated and W3C-valid',
			'Image uploads must be resized and converted to WebP',
			'SEO metadata (title, description, og:image) must be set for every post',
		],
		defaultEdgeCases: [
			'Post with very long content (> 10k words) causing layout issues',
			'Concurrent edits to the same post by two authors',
			'Image upload of unsupported format or oversized file',
			'Draft post accidentally published via API race condition',
			'Search query returns zero results (empty state)',
		],
		form: {
			id: 'form-blog',
			title: 'Blog / CMS',
			description: 'Configure your blog or content management system.',
			sections: [
				{
					id: 'content',
					title: 'Content Model',
					description: 'How is your content structured?',
					fields: [
						{ id: 'content_types', type: 'multiselect', label: 'Content Types', required: true, defaultValue: ['post'], options: [{ value: 'post', label: 'Blog Posts' }, { value: 'page', label: 'Static Pages' }, { value: 'project', label: 'Projects / Portfolio' }, { value: 'tutorial', label: 'Tutorials / Guides' }] },
						{ id: 'editor', type: 'select', label: 'Editor Type', required: false, defaultValue: 'markdown', options: [{ value: 'markdown', label: 'Markdown' }, { value: 'rich_text', label: 'Rich Text (WYSIWYG)' }, { value: 'block', label: 'Block Editor (Notion-style)' }] },
						{ id: 'categories_tags', type: 'toggle', label: 'Categories & Tags', required: false, defaultValue: true },
					],
				},
				{
					id: 'features',
					title: 'Features',
					description: 'Additional blog features.',
					fields: [
						{ id: 'comments', type: 'toggle', label: 'Comments', required: false, defaultValue: false },
						{ id: 'search', type: 'toggle', label: 'Full-text Search', required: false, defaultValue: true },
						{ id: 'rss', type: 'toggle', label: 'RSS Feed', required: false, defaultValue: true },
						{ id: 'newsletter', type: 'toggle', label: 'Email Newsletter', required: false, defaultValue: false },
					],
				},
			],
			prefilledValues: { content_types: ['post'], editor: 'markdown' },
			requiredFields: ['content_types'],
			schema: {},
		},
	},
	{
		id: 'api_only',
		name: 'API-only Backend',
		defaultConstraints: [
			'All endpoints must validate request bodies against Zod schemas',
			'Response times must be < 200ms p95 for read operations',
			'All mutations must be idempotent (safe to retry with same parameters)',
			'Rate limiting must be enforced per-tenant at the edge',
			'API versioning must use URL prefix (e.g. /v1/) not headers',
		],
		defaultEdgeCases: [
			'Request body exceeds configured max size',
			'Database connection pool exhausted under load',
			'API key used after revocation (propagation delay)',
			'Partial failure in a batch operation',
			'Timezone mismatch between client and server date handling',
		],
		form: {
			id: 'form-api',
			title: 'API-only Backend',
			description: 'Configure your API — endpoints, auth, and data model.',
			sections: [
				{
					id: 'api',
					title: 'API Design',
					description: 'Core API configuration.',
					fields: [
						{ id: 'api_description', type: 'textarea', label: 'API Description', description: 'Describe the resources and operations your API should expose.', placeholder: 'e.g. CRUD for users, products, and orders with search and filtering...', required: true },
						{ id: 'api_style', type: 'select', label: 'API Style', required: false, defaultValue: 'rest', options: [{ value: 'rest', label: 'REST' }, { value: 'graphql', label: 'GraphQL' }, { value: 'trpc', label: 'tRPC' }] },
						{ id: 'auth_method', type: 'select', label: 'Authentication', required: false, defaultValue: 'jwt', options: [{ value: 'api_key', label: 'API Key' }, { value: 'jwt', label: 'JWT' }, { value: 'oauth2', label: 'OAuth 2.0' }, { value: 'none', label: 'None (public)' }] },
					],
				},
				{
					id: 'data',
					title: 'Data & Storage',
					description: 'Database and storage configuration.',
					fields: [
						{ id: 'database', type: 'select', label: 'Database', required: false, defaultValue: 'd1', options: [{ value: 'd1', label: 'Cloudflare D1' }, { value: 'postgres', label: 'PostgreSQL' }, { value: 'mongodb', label: 'MongoDB' }] },
						{ id: 'cache', type: 'toggle', label: 'Response Caching', required: false, defaultValue: true },
						{ id: 'file_storage', type: 'toggle', label: 'File Upload Support', required: false, defaultValue: false },
					],
				},
				{
					id: 'ops',
					title: 'Operations',
					description: 'Operational features.',
					fields: [
						{ id: 'rate_limiting', type: 'toggle', label: 'Rate Limiting', required: false, defaultValue: true },
						{ id: 'openapi', type: 'toggle', label: 'OpenAPI / Swagger Docs', required: false, defaultValue: true },
						{ id: 'webhooks', type: 'toggle', label: 'Webhook Support', required: false, defaultValue: false },
					],
				},
			],
			prefilledValues: { api_style: 'rest', auth_method: 'jwt', database: 'd1' },
			requiredFields: ['api_description'],
			schema: {},
		},
	},
	{
		id: 'chat_app',
		name: 'Real-time Chat App',
		defaultConstraints: [
			'Messages must be delivered in order within a conversation (causal ordering)',
			'WebSocket connections must reconnect automatically with exponential backoff',
			'Message history must be paginated (max 50 messages per request)',
			'All messages must be stored server-side (no client-only state)',
			'User presence (online/offline/typing) must update within 2 seconds',
		],
		defaultEdgeCases: [
			'User sends a message while offline (queue and sync on reconnect)',
			'WebSocket disconnects during a message send (deduplication needed)',
			'User joins a room with 10k+ message history (pagination required)',
			'Two users send the same message simultaneously (ordering)',
			'File upload fails midway through (partial upload cleanup)',
		],
		form: {
			id: 'form-chat',
			title: 'Real-time Chat App',
			description: 'Configure your chat application — messaging, channels, and real-time features.',
			sections: [
				{
					id: 'messaging',
					title: 'Messaging',
					description: 'Core messaging features.',
					fields: [
						{ id: 'chat_type', type: 'select', label: 'Chat Type', required: true, defaultValue: 'group', options: [{ value: 'dm', label: 'Direct Messages Only' }, { value: 'group', label: 'Group Channels' }, { value: 'both', label: 'DM + Group Channels' }] },
						{ id: 'message_types', type: 'multiselect', label: 'Message Types', required: false, defaultValue: ['text'], options: [{ value: 'text', label: 'Text' }, { value: 'images', label: 'Images' }, { value: 'files', label: 'File Attachments' }, { value: 'reactions', label: 'Emoji Reactions' }] },
						{ id: 'threads', type: 'toggle', label: 'Threaded Replies', required: false, defaultValue: false },
					],
				},
				{
					id: 'realtime',
					title: 'Real-time Features',
					description: 'Live interaction capabilities.',
					fields: [
						{ id: 'typing_indicators', type: 'toggle', label: 'Typing Indicators', required: false, defaultValue: true },
						{ id: 'read_receipts', type: 'toggle', label: 'Read Receipts', required: false, defaultValue: false },
						{ id: 'presence', type: 'toggle', label: 'Online/Offline Status', required: false, defaultValue: true },
					],
				},
			],
			prefilledValues: { chat_type: 'group', message_types: ['text'] },
			requiredFields: ['chat_type'],
			schema: {},
		},
	},
];
