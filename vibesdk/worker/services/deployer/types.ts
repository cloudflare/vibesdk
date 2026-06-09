/**
 * Wrangler configuration schema
 * Represents the structure of wrangler.jsonc file
 */
export interface WranglerConfig {
	name: string;
	main: string;
	compatibility_date: string;
	compatibility_flags?: string[];
	no_bundle?: boolean;
	assets?: {
		directory?: string;
		not_found_handling?: string;
		run_worker_first?: string[];
		binding?: string;
	};
	observability?: {
		enabled: boolean;
	};
	vars?: Record<string, string>;
	durable_objects?: {
		bindings?: Array<{
			name: string;
			class_name: string;
		}>;
	};
	kv_namespaces?: Array<{
		binding: string;
		id: string;
		preview_id?: string;
	}>;
	d1_databases?: Array<{
		binding: string;
		database_name: string;
		database_id: string;
	}>;
	r2_buckets?: Array<{
		binding: string;
		bucket_name: string;
	}>;
	migrations?: Array<{
		tag: string;
		new_classes?: string[];
		new_sqlite_classes?: string[];
		renamed_classes?: Array<{
			from: string;
			to: string;
		}>;
		deleted_classes?: string[];
	}>;
	services?: Array<{
		binding: string;
		service: string;
	}>;
}

/**
 * Asset configuration for Worker deployment
 */
export interface AssetConfig {
	html_handling?:
		| 'auto-trailing-slash'
		| 'drop-trailing-slash'
		| 'force-trailing-slash'
		| 'none';
	not_found_handling?: 'single-page-application' | '404-page' | 'none';
	serve_directly?: boolean;
	run_worker_first?: string[];
	binding?: string;
}

/**
 * Worker deployment metadata
 * Used in the multipart form data when deploying
 */
export interface WorkerMetadata {
	main_module: string;
	compatibility_date: string;
	compatibility_flags?: string[];
	assets?: {
		jwt: string;
		config?: AssetConfig;
	};
	bindings?: WorkerBinding[];
	vars?: Record<string, string>;
	migrations?: DurableObjectMigration;
	exported_handlers?: string[]; // For Durable Object class exports
}

/**
 * Durable Object migration configuration
 * Matches Cloudflare API structure
 */
export interface DurableObjectMigration {
	tag: string;
	new_classes?: string[];
	new_sqlite_classes?: string[];
	renamed_classes?: Array<{
		from: string;
		to: string;
	}>;
	deleted_classes?: string[];
}

/**
 * Worker binding configuration
 */
export interface WorkerBinding {
	name: string;
	type: string;
	class_name?: string; // For Durable Objects
	namespace_id?: string; // For KV namespaces
	database_id?: string; // For D1 databases
	bucket_name?: string; // For R2 buckets
}

/**
 * Asset upload session response from Cloudflare
 */
export interface UploadAssetSession {
	jwt: string; // JWT token for authenticating asset uploads
	buckets: string[][]; // Arrays of file hashes grouped for batch upload
}

/**
 * Asset manifest mapping file paths to their metadata
 */
export interface AssetManifest {
	[path: string]: {
		hash: string; // SHA256 hash (first 32 chars)
		size: number; // File size in bytes
	};
}

/**
 * Base deployment configuration
 */
export interface DeployConfig {
	accountId: string;
	apiToken: string;
	scriptName: string;
	compatibilityDate: string;
	compatibilityFlags?: string[];
	workerContent: string;
	assets?: AssetManifest;
	bindings?: WorkerBinding[];
	vars?: Record<string, string>;
}

/**
 * Deployment configuration for Workers for Platforms
 */
export interface DispatchDeployConfig extends DeployConfig {
	dispatchNamespace: string;
}
