import { 
    PhaseConceptGenerationSchemaType, 
    PhaseConceptType,
    FileConceptType,
    FileOutputType,
    PhaseImplementationSchemaType,
} from '../../schemas';
import { StaticAnalysisResponse } from '../../../services/sandbox/sandboxTypes';
import { CurrentDevState, MAX_PHASES, PhasicState } from '../state';
import { AllIssues, AgentInitArgs, PhaseExecutionResult, UserContext } from '../types';
import { WebSocketMessageResponses } from '../../constants';
import { UserConversationProcessor } from '../../operations/UserConversationProcessor';
import { DeploymentManager } from '../../services/implementations/DeploymentManager';
// import { WebSocketBroadcaster } from '../services/implementations/WebSocketBroadcaster';
import { GenerationContext, PhasicGenerationContext } from '../../domain/values/GenerationContext';
import { IssueReport } from '../../domain/values/IssueReport';
import { PhaseImplementationOperation } from '../../operations/PhaseImplementation';
import { FileRegenerationOperation } from '../../operations/FileRegeneration';
import { PhaseGenerationOperation } from '../../operations/PhaseGeneration';
// Database schema imports removed - using zero-storage OAuth flow
import { AgentActionKey } from '../../inferutils/config.types';
import { AGENT_CONFIG } from '../../inferutils/config';
import { ModelConfigService } from '../../../database/services/ModelConfigService';
import { FastCodeFixerOperation } from '../../operations/PostPhaseCodeFixer';
import { customizePackageJson, customizeTemplateFiles, generateProjectName } from '../../utils/templateCustomizer';
import { generateBlueprint } from '../../planning/blueprint';
import { RateLimitExceededError } from 'shared/types/errors';
import {  type ProcessedImageAttachment } from '../../../types/image-attachment';
import { OperationOptions } from '../../operations/common';
import { ConversationMessage } from '../../inferutils/common';
import { generateNanoId } from 'worker/utils/idGenerator';
import { IdGenerator } from '../../utils/idGenerator';
import { BaseAgentBehavior, BaseAgentOperations } from '../baseAgent';
import { ICodingAgent } from '../../services/interfaces/ICodingAgent';
import { SimpleCodeGenerationOperation } from '../../operations/SimpleCodeGeneration';

interface PhasicOperations extends BaseAgentOperations {
    generateNextPhase: PhaseGenerationOperation;
    implementPhase: PhaseImplementationOperation;
}

/**
 * PhasicAgentBehavior - Deterministically orchestrated agent
 * 
 * Manages the lifecycle of code generation including:
 * - Blueprint, phase generation, phase implementation, review cycles orchestrations
 * - File streaming with WebSocket updates
 * - Code validation and error correction
 * - Deployment to sandbox service
 */
export class PhasicAgentBehavior extends BaseAgentBehavior<PhasicState> implements ICodingAgent {
    protected operations: PhasicOperations = {
        regenerateFile: new FileRegenerationOperation(),
        fastCodeFixer: new FastCodeFixerOperation(),
        processUserMessage: new UserConversationProcessor(),
        simpleGenerateFiles: new SimpleCodeGenerationOperation(),
        generateNextPhase: new PhaseGenerationOperation(),
        implementPhase: new PhaseImplementationOperation(),
    };

    /**
     * Initialize the code generator with project blueprint and template
     * Sets up services and begins deployment process
     */
    async initialize(
        initArgs: AgentInitArgs<PhasicState>,
        ..._args: unknown[]
    ): Promise<PhasicState> {
        await super.initialize(initArgs);

        const { query, language, frameworks, hostname, inferenceContext, templateInfo } = initArgs;
        const sandboxSessionId = DeploymentManager.generateNewSessionId();

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

        const packageJson = templateInfo.templateDetails?.allFiles['package.json'];

        this.templateDetailsCache = templateInfo.templateDetails;

        const projectName = generateProjectName(
            blueprint?.projectName || templateInfo.templateDetails.name,
            generateNanoId(),
            PhasicAgentBehavior.PROJECT_NAME_PREFIX_MAX_LENGTH
        );
        
        this.logger().info('Generated project name', { projectName });
        
        this.setState({
            ...this.state,
            projectName,
            query,
            blueprint,
            templateName: templateInfo.templateDetails.name,
            sandboxInstanceId: undefined,
            generatedPhases: [],
            commandsHistory: [],
            lastPackageJson: packageJson,
            sessionId: sandboxSessionId,
            hostname,
            inferenceContext,
        });

        await this.gitInit();
        
        // Customize template files (package.json, wrangler.jsonc, .bootstrap.js, .gitignore)
        const customizedFiles = customizeTemplateFiles(
            templateInfo.templateDetails.allFiles,
            {
                projectName,
                commandsHistory: [] // Empty initially, will be updated later
            }
        );
        
        this.logger().info('Customized template files', { 
            files: Object.keys(customizedFiles) 
        });
        
        // Save customized files to git
        const filesToSave = Object.entries(customizedFiles).map(([filePath, content]) => ({
            filePath,
            fileContents: content,
            filePurpose: 'Project configuration file'
        }));
        
        await this.fileManager.saveGeneratedFiles(
            filesToSave,
            'Initialize project configuration files'
        );
        
        this.logger().info('Committed customized template files to git');

        this.initializeAsync().catch((error: unknown) => {
            this.broadcastError("Initialization failed", error);
        });
        this.logger().info(`Agent ${this.getAgentId()} session: ${this.state.sessionId} initialized successfully`);
        await this.saveToDatabase();
        return this.state;
    }

    async onStart(props?: Record<string, unknown> | undefined): Promise<void> {
        await super.onStart(props);

        // migrate overwritten package.jsons
        const oldPackageJson = this.fileManager.getFile('package.json')?.fileContents || this.state.lastPackageJson;
        if (oldPackageJson) {
            const packageJson = customizePackageJson(oldPackageJson, this.state.projectName);
            this.fileManager.saveGeneratedFiles([
                {
                    filePath: 'package.json',
                    fileContents: packageJson,
                    filePurpose: 'Project configuration file'
                }
            ], 'chore: fix overwritten package.json');
        }
    }

    setState(state: PhasicState): void {
        try {
            super.setState(state);
        } catch (error) {
            this.broadcastError("Error setting state", error);
            this.logger().error("State details:", {
                originalState: JSON.stringify(this.state, null, 2),
                newState: JSON.stringify(state, null, 2)
            });
        }
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

    getOperationOptions(): OperationOptions<PhasicGenerationContext> {
        return {
            env: this.env,
            agentId: this.getAgentId(),
            context: GenerationContext.from(this.state, this.getTemplateDetails(), this.logger()) as PhasicGenerationContext,
            logger: this.logger(),
            inferenceContext: this.getInferenceContext(),
            agent: this
        };
    }

    private createNewIncompletePhase(phaseConcept: PhaseConceptType) {
        this.setState({
            ...this.state,
            generatedPhases: [...this.state.generatedPhases, {
                ...phaseConcept,
                completed: false
            }]
        })

        this.logger().info("Created new incomplete phase:", JSON.stringify(this.state.generatedPhases, null, 2));
    }

    private markPhaseComplete(phaseName: string) {
        // First find the phase
        const phases = this.state.generatedPhases;
        if (!phases.some(p => p.name === phaseName)) {
            this.logger().warn(`Phase ${phaseName} not found in generatedPhases array, skipping save`);
            return;
        }
        
        // Update the phase
        this.setState({
            ...this.state,
            generatedPhases: phases.map(p => p.name === phaseName ? { ...p, completed: true } : p)
        });

        this.logger().info("Completed phases:", JSON.stringify(phases, null, 2));
    }

    async queueUserRequest(request: string, images?: ProcessedImageAttachment[]): Promise<void> {
        this.rechargePhasesCounter(3);
        await super.queueUserRequest(request, images);
    }

    async build(): Promise<void> {
        await this.launchStateMachine();
    }

    private async launchStateMachine() {
        this.logger().info("Launching state machine");

        let currentDevState = CurrentDevState.PHASE_IMPLEMENTING;
        const generatedPhases = this.state.generatedPhases;
        const incompletedPhases = generatedPhases.filter(phase => !phase.completed);
        let phaseConcept : PhaseConceptType | undefined;
        if (incompletedPhases.length > 0) {
            phaseConcept = incompletedPhases[incompletedPhases.length - 1];
            this.logger().info('Resuming code generation from incompleted phase', {
                phase: phaseConcept
            });
        } else if (generatedPhases.length > 0) {
            currentDevState = CurrentDevState.PHASE_GENERATING;
            this.logger().info('Resuming code generation after generating all phases', {
                phase: generatedPhases[generatedPhases.length - 1]
            });
        } else {
            phaseConcept = this.state.blueprint.initialPhase;
            this.logger().info('Starting code generation from initial phase', {
                phase: phaseConcept
            });
            this.createNewIncompletePhase(phaseConcept);
        }

        let staticAnalysisCache: StaticAnalysisResponse | undefined;
        let userContext: UserContext | undefined;

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
            if (error instanceof RateLimitExceededError) {
                throw error;
            }
            this.broadcastError("Error generating phase", error);
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
            if (this.state.sandboxInstanceId) {
                if (staticAnalysis) {
                    // If have cached static analysis, fetch everything else fresh
                    currentIssues = {
                        runtimeErrors: await this.fetchRuntimeErrors(true),
                        staticAnalysis: staticAnalysis,
                    };
                } else {
                    currentIssues = await this.fetchAllIssues(true)
                }
            } else {
                currentIssues = {
                    runtimeErrors: [],
                    staticAnalysis: { success: true, lint: { issues: [] }, typecheck: { issues: [] } },
                }
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
     * Execute review cycle state - review and cleanup
     */
    async executeReviewCycle(): Promise<CurrentDevState> {
        this.logger().info("Executing REVIEWING state - review and cleanup");
        if (this.state.reviewingInitiated) {
            this.logger().info("Reviewing already initiated, skipping");
            return CurrentDevState.IDLE;
        }
        this.setState({
            ...this.state,
            reviewingInitiated: true
        });

        // If issues/errors found, prompt user if they want to review and cleanup
        const issues = await this.fetchAllIssues(false);
        if (issues.runtimeErrors.length > 0 || issues.staticAnalysis.typecheck.issues.length > 0) {
            this.logger().info("Reviewing stage - issues found, prompting user to review and cleanup");
            const message : ConversationMessage = {
                role: "assistant",
                content: `<system_context>If the user responds with yes, launch the 'deep_debug' tool with the prompt to fix all the issues in the app</system_context>\nThere might be some bugs in the app. Do you want me to try to fix them?`,
                conversationId: IdGenerator.generateConversationId(),
            }
            // Store the message in the conversation history so user's response can trigger the deep debug tool
            this.addConversationMessage(message);
            
            this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                message: message.content,
                conversationId: message.conversationId,
                isStreaming: false,
            });
        }

        return CurrentDevState.IDLE;
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
        
        this.createNewIncompletePhase(phaseConcept);

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
        
        this.createNewIncompletePhase(result);
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
    async implementPhase(phase: PhaseConceptType, currentIssues: AllIssues, userContext?: UserContext, streamChunks: boolean = true, postPhaseFixing: boolean = true): Promise<PhaseImplementationSchemaType> {
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
        await this.fileManager.saveGeneratedFiles(finalFiles, `feat: ${phase.name}\n\n${phase.description}`);

        this.logger().info("Files generated for phase:", phase.name, finalFiles.map(f => f.filePath));

        // Execute commands if provided
        if (result.commands && result.commands.length > 0) {
            this.logger().info("Phase implementation suggested install commands:", result.commands);
            await this.executeCommands(result.commands, false);
        }
    
        // Deploy generated files
        if (finalFiles.length > 0) {
            await this.deployToSandbox(finalFiles, false, phase.name, true);
            if (postPhaseFixing) {
                await this.applyDeterministicCodeFixes();
                if (this.state.inferenceContext.enableFastSmartCodeFix) {
                    await this.applyFastSmartCodeFixes();
                }
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
    
        this.markPhaseComplete(phase.name);
        
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

    getTotalFiles(): number {
        return this.fileManager.getGeneratedFilePaths().length + ((this.state.currentPhase || this.state.blueprint.initialPhase)?.files?.length || 0);
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
            const allFiles = this.fileManager.getAllRelevantFiles();

            const fastCodeFixer = await this.operations.fastCodeFixer.execute({
                query: this.state.query,
                issues,
                allFiles,
            }, this.getOperationOptions());

            if (fastCodeFixer.length > 0) {
                await this.fileManager.saveGeneratedFiles(fastCodeFixer, "fix: Fast smart code fixes");
                await this.deployToSandbox(fastCodeFixer);
                this.logger().info("Fast smart code fixes applied successfully");
            }
            this.logger().info(`Fast smart code fixes applied in ${Date.now() - startTime}ms`);            
        } catch (error) {
            this.broadcastError("Failed to apply fast smart code fixes", error);
            return;
        }
    }

    async generateFiles(
        phaseName: string,
        phaseDescription: string,
        requirements: string[],
        files: FileConceptType[]
    ): Promise<{ files: Array<{ path: string; purpose: string; diff: string }> }> {
        this.logger().info('Generating files for deep debugger', {
            phaseName,
            requirementsCount: requirements.length,
            filesCount: files.length
        });

        // Create phase structure with explicit files
        const phase: PhaseConceptType = {
            name: phaseName,
            description: phaseDescription,
            files: files,
            lastPhase: true
        };

        // Call existing implementPhase with postPhaseFixing=false
        // This skips deterministic fixes and fast smart fixes
        const result = await this.implementPhase(
            phase,
            {
                runtimeErrors: [],
                staticAnalysis: { 
                    success: true, 
                    lint: { issues: [] }, 
                    typecheck: { issues: [] } 
                },
            },
            { suggestions: requirements },
            true, // streamChunks
            false // postPhaseFixing = false (skip auto-fixes)
        );

        // Return files with diffs from FileState
        return {
            files: result.files.map(f => ({
                path: f.filePath,
                purpose: f.filePurpose || '',
                diff: (f as any).lastDiff || '' // FileState has lastDiff
            }))
        };
    }
}
