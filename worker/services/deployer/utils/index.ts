/**
 * Calculate SHA256 hash of content (first 32 chars)
 * This matches Cloudflare's expected hash format
 */
export async function calculateFileHash(content: ArrayBuffer): Promise<string> {
	const hashBuffer = await crypto.subtle.digest('SHA-256', content);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return hashHex.substring(0, 32);
}

/**
 * Determine MIME type based on file extension
 * Critical for proper asset serving in browsers
 */
export function getMimeType(filePath: string): string {
	const ext = filePath.split('.').pop()?.toLowerCase() || '';

	const mimeTypes: Record<string, string> = {
		// HTML
		html: 'text/html',
		htm: 'text/html',

		// Styles
		css: 'text/css',

		// JavaScript
		js: 'application/javascript',
		mjs: 'application/javascript',
		jsx: 'application/javascript',
		ts: 'application/typescript',
		tsx: 'application/typescript',

		// Data
		json: 'application/json',
		xml: 'application/xml',
		txt: 'text/plain',
		csv: 'text/csv',

		// Images
		svg: 'image/svg+xml',
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		ico: 'image/x-icon',
		webp: 'image/webp',
		avif: 'image/avif',

		// Fonts
		woff: 'font/woff',
		woff2: 'font/woff2',
		ttf: 'font/ttf',
		otf: 'font/otf',
		eot: 'application/vnd.ms-fontobject',

		// Documents
		pdf: 'application/pdf',

		// Media
		webm: 'video/webm',
		mp4: 'video/mp4',
		mp3: 'audio/mpeg',
		wav: 'audio/wav',
		ogg: 'audio/ogg',
	};

	return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Validate required configuration fields
 */
export function validateConfig(config: any): void {
	if (!config.name) {
		throw new Error('Worker name is required in configuration');
	}

	if (!config.compatibility_date) {
		throw new Error('Compatibility date is required in configuration');
	}
}

/**
 * Create an asset manifest from file data
 */
export async function createAssetManifest(
	files: Map<string, ArrayBuffer>,
): Promise<Record<string, { hash: string; size: number }>> {
	const manifest: Record<string, { hash: string; size: number }> = {};

	for (const [path, content] of files.entries()) {
		const hash = await calculateFileHash(content);
		manifest[path] = {
			hash,
			size: content.byteLength,
		};
	}

	return manifest;
}

/**
 * Merge migration configurations
 */
export function mergeMigrations(migrations: any[] | undefined): any | null {
	if (!migrations || migrations.length === 0) {
		return null;
	}

	const mergedMigration: any = {
		tag: migrations[migrations.length - 1].tag, // Use latest tag
		new_classes: [],
		new_sqlite_classes: [],
	};

	// Collect all classes from all migrations
	for (const migration of migrations) {
		if (migration.new_classes) {
			mergedMigration.new_classes.push(...migration.new_classes);
		}
		if (migration.new_sqlite_classes) {
			mergedMigration.new_sqlite_classes.push(
				...migration.new_sqlite_classes,
			);
		}
	}

	// Remove empty arrays
	if (mergedMigration.new_classes.length === 0)
		delete mergedMigration.new_classes;
	if (mergedMigration.new_sqlite_classes.length === 0)
		delete mergedMigration.new_sqlite_classes;

	// Return null if no migrations to apply
	if (!mergedMigration.new_classes && !mergedMigration.new_sqlite_classes) {
		return null;
	}

	return mergedMigration;
}

/**
 * Extract Durable Object class names from merged migration
 */
export function extractDurableObjectClasses(mergedMigration: any): string[] {
	if (!mergedMigration) return [];

	return [
		...(mergedMigration.new_classes || []),
		...(mergedMigration.new_sqlite_classes || []),
	];
}

/**
 * Build worker bindings from Wrangler configuration
 * DRY implementation to avoid code duplication
 */
export function buildWorkerBindings(
	config: any,
	hasAssets: boolean = false,
): any[] {
	const bindings: any[] = [];

	// Add asset binding if assets are present
	if (hasAssets) {
		bindings.push({
			name: config.assets?.binding || 'ASSETS',
			type: 'assets',
		});
	}

	// Add Durable Object bindings
	if (config.durable_objects?.bindings) {
		for (const binding of config.durable_objects.bindings) {
			bindings.push({
				name: binding.name,
				type: 'durable_object_namespace',
				class_name: binding.class_name,
			});
		}
	}

	// Add KV namespace bindings
	if (config.kv_namespaces) {
		for (const kv of config.kv_namespaces) {
			bindings.push({
				name: kv.binding,
				type: 'kv_namespace',
				namespace_id: kv.id,
			});
		}
	}

	// Add D1 database bindings
	if (config.d1_databases) {
		for (const d1 of config.d1_databases) {
			bindings.push({
				name: d1.binding,
				type: 'd1',
				database_id: d1.database_id,
			});
		}
	}

	// Add R2 bucket bindings
	if (config.r2_buckets) {
		for (const r2 of config.r2_buckets) {
			bindings.push({
				name: r2.binding,
				type: 'r2_bucket',
				bucket_name: r2.bucket_name,
			});
		}
	}

	return bindings;
}
