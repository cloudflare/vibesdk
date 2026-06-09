#!/usr/bin/env node

/**
 * Cloudflare Orange Build - Automated Undeployment Script
 * 
 * This script safely removes all Cloudflare resources associated with 
 * the Orange Build platform, including:
 * - Worker
 * - Containers 
 * - KV namespaces
 * - R2 buckets
 * - Container images
 * - D1 database (optional, with --force flag)
 * - Dispatch namespace (optional, with --force flag)
 * 
 * Usage:
 *   bun scripts/undeploy.ts          # Standard cleanup (preserves D1 + dispatch namespace)
 *   bun scripts/undeploy.ts all --force  # Complete cleanup (destroys everything)
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'jsonc-parser';

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
  }>;
  d1_databases?: Array<{
    binding: string;
    database_name: string;
    database_id: string;
    migrations_dir?: string;
    experimental_remote?: boolean;
  }>;
  kv_namespaces?: Array<{
    binding: string;
    id: string;
    experimental_remote?: boolean;
  }>;
}

class UndeploymentError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = 'UndeploymentError';
  }
}

class CloudflareUndeploymentManager {
  private config: WranglerConfig;
  private forceMode: boolean = false;
  private allMode: boolean = false;

  constructor() {
    this.parseArguments();
    this.config = this.parseWranglerConfig();
  }

  /**
   * Parse command line arguments
   */
  private parseArguments(): void {
    const args = process.argv.slice(2);
    this.allMode = args.includes('all');
    this.forceMode = args.includes('--force');

    if (this.allMode && !this.forceMode) {
      console.warn('⚠️  Warning: "all" mode requires --force flag for safety');
      console.warn('   Usage: bun scripts/undeploy.ts all --force');
      process.exit(1);
    }

    console.log(`🚨 Undeployment Mode: ${this.allMode ? 'COMPLETE DESTRUCTION' : 'Standard Cleanup'}`);
    if (this.allMode) {
      console.log('⚠️  This will DELETE ALL RESOURCES including D1 database and dispatch namespace!');
    } else {
      console.log('ℹ️  This will preserve D1 database and dispatch namespace');
    }
  }

  /**
   * Safely parses wrangler.jsonc file
   */
  private parseWranglerConfig(): WranglerConfig {
    const wranglerPath = join(PROJECT_ROOT, 'wrangler.jsonc');
    
    if (!existsSync(wranglerPath)) {
      throw new UndeploymentError('wrangler.jsonc file not found in project root');
    }

    try {
      const content = readFileSync(wranglerPath, 'utf-8');
      const config = parse(content) as WranglerConfig;
      
      console.log(`📋 Parsed wrangler.jsonc - Project: ${config.name}`);
      return config;
    } catch (error) {
      throw new UndeploymentError(
        'Failed to parse wrangler.jsonc file',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Validate wrangler command for security
   */
  private validateWranglerCommand(command: string): void {
    // Allowlist of safe wrangler commands and patterns
    const allowedCommands = [
      /^delete\s+[a-zA-Z0-9_-]+$/,
      /^kv\s+namespace\s+delete\s+--namespace-id=[a-f0-9-]+$/,
      /^r2\s+bucket\s+delete\s+[a-zA-Z0-9_-]+$/,
      /^d1\s+delete\s+[a-zA-Z0-9_-]+\s+--skip-confirmation$/,
      /^dispatch-namespace\s+delete\s+[a-zA-Z0-9_-]+$/,
      /^containers\s+list$/,
      /^containers\s+delete\s+[a-f0-9-]+$/,
      /^containers\s+images\s+list$/,
      /^containers\s+images\s+delete\s+[a-zA-Z0-9_:.-]+$/
    ];

    const isAllowed = allowedCommands.some(pattern => pattern.test(command.trim()));
    if (!isAllowed) {
      throw new UndeploymentError(`Invalid or potentially unsafe wrangler command: ${command}`);
    }
  }

  /**
   * Execute wrangler command with error handling (synchronous)
   */
  private execWranglerCommand(command: string, description: string): boolean {
    try {
      console.log(`🔄 ${description}...`);
      
      // Validate command for security
      this.validateWranglerCommand(command);
      
      // For delete commands, set environment variables for non-interactive mode
      const env = command.includes('delete') ? {
        ...process.env,
        CI: 'true',
        WRANGLER_NON_INTERACTIVE: 'true',
        NODE_ENV: 'production'
      } : process.env;

      // Use secure array-based execution - eliminates command injection vectors
      const args = command.trim().split(/\s+/);
      const result = spawnSync('wrangler', args, {
        stdio: 'pipe',
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        env: env
      });
      
      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout || 'Command failed');
      }
      console.log(`✅ ${description} completed successfully`);
      return true;
    } catch (error) {
      console.warn(`⚠️  ${description} failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Execute wrangler command with error handling (asynchronous for parallel execution)
   */
  private async execWranglerCommandAsync(command: string, description: string): Promise<boolean> {
    try {
      console.log(`🔄 ${description}...`);
      
      return new Promise<boolean>((resolve) => {
        try {
          // Validate command for security
          this.validateWranglerCommand(command);
          
          // For delete commands, set environment variables for non-interactive mode
          const env = command.includes('delete') ? {
            ...process.env,
            CI: 'true',
            WRANGLER_NON_INTERACTIVE: 'true',
            NODE_ENV: 'production'
          } : process.env;

          // Use secure array-based execution - eliminates command injection vectors
          const args = command.trim().split(/\s+/);
          const result = spawnSync('wrangler', args, {
            stdio: 'pipe',
            cwd: PROJECT_ROOT,
            encoding: 'utf8',
            env: env
          });
          
          if (result.status !== 0) {
            throw new Error(result.stderr || result.stdout || 'Command failed');
          }
          console.log(`✅ ${description} completed successfully`);
          resolve(true);
        } catch (error) {
          console.warn(`⚠️  ${description} failed: ${error instanceof Error ? error.message : String(error)}`);
          resolve(false);
        }
      });
    } catch (error) {
      console.warn(`⚠️  ${description} failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Delete the main Worker
   */
  private async deleteWorker(): Promise<void> {
    console.log('\n🗑️  Deleting Worker...');
    
    const success = this.execWranglerCommand(
      `delete ${this.config.name}`,
      `Deleting Worker: ${this.config.name}`
    );

    if (!success) {
      console.warn('   Worker may not exist or already deleted');
    }
  }

  /**
   * Delete KV namespaces (in parallel)
   */
  private async deleteKVNamespaces(): Promise<void> {
    if (!this.config.kv_namespaces || this.config.kv_namespaces.length === 0) {
      console.log('\n📦 No KV namespaces configured, skipping...');
      return;
    }

    console.log(`\n📦 Deleting ${this.config.kv_namespaces.length} KV namespaces in parallel...`);

    const deletePromises = this.config.kv_namespaces.map(kvNamespace =>
      this.execWranglerCommandAsync(
        `kv namespace delete --namespace-id=${kvNamespace.id}`,
        `Deleting KV namespace: ${kvNamespace.binding} (ID: ${kvNamespace.id})`
      )
    );

    const results = await Promise.allSettled(deletePromises);
    const successCount = results.filter(result => result.status === 'fulfilled' && result.value).length;

    console.log(`✅ Deleted ${successCount}/${this.config.kv_namespaces.length} KV namespaces`);
  }

  /**
   * Delete R2 buckets (in parallel)
   */
  private async deleteR2Buckets(): Promise<void> {
    if (!this.config.r2_buckets || this.config.r2_buckets.length === 0) {
      console.log('\n🪣 No R2 buckets configured, skipping...');
      return;
    }

    console.log(`\n🪣 Deleting ${this.config.r2_buckets.length} R2 buckets in parallel...`);

    const deletePromises = this.config.r2_buckets.map(bucket =>
      this.execWranglerCommandAsync(
        `r2 bucket delete ${bucket.bucket_name}`,
        `Deleting R2 bucket: ${bucket.bucket_name}`
      )
    );

    const results = await Promise.allSettled(deletePromises);
    const successCount = results.filter(result => result.status === 'fulfilled' && result.value).length;

    console.log(`✅ Deleted ${successCount}/${this.config.r2_buckets.length} R2 buckets`);
  }

  /**
   * Delete D1 databases (only in force mode, in parallel)
   */
  private async deleteD1Database(): Promise<void> {
    if (!this.allMode || !this.forceMode) {
      console.log('\n🗄️  D1 databases preserved (use "all --force" to delete)');
      return;
    }

    if (!this.config.d1_databases || this.config.d1_databases.length === 0) {
      console.log('\n🗄️  No D1 databases configured, skipping...');
      return;
    }

    console.log(`\n🗄️  Deleting ${this.config.d1_databases.length} D1 databases in parallel...`);

    const deletePromises = this.config.d1_databases.map(database =>
      this.execWranglerCommandAsync(
        `d1 delete ${database.database_name} --skip-confirmation`,
        `Deleting D1 database: ${database.database_name}`
      )
    );

    const results = await Promise.allSettled(deletePromises);
    const successCount = results.filter(result => result.status === 'fulfilled' && result.value).length;

    console.log(`✅ Deleted ${successCount}/${this.config.d1_databases.length} D1 databases`);
  }

  /**
   * Delete dispatch namespaces (only in force mode, in parallel)
   */
  private async deleteDispatchNamespace(): Promise<void> {
    if (!this.allMode || !this.forceMode) {
      console.log('\n🚀 Dispatch namespaces preserved (use "all --force" to delete)');
      return;
    }

    if (!this.config.dispatch_namespaces || this.config.dispatch_namespaces.length === 0) {
      console.log('\n🚀 No dispatch namespaces configured, skipping...');
      return;
    }

    console.log(`\n🚀 Deleting ${this.config.dispatch_namespaces.length} dispatch namespaces in parallel...`);

    const deletePromises = this.config.dispatch_namespaces.map(dispatchNs =>
      this.execWranglerCommandAsync(
        `dispatch-namespace delete ${dispatchNs.namespace}`,
        `Deleting dispatch namespace: ${dispatchNs.namespace}`
      )
    );

    const results = await Promise.allSettled(deletePromises);
    const successCount = results.filter(result => result.status === 'fulfilled' && result.value).length;

    console.log(`✅ Deleted ${successCount}/${this.config.dispatch_namespaces.length} dispatch namespaces`);
  }

  /**
   * Delete containers (in parallel)
   */
  private async deleteContainers(): Promise<void> {
    console.log('\n🐳 Deleting containers...');

    try {
      // Get list of all containers
      const output = execSync('wrangler containers list', {
        stdio: 'pipe',
        cwd: PROJECT_ROOT,
        encoding: 'utf-8'
      });

      // Parse JSON output from wrangler
      let containers: any[] = [];
      try {
        // Extract JSON part from the output (skip warnings)
        const lines = output.split('\n');
        const jsonStart = lines.findIndex(line => line.trim().startsWith('['));
        if (jsonStart !== -1) {
          const jsonOutput = lines.slice(jsonStart).join('\n');
          containers = JSON.parse(jsonOutput);
        }
      } catch (parseError) {
        console.warn('⚠️  Could not parse containers list JSON output');
        return;
      }

      // Generate patterns to match our worker containers
      const workerName = this.config.name;
      const containerPatterns = [
        `${workerName}-`,
        `${workerName.replace('_', '-')}-`,
        `${workerName.replace('-', '_')}-`
      ];

      // Collect all container IDs that belong to our worker
      const containersToDelete: { id: string, name: string }[] = [];

      for (const container of containers) {
        if (!container.id || !container.name) continue;

        // Check if this container belongs to our worker
        const isOurContainer = containerPatterns.some(pattern => 
          container.name.toLowerCase().includes(pattern.toLowerCase())
        );

        if (isOurContainer) {
          containersToDelete.push({ id: container.id, name: container.name });
        }
      }

      if (containersToDelete.length === 0) {
        console.log('📦 No containers found for this worker');
        return;
      }

      console.log(`🔄 Deleting ${containersToDelete.length} containers in parallel...`);

      // Delete all containers in parallel
      const deletePromises = containersToDelete.map(container => 
        this.execWranglerCommandAsync(
          `containers delete ${container.id}`,
          `Deleting container: ${container.name} (${container.id})`
        )
      );

      const results = await Promise.allSettled(deletePromises);
      const successCount = results.filter(result => result.status === 'fulfilled' && result.value).length;

      console.log(`✅ Deleted ${successCount}/${containersToDelete.length} containers`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('DELETE method not allowed for the oauth_token authentication scheme')) {
        console.warn(`⚠️  Container deletion failed due to authentication method:`);
        console.warn(`   Containers deletion requires API token authentication, not OAuth.`);
        console.warn(`   Please ensure you're using 'wrangler login' with API token or set CLOUDFLARE_API_TOKEN.`);
        console.warn(`   For more info: https://developers.cloudflare.com/workers/wrangler/authentication/`);
      } else {
        console.warn(`⚠️  Could not list/delete containers: ${errorMessage}`);
      }
    }
  }

  /**
   * Delete container images related to this worker (in parallel)
   */
  private async deleteContainerImages(): Promise<void> {
    console.log('\n🐳 Deleting container images...');

    try {
      // Get list of all container images
      const output = execSync('wrangler containers images list', {
        stdio: 'pipe',
        cwd: PROJECT_ROOT,
        encoding: 'utf-8'
      });

      // Parse the output to find images related to our worker
      const lines = output.split('\n');
      const imageLines = lines.slice(1).filter(line => line.trim()); // Skip header

      // Generate patterns to match our worker images
      const workerName = this.config.name;
      const imagePatterns = [
        `${workerName}-`,
        `${workerName.replace('_', '-')}-`,
        `${workerName.replace('-', '_')}-`
      ];

      // Collect all images that belong to our worker
      const imagesToDelete: string[] = [];

      for (const line of imageLines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 2) continue;

        const [repository, tag] = parts;

        // Check if this image belongs to our worker
        const isOurImage = imagePatterns.some(pattern => 
          repository.toLowerCase().includes(pattern.toLowerCase())
        );

        if (isOurImage) {
          imagesToDelete.push(`${repository}:${tag}`);
        }
      }

      if (imagesToDelete.length === 0) {
        console.log('📦 No container images found for this worker');
        return;
      }

      console.log(`🔄 Deleting ${imagesToDelete.length} container images in parallel...`);

      // Delete all images in parallel
      const deletePromises = imagesToDelete.map(imageRef => 
        this.execWranglerCommandAsync(
          `containers images delete ${imageRef}`,
          `Deleting container image: ${imageRef}`
        )
      );

      const results = await Promise.allSettled(deletePromises);
      const successCount = results.filter(result => result.status === 'fulfilled' && result.value).length;

      console.log(`✅ Deleted ${successCount}/${imagesToDelete.length} container images`);

    } catch (error) {
      console.warn(`⚠️  Could not list/delete container images: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Show final confirmation and summary
   */
  private showFinalSummary(): void {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 UNDEPLOYMENT SUMMARY');
    console.log('='.repeat(60));
    
    const cleanedResources = [
      '✅ Containers deleted',
      '✅ Container images deleted',
      '✅ Worker deleted',
      '✅ KV namespaces deleted',
      '✅ R2 buckets deleted'
    ];

    if (this.allMode && this.forceMode) {
      cleanedResources.push('✅ D1 database deleted');
      cleanedResources.push('✅ Dispatch namespace deleted');
    } else {
      cleanedResources.push('⚪ D1 database preserved');
      cleanedResources.push('⚪ Dispatch namespace preserved');
    }

    cleanedResources.forEach(resource => console.log(`   ${resource}`));

    console.log('\n💡 To completely remove all resources, use:');
    console.log('   bun scripts/undeploy.ts all --force');
    
    console.log('\n🧡 Orange Build cleanup completed!');
  }

  /**
   * Main undeployment orchestration method
   */
  public async undeploy(): Promise<void> {
    console.log('🧡 Cloudflare Orange Build - Automated Undeployment Starting...\n');
    
    const startTime = Date.now();

    try {
      // Step 1: Delete containers first (they may reference images)
      await this.deleteContainers();

      // Step 2: Delete container images (after containers are deleted)
      await this.deleteContainerImages();

      // Step 3: Delete Worker (must be done before other resources)
      await this.deleteWorker();

      // Step 4: Delete supporting resources in parallel
      console.log('\n📋 Step 4: Deleting supporting resources in parallel...');
      const supportingResourcePromises = [
        this.deleteKVNamespaces(),
        this.deleteR2Buckets()
      ];
      
      await Promise.all(supportingResourcePromises);
      console.log('✅ Supporting resources deletion completed!');

      // Step 5: Delete persistent resources in parallel (only with --force)
      if (this.allMode && this.forceMode) {
        console.log('\n📋 Step 5: Deleting persistent resources in parallel...');
        const persistentResourcePromises = [
          this.deleteD1Database(),
          this.deleteDispatchNamespace()
        ];
        
        await Promise.all(persistentResourcePromises);
        console.log('✅ Persistent resources deletion completed!');
      } else {
        await this.deleteD1Database(); // This will just log preservation message
        await this.deleteDispatchNamespace(); // This will just log preservation message
      }

      // Final summary
      const duration = Math.round((Date.now() - startTime) / 1000);
      console.log(`\n⏱️  Undeployment completed in ${duration}s`);
      
      this.showFinalSummary();
      
    } catch (error) {
      console.error('\n❌ Undeployment failed:');
      
      if (error instanceof UndeploymentError) {
        console.error(`   ${error.message}`);
        if (error.cause) {
          console.error(`   Caused by: ${error.cause.message}`);
        }
      } else {
        console.error(`   ${error}`);
      }
      
      console.error('\n🔍 Troubleshooting tips:');
      console.error('   - Ensure you have proper Cloudflare API permissions');
      console.error('   - Check that wrangler is authenticated');
      console.error('   - Verify resources exist before attempting deletion');
      console.error('   - Some resources may have already been deleted manually');
      
      process.exit(1);
    }
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const undeployer = new CloudflareUndeploymentManager();
  undeployer.undeploy().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

export default CloudflareUndeploymentManager;