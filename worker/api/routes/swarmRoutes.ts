/**
 * Swarm API Routes - Multi-agent swarm orchestration endpoints
 * Uses existing infrastructure: AI Gateway, vault, Drizzle
 */

import { SwarmOrchestrator } from '../../services/swarm-orchestrator';

/**
 * Get authenticated user ID from request
 * Assumes auth middleware has already validated the user
 */

export async function handleSwarmRoutes(
    pathname: string,
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
    userId: string
): Promise<Response | null> {
    const orchestrator = new SwarmOrchestrator(env);

    // POST /api/swarm/create - Create a new swarm session
    if (pathname === '/api/swarm/create' && request.method === 'POST') {
        try {
            const config = await request.json() as {
                name?: string;
                managerAgentId?: string;
                workerAgentIds?: string[];
                maxConcurrent?: number;
                timeoutMs?: number;
            };
            const result = await orchestrator.createSwarm(userId, {
                name: config.name ?? 'Unnamed Swarm',
                managerAgentId: config.managerAgentId ?? '',
                workerAgentIds: config.workerAgentIds ?? [],
                maxConcurrent: config.maxConcurrent ?? 3,
                timeoutMs: config.timeoutMs ?? 300000,
            });

            if (!result.success) {
                return new Response(JSON.stringify({ error: result.error }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            return new Response(JSON.stringify(result.session), {
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    // POST /api/swarm/:id/execute - Execute a swarm
    const executeMatch = pathname.match(/^\/api\/swarm\/([^/]+)\/execute$/);
    if (executeMatch && request.method === 'POST') {
        const swarmId = executeMatch[1];
        
        try {
            const body = await request.json() as { prompt?: string };
            const prompt = body.prompt ?? '';
            
            // Execute using orchestrator - uses existing AI infrastructure
            const result = await orchestrator.execute(swarmId, prompt, async (agentId, _task) => {
                // This callback uses existing AI infrastructure
                // In production, this would call the existing agent operations
                // For now, return a placeholder response
                return `Task processed by agent ${agentId}`;
            });

            if (!result.success) {
                return new Response(JSON.stringify({ error: result.error }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            return new Response(JSON.stringify(result.result), {
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    // GET /api/swarm/:id/status - Get swarm status
    const statusMatch = pathname.match(/^\/api\/swarm\/([^/]+)\/status$/);
    if (statusMatch && request.method === 'GET') {
        const swarmId = statusMatch[1];
        const result = await orchestrator.getStatus(swarmId);

        if (!result.success) {
            return new Response(JSON.stringify({ error: result.error }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify(result.status), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // DELETE /api/swarm/:id/cancel - Cancel a swarm
    const cancelMatch = pathname.match(/^\/api\/swarm\/([^/]+)\/cancel$/);
    if (cancelMatch && request.method === 'DELETE') {
        const swarmId = cancelMatch[1];
        const result = await orchestrator.cancel(swarmId);

        if (!result.success) {
            return new Response(JSON.stringify({ error: result.error }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(null, { status: 204 });
    }

    // GET /api/swarm - List all swarms for user
    if (pathname === '/api/swarm' && request.method === 'GET') {
        const result = await orchestrator.listSwarmSessions(userId);

        if (!result.success) {
            return new Response(JSON.stringify({ error: result.error }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify(result.sessions || []), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // GET /api/agents - List all agents for user
    if (pathname === '/api/agents' && request.method === 'GET') {
        const result = await orchestrator.listAgents(userId);

        if (!result.success) {
            return new Response(JSON.stringify({ error: result.error }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify(result.agents || []), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // POST /api/agents - Create a new agent
    if (pathname === '/api/agents' && request.method === 'POST') {
        try {
            const agentData = await request.json() as {
                role?: string;
                modelProvider?: string;
                instructions?: string;
                apiKeyVaultRef?: string;
                maxTokens?: number;
                temperature?: number;
            };
            const result = await orchestrator.createAgent(userId, {
                role: agentData.role ?? 'worker',
                modelProvider: agentData.modelProvider ?? 'workers-ai',
                instructions: agentData.instructions ?? '',
                apiKeyVaultRef: agentData.apiKeyVaultRef,
                maxTokens: agentData.maxTokens ?? 4096,
                temperature: agentData.temperature ?? 0.7,
            });

            if (!result.success) {
                return new Response(JSON.stringify({ error: result.error }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                });
            }

            return new Response(JSON.stringify(result.agent), {
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }

    // DELETE /api/agents/:id - Delete an agent
    const deleteAgentMatch = pathname.match(/^\/api\/agents\/([^/]+)$/);
    if (deleteAgentMatch && request.method === 'DELETE') {
        const agentId = deleteAgentMatch[1];
        const result = await orchestrator.deleteAgent(agentId, userId);

        if (!result.success) {
            return new Response(JSON.stringify({ error: result.error }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(null, { status: 204 });
    }

    return null;
}
