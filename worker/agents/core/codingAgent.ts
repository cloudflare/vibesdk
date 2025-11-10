import { Agent, AgentContext } from "agents";
import { AgentInitArgs, AgentSummary, BehaviorType, DeployOptions, DeployResult, ExportOptions, ExportResult, DeploymentTarget } from "./types";
import { AgenticState, AgentState, BaseProjectState, CurrentDevState, MAX_PHASES, PhasicState } from "./state";
import { Blueprint } from "../schemas";
import { BaseCodingBehavior } from "./behaviors/base";
import { createObjectLogger, StructuredLogger } from '../../logger';
import { InferenceContext } from "../inferutils/config.types";
import { FileManager } from '../services/implementations/FileManager';
import { DeploymentManager } from '../services/implementations/DeploymentManager';
import { GitVersionControl } from '../git';
import { StateManager } from '../services/implementations/StateManager';
import { PhasicCodingBehavior } from './behaviors/phasic';
import { AgenticCodingBehavior } from './behaviors/agentic';
import { SqlExecutor } from '../git';
import { AgentInfrastructure } from "./AgentCore";
import { ProjectType } from './types';
import { Connection } from 'agents';
import { handleWebSocketMessage, handleWebSocketClose, broadcastToConnections } from './websocket';
import { WebSocketMessageData, WebSocketMessageType } from "worker/api/websocketTypes";
import { PreviewType, TemplateDetails } from "worker/services/sandbox/sandboxTypes";
import { WebSocketMessageResponses } from "../constants";
import { AppService } from "worker/database";
import { ConversationMessage, ConversationState } from "../inferutils/common";
import { ImageAttachment } from "worker/types/image-attachment";
import { RateLimitExceededError } from "shared/types/errors";
import { ProjectObjective } from "./objectives/base";
import { AppObjective } from "./objectives/app";
import { WorkflowObjective } from "./objectives/workflow";
import { PresentationObjective } from "./objectives/presentation";
import { FileOutputType } from "../schemas";

const DEFAULT_CONVERSATION_SESSION_ID = 'default';

interface AgentBootstrapProps {
    behaviorType?: BehaviorType;
    projectType?: ProjectType;
}

export class CodeGeneratorAgent extends Agent<Env, AgentState> implements AgentInfrastructure<AgentState> {
    public _logger: StructuredLogger | undefined;
    private behavior!: BaseCodingBehavior<AgentState>;
    private objective!: ProjectObjective<BaseProjectState>;
    protected static readonly PROJECT_NAME_PREFIX_MAX_LENGTH = 20;
    // Services
    readonly fileManager: FileManager;
    readonly deploymentManager: DeploymentManager;
    readonly git: GitVersionControl;
    
    // Redeclare as public to satisfy AgentInfrastructure interface
    declare public readonly env: Env;
    declare public readonly sql: SqlExecutor;
    
    // ==========================================
    // Initialization
    // ==========================================
    
    initialState = {
        behaviorType: 'phasic',
        projectType: 'app',
        projectName: "",
        query: "",
        sessionId: '',
        hostname: '',
        blueprint: {} as unknown as Blueprint,
        templateName: '',
        generatedFilesMap: {},
        conversationMessages: [],
        inferenceContext: {} as InferenceContext,
        shouldBeGenerating: false,
        sandboxInstanceId: undefined,
        commandsHistory: [],
        lastPackageJson: '',
        pendingUserInputs: [],
        projectUpdatesAccumulator: [],
        lastDeepDebugTranscript: null,
        mvpGenerated: false,
        reviewingInitiated: false,
        generatedPhases: [],
        currentDevState: CurrentDevState.IDLE,
        phasesCounter: MAX_PHASES,
    } as AgentState;

    constructor(ctx: AgentContext, env: Env) {
        super(ctx, env);
                
        this.sql`CREATE TABLE IF NOT EXISTS full_conversations (id TEXT PRIMARY KEY, messages TEXT)`;
        this.sql`CREATE TABLE IF NOT EXISTS compact_conversations (id TEXT PRIMARY KEY, messages TEXT)`;

        // Create StateManager
        const stateManager = new StateManager(
            () => this.state,
            (s) => this.setState(s)
        );
        
        this.git = new GitVersionControl(this.sql.bind(this));
        this.fileManager = new FileManager(
            stateManager,
            () => this.behavior?.getTemplateDetails?.() || null,
            this.git
        );
        this.deploymentManager = new DeploymentManager(
            {
                stateManager,
                fileManager: this.fileManager,
                getLogger: () => this.logger(),
                env: this.env
            },
            10 // MAX_COMMANDS_HISTORY
        );
        
        const props = (ctx.props as AgentBootstrapProps) || {};
        const isInitialized = Boolean(this.state.query);
        const behaviorType = isInitialized
            ? this.state.behaviorType
            : props.behaviorType ?? this.state.behaviorType ?? 'phasic';
        const projectType = isInitialized
            ? this.state.projectType
            : props.projectType ?? this.state.projectType ?? 'app';

        if (isInitialized && this.state.behaviorType !== behaviorType) {
            throw new Error(`State behaviorType mismatch: expected ${behaviorType}, got ${this.state.behaviorType}`);
        }

        if (behaviorType === 'phasic') {
            this.behavior = new PhasicCodingBehavior(this as AgentInfrastructure<PhasicState>, projectType);
        } else {
            this.behavior = new AgenticCodingBehavior(this as AgentInfrastructure<AgenticState>, projectType);
        }
        
        // Create objective based on project type
        this.objective = this.createObjective(projectType);
    }
    
    /**
     * Factory method to create the appropriate objective based on project type
     */
    private createObjective(projectType: ProjectType): ProjectObjective<BaseProjectState> {
        const infrastructure = this as AgentInfrastructure<BaseProjectState>;
        
        switch (projectType) {
            case 'app':
                return new AppObjective(infrastructure);
            case 'workflow':
                return new WorkflowObjective(infrastructure);
            case 'presentation':
                return new PresentationObjective(infrastructure);
            default:
                // Default to app for backward compatibility
                return new AppObjective(infrastructure);
        }
    }

    /**
     * Initialize the agent with project blueprint and template
     * Only called once in an app's lifecycle
     */
    async initialize(
        initArgs: AgentInitArgs<AgentState>,
        ..._args: unknown[]
    ): Promise<AgentState> {
        const { inferenceContext } = initArgs;
        const sandboxSessionId = DeploymentManager.generateNewSessionId();
        this.initLogger(inferenceContext.agentId, inferenceContext.userId, sandboxSessionId);
        
        // Infrastructure setup
        await this.gitInit();
        
        // Let behavior handle all state initialization (blueprint, projectName, etc.)
        await this.behavior.initialize({
            ...initArgs,
            sandboxSessionId // Pass generated session ID to behavior
        });
        
        try {
            await this.objective.onProjectCreated();
        } catch (error) {
            this.logger().error('Lifecycle hook onProjectCreated failed:', error);
            // Don't fail initialization if hook fails
        }
        await this.saveToDatabase();
        
        return this.state;
    }
    
    async isInitialized() {
        return this.getAgentId() ? true : false
    }

    /**
     * Called evertime when agent is started or re-started
     * @param props - Optional props
     */
    async onStart(props?: Record<string, unknown> | undefined): Promise<void> {
        this.logger().info(`Agent ${this.getAgentId()} session: ${this.state.sessionId} onStart`, { props });
        
        // Ignore if agent not initialized
        if (!this.state.query) {
            this.logger().warn(`Agent ${this.getAgentId()} session: ${this.state.sessionId} onStart ignored, agent not initialized`);
            return;
        }

        this.behavior.onStart(props);
        
        // Ensure state is migrated for any previous versions
        this.behavior.migrateStateIfNeeded();
        
        // Check if this is a read-only operation
        const readOnlyMode = props?.readOnlyMode === true;
        
        if (readOnlyMode) {
            this.logger().info(`Agent ${this.getAgentId()} starting in READ-ONLY mode - skipping expensive initialization`);
            return;
        }
        
        // Just in case
        await this.gitInit();
        
        await this.behavior.ensureTemplateDetails();
        this.logger().info(`Agent ${this.getAgentId()} session: ${this.state.sessionId} onStart processed successfully`);
    }

    private initLogger(agentId: string, userId: string, sessionId?: string) {
        this._logger = createObjectLogger(this, 'CodeGeneratorAgent');
        this._logger.setObjectId(agentId);
        this._logger.setFields({
            agentId,
            userId,
        });
        if (sessionId) {
            this._logger.setField('sessionId', sessionId);
        }
        return this._logger;
    }
    
    // ==========================================
    // Utilities
    // ==========================================

    logger(): StructuredLogger {
        if (!this._logger) {
            this._logger = this.initLogger(this.getAgentId(), this.state.inferenceContext.userId, this.state.sessionId);
        }
        return this._logger;
    }

    getAgentId() {
        return this.state.inferenceContext.agentId;
    }
    
    getWebSockets(): WebSocket[] {
        return this.ctx.getWebSockets();
    }
    
    /**
     * Get the project objective (defines what is being built)
     */
    getObjective(): ProjectObjective<BaseProjectState> {
        return this.objective;
    }
    
    /**
     * Get the behavior (defines how code is generated)
     */
    getBehavior(): BaseCodingBehavior<AgentState> {
        return this.behavior;
    }

    async getFullState(): Promise<AgentState> {
        return await this.behavior.getFullState();
    }

    async getSummary(): Promise<AgentSummary> {
        return this.behavior.getSummary();
    }

    getPreviewUrlCache(): string {
        return this.behavior.getPreviewUrlCache();
    }

    deployToSandbox(
        files: FileOutputType[] = [],
        redeploy: boolean = false,
        commitMessage?: string,
        clearLogs: boolean = false
    ): Promise<PreviewType | null> {
        return this.behavior.deployToSandbox(files, redeploy, commitMessage, clearLogs);
    }

    deployToCloudflare(target?: DeploymentTarget): Promise<{ deploymentUrl?: string; workersUrl?: string } | null> {
        return this.behavior.deployToCloudflare(target);
    }

    deployProject(options?: DeployOptions): Promise<DeployResult> {
        return this.objective.deploy(options);
    }

    exportProject(options: ExportOptions): Promise<ExportResult> {
        return this.objective.export(options);
    }
    
    protected async saveToDatabase() {
        this.logger().info(`Blueprint generated successfully for agent ${this.getAgentId()}`);
        // Save the app to database (authenticated users only)
        const appService = new AppService(this.env);
        await appService.createApp({
            id: this.state.inferenceContext.agentId,
            userId: this.state.inferenceContext.userId,
            sessionToken: null,
            title: this.state.blueprint.title || this.state.query.substring(0, 100),
            description: this.state.blueprint.description,
            originalPrompt: this.state.query,
            finalPrompt: this.state.query,
            framework: this.state.blueprint.frameworks.join(','),
            visibility: 'private',
            status: 'generating',
            createdAt: new Date(),
            updatedAt: new Date()
        });
        this.logger().info(`App saved successfully to database for agent ${this.state.inferenceContext.agentId}`, { 
            agentId: this.state.inferenceContext.agentId, 
            userId: this.state.inferenceContext.userId,
            visibility: 'private'
        });
        this.logger().info(`Agent initialized successfully for agent ${this.state.inferenceContext.agentId}`);
    }

    // ==========================================
    // Conversation Management
    // ==========================================

    /*
    * Each DO has 10 gb of sqlite storage. However, the way agents sdk works, it stores the 'state' object of the agent as a single row
    * in the cf_agents_state table. And row size has a much smaller limit in sqlite. Thus, we only keep current compactified conversation
    * in the agent's core state and store the full conversation in a separate DO table.
    */
    getConversationState(id: string = DEFAULT_CONVERSATION_SESSION_ID): ConversationState {
        const currentConversation = this.state.conversationMessages;
        const rows = this.sql<{ messages: string, id: string }>`SELECT * FROM full_conversations WHERE id = ${id}`;
        let fullHistory: ConversationMessage[] = [];
        if (rows.length > 0 && rows[0].messages) {
            try {
                const parsed = JSON.parse(rows[0].messages);
                if (Array.isArray(parsed)) {
                    fullHistory = parsed as ConversationMessage[];
                }
            } catch (_e) {}
        }
        if (fullHistory.length === 0) {
            fullHistory = currentConversation;
        }
        // Load compact (running) history from sqlite with fallback to in-memory state for migration
        const compactRows = this.sql<{ messages: string, id: string }>`SELECT * FROM compact_conversations WHERE id = ${id}`;
        let runningHistory: ConversationMessage[] = [];
        if (compactRows.length > 0 && compactRows[0].messages) {
            try {
                const parsed = JSON.parse(compactRows[0].messages);
                if (Array.isArray(parsed)) {
                    runningHistory = parsed as ConversationMessage[];
                }
            } catch (_e) {}
        }
        if (runningHistory.length === 0) {
            runningHistory = currentConversation;
        }

        // Remove duplicates
        const deduplicateMessages = (messages: ConversationMessage[]): ConversationMessage[] => {
            const seen = new Set<string>();
            return messages.filter(msg => {
                if (seen.has(msg.conversationId)) {
                    return false;
                }
                seen.add(msg.conversationId);
                return true;
            });
        };

        runningHistory = deduplicateMessages(runningHistory);
        fullHistory = deduplicateMessages(fullHistory);
        
        return {
            id: id,
            runningHistory,
            fullHistory,
        };
    }

    setConversationState(conversations: ConversationState) {
        const serializedFull = JSON.stringify(conversations.fullHistory);
        const serializedCompact = JSON.stringify(conversations.runningHistory);
        try {
            this.logger().info(`Saving conversation state ${conversations.id}, full_length: ${serializedFull.length}, compact_length: ${serializedCompact.length}`);
            this.sql`INSERT OR REPLACE INTO compact_conversations (id, messages) VALUES (${conversations.id}, ${serializedCompact})`;
            this.sql`INSERT OR REPLACE INTO full_conversations (id, messages) VALUES (${conversations.id}, ${serializedFull})`;
        } catch (error) {
            this.logger().error(`Failed to save conversation state ${conversations.id}`, error);
        }
    }

    addConversationMessage(message: ConversationMessage) {
        const conversationState = this.getConversationState();
        if (!conversationState.runningHistory.find(msg => msg.conversationId === message.conversationId)) {
            conversationState.runningHistory.push(message);
        } else  {
            conversationState.runningHistory = conversationState.runningHistory.map(msg => {
                if (msg.conversationId === message.conversationId) {
                    return message;
                }
                return msg;
            });
        }
        if (!conversationState.fullHistory.find(msg => msg.conversationId === message.conversationId)) {
            conversationState.fullHistory.push(message);
        } else {
            conversationState.fullHistory = conversationState.fullHistory.map(msg => {
                if (msg.conversationId === message.conversationId) {
                    return message;
                }
                return msg;
            });
        }
        this.setConversationState(conversationState);
    }
    
    /**
     * Clear conversation history
     */
    public clearConversation(): void {
        const messageCount = this.state.conversationMessages.length;
                        
        // Clear conversation messages only from agent's running history
        this.setState({
            ...this.state,
            conversationMessages: []
        });
                        
        // Send confirmation response
        this.broadcast(WebSocketMessageResponses.CONVERSATION_CLEARED, {
            message: 'Conversation history cleared',
            clearedMessageCount: messageCount
        });
    }

    /**
     * Handle user input during conversational code generation
     * Processes user messages and updates pendingUserInputs state
     */
    async handleUserInput(userMessage: string, images?: ImageAttachment[]): Promise<void> {
        try {
            this.logger().info('Processing user input message', { 
                messageLength: userMessage.length,
                pendingInputsCount: this.state.pendingUserInputs.length,
                hasImages: !!images && images.length > 0,
                imageCount: images?.length || 0
            });

            await this.behavior.handleUserInput(userMessage, images);

        } catch (error) {
            if (error instanceof RateLimitExceededError) {
                this.logger().error('Rate limit exceeded:', error);
                this.broadcast(WebSocketMessageResponses.RATE_LIMIT_ERROR, {
                    error
                });
                return;
            }
            this.broadcastError('Error processing user input', error);
        }
    }
    // ==========================================
    // WebSocket Management
    // ==========================================
    
    /**
     * Handle WebSocket message - Agent owns WebSocket lifecycle
     * Delegates to centralized handler which can access both behavior and objective
     */
    async onMessage(connection: Connection, message: string): Promise<void> {
        handleWebSocketMessage(this, connection, message);
    }
    
    /**
     * Handle WebSocket close - Agent owns WebSocket lifecycle
     */
    async onClose(connection: Connection): Promise<void> {
        handleWebSocketClose(connection);
    }
    
    /**
     * Broadcast message to all connected WebSocket clients
     * Type-safe version using proper WebSocket message types
     */
    public broadcast<T extends WebSocketMessageType>(
        type: T, 
        data?: WebSocketMessageData<T>
    ): void {
        broadcastToConnections(this, type, data || {} as WebSocketMessageData<T>);
    }

    protected broadcastError(context: string, error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger().error(`${context}:`, error);
        this.broadcast(WebSocketMessageResponses.ERROR, {
            error: `${context}: ${errorMessage}`
        });
    }
    // ==========================================
    // Git Management
    // ==========================================

    protected async gitInit() {
        try {
            await this.git.init();
            this.logger().info("Git initialized successfully");
            // Check if there is any commit
            const head = await this.git.getHead();
            
            if (!head) {
                this.logger().info("No commits found, creating initial commit");
                // get all generated files and commit them
                const generatedFiles = this.fileManager.getGeneratedFiles();
                if (generatedFiles.length === 0) {
                    this.logger().info("No generated files found, skipping initial commit");
                    return;
                }
                await this.git.commit(generatedFiles, "Initial commit");
                this.logger().info("Initial commit created successfully");
            }
        } catch (error) {
            this.logger().error("Error during git init:", error);
        }
    }

    /**
     * Export git objects
     * The route handler will build the repo with template rebasing
     */
    async exportGitObjects(): Promise<{
        gitObjects: Array<{ path: string; data: Uint8Array }>;
        query: string;
        hasCommits: boolean;
        templateDetails: TemplateDetails | null;
    }> {
        try {
            // Export git objects efficiently (minimal DO memory usage)
            const gitObjects = this.git.fs.exportGitObjects();

            await this.gitInit();
            
            // Ensure template details are available
            await this.behavior.ensureTemplateDetails();

            const templateDetails = this.behavior.getTemplateDetails();
            
            return {
                gitObjects,
                query: this.state.query || 'N/A',
                hasCommits: gitObjects.length > 0,
                templateDetails
            };
        } catch (error) {
            this.logger().error('exportGitObjects failed', error);
            throw error;
        }
    }

    /**
     * Cache GitHub OAuth token in memory for subsequent exports
     * Token is ephemeral - lost on DO eviction
     */
    setGitHubToken(token: string, username: string, ttl: number = 3600000): void {
        this.objective.setGitHubToken(token, username, ttl);
    }

    /**
     * Get cached GitHub token if available and not expired
     */
    getGitHubToken(): { token: string; username: string } | null {
        return this.objective.getGitHubToken();
    }

    /**
     * Clear cached GitHub token
     */
    clearGitHubToken(): void {
        this.objective.clearGitHubToken();
    }
}
