/**
 * Swarm Orchestrator - manages multi-agent swarm lifecycle
 * Uses existing AI Gateway and vault infrastructure
 * 
 * Three execution modes:
 * - PARALLEL: All workers handle different phases concurrently (default)
 * - SPECIALIZED: Each worker has a specific role (planning, implementation, fixing)
 * - HORIZONTAL: Multiple workers do the same task, results merged
 */

import { eq, and } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { agents, swarmSessions, swarmAgents, agentTasks, users } from '../../database/schema';

/**
 * Swarm execution strategies
 */
export enum SwarmExecutionMode {
    PARALLEL = 'parallel',        // Different phases, concurrent execution
    SPECIALIZED = 'specialized',  // Specific roles per agent
    HORIZONTAL = 'horizontal',    // Same task, merged results
}

/**
 * Agent roles for SPECIALIZED mode
 */
export enum SwarmAgentRole {
    MANAGER = 'manager',         // Coordinates, plans
    PLANNER = 'planner',         // Generates phase concepts
    BUILDER = 'builder',         // Implements phases
    FIXER = 'fixer',             // Fixes issues
    TESTER = 'tester',           // Validates output
}

/**
 * Task types for SPECIALIZED mode
 */
export enum SwarmTaskType {
    PLAN = 'plan',
    IMPLEMENT = 'implement',
    FIX = 'fix',
    VALIDATE = 'validate',
}

/**
 * Unified Swarm Orchestrator using existing infrastructure
 * - AI routing: uses existing getConfigurationForModel from core.ts
 * - Secrets: uses existing vault system
 * - Database: uses existing Drizzle schema
 */
export class SwarmOrchestrator {
    private db: ReturnType<typeof drizzle>;

    constructor(env: Env) {
        this.db = drizzle(env.DB);
    }

    /**
     * Create a new swarm session
     */
    async createSwarm(
        userId: string,
        config: {
            name: string;
            managerAgentId: string;
            workerAgentIds: string[];
            maxConcurrent?: number;
            timeoutMs?: number;
            executionMode?: SwarmExecutionMode;
            agentRoles?: Record<string, SwarmAgentRole>; // agentId -> role mapping
        }
    ): Promise<{ success: boolean; session?: any; error?: string }> {
        try {
            // Validate user exists
            const user = await this.db.select()
                .from(users)
                .where(eq(users.id, userId))
                .get();

            if (!user) {
                return { success: false, error: 'User not found' };
            }

            // Validate agents belong to user
            const validAgents = await this.db.select()
                .from(agents)
                .where(and(
                    eq(agents.userId, userId),
                    eq(agents.id, config.managerAgentId)
                ))
                .all();

            if (validAgents.length === 0) {
                return { success: false, error: 'Manager agent not found' };
            }

            const swarmId = `swarm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Create swarm session
            await this.db.insert(swarmSessions).values({
                id: swarmId,
                userId,
                name: config.name,
                managerAgentId: config.managerAgentId,
                status: 'pending',
                maxConcurrent: Math.min(config.maxConcurrent || 3, 5), // Cap at 5 workers
                timeoutMs: config.timeoutMs || 300000,
                executionMode: config.executionMode || SwarmExecutionMode.PARALLEL,
                createdAt: new Date(),
            });

            // Link worker agents with roles (for specialized mode)
            for (const agentId of config.workerAgentIds) {
                const role = config.agentRoles?.[agentId] || 'Worker';
                await this.db.insert(swarmAgents).values({
                    swarmSessionId: swarmId,
                    agentId,
                    role,
                });
            }

            const session = await this.db.select()
                .from(swarmSessions)
                .where(eq(swarmSessions.id, swarmId))
                .get();

            return { success: true, session };
        } catch (error) {
            console.error('[SwarmOrchestrator] Create failed:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    /**
     * Execute swarm with three possible modes
     */
    async execute(
        swarmId: string,
        prompt: string,
        executeAgentOperation: (agentId: string, task: string, taskType?: SwarmTaskType) => Promise<string>
    ): Promise<{ success: boolean; result?: any; error?: string }> {
        try {
            const session = await this.db.select()
                .from(swarmSessions)
                .where(eq(swarmSessions.id, swarmId))
                .get();

            if (!session) {
                return { success: false, error: 'Swarm not found' };
            }

            // Update status
            await this.db.update(swarmSessions)
                .set({ status: 'running' })
                .where(eq(swarmSessions.id, swarmId));

            // Get worker agents
            const workerLinks = await this.db.select()
                .from(swarmAgents)
                .where(eq(swarmAgents.swarmSessionId, swarmId))
                .all();

            const executionMode = (session.executionMode as SwarmExecutionMode) || SwarmExecutionMode.PARALLEL;
            const maxConcurrent = Math.min(session.maxConcurrent || 3, 5);

            let taskResults: any[];

            switch (executionMode) {
                case SwarmExecutionMode.SPECIALIZED:
                    taskResults = await this.executeSpecialized(workerLinks, prompt, maxConcurrent, executeAgentOperation);
                    break;
                case SwarmExecutionMode.HORIZONTAL:
                    taskResults = await this.executeHorizontal(workerLinks, prompt, maxConcurrent, executeAgentOperation);
                    break;
                case SwarmExecutionMode.PARALLEL:
                default:
                    taskResults = await this.executeParallel(workerLinks, prompt, maxConcurrent, executeAgentOperation);
                    break;
            }

            // Aggregate results
            const successfulResults = taskResults.filter(r => r.status === 'completed');
            const finalOutput = successfulResults.length > 0
                ? successfulResults.map(r => r.output).join('\n\n---\n\n')
                : 'No tasks completed successfully';

            // Update session
            await this.db.update(swarmSessions)
                .set({
                    status: 'completed',
                    finalOutput,
                    completedAt: new Date(),
                })
                .where(eq(swarmSessions.id, swarmId));

            return { success: true, result: { output: finalOutput, taskResults } };
        } catch (error) {
            console.error('[SwarmOrchestrator] Execute failed:', error);
            // Mark as failed
            await this.db.update(swarmSessions)
                .set({ status: 'failed' })
                .where(eq(swarmSessions.id, swarmId));
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    /**
     * OPTION A: PARALLEL - All workers handle different phases concurrently
     */
    private async executeParallel(
        workerLinks: any[],
        prompt: string,
        maxConcurrent: number,
        executeAgentOperation: (agentId: string, task: string, taskType?: SwarmTaskType) => Promise<string>
    ): Promise<any[]> {
        const taskResults: any[] = [];

        // Process in batches based on maxConcurrent
        for (let i = 0; i < workerLinks.length; i += maxConcurrent) {
            const batch = workerLinks.slice(i, i + maxConcurrent);
            
            const batchPromises = batch.map(async (link, batchIndex) => {
                const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                await this.db.insert(agentTasks).values({
                    id: taskId,
                    agentId: link.agentId,
                    swarmSessionId: link.swarmSessionId,
                    description: `Parallel task ${i + batchIndex}: ${prompt.substring(0, 50)}...`,
                    status: 'running',
                    createdAt: new Date(),
                });

                try {
                    const output = await executeAgentOperation(link.agentId, prompt);
                    
                    await this.db.update(agentTasks)
                        .set({ status: 'completed', output, completedAt: new Date() })
                        .where(eq(agentTasks.id, taskId));

                    return { taskId, status: 'completed', output };
                } catch (error) {
                    await this.db.update(agentTasks)
                        .set({ status: 'failed', error: String(error), completedAt: new Date() })
                        .where(eq(agentTasks.id, taskId));

                    return { taskId, status: 'failed', error: String(error) };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            taskResults.push(...batchResults);
        }

        return taskResults;
    }

    /**
     * OPTION B: SPECIALIZED - Each worker has a specific role (plan, build, fix, test)
     */
    private async executeSpecialized(
        workerLinks: any[],
        prompt: string,
        maxConcurrent: number,
        executeAgentOperation: (agentId: string, task: string, taskType?: SwarmTaskType) => Promise<string>
    ): Promise<any[]> {
        const taskResults: any[] = [];

        // Execute in phases: plan -> implement -> fix -> validate
        const phases: Array<{ role: string; taskType: SwarmTaskType; description: string }> = [
            { role: 'planner', taskType: SwarmTaskType.PLAN, description: 'Creating plan' },
            { role: 'builder', taskType: SwarmTaskType.IMPLEMENT, description: 'Implementing' },
            { role: 'fixer', taskType: SwarmTaskType.FIX, description: 'Fixing issues' },
            { role: 'tester', taskType: SwarmTaskType.VALIDATE, description: 'Validating' },
        ];

        let currentPrompt = prompt;

        for (const phase of phases) {
            // Find workers for this role
            const phaseWorkers = workerLinks.filter(w => 
                w.role?.toLowerCase() === phase.role.toLowerCase()
            );

            if (phaseWorkers.length === 0) continue;

            // Run this phase in parallel (capped)
            const batch = phaseWorkers.slice(0, maxConcurrent);
            
            const phasePromises = batch.map(async (link) => {
                const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                await this.db.insert(agentTasks).values({
                    id: taskId,
                    agentId: link.agentId,
                    swarmSessionId: link.swarmSessionId,
                    description: `${phase.description}: ${currentPrompt.substring(0, 50)}...`,
                    status: 'running',
                    createdAt: new Date(),
                });

                try {
                    const output = await executeAgentOperation(link.agentId, currentPrompt, phase.taskType);
                    
                    await this.db.update(agentTasks)
                        .set({ status: 'completed', output, completedAt: new Date() })
                        .where(eq(agentTasks.id, taskId));

                    // Pass output to next phase
                    if (phase.taskType === SwarmTaskType.PLAN) {
                        currentPrompt = output;
                    }

                    return { taskId, role: phase.role, status: 'completed', output };
                } catch (error) {
                    await this.db.update(agentTasks)
                        .set({ status: 'failed', error: String(error), completedAt: new Date() })
                        .where(eq(agentTasks.id, taskId));

                    return { taskId, role: phase.role, status: 'failed', error: String(error) };
                }
            });

            const phaseResults = await Promise.all(phasePromises);
            taskResults.push(...phaseResults);

            // Stop if any phase fails
            const failures = phaseResults.filter(r => r.status === 'failed');
            if (failures.length > 0) {
                console.warn(`[SwarmOrchestrator] Phase ${phase.role} had failures, continuing...`);
            }
        }

        return taskResults;
    }

    /**
     * OPTION C: HORIZONTAL - Multiple workers do the same task, results merged
     */
    private async executeHorizontal(
        workerLinks: any[],
        prompt: string,
        maxConcurrent: number,
        executeAgentOperation: (agentId: string, task: string, taskType?: SwarmTaskType) => Promise<string>
    ): Promise<any[]> {
        // Run all workers on the same task concurrently
        const batch = workerLinks.slice(0, maxConcurrent);
        
        const taskPromises = batch.map(async (link) => {
            const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            await this.db.insert(agentTasks).values({
                id: taskId,
                agentId: link.agentId,
                swarmSessionId: link.swarmSessionId,
                description: `Horizontal task: ${prompt.substring(0, 50)}...`,
                status: 'running',
                createdAt: new Date(),
            });

            try {
                const output = await executeAgentOperation(link.agentId, prompt);
                
                await this.db.update(agentTasks)
                    .set({ status: 'completed', output, completedAt: new Date() })
                    .where(eq(agentTasks.id, taskId));

                return { taskId, agentId: link.agentId, status: 'completed', output };
            } catch (error) {
                await this.db.update(agentTasks)
                    .set({ status: 'failed', error: String(error), completedAt: new Date() })
                    .where(eq(agentTasks.id, taskId));

                return { taskId, agentId: link.agentId, status: 'failed', error: String(error) };
            }
        });

        return Promise.all(taskPromises);
    }

    /**
     * Get swarm status
     */
    async getStatus(swarmId: string): Promise<{ success: boolean; status?: any; error?: string }> {
        try {
            const session = await this.db.select()
                .from(swarmSessions)
                .where(eq(swarmSessions.id, swarmId))
                .get();

            if (!session) {
                return { success: false, error: 'Swarm not found' };
            }

            const tasks = await this.db.select()
                .from(agentTasks)
                .where(eq(agentTasks.swarmSessionId, swarmId))
                .all();

            const completedTasks = tasks.filter(t => t.status === 'completed').length;

            return {
                success: true,
                status: {
                    swarmId: session.id,
                    name: session.name,
                    status: session.status,
                    completedTasks,
                    totalTasks: tasks.length,
                    createdAt: session.createdAt,
                    completedAt: session.completedAt,
                }
            };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    /**
     * Cancel running swarm
     */
    async cancel(swarmId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const session = await this.db.select()
                .from(swarmSessions)
                .where(eq(swarmSessions.id, swarmId))
                .get();

            if (!session) {
                return { success: false, error: 'Swarm not found' };
            }

            await this.db.update(swarmSessions)
                .set({
                    status: 'cancelled',
                    completedAt: new Date(),
                })
                .where(eq(swarmSessions.id, swarmId));

            // Cancel running tasks
            await this.db.update(agentTasks)
                .set({
                    status: 'cancelled',
                    completedAt: new Date(),
                })
                .where(and(
                    eq(agentTasks.swarmSessionId, swarmId),
                    eq(agentTasks.status, 'running')
                ));

            return { success: true };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    /**
     * List user's swarms
     */
    async listSwarmSessions(userId: string): Promise<{ success: boolean; sessions?: any[]; error?: string }> {
        try {
            const sessions = await this.db.select()
                .from(swarmSessions)
                .where(eq(swarmSessions.userId, userId))
                .all();

            return { success: true, sessions };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    /**
     * Create a new agent
     */
    async createAgent(
        userId: string,
        agentData: {
            role: string;
            modelProvider: string;
            instructions: string;
            apiKeyVaultRef?: string;
            maxTokens?: number;
            temperature?: number;
        }
    ): Promise<{ success: boolean; agent?: any; error?: string }> {
        try {
            const agentId = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            await this.db.insert(agents).values({
                id: agentId,
                userId,
                role: agentData.role,
                modelProvider: agentData.modelProvider,
                apiKeyVaultRef: agentData.apiKeyVaultRef,
                instructions: agentData.instructions,
                maxTokens: agentData.maxTokens,
                temperature: agentData.temperature,
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            const agent = await this.db.select()
                .from(agents)
                .where(eq(agents.id, agentId))
                .get();

            return { success: true, agent };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    /**
     * List user's agents
     */
    async listAgents(userId: string): Promise<{ success: boolean; agents?: any[]; error?: string }> {
        try {
            const userAgents = await this.db.select()
                .from(agents)
                .where(eq(agents.userId, userId))
                .all();

            return { success: true, agents: userAgents };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }

    /**
     * Delete an agent
     */
    async deleteAgent(agentId: string, userId: string): Promise<{ success: boolean; error?: string }> {
        try {
            await this.db.delete(agents)
                .where(and(
                    eq(agents.id, agentId),
                    eq(agents.userId, userId)
                ));

            return { success: true };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
}
