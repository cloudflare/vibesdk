#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse, modify, applyEdits } from 'jsonc-parser';
import Cloudflare from 'cloudflare';
import { createInterface } from 'readline';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

interface SetupConfig {
	accountId: string;
	apiToken: string;
	customDomain?: string;
	useAIGateway: boolean;
	aiGatewayUrl?: string;
	useRemoteBindings: boolean;
	devVars: Record<string, string>;
	setupRemote?: boolean;
	prodDomain?: string;
	prodVars?: Record<string, string>;
	customProviderKeys?: Array<{key: string, provider: string}>;
}

interface ResourceInfo {
	kvNamespaces: Array<{ name: string; id: string; binding: string; accessible: boolean }>;
	d1Databases: Array<{ name: string; id: string; binding: string; accessible: boolean }>;
	r2Buckets: Array<{ name: string; binding: string; accessible: boolean }>;
	dispatchNamespaces: Array<{ name: string; binding: string; accessible: boolean }>;
	zones: Array<{ name: string; id: string }>;
	aiGateway?: { name: string; exists: boolean; tokenCreated: boolean; tokenError?: string };
}

interface ReadinessReport {
	localDevReady: boolean;
	deploymentReady: boolean;
	issues: string[];
	suggestions: string[];
	resourcesCreated: string[];
	accountInfo?: {
		plan: string;
		features: string[];
	};
}

class SetupManager {
	private config!: SetupConfig;
	private cloudflare!: Cloudflare;
	private aiGatewayCloudflare?: Cloudflare;
	private existingConfig: Record<string, string> = {};
	private packageManager: 'bun' | 'npm' = 'npm';
	private readline = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	constructor() {
		console.log('🚀 VibeSDK Development Setup');
		console.log('============================\n');
	}

	async setup(): Promise<void> {
		try {
			await this.setupPackageManager();
			this.loadExistingConfig();
			await this.collectUserConfig();
			await this.initializeCloudflareClient();

			const resources = await this.validateAndSetupResources();

			await this.safeExecute('generate .dev.vars file', () => this.generateDevVarsFile());
			if (this.config.setupRemote) {
				await this.safeExecute('generate .prod.vars file', () => this.generateProdVarsFile());
			}
			await this.safeExecute('update wrangler.jsonc', () => this.updateWranglerConfig(resources));
			await this.safeExecute('update vite.config.ts', () => this.updateViteConfig());

			const report = await this.generateReadinessReport(resources);

			// Setup AI Gateway if configured
			if (this.config.useAIGateway) {
				await this.safeExecute('setup AI Gateway', () => this.ensureAIGateway(resources));
			}

			// Update worker configuration for custom providers
			if (this.config.customProviderKeys && this.config.customProviderKeys.length > 0) {
				await this.safeExecute('update worker configuration', () => this.updateWorkerConfiguration());
			}

			await this.patchDockerfileForARM64();

			this.displayFinalReport(report, resources);
		} catch (error) {
			console.error('\n❌ Setup encountered a critical error:', error instanceof Error ? error.message : String(error));
			console.error('\n💡 Troubleshooting:');
			console.error('   1. Verify your Cloudflare API token has the required permissions');
			console.error('   2. Check your account has access to the required Cloudflare services');
			console.error('   3. Try running the script again or set up manually');
			console.error('\n📚 See docs/setup.md for manual setup instructions');
			process.exit(1);
		} finally {
			this.readline.close();
		}
	}

	private async safeExecute(actionName: string, action: () => Promise<void>): Promise<void> {
		try {
			await action();
		} catch (error) {
			console.error(`❌ Failed to ${actionName}:`, error instanceof Error ? error.message : String(error));
			console.error('   You may need to complete this step manually');
		}
	}

	private async setupPackageManager(): Promise<void> {
		console.log('📦 Package Manager Setup');
		console.log('------------------------\n');

		const hasBun = await this.checkCommandExists('bun');
		const hasNpm = await this.checkCommandExists('npm');

		if (hasBun) {
			console.log('✅ Bun is available - using bun for optimal performance');
			this.packageManager = 'bun';
		} else if (hasNpm) {
			console.log('✅ npm is available');
			console.log('📥 Installing Bun for better performance...');

			try {
				execSync('curl -fsSL https://bun.sh/install | bash', { stdio: 'inherit' });

				if (await this.checkCommandExists('bun')) {
					console.log('✅ Bun installed successfully!');
					this.packageManager = 'bun';
				} else {
					console.log('⚠️  Bun installation completed, but may require shell restart. Using npm for now.');
					this.packageManager = 'npm';
				}
			} catch (error) {
				console.error('❌ Failed to install Bun:', error instanceof Error ? error.message : String(error));
				console.log('   Continuing with npm...');
				this.packageManager = 'npm';
			}
		} else {
			throw new Error('Neither npm nor bun is available. Please install Node.js with npm or Bun.');
		}

		console.log(`\n📦 Using package manager: ${this.packageManager}\n`);
	}

	private async checkCommandExists(command: string): Promise<boolean> {
		try {
			execSync(`${command} --version`, { stdio: 'pipe' });
			return true;
		} catch {
			return false;
		}
	}

	private loadExistingConfig(): void {
		const devVarsPath = join(PROJECT_ROOT, '.dev.vars');
		const prodVarsPath = join(PROJECT_ROOT, '.prod.vars');

		// Load .dev.vars
		if (existsSync(devVarsPath)) {
			console.log('📄 Found existing .dev.vars file - reading current configuration...');
			this.parseConfigFile(devVarsPath);
		}

		// Load .prod.vars for production config
		if (existsSync(prodVarsPath)) {
			console.log('📄 Found existing .prod.vars file - reading production configuration...');
			this.parseConfigFile(prodVarsPath);
		}

		if (!existsSync(devVarsPath) && !existsSync(prodVarsPath)) {
			console.log('📄 No existing configuration files found - starting fresh setup');
			return;
		}

		const configuredKeys = Object.keys(this.existingConfig);
		if (configuredKeys.length > 0) {
			console.log(`✅ Found ${configuredKeys.length} existing configuration values`);
			console.log('   Will only prompt for missing or updated values\n');
		}
	}

	private parseConfigFile(filePath: string): void {
		try {
			const content = readFileSync(filePath, 'utf-8');
			const lines = content.split('\n');

			for (const line of lines) {
				const trimmed = line.trim();
				if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
					const [key, ...valueParts] = trimmed.split('=');
					const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
					if (key && value) {
						this.existingConfig[key] = value;
					}
				}
			}
		} catch (error) {
			console.warn(`⚠️  Could not read config file: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async prompt(question: string): Promise<string> {
		return new Promise((resolve) => {
			this.readline.question(question, (answer) => {
				resolve(answer.trim());
			});
		});
	}

	private async promptWithDefault(question: string, existingValue?: string): Promise<string> {
		if (existingValue) {
			const maskedValue = this.maskSensitiveValue(question, existingValue);
			const answer = await this.prompt(`${question} [current: ${maskedValue}]: `);
			return answer || existingValue;
		}
		return this.prompt(question);
	}

	private maskSensitiveValue(question: string, value: string): string {
		const sensitivePatterns = ['TOKEN', 'SECRET', 'KEY', 'PASSWORD'];
		const isSensitive = sensitivePatterns.some(pattern =>
			question.toUpperCase().includes(pattern)
		);

		if (isSensitive && value.length > 8) {
			return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
		}
		return value;
	}

	private async collectUserConfig(): Promise<void> {
		console.log('📋 Configuration Review & Setup');
		console.log('--------------------------------\n');

		// Get Cloudflare account ID
		const accountId = await this.promptWithDefault(
			'Enter your Cloudflare Account ID: ',
			this.existingConfig.CLOUDFLARE_ACCOUNT_ID
		);
		if (!accountId) {
			throw new Error('Account ID is required');
		}

		// Get API token
		const apiToken = await this.promptWithDefault(
			'Enter your Cloudflare API Token: ',
			this.existingConfig.CLOUDFLARE_API_TOKEN
		);
		if (!apiToken) {
			throw new Error('API Token is required');
		}

		// Domain Configuration - Ask once upfront with existing domain detection
		console.log('\n🌐 Domain Configuration');
		console.log('A custom domain is required for production deployment and remote resource access.');
		console.log('Without a custom domain, only local development will be available.\n');

		let customDomain: string | undefined;
		let useRemoteBindings = false;
		let setupRemote = false;
		let prodDomain: string | undefined;

		// Check if we already have a production domain configured
		const existingProdDomain = this.existingConfig.CUSTOM_DOMAIN &&
			this.existingConfig.CUSTOM_DOMAIN !== 'localhost:5173' ?
			this.existingConfig.CUSTOM_DOMAIN : undefined;

		while (true) {
			customDomain = await this.promptWithDefault(
				'Enter your custom domain (or press Enter to skip): ',
				existingProdDomain || this.existingConfig.CUSTOM_DOMAIN
			);

			if (!customDomain || customDomain.trim() === '' || customDomain === 'localhost:5173') {
				console.log('\n⚠️  No custom domain provided.');
				console.log('   • Remote Cloudflare resources: Not available');
				console.log('   • Production deployment: Not available');
				console.log('   • Only local development will be configured\n');

				const continueChoice = await this.prompt('Continue with local-only setup? (Y/n): ');
				if (continueChoice.toLowerCase() === 'n') {
					console.log('Please provide a custom domain:\n');
					continue;
				}

				customDomain = 'localhost:5173';
				useRemoteBindings = false;
				setupRemote = false;
				break;
			} else {
				console.log(`✅ Custom domain set: ${customDomain}`);
				prodDomain = customDomain; // Use same domain for production

				// Ask about remote resources
				const remoteChoice = await this.prompt('Use remote Cloudflare resources (KV, D1, R2, etc.)? (Y/n): ');
				useRemoteBindings = remoteChoice.toLowerCase() !== 'n';

				// Ask about production setup
				const prodChoice = await this.prompt('Configure for production deployment? (Y/n): ');
				setupRemote = prodChoice.toLowerCase() !== 'n';

				if (useRemoteBindings) {
					console.log('✅ Remote Cloudflare resources will be used');
				} else {
					console.log('✅ Local-only bindings selected');
				}

				break;
			}
		}

		const finalDomain = customDomain || 'localhost:5173';

		// AI Gateway configuration
		console.log('\n🤖 AI Gateway Configuration');
		const useAIGatewayChoice = await this.prompt('Use Cloudflare AI Gateway? [STRONGLY RECOMMENDED for developer experience] (Y/n): ');
		const useAIGateway = useAIGatewayChoice.toLowerCase() !== 'n';

		let aiGatewayUrl: string | undefined;
		const devVars: Record<string, string> = {};
		const providedProviders: string[] = [];
		let customProviderKeys: Array<{key: string, provider: string}> = [];

		if (useAIGateway) {
			console.log('✅ AI Gateway enabled - will auto-configure CLOUDFLARE_AI_GATEWAY_TOKEN');

			// Generate suggested URL
			const wranglerConfig = this.parseWranglerConfig();
			const gatewayName = wranglerConfig.vars?.CLOUDFLARE_AI_GATEWAY || 'vibesdk-gateway';
			const suggestedUrl = `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayName}/`;

			// Use existing URL if available, otherwise use suggested URL as default
			const existingUrl = this.existingConfig.CLOUDFLARE_AI_GATEWAY_URL;
			const defaultUrl = existingUrl || suggestedUrl;

			if (!existingUrl) {
				console.log(`\n💡 AI Gateway URL format: https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_name>/`);
				console.log(`   Suggested: ${suggestedUrl}`);
			}

			aiGatewayUrl = await this.promptWithDefault(
				'Enter AI Gateway URL: ',
				defaultUrl
			);

			if (!aiGatewayUrl || aiGatewayUrl.trim() === '') {
				throw new Error('AI Gateway URL is required when AI Gateway is enabled');
			}
		} else {
			console.log('\n⚠️  WARNING: Without AI Gateway, you MUST manually edit worker/agents/inferutils/config.ts');
			console.log('   to configure your models. Model names should be in format: "<provider-name>/<model-name>"');
			console.log('   Example: "openai/gpt-4" or "anthropic/claude-3-5-sonnet"\n');

			aiGatewayUrl = await this.prompt('Enter custom OpenAI-compatible URL (optional): ');
		}

		// AI Provider configuration
		console.log('\n🔧 AI Provider Configuration');
		console.log('Available providers:');
		console.log('   1. OpenAI (for GPT models)');
		console.log('   2. Anthropic (for Claude models)');
		console.log('   3. Google AI Studio (for Gemini models) [DEFAULT]');
		console.log('   4. Cerebras (for open source models)');
		console.log('   5. OpenRouter (for various models)');
		console.log('   6. Custom provider\n');

		const providerChoice = await this.prompt('Select providers (comma-separated numbers, e.g., 1,2,3): ');
		const selectedProviders = providerChoice.split(',').map(n => parseInt(n.trim())).filter(n => n >= 1 && n <= 6);

		if (selectedProviders.length === 0) {
			console.log('⚠️  No providers selected - you MUST configure at least one provider!');
			console.log('   Adding Google AI Studio as default...');
			selectedProviders.push(3);
		}

		// Process selected providers
		const providerMap = {
			1: { name: 'OpenAI', key: 'OPENAI_API_KEY', provider: 'openai' },
			2: { name: 'Anthropic', key: 'ANTHROPIC_API_KEY', provider: 'anthropic' },
			3: { name: 'Google AI Studio', key: 'GOOGLE_AI_STUDIO_API_KEY', provider: 'google-ai-studio' },
			4: { name: 'Cerebras', key: 'CEREBRAS_API_KEY', provider: 'cerebras' },
			5: { name: 'OpenRouter', key: 'OPENROUTER_API_KEY', provider: 'openrouter' }
		};

		console.log('\n🔑 API Key Configuration');
		for (const choice of selectedProviders) {
			if (choice === 6) {
				// Custom provider
				const customProviderName = await this.prompt('Enter custom provider name: ');
				if (customProviderName) {
					const customKey = `${customProviderName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
					const apiKey = await this.prompt(`${customKey}: `);
					if (apiKey) {
						devVars[customKey] = apiKey;
						customProviderKeys.push({ key: customKey, provider: customProviderName });
						providedProviders.push(customProviderName);
					}
				}
			} else {
				const provider = providerMap[choice as keyof typeof providerMap];
				if (provider) {
					const existing = this.existingConfig[provider.key];
					const value = await this.promptWithDefault(`${provider.name} API Key (${provider.key}): `, existing);
					if (value) {
						devVars[provider.key] = value;
						providedProviders.push(provider.provider);
					}
				}
			}
		}

		// Warning about config.ts if not using Gemini as default
		const hasGemini = selectedProviders.includes(3);
		if (!hasGemini) {
			console.log('\n⚠️  IMPORTANT: You selected providers other than Google AI Studio (Gemini).');
			console.log('   You MUST edit worker/agents/inferutils/config.ts to change the default model configurations');
			console.log('   from Gemini models to your selected providers!\n');
		}

		// OAuth and other configuration with smart prompts
		console.log('\n🔐 OAuth & Other Configuration');
		console.log('ℹ️  These credentials enable user authentication and external integrations:');
		console.log('   • Google: For Google OAuth user login');
		console.log('   • GitHub: For GitHub OAuth user login');
		console.log('   • GitHub Export: For exporting generated apps to GitHub repositories\n');

		const otherVars = [
			'GOOGLE_CLIENT_ID',
			'GOOGLE_CLIENT_SECRET',
			'GITHUB_CLIENT_ID',
			'GITHUB_CLIENT_SECRET',
			'GITHUB_EXPORTER_CLIENT_ID',
			'GITHUB_EXPORTER_CLIENT_SECRET'
		];

		for (const varName of otherVars) {
			const existing = this.existingConfig[varName];
			const value = await this.promptWithDefault(`${varName}: `, existing);
			if (value) {
				devVars[varName] = value;
			}
		}

		// Provide guidance on model configuration
		if (providedProviders.length > 0) {
			console.log(`\n✅ API keys configured for: ${providedProviders.join(', ')}`);
		}

		if (!providedProviders.includes('google-ai-studio')) {
			console.log('\n⚠️  No Google AI Studio key provided.');
			console.log('   You may need to update model configs in worker/agents/inferutils/config.ts');
			console.log('   to use alternative models (OpenAI, Anthropic, etc.) for Gemini fallbacks.');
		}

		// Generate or preserve required secrets
		devVars.JWT_SECRET = this.existingConfig.JWT_SECRET || this.generateRandomSecret(64);
		devVars.WEBHOOK_SECRET = this.existingConfig.WEBHOOK_SECRET || this.generateRandomSecret(32);
		devVars.USE_TUNNEL_FOR_PREVIEW = 'true';

		// Auto-set AI Gateway token if using AI Gateway
		if (useAIGateway) {
			devVars.CLOUDFLARE_AI_GATEWAY_TOKEN = apiToken;
		}

		// Prepare production vars (copy dev vars as defaults)
		const prodVars = setupRemote && prodDomain ? { ...devVars, CUSTOM_DOMAIN: prodDomain } : undefined;

		this.config = {
			accountId,
			apiToken,
			customDomain: finalDomain,
			useAIGateway,
			aiGatewayUrl,
			useRemoteBindings,
			devVars,
			setupRemote,
			prodDomain,
			prodVars,
			customProviderKeys
		};

		console.log('\n✅ Configuration collected successfully\n');
	}

	private generateRandomSecret(length: number): string {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		let result = '';
		for (let i = 0; i < length; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return result;
	}

	private async initializeCloudflareClient(): Promise<void> {
		console.log('🔐 Validating Cloudflare credentials...');

		this.cloudflare = new Cloudflare({
			apiToken: this.config.apiToken,
		});

		try {
			// Verify token by getting account info
			const account = await this.cloudflare.accounts.get({ account_id: this.config.accountId });
			console.log(`✅ Connected to account: ${account.name}`);
		} catch (error) {
			throw new Error(`Failed to validate Cloudflare credentials: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async validateAndSetupResources(): Promise<ResourceInfo> {
		console.log('🔍 Validating and setting up Cloudflare resources...');

		const wranglerConfig = this.parseWranglerConfig();
		const resources: ResourceInfo = {
			kvNamespaces: [],
			d1Databases: [],
			r2Buckets: [],
			dispatchNamespaces: [],
			zones: []
		};

		await this.processKVNamespaces(wranglerConfig, resources);
		await this.processD1Databases(wranglerConfig, resources);

		await this.safeExecute('setup database', () => this.setupDatabase(resources));

		await this.processR2Buckets(wranglerConfig, resources);

		await this.safeExecute('deploy templates', () => this.deployTemplates(resources));

		await this.processDispatchNamespaces(wranglerConfig, resources);
		await this.processCustomDomain(resources);

		return resources;
	}

	private async processKVNamespaces(wranglerConfig: any, resources: ResourceInfo): Promise<void> {
		if (!wranglerConfig.kv_namespaces) return;

		for (const kv of wranglerConfig.kv_namespaces) {
			if (!this.config.useRemoteBindings) {
				resources.kvNamespaces.push(this.createLocalResource(kv.binding, 'local'));
			} else {
				try {
					const kvInfo = await this.ensureKVNamespace(kv.binding);
					resources.kvNamespaces.push({
						name: kvInfo.title,
						id: kvInfo.id,
						binding: kv.binding,
						accessible: true
					});
				} catch (error) {
					this.handleResourceError('KV namespace', kv.binding, error);
					resources.kvNamespaces.push(this.createLocalResource(kv.binding, 'local'));
				}
			}
		}
	}

	private async processD1Databases(wranglerConfig: any, resources: ResourceInfo): Promise<void> {
		if (!wranglerConfig.d1_databases) return;

		for (const db of wranglerConfig.d1_databases) {
			if (!this.config.useRemoteBindings) {
				resources.d1Databases.push(this.createLocalResource(db.binding, 'local', db.database_name));
			} else {
				try {
					const dbInfo = await this.ensureD1Database(db.database_name, db.binding);
					resources.d1Databases.push({
						name: dbInfo.name,
						id: dbInfo.uuid,
						binding: db.binding,
						accessible: true
					});
				} catch (error) {
					this.handleResourceError('D1 database', db.database_name, error, 'D1 Database not accessible (likely requires paid plan)');
					resources.d1Databases.push(this.createLocalResource(db.binding, 'local', db.database_name));
				}
			}
		}
	}

	private async processR2Buckets(wranglerConfig: any, resources: ResourceInfo): Promise<void> {
		if (!wranglerConfig.r2_buckets) return;

		for (const bucket of wranglerConfig.r2_buckets) {
			if (!this.config.useRemoteBindings) {
				resources.r2Buckets.push({ name: bucket.bucket_name, binding: bucket.binding, accessible: false });
			} else {
				try {
					await this.ensureR2Bucket(bucket.bucket_name, bucket.binding);
					resources.r2Buckets.push({ name: bucket.bucket_name, binding: bucket.binding, accessible: true });
				} catch (error) {
					this.handleResourceError('R2 bucket', bucket.bucket_name, error, 'R2 Bucket not accessible (likely requires paid plan)');
					resources.r2Buckets.push({ name: bucket.bucket_name, binding: bucket.binding, accessible: false });
				}
			}
		}
	}

	private async processDispatchNamespaces(wranglerConfig: any, resources: ResourceInfo): Promise<void> {
		if (!wranglerConfig.dispatch_namespaces) return;

		for (const dispatch of wranglerConfig.dispatch_namespaces) {
			if (!this.config.useRemoteBindings) {
				resources.dispatchNamespaces.push({ name: dispatch.namespace, binding: dispatch.binding, accessible: false });
			} else {
				try {
					await this.ensureDispatchNamespace(dispatch.namespace, dispatch.binding);
					resources.dispatchNamespaces.push({ name: dispatch.namespace, binding: dispatch.binding, accessible: true });
				} catch (error) {
					this.handleResourceError('dispatch namespace', dispatch.namespace, error, 'Dispatch Namespace not accessible (requires Workers for Platforms)');
					resources.dispatchNamespaces.push({ name: dispatch.namespace, binding: dispatch.binding, accessible: false });
				}
			}
		}
	}

	private async processCustomDomain(resources: ResourceInfo): Promise<void> {
		// Check production domain first (priority for zone detection)
		const domainToCheck = this.config.setupRemote && this.config.prodDomain
			? this.config.prodDomain
			: (this.config.customDomain !== 'localhost:5173' ? this.config.customDomain : null);

		if (domainToCheck) {
			try {
				const zoneInfo = await this.detectZoneForDomain(domainToCheck);
				if (zoneInfo.zoneId) {
					resources.zones.push({ name: zoneInfo.zoneName!, id: zoneInfo.zoneId });
				}
			} catch (error) {
				console.warn(`⚠️  Domain validation failed for ${domainToCheck}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	private createLocalResource(binding: string, id: string, name?: string) {
		const resourceName = name || `${binding}-local`;
		console.log(`📝 ${binding} - using local-only mode (user preference)`);
		return { name: resourceName, id, binding, accessible: false };
	}

	private handleResourceError(resourceType: string, resourceName: string, error: unknown, specificMessage?: string): void {
		const errorMsg = `Failed to setup ${resourceType} ${resourceName}: ${error instanceof Error ? error.message : String(error)}`;
		console.warn(`⚠️  ${errorMsg} - will use local-only mode`);

		if (specificMessage && error instanceof Error && error.message.includes('Unauthorized')) {
			console.warn(`💡 ${specificMessage}`);
			console.warn('   Will continue with local-only for development');
		}
	}

	private async ensureKVNamespace(binding: string): Promise<{ id: string; title: string }> {
		const namespaceName = `vibesdk-${binding.toLowerCase()}-local`;

		try {
			// Check if namespace exists using direct API call
			const response = await fetch(
				`https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/storage/kv/namespaces`,
				{
					headers: {
						'Authorization': `Bearer ${this.config.apiToken}`,
						'Content-Type': 'application/json',
					},
				}
			);

			if (response.ok) {
				const data = await response.json();
				if (data.success && data.result) {
					const existingNamespace = data.result.find((ns: any) => ns.title === namespaceName);
					if (existingNamespace) {
						console.log(`✅ KV namespace '${namespaceName}' already exists`);
						return { id: existingNamespace.id, title: existingNamespace.title };
					}
				}
			}

			// Create new namespace
			console.log(`📦 Creating KV namespace: ${namespaceName}`);
			const createResponse = await fetch(
				`https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/storage/kv/namespaces`,
				{
					method: 'POST',
					headers: {
						'Authorization': `Bearer ${this.config.apiToken}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ title: namespaceName }),
				}
			);

			if (createResponse.ok) {
				const data = await createResponse.json();
				if (data.success && data.result) {
					console.log(`✅ Created KV namespace: ${namespaceName}`);
					return { id: data.result.id, title: data.result.title };
				}
			}

			throw new Error(`Failed to create KV namespace: ${createResponse.statusText}`);

		} catch (error) {
			throw new Error(`Failed to ensure KV namespace ${namespaceName}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async ensureD1Database(dbName: string, binding: string): Promise<{ uuid: string; name: string }> {
		const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/d1/database`;
		const headers = {
			'Authorization': `Bearer ${this.config.apiToken}`,
			'Content-Type': 'application/json',
		};

		const listResponse = await fetch(baseUrl, { headers });
		if (listResponse.ok) {
			const data = await listResponse.json();
			const existingDb = data.result?.find((db: any) => db.name === dbName);
			if (existingDb) {
				console.log(`✅ D1 database '${dbName}' already exists`);
				return { uuid: existingDb.uuid, name: existingDb.name };
			}
		}

		console.log(`📦 Creating D1 database: ${dbName}`);
		const createResponse = await fetch(baseUrl, {
			method: 'POST',
			headers,
			body: JSON.stringify({ name: dbName }),
		});

		const data = await createResponse.json();
		if (!createResponse.ok || !data.success) {
			const errorDetails = data.errors?.map((e: any) => e.message).join(', ') || createResponse.statusText;
			throw new Error(`HTTP ${createResponse.status}: ${errorDetails}`);
		}

		console.log(`✅ Created D1 database: ${dbName}`);
		return { uuid: data.result.uuid, name: data.result.name };
	}

	private async ensureDispatchNamespace(namespaceName: string, binding: string): Promise<void> {
		try {
			console.log(`🔍 Checking dispatch namespace: ${namespaceName}`);

			// Use wrangler CLI to check if namespace exists
			try {
				execSync(`wrangler dispatch-namespace get ${namespaceName}`, {
					stdio: 'pipe',
					env: {
						...process.env,
						CLOUDFLARE_API_TOKEN: this.config.apiToken,
						CLOUDFLARE_ACCOUNT_ID: this.config.accountId,
					},
				});
				console.log(`✅ Dispatch namespace '${namespaceName}' already exists`);
				return;
			} catch (error) {
				// If namespace doesn't exist, create it
				console.log(`📦 Creating dispatch namespace: ${namespaceName}`);

				execSync(`wrangler dispatch-namespace create ${namespaceName}`, {
					stdio: 'pipe',
					env: {
						...process.env,
						CLOUDFLARE_API_TOKEN: this.config.apiToken,
						CLOUDFLARE_ACCOUNT_ID: this.config.accountId,
					},
				});

				console.log(`✅ Created dispatch namespace: ${namespaceName}`);
			}
		} catch (error) {
			// Handle wrangler CLI errors gracefully
			const stderr = error instanceof Error && 'stderr' in error ? (error as any).stderr?.toString() : '';

			if (stderr.includes('You do not have access to dispatch namespaces') ||
				stderr.includes('not available')) {
				throw new Error('Dispatch namespaces not available on this account plan');
			}

			throw new Error(`Wrangler CLI error: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async ensureR2Bucket(bucketName: string, binding: string): Promise<void> {
		const headers = {
			'Authorization': `Bearer ${this.config.apiToken}`,
			'Content-Type': 'application/json',
		};

		const checkResponse = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/r2/buckets/${bucketName}`,
			{ headers }
		);

		if (checkResponse.ok) {
			console.log(`✅ R2 bucket '${bucketName}' already exists`);
			return;
		}

		if (checkResponse.status !== 404) {
			const errorData = await checkResponse.json().catch(() => ({}));
			const errorDetails = errorData.errors?.map((e: any) => e.message).join(', ') || checkResponse.statusText;
			throw new Error(`HTTP ${checkResponse.status}: ${errorDetails}`);
		}

		console.log(`📦 Creating R2 bucket: ${bucketName}`);
		const createResponse = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/r2/buckets`,
			{
				method: 'POST',
				headers,
				body: JSON.stringify({ name: bucketName }),
			}
		);

		const data = await createResponse.json();
		if (!createResponse.ok || !data.success) {
			const errorDetails = data.errors?.map((e: any) => e.message).join(', ') || createResponse.statusText;
			throw new Error(`HTTP ${createResponse.status}: ${errorDetails}`);
		}

		console.log(`✅ Created R2 bucket: ${bucketName}`);
	}

	private async ensureAIGateway(resources: ResourceInfo): Promise<void> {
		const gatewayName = this.config.useAIGateway ? 'vibesdk-gateway' : null;

		if (!gatewayName) {
			console.log('ℹ️  AI Gateway setup skipped (not configured)');
			return;
		}

		console.log(`🔍 Checking AI Gateway: ${gatewayName}`);
		let tokenCreated = false;
		let tokenError: string | undefined;
		let aiGatewayToken: string | null = null;

		try {
			// Check API token permissions first
			console.log('🔍 Checking API token permissions...');
			const permissionCheck = await this.checkTokenPermissions();

			// Check if token already exists in config
			const existingToken = this.config.devVars.CLOUDFLARE_AI_GATEWAY_TOKEN;
			const hasExistingToken = existingToken && existingToken !== 'optional-your-cf-ai-gateway-token';

			if (hasExistingToken) {
				// Use existing configured token
				aiGatewayToken = existingToken;
				console.log('✅ Using existing AI Gateway token from configuration');
			} else if (permissionCheck.hasAIGatewayAccess) {
				// Main token has permissions, use it directly - no need to create a specialized token
				aiGatewayToken = this.config.apiToken;
				this.config.devVars.CLOUDFLARE_AI_GATEWAY_TOKEN = this.config.apiToken;
				console.log('✅ Main API token has AI Gateway permissions, using it directly');
			} else {
				// Main token doesn't have permissions, try to create a specialized token
				console.log('🔐 Main token lacks AI Gateway permissions, creating specialized token...');
				try {
					aiGatewayToken = await this.ensureAIGatewayToken();
					tokenCreated = !!aiGatewayToken;
					
					if (aiGatewayToken) {
						this.config.devVars.CLOUDFLARE_AI_GATEWAY_TOKEN = aiGatewayToken;
						console.log('✅ Created and using specialized AI Gateway token');
					} else {
						// Specialized token creation failed, fallback to main token with warning
						console.warn('⚠️  WARNING: Specialized token creation failed');
						console.warn('   Falling back to main API token, but it may not have AI Gateway permissions!');
						console.warn('   You may experience 401 errors when using AI Gateway.');
						console.warn('   Please verify your token has: AI Gateway Read, Edit, and Run permissions.');
						this.config.devVars.CLOUDFLARE_AI_GATEWAY_TOKEN = this.config.apiToken;
						aiGatewayToken = this.config.apiToken;
					}
				} catch (tokenErr) {
					tokenError = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
					console.warn(`⚠️  Token creation failed: ${tokenError}`);
					console.warn('   Falling back to main API token');
					this.config.devVars.CLOUDFLARE_AI_GATEWAY_TOKEN = this.config.apiToken;
					aiGatewayToken = this.config.apiToken;
				}
			}

			// Check if gateway exists first
			const aiGatewaySDK = this.getAIGatewaySDK();

			try {
				await aiGatewaySDK.aiGateway.get(gatewayName, {
					account_id: this.config.accountId,
				});
				console.log(`✅ AI Gateway '${gatewayName}' already exists`);
				resources.aiGateway = { name: gatewayName, exists: true, tokenCreated, tokenError };
				return;
			} catch (error: any) {
				if (error?.status !== 404 && !error?.message?.includes('not found')) {
					console.warn(`⚠️  Could not check AI Gateway '${gatewayName}': ${error.message}`);
					resources.aiGateway = { name: gatewayName, exists: false, tokenCreated, tokenError: error.message };
					return;
				}
			}

			// Validate gateway name length
			if (gatewayName.length > 64) {
				const lengthError = `Gateway name too long (${gatewayName.length} > 64 chars)`;
				console.warn(`⚠️  ${lengthError}, skipping creation`);
				resources.aiGateway = { name: gatewayName, exists: false, tokenCreated, tokenError: lengthError };
				return;
			}

			// Create AI Gateway
			console.log(`📦 Creating AI Gateway: ${gatewayName}`);
			await aiGatewaySDK.aiGateway.create({
				account_id: this.config.accountId,
				id: gatewayName,
				cache_invalidate_on_update: true,
				cache_ttl: 3600,
				collect_logs: true,
				rate_limiting_interval: 0,
				rate_limiting_limit: 0,
				rate_limiting_technique: 'sliding',
				authentication: !!aiGatewayToken,
			});

			console.log(`✅ Successfully created AI Gateway: ${gatewayName} (authentication: ${aiGatewayToken ? 'enabled' : 'disabled'})`);
			resources.aiGateway = { name: gatewayName, exists: true, tokenCreated, tokenError };
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.warn(`⚠️  Could not create AI Gateway '${gatewayName}': ${errorMessage}`);
			console.warn('   Continuing setup without AI Gateway...');
			resources.aiGateway = { name: gatewayName, exists: false, tokenCreated, tokenError: errorMessage };
		}
	}

	private async checkTokenPermissions(): Promise<{ hasAIGatewayAccess: boolean; tokenInfo?: any }> {
		try {
			// Step 1: Verify the token is valid and active
			const verifyResponse = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
				headers: { Authorization: `Bearer ${this.config.apiToken}` },
			});

			if (!verifyResponse.ok) {
				console.warn('⚠️  Could not verify API token');
				return { hasAIGatewayAccess: false };
			}

			const verifyData = await verifyResponse.json();
			const tokenStatus = verifyData.result?.status;

			if (tokenStatus !== 'active') {
				console.warn('⚠️  API token is not active');
				return { hasAIGatewayAccess: false };
			}

			console.log('✅ API token is active and valid');

			// Step 2: Check what AI Gateway permission groups exist (doesn't require special permissions)
			try {
				const permGroupsResponse = await fetch('https://api.cloudflare.com/client/v4/user/tokens/permission_groups?name=AI%20Gateway', {
					headers: { Authorization: `Bearer ${this.config.apiToken}` },
				});

				if (permGroupsResponse.ok) {
					const permData = await permGroupsResponse.json();
					const aiGatewayPerms = permData.result || [];
					if (aiGatewayPerms.length > 0) {
						console.log(`ℹ️  Found ${aiGatewayPerms.length} AI Gateway permission group(s):`);
						aiGatewayPerms.forEach((perm: any) => {
							console.log(`   • ${perm.name} (${perm.id})`);
						});
					}
				}
			} catch (e) {
				// Non-critical - just for informational purposes
			}

			// Step 3: Test AI Gateway Read permission by listing gateways
			// Note: We can only test Read permission without side effects
			// Edit permission will be tested at runtime when actually creating the gateway
			const testResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/ai-gateway/gateways`, {
				headers: { Authorization: `Bearer ${this.config.apiToken}` },
			});

			if (testResponse.ok) {
				console.log('✅ Token has AI Gateway Read permission');
				console.log('   Note: Edit permission will be verified when creating gateway');
				return { hasAIGatewayAccess: true, tokenInfo: verifyData.result };
			}

			// Check specific error codes
			if (testResponse.status === 403) {
				console.warn('⚠️  Token does NOT have AI Gateway permissions (403 Forbidden)');
				console.warn('   Required: AI Gateway Read + Edit + Run');
				return { hasAIGatewayAccess: false, tokenInfo: verifyData.result };
			}

			if (testResponse.status === 404) {
				// 404 means endpoint accessible but no gateways exist - token has Read permission
				console.log('✅ Token has AI Gateway Read permission (no gateways yet)');
				console.log('   Note: Edit permission will be verified when creating gateway');
				return { hasAIGatewayAccess: true, tokenInfo: verifyData.result };
			}

			// Other errors - assume no access
			console.warn(`⚠️  AI Gateway permission test failed with status ${testResponse.status}`);
			console.warn('   Assuming no AI Gateway permissions');
			return { hasAIGatewayAccess: false, tokenInfo: verifyData.result };

		} catch (error) {
			console.warn(`⚠️  Token permission check failed: ${error instanceof Error ? error.message : String(error)}`);
			return { hasAIGatewayAccess: false };
		}
	}

	private async ensureAIGatewayToken(): Promise<string | null> {
		const currentToken = this.config.devVars.CLOUDFLARE_AI_GATEWAY_TOKEN;

		if (currentToken && currentToken !== 'optional-your-cf-ai-gateway-token') {
			console.log('✅ AI Gateway token already configured');
			this.aiGatewayCloudflare = new Cloudflare({ apiToken: currentToken });
			return currentToken;
		}

		try {
			console.log('🔐 Creating AI Gateway authentication token...');
			const tokenResponse = await fetch('https://api.cloudflare.com/client/v4/user/tokens', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${this.config.apiToken}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					name: `AI Gateway Token - ${new Date().toISOString().split('T')[0]}`,
					policies: [{
						effect: 'allow',
						resources: { [`com.cloudflare.api.account.${this.config.accountId}`]: '*' },
						permission_groups: [
							{ name: 'AI Gateway Read' },
							{ name: 'AI Gateway Edit' },
							{ name: 'AI Gateway Run' },
							{ name: 'Workers AI Read' },
							{ name: 'Workers AI Edit' },
						],
					}],
					condition: { request_ip: { in: [], not_in: [] } },
					expires_on: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
				}),
			});

			if (!tokenResponse.ok) {
				const errorData = await tokenResponse.json().catch(() => ({ errors: [{ message: 'Unknown error' }] }));
				throw new Error(`API token creation failed: ${errorData.errors?.[0]?.message || tokenResponse.statusText}`);
			}

			const tokenData = await tokenResponse.json();
			if (tokenData.success && tokenData.result?.value) {
				const newToken = tokenData.result.value;
				console.log('✅ AI Gateway authentication token created successfully');
				console.log(`   Token ID: ${tokenData.result.id}`);
				console.warn('⚠️  Please save this token and add it to CLOUDFLARE_AI_GATEWAY_TOKEN:');
				console.warn(`   ${newToken}`);

				// Initialize AI Gateway SDK with new token
				this.aiGatewayCloudflare = new Cloudflare({ apiToken: newToken });
				return newToken;
			}

			throw new Error('Token creation succeeded but no token returned');
		} catch (error) {
			console.warn(`⚠️  Could not create AI Gateway token: ${error instanceof Error ? error.message : String(error)}`);
			return null;
		}
	}

	private getAIGatewaySDK(): Cloudflare {
		return this.aiGatewayCloudflare || this.cloudflare;
	}

	private async detectZoneForDomain(customDomain: string): Promise<{ zoneName: string | null; zoneId: string | null }> {
		console.log(`🔍 Detecting zone for domain: ${customDomain}`);

		// Extract possible zone names
		const domainParts = customDomain.split('.');
		const possibleZones: string[] = [];

		for (let i = 0; i < domainParts.length - 1; i++) {
			const zoneName = domainParts.slice(i).join('.');
			possibleZones.push(zoneName);
		}

		// Test each possible zone
		for (const zoneName of possibleZones) {
			try {
				const zones = await this.cloudflare.zones.list({
					account: { id: this.config.accountId },
					name: zoneName
				});

				if (zones.result && zones.result.length > 0) {
					const zone = zones.result[0];
					console.log(`✅ Found zone: ${zoneName} (ID: ${zone.id})`);
					return { zoneName, zoneId: zone.id };
				}
			} catch (error) {
				console.log(`   Testing zone ${zoneName}: not found`);
			}
		}

		console.warn(`⚠️  No valid zone found for domain: ${customDomain}`);
		return { zoneName: null, zoneId: null };
	}

	private parseWranglerConfig(): any {
		const wranglerPath = join(PROJECT_ROOT, 'wrangler.jsonc');
		if (!existsSync(wranglerPath)) {
			throw new Error('wrangler.jsonc not found in project root');
		}

		const content = readFileSync(wranglerPath, 'utf-8');
		return parse(content);
	}

	private static readonly FALLBACK_WORKER_VARS = new Set([
		'TEMPLATES_REPOSITORY', 'ALLOWED_EMAIL', 'DISPATCH_NAMESPACE', 'CLOUDFLARE_AI_GATEWAY', 'ENABLE_READ_REPLICAS',
		'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_STUDIO_API_KEY', 'OPENROUTER_API_KEY', 'CEREBRAS_API_KEY', 'GROQ_API_KEY',
		'SANDBOX_SERVICE_API_KEY', 'SANDBOX_SERVICE_TYPE', 'SANDBOX_SERVICE_URL',
		'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_AI_GATEWAY_URL', 'CLOUDFLARE_AI_GATEWAY_TOKEN',
		'SERPAPI_KEY', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_ID', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET',
		'JWT_SECRET', 'ENTROPY_KEY', 'ENVIRONMENT', 'SECRETS_ENCRYPTION_KEY',
		'MAX_SANDBOX_INSTANCES', 'SANDBOX_INSTANCE_TYPE', 'CUSTOM_DOMAIN', 'CUSTOM_PREVIEW_DOMAIN',
		'ALLOCATION_STRATEGY', 'GITHUB_EXPORTER_CLIENT_ID', 'GITHUB_EXPORTER_CLIENT_SECRET',
		'CF_ACCESS_ID', 'CF_ACCESS_SECRET', 'SENTRY_DSN'
	]);

	private parseWorkerConfiguration(): Set<string> {
		const configPath = join(PROJECT_ROOT, 'worker-configuration.d.ts');

		if (!existsSync(configPath)) {
			console.warn('⚠️  worker-configuration.d.ts not found, using fallback variable list');
			return SetupManager.FALLBACK_WORKER_VARS;
		}

		try {
			const content = readFileSync(configPath, 'utf-8');
			const envInterfaceMatch = content.match(/interface Env \{([\s\S]*?)\}/);

			if (envInterfaceMatch) {
				const managedVars = new Set<string>();
				const lines = envInterfaceMatch[1].split('\n');

				for (const line of lines) {
					const match = line.trim().match(/^([A-Z_][A-Z0-9_]*)\s*:\s*(string|"[^"]*");?$/);
					if (match) managedVars.add(match[1]);
				}

				return managedVars;
			}

			return SetupManager.FALLBACK_WORKER_VARS;
		} catch (error) {
			console.warn(`⚠️  Could not parse worker-configuration.d.ts: ${error instanceof Error ? error.message : String(error)}`);
			return SetupManager.FALLBACK_WORKER_VARS;
		}
	}

	private async generateDevVarsFile(): Promise<void> {
		console.log('📝 Generating .dev.vars file...');

		const devVarsPath = join(PROJECT_ROOT, '.dev.vars');

		// Parse worker-configuration.d.ts to get all managed variables
		const managedVars = this.parseWorkerConfiguration();

		// Read existing .dev.vars file to preserve values
		const existingVars = new Map<string, string>();
		if (existsSync(devVarsPath)) {
			const existingContent = readFileSync(devVarsPath, 'utf-8');
			existingContent.split('\n').forEach(line => {
				const trimmed = line.trim();
				if (trimmed && !trimmed.startsWith('#')) {
					const [key, ...valueParts] = trimmed.split('=');
					if (key && valueParts.length > 0) {
						const value = valueParts.join('=').replace(/^"(.*)"$/, '$1');
						existingVars.set(key.trim(), value);
					}
				}
			});
		}

		// Variables that the setup script should manage (subset of all managed vars)
		const setupManagedVars = new Set([
			'CUSTOM_DOMAIN', 'ENVIRONMENT', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID',
			'CLOUDFLARE_AI_GATEWAY_TOKEN', 'CLOUDFLARE_AI_GATEWAY_URL',
			'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_STUDIO_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY',
			'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET',
			'GITHUB_EXPORTER_CLIENT_ID', 'GITHUB_EXPORTER_CLIENT_SECRET',
			'JWT_SECRET', 'WEBHOOK_SECRET'
		]);

		// Collect unmanaged variables to preserve (anything not in worker config or setup managed)
		const preservedVars = new Map<string, string>();
		existingVars.forEach((value, key) => {
			if (!managedVars.has(key) && !setupManagedVars.has(key)) {
				preservedVars.set(key, value);
			}
		});

		// For variables in worker config but not setup managed, preserve existing values
		const workerConfigVarsToPreserve = new Map<string, string>();
		managedVars.forEach(varName => {
			if (!setupManagedVars.has(varName) && existingVars.has(varName)) {
				workerConfigVarsToPreserve.set(varName, existingVars.get(varName)!);
			}
		});

		let content = '';

		// Security Configuration
		content += '# Security Configuration\n';
		content += `CUSTOM_DOMAIN="${this.config.customDomain}"\n`;
		content += 'ENVIRONMENT="dev"\n\n';

		// Essential Secrets
		content += '# Essential Secrets\n';
		content += `CLOUDFLARE_API_TOKEN="${this.config.apiToken}"\n`;
		content += `CLOUDFLARE_ACCOUNT_ID="${this.config.accountId}"\n\n`;

		// AI Gateway Configuration
		content += '# AI Gateway Configuration\n';
        content += `CLOUDFLARE_AI_GATEWAY_TOKEN="${this.config.devVars?.CLOUDFLARE_AI_GATEWAY_TOKEN}"\n`;
		if (this.config.aiGatewayUrl) {
			content += `CLOUDFLARE_AI_GATEWAY_URL="${this.config.aiGatewayUrl}"\n`;
		}
		content += '\n';

		// Provider specific secrets
		content += '# Provider specific secrets\n';
		const providerVars = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_STUDIO_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY'];
		for (const varName of providerVars) {
			if (this.config.devVars[varName]) {
				content += `${varName}="${this.config.devVars[varName]}"\n`;
			} else {
				content += `#${varName}=""\n`;
			}
		}
		content += '\n';

		// OAuth Configuration
		content += '# OAuth Configuration\n';
		const oauthVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];
		for (const varName of oauthVars) {
			if (this.config.devVars[varName]) {
				content += `${varName}="${this.config.devVars[varName]}"\n`;
			} else {
				content += `#${varName}=""\n`;
			}
		}

		// GitHub Exporter Configuration (if configured)
		if (this.config.devVars.GITHUB_EXPORTER_CLIENT_ID || this.config.devVars.GITHUB_EXPORTER_CLIENT_SECRET) {
			content += '\n# GitHub Exporter OAuth Configuration\n';
			content += `GITHUB_EXPORTER_CLIENT_ID="${this.config.devVars.GITHUB_EXPORTER_CLIENT_ID || ''}"\n`;
			content += `GITHUB_EXPORTER_CLIENT_SECRET="${this.config.devVars.GITHUB_EXPORTER_CLIENT_SECRET || ''}"\n`;
		}
		content += '\n';

		// Required secrets
		content += '# Required secrets\n';
		content += `JWT_SECRET="${this.config.devVars.JWT_SECRET}"\n`;
		content += `WEBHOOK_SECRET="${this.config.devVars.WEBHOOK_SECRET}"\n`;
		if (this.config.devVars.USE_TUNNEL_FOR_PREVIEW) {
			content += `USE_TUNNEL_FOR_PREVIEW="${this.config.devVars.USE_TUNNEL_FOR_PREVIEW}"\n`;
		}

		// Worker configuration variables (preserved from existing .dev.vars)
		if (workerConfigVarsToPreserve.size > 0) {
			content += '\n# Worker configuration variables (preserved)\n';
			// Sort variables by name for consistent output
			const sortedWorkerVars = Array.from(workerConfigVarsToPreserve.entries()).sort(([a], [b]) => a.localeCompare(b));
			for (const [key, value] of sortedWorkerVars) {
				content += `${key}="${value}"\n`;
			}
		}

		// Additional worker config variables not yet set (as commented placeholders)
		const unsetWorkerVars = Array.from(managedVars).filter(varName =>
			!setupManagedVars.has(varName) && !workerConfigVarsToPreserve.has(varName)
		).sort();

		if (unsetWorkerVars.length > 0) {
			content += '\n# Additional worker configuration variables (uncomment and set as needed)\n';
			for (const varName of unsetWorkerVars) {
				content += `#${varName}=""\n`;
			}
		}

		// Preserved variables (not in worker config at all)
		if (preservedVars.size > 0) {
			content += '\n# Additional variables (preserved from existing .dev.vars)\n';
			const sortedPreserved = Array.from(preservedVars.entries()).sort(([a], [b]) => a.localeCompare(b));
			for (const [key, value] of sortedPreserved) {
				content += `${key}="${value}"\n`;
			}
		}

		writeFileSync(devVarsPath, content, 'utf-8');

		const totalPreserved = preservedVars.size + workerConfigVarsToPreserve.size;
		if (totalPreserved > 0) {
			console.log(`✅ .dev.vars file updated (preserved ${totalPreserved} existing variables)`);
			if (workerConfigVarsToPreserve.size > 0) {
				console.log(`   • ${workerConfigVarsToPreserve.size} worker configuration variables preserved`);
			}
			if (preservedVars.size > 0) {
				console.log(`   • ${preservedVars.size} custom variables preserved`);
			}
		} else {
			console.log('✅ .dev.vars file created successfully');
		}
	}

	private async generateProdVarsFile(): Promise<void> {
		if (!this.config.setupRemote || !this.config.prodVars || !this.config.prodDomain) return;

		console.log('📝 Generating .prod.vars file...');

		const prodVarsPath = join(PROJECT_ROOT, '.prod.vars');
		const managedVars = this.parseWorkerConfiguration();

		const setupManagedVars = new Set([
			'CUSTOM_DOMAIN', 'ENVIRONMENT', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID',
			'CLOUDFLARE_AI_GATEWAY_TOKEN', 'CLOUDFLARE_AI_GATEWAY_URL',
			'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_STUDIO_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY',
			'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET',
			'GITHUB_EXPORTER_CLIENT_ID', 'GITHUB_EXPORTER_CLIENT_SECRET',
			'JWT_SECRET', 'WEBHOOK_SECRET'
			// Note: USE_TUNNEL_FOR_PREVIEW is intentionally excluded - it's dev-only
		]);

		let content = '';

		// Production Configuration
		content += '# Production Configuration\n';
		content += `CUSTOM_DOMAIN="${this.config.prodDomain}"\n`;
		content += 'ENVIRONMENT="prod"\n\n';

		// Essential Secrets
		content += '# Essential Secrets\n';
		content += `CLOUDFLARE_API_TOKEN="${this.config.apiToken}"\n`;
		content += `CLOUDFLARE_ACCOUNT_ID="${this.config.accountId}"\n\n`;

		// AI Gateway Configuration
		content += '# AI Gateway Configuration\n';
        content += `CLOUDFLARE_AI_GATEWAY_TOKEN="${this.config.prodVars?.CLOUDFLARE_AI_GATEWAY_TOKEN}"\n`;
		if (this.config.aiGatewayUrl) {
			content += `CLOUDFLARE_AI_GATEWAY_URL="${this.config.aiGatewayUrl}"\n`;
		}
		content += '\n';

		// Provider specific secrets
		content += '# Provider specific secrets\n';
		const providerVars = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_AI_STUDIO_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY'];
		for (const varName of providerVars) {
			if (this.config.prodVars[varName]) {
				content += `${varName}="${this.config.prodVars[varName]}"\n`;
			} else {
				content += `#${varName}=""\n`;
			}
		}
		content += '\n';

		// OAuth Configuration
		content += '# OAuth Configuration\n';
		const oauthVars = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];
		for (const varName of oauthVars) {
			if (this.config.prodVars[varName]) {
				content += `${varName}="${this.config.prodVars[varName]}"\n`;
			} else {
				content += `#${varName}=""\n`;
			}
		}

		// GitHub Exporter Configuration (if configured)
		if (this.config.prodVars.GITHUB_EXPORTER_CLIENT_ID || this.config.prodVars.GITHUB_EXPORTER_CLIENT_SECRET) {
			content += '\n# GitHub Exporter OAuth Configuration\n';
			content += `GITHUB_EXPORTER_CLIENT_ID="${this.config.prodVars.GITHUB_EXPORTER_CLIENT_ID || ''}"\n`;
			content += `GITHUB_EXPORTER_CLIENT_SECRET="${this.config.prodVars.GITHUB_EXPORTER_CLIENT_SECRET || ''}"\n`;
		}
		content += '\n';

		// Required secrets
		content += '# Required secrets\n';
		content += `JWT_SECRET="${this.config.prodVars.JWT_SECRET}"\n`;
		content += `WEBHOOK_SECRET="${this.config.prodVars.WEBHOOK_SECRET}"\n`;

		writeFileSync(prodVarsPath, content, 'utf-8');
		console.log('✅ .prod.vars file created successfully for production deployment');
	}

	private async updateWranglerConfig(resources: ResourceInfo): Promise<void> {
		console.log('🔧 Updating wrangler.jsonc configuration...');

		const wranglerPath = join(PROJECT_ROOT, 'wrangler.jsonc');
		const content = readFileSync(wranglerPath, 'utf-8');
		let updatedContent = content;

		// Update KV namespace IDs and remote flags
		for (const kv of resources.kvNamespaces) {
			const kvPath = ['kv_namespaces'];
			const kvNamespaces = parse(content).kv_namespaces || [];
			const updatedKvNamespaces = kvNamespaces.map((ns: any) => {
				if (ns.binding === kv.binding) {
					return {
						...ns,
						id: kv.id,
						remote: kv.accessible  // Set remote based on accessibility
					};
				}
				return ns;
			});

			const edits = modify(updatedContent, kvPath, updatedKvNamespaces, {
				formattingOptions: { insertSpaces: true, tabSize: 4 }
			});
			updatedContent = applyEdits(updatedContent, edits);
		}

		// Update D1 database IDs and remote flags
		for (const db of resources.d1Databases) {
			const dbPath = ['d1_databases'];
			const databases = parse(updatedContent).d1_databases || [];
			const updatedDatabases = databases.map((database: any) => {
				if (database.binding === db.binding) {
					return {
						...database,
						database_id: db.id,
						remote: db.accessible  // Set remote based on accessibility
					};
				}
				return database;
			});

			const edits = modify(updatedContent, dbPath, updatedDatabases, {
				formattingOptions: { insertSpaces: true, tabSize: 4 }
			});
			updatedContent = applyEdits(updatedContent, edits);
		}

		// Update R2 bucket remote flags
		const wranglerConfig = parse(updatedContent);
		if (wranglerConfig.r2_buckets && resources.r2Buckets.length > 0) {
			const r2Path = ['r2_buckets'];
			const r2Buckets = wranglerConfig.r2_buckets || [];
			const updatedR2Buckets = r2Buckets.map((bucket: any) => {
				const matchingResource = resources.r2Buckets.find(r => r.binding === bucket.binding);
				if (matchingResource) {
					return {
						...bucket,
						remote: matchingResource.accessible  // Set remote based on accessibility
					};
				}
				return bucket;
			});

			const r2Edits = modify(updatedContent, r2Path, updatedR2Buckets, {
				formattingOptions: { insertSpaces: true, tabSize: 4 }
			});
			updatedContent = applyEdits(updatedContent, r2Edits);
		}

		// Update dispatch namespace remote flags
		if (wranglerConfig.dispatch_namespaces && resources.dispatchNamespaces.length > 0) {
			const dispatchPath = ['dispatch_namespaces'];
			const dispatchNamespaces = wranglerConfig.dispatch_namespaces || [];
			const updatedDispatchNamespaces = dispatchNamespaces.map((dispatch: any) => {
				const matchingResource = resources.dispatchNamespaces.find(r => r.binding === dispatch.binding);
				if (matchingResource) {
					return {
						...dispatch,
						remote: matchingResource.accessible  // Set remote based on accessibility
					};
				}
				return dispatch;
			});

			const dispatchEdits = modify(updatedContent, dispatchPath, updatedDispatchNamespaces, {
				formattingOptions: { insertSpaces: true, tabSize: 4 }
			});
			updatedContent = applyEdits(updatedContent, dispatchEdits);
		}

		// Determine which domain to use in wrangler.jsonc
		// Priority: Production domain > Custom local domain (if not localhost) > Don't set at all
		const wranglerDomain = this.config.setupRemote && this.config.prodDomain
			? this.config.prodDomain
			: (this.config.customDomain !== 'localhost:5173' ? this.config.customDomain : null);

		if (wranglerDomain) {
			// Update CUSTOM_DOMAIN in vars with production or custom domain
			const varsEdits = modify(updatedContent, ['vars', 'CUSTOM_DOMAIN'], wranglerDomain, {
				formattingOptions: { insertSpaces: true, tabSize: 4 }
			});
			updatedContent = applyEdits(updatedContent, varsEdits);

			// Add routes for the domain
			const zone = resources.zones[0];
			const routes = [
				{
					pattern: wranglerDomain,
					custom_domain: true
				},
				{
					pattern: `*${wranglerDomain}/*`,
					custom_domain: false,
					...(zone ? { zone_id: zone.id } : {})
				}
			];

			const routesEdits = modify(updatedContent, ['routes'], routes, {
				formattingOptions: { insertSpaces: true, tabSize: 4 }
			});
			updatedContent = applyEdits(updatedContent, routesEdits);

			// Set workers_dev = false and preview_urls = false for custom domain
			const workersDevEdits = modify(updatedContent, ['workers_dev'], false, {
				formattingOptions: { insertSpaces: true, tabSize: 4 }
			});
			updatedContent = applyEdits(updatedContent, workersDevEdits);

			const previewUrlsEdits = modify(updatedContent, ['preview_urls'], false, {
				formattingOptions: { insertSpaces: true, tabSize: 4 }
			});
			updatedContent = applyEdits(updatedContent, previewUrlsEdits);

			console.log(`✅ Updated routes for domain: ${wranglerDomain}`);
			if (zone) {
				console.log(`   • Main domain: ${wranglerDomain} (custom_domain: true)`);
				console.log(`   • Wildcard pattern: *${wranglerDomain}/* (zone_id: ${zone.id})`);
			} else {
				console.log(`   • Main domain: ${wranglerDomain} (custom_domain: true)`);
				console.log(`   • Wildcard pattern: *${wranglerDomain}/* (no zone detected)`);
			}

			if (this.config.setupRemote && this.config.prodDomain) {
				console.log(`   • Production domain configured for deployment`);
			}
		} else {
			// For localhost-only development, remove routes and enable workers.dev
			const routesEdits = modify(updatedContent, ['routes'], undefined, {
				formattingOptions: { insertSpaces: true, tabSize: 4 }
			});
			updatedContent = applyEdits(updatedContent, routesEdits);

			// Don't set CUSTOM_DOMAIN for localhost (keep it unset or remove it)
			const varsEdits = modify(updatedContent, ['vars', 'CUSTOM_DOMAIN'], 'localhost:5173', {
				formattingOptions: { insertSpaces: true, tabSize: 4 }
			});
			updatedContent = applyEdits(updatedContent, varsEdits);

			// Set workers_dev = true and preview_urls = true for localhost development
			const workersDevEdits = modify(updatedContent, ['workers_dev'], true, {
				formattingOptions: { insertSpaces: true, tabSize: 4 }
			});
			updatedContent = applyEdits(updatedContent, workersDevEdits);

			const previewUrlsEdits = modify(updatedContent, ['preview_urls'], true, {
				formattingOptions: { insertSpaces: true, tabSize: 4 }
			});
			updatedContent = applyEdits(updatedContent, previewUrlsEdits);

			console.log('✅ Configured for localhost development (workers.dev deployment)');
		}

		writeFileSync(wranglerPath, updatedContent, 'utf-8');
		console.log('✅ wrangler.jsonc updated successfully');
	}

	private async updateViteConfig(): Promise<void> {
		console.log('🔧 Updating vite.config.ts configuration...');

		const viteConfigPath = join(PROJECT_ROOT, 'vite.config.ts');
		if (!existsSync(viteConfigPath)) {
			console.warn('⚠️  vite.config.ts not found - skipping vite configuration update');
			return;
		}

		let content = readFileSync(viteConfigPath, 'utf-8');

		// Update the remoteBindings setting based on user preference
		const remoteBindingsValue = this.config.useRemoteBindings ? 'true' : 'false';

		// Look for the experimental.remoteBindings setting and update it
		const remoteBindingsRegex = /experimental:\s*{\s*remoteBindings:\s*(true|false)\s*}/;

		if (remoteBindingsRegex.test(content)) {
			content = content.replace(
				remoteBindingsRegex,
				`experimental: { remoteBindings: ${remoteBindingsValue} }`
			);
			console.log(`✅ Updated vite.config.ts remoteBindings to: ${remoteBindingsValue}`);
		} else {
			console.warn('⚠️  Could not find remoteBindings setting in vite.config.ts');
			console.warn(`   Please manually set: experimental: { remoteBindings: ${remoteBindingsValue} }`);
		}

		writeFileSync(viteConfigPath, content, 'utf-8');
		console.log('✅ vite.config.ts updated successfully');
	}

	private async generateReadinessReport(resources: ResourceInfo): Promise<ReadinessReport> {
		console.log('📊 Generating readiness report...');

		const issues: string[] = [];
		const suggestions: string[] = [];
		const resourcesCreated: string[] = [];

		// Check for created resources
		resources.kvNamespaces.forEach(kv => {
			const status = kv.accessible ? '✅' : '🏠 (local-only)';
			resourcesCreated.push(`KV Namespace: ${kv.name} (${kv.binding}) ${status}`);
		});

		resources.d1Databases.forEach(db => {
			const status = db.accessible ? '✅' : '🏠 (local-only)';
			resourcesCreated.push(`D1 Database: ${db.name} (${db.binding}) ${status}`);
		});

		resources.r2Buckets.forEach(bucket => {
			const status = bucket.accessible ? '✅' : '🏠 (local-only)';
			resourcesCreated.push(`R2 Bucket: ${bucket.name} (${bucket.binding}) ${status}`);
		});

		resources.dispatchNamespaces.forEach(dispatch => {
			const status = dispatch.accessible ? '✅' : '🏠 (local-only)';
			resourcesCreated.push(`Dispatch Namespace: ${dispatch.name} (${dispatch.binding}) ${status}`);
		});

		if (resources.aiGateway) {
			const gateway = resources.aiGateway;
			const status = gateway.exists ? '✅' : '❌';
			resourcesCreated.push(`AI Gateway: ${gateway.name} ${status}`);

			if (gateway.tokenError) {
				issues.push(`AI Gateway token issue: ${gateway.tokenError}`);
			}
			if (!gateway.tokenCreated && gateway.exists) {
				suggestions.push('Consider configuring AI Gateway authentication token for enhanced security');
			}
		}

		// Check for potential issues
		if (!this.config.customDomain || this.config.customDomain === 'localhost:5173') {
			suggestions.push('Consider setting up a custom domain for production deployment');
		}

		if (resources.zones.length === 0 && this.config.customDomain && this.config.customDomain !== 'localhost:5173') {
			issues.push('Custom domain zone not found - domain routing may not work');
			suggestions.push('Ensure your domain is managed by Cloudflare and API token has zone permissions');
		}

		// Check account features (simplified check)
		let accountInfo;
		try {
			const account = await this.cloudflare.accounts.get({ account_id: this.config.accountId });
			accountInfo = {
				plan: 'Free', // This would need to be determined from actual account data
				features: ['Workers', 'KV', 'D1', 'R2'] // Simplified feature list
			};
		} catch (error) {
			issues.push('Could not retrieve account information');
		}

		const localDevReady = issues.length === 0;
		const deploymentReady = localDevReady && this.config.customDomain !== 'localhost:5173';

		return {
			localDevReady,
			deploymentReady,
			issues,
			suggestions,
			resourcesCreated,
			accountInfo
		};
	}

	private displayFinalReport(report: ReadinessReport, resources: ResourceInfo): void {
		console.log('\n🎯 Setup Complete - Readiness Report');
		console.log('=====================================\n');

		// Local Development Status
		console.log(`🚀 Local Development: ${report.localDevReady ? '✅ READY' : '❌ ISSUES FOUND'}`);
		console.log(`🌍 Remote Deployment: ${report.deploymentReady ? '✅ READY' : '⚠️  PARTIAL'}`);
		console.log('');

		// Resources Created
		if (report.resourcesCreated.length > 0) {
			console.log('📦 Resources Created/Validated:');
			report.resourcesCreated.forEach(resource => {
				console.log(`   ✅ ${resource}`);
			});
			console.log('');
		}

		// Issues
		if (report.issues.length > 0) {
			console.log('❌ Issues Found:');
			report.issues.forEach(issue => {
				console.log(`   • ${issue}`);
			});
			console.log('');
		}

		// Suggestions
		if (report.suggestions.length > 0) {
			console.log('💡 Suggestions:');
			report.suggestions.forEach(suggestion => {
				console.log(`   • ${suggestion}`);
			});
			console.log('');
		}

		// Next Steps
		console.log('🎯 Next Steps:');
		console.log(`   1. Run \`${this.packageManager} run dev\` to start local development`);
		console.log('   2. Visit your app at http://localhost:5173');
		console.log('   3. Database and templates are ready to use!');

		if (this.config.setupRemote && this.config.prodDomain) {
			console.log(`   4. For production deployment to ${this.config.prodDomain}, run \`npm run deploy\``);
			console.log('   5. .prod.vars file is ready for production environment variables');
		} else if (this.config.customDomain && this.config.customDomain !== 'localhost:5173') {
			console.log('   4. For production deployment, run `npm run deploy`');
		}

		if (!this.config.useRemoteBindings) {
			console.log('\n📝 Local-Only Mode:');
			console.log('   • All Cloudflare resources configured for local development');
			console.log('   • Perfect for free tier users and local testing');
			console.log('   • To enable remote bindings later, re-run the setup script');
		}

		// Additional setup information
		const hasGoogleAI = Object.keys(this.config.devVars).includes('GOOGLE_AI_STUDIO_API_KEY');
		const hasOAuth = ['GOOGLE_CLIENT_ID', 'GITHUB_CLIENT_ID', 'GITHUB_EXPORTER_CLIENT_ID'].some(key =>
			Object.keys(this.config.devVars).includes(key)
		);
		const hasRemoteR2 = resources.r2Buckets.some(bucket => bucket.accessible);
		const isARM64 = process.arch === 'arm64';

		if (!hasGoogleAI || hasOAuth || !hasRemoteR2 || isARM64) {
			console.log('\n💡 Setup Information:');

			if (!hasGoogleAI) {
				console.log('   • Edit worker/agents/inferutils/config.ts to configure AI models');
				console.log('   • Update fallback models from Gemini to your available providers');
			}

			if (hasOAuth) {
				console.log('   • OAuth credentials configured - users can now log in');
				if (Object.keys(this.config.devVars).includes('GITHUB_EXPORTER_CLIENT_ID')) {
					console.log('   • GitHub Export OAuth configured - users can export apps to GitHub');
				}
			}

			if (!hasRemoteR2) {
				console.log('   • Templates deployed to local R2 for development');
				console.log('   • For production, ensure remote R2 access is available');
			} else {
				console.log('   • Templates deployed to both local and remote R2');
				console.log('   • Ready for both local development and production');
			}

			if (isARM64) {
				console.log('   • SandboxDockerfile patched for ARM64 local development');
				console.log('   • ARM64 flags will be automatically removed during deployment');
			}
		}

		console.log('\n✨ Happy coding with VibeSDK! ✨');
	}

	private async updateWorkerConfiguration(): Promise<void> {
		const workerConfigPath = join(PROJECT_ROOT, 'worker-configuration.d.ts');

		if (!existsSync(workerConfigPath) || !this.config.customProviderKeys?.length) {
			return;
		}

		console.log('📝 Updating worker configuration for custom providers...');

		try {
			let content = readFileSync(workerConfigPath, 'utf-8');

			// Find the Env interface
			const envInterfaceMatch = content.match(/interface Env \{([\s\S]*?)\}/);
			if (!envInterfaceMatch) {
				console.warn('⚠️  Could not find Env interface in worker-configuration.d.ts');
				return;
			}

			// Check which custom keys need to be added
			const keysToAdd: string[] = [];
			for (const customProvider of this.config.customProviderKeys) {
				if (!content.includes(`${customProvider.key}: string;`)) {
					keysToAdd.push(customProvider.key);
				}
			}

			if (keysToAdd.length === 0) {
				console.log('✅ Worker configuration already up to date');
				return;
			}

			// Add missing keys to the Env interface
			const envContent = envInterfaceMatch[1];
			const lastApiKeyMatch = envContent.match(/.*_API_KEY: string;/g);

			if (lastApiKeyMatch) {
				const lastApiKeyLine = lastApiKeyMatch[lastApiKeyMatch.length - 1];
				const insertPoint = content.indexOf(lastApiKeyLine) + lastApiKeyLine.length;

				const newKeys = keysToAdd.map(key => `\n\t\t${key}: string;`).join('');
				content = content.slice(0, insertPoint) + newKeys + content.slice(insertPoint);
			}

			// Also update the NodeJS.ProcessEnv extends part
			const processEnvMatch = content.match(/interface ProcessEnv extends StringifyValues<Pick<Cloudflare\.Env, "(.*?)">>/);
			if (processEnvMatch) {
				const existingKeys = processEnvMatch[1];
				const missingKeys = keysToAdd.filter(key => !existingKeys.includes(key));

				if (missingKeys.length > 0) {
					const updatedKeys = existingKeys + ' | "' + missingKeys.join('" | "') + '"';
					content = content.replace(processEnvMatch[0], processEnvMatch[0].replace(existingKeys, updatedKeys));
				}
			}

			writeFileSync(workerConfigPath, content, 'utf-8');
			console.log(`✅ Added ${keysToAdd.length} custom provider key(s) to worker configuration`);

		} catch (error) {
			console.warn(`⚠️  Could not update worker configuration: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async patchDockerfileForARM64(): Promise<void> {
		// Check if we're running on ARM64 architecture
		const arch = process.arch;
		const platform = process.platform;

		if (arch !== 'arm64') {
			console.log('ℹ️  Non-ARM64 platform detected - no Dockerfile patching needed');
			return;
		}

		console.log('\n🔧 ARM64 Platform Configuration');
		console.log('-------------------------------\n');
		console.log(`🏗️  ARM64 ${platform} detected - patching SandboxDockerfile for local development`);

		const dockerfilePath = join(PROJECT_ROOT, 'SandboxDockerfile');

		if (!existsSync(dockerfilePath)) {
			console.warn('⚠️  SandboxDockerfile not found - skipping ARM64 patching');
			return;
		}

		try {
			let content = readFileSync(dockerfilePath, 'utf-8');
			let modified = false;

			// Split content into lines for processing
			const lines = content.split('\n');
			const updatedLines = lines.map(line => {
				// Look for FROM statements that don't already have --platform
				const fromMatch = line.match(/^(\s*FROM\s+)(?!.*--platform=)(.*)/);
				if (fromMatch) {
					modified = true;
					const [, prefix, image] = fromMatch;
					return `${prefix}--platform=linux/arm64 ${image}`;
				}
				return line;
			});

			if (modified) {
				writeFileSync(dockerfilePath, updatedLines.join('\n'), 'utf-8');
				console.log('✅ SandboxDockerfile patched with ARM64 platform flags');

				console.log('\n⚠️  IMPORTANT ARM64 NOTICE:');
				console.log('   • SandboxDockerfile has been modified for local ARM64 development');
				console.log('   • The --platform=linux/arm64 flags are for local development only');
				console.log('   • These flags will be automatically removed during deployment');
				console.log('   • Do NOT commit these changes to production repositories');

			} else {
				console.log('✅ SandboxDockerfile already contains ARM64 platform flags');
			}

		} catch (error) {
			console.error('❌ Failed to patch SandboxDockerfile:', error instanceof Error ? error.message : String(error));
			console.error('   You may need to manually add --platform=linux/arm64 to FROM statements');
		}
	}

	private async deployTemplates(resources: ResourceInfo): Promise<void> {
		console.log('\n📦 Templates Deployment');
		console.log('------------------------\n');

		// Check if we have R2 bucket configured
		const wranglerConfig = this.parseWranglerConfig();
		const templatesBucket = wranglerConfig.r2_buckets?.find(
			(bucket: any) => bucket.binding === 'TEMPLATES_BUCKET'
		);

		if (!templatesBucket) {
			console.log('ℹ️  No TEMPLATES_BUCKET found in wrangler.jsonc - skipping templates deployment');
			return;
		}

		// Check if templates repository is configured
		const templatesRepo = wranglerConfig.vars?.TEMPLATES_REPOSITORY;
		if (!templatesRepo) {
			console.log('ℹ️  No TEMPLATES_REPOSITORY configured - skipping templates deployment');
			return;
		}

		const templatesDir = join(PROJECT_ROOT, 'templates');
		const hasRemoteR2 = resources.r2Buckets.some(bucket => bucket.accessible);

		try {
			console.log(`📥 Setting up templates from: ${templatesRepo}`);

			// Create templates directory if it doesn't exist
			if (!existsSync(templatesDir)) {
				execSync(`mkdir -p "${templatesDir}"`, { cwd: PROJECT_ROOT });
			}

			// Clone repository if not already present
			if (!existsSync(join(templatesDir, '.git'))) {
				console.log(`🔄 Cloning templates repository...`);
				execSync(`git clone "${templatesRepo}" "${templatesDir}"`, {
					stdio: 'pipe',
					cwd: PROJECT_ROOT,
				});
				console.log('✅ Templates repository cloned successfully');
			} else {
				console.log('📁 Templates repository already exists, pulling latest changes...');
				try {
					execSync('git pull origin main || git pull origin master', {
						stdio: 'pipe',
						cwd: templatesDir,
					});
					console.log('✅ Templates repository updated');
				} catch (pullError) {
					console.warn('⚠️  Could not pull latest changes, continuing with existing templates');
				}
			}

			// Check if deploy script exists
			const deployScript = join(templatesDir, 'deploy_templates.sh');
			if (!existsSync(deployScript)) {
				console.warn('⚠️  deploy_templates.sh not found in templates repository');
				console.warn('   Skipping template deployment - templates may need to be deployed manually');
				return;
			}

			// Make script executable
			execSync(`chmod +x "${deployScript}"`, { cwd: templatesDir });

			// Deploy to local R2 first (always available)
			console.log(`🚀 Deploying templates to local R2 bucket: ${templatesBucket.bucket_name}`);

			const localDeployEnv = {
				...process.env,
				CLOUDFLARE_API_TOKEN: this.config.apiToken,
				CLOUDFLARE_ACCOUNT_ID: this.config.accountId,
				BUCKET_NAME: templatesBucket.bucket_name,
				R2_BUCKET_NAME: templatesBucket.bucket_name,
				LOCAL_R2: 'true',
			};

			execSync('./deploy_templates.sh', {
				stdio: 'inherit',
				cwd: templatesDir,
				env: localDeployEnv,
			});

			console.log('✅ Templates deployed successfully to local R2');

			// Deploy to remote R2 if available
			if (hasRemoteR2) {
				console.log(`🚀 Deploying templates to remote R2 bucket: ${templatesBucket.bucket_name}`);

				const remoteDeployEnv = {
					...process.env,
					CLOUDFLARE_API_TOKEN: this.config.apiToken,
					CLOUDFLARE_ACCOUNT_ID: this.config.accountId,
					BUCKET_NAME: templatesBucket.bucket_name,
					R2_BUCKET_NAME: templatesBucket.bucket_name,
					LOCAL_R2: 'false',
				};

				try {
					execSync('./deploy_templates.sh', {
						stdio: 'inherit',
						cwd: templatesDir,
						env: remoteDeployEnv,
					});

					console.log('✅ Templates deployed successfully to remote R2');
					console.log('🎯 Templates ready for both local development and production!');
				} catch (remoteError) {
					console.warn('⚠️  Remote R2 deployment failed:', remoteError instanceof Error ? remoteError.message : String(remoteError));
					console.warn('   Local R2 deployment successful - development can continue');
					console.warn('   Remote deployment can be done manually later or on next setup run');
				}
			} else {
				console.log('📝 Note: Templates deployed to local R2 for development');
				console.log('   For production deployment, ensure remote R2 access is available');
			}

		} catch (error) {
			// Don't fail the entire setup if templates fail
			console.error('❌ Templates deployment failed:', error instanceof Error ? error.message : String(error));
			console.error('💡 Troubleshooting:');
			console.error('   1. Check if git is installed and accessible');
			console.error('   2. Verify templates repository URL is correct');
			console.error('   3. Ensure deploy_templates.sh script exists in templates repo');
			console.error('   4. Check R2 bucket access permissions');
			console.error('\n⚠️  Continuing setup - templates can be deployed manually later');

			if (hasRemoteR2) {
				console.error(`   Manual command: cd templates && ./deploy_templates.sh`);
			} else {
				console.error(`   Manual command: cd templates && LOCAL_R2=true ./deploy_templates.sh`);
			}
		}
	}

	private async setupDatabase(resources: ResourceInfo): Promise<void> {
		console.log('\n🗄️  Database Setup');
		console.log('------------------\n');

		const hasRemoteD1 = resources.d1Databases.some(db => db.accessible);

		try {
			console.log('📊 Generating database schema...');
			execSync(`${this.packageManager} run db:generate`, {
				stdio: 'inherit',
				cwd: PROJECT_ROOT
			});
			console.log('✅ Database schema generated successfully');

			console.log('\n🔄 Running local database migrations...');
			execSync(`${this.packageManager} run db:migrate:local`, {
				stdio: 'inherit',
				cwd: PROJECT_ROOT
			});
			console.log('✅ Local database migrations completed successfully');

			// Run remote migrations if D1 is accessible
			if (hasRemoteD1) {
				console.log('\n🌍 Running remote database migrations...');
				try {
					execSync(`${this.packageManager} run db:migrate:remote`, {
						stdio: 'inherit',
						cwd: PROJECT_ROOT
					});
					console.log('✅ Remote database migrations completed successfully');
				} catch (remoteError) {
					console.error('⚠️  Remote database migration failed:', remoteError instanceof Error ? remoteError.message : String(remoteError));
					console.error('   Local database is ready, but remote database may need manual migration');
					console.error(`   Run manually: ${this.packageManager} run db:migrate:remote`);
				}
			} else {
				console.log('\n📝 Remote D1 not accessible - skipping remote migrations');
				console.log('   Local database setup complete for development');
			}

			console.log('\n🎯 Database setup complete!');
			if (hasRemoteD1) {
				console.log('   ✅ Both local and remote databases are ready');
			} else {
				console.log('   ✅ Local database is ready for development');
			}
		} catch (error) {
			console.error('\n❌ Database setup failed:', error instanceof Error ? error.message : String(error));
			console.error('💡 You can run these commands manually:');
			console.error(`   ${this.packageManager} run db:generate`);
			console.error(`   ${this.packageManager} run db:migrate:local`);
			if (hasRemoteD1) {
				console.error(`   ${this.packageManager} run db:migrate:remote`);
			}
			console.error('\n⚠️  Continuing setup - you can run database commands manually later');
		}
	}
}

// Main execution
async function main() {
	const setup = new SetupManager();
	await setup.setup();
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error('Setup failed:', error);
		process.exit(1);
	});
}
