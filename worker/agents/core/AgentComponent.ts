import { AgentInfrastructure } from './AgentCore';
import { StructuredLogger } from '../../logger';
import { WebSocketMessageType } from '../../api/websocketTypes';
import { WebSocketMessageData } from '../../api/websocketTypes';
import { FileManager } from '../services/implementations/FileManager';
import { DeploymentManager } from '../services/implementations/DeploymentManager';
import { GitVersionControl } from '../git';
import { AgentState, BaseProjectState } from './state';
import { WebSocketMessageResponses } from '../constants';

/**
 * Base class for all agent components (behaviors and objectives)
 * 
 * Provides common infrastructure access patterns via protected helpers.
 * 
 * Both BaseCodingBehavior and ProjectObjective extend this class to access:
 * - Core infrastructure (state, env, sql, logger)
 * - Services (fileManager, deploymentManager, git)
 */
export abstract class AgentComponent<TState extends BaseProjectState = AgentState> {
    constructor(protected readonly infrastructure: AgentInfrastructure<TState>) {}
    
    // ==========================================
    // PROTECTED HELPERS (Infrastructure access)
    // ==========================================
    
    protected get env(): Env {
        return this.infrastructure.env;
    }
    
    get logger(): StructuredLogger {
        return this.infrastructure.logger();
    }
    
    protected getAgentId(): string {
        return this.infrastructure.getAgentId();
    }
    
    public getWebSockets(): WebSocket[] {
        return this.infrastructure.getWebSockets();
    }

    protected get state(): TState {
        return this.infrastructure.state;
    }

    setState(state: TState): void {
        try {
            this.infrastructure.setState(state);
        } catch (error) {
            this.broadcastError("Error setting state", error);
            this.logger.error("State details:", {
                originalState: JSON.stringify(this.state, null, 2),
                newState: JSON.stringify(state, null, 2)
            });
        }
    }
    
    // ==========================================
    // PROTECTED HELPERS (Service access)
    // ==========================================
    
    protected get fileManager(): FileManager {
        return this.infrastructure.fileManager;
    }
    
    protected get deploymentManager(): DeploymentManager {
        return this.infrastructure.deploymentManager;
    }
    
    public get git(): GitVersionControl {
        return this.infrastructure.git;
    }

    protected broadcast<T extends WebSocketMessageType>(
        type: T, 
        data?: WebSocketMessageData<T>
    ): void {
        this.infrastructure.broadcast(type, data);
    }

    protected broadcastError(context: string, error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`${context}:`, error);
        this.broadcast(WebSocketMessageResponses.ERROR, {
            error: `${context}: ${errorMessage}`
        });
    }
}
