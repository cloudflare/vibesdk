/**
 * Secret template interface for getTemplates
 */
export interface SecretTemplate {
	id: string;
	displayName: string;
	envVarName: string;
	provider: string;
	icon: string;
	description: string;
	instructions: string;
	placeholder: string;
	validation: string;
	required: boolean;
	category: string;
}

export function getTemplatesData(): SecretTemplate[] {
	const templates = [
		// Payment Processing
		{
			id: 'STRIPE_SECRET_KEY',
			displayName: 'Stripe Secret Key',
			envVarName: 'STRIPE_SECRET_KEY',
			provider: 'stripe',
			icon: '💳',
			description: 'Stripe secret key for payment processing',
			instructions:
				'Go to Stripe Dashboard → Developers → API keys → Secret key',
			placeholder: 'sk_test_... or sk_live_...',
			validation: '^sk_(test_|live_)[a-zA-Z0-9]{48,}$',
			required: false,
			category: 'payments',
		},
		{
			id: 'STRIPE_PUBLISHABLE_KEY',
			displayName: 'Stripe Publishable Key',
			envVarName: 'STRIPE_PUBLISHABLE_KEY',
			provider: 'stripe',
			icon: '💳',
			description: 'Stripe publishable key for frontend integration',
			instructions:
				'Go to Stripe Dashboard → Developers → API keys → Publishable key',
			placeholder: 'pk_test_... or pk_live_...',
			validation: '^pk_(test_|live_)[a-zA-Z0-9]{48,}$',
			required: false,
			category: 'payments',
		},

		// AI Services
		{
			id: 'OPENAI_API_KEY',
			displayName: 'OpenAI API Key',
			envVarName: 'OPENAI_API_KEY',
			provider: 'openai',
			icon: '🤖',
			description: 'OpenAI API key for GPT and other AI models',
			instructions:
				'Go to OpenAI Platform → API keys → Create new secret key',
			placeholder: 'sk-...',
			validation: '^sk-[a-zA-Z0-9]{48,}$',
			required: false,
			category: 'ai',
		},
		{
			id: 'ANTHROPIC_API_KEY',
			displayName: 'Anthropic API Key',
			envVarName: 'ANTHROPIC_API_KEY',
			provider: 'anthropic',
			icon: '🧠',
			description: 'Anthropic Claude API key',
			instructions: 'Go to Anthropic Console → API Keys → Create Key',
			placeholder: 'sk-ant-...',
			validation: '^sk-ant-[a-zA-Z0-9_-]{48,}$',
			required: false,
			category: 'ai',
		},
		{
			id: 'GOOGLE_AI_STUDIO_API_KEY',
			displayName: 'Google Gemini API Key',
			envVarName: 'GOOGLE_AI_STUDIO_API_KEY',
			provider: 'google-ai-studio',
			icon: '🔷',
			description: 'Google Gemini AI API key',
			instructions: 'Go to Google AI Studio → Get API key',
			placeholder: 'AI...',
			validation: '^AI[a-zA-Z0-9_-]{35,}$',
			required: false,
			category: 'ai',
		},
		{
			id: 'OPENROUTER_API_KEY',
			displayName: 'OpenRouter API Key',
			envVarName: 'OPENROUTER_API_KEY',
			provider: 'openrouter',
			icon: '🔀',
			description: 'OpenRouter API key for multiple AI providers',
			instructions: 'Go to OpenRouter → Account → Keys → Create new key',
			placeholder: 'sk-or-...',
			validation: '^sk-or-[a-zA-Z0-9_-]{48,}$',
			required: false,
			category: 'ai',
		},

		// BYOK (Bring Your Own Key) AI Providers - Lenient validation for compatibility
		{
			id: 'OPENAI_API_KEY_BYOK',
			displayName: 'OpenAI (BYOK)',
			envVarName: 'OPENAI_API_KEY_BYOK',
			provider: 'openai',
			icon: '🤖',
			description:
				'Use your OpenAI API key for GPT models via Cloudflare AI Gateway',
			instructions:
				'Go to OpenAI Platform → API Keys → Create new secret key',
			placeholder: 'sk-proj-... or sk-...',
			validation: '^sk-.{10,}$',
			required: false,
			category: 'byok',
		},
		{
			id: 'ANTHROPIC_API_KEY_BYOK',
			displayName: 'Anthropic (BYOK)',
			envVarName: 'ANTHROPIC_API_KEY_BYOK',
			provider: 'anthropic',
			icon: '🧠',
			description:
				'Use your Anthropic API key for Claude models via Cloudflare AI Gateway',
			instructions: 'Go to Anthropic Console → API Keys → Create Key',
			placeholder: 'sk-ant-api03-...',
			validation: '^sk-ant-.{10,}$',
			required: false,
			category: 'byok',
		},
		{
			id: 'GOOGLE_AI_STUDIO_API_KEY_BYOK',
			displayName: 'Google AI Studio (BYOK)',
			envVarName: 'GOOGLE_AI_STUDIO_API_KEY_BYOK',
			provider: 'google-ai-studio',
			icon: '🔷',
			description:
				'Use your Google AI API key for Gemini models via Cloudflare AI Gateway',
			instructions: 'Go to Google AI Studio → Get API Key',
			placeholder: 'AIzaSy...',
			validation: '^AIza.{20,}$',
			required: false,
			category: 'byok',
		},
		{
			id: 'CEREBRAS_API_KEY_BYOK',
			displayName: 'Cerebras (BYOK)',
			envVarName: 'CEREBRAS_API_KEY_BYOK',
			provider: 'cerebras',
			icon: '🧮',
			description:
				'Use your Cerebras API key for high-performance inference via Cloudflare AI Gateway',
			instructions: 'Go to Cerebras Platform → API Keys → Create new key',
			placeholder: 'csk-... or any format',
			validation: '^.{10,}$',
			required: false,
			category: 'byok',
		},

		// Development Tools
		{
			id: 'GITHUB_TOKEN',
			displayName: 'GitHub Personal Access Token',
			envVarName: 'GITHUB_TOKEN',
			provider: 'github',
			icon: '🐙',
			description: 'GitHub token for repository operations',
			instructions:
				'Go to GitHub → Settings → Developer settings → Personal access tokens → Generate new token',
			placeholder: 'ghp_... or github_pat_...',
			validation: '^(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{80,})$',
			required: false,
			category: 'development',
		},
		{
			id: 'VERCEL_TOKEN',
			displayName: 'Vercel Access Token',
			envVarName: 'VERCEL_TOKEN',
			provider: 'vercel',
			icon: '▲',
			description: 'Vercel token for deployments',
			instructions: 'Go to Vercel Dashboard → Settings → Tokens → Create',
			placeholder: 'Your Vercel access token',
			validation: '^[a-zA-Z0-9]{24}$',
			required: false,
			category: 'deployment',
		},

		// Database & Storage
		{
			id: 'SUPABASE_URL',
			displayName: 'Supabase Project URL',
			envVarName: 'SUPABASE_URL',
			provider: 'supabase',
			icon: '🗄️',
			description: 'Supabase project URL',
			instructions:
				'Go to Supabase Dashboard → Settings → API → Project URL',
			placeholder: 'https://xxx.supabase.co',
			validation: '^https://[a-z0-9]+\\.supabase\\.co$',
			required: false,
			category: 'database',
		},
		{
			id: 'SUPABASE_ANON_KEY',
			displayName: 'Supabase Anonymous Key',
			envVarName: 'SUPABASE_ANON_KEY',
			provider: 'supabase',
			icon: '🗄️',
			description: 'Supabase anonymous/public key',
			instructions:
				'Go to Supabase Dashboard → Settings → API → anon public key',
			placeholder: 'eyJ...',
			validation: '^eyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+$',
			required: false,
			category: 'database',
		},
	];

	return templates;
}

/**
 * Get BYOK templates dynamically
 */
export function getBYOKTemplates(): SecretTemplate[] {
	return getTemplatesData().filter(
		(template) => template.category === 'byok',
	);
}
