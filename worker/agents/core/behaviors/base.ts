import { Connection } from 'agents';
import { 
    FileConceptType,
    FileOutputType,
    Blueprint,
    AgenticBlueprint,
    PhasicBlueprint,
} from '../../schemas';
import { ExecuteCommandsResponse, PreviewType, RuntimeError, StaticAnalysisResponse, TemplateDetails, TemplateFile } from '../../../services/sandbox/sandboxTypes';
import { BaseProjectState, AgenticState, FileState } from '../state';
import { AllIssues, AgentSummary, AgentInitArgs, BehaviorType, DeploymentTarget, ProjectType } from '../types';
import { WebSocketMessageResponses } from '../../constants';
import { ProjectSetupAssistant } from '../../assistants/projectsetup';
import { UserConversationProcessor, RenderToolCall } from '../../operations/UserConversationProcessor';
import { FileRegenerationOperation } from '../../operations/FileRegeneration';
// Database schema imports removed - using zero-storage OAuth flow
import { BaseSandboxService } from '../../../services/sandbox/BaseSandboxService';
import { getTemplateImportantFiles } from '../../../services/sandbox/utils';
import { createScratchTemplateDetails } from '../../utils/templates';
import { WebSocketMessageData, WebSocketMessageType } from '../../../api/websocketTypes';
import { AgentActionKey, InferenceContext, InferenceRuntimeOverrides, ModelConfig } from '../../inferutils/config.types';
import { ModelConfigService } from '../../../database/services/ModelConfigService';
import { fixProjectIssues } from '../../../services/code-fixer';
import { FastCodeFixerOperation } from '../../operations/PostPhaseCodeFixer';
import { looksLikeCommand, validateAndCleanBootstrapCommands } from '../../utils/common';
import { customizeTemplateFiles, generateBootstrapScript } from '../../utils/templateCustomizer';
import { AppService } from '../../../database';
import { RateLimitExceededError } from 'shared/types/errors';
import { ImageAttachment, type ProcessedImageAttachment } from '../../../types/image-attachment';
import { OperationOptions } from '../../operations/common';
import { ImageType, uploadImage, detectBlankScreenshot } from 'worker/utils/images';
import { DeepDebugResult } from '../types';
import { updatePackageJson } from '../../utils/packageSyncer';
import { ICodingAgent } from '../../services/interfaces/ICodingAgent';
import { SimpleCodeGenerationOperation } from '../../operations/SimpleCodeGeneration';
import { AgentComponent } from '../AgentComponent';
import type { AgentInfrastructure } from '../AgentCore';
import { GitVersionControl } from '../../git';
import { DeepDebuggerOperation } from '../../operations/DeepDebugger';
import type { DeepDebuggerInputs } from '../../operations/DeepDebugger';
import { generatePortToken } from 'worker/utils/cryptoUtils';
import { getPreviewDomain, getProtocolForHost } from 'worker/utils/urls';
import { isDev } from 'worker/utils/envs';

// Screenshot capture configuration
const SCREENSHOT_CONFIG = {
    PAGE_LOAD_TIMEOUT: 15000,    // 15s for page load
    WAIT_FOR_TIMEOUT: 2000,      // 2s additional wait after network idle
    MAX_RETRIES: 2,              // 2 retries = 3 total attempts
    RETRY_DELAY_BASE: 2000,      // 2s base delay between retries
    MIN_FILE_SIZE: 10000,        // 10KB minimum for valid screenshot
    MIN_ENTROPY: 2.0,            // Minimum entropy threshold
};

export interface BaseCodingOperations {
    regenerateFile: FileRegenerationOperation;
    fastCodeFixer: FastCodeFixerOperation;
    processUserMessage: UserConversationProcessor;
    simpleGenerateFiles: SimpleCodeGenerationOperation;
}

/**
 * Base class for all coding behaviors
 */
export abstract class BaseCodingBehavior<TState extends BaseProjectState> 
    extends AgentComponent<TState> implements ICodingAgent {
    protected static readonly MAX_COMMANDS_HISTORY = 10;

    protected projectSetupAssistant: ProjectSetupAssistant | undefined;

    protected templateDetailsCache: TemplateDetails | null = null;
    
    // In-memory storage for user-uploaded images (not persisted in DO state)
    protected pendingUserImages: ProcessedImageAttachment[] = []
    protected generationPromise: Promise<void> | null = null;
    protected currentAbortController?: AbortController;
    protected deepDebugPromise: Promise<{ transcript: string } | { error: string }> | null = null;
    protected deepDebugConversationId: string | null = null;

    protected staticAnalysisCache: StaticAnalysisResponse | null = null;

    protected userModelConfigs?: Record<AgentActionKey, ModelConfig>;
    protected runtimeOverrides?: InferenceRuntimeOverrides;
    
    protected operations: BaseCodingOperations = {
        regenerateFile: new FileRegenerationOperation(),
        fastCodeFixer: new FastCodeFixerOperation(),
        processUserMessage: new UserConversationProcessor(),
        simpleGenerateFiles: new SimpleCodeGenerationOperation(),
    };

    getBehavior(): BehaviorType {
        return this.state.behaviorType;
    }

    protected isAgenticState(state: BaseProjectState): state is AgenticState {
        return state.behaviorType === 'agentic';
    }

    constructor(infrastructure: AgentInfrastructure<TState>, protected projectType: ProjectType) {
        super(infrastructure);

        this.setState({
            ...this.state,
            behaviorType: this.getBehavior(),
            projectType: this.projectType,
        });
    }

    public async initialize(
        initArgs: AgentInitArgs,
        ..._args: unknown[]
    ): Promise<TState> {
        this.logger.info("Initializing agent");
        const { templateInfo } = initArgs;
        if (templateInfo) {
            this.templateDetailsCache = templateInfo.templateDetails;
            
            await this.ensureTemplateDetails();
        }

        // Reset the logg
        return this.state;
    }

    onStart(_props?: Record<string, unknown> | undefined): Promise<void> {
        return Promise.resolve();
    }

    protected async initializeAsync(): Promise<void> {
        try {
            const [, setupCommands] = await Promise.all([
                this.deployToSandbox(),
                this.getProjectSetupAssistant().generateSetupCommands(),
                this.generateReadme()
            ]);
            this.logger.info("Deployment to sandbox service and initial commands predictions completed successfully");
                await this.executeCommands(setupCommands.commands);
                this.logger.info("Initial commands executed successfully");
        } catch (error) {
            this.logger.error("Error during async initialization:", error);
            // throw error;
        }
    }
    onStateUpdate(_state: TState, _source: "server" | Connection) {}

    async ensureTemplateDetails() {
        // Skip fetching details for "scratch" baseline
        if (!this.templateDetailsCache) {
            if (this.state.templateName === 'scratch') {
                this.logger.info('Skipping template details fetch for scratch baseline');
                return;
            }
            this.logger.info(`Loading template details for: ${this.state.templateName}`);
            const results = await BaseSandboxService.getTemplateDetails(this.state.templateName);
            if (!results.success || !results.templateDetails) {
                throw new Error(`Failed to get template details for: ${this.state.templateName}`);
            }
            
            const templateDetails = results.templateDetails;
            
            const customizedAllFiles = { ...templateDetails.allFiles };
            
            this.logger.info('Customizing template files for older app');
            const customizedFiles = customizeTemplateFiles(
                templateDetails.allFiles,
                {
                    projectName: this.state.projectName,
                    commandsHistory: this.getBootstrapCommands()
                }
            );
            Object.assign(customizedAllFiles, customizedFiles);
            
            this.templateDetailsCache = {
                ...templateDetails,
                allFiles: customizedAllFiles
            };
            this.logger.info('Template details loaded and customized');

            // If renderMode == 'browser', we can deploy right away
            if (templateDetails.renderMode === 'browser') {
                await this.deployToSandbox();
            }
        }
        return this.templateDetailsCache;
    }

    public getTemplateDetails(): TemplateDetails {
        if (!this.templateDetailsCache) {
            // Synthesize a minimal scratch template when starting from scratch
            if (this.state.templateName === 'scratch') {
                this.templateDetailsCache = createScratchTemplateDetails();
                return this.templateDetailsCache;
            }
            this.ensureTemplateDetails();
            throw new Error('Template details not loaded. Call ensureTemplateDetails() first.');
        }
        return this.templateDetailsCache;
    }

    protected isPreviewable(): boolean {
        // If there are 'package.json', and 'wrangler.jsonc' files, then it is previewable
        return this.fileManager.fileExists('package.json') && (this.fileManager.fileExists('wrangler.jsonc') || this.fileManager.fileExists('wrangler.toml'));
    }

    /**
     * Update bootstrap script when commands history changes
     * Called after significant command executions
     */
    private async updateBootstrapScript(commandsHistory: string[]): Promise<void> {
        if (!commandsHistory || commandsHistory.length === 0) {
            return;
        }
        
        // Use only validated commands
        const bootstrapScript = generateBootstrapScript(
            this.state.projectName,
            commandsHistory
        );
        
        await this.fileManager.saveGeneratedFile(
            {
                filePath: '.bootstrap.js',
                fileContents: bootstrapScript,
                filePurpose: 'Updated bootstrap script for first-time clone setup'
            },
            'chore: Update bootstrap script with latest commands',
            true
        );
        
        this.logger.info('Updated bootstrap script with commands', {
            commandCount: commandsHistory.length,
            commands: commandsHistory
        });
    }

    getProjectSetupAssistant(): ProjectSetupAssistant {
        if (this.projectSetupAssistant === undefined) {
            this.projectSetupAssistant = new ProjectSetupAssistant({
                env: this.env,
                agentId: this.getAgentId(),
                query: this.state.query,
                blueprint: this.state.blueprint,
                template: this.getTemplateDetails(),
                inferenceContext: this.getInferenceContext()
            });
        }
        return this.projectSetupAssistant;
    }

    getSessionId() {
        return this.deploymentManager.getSessionId();
    }

    getSandboxServiceClient(): BaseSandboxService {
        return this.deploymentManager.getClient();
    }

    isCodeGenerating(): boolean {
        return this.generationPromise !== null;
    }

    getUserModelConfigs(): Record<AgentActionKey, ModelConfig> | undefined {
        return this.userModelConfigs;
    }

    setUserModelConfigs(configs: Record<AgentActionKey, ModelConfig> | undefined): void {
        this.userModelConfigs = configs;
    }

    getRuntimeOverrides(): InferenceRuntimeOverrides | undefined {
        return this.runtimeOverrides;
    }

    setRuntimeOverrides(overrides: InferenceRuntimeOverrides | undefined): void {
        this.runtimeOverrides = overrides;
    }

    abstract getOperationOptions(): OperationOptions;

    /**
     * Gets or creates an abort controller for the current operation
     * Reuses existing controller for nested operations (e.g., tool calling)
     */
    protected getOrCreateAbortController(): AbortController {
        // Don't reuse aborted controllers
        if (this.currentAbortController && !this.currentAbortController.signal.aborted) {
            return this.currentAbortController;
        }
        
        // Create new controller in memory for new operation
        this.currentAbortController = new AbortController();
        
        return this.currentAbortController;
    }
    
    /**
     * Cancels the current inference operation if any
     */
    public cancelCurrentInference(): boolean {
        if (this.currentAbortController) {
            this.logger.info('Cancelling current inference operation');
            this.currentAbortController.abort();
            this.currentAbortController = undefined;
            return true;
        }
        return false;
    }
    
    /**
     * Clears abort controller after successful completion
     */
    protected clearAbortController(): void {
        this.currentAbortController = undefined;
    }
    
    /**
     * Gets inference context with abort signal
     * Reuses existing abort controller for nested operations
     */
    protected getInferenceContext(): InferenceContext {
        const controller = this.getOrCreateAbortController();
        
        return {
            metadata: this.state.metadata,
            enableFastSmartCodeFix: false,  // TODO: Do we want to enable it via some config?
            enableRealtimeCodeFix: false,   // TODO: Do we want to enable it via some config?
            abortSignal: controller.signal,
            userModelConfigs: this.getUserModelConfigs(),
            runtimeOverrides: this.getRuntimeOverrides(),
        };
    }

    async generateReadme() {
        this.logger.info('Generating README.md');
        this.broadcast(WebSocketMessageResponses.FILE_GENERATING, {
            message: 'Generating README.md',
            filePath: 'README.md',
            filePurpose: 'Project documentation and setup instructions'
        });

        const readme = await this.operations.simpleGenerateFiles.generateReadme(this.getOperationOptions());

        await this.fileManager.saveGeneratedFile(readme, "feat: README.md");

        this.broadcast(WebSocketMessageResponses.FILE_GENERATED, {
            message: 'README.md generated successfully',
            file: readme
        });
        this.logger.info('README.md generated successfully');
    }

    async setBlueprint(blueprint: Blueprint): Promise<void> {
        this.setState({
            ...this.state,
            blueprint: blueprint as AgenticBlueprint | PhasicBlueprint,
        });
        this.broadcast(WebSocketMessageResponses.BLUEPRINT_UPDATED, {
            message: 'Blueprint updated',
            updatedKeys: Object.keys(blueprint || {})
        });
    }

    getProjectType() {
        return this.state.projectType;
    }

    async queueUserRequest(request: string, images?: ProcessedImageAttachment[]): Promise<void> {
        this.setState({
            ...this.state,
            pendingUserInputs: [...this.state.pendingUserInputs, request]
        });
        if (images && images.length > 0) {
            this.logger.info('Storing user images in-memory for phase generation', {
                imageCount: images.length,
            });
            this.pendingUserImages = [...this.pendingUserImages, ...images];
        }
    }

    protected fetchPendingUserRequests(): string[] {
        const inputs = this.state.pendingUserInputs;
        if (inputs.length > 0) {
            this.setState({
                ...this.state,
                pendingUserInputs: []
            });
        }
        return inputs;
    }

    clearConversation(): void {
        this.infrastructure.clearConversation();
    }

    getGit(): GitVersionControl {
        return this.git;
    }


    /**
     * State machine controller for code generation with user interaction support
     * Executes phases sequentially with review cycles and proper state transitions
     */
    async generateAllFiles(): Promise<void> {
        if (this.state.mvpGenerated && this.state.pendingUserInputs.length === 0) {
            this.logger.info("Code generation already completed and no user inputs pending");
            return;
        }
        if (this.isCodeGenerating()) {
            this.logger.info("Code generation already in progress");
            return;
        }
        this.generationPromise = this.buildWrapper();
        await this.generationPromise;
    }

    setMVPGenerated(): boolean {
        if (!this.state.mvpGenerated) {
            this.setState({ ...this.state, mvpGenerated: true });
            this.logger.info('MVP generated');
            return true;
        }
        return false;
    }

    isMVPGenerated(): boolean {
        return this.state.mvpGenerated;
    }

    private async buildWrapper() {
        this.broadcast(WebSocketMessageResponses.GENERATION_STARTED, {
            message: 'Starting code generation',
            totalFiles: this.getTotalFiles()
        });
        this.logger.info('Starting code generation', {
            totalFiles: this.getTotalFiles()
        });
        await this.ensureTemplateDetails();
        try {
            await this.build();
        } catch (error) {
            if (error instanceof RateLimitExceededError) {
                this.logger.error("Error in state machine:", error);
                this.broadcast(WebSocketMessageResponses.RATE_LIMIT_ERROR, { error });
            } else {
                this.broadcastError("Error during generation", error);
            }
        } finally {
            // Clear abort controller after generation completes
            this.clearAbortController();
            
            const appService = new AppService(this.env);
            await appService.updateApp(
                this.getAgentId(),
                {
                    status: 'completed',
                }
            );
            this.generationPromise = null;
            this.broadcast(WebSocketMessageResponses.GENERATION_COMPLETE, {
                message: "Code generation and review process completed.",
                instanceId: this.state.sandboxInstanceId,
            });
        }
    }
    
    /**
     * Abstract method to be implemented by subclasses
     * Contains the main logic for code generation and review process
     */
    abstract build(): Promise<void>

    async executeDeepDebug(
        issue: string,
        toolRenderer: RenderToolCall,
        streamCb: (chunk: string) => void,
        focusPaths?: string[],
    ): Promise<DeepDebugResult> {
        const debugPromise = (async () => {
            try {
                const previousTranscript = this.state.lastDeepDebugTranscript ?? undefined;
                const operationOptions = this.getOperationOptions();
                const filesIndex = operationOptions.context.allFiles
                    .filter((f) =>
                        !focusPaths?.length ||
                        focusPaths.some((p) => f.filePath.includes(p)),
                    );

                const runtimeErrors = await this.fetchRuntimeErrors(false);

                const inputs: DeepDebuggerInputs = {
                    issue,
                    previousTranscript,
                    filesIndex,
                    runtimeErrors,
                    streamCb,
                    toolRenderer,
                };

                const operation = new DeepDebuggerOperation();

                const result = await operation.execute(inputs, operationOptions);

                const transcript = result.transcript;

                // Save transcript for next session
                this.setState({
                    ...this.state,
                    lastDeepDebugTranscript: transcript,
                });

                return { success: true as const, transcript };
            } catch (e) {
                this.logger.error('Deep debugger failed', e);
                return { success: false as const, error: `Deep debugger failed: ${String(e)}` };
            } finally {
                this.deepDebugPromise = null;
                this.deepDebugConversationId = null;
            }
        })();

        // Store promise before awaiting
        this.deepDebugPromise = debugPromise;

        return await debugPromise;
    }


    getModelConfigsInfo() {
        const modelService = new ModelConfigService(this.env);
        return modelService.getModelConfigsInfo(this.state.metadata.userId);
    }

    getTotalFiles(): number {
        return this.fileManager.getGeneratedFilePaths().length
    }

    getSummary(): Promise<AgentSummary> {
        const summaryData = {
            query: this.state.query,
            generatedCode: this.fileManager.getGeneratedFiles(),
        };
        return Promise.resolve(summaryData);
    }

    async getFullState(): Promise<TState> {
        return this.state;
    }
    
    migrateStateIfNeeded(): void {
        // no-op, only older phasic agents need this, for now.
    }

    getFileGenerated(filePath: string) {
        return this.fileManager!.getGeneratedFile(filePath) || null;
    }

    async fetchRuntimeErrors(clear: boolean = true, shouldWait: boolean = true): Promise<RuntimeError[]> {
        if (shouldWait) {
            await this.deploymentManager.waitForPreview();
        }

        try {
            const errors = await this.deploymentManager.fetchRuntimeErrors(clear);
            
            if (errors.length > 0) {
                this.broadcast(WebSocketMessageResponses.RUNTIME_ERROR_FOUND, {
                    errors,
                    message: "Runtime errors found",
                    count: errors.length
                });
            }

            return errors;
        } catch (error) {
            this.logger.error("Exception fetching runtime errors:", error);
            // If fetch fails, initiate redeploy
            this.deployToSandbox();
            const message = "<runtime errors not available at the moment as preview is not deployed>";
            return [{ message, timestamp: new Date().toISOString(), level: 0, rawOutput: message }];
        }
    }

    /**
     * Perform static code analysis on the generated files
     * This helps catch potential issues early in the development process
     */
    async runStaticAnalysisCode(files?: string[]): Promise<StaticAnalysisResponse> {
        try {
            // Check if we have cached static analysis
            if (this.staticAnalysisCache) {
                return this.staticAnalysisCache;
            }
            
            const analysisResponse = await this.deploymentManager.runStaticAnalysis(files);
            this.staticAnalysisCache = analysisResponse;

            const { lint, typecheck } = analysisResponse;
            this.broadcast(WebSocketMessageResponses.STATIC_ANALYSIS_RESULTS, {
                lint: { issues: lint.issues, summary: lint.summary },
                typecheck: { issues: typecheck.issues, summary: typecheck.summary }
            });

            return analysisResponse;
        } catch (error) {
            this.broadcastError("Failed to lint code", error);
            return { success: false, lint: { issues: [], }, typecheck: { issues: [], } };
        }
    }

    /**
     * Apply deterministic code fixes for common TypeScript errors
     */
    protected async applyDeterministicCodeFixes() : Promise<StaticAnalysisResponse | undefined> {
        try {
            // Get static analysis and do deterministic fixes
            const staticAnalysis = await this.runStaticAnalysisCode();
            if (staticAnalysis.typecheck.issues.length == 0) {
                this.logger.info("No typecheck issues found, skipping deterministic fixes");
                return staticAnalysis;  // So that static analysis is not repeated again
            }
            const typeCheckIssues = staticAnalysis.typecheck.issues;
            this.broadcast(WebSocketMessageResponses.DETERMINISTIC_CODE_FIX_STARTED, {
                message: `Attempting to fix ${typeCheckIssues.length} TypeScript issues using deterministic code fixer`,
                issues: typeCheckIssues
            });

            this.logger.info(`Attempting to fix ${typeCheckIssues.length} TypeScript issues using deterministic code fixer`);
            const allFiles = this.fileManager.getAllFiles();

            const fixResult = fixProjectIssues(
                allFiles.map(file => ({
                    filePath: file.filePath,
                    fileContents: file.fileContents,
                    filePurpose: ''
                })),
                typeCheckIssues
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
                    }).filter((name) => !name.includes('cloudflare:'));
                    if (moduleNames.length > 0) {
                        const installCommands = moduleNames.map(moduleName => `bun install ${moduleName}`);
                        await this.executeCommands(installCommands, false);

                        this.logger.info(`Deterministic code fixer installed missing modules: ${moduleNames.join(', ')}`);
                    } else {
                        this.logger.info(`Deterministic code fixer detected no external modules to install from unfixable TS2307 issues`);
                    }
                }
                if (fixResult.modifiedFiles.length > 0) {
                        this.logger.info("Applying deterministic fixes to files, Fixes: ", JSON.stringify(fixResult, null, 2));
                        const fixedFiles = fixResult.modifiedFiles.map(file => ({
                            filePath: file.filePath,
                            filePurpose: allFiles.find(f => f.filePath === file.filePath)?.filePurpose || '',
                            fileContents: file.fileContents
                    }));
                    await this.fileManager.saveGeneratedFiles(fixedFiles, "fix: applied deterministic fixes");
                    
                    await this.deployToSandbox(fixedFiles, false, "fix: applied deterministic fixes");
                    this.logger.info("Deployed deterministic fixes to sandbox");
                }
            }
            this.logger.info(`Applied deterministic code fixes: ${JSON.stringify(fixResult, null, 2)}`);
        } catch (error) {
            this.broadcastError('Deterministic code fixer failed', error);
        }
        // return undefined;
    }

    async fetchAllIssues(resetIssues: boolean = false): Promise<AllIssues> {
        if (!this.state.sandboxInstanceId) {
            return { runtimeErrors: [], staticAnalysis: { success: false, lint: { issues: [], }, typecheck: { issues: [], } } };
        }
        const [runtimeErrors, staticAnalysis] = await Promise.all([
            this.fetchRuntimeErrors(resetIssues),
            this.runStaticAnalysisCode()
        ]);
        this.logger.info("Fetched all issues:", JSON.stringify({ runtimeErrors, staticAnalysis }));
        
        return { runtimeErrors, staticAnalysis };
    }

    async updateProjectName(newName: string): Promise<boolean> {
        try {
            const valid = /^[a-z0-9-_]{3,50}$/.test(newName);
            if (!valid) return false;
            const updatedBlueprint = { ...this.state.blueprint, projectName: newName };
            this.setState({
                ...this.state,
                blueprint: updatedBlueprint
            });
            let ok = true;
            if (this.state.sandboxInstanceId) {
                try {
                    ok = await this.getSandboxServiceClient().updateProjectName(this.state.sandboxInstanceId, newName);
                } catch (_) {
                    ok = false;
                }
            }
            try {
                const appService = new AppService(this.env);
                const dbOk = await appService.updateApp(this.getAgentId(), { title: newName });
                ok = ok && dbOk;
            } catch (error) {
                this.logger.error('Error updating project name in database:', error);
                ok = false;
            }
            this.broadcast(WebSocketMessageResponses.PROJECT_NAME_UPDATED, {
                message: 'Project name updated',
                projectName: newName
            });
            return ok;
        } catch (error) {
            this.logger.error('Error updating project name:', error);
            return false;
        }
    }

    /**
     * Update user-facing blueprint fields
     * Only allows updating safe, cosmetic fields - not internal generation state
     */
    async updateBlueprint(patch: Partial<Blueprint>): Promise<Blueprint> {
        // Fields that are safe to update after generation starts
        // Excludes: initialPhase (breaks phasic generation)
        const safeUpdatableFields = new Set([
            'title',
            'description',
            'detailedDescription',
            'colorPalette',
            'views',
            'userFlow',
            'dataFlow',
            'architecture',
            'pitfalls',
            'frameworks',
            'implementationRoadmap'
        ]);

        // Filter to only safe fields
        const filtered: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(patch)) {
            if (safeUpdatableFields.has(key) && value !== undefined) {
                filtered[key] = value;
            }
        }

        // Agentic: allow initializing plan if not set yet (first-time plan initialization only)
        if (this.isAgenticState(this.state)) {
            const currentPlan = this.state.blueprint?.plan;
            const patchPlan = 'plan' in patch ? patch.plan : undefined;
            if (Array.isArray(patchPlan) && (!Array.isArray(currentPlan) || currentPlan.length === 0)) {
                filtered['plan'] = patchPlan;
            }
        }

        // projectName requires sandbox update, handle separately
        if ('projectName' in patch && typeof patch.projectName === 'string') {
            await this.updateProjectName(patch.projectName);
        }

        // Merge and update state
        const updated = { ...this.state.blueprint, ...filtered } as Blueprint;
        this.setState({
            ...this.state,
            blueprint: updated
        });
        
        this.broadcast(WebSocketMessageResponses.BLUEPRINT_UPDATED, {
            message: 'Blueprint updated',
            updatedKeys: Object.keys(filtered)
        });
        
        return updated;
    }

    // ===== Debugging helpers for assistants =====
    listFiles(): FileOutputType[] {
        return this.fileManager.getAllRelevantFiles();
    }

    async readFiles(paths: string[]): Promise<{ files: { path: string; content: string }[] }> {
        const results: { path: string; content: string }[] = [];
        const notFoundInFileManager: string[] = [];

        // First, try to read from FileManager (template + generated files)
        for (const path of paths) {
            const file = this.fileManager.getFile(path);
            if (file) {
                results.push({ path, content: file.fileContents });
            } else {
                notFoundInFileManager.push(path);
            }
        }

        // If some files not found in FileManager and sandbox exists, try sandbox
        if (notFoundInFileManager.length > 0 && this.state.sandboxInstanceId) {
            const resp = await this.getSandboxServiceClient().getFiles(
                this.state.sandboxInstanceId,
                notFoundInFileManager
            );
            if (resp.success) {
                results.push(...resp.files.map(f => ({
                    path: f.filePath,
                    content: f.fileContents
                })));
            }
        }

        return { files: results };
    }

    async execCommands(commands: string[], shouldSave: boolean, timeout?: number): Promise<ExecuteCommandsResponse> {
        const { sandboxInstanceId } = this.state;
        if (!sandboxInstanceId) {
            return { success: false, results: [], error: 'No sandbox instance' };
        }
        const result = await this.getSandboxServiceClient().executeCommands(sandboxInstanceId, commands, timeout);
        if (shouldSave) {
            this.saveExecutedCommands(commands);
        }
        return result;
    }

    updateSlideManifest(file: FileOutputType) {
        // If the project type is presentation and this is a slide file, update the manifest
        if (this.projectType === 'presentation') {
            const templateDetails = this.getTemplateDetails()
            if (!templateDetails) {
                return;
            }
            const slidesDirectory = templateDetails.slideDirectory ?? '/public/slides';
            if (file.filePath.startsWith(slidesDirectory) && file.filePath.endsWith('.json')) {
                const manifestPath = `${slidesDirectory}/manifest.json`
                const existingManifest = this.fileManager.getFile(manifestPath)
                
                // Parse existing manifest or create new one
                let manifestData: { slides: string[] } = { slides: [] };
                if (existingManifest) {
                    try {
                        const parsed = JSON.parse(existingManifest.fileContents);
                        manifestData = {
                            slides: Array.isArray(parsed.slides) ? parsed.slides : []
                        };
                    } catch (error) {
                        this.logger.error('Failed to parse existing manifest.json', error);
                        manifestData = { slides: [] };
                    }
                } else {
                    manifestData = { slides: [] };
                }
                
                // Add slide path to slides array if not already present
                const relativeSlidePath = file.filePath.replace(slidesDirectory + '/', '');
                if (!manifestData.slides.includes(relativeSlidePath)) {
                    manifestData.slides.push(relativeSlidePath);
                    
                    // Save updated manifest
                    const updatedManifest: FileOutputType = {
                        filePath: manifestPath,
                        fileContents: JSON.stringify(manifestData, null, 2),
                        filePurpose: 'Presentation slides manifest'
                    };
                    this.fileManager.recordFileChanges([updatedManifest]);
                    
                    this.logger.info('Updated manifest.json with new slide', {
                        slidePath: relativeSlidePath,
                        totalSlides: manifestData.slides.length
                    });
                }
            }
        }
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

        this.updateSlideManifest(result);
        const fileState = await this.fileManager.saveGeneratedFile(result);

        this.broadcast(WebSocketMessageResponses.FILE_REGENERATED, {
            message: `Regenerated file: ${file.filePath}`,
            file: fileState,
            original_issues: issues,
        });
        
        return fileState;
    }

    async regenerateFileByPath(path: string, issues: string[]): Promise<{ path: string; diff: string }> {
        const templateDetails = this.getTemplateDetails();
        if (templateDetails && templateDetails.dontTouchFiles && templateDetails.dontTouchFiles.includes(path)) {
            return {
                path,
                diff: '<WRITE PROTECTED - TEMPLATE FILE, CANNOT MODIFY - SKIPPED - NO CHANGES MADE>'
            };
        }
        // Prefer local file manager; fallback to sandbox
        let fileContents = '';
        let filePurpose = '';
        try {
            const fmFile = this.fileManager.getFile(path);
            if (fmFile) {
                fileContents = fmFile.fileContents;
                filePurpose = fmFile.filePurpose || '';
            } else {
                const { sandboxInstanceId } = this.state;
                if (!sandboxInstanceId) {
                    throw new Error('No sandbox instance available');
                }
                const resp = await this.getSandboxServiceClient().getFiles(sandboxInstanceId, [path]);
                const f = resp.success ? resp.files.find(f => f.filePath === path) : undefined;
                if (!f) throw new Error(resp.error || `File not found: ${path}`);
                fileContents = f.fileContents;
            }
        } catch (e) {
            throw new Error(`Failed to read file for regeneration: ${String(e)}`);
        }

        const regenerated = await this.regenerateFile({ filePath: path, fileContents, filePurpose }, issues, 0);
        // Invalidate cache
        this.staticAnalysisCache = null;
        // Persist to sandbox instance
        // await this.getSandboxServiceClient().writeFiles(sandboxInstanceId, [{ filePath: regenerated.filePath, fileContents: regenerated.fileContents }], `Deep debugger fix: ${path}`);
        await this.deploymentManager.deployToSandbox([regenerated])
        return { path, diff: regenerated.lastDiff };
    }

    async generateFiles(
        phaseName: string,
        phaseDescription: string,
        requirements: string[],
        files: FileConceptType[]
    ): Promise<{ files: Array<{ path: string; purpose: string; diff: string }> }> {
        this.logger.info('Generating files for deep debugger', {
            phaseName,
            requirementsCount: requirements.length,
            filesCount: files.length
        });
        
        // Broadcast file generation started
        this.broadcast(WebSocketMessageResponses.PHASE_IMPLEMENTING, {
            message: `Generating files: ${phaseName}`,
            phaseName
        });

        const skippedFiles: { path: string; purpose: string; diff: string }[] = [];

        // Enforce template donttouch constraints
        const templateDetails = this.getTemplateDetails();
        if (templateDetails && templateDetails.dontTouchFiles) {
            const dontTouchFiles = new Set<string>(templateDetails.dontTouchFiles);
            files = files.filter(file => {
                if (dontTouchFiles.has(file.path)) {
                    this.logger.info('Skipping dont-touch file', { filePath: file.path });
                    skippedFiles.push({ path: file.path, purpose: `WRITE-PROTECTED FILE, CANNOT MODIFY`, diff: "<WRITE PROTECTED - TEMPLATE FILE, CANNOT MODIFY - SKIPPED - NO CHANGES MADE>" });
                    return false;
                }
                return true;
            });
        }

        const savedFiles: FileState[] = [];

        const operation = new SimpleCodeGenerationOperation();
        const result = await operation.execute(
            {
                phaseName,
                phaseDescription,
                requirements,
                files,
                fileGeneratingCallback: (filePath: string, filePurpose: string) => {
                    this.broadcast(WebSocketMessageResponses.FILE_GENERATING, {
                        message: `Generating file: ${filePath}`,
                        filePath,
                        filePurpose
                    });
                },
                fileChunkGeneratedCallback: (filePath: string, chunk: string, format: 'full_content' | 'unified_diff') => {
                    this.broadcast(WebSocketMessageResponses.FILE_CHUNK_GENERATED, {
                        message: `Generating file: ${filePath}`,
                        filePath,
                        chunk,
                        format
                    });
                },
                fileClosedCallback: (file, message) => {
                    // Record file to state (sync)
                    const saved = this.fileManager.recordFileChanges([file]);
                    savedFiles.push(...saved);
                    this.updateSlideManifest(file);
                    this.broadcast(WebSocketMessageResponses.FILE_GENERATED, {
                        message,
                        file
                    });
                }
            },
            this.getOperationOptions()
        );

        await this.fileManager.saveGeneratedFiles(
            [],
            `feat: ${phaseName}\n\n${phaseDescription}`
        );

        this.logger.info('Files generated and saved', {
            fileCount: result.files.length
        });

        await this.deployToSandbox(savedFiles, false);

        return { 
            files: [
                ...skippedFiles,
                ...savedFiles.map(f => {
                    return {
                        path: f.filePath,
                        purpose: f.filePurpose || '',
                        diff: f.lastDiff || ''
                    };
                }) 
            ]
        };
    }

    /**
     * Get or create file serving token (lazy generation)
     */
    private getOrCreateFileServingToken(): string {
        if (!this.state.fileServingToken) {
            const token = generatePortToken();
            this.setState({
                ...this.state,
                fileServingToken: {
                    token,
                    createdAt: Date.now()
                }
            });
        }
        return this.state.fileServingToken!.token;
    }

    /**
     * Get browser preview URL for file serving
     */
    public getBrowserPreviewURL(): string {
        const token = this.getOrCreateFileServingToken();
        const agentId = this.getAgentId();
        const previewDomain = isDev(this.env) ? 'localhost:5173' : getPreviewDomain(this.env);

        // Format: b-{agentid}-{token}.{previewDomain}
        return `${getProtocolForHost(previewDomain)}://b-${agentId}-${token}.${previewDomain}`;
    }

    // A wrapper for LLM tool to deploy to sandbox
    async deployPreview(clearLogs: boolean = true, forceRedeploy: boolean = false): Promise<string> {
        const response = await this.deployToSandbox([], forceRedeploy, undefined, clearLogs);
        if (response && response.previewURL) {
            this.broadcast(WebSocketMessageResponses.PREVIEW_FORCE_REFRESH, {});
            return `Deployment successful: ${response.previewURL}`;
        }
        return `Failed to deploy: ${response?.tunnelURL}`;
    }

    async deployToSandbox(files: FileOutputType[] = [], redeploy: boolean = false, commitMessage?: string, clearLogs: boolean = false): Promise<PreviewType | null> {
        // Only deploy if project is previewable
        if (!this.isPreviewable()) {
            throw new Error('Project is not previewable');
        }
        this.logger.info('[AGENT] Deploying to sandbox', { files: files.length, redeploy, commitMessage, renderMode: this.getTemplateDetails()?.renderMode, templateDetails: this.getTemplateDetails() });

        if (this.getTemplateDetails()?.renderMode === 'browser') {
            this.logger.info('Deploying to browser native sandbox');
            this.broadcast(WebSocketMessageResponses.DEPLOYMENT_STARTED, {});
            const result: PreviewType = {
                previewURL: this.getBrowserPreviewURL()
            }
            this.logger.info('Deployed to browser native sandbox');
            this.broadcast(WebSocketMessageResponses.DEPLOYMENT_COMPLETED, result);
            return result;
        }
            
        // Invalidate static analysis cache
        this.staticAnalysisCache = null;
        
        // Call deployment manager with callbacks for broadcasting at the right times
        const result = await this.deploymentManager.deployToSandbox(
            files,
            redeploy,
            commitMessage,
            clearLogs,
            {
                onStarted: (data) => {
                    this.broadcast(WebSocketMessageResponses.DEPLOYMENT_STARTED, data);
                },
                onCompleted: (data) => {
                    this.broadcast(WebSocketMessageResponses.DEPLOYMENT_COMPLETED, data);
                },
                onError: (data) => {
                    this.broadcast(WebSocketMessageResponses.DEPLOYMENT_FAILED, data);
                },
                onAfterSetupCommands: async () => {
                    // Sync package.json after setup commands (includes dependency installs)
                    await this.syncPackageJsonFromSandbox();
                }
            }
        );

        return result;
    }
    
    /**
     * Deploy the generated code to Cloudflare Workers
     */
    async deployToCloudflare(target: DeploymentTarget = 'platform'): Promise<{ deploymentUrl?: string; workersUrl?: string } | null> {
        try {
            // Ensure sandbox instance exists first
            if (!this.state.sandboxInstanceId) {
                this.logger.info('No sandbox instance, deploying to sandbox first');
                await this.deployToSandbox();
                
                if (!this.state.sandboxInstanceId) {
                    this.logger.error('Failed to deploy to sandbox service');
                    this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
                        message: 'Deployment failed: Failed to deploy to sandbox service',
                        error: 'Sandbox service unavailable'
                    });
                    return null;
                }
            }

            // Call service - handles orchestration, callbacks for broadcasting
            const result = await this.deploymentManager.deployToCloudflare({
                target,
                callbacks: {
                    onStarted: (data) => {
                        this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_STARTED, data);
                    },
                    onCompleted: (data) => {
                        this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_COMPLETED, data);
                    },
                    onError: (data) => {
                        this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, data);
                    },
                }
            });

            // Update database with deployment ID if successful
            if (result.deploymentUrl && result.deploymentId) {
                const appService = new AppService(this.env);
                await appService.updateDeploymentId(
                    this.getAgentId(),
                    result.deploymentId
                );
            }

            return result.deploymentUrl ? { deploymentUrl: result.deploymentUrl } : null;

        } catch (error) {
            this.logger.error('Cloudflare deployment error:', error);
            this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
                message: 'Deployment failed',
                error: error instanceof Error ? error.message : String(error)
            });
            return null;
        }
    }

    async importTemplate(templateName: string): Promise<{ templateName: string; filesImported: number; files: TemplateFile[] }> {
        this.logger.info(`Importing template into project: ${templateName}`);

        if (this.state.templateName !== templateName) {
            // Get template catalog info to sync projectType
            const catalogResponse = await BaseSandboxService.listTemplates();
            const catalogInfo = catalogResponse.success 
                ? catalogResponse.templates.find(t => t.name === templateName)
                : null;
            
            // Update state with template name and projectType if available
            this.setState({
                ...this.state,
                templateName: templateName,
                ...(catalogInfo?.projectType ? { projectType: catalogInfo.projectType } : {}),
            });

            this.templateDetailsCache = null;   // Clear template details cache
        }
        const templateDetails = await this.ensureTemplateDetails();
        if (!templateDetails) {
            throw new Error(`Failed to get template details for: ${templateName}`);
        }

        this.setState({
            ...this.state,
            lastPackageJson: templateDetails.allFiles['package.json'] || this.state.lastPackageJson,
        });

        // Get important files for return value
        const importantFiles = getTemplateImportantFiles(templateDetails);

        // Ensure deployment to sandbox 
        await this.deployToSandbox();

        // Notify frontend about template metadata update
        this.broadcast(WebSocketMessageResponses.TEMPLATE_UPDATED, {
            templateDetails
        });

        return {
            templateName: templateDetails.name,
            filesImported: Object.keys(templateDetails.allFiles).length,
            files: importantFiles
        };
    }

    async waitForGeneration(): Promise<void> {
        if (this.generationPromise) {
            try {
                await this.generationPromise;
                this.logger.info("Code generation completed successfully");
            } catch (error) {
                this.logger.error("Error during code generation:", error);
            }
        } else {
            this.logger.error("No generation process found");
        }
    }

    isDeepDebugging(): boolean {
        return this.deepDebugPromise !== null;
    }
    
    getDeepDebugSessionState(): { conversationId: string } | null {
        if (this.deepDebugConversationId && this.deepDebugPromise) {
            return { conversationId: this.deepDebugConversationId };
        }
        return null;
    }

    async waitForDeepDebug(): Promise<void> {
        if (this.deepDebugPromise) {
            try {
                await this.deepDebugPromise;
                this.logger.info("Deep debug session completed successfully");
            } catch (error) {
                this.logger.error("Error during deep debug session:", error);
            } finally {
                // Clear promise after waiting completes
                this.deepDebugPromise = null;
            }
        }
    }

    protected async onProjectUpdate(message: string): Promise<void> {
        this.setState({
            ...this.state,
            projectUpdatesAccumulator: [...this.state.projectUpdatesAccumulator, message]
        });
    }

    protected async getAndResetProjectUpdates() {
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
        super.broadcast(msg, data);
    }

    protected getBootstrapCommands() {
        const bootstrapCommands = this.state.commandsHistory || [];
        // Validate, deduplicate, and clean
        const { validCommands } = validateAndCleanBootstrapCommands(bootstrapCommands);
        return validCommands;
    }

    protected async saveExecutedCommands(commands: string[]) {
        this.logger.info('Saving executed commands', { commands });
        
        // Merge with existing history
        const mergedCommands = [...(this.state.commandsHistory || []), ...commands];
        
        // Validate, deduplicate, and clean
        const { validCommands, invalidCommands, deduplicated } = validateAndCleanBootstrapCommands(mergedCommands);

        // Log what was filtered out
        if (invalidCommands.length > 0 || deduplicated > 0) {
            this.logger.warn('[commands] Bootstrap commands cleaned', { 
                invalidCommands,
                invalidCount: invalidCommands.length,
                deduplicatedCount: deduplicated,
                finalCount: validCommands.length
            });
        }

        // Update state with cleaned commands
        this.setState({
            ...this.state,
            commandsHistory: validCommands
        });

        // Update bootstrap script with validated commands
        await this.updateBootstrapScript(validCommands);

        // Sync package.json if any dependency-modifying commands were executed
        const hasDependencyCommands = commands.some(cmd => 
            cmd.includes('install') || 
            cmd.includes(' add ') || 
            cmd.includes('remove') ||
            cmd.includes('uninstall')
        );
        
        if (hasDependencyCommands) {
            this.logger.info('Dependency commands executed, syncing package.json from sandbox');
            await this.syncPackageJsonFromSandbox();
        }
    }

    /**
     * Execute commands with retry logic
     * Chunks commands and retries failed ones with AI assistance
     */
    protected async executeCommands(commands: string[], shouldRetry: boolean = true, chunkSize: number = 5): Promise<void> {
        const state = this.state;
        if (!state.sandboxInstanceId) {
            this.logger.warn('No sandbox instance available for executing commands');
            return;
        }

        // Sanitize and prepare commands
        commands = commands.join('\n').split('\n').filter(cmd => cmd.trim() !== '').filter(cmd => looksLikeCommand(cmd) && !cmd.includes(' undefined'));
        if (commands.length === 0) {
            this.logger.warn("No commands to execute");
            return;
        }

        commands = commands.map(cmd => cmd.trim().replace(/^\s*-\s*/, '').replace(/^npm/, 'bun'));
        this.logger.info(`AI suggested ${commands.length} commands to run: ${commands.join(", ")}`);

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
                        this.logger.error('Failed to execute commands', { response: resp });
                        // Check if instance is still running
                        const status = await this.getSandboxServiceClient().getInstanceStatus(state.sandboxInstanceId);
                        if (!status.success || !status.isHealthy) {
                            this.logger.error(`Instance ${state.sandboxInstanceId} is no longer running`);
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
                        this.logger.info(`Successfully executed ${successful.length} commands: ${successfulCmds.join(", ")}`);
                        successfulCommands.push(...successfulCmds);
                    }

                    // If all succeeded, move to next chunk
                    if (failures.length === 0) {
                        this.logger.info(`All commands in chunk executed successfully`);
                        break;
                    }
                    
                    // Handle failures
                    const failedCommands = failures.map(r => r.command);
                    this.logger.warn(`${failures.length} commands failed: ${failedCommands.join(", ")}`);
                    
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
                            this.logger.info(`AI suggested ${newCommands.commands.length} alternative commands`);
                            this.broadcast(WebSocketMessageResponses.COMMAND_EXECUTING, {
                                message: "Executing regenerated commands",
                                commands: newCommands.commands
                            });
                            currentChunk = newCommands.commands.filter(looksLikeCommand);
                        } else {
                            this.logger.warn('AI could not generate alternative commands');
                            currentChunk = [];
                        }
                    } else {
                        // No retry needed for non-install commands
                        currentChunk = [];
                    }
                } catch (error) {
                    this.logger.error('Error executing commands:', error);
                    // Stop retrying on error
                    break;
                }
            }
        }

        // Record command execution history
        const failedCommands = commands.filter(cmd => !successfulCommands.includes(cmd));
        
        if (failedCommands.length > 0) {
            this.broadcastError('Failed to execute commands', new Error(failedCommands.join(", ")));
        } else {
            this.logger.info(`All commands executed successfully: ${successfulCommands.join(", ")}`);
        }

        this.saveExecutedCommands(successfulCommands);
    }

    /**
     * Sync package.json from sandbox to agent's git repository
     * Called after install/add/remove commands to keep dependencies in sync
     */
    protected async syncPackageJsonFromSandbox(): Promise<void> {
        try {
            this.logger.info('Fetching current package.json from sandbox');
            const results = await this.readFiles(['package.json']);
            if (!results || !results.files || results.files.length === 0) {
                this.logger.warn('Failed to fetch package.json from sandbox', { results });
                return;
            }
            const packageJsonContent = results.files[0].content;

            const { updated, packageJson } = updatePackageJson(this.state.lastPackageJson, packageJsonContent);
            if (!updated) {
                this.logger.info('package.json has not changed, skipping sync');
                return;
            }
            // Update state with latest package.json
            this.setState({
                ...this.state,
                lastPackageJson: packageJson
            });
            
            // Commit to git repository
            const fileState = await this.fileManager.saveGeneratedFile(
                {
                    filePath: 'package.json',
                    fileContents: packageJson,
                    filePurpose: 'Project dependencies and configuration'
                },
                'chore: sync package.json dependencies from sandbox',
                true
            );
            
            this.logger.info('Successfully synced package.json to git', { 
                filePath: fileState.filePath,
            });
            
            // Broadcast update to clients
            this.broadcast(WebSocketMessageResponses.FILE_GENERATED, {
                message: 'Synced package.json from sandbox',
                file: fileState
            });
            
        } catch (error) {
            this.logger.error('Failed to sync package.json from sandbox', error);
            // Non-critical error - don't throw, just log
        }
    }

    async getLogs(_reset?: boolean, durationSeconds?: number): Promise<string> {
        if (!this.state.sandboxInstanceId) {
            throw new Error('Cannot get logs: No sandbox instance available');
        }
        
        const response = await this.getSandboxServiceClient().getLogs(this.state.sandboxInstanceId, _reset, durationSeconds);
        if (response.success) {
            return `STDOUT: ${response.logs.stdout}\nSTDERR: ${response.logs.stderr}`;
        } else {
            return `Failed to get logs, ${response.error}`;
        }
    }

    /**
     * Delete files from the file manager
     */
    async deleteFiles(filePaths: string[]) : Promise<{ success: boolean, error?: string }> {
        const deleteCommands: string[] = [];
        for (const filePath of filePaths) {
            deleteCommands.push(`rm -rf ${filePath}`);
        }
        // Remove the files from file manager
        this.fileManager.deleteFiles(filePaths);
        try {
            await this.executeCommands(deleteCommands, false);
            this.logger.info(`Deleted ${filePaths.length} files: ${filePaths.join(", ")}`);
            return { success: true };
        } catch (error) {
            this.logger.error('Error deleting files:', error);
            return { success: false, error: error as string };
        }
    }

    /**
     * Handle user input during conversational code generation
     * Processes user messages and updates pendingUserInputs state
     */
    async handleUserInput(userMessage: string, images?: ImageAttachment[]): Promise<void> {
        try {
            this.logger.info('Processing user input message', { 
                messageLength: userMessage.length,
                pendingInputsCount: this.state.pendingUserInputs.length,
                hasImages: !!images && images.length > 0,
                imageCount: images?.length || 0
            });

            // Ensure template details are loaded before processing
            await this.ensureTemplateDetails();

            // Just fetch runtime errors
            const errors = await this.fetchRuntimeErrors(false, false);
            const projectUpdates = await this.getAndResetProjectUpdates();
            this.logger.info('Passing context to user conversation processor', { errors, projectUpdates });


            const conversationState = this.infrastructure.getConversationState();
            // If there are images, upload them and pass the URLs to the conversation processor
            let uploadedImages: ProcessedImageAttachment[] = [];
            if (images) {
                uploadedImages = await Promise.all(images.map(async (image) => {
                    return await uploadImage(this.env, image, ImageType.UPLOADS);
                }));

                this.logger.info('Uploaded images', { uploadedImages });
            }

            // Process the user message using conversational assistant
            const conversationalResponse = await this.operations.processUserMessage.execute(
                { 
                    userMessage, 
                    conversationState,
                    conversationResponseCallback: (
                        message: string,
                        conversationId: string,
                        isStreaming: boolean,
                        tool?: { name: string; status: 'start' | 'success' | 'error'; args?: Record<string, unknown> }
                    ) => {
                        // Track conversationId when deep_debug starts
                        if (tool?.name === 'deep_debug' && tool.status === 'start') {
                            this.deepDebugConversationId = conversationId;
                        }
                        
                        this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                            message,
                            conversationId,
                            isStreaming,
                            tool,
                        });
                    },
                    errors,
                    projectUpdates,
                    images: uploadedImages
                }, 
                this.getOperationOptions()
            );

            const { conversationResponse, conversationState: newConversationState } = conversationalResponse;
            this.logger.info('User input processed successfully', {
                responseLength: conversationResponse.userResponse.length,
            });

            this.infrastructure.setConversationState(newConversationState);
        } catch (error) {
            this.logger.error('Error processing user input', error);
            throw error;
        }
    }

    /**
     * Capture screenshot of the given URL using Cloudflare Browser Rendering REST API.
     * Includes retry logic with blank screenshot detection.
     */
    public async captureScreenshot(
        url: string,
        viewport: { width: number; height: number } = { width: 1280, height: 720 }
    ): Promise<string> {
        if (!this.env.DB || !this.getAgentId()) {
            const error = 'Cannot capture screenshot: DB or agentId not available';
            this.logger.warn(error);
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

        this.logger.info('Capturing screenshot via REST API', { url, viewport });

        // Notify start of screenshot capture
        this.broadcast(WebSocketMessageResponses.SCREENSHOT_CAPTURE_STARTED, {
            message: `Capturing screenshot of ${url}`,
            url,
            viewport
        });

        const maxRetries = SCREENSHOT_CONFIG.MAX_RETRIES;
        let lastError: Error | null = null;
        let lastBlankReason: string | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Log retry attempt
                if (attempt > 0) {
                    this.logger.info(`Screenshot retry attempt ${attempt}/${maxRetries}`, {
                        url,
                        previousBlankReason: lastBlankReason
                    });
                }

                // Capture screenshot
                const base64Screenshot = await this.executeScreenshotCapture(url, viewport);

                // Detect if screenshot is blank
                const blankDetection = detectBlankScreenshot(
                    base64Screenshot,
                    SCREENSHOT_CONFIG.MIN_FILE_SIZE,
                    SCREENSHOT_CONFIG.MIN_ENTROPY
                );

                if (blankDetection.isBlank) {
                    lastBlankReason = blankDetection.reason;
                    this.logger.warn(`Blank screenshot detected on attempt ${attempt + 1}`, {
                        reason: blankDetection.reason,
                        url
                    });

                    // If we have retries left, wait and try again
                    if (attempt < maxRetries) {
                        const delay = SCREENSHOT_CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt);
                        this.logger.info(`Waiting ${delay}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    // On final attempt, use the screenshot anyway
                    this.logger.warn('All retry attempts resulted in blank screenshot, using last capture');
                }

                // Process and store the screenshot
                return await this.processAndStoreScreenshot(base64Screenshot, url, viewport);

            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                this.logger.error(`Screenshot capture attempt ${attempt + 1} failed:`, error);

                // If we have retries left, wait and try again
                if (attempt < maxRetries) {
                    const delay = SCREENSHOT_CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // All attempts failed
        const errorMessage = lastError?.message || lastBlankReason || 'Unknown error after retries';
        this.broadcast(WebSocketMessageResponses.SCREENSHOT_CAPTURE_ERROR, {
            error: `Screenshot capture failed after ${maxRetries + 1} attempts: ${errorMessage}`,
            url,
            viewport
        });
        throw new Error(`Screenshot capture failed: ${errorMessage}`);
    }

    /**
     * Execute a single screenshot capture attempt using Cloudflare Browser Rendering API.
     */
    private async executeScreenshotCapture(
        url: string,
        viewport: { width: number; height: number }
    ): Promise<string> {
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
                    waitUntil: 'networkidle2',
                    timeout: SCREENSHOT_CONFIG.PAGE_LOAD_TIMEOUT
                },
                waitForTimeout: SCREENSHOT_CONFIG.WAIT_FOR_TIMEOUT,
                screenshotOptions: {
                    fullPage: false,
                    type: 'png'
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Browser Rendering API failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json() as {
            success: boolean;
            result: {
                screenshot: string;
                content: string;
            };
        };

        if (!result.success || !result.result.screenshot) {
            throw new Error('Browser Rendering API succeeded but no screenshot returned');
        }

        return result.result.screenshot;
    }

    /**
     * Process and store a captured screenshot.
     */
    private async processAndStoreScreenshot(
        base64Screenshot: string,
        url: string,
        viewport: { width: number; height: number }
    ): Promise<string> {
        const screenshot: ImageAttachment = {
            id: this.getAgentId(),
            filename: 'latest.png',
            mimeType: 'image/png',
            base64Data: base64Screenshot
        };
        const uploadedImage = await uploadImage(this.env, screenshot, ImageType.SCREENSHOTS);

        // Persist in database
        try {
            const appService = new AppService(this.env);
            await appService.updateAppScreenshot(this.getAgentId(), uploadedImage.publicUrl);
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

        this.logger.info('Screenshot captured and stored successfully', {
            url,
            storage: uploadedImage.publicUrl.startsWith('data:') ? 'database' : (uploadedImage.publicUrl.includes('/api/screenshots/') ? 'r2' : 'images'),
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

        return uploadedImage.publicUrl;
    }
}
