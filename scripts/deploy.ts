#!/usr/bin/env node

/**
 * Cloudflare Orange Build - Automated Deployment Script
 *
 * This script handles the complete setup and deployment process for the
 * Cloudflare Orange Build platform, including:
 * - Workers for Platforms dispatch namespace creation
 * - Templates repository deployment to R2
 * - Container configuration updates
 * - Environment validation
 *
 * Used by the "Deploy to Cloudflare" button for one-click deployment.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse, modify, applyEdits } from 'jsonc-parser';
import Cloudflare from 'cloudflare';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// Types for configuration
interface WranglerConfig {
	name: string;
	dispatch_namespaces?: Array<{
		binding: string;
		namespace: string;
		experimental_remote?: boolean;
	}>;
	r2_buckets?: Array<{
		binding: string;
		bucket_name: string;
		experimental_remote?: boolean;
	}>;
	containers?: Array<{
		class_name: string;
		image: string;
		max_instances: number;
		instance_type?: {
			vcpu: number;
			memory_mib: number;
			disk_mb?: number;
		} | string;
		rollout_step_percentage?: number;
	}>;
	d1_databases?: Array<{
		binding: string;
		database_name: string;
		database_id: string;
		migrations_dir?: string;
		experimental_remote?: boolean;
	}>;
	routes?: Array<{
		pattern: string;
		custom_domain: boolean;
        zone_id?: string;
	}>;
	vars?: {
		TEMPLATES_REPOSITORY?: string;
		CLOUDFLARE_AI_GATEWAY?: string;
		MAX_SANDBOX_INSTANCES?: string;
		CUSTOM_DOMAIN?: string;
		CUSTOM_PREVIEW_DOMAIN?: string;
		SANDBOX_INSTANCE_TYPE?: string;
		DISPATCH_NAMESPACE?: string;
		[key: string]: string | undefined;
	};
}

interface EnvironmentConfig {
	CLOUDFLARE_API_TOKEN: string;
	CLOUDFLARE_ACCOUNT_ID: string;
	TEMPLATES_REPOSITORY: string;
	CLOUDFLARE_AI_GATEWAY?: string;
	CLOUDFLARE_AI_GATEWAY_TOKEN?: string;
}

class DeploymentError extends Error {
	constructor(
		message: string,
		public cause?: Error,
	) {
		super(message);
		this.name = 'DeploymentError';
	}
}

class CloudflareDeploymentManager {
	private config: WranglerConfig;
	private env: EnvironmentConfig;
	private cloudflare: Cloudflare;
	private aiGatewayCloudflare?: Cloudflare; // Separate SDK instance for AI Gateway operations
	private conflictingVarsForCleanup: Record<string, string> | null = null; // For signal cleanup

	constructor() {
		this.validateEnvironment();
		this.config = this.parseWranglerConfig();
		this.extractConfigurationValues();
		this.env = this.getEnvironmentVariables();
		this.cloudflare = new Cloudflare({
			apiToken: this.env.CLOUDFLARE_API_TOKEN,
		});
		
		// Set up signal handling for graceful cleanup
		this.setupSignalHandlers();
	}

	/**
	 * Sets up signal handlers for graceful cleanup on Ctrl+C or termination
	 * Reuses existing restoreOriginalVars method following DRY principles
	 */
	private setupSignalHandlers(): void {
		const gracefulExit = async (signal: string) => {
			console.log(`\n🛑 Received ${signal}, performing cleanup...`);
			
			try {
				// Restore conflicting vars using existing restoration method
				if (this.conflictingVarsForCleanup) {
					console.log('🔄 Restoring original wrangler.jsonc configuration...');
					await this.restoreOriginalVars(this.conflictingVarsForCleanup);
				} else {
					console.log('ℹ️  No configuration changes to restore');
				}
			} catch (error) {
				console.error(`❌ Error during cleanup: ${error instanceof Error ? error.message : String(error)}`);
			}
			
			console.log('👋 Cleanup completed. Exiting...');
			process.exit(1);
		};

		// Handle Ctrl+C (SIGINT)
		process.on('SIGINT', () => gracefulExit('SIGINT'));
		
		// Handle termination (SIGTERM)
		process.on('SIGTERM', () => gracefulExit('SIGTERM'));
		
		console.log('✅ Signal handlers registered for graceful cleanup');
	}

	/**
	 * Validates that all required build variables are present
	 */
	private validateEnvironment(): void {
		const requiredBuildVars = ['CLOUDFLARE_API_TOKEN'];

		const missingVars = requiredBuildVars.filter(
			(varName) => !process.env[varName],
		);

		if (missingVars.length > 0) {
			throw new DeploymentError(
				`Missing required build variables: ${missingVars.join(', ')}\n` +
					`Please ensure all required build variables are configured in your deployment.`,
			);
		}
		console.log('✅ Build variables validation passed');
	}


	/**
	 * Extracts and validates key configuration values from wrangler.jsonc
	 */
	private extractConfigurationValues(): void {
		console.log(
			'📋 Extracting configuration values from wrangler.jsonc...',
		);

		// Log key extracted values
		const databaseName = this.config.d1_databases?.[0]?.database_name;
		const customDomain = this.config.vars?.CUSTOM_DOMAIN;
		const customPreviewDomain = this.config.vars?.CUSTOM_PREVIEW_DOMAIN;
		const maxInstances = this.config.vars?.MAX_SANDBOX_INSTANCES;
		const templatesRepo = this.config.vars?.TEMPLATES_REPOSITORY;
		const aiGateway = this.config.vars?.CLOUDFLARE_AI_GATEWAY;
		const dispatchNamespace = this.config.vars?.DISPATCH_NAMESPACE;

		console.log('📊 Configuration Summary:');
		console.log(`   Database Name: ${databaseName || 'Not configured'}`);
		console.log(`   Custom Domain: ${customDomain || 'Not configured'}`);
		console.log(`   Custom Preview Domain: ${customPreviewDomain || 'Not configured'}`);
		console.log(
			`   Max Sandbox Instances: ${maxInstances || 'Not configured'}`,
		);
		console.log(
			`   Templates Repository: ${templatesRepo || 'Not configured'}`,
		);
		console.log(`   AI Gateway: ${aiGateway || 'Not configured'}`);
		console.log(`   Dispatch Namespace: ${dispatchNamespace || 'Not configured'}`);

		// Validate critical configuration
		if (!databaseName) {
			console.warn(
				'⚠️  No D1 database configured - database operations may fail',
			);
		}

		if (!customDomain) {
			console.warn(
				'⚠️  No custom domain configured - using default routes',
			);
		}

		console.log('✅ Configuration extraction completed');
	}

	/**
	 * Safely parses wrangler.jsonc file, handling comments and JSON-like syntax
	 */
	private parseWranglerConfig(): WranglerConfig {
		const wranglerPath = this.getWranglerPath();

		if (!existsSync(wranglerPath)) {
			throw new DeploymentError(
				'wrangler.jsonc not found',
				new Error('Please ensure wrangler.jsonc exists in the project root'),
			);
		}

		try {
			const { config } = this.readWranglerConfig();
			this.logSuccess(`Parsed wrangler.jsonc - Project: ${config.name}`);
			return config;
		} catch (error) {
			throw new DeploymentError(
				'Failed to parse wrangler.jsonc',
				error instanceof Error ? error : new Error(`Please check your wrangler.jsonc syntax: ${String(error)}`),
			);
		}
	}

	/**
	 * Gets and validates environment variables, with defaults from wrangler.jsonc
	 */
	private getEnvironmentVariables(): EnvironmentConfig {
		const apiToken = process.env.CLOUDFLARE_API_TOKEN!;
		const aiGatewayToken = process.env.CLOUDFLARE_AI_GATEWAY_TOKEN || apiToken;
		
		return {
			CLOUDFLARE_API_TOKEN: apiToken,
			CLOUDFLARE_ACCOUNT_ID:
				process.env.CLOUDFLARE_ACCOUNT_ID ||
				this.config.vars?.CLOUDFLARE_ACCOUNT_ID!,
			TEMPLATES_REPOSITORY:
				process.env.TEMPLATES_REPOSITORY ||
				this.config.vars?.TEMPLATES_REPOSITORY!,
			CLOUDFLARE_AI_GATEWAY:
				process.env.CLOUDFLARE_AI_GATEWAY ||
				this.config.vars?.CLOUDFLARE_AI_GATEWAY || "orange-build-gateway",
			CLOUDFLARE_AI_GATEWAY_TOKEN: aiGatewayToken,
		};
	}

	/**
	 * Creates or ensures Workers for Platforms dispatch namespace exists
	 */
	private async ensureDispatchNamespace(): Promise<void> {
		const dispatchConfig = this.config.dispatch_namespaces?.[0];
		if (!dispatchConfig) {
			console.log('ℹ️  No dispatch namespace configuration found, skipping setup');
			return;
		}

		const namespaceName = dispatchConfig.namespace;
		console.log(`🔍 Checking dispatch namespace: ${namespaceName}`);

		try {
			// Check if namespace exists using Cloudflare SDK
			try {
				await this.cloudflare.workersForPlatforms.dispatch.namespaces.get(
					namespaceName,
					{ account_id: this.env.CLOUDFLARE_ACCOUNT_ID },
				);
				console.log(
					`✅ Dispatch namespace '${namespaceName}' already exists`,
				);
				return;
			} catch (error: any) {
				// Check if error indicates dispatch namespaces are not available
				const errorMessage = error?.message || '';
				if (errorMessage.includes('You do not have access to dispatch namespaces') || 
					errorMessage.includes('code: 10121')) {
					console.log('⚠️  Dispatch namespaces became unavailable during execution');
					console.log('   Workers for Platforms access may have changed');
					return;
				}

				// If error is not 404, re-throw it
				if (
					error?.status !== 404 &&
					error?.message?.indexOf('not found') === -1
				) {
					throw error;
				}
				// Namespace doesn't exist, continue to create it
			}

			console.log(`📦 Creating dispatch namespace: ${namespaceName}`);

			await this.cloudflare.workersForPlatforms.dispatch.namespaces.create(
				{
					account_id: this.env.CLOUDFLARE_ACCOUNT_ID,
					name: namespaceName,
				},
			);

			console.log(
				`✅ Successfully created dispatch namespace: ${namespaceName}`,
			);
		} catch (error) {
			// Check if the error is related to dispatch namespace access
			const errorMessage = error instanceof Error ? error.message : String(error);
			if (errorMessage.includes('You do not have access to dispatch namespaces') || 
				errorMessage.includes('code: 10121')) {
				console.warn('⚠️  Dispatch namespaces are not available for this account');
				console.warn('   Skipping dispatch namespace setup and continuing deployment');
				return;
			}

			throw new DeploymentError(
				`Failed to ensure dispatch namespace: ${namespaceName}`,
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	/**
	 * Creates or ensures AI Gateway exists (non-blocking)
	 */
	private async ensureAIGateway(): Promise<void> {
		if (!this.env.CLOUDFLARE_AI_GATEWAY) {
			console.log(
				'ℹ️  AI Gateway setup skipped (CLOUDFLARE_AI_GATEWAY not provided)',
			);
			return;
		}

		const gatewayName = this.env.CLOUDFLARE_AI_GATEWAY;
		console.log(`🔍 Checking AI Gateway: ${gatewayName}`);

		try {
			// Step 1: Check main token permissions and create AI Gateway token if needed
			console.log('🔍 Checking API token permissions...');
			const tokenCheck = await this.checkTokenPermissions();
			const aiGatewayToken = await this.ensureAIGatewayToken();

			// Step 2: Check if gateway exists first using appropriate SDK
			const aiGatewaySDK = this.getAIGatewaySDK();

			try {
				await aiGatewaySDK.aiGateway.get(gatewayName, {
					account_id: this.env.CLOUDFLARE_ACCOUNT_ID,
				});
				console.log(`✅ AI Gateway '${gatewayName}' already exists`);
				return;
			} catch (error: any) {
				// If error is not 404, log but continue
				if (
					error?.status !== 404 &&
					!error?.message?.includes('not found')
				) {
					console.warn(
						`⚠️  Could not check AI Gateway '${gatewayName}': ${error.message}`,
					);
					return;
				}
				// Gateway doesn't exist, continue to create it
			}

			// Validate gateway name length (64 character limit)
			if (gatewayName.length > 64) {
				console.warn(
					`⚠️  AI Gateway name too long (${gatewayName.length} > 64 chars), skipping creation`,
				);
				return;
			}

			// Step 3: Create AI Gateway with authentication based on token availability
			console.log(`📦 Creating AI Gateway: ${gatewayName}`);

			await aiGatewaySDK.aiGateway.create({
				account_id: this.env.CLOUDFLARE_ACCOUNT_ID,
				id: gatewayName,
				cache_invalidate_on_update: true,
				cache_ttl: 3600,
				collect_logs: true,
				rate_limiting_interval: 0,
				rate_limiting_limit: 0,
				rate_limiting_technique: 'sliding',
				authentication: !!aiGatewayToken, // Enable authentication only if we have a token
			});

			console.log(
				`✅ Successfully created AI Gateway: ${gatewayName} (authentication: ${aiGatewayToken ? 'enabled' : 'disabled'})`,
			);
		} catch (error) {
			// Non-blocking: Log warning but continue deployment
			console.warn(
				`⚠️  Could not create AI Gateway '${gatewayName}': ${error instanceof Error ? error.message : String(error)}`,
			);
			console.warn(
				'   Continuing deployment without AI Gateway setup...',
			);
		}
	}

	/**
	 * Verifies if the current API token has AI Gateway permissions
	 */
	private async checkTokenPermissions(): Promise<{
		hasAIGatewayAccess: boolean;
		tokenInfo?: any;
	}> {
		try {
			const verifyResponse = await fetch(
				'https://api.cloudflare.com/client/v4/user/tokens/verify',
				{
					headers: {
						Authorization: `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
					},
				},
			);

			if (!verifyResponse.ok) {
				console.warn('⚠️  Could not verify API token permissions');
				return { hasAIGatewayAccess: false };
			}

			const verifyData = await verifyResponse.json();
			if (!verifyData.success) {
				console.warn('⚠️  API token verification failed');
				return { hasAIGatewayAccess: false };
			}

			// For now, assume we need to create a separate token for AI Gateway operations
			// This is a conservative approach since permission checking is complex
			console.log(
				'ℹ️  Main API token verified, but will create dedicated AI Gateway token',
			);
			return { hasAIGatewayAccess: false, tokenInfo: verifyData.result };
		} catch (error) {
			console.warn(
				`⚠️  Token verification failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return { hasAIGatewayAccess: false };
		}
	}

	/**
	 * Creates AI Gateway authentication token if needed (non-blocking)
	 * Returns the token if created/available, null otherwise
	 */
	private async ensureAIGatewayToken(): Promise<string | null> {
		const currentToken = this.env.CLOUDFLARE_AI_GATEWAY_TOKEN;

		// Check if token is already set and not the default placeholder
		if (
			currentToken &&
			currentToken !== 'optional-your-cf-ai-gateway-token'
		) {
			console.log('✅ AI Gateway token already configured');
			// Initialize separate AI Gateway SDK instance
			this.aiGatewayCloudflare = new Cloudflare({
				apiToken: currentToken,
			});
			return currentToken;
		}

		try {
			console.log(`🔐 Creating AI Gateway authentication token...`);

			// Create API token with required permissions for AI Gateway including RUN
			const tokenResponse = await fetch(
				`https://api.cloudflare.com/client/v4/user/tokens`,
				{
					method: 'POST',
					headers: {
						Authorization: `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						name: `AI Gateway Token - ${new Date().toISOString().split('T')[0]}`,
						policies: [
							{
								effect: 'allow',
								resources: {
									[`com.cloudflare.api.account.${this.env.CLOUDFLARE_ACCOUNT_ID}`]:
										'*',
								},
								permission_groups: [
									// Note: Using descriptive names, actual IDs would need to be fetched from the API
									{ name: 'AI Gateway Read' },
									{ name: 'AI Gateway Edit' },
									{ name: 'AI Gateway Run' }, // This is the key permission for authentication
									{ name: 'Workers AI Read' },
									{ name: 'Workers AI Edit' },
								],
							},
						],
						condition: {
							request_ip: { in: [], not_in: [] },
						},
						expires_on: new Date(
							Date.now() + 365 * 24 * 60 * 60 * 1000,
						).toISOString(), // 1 year
					}),
				},
			);

			if (!tokenResponse.ok) {
				const errorData = await tokenResponse
					.json()
					.catch(() => ({ errors: [{ message: 'Unknown error' }] }));
				throw new Error(
					`API token creation failed: ${errorData.errors?.[0]?.message || tokenResponse.statusText}`,
				);
			}

			const tokenData = await tokenResponse.json();

			if (tokenData.success && tokenData.result?.value) {
				const newToken = tokenData.result.value;
				console.log(
					'✅ AI Gateway authentication token created successfully',
				);
				console.log(`   Token ID: ${tokenData.result.id}`);
				console.warn(
					'⚠️  Store this token securely and set CLOUDFLARE_AI_GATEWAY_TOKEN for future deployments.',
				);
				if (!process.env.CI) {
					console.warn(`   ${newToken}`);
				} else {
					console.warn('   (Token value suppressed because CI=true)');
				}

				// Initialize separate AI Gateway SDK instance
				this.aiGatewayCloudflare = new Cloudflare({
					apiToken: newToken,
				});
				return newToken;
			} else {
				throw new Error(
					'Token creation succeeded but no token value returned',
				);
			}
		} catch (error) {
			// Non-blocking: Log warning but continue
			console.warn(
				`⚠️  Could not create AI Gateway token: ${error instanceof Error ? error.message : String(error)}`,
			);
			console.warn(
				'   AI Gateway will be created without authentication...',
			);
			return null;
		}
	}

	/**
	 * Gets the appropriate Cloudflare SDK instance for AI Gateway operations
	 */
	private getAIGatewaySDK(): Cloudflare {
		return this.aiGatewayCloudflare || this.cloudflare;
	}

	/**
	 * Clones templates repository and deploys templates to R2
	 */
	private async deployTemplates(): Promise<void> {
		const templatesDir = join(PROJECT_ROOT, 'templates');
		const templatesRepo = this.env.TEMPLATES_REPOSITORY;

		console.log(`📥 Setting up templates from: ${templatesRepo}`);

		try {
			// Create templates directory if it doesn't exist
			if (!existsSync(templatesDir)) {
				mkdirSync(templatesDir, { recursive: true });
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
				console.log(
					'📁 Templates repository already exists, pulling latest changes...',
				);
				try {
					execSync('git pull origin main || git pull origin master', {
						stdio: 'pipe',
						cwd: templatesDir,
					});
					console.log('✅ Templates repository updated');
				} catch (pullError) {
					console.warn(
						'⚠️  Could not pull latest changes, continuing with existing templates',
					);
				}
			}

			// Find R2 bucket name from config
			const templatesBucket = this.config.r2_buckets?.find(
				(bucket) => bucket.binding === 'TEMPLATES_BUCKET',
			);

			if (!templatesBucket) {
				throw new Error(
					'TEMPLATES_BUCKET not found in wrangler.jsonc r2_buckets configuration',
				);
			}

			// Check if deploy script exists
			const deployScript = join(templatesDir, 'deploy_templates.sh');
			if (!existsSync(deployScript)) {
				console.warn(
					'⚠️  deploy_templates.sh not found in templates repository, skipping template deployment',
				);
				return;
			}

			// Make script executable
			execSync(`chmod +x "${deployScript}"`, { cwd: templatesDir });

			// Run deployment script with environment variables
			console.log(
				`🚀 Deploying templates to R2 bucket: ${templatesBucket.bucket_name}`,
			);

			const inheritedKeys = [
				'PATH',
				'HOME',
				'USER',
				'SHELL',
				'TMPDIR',
				'TMP',
				'TEMP',
				'LANG',
				'LC_ALL',
				'CI',
				'GITHUB_WORKSPACE',
			];
			const inheritedEnv: NodeJS.ProcessEnv = {};
			inheritedKeys.forEach((key) => {
				const value = process.env[key];
				if (value !== undefined) {
					inheritedEnv[key] = value;
				}
			});

			const deployEnv: NodeJS.ProcessEnv = {
				...inheritedEnv,
				CLOUDFLARE_API_TOKEN: this.env.CLOUDFLARE_API_TOKEN,
				CLOUDFLARE_ACCOUNT_ID: this.env.CLOUDFLARE_ACCOUNT_ID,
				BUCKET_NAME: templatesBucket.bucket_name,
				R2_BUCKET_NAME: templatesBucket.bucket_name,
			};

			execSync('./deploy_templates.sh', {
				stdio: 'inherit',
				cwd: templatesDir,
				env: deployEnv,
			});

			console.log('✅ Templates deployed successfully to R2');
		} catch (error) {
			// Don't fail the entire deployment if templates fail
			console.warn(
				'⚠️  Templates deployment failed, but continuing with main deployment:',
			);
			console.warn(
				`   ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Cleans ARM64 platform flags from SandboxDockerfile for production deployment
	 * Returns the original content if ARM64 flags were removed (for restoration)
	 */
	private cleanDockerfileForDeployment(): string | null {
		const dockerfilePath = join(PROJECT_ROOT, 'SandboxDockerfile');
		
		if (!existsSync(dockerfilePath)) {
			console.log('     ℹ️  SandboxDockerfile not found - skipping ARM64 cleanup');
			return null;
		}

		try {
			const originalContent = readFileSync(dockerfilePath, 'utf-8');
			let modified = false;

			// Split content into lines for processing
			const lines = originalContent.split('\n');
			const cleanedLines = lines.map(line => {
				// Look for FROM statements with --platform=linux/arm64 and remove the flag
				const fromMatch = line.match(/^(\s*FROM\s+)--platform=linux\/arm64\s+(.*)/);
				if (fromMatch) {
					modified = true;
					const [, prefix, image] = fromMatch;
					return `${prefix}${image}`;
				}
				return line;
			});

			if (modified) {
				writeFileSync(dockerfilePath, cleanedLines.join('\n'), 'utf-8');
				console.log('     ✅ Removed ARM64 platform flags from SandboxDockerfile');
				return originalContent; // Return original for restoration
			} else {
				console.log('     ✅ No ARM64 platform flags found in SandboxDockerfile');
				return null; // Nothing to restore
			}
			
		} catch (error) {
			console.warn(
				`     ⚠️  Could not clean SandboxDockerfile: ${error instanceof Error ? error.message : String(error)}`,
			);
			console.warn('     → Continuing deployment, but may encounter platform compatibility issues');
			return null;
		}
	}

	/**
	 * Restores ARM64 platform flags to SandboxDockerfile if they were previously removed
	 */
	private restoreDockerfileARM64Flags(originalContent: string): void {
		const dockerfilePath = join(PROJECT_ROOT, 'SandboxDockerfile');
		
		try {
			writeFileSync(dockerfilePath, originalContent, 'utf-8');
			console.log('🔄 Restored ARM64 platform flags to SandboxDockerfile for local development');
		} catch (error) {
			console.warn(
				`⚠️  Could not restore ARM64 flags to SandboxDockerfile: ${error instanceof Error ? error.message : String(error)}`,
			);
			console.warn('   You may need to manually re-run the setup script to restore ARM64 flags');
		}
	}

	/**
	 * Updates package.json database commands with the actual database name from wrangler.jsonc
	 */
	private updatePackageJsonDatabaseCommands(): void {
		const databaseName = this.config.d1_databases?.[0]?.database_name;

		if (!databaseName) {
			console.log(
				'ℹ️  No D1 database found in wrangler.jsonc, skipping package.json database command update',
			);
			return;
		}

		console.log(
			`🔧 Updating package.json database commands with database: ${databaseName}`,
		);

		try {
			const packageJsonPath = join(PROJECT_ROOT, 'package.json');
			const content = readFileSync(packageJsonPath, 'utf-8');

			// Parse the package.json file
			const packageJson = JSON.parse(content);

			if (!packageJson.scripts) {
				console.warn('⚠️  No scripts section found in package.json');
				return;
			}

			// Update database migration commands
			const commandsToUpdate = ['db:migrate:local', 'db:migrate:remote'];

			let updated = false;
			commandsToUpdate.forEach((command) => {
				if (packageJson.scripts[command]) {
					const oldCommand = packageJson.scripts[command];

					// Replace any existing database name in the wrangler d1 migrations apply command
					const newCommand = oldCommand.replace(
						/wrangler d1 migrations apply [^\s]+ /,
						`wrangler d1 migrations apply ${databaseName} `,
					);

					if (newCommand !== oldCommand) {
						packageJson.scripts[command] = newCommand;
						console.log(
							`  ✅ Updated ${command}: ${oldCommand} → ${newCommand}`,
						);
						updated = true;
					}
				}
			});

			if (updated) {
				// Write back the updated package.json with proper formatting
				writeFileSync(
					packageJsonPath,
					JSON.stringify(packageJson, null, '\t'),
					'utf-8',
				);
				console.log(
					'✅ Updated package.json database commands successfully',
				);
			} else {
				console.log(
					'ℹ️  No database commands needed updating in package.json',
				);
			}
		} catch (error) {
			console.warn(
				`⚠️  Could not update package.json database commands: ${error instanceof Error ? error.message : String(error)}`,
			);
			// Non-blocking - continue deployment
		}
	}

	/**
	 * Gets the zone name and ID for a given domain by testing subdomains
	 */
	private async detectZoneForDomain(customDomain: string, originalDomain: string): Promise<{
		zoneName: string | null;
		zoneId: string | null;
	}> {
		console.log(`🔍 Detecting zone for custom domain: ${customDomain}, Original domain was: ${originalDomain}`);

		// Extract possible zone names by progressively removing subdomains
		const domainParts = customDomain.split('.');
		const possibleZones: string[] = [];

		// Generate all possible zone names from longest to shortest
		// e.g., for 'abc.test.xyz.build.cloudflare.dev' generates:
		// ['abc.test.xyz.build.cloudflare.dev', 'test.xyz.build.cloudflare.dev', 'xyz.build.cloudflare.dev', 'build.cloudflare.dev', 'cloudflare.dev']
		for (let i = 0; i < domainParts.length - 1; i++) {
			const zoneName = domainParts.slice(i).join('.');
			possibleZones.push(zoneName);
		}

		console.log(`🔍 Testing possible zones: ${possibleZones.join(', ')}`);

		// Test each possible zone name
		for (const zoneName of possibleZones) {
			try {
				console.log(`   Testing zone: ${zoneName}`);
				const response = await fetch(
					`https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(zoneName)}`,
					{
						headers: {
							'Content-Type': 'application/json',
							'Authorization': `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
						},
					}
				);

				if (!response.ok) {
					console.log(`   ❌ API error for zone ${zoneName}: ${response.status} ${response.statusText}`);
					continue;
				}

				const data = await response.json();

				if (data.success && data.result && data.result.length > 0) {
					const zone = data.result[0];
					console.log(`   ✅ Found zone: ${zoneName} (ID: ${zone.id})`);
					console.log(`      Zone status: ${zone.status}`);
					console.log(`      Account: ${zone.account.name}`);
					return {
						zoneName: zoneName,
						zoneId: zone.id,
					};
				} else {
					console.log(`   ❌ No zone found for: ${zoneName}`);
				}
			} catch (error) {
				console.log(`   ❌ Error checking zone ${zoneName}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		console.error(`❌ No valid zone found for custom domain: ${customDomain}`);
		console.error(`   Tested zones: ${possibleZones.join(', ')}`);
		console.error(`   Please ensure:`);
		console.error(`   1. The domain is managed by Cloudflare`);
		console.error(`   2. Your API token has zone read permissions`);
		console.error(`   3. The domain is active and properly configured`);

		return { zoneName: null, zoneId: null };
	}

    
	/**
	 * Updates wrangler.jsonc routes and deployment settings based on CUSTOM_DOMAIN
	 */
	/**
	 * Standard formatting options for JSONC modifications
	 */
	private static readonly JSONC_FORMAT_OPTIONS = {
		formattingOptions: {
			insertSpaces: true,
			keepLines: true,
			tabSize: 4
		}
	};

	/**
	 * Gets the path to wrangler.jsonc
	 */
	private getWranglerPath(): string {
		return join(PROJECT_ROOT, 'wrangler.jsonc');
	}

	/**
	 * Reads and parses wrangler.jsonc file
	 */
	private readWranglerConfig(): { content: string; config: WranglerConfig } {
		const wranglerPath = this.getWranglerPath();
		const content = readFileSync(wranglerPath, 'utf-8');
		const config = parse(content) as WranglerConfig;
		return { content, config };
	}

	/**
	 * Writes content to wrangler.jsonc file
	 */
	private writeWranglerConfig(content: string): void {
		const wranglerPath = this.getWranglerPath();
		writeFileSync(wranglerPath, content, 'utf-8');
	}

	/**
	 * Standardized success logging
	 */
	private logSuccess(message: string, details?: string[]): void {
		console.log(`✅ ${message}`);
		if (details) {
			details.forEach(detail => console.log(`   ${detail}`));
		}
	}

	/**
	 * Standardized warning logging
	 */
	private logWarning(message: string, details?: string[]): void {
		console.warn(`⚠️  ${message}`);
		if (details) {
			details.forEach(detail => console.warn(`   ${detail}`));
		}
	}

	/**
	 * Updates a specific field in wrangler.jsonc configuration
	 */
	private updateWranglerField<T>(content: string, field: string, value: T): string {
		const edits = modify(content, [field], value, CloudflareDeploymentManager.JSONC_FORMAT_OPTIONS);
		return applyEdits(content, edits);
	}

	/**
	 * Updates wrangler.jsonc for workers.dev deployment (no custom domain)
	 */
	private updateWranglerForWorkersDev(content: string): string {
		let updatedContent = content;
		
		// Remove routes property if it exists
		const removeRoutesEdits = modify(content, ['routes'], undefined, CloudflareDeploymentManager.JSONC_FORMAT_OPTIONS);
		updatedContent = applyEdits(updatedContent, removeRoutesEdits);
		
		// Set workers_dev = true and preview_urls = true
		updatedContent = this.updateWranglerField(updatedContent, 'workers_dev', true);
		updatedContent = this.updateWranglerField(updatedContent, 'preview_urls', true);

		return updatedContent;
	}

	/**
	 * Updates wrangler.jsonc for custom domain deployment
	 */
	private updateWranglerForCustomDomain(
		content: string, 
		routes: Array<{ pattern: string; custom_domain: boolean; zone_id?: string; zone_name?: string }>,
		preserveExistingFlags: boolean = false
	): string {
		let updatedContent = content;

		// Update routes
		updatedContent = this.updateWranglerField(updatedContent, 'routes', routes);

		// Only update workers_dev and preview_urls if not preserving existing flags
		if (!preserveExistingFlags) {
			updatedContent = this.updateWranglerField(updatedContent, 'workers_dev', false);
			updatedContent = this.updateWranglerField(updatedContent, 'preview_urls', false);
		}

		return updatedContent;
	}

	/**
	 * Safely detects zone information for a domain, handling failures gracefully
	 */
	private async safeDetectZoneForDomain(
		customDomain: string, 
		originalCustomDomain: string | null
	): Promise<{ zoneName: string | null; zoneId: string | null; success: boolean }> {
		try {
			if (!originalCustomDomain) {
				return { zoneName: null, zoneId: null, success: false };
			}

			const { zoneName, zoneId } = await this.detectZoneForDomain(customDomain, originalCustomDomain);
			if (!zoneId) {
				return { zoneName: null, zoneId: null, success: false };
			}
			return { zoneName, zoneId, success: true };
		} catch (error) {
			console.warn(
				`⚠️  Zone detection failed for custom domain ${customDomain}: ${error instanceof Error ? error.message : String(error)}`
			);
			console.log('   → Continuing without zone-specific routes');
			return { zoneName: null, zoneId: null, success: false };
		}
	}

	private async updateCustomDomainRoutes(): Promise<string> {
		const customDomain = this.config.vars?.CUSTOM_DOMAIN || process.env.CUSTOM_DOMAIN;
		// Check for CUSTOM_PREVIEW_DOMAIN (env var takes priority)
		const customPreviewDomain = process.env.CUSTOM_PREVIEW_DOMAIN || this.config.vars?.CUSTOM_PREVIEW_DOMAIN;

		try {
			const { content, config } = this.readWranglerConfig();
			
			// Get the original custom domain from existing routes (route with custom_domain: true)
			const originalCustomDomain = config.routes?.find(route => route.custom_domain)?.pattern || null;

			if (!customDomain) {
				console.log(
					'ℹ️  CUSTOM_DOMAIN not set - removing routes and enabling workers.dev',
				);

				const updatedContent = this.updateWranglerForWorkersDev(content);
				this.writeWranglerConfig(updatedContent);

				this.logSuccess('Updated wrangler.jsonc for workers.dev deployment:', [
					'- Removed routes configuration',
					'- Set workers_dev: true',
					'- Set preview_urls: true'
				]);
				return '';
			}

			console.log(
				`🔧 Updating wrangler.jsonc routes with custom domain: ${customDomain}`,
			);

			// Check if we have a custom preview domain for wildcard routes
			if (customPreviewDomain && customPreviewDomain !== '') {
				console.log(
					`🔧 Using CUSTOM_PREVIEW_DOMAIN for wildcard routes: ${customPreviewDomain}`,
				);
			}

			// Safely detect zone information for main domain
			const { zoneId, success: zoneDetectionSuccess } = await this.safeDetectZoneForDomain(customDomain, originalCustomDomain);

			// If we have a custom preview domain, detect its zone information for wildcard routes
			let previewZoneName: string | null = null;
			let previewZoneId: string | null = null;
			let previewZoneDetectionSuccess = false;

			if (customPreviewDomain && customPreviewDomain !== '') {
				const previewZoneInfo = await this.safeDetectZoneForDomain(customPreviewDomain, customPreviewDomain);
				previewZoneName = previewZoneInfo.zoneName;
				previewZoneId = previewZoneInfo.zoneId;
				previewZoneDetectionSuccess = previewZoneInfo.success;

				if (previewZoneDetectionSuccess) {
					console.log(`📋 Preview domain zone detected:`);
					console.log(`   Preview Zone Name: ${previewZoneName}`);
					console.log(`   Preview Zone ID: ${previewZoneId}`);
				}
			}

			// Define the expected routes based on zone detection success
			let expectedRoutes: Array<{
				pattern: string;
				custom_domain: boolean;
				zone_id?: string;
			}>;
			const existingWildcardRoute = config.routes?.find(route => !route.custom_domain);

			// Determine which domain and zone to use for wildcard pattern
			const wildcardDomain = (customPreviewDomain && customPreviewDomain !== '') ? customPreviewDomain : customDomain;
			const wildcardZoneId = (customPreviewDomain && previewZoneDetectionSuccess && previewZoneId) 
				? previewZoneId 
				: (zoneDetectionSuccess && zoneId ? zoneId : undefined);

			const wildcardRoute: {
				pattern: string;
				custom_domain: boolean;
				zone_id?: string;
			} = {
				pattern: `*${wildcardDomain}/*`,
				custom_domain: false,
			};

			if (wildcardZoneId) {
				// Custom domain with zone information for wildcard pattern
				console.log(`📋 Creating routes with zone information:`);
				console.log(`   Main Domain: ${customDomain}`);
				console.log(`   Wildcard Domain: ${wildcardDomain}`);
				console.log(`   Wildcard Zone ID: ${wildcardZoneId}`);
				wildcardRoute.zone_id = wildcardZoneId;
			} else {
				const existingZoneId = existingWildcardRoute && existingWildcardRoute.zone_id;
				if (existingZoneId) {
					wildcardRoute.zone_id = existingZoneId;
                    console.warn(
                        `📋 Using fallback wildcard route configuration (zone detection ${zoneDetectionSuccess ? 'returned no zone' : 'failed'})`
                    );
				} else {
                    // Fatal error
                    console.error(`Failed to detect zone for custom domain ${customDomain}. Make sure the domain is properly configured in Cloudflare.`);
                    throw new Error(`Failed to detect zone for custom domain ${customDomain}`);
                }
			}

			expectedRoutes = [
				{ pattern: customDomain, custom_domain: true },
				wildcardRoute,
			];

			// Check if routes need updating
			let needsUpdate = false;

			if (!config.routes || !Array.isArray(config.routes)) {
				needsUpdate = true;
			} else if (config.routes.length !== expectedRoutes.length) {
				needsUpdate = true;
			} else {
				for (let i = 0; i < expectedRoutes.length; i++) {
					const expected = expectedRoutes[i];
					const actual = config.routes[i] as any;

					if (
						actual.pattern !== expected.pattern ||
						actual.custom_domain !== expected.custom_domain
					) {
						needsUpdate = true;
						break;
					}

					const actualZoneId = (actual && (actual as any).zone_id) ?? null;
					const expectedZoneId = expected.zone_id ?? null;
					if (actualZoneId !== expectedZoneId) {
						needsUpdate = true;
						break;
					}
				}
			}

			if (!needsUpdate) {
				console.log(
					'ℹ️  Routes already match custom domain configuration',
				);
				return customDomain;
			}

			// Update wrangler configuration
			// If zone detection failed, preserve existing workers_dev and preview_urls values
			const preserveExistingFlags = !zoneDetectionSuccess;
			const updatedContent = this.updateWranglerForCustomDomain(content, expectedRoutes, preserveExistingFlags);
			this.writeWranglerConfig(updatedContent);

			// Log the changes
			const routeDetails = expectedRoutes.map((route, index) => {
				const infoParts = [`custom_domain: ${route.custom_domain}`];
				if (route.zone_id) {
					infoParts.push(`zone_id: ${route.zone_id}`);
				}
				return `Route ${index + 1}: ${route.pattern} (${infoParts.join(', ')})`;
			});

			if (!preserveExistingFlags) {
				routeDetails.push('Set workers_dev: false', 'Set preview_urls: false');
			} else {
				routeDetails.push('Preserved existing workers_dev and preview_urls settings');
			}

			this.logSuccess('Updated wrangler.jsonc routes:', routeDetails);
            return customDomain;
		} catch (error) {
			console.error(
				`⚠️  Could not update custom domain routes: ${error instanceof Error ? error.message : String(error)}`,
			);
            throw error;
		}
	}

	/**
	 * Updates container configuration based on MAX_SANDBOX_INSTANCES (env var overrides wrangler.jsonc)
	 */
	private updateContainerConfiguration(): void {
		// Environment variable takes priority over wrangler.jsonc vars
		const maxInstances =
			process.env.MAX_SANDBOX_INSTANCES ||
			this.config.vars?.MAX_SANDBOX_INSTANCES || "10";

		if (!maxInstances) {
			console.log(
				'ℹ️  MAX_SANDBOX_INSTANCES not set in environment variables or wrangler.jsonc vars, skipping container configuration update',
			);
			return;
		}

		const source = process.env.MAX_SANDBOX_INSTANCES
			? 'environment variable'
			: 'wrangler.jsonc vars';
		console.log(
			`🔧 Using MAX_SANDBOX_INSTANCES from ${source}: ${maxInstances}`,
		);

		const maxInstancesNum = parseInt(maxInstances, 10);
		if (isNaN(maxInstancesNum) || maxInstancesNum <= 0) {
			console.warn(
				`⚠️  Invalid MAX_SANDBOX_INSTANCES value: ${maxInstances}, skipping update`,
			);
			return;
		}

		console.log(
			`🔧 Updating container configuration: MAX_SANDBOX_INSTANCES=${maxInstancesNum}`,
		);

		try {
			const { content, config } = this.readWranglerConfig();

			if (!config.containers || !Array.isArray(config.containers)) {
				console.warn(
					'⚠️  No containers configuration found in wrangler.jsonc',
				);
				return;
			}

			// Find the index of UserAppSandboxService container
			const sandboxContainerIndex = config.containers.findIndex(
				(container) => container.class_name === 'UserAppSandboxService',
			);

			if (sandboxContainerIndex === -1) {
				console.warn(
					'⚠️  UserAppSandboxService container not found in wrangler.jsonc',
				);
				return;
			}

			const oldMaxInstances =
				config.containers[sandboxContainerIndex].max_instances;

			// Use jsonc-parser's modify function to properly edit the file
			// Path to the max_instances field: ['containers', index, 'max_instances']
			const edits = modify(
				content,
				['containers', sandboxContainerIndex, 'max_instances'],
				maxInstancesNum,
				CloudflareDeploymentManager.JSONC_FORMAT_OPTIONS,
			);

			// Apply the edits to get the updated content
			const updatedContent = applyEdits(content, edits);

			// Write back the updated configuration
			this.writeWranglerConfig(updatedContent);

			this.logSuccess(
				`Updated UserAppSandboxService max_instances: ${oldMaxInstances} → ${maxInstancesNum}`
			);
		} catch (error) {
			throw new DeploymentError(
				'Failed to update container configuration',
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	/**
	 * Updates container instance types based on SANDBOX_INSTANCE_TYPE variable
	 */
	private updateContainerInstanceTypes(): void {
		// Environment variable takes priority over wrangler.jsonc vars
		const sandboxInstanceType = 
			process.env.SANDBOX_INSTANCE_TYPE || 
			this.config.vars?.SANDBOX_INSTANCE_TYPE || 
			'standard-3';

		console.log(
			`🔧 Configuring container instance types: ${sandboxInstanceType}`,
		);

		try {
			const { content, config } = this.readWranglerConfig();

			if (!config.containers || !Array.isArray(config.containers)) {
				console.warn(
					'⚠️  No containers configuration found in wrangler.jsonc',
				);
				return;
			}

			// Find the indices of both containers
			const userAppContainerIndex = config.containers.findIndex(
				(container) => container.class_name === 'UserAppSandboxService',
			);

			if (userAppContainerIndex === -1) {
				console.warn(
					'⚠️  UserAppSandboxService container not found in wrangler.jsonc',
				);
				return;
			}

			// Determine the instance type configuration
			let userAppInstanceType: any;

			if (sandboxInstanceType === 'enhanced') {
				// Enhanced configuration as specified
				userAppInstanceType = {
					vcpu: 4,
					memory_mib: 8192,
					disk_mb: 10240
				};
				console.log('   Using enhanced instance type configuration');
			} else {
				// Use the string value directly
				userAppInstanceType = sandboxInstanceType;
				console.log(`   Using instance type string: ${sandboxInstanceType}`);
			}

			// Update UserAppSandboxService instance_type
			let updatedContent = content;
			const userAppInstanceTypeEdits = modify(
				updatedContent,
				['containers', userAppContainerIndex, 'instance_type'],
				userAppInstanceType,
				CloudflareDeploymentManager.JSONC_FORMAT_OPTIONS
			);
			updatedContent = applyEdits(updatedContent, userAppInstanceTypeEdits);

			// Write back the updated configuration
			this.writeWranglerConfig(updatedContent);

			this.logSuccess(`Updated container instance types for SANDBOX_INSTANCE_TYPE: ${sandboxInstanceType}`, [
				`UserAppSandboxService: ${JSON.stringify(userAppInstanceType)}`,
			]);

		} catch (error) {
			this.logWarning(
				`Could not update container instance types: ${error instanceof Error ? error.message : String(error)}`,
				['Continuing with current configuration...']
			);
			// Non-blocking - continue deployment
		}
	}

	/**
	 * Updates dispatch namespace configuration based on DISPATCH_NAMESPACE (env var overrides wrangler.jsonc)
	 * If dispatch namespaces are not available, clears the DISPATCH_NAMESPACE var
	 */
	private updateDispatchNamespace(dispatchNamespacesAvailable: boolean): void {
		// If dispatch namespaces are not available, clear the DISPATCH_NAMESPACE var
		if (!dispatchNamespacesAvailable) {
			console.log('🔧 Dispatch namespaces not available - clearing DISPATCH_NAMESPACE var');
			try {
				const { content } = this.readWranglerConfig();
				
				// Clear the DISPATCH_NAMESPACE var
				const varsEdits = modify(
					content,
					['vars', 'DISPATCH_NAMESPACE'],
					'',
					CloudflareDeploymentManager.JSONC_FORMAT_OPTIONS,
				);
				const updatedContent = applyEdits(content, varsEdits);
				
				this.writeWranglerConfig(updatedContent);
				this.logSuccess('Cleared DISPATCH_NAMESPACE var (dispatch namespaces not available)');
				
				// Update internal config
				if (this.config.vars) {
					this.config.vars.DISPATCH_NAMESPACE = '';
				}
			} catch (error) {
				this.logWarning(
					`Could not clear DISPATCH_NAMESPACE var: ${error instanceof Error ? error.message : String(error)}`,
					['Continuing with deployment...']
				);
			}
			return;
		}

		// Environment variable takes priority over wrangler.jsonc vars
		const dispatchNamespace =
			process.env.DISPATCH_NAMESPACE ||
			this.config.vars?.DISPATCH_NAMESPACE || 
			"orange-build-default-namespace";

		const source = process.env.DISPATCH_NAMESPACE
			? 'environment variable'
			: this.config.vars?.DISPATCH_NAMESPACE
				? 'wrangler.jsonc vars'
				: 'default value';
		console.log(
			`🔧 Using DISPATCH_NAMESPACE from ${source}: ${dispatchNamespace}`,
		);

		// Validate namespace name
		if (!dispatchNamespace || dispatchNamespace.trim() === '') {
			console.warn(
				'⚠️  Invalid DISPATCH_NAMESPACE value: empty string, using default',
			);
			return;
		}

		// Basic format validation (alphanumeric, hyphens, underscores)
		const namespacePattern = /^[a-zA-Z0-9_-]+$/;
		if (!namespacePattern.test(dispatchNamespace)) {
			console.warn(
				`⚠️  Invalid DISPATCH_NAMESPACE format: ${dispatchNamespace}, must contain only letters, numbers, hyphens, and underscores`,
			);
			return;
		}

		console.log(
			`🔧 Updating dispatch namespace configuration: DISPATCH_NAMESPACE=${dispatchNamespace}`,
		);

		try {
			const { content, config } = this.readWranglerConfig();

			if (!config.dispatch_namespaces || !Array.isArray(config.dispatch_namespaces)) {
				console.warn(
					'⚠️  No dispatch_namespaces configuration found in wrangler.jsonc',
				);
				return;
			}

			if (config.dispatch_namespaces.length === 0) {
				console.warn(
					'⚠️  Empty dispatch_namespaces array in wrangler.jsonc',
				);
				return;
			}

			const currentNamespace = config.dispatch_namespaces[0].namespace;

			// Check if update is needed
			if (currentNamespace === dispatchNamespace) {
				console.log(
					`ℹ️  Dispatch namespace already set to: ${dispatchNamespace}`,
				);
				return;
			}

			let updatedContent = content;

			// Update dispatch_namespaces[0].namespace
			const namespaceEdits = modify(
				updatedContent,
				['dispatch_namespaces', 0, 'namespace'],
				dispatchNamespace,
				CloudflareDeploymentManager.JSONC_FORMAT_OPTIONS,
			);
			updatedContent = applyEdits(updatedContent, namespaceEdits);

			// Update vars.DISPATCH_NAMESPACE for consistency
			const varsEdits = modify(
				updatedContent,
				['vars', 'DISPATCH_NAMESPACE'],
				dispatchNamespace,
				CloudflareDeploymentManager.JSONC_FORMAT_OPTIONS,
			);
			updatedContent = applyEdits(updatedContent, varsEdits);

			// Write back the updated configuration
			this.writeWranglerConfig(updatedContent);

			this.logSuccess(
				`Updated dispatch namespace: ${currentNamespace} → ${dispatchNamespace}`,
				[
					'Updated dispatch_namespaces[0].namespace',
					'Updated vars.DISPATCH_NAMESPACE for consistency'
				]
			);

			// Update internal config to reflect changes
            if (!this.config.dispatch_namespaces) {
                this.config.dispatch_namespaces = [];
            }
			this.config.dispatch_namespaces[0].namespace = dispatchNamespace;
			if (!this.config.vars) {
				this.config.vars = {};
			}
			this.config.vars.DISPATCH_NAMESPACE = dispatchNamespace;

		} catch (error) {
			this.logWarning(
				`Could not update dispatch namespace configuration: ${error instanceof Error ? error.message : String(error)}`,
				['Continuing with current configuration...']
			);
			// Non-blocking - continue deployment
		}
	}

	/**
	 * Cleans Wrangler cache and build artifacts
	 */
	private cleanWranglerCache(): void {
		console.log('🧹 Cleaning Wrangler cache and build artifacts...');

		try {
			// Remove .wrangler directory (contains wrangler cache and state)
			execSync('rm -rf .wrangler', {
				stdio: 'pipe',
				cwd: PROJECT_ROOT,
			});
			console.log('   ✅ Removed .wrangler directory');

			// Remove wrangler.json files from dist/* directories
			// Use find to locate and remove any wrangler.json files in dist subdirectories
			try {
				execSync('find dist -name "wrangler.json" -type f -delete 2>/dev/null || true', {
					stdio: 'pipe',
					cwd: PROJECT_ROOT,
				});
				console.log('   ✅ Removed cached wrangler.json files from dist');
			} catch (findError) {
				// Non-critical - continue if find fails
				console.log('   ℹ️  No cached wrangler.json files found in dist');
			}

			console.log('✅ Cache cleanup completed');
		} catch (error) {
			// Non-blocking - log warning but continue
			console.warn(
				`⚠️  Cache cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			console.warn('   Continuing with deployment...');
		}
	}

	/**
	 * Builds the project (clean dist and run build)
	 */
	private async buildProject(): Promise<void> {
		console.log('🔨 Building project...');

		try {
			// Run build
			execSync('bun run build', {
				stdio: 'inherit',
				cwd: PROJECT_ROOT,
			});

			console.log('✅ Project build completed');
		} catch (error) {
			throw new DeploymentError(
				'Failed to build project',
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	/**
	 * Deploys the project using Wrangler
	 */
	private async wranglerDeploy(): Promise<void> {
		console.log('🚀 Deploying to Cloudflare Workers...');

		try {
			execSync('wrangler deploy', {
				stdio: 'inherit',
				cwd: PROJECT_ROOT,
			});

			console.log('✅ Wrangler deployment completed');
		} catch (error) {
			throw new DeploymentError(
				'Failed to deploy with Wrangler',
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	/**
	 * Temporarily removes conflicting vars from wrangler.jsonc before deployment
	 * Returns the original vars for restoration later
	 */
	private async removeConflictingVars(): Promise<Record<string, string> | null> {
		const prodVarsPath = join(PROJECT_ROOT, '.prod.vars');
		
		if (!existsSync(prodVarsPath)) {
			console.log('ℹ️  No .prod.vars file found, skipping conflict resolution');
			return null;
		}

		try {
			console.log('🔍 Checking for var/secret conflicts...');
			
			// Read .prod.vars to see which secrets will be uploaded
			const prodVarsContent = readFileSync(prodVarsPath, 'utf-8');
			const secretVarNames = new Set<string>();
			
			prodVarsContent.split('\n').forEach(line => {
				line = line.trim();
				if (line && !line.startsWith('#') && line.includes('=')) {
					const varName = line.split('=')[0].trim();
					secretVarNames.add(varName);
				}
			});

			// Check which vars in wrangler.jsonc conflict with secrets
			const conflictingVars: Record<string, string> = {};
			const originalVars = { ...(this.config.vars || {}) };

			Object.keys(originalVars).forEach(varName => {
				if (secretVarNames.has(varName)) {
					conflictingVars[varName] = originalVars[varName] || '';
					console.log(`🔄 Found conflict: ${varName} (will be moved from var to secret)`);
				}
			});

			if (Object.keys(conflictingVars).length === 0) {
				console.log('✅ No var/secret conflicts found');
				return null;
			}

			console.log(`⚠️  Temporarily removing ${Object.keys(conflictingVars).length} conflicting vars from wrangler.jsonc`);

			// Remove conflicting vars from wrangler.jsonc
			const { content } = this.readWranglerConfig();
			
			const updatedVars = { ...originalVars };
			Object.keys(conflictingVars).forEach(varName => {
				delete updatedVars[varName];
			});

			// Update wrangler.jsonc with vars removed
			const edits = modify(
				content,
				['vars'],
				updatedVars,
				CloudflareDeploymentManager.JSONC_FORMAT_OPTIONS
			);

			const updatedContent = applyEdits(content, edits);
			this.writeWranglerConfig(updatedContent);

			this.logSuccess('Temporarily removed conflicting vars from wrangler.jsonc');
			return conflictingVars;

		} catch (error) {
			this.logWarning(`Could not remove conflicting vars: ${error instanceof Error ? error.message : String(error)}`);
			return null;
		}
	}

	/**
	 * Restores the original vars to wrangler.jsonc after deployment
	 */
	private async restoreOriginalVars(originalConflictingVars: Record<string, string> | null): Promise<void> {
		if (!originalConflictingVars || Object.keys(originalConflictingVars).length === 0) {
			return;
		}

		try {
			console.log('🔄 Restoring original vars to wrangler.jsonc...');
			
			const { content, config } = this.readWranglerConfig();
			
			// Merge back the conflicting vars
			const restoredVars = {
				...(config.vars || {}),
				...originalConflictingVars
			};

			const edits = modify(
				content,
				['vars'],
				restoredVars,
				CloudflareDeploymentManager.JSONC_FORMAT_OPTIONS
			);

			const updatedContent = applyEdits(content, edits);
			this.writeWranglerConfig(updatedContent);

			this.logSuccess(`Restored ${Object.keys(originalConflictingVars).length} original vars to wrangler.jsonc`);
			
		} catch (error) {
			this.logWarning(`Could not restore original vars: ${error instanceof Error ? error.message : String(error)}`, [
				'You may need to manually restore wrangler.jsonc vars'
			]);
		}
	}

	/**
	 * Creates .prod.vars file with current environment variables
	 */
	private createProdVarsFile(): void {
		const prodVarsPath = join(PROJECT_ROOT, '.prod.vars');

		console.log(
			'📝 Creating .prod.vars file from environment variables...',
		);

		// Map of environment variables to include in production secrets
		const secretVars = [
			'CLOUDFLARE_API_TOKEN',
			'CLOUDFLARE_ACCOUNT_ID',
			'TEMPLATES_REPOSITORY',
			'CLOUDFLARE_AI_GATEWAY',
			'CLOUDFLARE_AI_GATEWAY_URL',
			'CLOUDFLARE_AI_GATEWAY_TOKEN',
			'ANTHROPIC_API_KEY',
			'OPENAI_API_KEY',
			'GOOGLE_AI_STUDIO_API_KEY',
			'OPENROUTER_API_KEY',
			'GROQ_API_KEY',
			'GOOGLE_CLIENT_SECRET',
			'GOOGLE_CLIENT_ID',
			'GITHUB_CLIENT_ID',
			'GITHUB_CLIENT_SECRET',
			'JWT_SECRET',
			'WEBHOOK_SECRET',
			'SECRETS_ENCRYPTION_KEY',
			'SENTRY_DSN',
			'AI_PROXY_JWT_SECRET',
			'MAX_SANDBOX_INSTANCES',
			'CUSTOM_DOMAIN',
			'CUSTOM_PREVIEW_DOMAIN',
			'SANDBOX_INSTANCE_TYPE',
			'DISPATCH_NAMESPACE',
			'ALLOCATION_STRATEGY',
			'ENVIRONMENT',
			'PLATFORM_MODEL_PROVIDERS',
			'USE_CLOUDFLARE_IMAGES',
		];

		const prodVarsContent: string[] = [
			'# Production environment variables for Cloudflare Orange Build',
			'# Generated automatically during deployment',
			'',
			'# Essential Secrets:',
		];

		// Add environment variables that are set
		secretVars.forEach((varName) => {
			let value = process.env[varName];
			
			// Apply fallback logic for CLOUDFLARE_AI_GATEWAY_TOKEN
			if (varName === 'CLOUDFLARE_AI_GATEWAY_TOKEN' && (!value || value === '')) {
				value = this.env.CLOUDFLARE_AI_GATEWAY_TOKEN;
			}
			
			if (value && value !== '') {
				// Skip placeholder values
				if (
					value.startsWith('optional-') ||
					value.startsWith('your-')
				) {
					prodVarsContent.push(
						`# ${varName}="${value}" # Placeholder - update with actual value`,
					);
				} else {
					prodVarsContent.push(`${varName}="${value}"`);
				}
			} else {
				prodVarsContent.push(
					`# ${varName}="" # Not set in current environment`,
				);
			}
		});

		// Add environment marker
		prodVarsContent.push('');
		// prodVarsContent.push('ENVIRONMENT="prod"');

		try {
			writeFileSync(
				prodVarsPath,
				prodVarsContent.join('\n') + '\n',
				'utf-8',
			);
			console.log(
				`✅ Created .prod.vars file with ${secretVars.length} environment variables`,
			);
		} catch (error) {
			console.warn(
				`⚠️  Could not create .prod.vars file: ${error instanceof Error ? error.message : String(error)}`,
			);
			throw new DeploymentError(
				'Failed to create .prod.vars file',
				error instanceof Error ? error : new Error(String(error)),
			);
		}
	}

	/**
	 * Updates secrets using Wrangler (non-blocking)
	 */
	private async updateSecrets(): Promise<void> {
		console.log('🔐 Updating production secrets...');

		try {
			const prodVarsPath = join(PROJECT_ROOT, '.prod.vars');

			// Check if .prod.vars file exists, create it if not
			if (!existsSync(prodVarsPath)) {
				console.log(
					'📋 .prod.vars file not found, creating from environment variables...',
				);
				this.createProdVarsFile();
			}

			// Verify file exists after creation attempt
			if (!existsSync(prodVarsPath)) {
				console.warn(
					'⚠️  Could not create .prod.vars file, skipping secret update',
				);
				return;
			}

			execSync('wrangler secret bulk .prod.vars', {
				stdio: 'inherit',
				cwd: PROJECT_ROOT,
			});

			console.log('✅ Production secrets updated successfully');
		} catch (error) {
			// Non-blocking: Log warning but don't fail deployment
			console.warn(
				`⚠️  Could not update secrets: ${error instanceof Error ? error.message : String(error)}`,
			);
			console.warn(
				'   You may need to update secrets manually if required',
			);
		}
	}

	/**
	 * Checks if dispatch namespaces (Workers for Platforms) are available for the user
	 */
	private async checkDispatchNamespaceAvailability(): Promise<boolean> {
		console.log('🔍 Checking dispatch namespace availability (Workers for Platforms)...');

		try {
			// Run the wrangler dispatch-namespace list command to test availability
			const result = execSync('npx wrangler dispatch-namespace list', {
				stdio: 'pipe',
				cwd: PROJECT_ROOT,
				encoding: 'utf8',
			});

			// If the command succeeds without error, dispatch namespaces are available
			console.log('✅ Dispatch namespaces are available');
			return true;

		} catch (error: any) {
			// Parse the error to check if it's specifically about dispatch namespace access
			const errorOutput = error.stderr || error.stdout || error.message || '';

			if (errorOutput.includes('You do not have access to dispatch namespaces') || 
				errorOutput.includes('code: 10121')) {
				console.log('⚠️  Dispatch namespaces are NOT available');
				console.log('   Workers for Platforms is not enabled for this account');
				console.log('   You can purchase it at: https://dash.cloudflare.com?to=/:account/workers-for-platforms');
				console.log('   If you are an Enterprise customer, please contact your account team');
				return false;
			}

			// For other errors, log them but assume availability (conservative approach)
			console.warn(`⚠️  Could not verify dispatch namespace availability: ${errorOutput}`);
			console.warn('   Proceeding with assumption that dispatch namespaces are available');
			return true;
		}
	}

	/**
	 * Comments out the dispatch_namespaces section in wrangler.jsonc when not available
	 */
	private commentOutDispatchNamespaces(): void {
		try {
			console.log('🔧 Commenting out dispatch_namespaces in wrangler.jsonc...');
			
			const wranglerPath = join(PROJECT_ROOT, 'wrangler.jsonc');
			const content = readFileSync(wranglerPath, 'utf-8');
			
			// Check if dispatch_namespaces is currently uncommented
			if (!content.includes('"dispatch_namespaces": [')) {
				console.log('ℹ️  dispatch_namespaces already commented out or not present');
				return;
			}

			// Comment out the dispatch_namespaces section
			// Look for the pattern and replace it with commented version
			const commentedContent = content.replace(
				/(\s*)"dispatch_namespaces": \[[\s\S]*?\]/,
				'$1// "dispatch_namespaces": [\n$1//     {\n$1//         "binding": "DISPATCHER",\n$1//         "namespace": "orange-build-default-namespace",\n$1//         "experimental_remote": true\n$1//     }\n$1// ]'
			);

			if (commentedContent !== content) {
				this.writeWranglerConfig(commentedContent);
				this.logSuccess('Successfully commented out dispatch_namespaces in wrangler.jsonc');
			} else {
				console.log('ℹ️  No changes needed for dispatch_namespaces');
			}

		} catch (error) {
			this.logWarning(`Could not comment out dispatch_namespaces: ${error instanceof Error ? error.message : String(error)}`, [
				'Continuing with deployment...'
			]);
		}
	}

    /**
     * Runs database migrations
     */
    private async runDatabaseMigrations(): Promise<void> {
        console.log('Running database migrations...');
        try {
            await execSync(
                'bun run db:generate && bun run db:migrate:local && bun run db:migrate:remote',
                {
                    stdio: 'inherit',
                    cwd: PROJECT_ROOT,
                    encoding: 'utf8',
                }
            );
        } catch (error) {
            console.warn('Database migrations failed:', error instanceof Error ? error.message : String(error));
        }
    }

	/**
	 * Main deployment orchestration method
	 */
	public async deploy(): Promise<void> {
		console.log(
			'🧡 Cloudflare Orange Build - Automated Deployment Starting...\n',
		);

		const startTime = Date.now();
        let customDomain: string | null = null;
		let originalDockerfileContent: string | null = null;

		try {
			// Step 1: Early Configuration Updates (must happen before any wrangler commands)
            this.cleanWranglerCache();
			console.log('\n📋 Step 1: Updating configuration files...');
			
			console.log('   🔧 Cleaning ARM64 development flags from Dockerfile');
			originalDockerfileContent = this.cleanDockerfileForDeployment();

			console.log('   🔧 Updating package.json database commands');
			this.updatePackageJsonDatabaseCommands();

			console.log('   🔧 Updating wrangler.jsonc custom domain routes');
			customDomain = await this.updateCustomDomainRoutes();

			console.log('   🔧 Updating container instance types');
			this.updateContainerInstanceTypes();

			console.log('✅ Configuration files updated successfully!\n');

			// Step 1.5: Check dispatch namespace availability early
			console.log('\n📋 Step 1.5: Checking dispatch namespace availability...');
			const dispatchNamespacesAvailable = await this.checkDispatchNamespaceAvailability();
			
			// Comment out dispatch_namespaces in wrangler.jsonc if not available
			if (!dispatchNamespacesAvailable) {
				this.commentOutDispatchNamespaces();
			}
			console.log('✅ Dispatch namespace availability check completed!\n');

			// Step 2: Update container configuration if needed
			console.log('\n📋 Step 2: Updating container configuration...');
			this.updateContainerConfiguration();
			this.updateDispatchNamespace(dispatchNamespacesAvailable);

			// Step 3: Create .prod.vars and resolve var/secret conflicts before deployment
			console.log('\n📋 Step 3: Creating .prod.vars and resolving var/secret conflicts...');
			this.createProdVarsFile();
			const conflictingVars = await this.removeConflictingVars();
			
			// Store for potential cleanup on early exit
			this.conflictingVarsForCleanup = conflictingVars;

			// Steps 2-4: Run all setup operations in parallel
			const operations: Promise<void>[] = [
				this.deployTemplates(),
				this.buildProject(),
			];

			// Only add dispatch namespace setup if available
			if (dispatchNamespacesAvailable) {
				operations.push(this.ensureDispatchNamespace());
			}

			// Add AI Gateway setup if gateway name is provided
			if (this.env.CLOUDFLARE_AI_GATEWAY) {
				operations.push(this.ensureAIGateway());
			}

			// Log the operations that will run in parallel
			console.log(
				'📋 Step 4: Running all setup operations in parallel...',
			);
			if (dispatchNamespacesAvailable) {
				console.log('   🔄 Workers for Platforms namespace setup');
			} else {
				console.log('   ⏭️  Skipping Workers for Platforms namespace setup (not available)');
			}
			console.log('   🔄 Templates repository deployment');
			console.log('   🔄 Project build (clean + compile)');
			if (this.env.CLOUDFLARE_AI_GATEWAY) {
				console.log('   🔄 AI Gateway setup and configuration');
			}

			await Promise.all(operations);

			console.log(
				'✅ Parallel setup and build operations completed!',
			);

			let deploymentSucceeded = false;
			try {
				// Step 5: Deploy with Wrangler (now without conflicts)
				console.log('\n📋 Step 5: Deploying to Cloudflare Workers...');
				await this.wranglerDeploy();

				// Step 6: Update secrets (now no conflicts)
				console.log('\n📋 Step 6: Updating production secrets...');
				await this.updateSecrets();

				deploymentSucceeded = true;
			} finally {
				// Step 7: Always restore original vars (even if deployment failed)
				console.log('\n📋 Step 7: Restoring original configuration...');
				await this.restoreOriginalVars(conflictingVars);
				
				// Clear the backup since we've restored
				this.conflictingVarsForCleanup = null;
			}

            // Step 8: Run database migrations
            console.log('\n📋 Step 8: Running database migrations...');
            await this.runDatabaseMigrations();

			// Deployment complete
			if (deploymentSucceeded) {
				const duration = Math.round((Date.now() - startTime) / 1000);
				console.log(
					`\n🎉 Complete deployment finished successfully in ${duration}s!`,
				);
				console.log(
					`✅ Your Cloudflare Orange Build platform is now live at https://${customDomain}! 🚀`,
				);
				
				// Restore ARM64 flags for continued local development
				if (originalDockerfileContent) {
					console.log('\n🔄 Restoring local development configuration...');
					this.restoreDockerfileARM64Flags(originalDockerfileContent);
				}
			} else {
				throw new DeploymentError('Deployment failed during wrangler deploy or secret update');
			}
		} catch (error) {
			console.error('\n❌ Deployment failed:');

			if (error instanceof DeploymentError) {
				console.error(`   ${error.message}`);
				if (error.cause) {
					console.error(`   Caused by: ${error.cause.message}`);
				}
			} else {
				console.error(`   ${error}`);
			}

			console.error('\n🔍 Troubleshooting tips:');
			console.error(
				'   - Verify all environment variables are correctly set',
			);
			console.error(
				'   - Check your Cloudflare API token has required permissions',
			);
			console.error(
				'   - Ensure your account has access to Workers for Platforms',
			);
			console.error('   - Verify the templates repository is accessible');
			console.error(
				'   - Check that bun is installed and build script works',
			);

			process.exit(1);
		} finally {
			// Always restore ARM64 flags if they were removed, even on deployment failure
			if (originalDockerfileContent) {
				console.log('\n🔄 Restoring local development configuration...');
				this.restoreDockerfileARM64Flags(originalDockerfileContent);
			}
		}
	}
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
	const deployer = new CloudflareDeploymentManager();
	deployer.deploy().catch((error) => {
		console.error('Unexpected error:', error);
		process.exit(1);
	});
}

export default CloudflareDeploymentManager;
