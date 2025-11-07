import { GitVersionControl } from "../git";
import { DeploymentManager } from "../services/implementations/DeploymentManager";
import { FileManager } from "../services/implementations/FileManager";
import { StructuredLogger } from "../../logger";
import { BaseProjectState } from "./state";
import { WebSocketMessageType } from "../../api/websocketTypes";
import { WebSocketMessageData } from "../../api/websocketTypes";
import { ConversationMessage, ConversationState } from "../inferutils/common";

/**
 * Infrastructure interface for agent implementations.
 * Provides access to:
 * - Core infrastructure (state, env, sql, logger)
 * - Services (fileManager, deploymentManager, git)
 */
export interface AgentInfrastructure<TState extends BaseProjectState> {
    readonly state: TState;
    setState(state: TState): void;
    getWebSockets(): WebSocket[];
    broadcast<T extends WebSocketMessageType>(
        type: T, 
        data?: WebSocketMessageData<T>
    ): void;
    getAgentId(): string;
    logger(): StructuredLogger;
    readonly env: Env;

    setConversationState(state: ConversationState): void;
    getConversationState(): ConversationState;
    addConversationMessage(message: ConversationMessage): void;
    clearConversation(): void;
    
    // Services
    readonly fileManager: FileManager;
    readonly deploymentManager: DeploymentManager;
    readonly git: GitVersionControl;
}
