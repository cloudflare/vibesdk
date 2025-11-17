/**
 * BlobURLManager
 *
 * Centralized management of blob URL lifecycle to prevent memory leaks.
 * Tracks all created blob URLs and provides cleanup utilities.
 */

export class BlobURLManager {
	private urls = new Set<string>();

	/**
	 * Create a blob URL and track it for cleanup
	 */
	createBlobURL(blob: Blob): string {
		const url = URL.createObjectURL(blob);
		this.urls.add(url);
		return url;
	}

	/**
	 * Revoke a specific blob URL
	 */
	revokeBlobURL(url: string): void {
		if (this.urls.has(url)) {
			URL.revokeObjectURL(url);
			this.urls.delete(url);
		}
	}

	/**
	 * Revoke all tracked blob URLs
	 */
	revokeAll(): void {
		for (const url of this.urls) {
			URL.revokeObjectURL(url);
		}
		this.urls.clear();
	}

	/**
	 * Get count of tracked blob URLs (for debugging)
	 */
	getCount(): number {
		return this.urls.size;
	}

	/**
	 * Check if a URL is tracked
	 */
	has(url: string): boolean {
		return this.urls.has(url);
	}
}

/**
 * Global instance for shared blob URL management
 * Used by ModuleLoader, DependencyLoader, and other compilation components
 */
export const globalBlobManager = new BlobURLManager();
