/**
 * Git Protocol Handler
 * Handles git clone/fetch operations via HTTP protocol
 * Route: /apps/:id.git/info/refs and /apps/:id.git/git-upload-pack
 * 
 * Architecture: Export git objects from DO, build repo in worker to save DO memory
 */
import { getAgentStub } from '../../agents';
import { createLogger } from '../../logger';
import { GitCloneService } from '../../agents/git/git-clone-service';
import { AppService } from '../../database/services/AppService';
import { JWTUtils } from '../../utils/jwtUtils';
import { GitCache } from './git-cache';

const logger = createLogger('GitProtocol');

/**
 * Git protocol route patterns
 */
const GIT_INFO_REFS_PATTERN = /^\/apps\/([a-f0-9-]+)\.git\/info\/refs$/;
const GIT_UPLOAD_PACK_PATTERN = /^\/apps\/([a-f0-9-]+)\.git\/git-upload-pack$/;

/**
 * Check if request is a Git protocol request
 */
export function isGitProtocolRequest(pathname: string): boolean {
    return GIT_INFO_REFS_PATTERN.test(pathname) || GIT_UPLOAD_PACK_PATTERN.test(pathname);
}

/**
 * Extract app ID from Git protocol URL
 */
function extractAppId(pathname: string): string | null {
    const infoRefsMatch = pathname.match(GIT_INFO_REFS_PATTERN);
    if (infoRefsMatch) return infoRefsMatch[1];
    
    const uploadPackMatch = pathname.match(GIT_UPLOAD_PACK_PATTERN);
    if (uploadPackMatch) return uploadPackMatch[1];
    
    return null;
}

/**
 * Extract agent HEAD OID from git objects
 */
function extractAgentHeadOid(gitObjects: Array<{ path: string; data: Uint8Array }>): string | null {
    const headFile = gitObjects.find(obj => obj.path === '.git/HEAD');
    if (!headFile) return null;
    
    const headContent = new TextDecoder().decode(headFile.data).trim();
    
    if (headContent.startsWith('ref: ')) {
        const refPath = headContent.slice(5).trim();
        const refFile = gitObjects.find(obj => obj.path === `.git/${refPath}`);
        return refFile ? new TextDecoder().decode(refFile.data).trim() : null;
    }
    
    return null;
}

/**
 * Verify git access (public apps or owner with valid token)
 */
async function verifyGitAccess(
    request: Request,
    env: Env,
    appId: string
): Promise<{ hasAccess: boolean; appCreatedAt?: Date }> {
    logger.info('Verifying git access', { appId });
    
    // Log all headers for debugging
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
        headers[key] = key.toLowerCase().includes('auth') ? `${value.substring(0, 20)}...` : value;
    });
    logger.info('Request headers', { headers, url: request.url });
    
    const appService = new AppService(env);
    const app = await appService.getAppDetails(appId);
    
    logger.info('App details retrieved', { appId, found: !!app, visibility: app?.visibility });
    
    if (!app) {
        logger.warn('App not found in database', { appId });
        return { hasAccess: false };
    }

    // Public apps: anyone can clone
    if (app.visibility === 'public') {
        return { hasAccess: true, appCreatedAt: app.createdAt || undefined };
    }

    // Private apps: require authentication
    const authHeader = request.headers.get('Authorization');
    logger.info('Private app - checking auth header', { hasAuthHeader: !!authHeader, authType: authHeader?.split(' ')[0] });
    
    let token: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7);
        logger.info('Extracted Bearer token', { tokenLength: token.length });
    } else if (authHeader?.startsWith('Basic ')) {
        // Git sends credentials as Basic auth
        const decoded = atob(authHeader.slice(6));
        const [username, password] = decoded.split(':');
        token = password || username;
        logger.info('Extracted Basic auth token', { tokenLength: token?.length, hasUsername: !!username, hasPassword: !!password });
    }

    if (!token) {
        logger.warn('No token found in auth header - will return 401 to prompt git for credentials');
        return { hasAccess: false };
    }

    // Verify token using JWTUtils
    const jwtUtils = JWTUtils.getInstance(env);
    const payload = await jwtUtils.verifyToken(token);

    if (!payload) {
        logger.warn('Token verification failed - invalid or expired token');
        return { hasAccess: false };
    }

    logger.info('Token verified', { userId: payload.sub, appOwnerId: app.userId });

    // Check if user owns the app
    const hasAccess = payload.sub === app.userId;
    
    if (!hasAccess) {
        logger.warn('Access denied - user does not own this app', { userId: payload.sub, appOwnerId: app.userId });
    } else {
        logger.info('Access granted - user owns this app');
    }
    
    return { hasAccess, appCreatedAt: hasAccess ? (app.createdAt || undefined) : undefined };
}

/**
 * Handle Git info/refs request
 */
async function handleInfoRefs(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
    appId: string
): Promise<Response> {
    try {
        // Verify access first
        const { hasAccess, appCreatedAt } = await verifyGitAccess(request, env, appId);
        if (!hasAccess) {
            // Return 401 with WWW-Authenticate to prompt git for credentials
            return new Response('Authentication required', { 
                status: 401,
                headers: {
                    'WWW-Authenticate': 'Basic realm="Git"'
                }
            });
        }
        
        const agentStub = await getAgentStub(env, appId);
        if (!agentStub || !(await agentStub.isInitialized())) {
            return new Response('Repository not found', { status: 404 });
        }
        
        // Export git objects from DO
        const { gitObjects, query, hasCommits, templateDetails } = await agentStub.exportGitObjects();
        
        if (!hasCommits) {
            // Return empty advertisement for repos with no commits
            return new Response('001e# service=git-upload-pack\n0000', {
                status: 200,
                headers: {
                    'Content-Type': 'application/x-git-upload-pack-advertisement',
                    'Cache-Control': 'no-cache'
                }
            });
        }
        
        // Extract HEAD OID for cache validation
        const agentHeadOid = extractAgentHeadOid(gitObjects);
        if (!agentHeadOid) {
            throw new Error('Could not determine agent HEAD OID');
        }
        
        // Try memory cache first
        const cache = new GitCache();
        const { repo } = await cache.getRepository(appId, agentHeadOid, templateDetails);
        
        if (repo) {
            logger.info('Cache HIT (memory): info/refs', { appId, agentHeadOid });
            const response = await GitCloneService.handleInfoRefs(repo);
            return new Response(response, {
                status: 200,
                headers: {
                    'Content-Type': 'application/x-git-upload-pack-advertisement',
                    'Cache-Control': 'no-cache',
                    'X-Cache': 'HIT-MEMORY'
                }
            });
        }
        
        logger.info('Cache MISS: building repository', { appId, agentHeadOid });
        
        // Build repository in worker
        const repoFS = await GitCloneService.buildRepository({
            gitObjects,
            templateDetails,
            appQuery: query,
            appCreatedAt
        });
        
        // Store in memory for subsequent upload-pack request
        cache.storeRepository(appId, repoFS, agentHeadOid, templateDetails);
        
        // Use waitUntil to keep Worker alive for upload-pack request (typically arrives within seconds)
        ctx.waitUntil(
            new Promise(resolve => setTimeout(resolve, 5000))
        );
        
        // Generate info/refs response
        const response = await GitCloneService.handleInfoRefs(repoFS);
        return new Response(response, {
            status: 200,
            headers: {
                'Content-Type': 'application/x-git-upload-pack-advertisement',
                'Cache-Control': 'no-cache',
                'X-Cache': 'MISS'
            }
        });
    } catch (error) {
        logger.error('Git info/refs error:', error);
        return new Response('Internal server error', { status: 500 });
    }
}

/**
 * Handle Git upload-pack request
 */
async function handleUploadPack(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
    appId: string
): Promise<Response> {
    try {
        // Verify access first
        const { hasAccess, appCreatedAt } = await verifyGitAccess(request, env, appId);
        if (!hasAccess) {
            // Return 401 with WWW-Authenticate to prompt git for credentials
            return new Response('Authentication required', { 
                status: 401,
                headers: {
                    'WWW-Authenticate': 'Basic realm="Git"'
                }
            });
        }
        
        const agentStub = await getAgentStub(env, appId);
        if (!agentStub || !(await agentStub.isInitialized())) {
            return new Response('Repository not found', { status: 404 });
        }
        
        // Export git objects from DO
        const { gitObjects, query, hasCommits, templateDetails } = await agentStub.exportGitObjects();
        
        if (!hasCommits) {
            return new Response('No commits to pack', { status: 404 });
        }
        
        // Extract HEAD OID for cache validation
        const agentHeadOid = extractAgentHeadOid(gitObjects);
        if (!agentHeadOid) {
            throw new Error('Could not determine agent HEAD OID');
        }
        
        // Try memory cache first (HOT PATH - usually hits after info/refs!)
        const cache = new GitCache();
        const { repo, source } = await cache.getRepository(appId, agentHeadOid, templateDetails);
        
        if (repo) {
            logger.info(`Cache HIT (${source}): upload-pack`, { appId, agentHeadOid });
            const packfile = await GitCloneService.handleUploadPack(repo);
            return new Response(packfile, {
                status: 200,
                headers: {
                    'Content-Type': 'application/x-git-upload-pack-result',
                    'Cache-Control': 'no-cache',
                    'X-Cache': `HIT-${source.toUpperCase()}`
                }
            });
        }
        
        logger.info('Cache MISS: building repository', { appId, agentHeadOid });
        
        // Build repository in worker (cold path - different Worker or timeout)
        const repoFS = await GitCloneService.buildRepository({
            gitObjects,
            templateDetails,
            appQuery: query,
            appCreatedAt
        });
        
        // Store in memory for potential retries
        cache.storeRepository(appId, repoFS, agentHeadOid, templateDetails);
        
        // Generate packfile with full commit history
        const packfile = await GitCloneService.handleUploadPack(repoFS);
        return new Response(packfile, {
            status: 200,
            headers: {
                'Content-Type': 'application/x-git-upload-pack-result',
                'Cache-Control': 'no-cache',
                'X-Cache': 'MISS'
            }
        });
    } catch (error) {
        logger.error('Git upload-pack error:', error);
        return new Response('Internal server error', { status: 500 });
    }
}

/**
 * Main handler for Git protocol requests
 */
export async function handleGitProtocolRequest(
    request: Request,
    env: Env,
    ctx: ExecutionContext
): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // Extract app ID
    const appId = extractAppId(pathname);
    if (!appId) {
        return new Response('Invalid Git URL', { status: 400 });
    }
    
    // Route to appropriate handler
    if (GIT_INFO_REFS_PATTERN.test(pathname)) {
        return handleInfoRefs(request, env, ctx, appId);
    } else if (GIT_UPLOAD_PACK_PATTERN.test(pathname)) {
        return handleUploadPack(request, env, ctx, appId);
    }
    
    return new Response('Not found', { status: 404 });
}
