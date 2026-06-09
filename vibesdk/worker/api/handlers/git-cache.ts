import { createHash } from 'crypto';
import type { MemFS } from '../../agents/git/memfs';
import type { TemplateDetails as SandboxTemplateDetails } from '../../services/sandbox/sandboxTypes';

interface GitCacheMetadata {
    agentHeadOid: string;
    templateHash: string;
    timestamp: number;
}

interface InMemoryCacheEntry {
    repo: MemFS;
    metadata: GitCacheMetadata;
    timestamp: number;
}

// Worker-global in-memory cache (survives across requests in same Worker instance)
const inMemoryCache = new Map<string, InMemoryCacheEntry>();

// Cleanup tracker
let lastCleanup = Date.now();

function cleanupMemoryCache(): void {
    const now = Date.now();
    if (now - lastCleanup < 10000) return; // Only cleanup once per 10 seconds
    
    lastCleanup = now;
    const cutoff = now - 10000; // Remove entries older than 10s
    
    for (const [key, entry] of inMemoryCache.entries()) {
        if (entry.timestamp < cutoff) {
            inMemoryCache.delete(key);
        }
    }
}

export class GitCache {
    constructor() {}

    private getTemplateHash(templateDetails: SandboxTemplateDetails | null | undefined): string {
        if (!templateDetails) return 'no-template';
        
        const content = JSON.stringify({
            name: templateDetails.name,
            files: Object.keys(templateDetails.allFiles || {}).sort()
        });
        
        return createHash('sha256').update(content).digest('hex').slice(0, 16);
    }

    private getCacheKey(appId: string): string {
        return `git-repo:${appId}`;
    }

    /**
     * Check if in-memory cache is valid and fresh (< 5 seconds old)
     */
    private checkMemoryCache(
        appId: string,
        currentHeadOid: string,
        currentTemplateDetails: SandboxTemplateDetails | null | undefined
    ): MemFS | null {
        cleanupMemoryCache();
        
        const key = this.getCacheKey(appId);
        const entry = inMemoryCache.get(key);
        
        if (!entry) return null;
        
        // Check if too old (5 second TTL)
        if (Date.now() - entry.timestamp > 5000) {
            inMemoryCache.delete(key);
            return null;
        }
        
        // Check if still valid (OID + template hash match)
        const currentTemplateHash = this.getTemplateHash(currentTemplateDetails);
        if (entry.metadata.agentHeadOid !== currentHeadOid || 
            entry.metadata.templateHash !== currentTemplateHash) {
            inMemoryCache.delete(key);
            return null;
        }
        
        return entry.repo;
    }

    /**
     * Store repository in memory cache
     */
    private storeInMemory(
        appId: string,
        repo: MemFS,
        agentHeadOid: string,
        templateDetails: SandboxTemplateDetails | null | undefined
    ): void {
        const key = this.getCacheKey(appId);
        
        inMemoryCache.set(key, {
            repo,
            metadata: {
                agentHeadOid,
                templateHash: this.getTemplateHash(templateDetails),
                timestamp: Date.now()
            },
            timestamp: Date.now()
        });
    }

    /**
     * Get repository from in-memory cache
     */
    async getRepository(
        appId: string,
        agentHeadOid: string,
        templateDetails: SandboxTemplateDetails | null | undefined
    ): Promise<{ repo: MemFS | null; source: 'memory' | 'miss' }> {
        const memoryRepo = this.checkMemoryCache(appId, agentHeadOid, templateDetails);
        if (memoryRepo) {
            return { repo: memoryRepo, source: 'memory' };
        }
        
        return { repo: null, source: 'miss' };
    }

    /**
     * Store repository in memory cache
     */
    storeRepository(
        appId: string,
        repo: MemFS,
        agentHeadOid: string,
        templateDetails: SandboxTemplateDetails | null | undefined
    ): void {
        // Store in memory immediately (synchronous, no await needed)
        this.storeInMemory(appId, repo, agentHeadOid, templateDetails);
    }

    /**
     * Clear cache for an app
     */
    clearCache(appId: string): void {
        const key = this.getCacheKey(appId);
        inMemoryCache.delete(key);
    }
}
