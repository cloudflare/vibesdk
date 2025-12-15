export interface ProviderInfo {
	name: string;
	color: string;
}

/**
 * Extract clean model display name from full model path
 * e.g., "openai/gpt-4" -> "gpt-4"
 */
export function getModelDisplayName(modelValue?: string): string {
	if (!modelValue) return 'Default';
	return modelValue.split('/').pop() || modelValue;
}

/**
 * Get provider badge info (name and color classes) from model value
 */
export function getProviderInfo(modelValue?: string): ProviderInfo {
	if (!modelValue) return { name: 'Default', color: 'bg-bg-3 text-text-tertiary' };

	// Check specific prefixes first to avoid incorrect matches
	if (modelValue.includes('cerebras/')) {
		return { name: 'Cerebras', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400' };
	}
	if (modelValue.includes('[openrouter]')) {
		return { name: 'OpenRouter', color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/20 dark:text-pink-400' };
	}
	if (modelValue.includes('openai/') || modelValue.includes('gpt') || modelValue.includes('o3') || modelValue.includes('o4')) {
		return { name: 'OpenAI', color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' };
	}
	if (modelValue.includes('anthropic/') || modelValue.includes('claude')) {
		return { name: 'Anthropic', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' };
	}
	if (modelValue.includes('google-ai-studio/') || modelValue.includes('gemini')) {
		return { name: 'Google', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' };
	}

	return { name: 'Custom', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400' };
}

/**
 * Categorize agent by key into workflow tab categories
 */
export function categorizeAgent(agentKey: string): string {
	// Specific agent mappings first (highest priority)
	const specificMappings: Record<string, string> = {
		// Quick Start - Most commonly used
		'templateSelection': 'quickstart',
		'conversationalResponse': 'quickstart',
		'blueprint': 'quickstart',

		// Planning - Project planning and setup
		'phaseGeneration': 'planning',
		'projectSetup': 'planning',

		// Coding - Development and implementation
		'phaseImplementation': 'coding',
		'firstPhaseImplementation': 'coding',
		'fileRegeneration': 'coding',

		// Debugging - Code fixing and review
		'realtimeCodeFixer': 'debugging',
		'fastCodeFixer': 'debugging',
		'codeReview': 'debugging',
		'deepDebugger': 'debugging',

		// Advanced
		'screenshotAnalysis': 'advanced',
	};

	// Check specific mappings first
	if (specificMappings[agentKey]) {
		return specificMappings[agentKey];
	}

	// Fallback to pattern matching for unknown agents
	const key = agentKey.toLowerCase();

	if (key.includes('template') || key.includes('selection')) return 'quickstart';
	if (key.includes('blueprint') || key.includes('architect')) return 'quickstart';
	if (key.includes('conversation') || key.includes('chat') || key.includes('response')) return 'quickstart';

	if (key.includes('project') && key.includes('setup')) return 'planning';
	if (key.includes('suggestion') && key.includes('process')) return 'planning';
	if (key.includes('planning') || key.includes('plan')) return 'planning';

	if (key.includes('implementation') || key.includes('implement')) return 'coding';
	if (key.includes('regenerat') || key.includes('regen')) return 'coding';
	if (key.includes('code') && key.includes('gen')) return 'coding';

	if (key.includes('fixer') || key.includes('fix')) return 'debugging';
	if (key.includes('debug') || key.includes('review')) return 'debugging';
	if (key.includes('lint') || key.includes('check')) return 'debugging';

	if (key.includes('screenshot') || key.includes('image') || key.includes('vision')) return 'advanced';
	if (key.includes('analysis') || key.includes('analyz')) return 'advanced';

	// Default to advanced for completely unknown agents
	return 'advanced';
}
