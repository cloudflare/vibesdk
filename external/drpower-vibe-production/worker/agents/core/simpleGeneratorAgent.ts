import { Agent, Connection } from 'agents';
import { 
    Blueprint, 
    PhaseConceptGenerationSchemaType, 
    PhaseConceptType,
    FileOutputType,
    PhaseImplementationSchemaType,
} from '../schemas';
import { GitHubPushRequest, PreviewType, StaticAnalysisResponse, TemplateDetails } from '../../services/sandbox/sandboxTypes';
import {  GitHubExportResult } from '../../services/github/types';
import { CodeGenState, CurrentDevState, MAX_PHASES, FileState } from './state';
import { AllIssues, AgentSummary, AgentInitArgs, PhaseExecutionResult, UserContext } from './types';
import { MAX_DEPLOYMENT_RETRIES, PREVIEW_EXPIRED_ERROR, WebSocketMessageResponses } from '../constants';
import { broadcastToConnections, handleWebSocketClose, handleWebSocketMessage } from './websocket';
import { createObjectLogger, StructuredLogger } from '../../logger';
import { ProjectSetupAssistant } from '../assistants/projectsetup';
import { UserConversationProcessor } from '../operations/UserConversationProcessor';
import { FileManager } from '../services/implementations/FileManager';
import { StateManager } from '../services/implementations/StateManager';
// import { WebSocketBroadcaster } from '../services/implementations/WebSocketBroadcaster';
import { GenerationContext } from '../domain/values/GenerationContext';
import { IssueReport } from '../domain/values/IssueReport';
import { PhaseImplementationOperation } from '../operations/PhaseImplementation';
import { CodeReviewOperation } from '../operations/CodeReview';
import { FileRegenerationOperation } from '../operations/FileRegeneration';
import { PhaseGenerationOperation } from '../operations/PhaseGeneration';
import { ScreenshotAnalysisOperation } from '../operations/ScreenshotAnalysis';
// Database schema imports removed - using zero-storage OAuth flow
import { BaseSandboxService } from '../../services/sandbox/BaseSandboxService';
import { getSandboxService } from '../../services/sandbox/factory';
import { WebSocketMessageData, WebSocketMessageType } from '../../api/websocketTypes';
import { InferenceContext, AgentActionKey } from '../inferutils/config.types';
import { AGENT_CONFIG } from '../inferutils/config';
import { ModelConfigService } from '../../database/services/ModelConfigService';
import { FileFetcher, fixProjectIssues } from '../../services/code-fixer';
import { FastCodeFixerOperation } from '../operations/FastCodeFixer';
import { getProtocolForHost } from '../../utils/urls';
import { looksLikeCommand } from '../utils/common';
import { generateBlueprint } from '../planning/blueprint';
import { prepareCloudflareButton } from '../../utils/deployToCf';
import { AppService } from '../../database';
import { RateLimitExceededError } from 'shared/types/errors';
import { generateId } from 'worker/utils/idGenerator';
import type { ImageAttachment } from '../../types/image-attachment';
import { OperationOptions } from '../operations/common';
import { CodingAgentInterface } from '../services/implementations/CodingAgent';

interface WebhookPayload {
    event: {
        eventType: 'runtime_error';
        payload: {
            error?: { message: string };
            runId?: string;
            status?: string;
            deploymentType?: string;
            instanceInfo?: unknown;
            command?: string;
        };
        instanceId?: string;
        runId?: string;
        timestamp?: string;
    };
    context: {
        sessionId?: string;
        agentId?: string;
        userId?: string;
    };
    source: string;
}

interface Operations {
    codeReview: CodeReviewOperation;
    regenerateFile: FileRegenerationOperation;
    generateNextPhase: PhaseGenerationOperation;
    analyzeScreenshot: ScreenshotAnalysisOperation;
    implementPhase: PhaseImplementationOperation;
    fastCodeFixer: FastCodeFixerOperation;
    processUserMessage: UserConversationProcessor;
}

/**
 * SimpleCodeGeneratorAgent - Deterministically orhestrated agent
 * 
 * Manages the lifecycle of code generation including:
 * - Blueprint, phase generation, phase implementation, review cycles orchestrations
 * - File streaming with WebSocket updates
 * - Code validation and error correction
 * - Deployment to sandbox service
 */
export class SimpleCodeGeneratorAgent extends Agent<Env, CodeGenState> {
    protected projectSetupAssistant: ProjectSetupAssistant | undefined;
    protected sandboxServiceClient: BaseSandboxService | undefined;
    protected fileManager: FileManager = new FileManager(
        new StateManager(() => this.state, (s) => this.setState(s)),
    );
    protected codingAgent: CodingAgentInterface = new CodingAgentInterface(this);

    private previewUrlCache: string = '';
    
    // In-memory storage for user-uploaded images (not persisted in DO state)
    // These are temporary and will be lost if the DO is evicted
    private pendingUserImages: ImageAttachment[] = [];
    
    protected operations: Operations = {
        codeReview: new CodeReviewOperation(),
        regenerateFile: new FileRegenerationOperation(),
        generateNextPhase: new PhaseGenerationOperation(),
        analyzeScreenshot: new ScreenshotAnalysisOperation(),
        implementPhase: new PhaseImplementationOperation(),
        fastCodeFixer: new FastCodeFixerOperation(),
        processUserMessage: new UserConversationProcessor()
    };

    isGenerating: boolean = false;
    
    // Deployment queue management to prevent concurrent deployments
    private currentDeploymentPromise: Promise<PreviewType | null> | null = null;
    
    private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
    
    public _logger: StructuredLogger | undefined;

    private initLogger(agentId: string, sessionId: string, userId: string) {
        this._logger = createObjectLogger(this, 'CodeGeneratorAgent');
        this._logger.setObjectId(agentId);
        this._logger.setFields({
            sessionId,
            agentId,
            userId,
        });
        return this._logger;
    }

    logger(): StructuredLogger {
        if (!this._logger) {
            this._logger = this.initLogger(this.getAgentId(), this.state.sessionId, this.state.inferenceContext.userId);
        }
        return this._logger;
    }

    getAgentId() {
        return this.state.inferenceContext.agentId
    }

    initialState: CodeGenState = {
        blueprint: {} as Blueprint, 
        query: "",
        generatedPhases: [],
        generatedFilesMap: {},
        agentMode: 'deterministic',
        generationPromise: undefined,
        sandboxInstanceId: undefined,
        templateDetails: {} as TemplateDetails,
        commandsHistory: [],
        lastPackageJson: '',
        clientReportedErrors: [],
        // latestScreenshot: undefined,
        pendingUserInputs: [],
        inferenceContext: {} as InferenceContext,
        // conversationalAssistant: new ConversationalAssistant(this.env),
        sessionId: '',
        hostname: '',
        conversationMessages: [],
        currentDevState: CurrentDevState.IDLE,
        phasesCounter: MAX_PHASES,
        mvpGenerated: false,
        shouldBeGenerating: false,
        reviewingInitiated: false,
        projectUpdatesAccumulator: [],
    };

    async saveToDatabase() {
        this.logger().info(`Blueprint generated successfully for agent ${this.getAgentId()}`);
        // Save the app to database (authenticated users only)
        const appService = new AppService(this.env);
        await appService.createApp({
            id: this.state.inferenceContext.agentId,
            userId: this.state.inferenceContext.userId,
            sessionToken: null,
            title: this.state.blueprint.title || this.state.query.substring(0, 100),
            description: this.state.blueprint.description || null,
            originalPrompt: this.state.query,
            finalPrompt: this.state.query,
            framework: this.state.blueprint.frameworks?.[0],
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

    /**
     * Initialize the code generator with project blueprint and template
     * Sets up services and begins deployment process
     */
    async initialize(
        initArgs: AgentInitArgs,
        ..._args: unknown[]
    ): Promise<CodeGenState> {

        const { query, language, frameworks, hostname, inferenceContext, templateInfo, sandboxSessionId } = initArgs;
        this.initLogger(inferenceContext.agentId, sandboxSessionId, inferenceContext.userId);
        
        // Generate a blueprint
        this.logger().info('Generating blueprint', { query, queryLength: query.length, imagesCount: initArgs.images?.length || 0 });
        this.logger().info(`Using language: ${language}, frameworks: ${frameworks ? frameworks.join(", ") : "none"}`);
        
        const blueprint = await generateBlueprint({
            env: this.env,
            inferenceContext,
            query,
            language: language!,
            frameworks: frameworks!,
            templateDetails: templateInfo.templateDetails,
            templateMetaInfo: templateInfo.selection,
            images: initArgs.images,
            stream: {
                chunk_size: 256,
                onChunk: (chunk) => {
                    // initArgs.writer.write({chunk});
                    initArgs.onBlueprintChunk(chunk);
                }
            }
        })

        const packageJsonFile = templateInfo.templateDetails?.files.find(file => file.filePath === 'package.json');
        const packageJson = packageJsonFile ? packageJsonFile.fileContents : '';
        
        this.setState({
            ...this.initialState,
            query,
            blueprint,
            templateDetails: templateInfo.templateDetails,
            sandboxInstanceId: undefined,
            generatedPhases: [],
            commandsHistory: [],
            lastPackageJson: packageJson,
            sessionId: sandboxSessionId,
            hostname,
            inferenceContext,
        });

        try {
            // Deploy to sandbox service and generate initial setup commands in parallel
            Promise.all([this.deployToSandbox(), this.getProjectSetupAssistant().generateSetupCommands(), this.generateReadme()]).then(async ([, setupCommands, _readme]) => {
                this.logger().info("Deployment to sandbox service and initial commands predictions completed successfully");
                await this.executeCommands(setupCommands.commands);
                this.logger().info("Initial commands executed successfully");
            }).catch(error => {
                this.logger().error("Error during deployment:", error);
                this.broadcast(WebSocketMessageResponses.ERROR, {
                    error: `Error during deployment: ${error instanceof Error ? error.message : String(error)}`
                });
            });
        } catch (error) {
            this.logger().error("Error during deployment:", error);
            this.broadcast(WebSocketMessageResponses.ERROR, {
                error: `Error during deployment: ${error instanceof Error ? error.message : String(error)}`
            });
        }
        this.logger().info(`Agent ${this.getAgentId()} session: ${this.state.sessionId} initialized successfully`);
        await this.saveToDatabase();
        return this.state;
    }

    async isInitialized() {
        return this.getAgentId() ? true : false
    }  
    
    onStateUpdate(_state: CodeGenState, _source: "server" | Connection) {
        // You can leave this empty to disable logging
        // Or, you can log a more specific message, for example:
        this.logger().info("State was updated.");
    }

    setState(state: CodeGenState): void {
        try {
            super.setState(state);
        } catch (error) {
            this.logger().error("Error setting state:", error);
            this.broadcast(WebSocketMessageResponses.ERROR, {
                error: `Error setting state: ${error instanceof Error ? error.message : String(error)}; Original state: ${JSON.stringify(this.state, null, 2)}; New state: ${JSON.stringify(state, null, 2)}`
            });
        }
    }

    getPreviewUrlCache() {
        return this.previewUrlCache;
    }

    getProjectSetupAssistant(): ProjectSetupAssistant {
        if (this.projectSetupAssistant === undefined) {
            this.projectSetupAssistant = new ProjectSetupAssistant({
                env: this.env,
                agentId: this.getAgentId(),
                query: this.state.query,
                blueprint: this.state.blueprint,
                template: this.state.templateDetails,
                inferenceContext: this.state.inferenceContext
            });
        }
        return this.projectSetupAssistant;
    }

    getSessionId() {
        return this.state.sessionId
    }

    resetSessionId() {
        const newSessionId = generateId();
        this.logger().info(`New Sandbox sessionId initialized: ${newSessionId}. Old sessionId: ${this.state.sessionId}`)
        this.setState({
            ...this.state,
            sessionId: newSessionId
        })
        // Reset sandbox service client
        this.sandboxServiceClient = undefined;
        
        // Clear health check interval since we're abandoning the old instance
        if (this.healthCheckInterval !== null) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    getSandboxServiceClient(): BaseSandboxService {
        if (this.sandboxServiceClient === undefined) {
            this.logger().info('Initializing sandbox service client');
            this.sandboxServiceClient = getSandboxService(this.getSessionId());
        }
        return this.sandboxServiceClient;
    }

    isCodeGenerating(): boolean {
        return this.isGenerating;
    }

    rechargePhasesCounter(max_phases: number = MAX_PHASES): void {
        if (this.getPhasesCounter() <= max_phases) {
            this.setState({
                ...this.state,
                phasesCounter: max_phases
            });
        }
    }

    decrementPhasesCounter(): number {
        const counter = this.getPhasesCounter() - 1;
        this.setState({
            ...this.state,
            phasesCounter: counter
        });
        return counter;
    }

    getPhasesCounter(): number {
        return this.state.phasesCounter;
    }

    private getOperationOptions(): OperationOptions {
        return {
            env: this.env,
            agentId: this.getAgentId(),
            context: GenerationContext.from(this.state, this.logger()),
            logger: this.logger(),
            inferenceContext: this.state.inferenceContext,
            agent: this.codingAgent
        };
    }

    async generateReadme() {
        this.logger().info('Generating README.md');
        // Only generate if it doesn't exist
        if (this.fileManager.fileExists('README.md')) {
            this.logger().info('README.md already exists');
            return;
        }

        this.broadcast(WebSocketMessageResponses.FILE_GENERATING, {
            message: 'Generating README.md',
            filePath: 'README.md',
            filePurpose: 'Project documentation and setup instructions'
        });

        const readme = await this.operations.implementPhase.generateReadme(this.getOperationOptions());

        this.fileManager.saveGeneratedFile(readme);

        this.broadcast(WebSocketMessageResponses.FILE_GENERATED, {
            message: 'README.md generated successfully',
            file: readme
        });
        this.logger().info('README.md generated successfully');
    }

    async queueUserRequest(request: string, images?: ImageAttachment[]): Promise<void> {
        this.rechargePhasesCounter(3);
        this.setState({
            ...this.state,
            pendingUserInputs: [...this.state.pendingUserInputs, request]
        });
        if (images && images.length > 0) {
            this.logger().info('Storing user images in-memory for phase generation', {
                imageCount: images.length,
                filenames: images.map(img => img.filename)
            });
            this.pendingUserImages = [...this.pendingUserImages, ...images];
        }
    }

    private fetchPendingUserRequests(): string[] {
        const inputs = this.state.pendingUserInputs;
        if (inputs.length > 0) {
            this.setState({
                ...this.state,
                pendingUserInputs: []
            });
        }
        return inputs;
    }

    /**
     * State machine controller for code generation with user interaction support
     * Executes phases sequentially with review cycles and proper state transitions
     */
    async generateAllFiles(reviewCycles: number = 5): Promise<void> {
        if (this.state.mvpGenerated && this.state.pendingUserInputs.length === 0) {
            this.logger().info("Code generation already completed and no user inputs pending");
            return;
        }
        if (this.isGenerating) {
            this.logger().info("Code generation already in progress");
            return;
        }
        this.isGenerating = true;

        this.broadcast(WebSocketMessageResponses.GENERATION_STARTED, {
            message: 'Starting code generation',
            totalFiles: this.getTotalFiles()
        });
        let currentDevState = CurrentDevState.PHASE_IMPLEMENTING;
        const generatedPhases = this.state.generatedPhases;
        const completedPhases = generatedPhases.filter(phase => !phase.completed);
        let phaseConcept : PhaseConceptType | undefined;
        if (completedPhases.length > 0) {
            phaseConcept = completedPhases[completedPhases.length - 1];
        } else if (generatedPhases.length > 0) {
            currentDevState = CurrentDevState.PHASE_GENERATING;
        } else {
            phaseConcept = this.state.blueprint.initialPhase;
            this.setState({
                ...this.state,
                currentPhase: phaseConcept,
                generatedPhases: [{...phaseConcept, completed: false}]
            });
        }

        let staticAnalysisCache: StaticAnalysisResponse | undefined;
        let userContext: UserContext | undefined;

        // Store review cycles for later use
        this.setState({
            ...this.state,
            reviewCycles: reviewCycles
        });

        try {
            let executionResults: PhaseExecutionResult;
            // State machine loop - continues until IDLE state
            while (currentDevState !== CurrentDevState.IDLE) {
                this.logger().info(`[generateAllFiles] Executing state: ${currentDevState}`);
                switch (currentDevState) {
                    case CurrentDevState.PHASE_GENERATING:
                        executionResults = await this.executePhaseGeneration();
                        currentDevState = executionResults.currentDevState;
                        phaseConcept = executionResults.result;
                        staticAnalysisCache = executionResults.staticAnalysis;
                        userContext = executionResults.userContext;
                        break;
                    case CurrentDevState.PHASE_IMPLEMENTING:
                        executionResults = await this.executePhaseImplementation(phaseConcept, staticAnalysisCache, userContext);
                        currentDevState = executionResults.currentDevState;
                        staticAnalysisCache = executionResults.staticAnalysis;
                        userContext = undefined;
                        break;
                    case CurrentDevState.REVIEWING:
                        currentDevState = await this.executeReviewCycle();
                        break;
                    case CurrentDevState.FINALIZING:
                        currentDevState = await this.executeFinalizing();
                        break;
                    default:
                        break;
                }
            }

            this.logger().info("State machine completed successfully");
        } catch (error) {
            this.logger().error("Error in state machine:", error);
            if (error instanceof RateLimitExceededError) {
                this.broadcast(WebSocketMessageResponses.RATE_LIMIT_ERROR, { error });
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.broadcast(WebSocketMessageResponses.ERROR, {
                error: `Error during generation: ${errorMessage}`
            });
        } finally {
            const appService = new AppService(this.env);
            await appService.updateApp(
                this.getAgentId(),
                {
                    status: 'completed',
                }
            );
            this.isGenerating = false;
            this.broadcast(WebSocketMessageResponses.GENERATION_COMPLETE, {
                message: "Code generation and review process completed.",
                instanceId: this.state.sandboxInstanceId,
            });
        }
    }

    /**
     * Execute phase generation state - generate next phase with user suggestions
     */
    async executePhaseGeneration(): Promise<PhaseExecutionResult> {
        this.logger().info("Executing PHASE_GENERATING state");
        try {
            const currentIssues = await this.fetchAllIssues();
            
            // Generate next phase with user suggestions if available
            
            // Get stored images if user suggestions are present
            const pendingUserInputs = this.fetchPendingUserRequests();
            const userContext = (pendingUserInputs.length > 0) 
                ? {
                    suggestions: pendingUserInputs,
                    images: this.pendingUserImages
                } as UserContext
                : undefined;

            if (userContext && userContext?.suggestions && userContext.suggestions.length > 0) {
                // Only reset pending user inputs if user suggestions were read
                this.logger().info("Resetting pending user inputs", { 
                    userSuggestions: userContext.suggestions,
                    hasImages: !!userContext.images,
                    imageCount: userContext.images?.length || 0
                });
                
                // Clear images after they're passed to phase generation
                if (userContext?.images && userContext.images.length > 0) {
                    this.logger().info('Clearing stored user images after passing to phase generation');
                    this.pendingUserImages = [];
                }
            }
            
            const nextPhase = await this.generateNextPhase(currentIssues, userContext);
                
            if (!nextPhase) {
                this.logger().info("No more phases to implement, transitioning to FINALIZING");
                return {
                    currentDevState: CurrentDevState.FINALIZING,
                };
            }
    
            // Store current phase and transition to implementation
            this.setState({
                ...this.state,
                currentPhase: nextPhase
            });
            
            return {
                currentDevState: CurrentDevState.PHASE_IMPLEMENTING,
                result: nextPhase,
                staticAnalysis: currentIssues.staticAnalysis,
                userContext: userContext,
            };
        } catch (error) {
            this.logger().error("Error generating phase", error);
            if (error instanceof RateLimitExceededError) {
                throw error;
            }
            this.broadcast(WebSocketMessageResponses.ERROR, {
                message: "Error generating phase",
                error: error
            });
            return {
                currentDevState: CurrentDevState.IDLE,
            };
        }
    }

    /**
     * Execute phase implementation state - implement current phase
     */
    async executePhaseImplementation(phaseConcept?: PhaseConceptType, staticAnalysis?: StaticAnalysisResponse, userContext?: UserContext): Promise<{currentDevState: CurrentDevState, staticAnalysis?: StaticAnalysisResponse}> {
        try {
            this.logger().info("Executing PHASE_IMPLEMENTING state");
    
            if (phaseConcept === undefined) {
                phaseConcept = this.state.currentPhase;
                if (phaseConcept === undefined) {
                    this.logger().error("No phase concept provided to implement, will call phase generation");
                    const results = await this.executePhaseGeneration();
                    phaseConcept = results.result;
                    if (phaseConcept === undefined) {
                        this.logger().error("No phase concept provided to implement, will return");
                        return {currentDevState: CurrentDevState.FINALIZING};
                    }
                }
            }
    
            this.setState({
                ...this.state,
                currentPhase: undefined // reset current phase
            });
    
            let currentIssues : AllIssues;
            if (staticAnalysis) {
                // If have cached static analysis, fetch everything else fresh
                currentIssues = {
                    runtimeErrors: await this.fetchRuntimeErrors(true),
                    staticAnalysis: staticAnalysis,
                    clientErrors: this.state.clientReportedErrors
                };
            } else {
                currentIssues = await this.fetchAllIssues(true)
            }
            
            // Implement the phase with user context (suggestions and images)
            await this.implementPhase(phaseConcept, currentIssues, userContext);
    
            this.logger().info(`Phase ${phaseConcept.name} completed, generating next phase`);

            const phasesCounter = this.decrementPhasesCounter();

            if ((phaseConcept.lastPhase || phasesCounter <= 0) && this.state.pendingUserInputs.length === 0) return {currentDevState: CurrentDevState.FINALIZING, staticAnalysis: staticAnalysis};
            return {currentDevState: CurrentDevState.PHASE_GENERATING, staticAnalysis: staticAnalysis};
        } catch (error) {
            this.logger().error("Error implementing phase", error);
            if (error instanceof RateLimitExceededError) {
                throw error;
            }
            return {currentDevState: CurrentDevState.IDLE};
        }
    }

    /**
     * Execute review cycle state - run code review and regeneration cycles
     */
    async executeReviewCycle(): Promise<CurrentDevState> {
        this.logger().info("Executing REVIEWING state");

        const reviewCycles = 2;
        if (this.state.reviewingInitiated) {
            this.logger().info("Reviewing already initiated, skipping");
            return CurrentDevState.IDLE;
        }
        this.setState({
            ...this.state,
            reviewingInitiated: true
        });
        
        try {
            this.logger().info("Starting code review and improvement cycle...");

            for (let i = 0; i < reviewCycles; i++) {
                // Check if user input came during review - if so, go back to phase generation
                if (this.state.pendingUserInputs.length > 0) {
                    this.logger().info("User input received during review, transitioning back to PHASE_GENERATING");
                    return CurrentDevState.PHASE_GENERATING;
                }

                this.logger().info(`Starting code review cycle ${i + 1}...`);

                const reviewResult = await this.reviewCode();

                if (!reviewResult) {
                    this.logger().warn("Code review failed. Skipping fix cycle.");
                    break;
                }

                const issuesFound = reviewResult.issuesFound;

                if (issuesFound) {
                    this.logger().info(`Issues found in review cycle ${i + 1}`, { issuesFound });
                    const promises = [];

                    for (const fileToFix of reviewResult.filesToFix) {
                        if (!fileToFix.require_code_changes) continue;
                        
                        const fileToRegenerate = this.fileManager.getGeneratedFile(fileToFix.filePath);
                        if (!fileToRegenerate) {
                            this.logger().warn(`File to fix not found in generated files: ${fileToFix.filePath}`);
                            continue;
                        }
                        
                        promises.push(this.regenerateFile(
                            fileToRegenerate,
                            fileToFix.issues,
                            0
                        ));
                    }

                    const fileResults = await Promise.allSettled(promises);
                    const files: FileOutputType[] = fileResults.map(result => result.status === "fulfilled" ? result.value : null).filter((result) => result !== null);

                    await this.deployToSandbox(files, false, "fix: Applying code review fixes");

                    // await this.applyDeterministicCodeFixes();

                    this.logger().info("Completed regeneration for review cycle");
                } else {
                    this.logger().info("Code review found no issues. Review cycles complete.");
                    break;
                }
            }

            // Check again for user input before finalizing
            if (this.state.pendingUserInputs.length > 0) {
                this.logger().info("User input received after review, transitioning back to PHASE_GENERATING");
                return CurrentDevState.PHASE_GENERATING;
            } else {
                this.logger().info("Review cycles complete, transitioning to IDLE");
                return CurrentDevState.IDLE;
            }

        } catch (error) {
            this.logger().error("Error during review cycle:", error);
            if (error instanceof RateLimitExceededError) {
                throw error;
            }
            return CurrentDevState.IDLE;
        }
    }

    /**
     * Execute finalizing state - final review and cleanup (runs only once)
     */
    async executeFinalizing(): Promise<CurrentDevState> {
        this.logger().info("Executing FINALIZING state - final review and cleanup");

        // Only do finalizing stage if it wasn't done before
        if (this.state.mvpGenerated) {
            this.logger().info("Finalizing stage already done");
            return CurrentDevState.REVIEWING;
        }
        this.setState({
            ...this.state,
            mvpGenerated: true
        });

        const phaseConcept: PhaseConceptType = {
            name: "Finalization and Review",
            description: "Full polishing and final review of the application",
            files: [],
            lastPhase: true
        }
        
        this.setState({
            ...this.state,
            generatedPhases: [
                ...this.state.generatedPhases,
                {
                    ...phaseConcept,
                    completed: false
                }
            ]
        });

        const currentIssues = await this.fetchAllIssues(true);
        
        // Run final review and cleanup phase
        await this.implementPhase(phaseConcept, currentIssues);

        const numFilesGenerated = this.fileManager.getGeneratedFilePaths().length;
        this.logger().info(`Finalization complete. Generated ${numFilesGenerated}/${this.getTotalFiles()} files.`);

        // Transition to IDLE - generation complete
        return CurrentDevState.REVIEWING;
    }

    /**
     * Generate next phase with user context (suggestions and images)
     */
    async generateNextPhase(currentIssues: AllIssues, userContext?: UserContext): Promise<PhaseConceptGenerationSchemaType | undefined> {
        const issues = IssueReport.from(currentIssues);
        
        // Build notification message
        let notificationMsg = "Generating next phase";
        if (userContext?.suggestions && userContext.suggestions.length > 0) {
            notificationMsg = `Generating next phase incorporating ${userContext.suggestions.length} user suggestion(s)`;
        }
        if (userContext?.images && userContext.images.length > 0) {
            notificationMsg += ` with ${userContext.images.length} image(s)`;
        }
        
        // Notify phase generation start
        this.broadcast(WebSocketMessageResponses.PHASE_GENERATING, {
            message: notificationMsg,
            issues: issues,
            userSuggestions: userContext?.suggestions,
        });
        
        const result = await this.operations.generateNextPhase.execute(
            {
                issues,
                userContext,
                isUserSuggestedPhase: userContext?.suggestions && userContext.suggestions.length > 0 && this.state.mvpGenerated,
            },
            this.getOperationOptions()
        )
        // Execute install commands if any
        if (result.installCommands && result.installCommands.length > 0) {
            this.executeCommands(result.installCommands);
        }

        // Execute delete commands if any
        const filesToDelete = result.files.filter(f => f.changes?.toLowerCase().trim() === 'delete');
        if (filesToDelete.length > 0) {
            this.logger().info(`Deleting ${filesToDelete.length} files: ${filesToDelete.map(f => f.path).join(", ")}`);
            this.deleteFiles(filesToDelete.map(f => f.path));
        }
        
        if (result.files.length === 0) {
            this.logger().info("No files generated for next phase");
            // Notify phase generation complete
            this.broadcast(WebSocketMessageResponses.PHASE_GENERATED, {
                message: `No files generated for next phase`,
                phase: undefined
            });
            return undefined;
        }
        
        this.setState({
            ...this.state,
            generatedPhases: [
                ...this.state.generatedPhases,
                {
                    ...result,
                    completed: false
                }
            ],
        });
        // Notify phase generation complete
        this.broadcast(WebSocketMessageResponses.PHASE_GENERATED, {
            message: `Generated next phase: ${result.name}`,
            phase: result
        });

        return result;
    }

    /**
     * Implement a single phase of code generation
     * Streams file generation with real-time updates and incorporates technical instructions
     */
    async implementPhase(phase: PhaseConceptType, currentIssues: AllIssues, userContext?: UserContext, streamChunks: boolean = true): Promise<PhaseImplementationSchemaType> {
        const issues = IssueReport.from(currentIssues);
        
        const implementationMsg = userContext?.suggestions && userContext.suggestions.length > 0
            ? `Implementing phase: ${phase.name} with ${userContext.suggestions.length} user suggestion(s)`
            : `Implementing phase: ${phase.name}`;
        const msgWithImages = userContext?.images && userContext.images.length > 0
            ? `${implementationMsg} and ${userContext.images.length} image(s)`
            : implementationMsg;
            
        this.broadcast(WebSocketMessageResponses.PHASE_IMPLEMENTING, {
            message: msgWithImages,
            phase: phase,
            issues: issues,
        });
            
        
        const result = await this.operations.implementPhase.execute(
            {
                phase, 
                issues, 
                isFirstPhase: this.state.generatedPhases.filter(p => p.completed).length === 0,
                fileGeneratingCallback: (filePath: string, filePurpose: string) => {
                    this.broadcast(WebSocketMessageResponses.FILE_GENERATING, {
                        message: `Generating file: ${filePath}`,
                        filePath: filePath,
                        filePurpose: filePurpose
                    });
                },
                userContext,
                shouldAutoFix: this.state.inferenceContext.enableRealtimeCodeFix,
                fileChunkGeneratedCallback: streamChunks ? (filePath: string, chunk: string, format: 'full_content' | 'unified_diff') => {
                    this.broadcast(WebSocketMessageResponses.FILE_CHUNK_GENERATED, {
                        message: `Generating file: ${filePath}`,
                        filePath: filePath,
                        chunk,
                        format,
                    });
                } : (_filePath: string, _chunk: string, _format: 'full_content' | 'unified_diff') => {},
                fileClosedCallback: (file: FileOutputType, message: string) => {
                    this.broadcast(WebSocketMessageResponses.FILE_GENERATED, {
                        message,
                        file,
                    });
                }
            },
            this.getOperationOptions()
        );
        
        this.broadcast(WebSocketMessageResponses.PHASE_VALIDATING, {
            message: `Validating files for phase: ${phase.name}`,
            phase: phase,
        });
    
        // Await the already-created realtime code fixer promises
        const finalFiles = await Promise.allSettled(result.fixedFilePromises).then((results: PromiseSettledResult<FileOutputType>[]) => {
            return results.map((result) => {
                if (result.status === 'fulfilled') {
                    return result.value;
                } else {
                    return null;
                }
            }).filter((f): f is FileOutputType => f !== null);
        });
    
        // Update state with completed phase
        this.fileManager.saveGeneratedFiles(finalFiles);

        this.logger().info("Files generated for phase:", phase.name, finalFiles.map(f => f.filePath));

        // Execute commands if provided
        if (result.commands && result.commands.length > 0) {
            this.logger().info("Phase implementation suggested install commands:", result.commands);
            await this.executeCommands(result.commands, false);
        }
    
        // Deploy generated files
        if (finalFiles.length > 0) {
            await this.deployToSandbox(finalFiles, false, phase.name);
            await this.applyDeterministicCodeFixes();
            if (this.state.inferenceContext.enableFastSmartCodeFix) {
                await this.applyFastSmartCodeFixes();
            }
        }

        // Validation complete
        this.broadcast(WebSocketMessageResponses.PHASE_VALIDATED, {
            message: `Files validated for phase: ${phase.name}`,
            phase: phase
        });
    
        this.logger().info("Files generated for phase:", phase.name, finalFiles.map(f => f.filePath));
    
        this.logger().info(`Validation complete for phase: ${phase.name}`);
    
        // Notify phase completion
        this.broadcast(WebSocketMessageResponses.PHASE_IMPLEMENTED, {
            phase: {
                name: phase.name,
                files: finalFiles.map(f => ({
                    path: f.filePath,
                    purpose: f.filePurpose,
                    contents: f.fileContents
                })),
                description: phase.description
            },
            message: "Files generated successfully for phase"
        });
    
        const previousPhases = this.state.generatedPhases;
        // Replace the phase with the new one
        const updatedPhases = previousPhases.map(p => p.name === phase.name ? {...p, completed: true} : p);
        this.setState({
            ...this.state,
            generatedPhases: updatedPhases,
        });

        this.logger().info("Completed phases:", JSON.stringify(updatedPhases, null, 2));
        
        return {
            files: finalFiles,
            deploymentNeeded: result.deploymentNeeded,
            commands: result.commands
        };
    }

    /**
     * Get current model configurations (defaults + user overrides)
     * Used by WebSocket to provide configuration info to frontend
     */
    async getModelConfigsInfo() {
        const userId = this.state.inferenceContext.userId;
        if (!userId) {
            throw new Error('No user session available for model configurations');
        }

        try {
            const modelConfigService = new ModelConfigService(this.env);
            
            // Get all user configs
            const userConfigsRecord = await modelConfigService.getUserModelConfigs(userId);
            
            // Transform to match frontend interface
            const agents = Object.entries(AGENT_CONFIG).map(([key, config]) => ({
                key,
                name: config.name,
                description: config.description
            }));

            const userConfigs: Record<string, any> = {};
            const defaultConfigs: Record<string, any> = {};

            for (const [actionKey, mergedConfig] of Object.entries(userConfigsRecord)) {
                if (mergedConfig.isUserOverride) {
                    userConfigs[actionKey] = {
                        name: mergedConfig.name,
                        max_tokens: mergedConfig.max_tokens,
                        temperature: mergedConfig.temperature,
                        reasoning_effort: mergedConfig.reasoning_effort,
                        fallbackModel: mergedConfig.fallbackModel,
                        isUserOverride: true
                    };
                }
                
                // Always include default config
                const defaultConfig = AGENT_CONFIG[actionKey as AgentActionKey];
                if (defaultConfig) {
                    defaultConfigs[actionKey] = {
                        name: defaultConfig.name,
                        max_tokens: defaultConfig.max_tokens,
                        temperature: defaultConfig.temperature,
                        reasoning_effort: defaultConfig.reasoning_effort,
                        fallbackModel: defaultConfig.fallbackModel
                    };
                }
            }

            return {
                agents,
                userConfigs,
                defaultConfigs
            };
        } catch (error) {
            this.logger().error('Error fetching model configs info:', error);
            throw error;
        }
    }

    /**
     * Perform comprehensive code review
     * Analyzes for runtime errors, static issues, and best practices
     */
    async reviewCode() {
        const issues = await this.fetchAllIssues(true);
        const issueReport = IssueReport.from(issues);

        // Report discovered issues
        this.broadcast(WebSocketMessageResponses.CODE_REVIEWING, {
            message: "Running code review...",
            staticAnalysis: issues.staticAnalysis,
            clientErrors: issues.clientErrors,
            runtimeErrors: issues.runtimeErrors
        });

        const reviewResult = await this.operations.codeReview.execute(
            {issues: issueReport},
            this.getOperationOptions()
        );
        
        // Execute commands if any
        if (reviewResult.commands && reviewResult.commands.length > 0) {
            await this.executeCommands(reviewResult.commands);
        }
        // Notify review completion
        this.broadcast(WebSocketMessageResponses.CODE_REVIEWED, {
            review: reviewResult,
            message: "Code review completed"
        });
        
        return reviewResult;
    }

    /**
     * Regenerate a file to fix identified issues
     * Retries up to 3 times before giving up
     */
    async regenerateFile(file: FileOutputType, issues: string[], retryIndex: number = 0) {
        this.broadcast(WebSocketMessageResponses.FILE_REGENERATING, {
            message: `Regenerating file: ${file.filePath}`,
            filePath: file.filePath,
            original_issues: issues,
        });
        
        const result = await this.operations.regenerateFile.execute(
            {file, issues, retryIndex},
            this.getOperationOptions()
        );

        this.fileManager.saveGeneratedFile(result);

        this.broadcast(WebSocketMessageResponses.FILE_REGENERATED, {
            message: `Regenerated file: ${file.filePath}`,
            file: result,
            original_issues: issues,
        });
        
        return result;
    }

    getTotalFiles(): number {
        return this.fileManager.getGeneratedFilePaths().length + ((this.state.currentPhase || this.state.blueprint.initialPhase)?.files?.length || 0);
    }

    getSummary(): Promise<AgentSummary> {
        // Ensure state is migrated before accessing files
        this.migrateStateIfNeeded();
        const summaryData = {
            query: this.state.query,
            generatedCode: this.fileManager.getGeneratedFiles(),
            conversation: this.state.conversationMessages,
        };
        return Promise.resolve(summaryData);
    }

    async getFullState(): Promise<CodeGenState> {
        // Ensure state is migrated before returning state
        this.migrateStateIfNeeded();
        return this.state;
    }
    
    /**
     * Migrate old snake_case file properties to camelCase format
     * This is needed for apps created before the schema migration
     */
    private migrateStateIfNeeded(): void {
        let needsMigration = false;
        
        // Helper function to migrate a file object from snake_case to camelCase
        const migrateFile = (file: any): any => {
            const hasOldFormat = 'file_path' in file || 'file_contents' in file || 'file_purpose' in file;
            
            if (hasOldFormat) {
                return {
                    filePath: file.filePath || file.file_path,
                    fileContents: file.fileContents || file.file_contents,
                    filePurpose: file.filePurpose || file.file_purpose,
                };
            }
            return file;
        };

        // Migrate generatedFilesMap
        const migratedFilesMap: Record<string, FileState> = {};
        for (const [key, file] of Object.entries(this.state.generatedFilesMap)) {
            const migratedFile = migrateFile(file);
            
            // Add FileState-specific properties if missing
            migratedFilesMap[key] = {
                ...migratedFile,
                lasthash: migratedFile.lasthash || '',
                lastmodified: migratedFile.lastmodified || Date.now(),
                unmerged: migratedFile.unmerged || []
            };
            
            if (migratedFile !== file) {
                needsMigration = true;
            }
        }

        // Migrate templateDetails.files
        let migratedTemplateDetails = this.state.templateDetails;
        if (migratedTemplateDetails?.files) {
            const migratedTemplateFiles = migratedTemplateDetails.files.map(file => {
                const migratedFile = migrateFile(file);
                if (migratedFile !== file) {
                    needsMigration = true;
                }
                return migratedFile;
            });
            
            if (needsMigration) {
                migratedTemplateDetails = {
                    ...migratedTemplateDetails,
                    files: migratedTemplateFiles
                };
            }
        }

        // Fix conversation message exponential bloat caused by incorrect message accumulation
        let migratedConversationMessages = this.state.conversationMessages;
        const MIN_MESSAGES_FOR_CLEANUP = 25;
        
        if (migratedConversationMessages && migratedConversationMessages.length > 0) {
            const originalCount = migratedConversationMessages.length;
            
            // Deduplicate messages by conversationId
            const seen = new Set<string>();
            const uniqueMessages = [];
            
            for (const message of migratedConversationMessages) {
                // Use conversationId as primary unique key since it should be unique per message
                let key = message.conversationId;
                if (!key) {
                    // Fallback for messages without conversationId
                    const contentStr = typeof message.content === 'string' 
                        ? message.content.substring(0, 100)
                        : JSON.stringify(message.content || '').substring(0, 100);
                    key = `${message.role || 'unknown'}_${contentStr}_${Date.now()}`;
                }
                
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueMessages.push(message);
                }
            }
            
            // Sort messages by timestamp (extracted from conversationId) to maintain chronological order
            uniqueMessages.sort((a, b) => {
                const getTimestamp = (msg: any) => {
                    if (msg.conversationId && typeof msg.conversationId === 'string' && msg.conversationId.startsWith('conv-')) {
                        const parts = msg.conversationId.split('-');
                        if (parts.length >= 2) {
                            return parseInt(parts[1]) || 0;
                        }
                    }
                    return 0;
                };
                return getTimestamp(a) - getTimestamp(b);
            });
            
            // Smart filtering: if we have more than MIN_MESSAGES_FOR_CLEANUP, remove internal memos but keep actual conversations
            if (uniqueMessages.length > MIN_MESSAGES_FOR_CLEANUP) {
                const realConversations = [];
                const internalMemos = [];
                
                for (const message of uniqueMessages) {
                    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content || '');
                    const isInternalMemo = content.includes('**<Internal Memo>**') || content.includes('Project Updates:');
                    
                    if (isInternalMemo) {
                        internalMemos.push(message);
                    } else {
                        realConversations.push(message);
                    }
                }
                
                this.logger().info('Conversation cleanup analysis', {
                    totalUniqueMessages: uniqueMessages.length,
                    realConversations: realConversations.length,
                    internalMemos: internalMemos.length,
                    willRemoveInternalMemos: uniqueMessages.length > MIN_MESSAGES_FOR_CLEANUP
                });
                
                // Keep all real conversations, remove internal memos if we exceed the threshold
                migratedConversationMessages = realConversations;
            } else {
                // If we have few messages, keep everything
                migratedConversationMessages = uniqueMessages;
            }
            
            if (migratedConversationMessages.length !== originalCount) {
                this.logger().info('Fixed conversation message exponential bloat', {
                    originalCount,
                    deduplicatedCount: uniqueMessages.length,
                    finalCount: migratedConversationMessages.length,
                    duplicatesRemoved: originalCount - uniqueMessages.length,
                    internalMemosRemoved: uniqueMessages.length - migratedConversationMessages.length
                });
                needsMigration = true;
            }
        }

        let migratedInferenceContext = this.state.inferenceContext;
        if (migratedInferenceContext && 'userApiKeys' in migratedInferenceContext) {
            migratedInferenceContext = {
                ...migratedInferenceContext
            };
            
            // Completely remove the userApiKeys property for security
            delete (migratedInferenceContext as any).userApiKeys;
            needsMigration = true;
        }

        // Check for deprecated properties
        const stateHasDeprecatedProps = 'latestScreenshot' in (this.state as any);
        if (stateHasDeprecatedProps) {
            needsMigration = true;
        }

        // Check if projectUpdatesAccumulator is not in state
        const stateHasProjectUpdatesAccumulator = 'projectUpdatesAccumulator' in (this.state as any);
        if (!stateHasProjectUpdatesAccumulator) {
            needsMigration = true;
        }
        
        // Apply migration if needed
        if (needsMigration) {
            this.logger().info('Migrating state: schema format, conversation cleanup, and security fixes', {
                generatedFilesCount: Object.keys(migratedFilesMap).length,
                templateFilesCount: migratedTemplateDetails?.files?.length || 0,
                finalConversationCount: migratedConversationMessages?.length || 0,
                removedUserApiKeys: this.state.inferenceContext && 'userApiKeys' in this.state.inferenceContext
            });
            
            const newState = {
                ...this.state,
                generatedFilesMap: migratedFilesMap,
                templateDetails: migratedTemplateDetails,
                conversationMessages: migratedConversationMessages,
                inferenceContext: migratedInferenceContext,
                projectUpdatesAccumulator: []
            };
            
            // Remove deprecated properties
            if (stateHasDeprecatedProps) {
                delete (newState as any).latestScreenshot;
            }
            
            this.setState(newState);
        }

        
    }

    getFileGenerated(filePath: string) {
        return this.fileManager!.getGeneratedFile(filePath) || null;
    }

    getWebSockets(): WebSocket[] {
        return this.ctx.getWebSockets();
    }

    async fetchRuntimeErrors(clear: boolean = true) {
        await this.waitForPreview();

        if (!this.state.sandboxInstanceId || !this.fileManager) {
            this.logger().warn("No sandbox instance ID available to fetch errors from.");
            return [];
        }

        try {
            const resp = await this.getSandboxServiceClient().getInstanceErrors(this.state.sandboxInstanceId);
            if (!resp || !resp.success) {
                this.logger().error(`Failed to fetch runtime errors: ${resp?.error || 'Unknown error'}, Will initiate redeploy`);
                // Initiate redeploy
                this.deployToSandbox();
                return [];
            }
            
            const errors = resp?.errors || [];

            if (errors.filter(error => error.message.includes('Unterminated string in JSON at position')).length > 0) {
                this.logger().error('Unterminated string in JSON at position, will initiate redeploy');
                // Initiate redeploy
                this.deployToSandbox();
                return [];
            }
            
            if (errors.length > 0) {
                this.logger().info(`Found ${errors.length} runtime errors: ${errors.map(e => e.message).join(', ')}`);
                this.broadcast(WebSocketMessageResponses.RUNTIME_ERROR_FOUND, {
                    errors,
                    message: "Runtime errors found",
                    count: errors.length
                });
                
                if (clear) {
                    await this.getSandboxServiceClient().clearInstanceErrors(this.state.sandboxInstanceId);
                }
            }

            return errors;
        } catch (error) {
            this.logger().error("Exception fetching runtime errors:", error);
            return [];
        }
    }

    /**
     * Perform static code analysis on the generated files
     * This helps catch potential issues early in the development process
     */
    async runStaticAnalysisCode(): Promise<StaticAnalysisResponse> {
        const { sandboxInstanceId } = this.state;

        if (!sandboxInstanceId) {
            this.logger().warn("No sandbox instance ID available to lint code.");
            return { success: false, lint: { issues: [], }, typecheck: { issues: [], } };
        }

        this.logger().info(`Linting code in sandbox instance ${sandboxInstanceId}`);

        const files = this.fileManager.getGeneratedFilePaths();

        try {
            const analysisResponse = await this.getSandboxServiceClient()?.runStaticAnalysisCode(sandboxInstanceId, files);

            if (!analysisResponse || analysisResponse.error) {
                const errorMsg = `Code linting failed: ${analysisResponse?.error || 'Unknown error'}, full response: ${JSON.stringify(analysisResponse)}`;
                this.logger().error(errorMsg);
                this.broadcast(WebSocketMessageResponses.ERROR, { error: errorMsg, analysisResponse });
                throw new Error(errorMsg);
            }

            const { lint, typecheck } = analysisResponse;
            const { issues: lintIssues, summary: lintSummary } = lint;

            this.logger().info(`Linting found ${lintIssues.length} issues: ` +
                `${lintSummary?.errorCount || 0} errors, ` +
                `${lintSummary?.warningCount || 0} warnings, ` +
                `${lintSummary?.infoCount || 0} info`);

            const { issues: typeCheckIssues, summary: typeCheckSummary } = typecheck;

            this.logger().info(`Typecheck found ${typeCheckIssues.length} issues: ` +
                `${typeCheckSummary?.errorCount || 0} errors, ` +
                `${typeCheckSummary?.warningCount || 0} warnings, ` +
                `${typeCheckSummary?.infoCount || 0} info`);

            this.broadcast(WebSocketMessageResponses.STATIC_ANALYSIS_RESULTS, {
                lint: { issues: lintIssues, summary: lintSummary },
                typecheck: { issues: typeCheckIssues, summary: typeCheckSummary }
            });

            return analysisResponse;
        } catch (error) {
            this.logger().error("Error linting code:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.broadcast(WebSocketMessageResponses.ERROR, { error: `Failed to lint code: ${errorMessage}` });
            // throw new Error(`Failed to lint code: ${errorMessage}`);
            return { success: false, lint: { issues: [], }, typecheck: { issues: [], } };
        }
    }

    private async applyFastSmartCodeFixes() : Promise<void> {
        try {
            const startTime = Date.now();
            this.logger().info("Applying fast smart code fixes");
            // Get static analysis and do deterministic fixes
            const staticAnalysis = await this.runStaticAnalysisCode();
            if (staticAnalysis.typecheck.issues.length + staticAnalysis.lint.issues.length == 0) {
                this.logger().info("No issues found, skipping fast smart code fixes");
                return;
            }
            const issues = staticAnalysis.typecheck.issues.concat(staticAnalysis.lint.issues);
            const allFiles = this.fileManager.getAllFiles();

            const fastCodeFixer = await this.operations.fastCodeFixer.execute({
                query: this.state.query,
                issues,
                allFiles,
            }, this.getOperationOptions());

            if (fastCodeFixer.length > 0) {
                this.fileManager.saveGeneratedFiles(fastCodeFixer);
                await this.deployToSandbox(fastCodeFixer);
                this.logger().info("Fast smart code fixes applied successfully");
            }
            this.logger().info(`Fast smart code fixes applied in ${Date.now() - startTime}ms`);            
        } catch (error) {
            this.logger().error("Error applying fast smart code fixes:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.broadcast(WebSocketMessageResponses.ERROR, { error: `Failed to apply fast smart code fixes: ${errorMessage}` });
            return;
        }
    }

    /**
     * Apply deterministic code fixes for common TypeScript errors
     */
    private async applyDeterministicCodeFixes() : Promise<StaticAnalysisResponse | undefined> {
        try {
            // Get static analysis and do deterministic fixes
            const staticAnalysis = await this.runStaticAnalysisCode();
            if (staticAnalysis.typecheck.issues.length == 0) {
                this.logger().info("No typecheck issues found, skipping deterministic fixes");
                return staticAnalysis;  // So that static analysis is not repeated again
            }
            const typeCheckIssues = staticAnalysis.typecheck.issues;
            this.broadcast(WebSocketMessageResponses.DETERMINISTIC_CODE_FIX_STARTED, {
                message: `Attempting to fix ${typeCheckIssues.length} TypeScript issues using deterministic code fixer`,
                issues: typeCheckIssues
            });

            this.logger().info(`Attempting to fix ${typeCheckIssues.length} TypeScript issues using deterministic code fixer`);
            const allFiles = this.fileManager.getAllFiles();

            // Create file fetcher callback
            const fileFetcher: FileFetcher = async (filePath: string) => {
                // Fetch a single file from the instance
                try {
                    const result = await this.getSandboxServiceClient().getFiles(this.state.sandboxInstanceId!, [filePath]);
                    if (result.success && result.files.length > 0) {
                        this.logger().info(`Successfully fetched file: ${filePath}`);
                        return {
                            filePath: filePath,
                            fileContents: result.files[0].fileContents,
                            filePurpose: `Fetched file: ${filePath}`
                        };
                    } else {
                        this.logger().debug(`File not found: ${filePath}`);
                    }
                } catch (error) {
                    this.logger().debug(`Failed to fetch file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
                return null;
            };
            
            const fixResult = await fixProjectIssues(
                allFiles.map(file => ({
                    filePath: file.filePath,
                    fileContents: file.fileContents,
                    filePurpose: ''
                })),
                typeCheckIssues,
                fileFetcher
            );

            this.broadcast(WebSocketMessageResponses.DETERMINISTIC_CODE_FIX_COMPLETED, {
                message: `Fixed ${typeCheckIssues.length} TypeScript issues using deterministic code fixer`,
                issues: typeCheckIssues,
                fixResult
            });

            if (fixResult) {
                // If there are unfixable issues but of type TS2307, extract external module names and install them
                if (fixResult.unfixableIssues.length > 0) {
                    const modulesNotFound = fixResult.unfixableIssues.filter(issue => issue.issueCode === 'TS2307');
                    // Reason is of the form: External package "xyz" should be handled by package manager                    
                    const moduleNames = modulesNotFound.flatMap(issue => {
                        const match = issue.reason.match(/External package ["'](.+?)["']/);
                        const name = match?.[1];
                        return (typeof name === 'string' && name.trim().length > 0 && !name.startsWith('@shared')) ? [name] : [];
                    });
                    if (moduleNames.length > 0) {
                        const installCommands = moduleNames.map(moduleName => `bun install ${moduleName}`);
                        await this.executeCommands(installCommands, false);

                        this.logger().info(`Deterministic code fixer installed missing modules: ${moduleNames.join(', ')}`);
                    } else {
                        this.logger().info(`Deterministic code fixer detected no external modules to install from unfixable TS2307 issues`);
                    }
                }
                if (fixResult.modifiedFiles.length > 0) {
                        this.logger().info("Applying deterministic fixes to files, Fixes: ", JSON.stringify(fixResult, null, 2));
                        const fixedFiles = fixResult.modifiedFiles.map(file => ({
                            filePath: file.filePath,
                            filePurpose: allFiles.find(f => f.filePath === file.filePath)?.filePurpose || '',
                            fileContents: file.fileContents
                    }));
                    this.fileManager.saveGeneratedFiles(fixedFiles);
                    
                    await this.deployToSandbox(fixedFiles, false, "fix: applied deterministic fixes");
                    this.logger().info("Deployed deterministic fixes to sandbox");
                }
            }
            this.logger().info(`Applied deterministic code fixes: ${JSON.stringify(fixResult, null, 2)}`);
        } catch (error) {
            this.logger().error('Error applying deterministic code fixes:', error);
            this.broadcast(WebSocketMessageResponses.ERROR, {
                error: `Deterministic code fixer failed: ${error instanceof Error ? error.message : String(error)}`
            });
        }
        // return undefined;
    }

    async fetchAllIssues(resetIssues: boolean = false): Promise<AllIssues> {
        const [runtimeErrors, staticAnalysis] = await Promise.all([
            this.fetchRuntimeErrors(resetIssues),
            this.runStaticAnalysisCode()
        ]);
        
        const clientErrors = this.state.clientReportedErrors;
        this.logger().info("Fetched all issues:", JSON.stringify({ runtimeErrors, staticAnalysis, clientErrors }));
        
        return { runtimeErrors, staticAnalysis, clientErrors };
    }

    async waitForPreview(): Promise<void> {
        this.logger().info("Waiting for preview");
        if (!this.state.sandboxInstanceId) {
            const preview = await this.deployToSandbox();
            if (!preview) {
                this.logger().error("Failed create preview");
                return;
            }
        }
        this.logger().info("Waiting for preview completed");
    }

    async deployToSandbox(files: FileOutputType[] = [], redeploy: boolean = false, commitMessage?: string): Promise<PreviewType | null> {
        // If there's already a deployment in progress, wait for it to complete
        if (this.currentDeploymentPromise) {
            this.logger().info('Deployment already in progress, waiting for completion');
            try {
                const result = await this.currentDeploymentPromise;
                if (result) {
                    this.logger().info('Previous deployment completed successfully, returning its result', { result });
                    return result;
                }
            } catch (error) {
                // Only proceed with new deployment if previous one failed
                this.logger().warn('Previous deployment failed, proceeding with new deployment:', error);
            }
            return null;
        }
    
        this.logger().info("Deploying to sandbox", { files, redeploy, commitMessage, sessionId: this.state.sessionId });
    
        // Start the actual deployment and track it
        this.currentDeploymentPromise = this.executeDeployment(files, redeploy, commitMessage);
        
        // Create timeout that resets session if deployment hangs
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                this.logger().warn('Deployment timed out after 60 seconds, resetting sessionId to provision new sandbox instance');
                this.resetSessionId();
                reject(new Error('Deployment timed out after 60 seconds'));
            }, 60000);
        });
        
        try {
            const result = await Promise.race([
                this.currentDeploymentPromise,
                timeoutPromise
            ]);
            return result;
        } finally {
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
            this.currentDeploymentPromise = null;
        }
    }

    private async createNewPreview(): Promise<PreviewType | null> {
        // Create new deployment
        const templateName = this.state.templateDetails?.name || 'scratch';
        // Generate a unique suffix
        let prefix = (this.state.blueprint?.projectName || templateName).toLowerCase().replace(/[^a-z0-9]/g, '-');
        const uniqueSuffix = generateId();
        // Only use the first 20 characters of the prefix
        prefix = prefix.slice(0, 20);
        const projectName = `${prefix}-${uniqueSuffix}`.toLowerCase();
        
        // Generate webhook URL for this agent instance
        const webhookUrl = this.generateWebhookUrl();
        
        const createResponse = await this.getSandboxServiceClient().createInstance(templateName, `v1-${projectName}`, webhookUrl);
        if (!createResponse || !createResponse.success || !createResponse.runId) {
            throw new Error(`Failed to create sandbox instance: ${createResponse?.error || 'Unknown error'}`);
        }

        this.logger().info(`Received createInstance response: ${JSON.stringify(createResponse, null, 2)}`)

        if (createResponse.runId && createResponse.previewURL) {
            this.previewUrlCache = createResponse.previewURL;
            return createResponse;
        }

        throw new Error(`Failed to create sandbox instance: ${createResponse?.error || 'Unknown error'}`);
    }

    private async ensurePreviewExists(redeploy: boolean = false) {
        let { sandboxInstanceId } = this.state;
        let previewURL: string | undefined;
        let tunnelURL: string | undefined;
        let redeployed = false;

        // Check if the instance is running
        if (sandboxInstanceId) {
            const status = await this.getSandboxServiceClient().getInstanceStatus(sandboxInstanceId);
            if (!status.success || !status.isHealthy) {
                this.logger().error(`DEPLOYMENT CHECK FAILED: Failed to get status for instance ${sandboxInstanceId}, redeploying...`);
                sandboxInstanceId = undefined;
            } else {
                this.logger().info(`DEPLOYMENT CHECK PASSED: Instance ${sandboxInstanceId} is running, previewURL: ${status.previewURL}, tunnelURL: ${status.tunnelURL}`);
                previewURL = status.previewURL;
                tunnelURL = status.tunnelURL;
            }
        }

        if (!sandboxInstanceId || redeploy) {
            const results = await this.createNewPreview();
            if (!results || !results.runId || !results.previewURL) {
                throw new Error('Failed to create new deployment');
            }
            sandboxInstanceId = results.runId;
            previewURL = results.previewURL;
            tunnelURL = results.tunnelURL;
            redeployed = true;
            this.setState({
                ...this.state,
                sandboxInstanceId,
            });

            if (this.state.commandsHistory && this.state.commandsHistory.length > 0) {
                // Run all commands in background
                let cmds = this.state.commandsHistory;
                if (cmds.length > 10) {
                    cmds =  Array.from(new Set(this.state.commandsHistory));
                    // I am aware this will messup the ordering of commands and may cause issues but those would be in very rare cases
                    // because usually LLMs will only generate install commands or rm commands. 
                    // This is to handle the bug still present in a lot of apps because of an exponential growth of commands
                }
                this.getSandboxServiceClient().executeCommands(sandboxInstanceId, cmds);
                this.broadcast(WebSocketMessageResponses.COMMAND_EXECUTING, {
                    message: "Executing setup commands",
                    commands: cmds,
                });
            }

            // Clear any existing health check interval before creating a new one
            if (this.healthCheckInterval !== null) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }

            // Launch a set interval to check the health of the deployment. If it fails, redeploy
            this.healthCheckInterval = setInterval(async () => {
                // Don't trigger redeploy if there's already a deployment in progress
                if (this.currentDeploymentPromise !== null) {
                    return;
                }
                
                const status = await this.getSandboxServiceClient().getInstanceStatus(sandboxInstanceId!);
                if (!status || !status.success || !status.isHealthy) {
                    this.logger().error(`DEPLOYMENT CHECK FAILED: Failed to get status for instance ${sandboxInstanceId}, redeploying...`);
                    // Clear the interval to prevent it from running again
                    if (this.healthCheckInterval !== null) {
                        clearInterval(this.healthCheckInterval);
                        this.healthCheckInterval = null;
                    }
                    await this.deployToSandbox([], true);
                }
            }, 5000);

            // Launch a static analysis on the codebase in the background to build cache
            // this.runStaticAnalysisCode();
        }

        return {
            sandboxInstanceId,
            previewURL,
            tunnelURL,
            redeployed,
        };
    }

    private async executeDeployment(files: FileOutputType[] = [], redeploy: boolean = false, commitMessage?: string, retries: number = MAX_DEPLOYMENT_RETRIES): Promise<PreviewType | null> {
        try {
            this.broadcast(WebSocketMessageResponses.DEPLOYMENT_STARTED, {
                message: "Deploying code to sandbox service",
                files: files.map(file => ({
                    filePath: file.filePath,
                }))
            });
    
            this.logger().info("Deploying code to sandbox service");
    
            const {
                sandboxInstanceId,
                previewURL,
                tunnelURL,
                redeployed,
            } = await this.ensurePreviewExists(redeploy);
            
            // Deploy files
            const filesToWrite = files.length > 0 && !redeployed    // If redeployed, we should write all files again
                ? files.map(file => ({
                    filePath: file.filePath,
                    fileContents: file.fileContents
                }))
                : Object.values(this.state.generatedFilesMap).map(file => ({
                    filePath: file.filePath,
                    fileContents: file.fileContents
                }));

            if (filesToWrite.length > 0) {
                const writeResponse = await this.getSandboxServiceClient().writeFiles(sandboxInstanceId, filesToWrite, commitMessage);
                if (!writeResponse || !writeResponse.success) {
                    this.logger().error(`File writing failed. Error: ${writeResponse?.error}`);
                    throw new Error(`File writing failed. Error: ${writeResponse?.error}`);
                }
            }

            const preview = {
                runId: sandboxInstanceId,
                previewURL: previewURL,
                tunnelURL: tunnelURL,
            };

            this.broadcast(WebSocketMessageResponses.DEPLOYMENT_COMPLETED, {
                message: "Deployment completed",
                ...preview,
            });

            return preview;
        } catch (error) {
            this.logger().error("Error deploying to sandbox service:", error, { sessionId: this.state.sessionId, sandboxInstanceId: this.state.sandboxInstanceId });
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('Network connection lost') || errorMsg.includes('Container service disconnected') || errorMsg.includes('Internal error in Durable Object storage')) {
                // For this particular error, reset the sandbox sessionId
                this.resetSessionId();
            }

            this.setState({
                ...this.state,
                sandboxInstanceId: undefined,
            });
            if (retries > 0) {
                this.broadcast(WebSocketMessageResponses.DEPLOYMENT_FAILED, {
                    error: `Error deploying to sandbox service: ${errorMsg}, Will retry...`,
                });
                // Wait for exponential backoff
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, MAX_DEPLOYMENT_RETRIES - retries) * 1000));
                return this.executeDeployment(files, redeploy, commitMessage, retries - 1);
            }
            this.broadcast(WebSocketMessageResponses.DEPLOYMENT_FAILED, {
                error: `Error deploying to sandbox service: ${errorMsg}. Please report an issue if this persists`,
            });
            return null;
        }
    }

    /**
     * Deploy the generated code to Cloudflare Workers
     */
    async deployToCloudflare(): Promise<{ deploymentUrl?: string; workersUrl?: string } | null> {
        try {
            this.logger().info('Starting Cloudflare deployment');
            await this.waitForPreview();
            this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_STARTED, {
                message: 'Starting deployment to Cloudflare Workers...',
                instanceId: this.state.sandboxInstanceId,
            });

            // Check if we have generated files
            if (!this.state.generatedFilesMap || Object.keys(this.state.generatedFilesMap).length === 0) {
                this.logger().error('No generated files available for deployment');
                this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
                    message: 'Deployment failed: No generated code available',
                    error: 'No files have been generated yet'
                });
                return null;
            }

            // Check if we have a sandbox instance ID
            if (!this.state.sandboxInstanceId) {
                this.logger().info('[DeployToCloudflare] No sandbox instance ID available, will initiate deployment');
                // Need to redeploy
                await this.deployToSandbox();

                if (!this.state.sandboxInstanceId) {
                    this.logger().error('[DeployToCloudflare] Failed to deploy to sandbox service');
                    this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
                        message: 'Deployment failed: Failed to deploy to sandbox service',
                        error: 'Sandbox service unavailable'
                    });
                    return null;
                }
            }

            this.logger().info('[DeployToCloudflare] Prerequisites met, initiating deployment', {
                sandboxInstanceId: this.state.sandboxInstanceId,
                fileCount: Object.keys(this.state.generatedFilesMap).length
            });

            const deploymentResult = await this.getSandboxServiceClient().deployToCloudflareWorkers(this.state.sandboxInstanceId);
            this.logger().info('[DeployToCloudflare] Deployment result:', deploymentResult);
            if (!deploymentResult.success) {
                this.logger().error('Deployment failed', {
                    message: deploymentResult.message,
                    error: deploymentResult.error
                });
                if (deploymentResult.error?.includes('Failed to read instance metadata') || deploymentResult.error?.includes(`/bin/sh: 1: cd: can't cd to i-`)) {
                    this.logger().error('Deployment sandbox died');
                    // Re-deploy
                    this.deployToSandbox();
                    this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
                        message: PREVIEW_EXPIRED_ERROR,
                        error: PREVIEW_EXPIRED_ERROR
                    });
                } else {
                    this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
                        message: `Deployment failed: ${deploymentResult.message}`,
                        error: deploymentResult.error || 'Unknown deployment error'
                    });
                }
                return null;
            }

            const deploymentUrl = deploymentResult.deployedUrl;

            this.logger().info('[DeployToCloudflare] Cloudflare deployment completed successfully', {
                deploymentUrl,
                deploymentId: deploymentResult.deploymentId,
                sandboxInstanceId: this.state.sandboxInstanceId,
                message: deploymentResult.message
            });

            const appService = new AppService(this.env);
            // Update cloudflare URL in database
            await appService.updateDeploymentId(
                this.getAgentId(),
                deploymentResult.deploymentId || ''
            );

            // Broadcast success message
            this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_COMPLETED, {
                message: deploymentResult.message || 'Successfully deployed to Cloudflare Workers!',
                deploymentUrl,
            });

            return { deploymentUrl };

        } catch (error) {
            // return ErrorHandler.handleOperationError(
            //     this.logger(),
            //     this,
            //     'Cloudflare deployment',
            //     error,
            //     WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR
            // );
            this.logger().error('Cloudflare deployment failed', error);
            this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
                message: `Deployment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return null;
        }
    }

    async waitForGeneration(): Promise<void> {
        if (this.state.generationPromise) {
            try {
                await this.state.generationPromise;
                this.logger().info("Code generation completed successfully");
            } catch (error) {
                this.logger().error("Error during code generation:", error);
            }
        } else {
            this.logger().error("No generation process found");
        }
    }

    async onMessage(connection: Connection, message: string): Promise<void> {
        handleWebSocketMessage(this, connection, message);
    }

    async onClose(connection: Connection): Promise<void> {
        handleWebSocketClose(connection);
    }

    private async onProjectUpdate(message: string): Promise<void> {
        this.setState({
            ...this.state,
            projectUpdatesAccumulator: [...this.state.projectUpdatesAccumulator, message]
        });
    }

    private async getAndResetProjectUpdates() {
        const projectUpdates = this.state.projectUpdatesAccumulator || [];
        this.setState({
            ...this.state,
            projectUpdatesAccumulator: []
        });
        return projectUpdates;
    }

    public broadcast<T extends WebSocketMessageType>(msg: T, data?: WebSocketMessageData<T>): void {
        if (this.operations.processUserMessage.isProjectUpdateType(msg)) {
            let message = msg as string;
            if (data && 'message' in data) {
                message = (data as { message: string }).message;
            }
            this.onProjectUpdate(message);
        }
        broadcastToConnections(this, msg, data || {} as WebSocketMessageData<T>);
    }

    /**
     * Handle HTTP requests to this agent instance
     * Includes webhook processing for internal requests
     */
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const pathname = url.pathname;

        // Handle internal webhook requests
        if (pathname.startsWith('/webhook/')) {
            return this.handleWebhook(request);
        }

        // Delegate to parent class for other requests
        return super.fetch(request);
    }

    /**
     * Generate webhook URL for this agent instance
     */
    private generateWebhookUrl(): string {
        // Use the agent's session ID as the agent identifier
        const agentId = this.getAgentId() || 'unknown';
        
        // Generate webhook URL with agent ID for routing
        return `${getProtocolForHost(this.state.hostname)}://${this.state.hostname}/api/webhook/sandbox/${agentId}/runtime_error`;
    }

    /**
     * Handle webhook events from sandbox service
     */
    async handleWebhook(request: Request): Promise<Response> {
        try {
            const url = new URL(request.url);
            const pathParts = url.pathname.split('/');
            const eventType = pathParts[pathParts.length - 1];

            this.logger().info('Received webhook from sandbox service', { 
                eventType, 
                agentId: this.getAgentId() 
            });

            const payload = await request.json() as WebhookPayload;
            const { event, context, source } = payload;

            if (source !== 'webhook') {
                return new Response('Invalid source', { status: 400 });
            }

            // Process the webhook event
            await this.processWebhookEvent(event, context);

            return new Response(JSON.stringify({ success: true }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            });

        } catch (error) {
            this.logger().error('Error handling webhook', error);
            return new Response('Internal server error', { status: 500 });
        }
    }

    /**
     * Process webhook events and trigger appropriate actions
     */
    private async processWebhookEvent(event: WebhookPayload['event'], context: WebhookPayload['context']): Promise<void> {
        try {
            switch (event.eventType) {
                case 'runtime_error':
                    await this.handleRuntimeErrorWebhook(event, context);
                    break;
                default:
                    this.logger().warn('Unhandled webhook event type', { eventType: event.eventType });
            }
        } catch (error) {
            this.logger().error('Error processing webhook event', error);
        }
    }

    /**
     * Handle runtime error webhook events
     */
    private async handleRuntimeErrorWebhook(event: WebhookPayload['event'], _context: WebhookPayload['context']): Promise<void> {
        if (!event.payload.error) {
            this.logger().error('Invalid runtime error event: No error provided');
            return;
        }
        this.logger().info('Processing runtime error webhook', {
            errorMessage: event.payload.error.message,
            runId: event.payload.runId,
            instanceId: event.instanceId
        });

        // Broadcast runtime error to connected clients
        this.broadcast(WebSocketMessageResponses.RUNTIME_ERROR_FOUND, {
            error: event.payload.error,
            runId: event.payload.runId,
            instanceInfo: event.payload.instanceInfo,
            instanceId: event.instanceId,
            timestamp: event.timestamp,
            source: 'webhook'
        });
    }

    /**
     * Execute commands with retry logic
     * Chunks commands and retries failed ones with AI assistance
     */
    private async executeCommands(commands: string[], shouldRetry: boolean = true, chunkSize: number = 5): Promise<void> {
        const state = this.state;
        if (!state.sandboxInstanceId) {
            this.logger().warn('No sandbox instance available for executing commands');
            return;
        }

        // Sanitize and prepare commands
        commands = commands.join('\n').split('\n').filter(cmd => cmd.trim() !== '').filter(cmd => looksLikeCommand(cmd) && !cmd.includes(' undefined'));
        if (commands.length === 0) {
            this.logger().warn("No commands to execute");
            return;
        }

        commands = commands.map(cmd => cmd.trim().replace(/^\s*-\s*/, '').replace(/^npm/, 'bun'));
        this.logger().info(`AI suggested ${commands.length} commands to run: ${commands.join(", ")}`);

        // Remove duplicate commands
        commands = Array.from(new Set(commands));

        // Execute in chunks
        const commandChunks = [];
        for (let i = 0; i < commands.length; i += chunkSize) {
            commandChunks.push(commands.slice(i, i + chunkSize));
        }

        const successfulCommands: string[] = [];

        for (const chunk of commandChunks) {
            // Retry failed commands up to 3 times
            let currentChunk = chunk;
            let retryCount = 0;
            const maxRetries = shouldRetry ? 3 : 1;
            
            while (currentChunk.length > 0 && retryCount < maxRetries) {
                try {
                    this.broadcast(WebSocketMessageResponses.COMMAND_EXECUTING, {
                        message: retryCount > 0 ? `Retrying commands (attempt ${retryCount + 1}/${maxRetries})` : "Executing commands",
                        commands: currentChunk
                    });
                    
                    const resp = await this.getSandboxServiceClient().executeCommands(
                        state.sandboxInstanceId,
                        currentChunk
                    );
                    if (!resp.results || !resp.success) {
                        this.logger().error('Failed to execute commands', { response: resp });
                        // Check if instance is still running
                        const status = await this.getSandboxServiceClient().getInstanceStatus(state.sandboxInstanceId);
                        if (!status.success || !status.isHealthy) {
                            this.logger().error(`Instance ${state.sandboxInstanceId} is no longer running`);
                            return;
                        }
                        break;
                    }

                    // Process results
                    const successful = resp.results.filter(r => r.success);
                    const failures = resp.results.filter(r => !r.success);

                    // Track successful commands
                    if (successful.length > 0) {
                        const successfulCmds = successful.map(r => r.command);
                        this.logger().info(`Successfully executed ${successful.length} commands: ${successfulCmds.join(", ")}`);
                        successfulCommands.push(...successfulCmds);
                    }

                    // If all succeeded, move to next chunk
                    if (failures.length === 0) {
                        this.logger().info(`All commands in chunk executed successfully`);
                        break;
                    }
                    
                    // Handle failures
                    const failedCommands = failures.map(r => r.command);
                    this.logger().warn(`${failures.length} commands failed: ${failedCommands.join(", ")}`);
                    
                    // Only retry if shouldRetry is true
                    if (!shouldRetry) {
                        break;
                    }
                    
                    retryCount++;
                    
                    // For install commands, try AI regeneration
                    const failedInstallCommands = failedCommands.filter(cmd => 
                        cmd.startsWith("bun") || cmd.startsWith("npm") || cmd.includes("install")
                    );
                    
                    if (failedInstallCommands.length > 0 && retryCount < maxRetries) {
                        // Use AI to suggest alternative commands
                        const newCommands = await this.getProjectSetupAssistant().generateSetupCommands(
                            `The following install commands failed: ${JSON.stringify(failures, null, 2)}. Please suggest alternative commands.`
                        );
                        
                        if (newCommands?.commands && newCommands.commands.length > 0) {
                            this.logger().info(`AI suggested ${newCommands.commands.length} alternative commands`);
                            this.broadcast(WebSocketMessageResponses.COMMAND_EXECUTING, {
                                message: "Executing regenerated commands",
                                commands: newCommands.commands
                            });
                            currentChunk = newCommands.commands.filter(looksLikeCommand);
                        } else {
                            this.logger().warn('AI could not generate alternative commands');
                            currentChunk = [];
                        }
                    } else {
                        // No retry needed for non-install commands
                        currentChunk = [];
                    }
                } catch (error) {
                    this.logger().error('Error executing commands:', error);
                    // Stop retrying on error
                    break;
                }
            }
        }

        // Record command execution history
        const failedCommands = commands.filter(cmd => !successfulCommands.includes(cmd));
        
        if (failedCommands.length > 0) {
            this.logger().warn(`Failed to execute commands: ${failedCommands.join(", ")}`);
            this.broadcast(WebSocketMessageResponses.ERROR, {
                error: `Failed to execute commands: ${failedCommands.join(", ")}`
            });
        } else {
            this.logger().info(`All commands executed successfully: ${successfulCommands.join(", ")}`);
        }

        // Add commands to history
        this.setState({
            ...this.state,
            commandsHistory: [
                ...(this.state.commandsHistory || []),
                ...successfulCommands
            ]
        });
    }

    async getLogs(_reset?: boolean): Promise<string> {
        const response = await this.getSandboxServiceClient().getLogs(this.state.sandboxInstanceId!);
        if (response.success) {
            return `STDOUT: ${response.logs.stdout}\nSTDERR: ${response.logs.stderr}`;
        } else {
            return `Failed to get logs, ${response.error}`;
        }
    }

    /**
     * Delete files from the file manager
     */
    async deleteFiles(filePaths: string[]) {
        const deleteCommands: string[] = [];
        for (const filePath of filePaths) {
            deleteCommands.push(`rm -rf ${filePath}`);
        }
        // Remove the files from file manager
        this.fileManager.deleteFiles(filePaths);
        try {
            await this.executeCommands(deleteCommands, false);
            this.logger().info(`Deleted ${filePaths.length} files: ${filePaths.join(", ")}`);
        } catch (error) {
            this.logger().error('Error deleting files:', error);
        }
    }

    /**
     * Export generated code to a GitHub repository
     * Creates repository and pushes all generated files
     */
    async pushToGitHub(options: GitHubPushRequest): Promise<GitHubExportResult> {
        try {
            this.logger().info('Starting GitHub export', {
                fileCount: Object.keys(this.state.generatedFilesMap).length
            });

            // Check if we have generated files
            if (!this.state.generatedFilesMap || Object.keys(this.state.generatedFilesMap).length === 0) {
                throw new Error('No generated files available for export');
            }

            await this.waitForPreview();

            // Broadcast export started
            this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_STARTED, {
                message: `Starting GitHub export to repository "${options.cloneUrl}"`,
                repositoryName: options.repositoryHtmlUrl,
                isPrivate: options.isPrivate
            });


            // Update progress for creating repository
            this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_PROGRESS, {
                message: 'Uploading to GitHub repository...',
                step: 'uploading_files',
                progress: 30
            });

            // Use consolidated export method that handles the complete flow
            const exportResult = await this.getSandboxServiceClient().pushToGitHub(this.state.sandboxInstanceId!, options);

            if (!exportResult?.success) {
                throw new Error(`Failed to export to GitHub repository: ${exportResult?.error}`);
            }

            this.logger().info('GitHub export completed successfully', { options, commitSha: exportResult.commitSha });

            // Commit the readme
            // First prepare the readme by replacing [cloudflarebutton] placeholder with actual thing
            const readmeFile = this.fileManager.getFile('README.md');
            if (readmeFile) {
                try {
                    readmeFile.fileContents = readmeFile.fileContents.replaceAll('[cloudflarebutton]', prepareCloudflareButton(options.repositoryHtmlUrl, 'markdown'));
                    this.fileManager.saveGeneratedFile(readmeFile);
                    await this.deployToSandbox([readmeFile], false, "feat: README updated with cloudflare deploy button");
                    // Export again
                    await this.getSandboxServiceClient().pushToGitHub(this.state.sandboxInstanceId!, options);
                    this.logger().info('Readme committed successfully');
                } catch (error) {
                    this.logger().error('Failed to commit readme', error);
                }
            } else {
                this.logger().info('Readme not found, skipping commit');
            }

            // Step 3: Finalize
            this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_PROGRESS, {
                message: 'Finalizing GitHub export...',
                step: 'finalizing',
                progress: 90
            });

            this.logger().info('Finalizing GitHub export...');
            const appService = new AppService(this.env);
            // Update database with GitHub repository URL and visibility
            await appService.updateGitHubRepository(
                this.getAgentId() || '',
                options.repositoryHtmlUrl || '',
                options.isPrivate ? 'private' : 'public'
            );

            // Broadcast success
            this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_COMPLETED, {
                message: `Successfully exported to GitHub repository: ${options.repositoryHtmlUrl}`,
                repositoryUrl: options.repositoryHtmlUrl
            });

            this.logger().info('GitHub export completed successfully', { repositoryUrl: options.repositoryHtmlUrl });
            return { success: true, repositoryUrl: options.repositoryHtmlUrl };

        } catch (error) {
            this.logger().error('GitHub export failed', error);
            this.broadcast(WebSocketMessageResponses.GITHUB_EXPORT_ERROR, {
                message: `GitHub export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return { success: false, repositoryUrl: options.repositoryHtmlUrl };
        }
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

            // Just fetch runtime errors
            const errors = await this.fetchRuntimeErrors(false);
            const projectUpdates = await this.getAndResetProjectUpdates();
            this.logger().info('Passing context to user conversation processor', { errors, projectUpdates });

            // Process the user message using conversational assistant
            const conversationalResponse = await this.operations.processUserMessage.execute(
                { 
                    userMessage, 
                    pastMessages: this.state.conversationMessages,
                    conversationResponseCallback: (
                        message: string,
                        conversationId: string,
                        isStreaming: boolean,
                        tool?: { name: string; status: 'start' | 'success' | 'error'; args?: Record<string, unknown> }
                    ) => {
                        this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                            message,
                            conversationId,
                            isStreaming,
                            tool,
                        });
                    },
                    errors,
                    projectUpdates,
                    images
                }, 
                this.getOperationOptions()
            );

            const { conversationResponse, messages } = conversationalResponse;
            this.setState({
                ...this.state,
                conversationMessages: messages
            });

             if (!this.isGenerating) {
                // If idle, start generation process
                this.logger().info('User input during IDLE state, starting generation');
                this.generateAllFiles().catch(error => {
                    this.logger().error('Error starting generation from user input:', error);
                });
            }

            this.logger().info('User input processed successfully', {
                responseLength: conversationResponse.userResponse.length,
            });

        } catch (error) {
            this.logger().error('Error handling user input:', error);
            if (error instanceof RateLimitExceededError) {
                this.logger().error('throwing Rate limit exceeded', error);
                this.broadcast(WebSocketMessageResponses.RATE_LIMIT_ERROR, {
                    error
                });
                return;
            }
            this.broadcast(WebSocketMessageResponses.ERROR, {
                error: `Error processing user input: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    // ===============================
    // Screenshot storage helpers
    // ===============================
    
    private base64ToUint8Array(base64: string): Uint8Array {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    private async uploadScreenshotToCloudflareImages(base64: string, filename: string): Promise<string> {
        const url = `https://api.cloudflare.com/client/v4/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/images/v1`;
        const bytes = this.base64ToUint8Array(base64);
        const blob = new Blob([bytes], { type: 'image/png' });
        const form = new FormData();
        form.append('file', blob, filename);

        // Type guard for Images binding
        type ImagesBinding = { fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> };
        const maybeImages = (this.env as unknown as { [key: string]: unknown })['IMAGES'];
        const imagesBinding: ImagesBinding | null = (
            typeof maybeImages === 'object' && maybeImages !== null &&
            'fetch' in (maybeImages as Record<string, unknown>) && 
            typeof (maybeImages as { fetch?: unknown }).fetch === 'function'
        ) ? (maybeImages as ImagesBinding) : null;

        let resp: Response;
        if (imagesBinding) {
            // Use Images service binding when available (no explicit token needed)
            resp = await imagesBinding.fetch(url, { method: 'POST', body: form });
        } else if (this.env.CLOUDFLARE_API_TOKEN) {
            // Fallback to direct API with token
            resp = await fetch(url, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.env.CLOUDFLARE_API_TOKEN}` },
                body: form,
            });
        } else {
            throw new Error('Cloudflare Images not available: missing IMAGES binding and CLOUDFLARE_API_TOKEN');
        }

        const json = await resp.json() as {
            success: boolean;
            result?: { id: string; variants?: string[] };
            errors?: Array<{ message?: string }>;
        };

        if (!resp.ok || !json.success || !json.result) {
            const errMsg = json.errors?.map(e => e.message).join('; ') || `status ${resp.status}`;
            throw new Error(`Cloudflare Images upload failed: ${errMsg}`);
        }

        const variants = json.result.variants || [];
        if (variants.length > 0) {
            // Prefer first variant URL
            return variants[0];
        }
        throw new Error('Cloudflare Images upload succeeded without variants');
    }

    private async uploadScreenshotToR2(base64: string, key: string): Promise<string> {
        const bytes = this.base64ToUint8Array(base64);
        await this.env.TEMPLATES_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'image/png' } });

        // Build a public URL served via Worker route
        const fileName = key.split('/').pop() as string;
        const protocol = getProtocolForHost(this.state.hostname);
        const base = `${protocol}://${this.env.CUSTOM_DOMAIN}`;
        const agentId = this.state.inferenceContext.agentId;
        const url = `${base}/api/screenshots/${encodeURIComponent(agentId)}/${encodeURIComponent(fileName)}`;
        return url;
    }

    /**
     * Capture screenshot of the given URL using Cloudflare Browser Rendering REST API
     */
    public async captureScreenshot(
        url: string, 
        viewport: { width: number; height: number } = { width: 1280, height: 720 }
    ): Promise<string> {
        if (!this.env.DB || !this.getAgentId()) {
            const error = 'Cannot capture screenshot: DB or agentId not available';
            this.logger().warn(error);
            this.broadcast(WebSocketMessageResponses.SCREENSHOT_CAPTURE_ERROR, {
                error,
                configurationError: true
            });
            throw new Error(error);
        }

        if (!url) {
            const error = 'URL is required for screenshot capture';
            this.broadcast(WebSocketMessageResponses.SCREENSHOT_CAPTURE_ERROR, {
                error,
                url,
                viewport
            });
            throw new Error(error);
        }

        this.logger().info('Capturing screenshot via REST API', { url, viewport });
        
        // Notify start of screenshot capture
        this.broadcast(WebSocketMessageResponses.SCREENSHOT_CAPTURE_STARTED, {
            message: `Capturing screenshot of ${url}`,
            url,
            viewport
        });
        
        try {
            // Use Cloudflare Browser Rendering REST API
            const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${this.env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/snapshot`;
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.env.CLOUDFLARE_API_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    url: url,
                    viewport: viewport,
                    gotoOptions: {
                        waitUntil: 'networkidle0',
                        timeout: 10000
                    },
                    screenshotOptions: {
                        fullPage: false,
                        type: 'png'
                    }
                }),
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                const error = `Browser Rendering API failed: ${response.status} - ${errorText}`;
                this.broadcast(WebSocketMessageResponses.SCREENSHOT_CAPTURE_ERROR, {
                    error,
                    url,
                    viewport,
                    statusCode: response.status,
                    statusText: response.statusText
                });
                throw new Error(error);
            }
            
            const result = await response.json() as {
                success: boolean;
                result: {
                    screenshot: string; // base64 encoded
                    content: string;    // HTML content
                };
            };
            
            if (!result.success || !result.result.screenshot) {
                const error = 'Browser Rendering API succeeded but no screenshot returned';
                this.broadcast(WebSocketMessageResponses.SCREENSHOT_CAPTURE_ERROR, {
                    error,
                    url,
                    viewport,
                    apiResponse: result
                });
                throw new Error(error);
            }
            
            // Get base64 screenshot data
            const base64Screenshot = result.result.screenshot;

            // Prefer Cloudflare Images → then R2 → fallback to data URL
            const fileStamp = Date.now();
            const fileBase = `${this.getAgentId()}-${fileStamp}`;
            let publicUrl: string | null = null;

            // 1) Try Cloudflare Images (REST API)
            try {
                publicUrl = await this.uploadScreenshotToCloudflareImages(base64Screenshot, `${fileBase}.png`);
            } catch (imgErr) {
                this.logger().warn('Cloudflare Images upload failed, will try R2 fallback', { error: imgErr instanceof Error ? imgErr.message : String(imgErr) });
            }

            // 2) Try R2 (serve via Worker route) if Images failed
            if (!publicUrl) {
                try {
                    const r2Key = `screenshots/${this.getAgentId()}/${fileBase}.png`;
                    publicUrl = await this.uploadScreenshotToR2(base64Screenshot, r2Key);
                } catch (r2Err) {
                    this.logger().warn('R2 upload fallback failed, will store as data URL', { error: r2Err instanceof Error ? r2Err.message : String(r2Err) });
                }
            }

            // 3) Fallback: store data URL directly in DB
            if (!publicUrl) {
                publicUrl = `data:image/png;base64,${base64Screenshot}`;
            }

            // Persist in database
            try {
                const appService = new AppService(this.env);
                await appService.updateAppScreenshot(this.getAgentId(), publicUrl);
            } catch (dbError) {
                const error = `Database update failed: ${dbError instanceof Error ? dbError.message : 'Unknown database error'}`;
                this.broadcast(WebSocketMessageResponses.SCREENSHOT_CAPTURE_ERROR, {
                    error,
                    url,
                    viewport,
                    screenshotCaptured: true,
                    databaseError: true
                });
                throw new Error(error);
            }

            this.logger().info('Screenshot captured and stored successfully', { 
                url, 
                storage: publicUrl.startsWith('data:') ? 'database' : (publicUrl.includes('/api/screenshots/') ? 'r2' : 'images'),
                length: base64Screenshot.length
            });

            // Notify successful screenshot capture
            this.broadcast(WebSocketMessageResponses.SCREENSHOT_CAPTURE_SUCCESS, {
                message: `Successfully captured screenshot of ${url}`,
                url,
                viewport,
                screenshotSize: base64Screenshot.length,
                timestamp: new Date().toISOString()
            });

            return publicUrl;
            
        } catch (error) {
            this.logger().error('Failed to capture screenshot via REST API:', error);
            
            // Only broadcast if error wasn't already broadcast above
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            if (!errorMessage.includes('Browser Rendering API') && !errorMessage.includes('Database update failed')) {
                this.broadcast(WebSocketMessageResponses.SCREENSHOT_CAPTURE_ERROR, {
                    error: errorMessage,
                    url,
                    viewport
                });
            }
            
            throw new Error(`Screenshot capture failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
}
