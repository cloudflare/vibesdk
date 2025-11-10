
import { AgentInitArgs } from '../types';
import { AgenticState } from '../state';
import { WebSocketMessageResponses } from '../../constants';
import { UserConversationProcessor } from '../../operations/UserConversationProcessor';
import { GenerationContext, AgenticGenerationContext } from '../../domain/values/GenerationContext';
import { PhaseImplementationOperation } from '../../operations/PhaseImplementation';
import { FileRegenerationOperation } from '../../operations/FileRegeneration';
import { AgenticProjectBuilder, BuildSession } from '../../assistants/agenticProjectBuilder';
import { buildToolCallRenderer } from '../../operations/UserConversationProcessor';
import { PhaseGenerationOperation } from '../../operations/PhaseGeneration';
import { FastCodeFixerOperation } from '../../operations/PostPhaseCodeFixer';
import { customizeTemplateFiles, generateProjectName } from '../../utils/templateCustomizer';
import { generateBlueprint } from '../../planning/blueprint';
import { IdGenerator } from '../../utils/idGenerator';
import { generateNanoId } from '../../../utils/idGenerator';
import { BaseCodingBehavior, BaseCodingOperations } from './base';
import { ICodingAgent } from '../../services/interfaces/ICodingAgent';
import { SimpleCodeGenerationOperation } from '../../operations/SimpleCodeGeneration';
import { OperationOptions } from 'worker/agents/operations/common';

interface AgenticOperations extends BaseCodingOperations {
    generateNextPhase: PhaseGenerationOperation;
    implementPhase: PhaseImplementationOperation;
}

/**
 * AgenticCodingBehavior
 */
export class AgenticCodingBehavior extends BaseCodingBehavior<AgenticState> implements ICodingAgent {
    protected static readonly PROJECT_NAME_PREFIX_MAX_LENGTH = 20;
    
    protected operations: AgenticOperations = {
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
        initArgs: AgentInitArgs<AgenticState>,
        ..._args: unknown[]
    ): Promise<AgenticState> {
        await super.initialize(initArgs);

        const { query, language, frameworks, hostname, inferenceContext, templateInfo, sandboxSessionId } = initArgs;

        // Generate a blueprint
        this.logger.info('Generating blueprint', { query, queryLength: query.length, imagesCount: initArgs.images?.length || 0 });
        this.logger.info(`Using language: ${language}, frameworks: ${frameworks ? frameworks.join(", ") : "none"}`);
        
        const blueprint = await generateBlueprint({
            env: this.env,
            inferenceContext,
            query,
            language: language!,
            frameworks: frameworks!,
            projectType: this.state.projectType,
            templateDetails: templateInfo?.templateDetails,
            templateMetaInfo: templateInfo?.selection,
            images: initArgs.images,
            stream: {
                chunk_size: 256,
                onChunk: (chunk) => {
                    initArgs.onBlueprintChunk(chunk);
                }
            }
        })

        const packageJson = templateInfo?.templateDetails?.allFiles['package.json'];

        const projectName = generateProjectName(
            blueprint.projectName,
            generateNanoId(),
            AgenticCodingBehavior.PROJECT_NAME_PREFIX_MAX_LENGTH
        );
        
        this.logger.info('Generated project name', { projectName });
        
        this.setState({
            ...this.state,
            projectName,
            query,
            blueprint,
            templateName: templateInfo?.templateDetails.name || '',
            sandboxInstanceId: undefined,
            commandsHistory: [],
            lastPackageJson: packageJson,
            sessionId: sandboxSessionId!,
            hostname,
            inferenceContext,
        });
        
        if (templateInfo) {
            // Customize template files (package.json, wrangler.jsonc, .bootstrap.js, .gitignore)
            const customizedFiles = customizeTemplateFiles(
                templateInfo.templateDetails.allFiles,
                {
                    projectName,
                    commandsHistory: [] // Empty initially, will be updated later
                }
            );
            
            this.logger.info('Customized template files', { 
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
            
            this.logger.info('Committed customized template files to git');
        }

        this.initializeAsync().catch((error: unknown) => {
            this.broadcastError("Initialization failed", error);
        });
        this.logger.info(`Agent ${this.getAgentId()} session: ${this.state.sessionId} initialized successfully`);
        return this.state;
    }

    async onStart(props?: Record<string, unknown> | undefined): Promise<void> {
        await super.onStart(props);
    }

    getOperationOptions(): OperationOptions<AgenticGenerationContext> {
        return {
            env: this.env,
            agentId: this.getAgentId(),
            context: GenerationContext.from(this.state, this.getTemplateDetails(), this.logger) as AgenticGenerationContext,
            logger: this.logger,
            inferenceContext: this.getInferenceContext(),
            agent: this
        };
    }
    
    async build(): Promise<void> {
        await this.executeGeneration();
    }
    
    /**
     * Execute the project generation
     */
    private async executeGeneration(): Promise<void> {
        this.logger.info('Starting project generation', {
            query: this.state.query,
            projectName: this.state.projectName
        });
        
        // Generate unique conversation ID for this build session
        const buildConversationId = IdGenerator.generateConversationId();
        
        // Broadcast generation started
        this.broadcast(WebSocketMessageResponses.GENERATION_STARTED, {
            message: 'Starting project generation...',
            totalFiles: 1
        });
        
        // Send initial message to frontend
        this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
            message: 'Initializing project builder...',
            conversationId: buildConversationId,
            isStreaming: false
        });
        
        try {
            const generator = new AgenticProjectBuilder(
                this.env,
                this.state.inferenceContext
            );
            
            // Create build session for tools
            const session: BuildSession = {
                agent: this,
                filesIndex: Object.values(this.state.generatedFilesMap),
                projectType: this.state.projectType || 'app'
            };
            
            // Create tool renderer for UI feedback
            const toolCallRenderer = buildToolCallRenderer(
                (message: string, conversationId: string, isStreaming: boolean, tool?) => {
                    this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                        message,
                        conversationId,
                        isStreaming,
                        tool
                    });
                },
                buildConversationId
            );
            
            // Run the assistant with streaming and tool rendering
            await generator.run(
                {
                    query: this.state.query,
                    projectName: this.state.projectName,
                    blueprint: this.state.blueprint
                },
                session,
                // Stream callback - sends text chunks to frontend
                (chunk: string) => {
                    this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                        message: chunk,
                        conversationId: buildConversationId,
                        isStreaming: true
                    });
                },
                // Tool renderer for visual feedback on tool calls
                toolCallRenderer
            );
            
            this.broadcast(WebSocketMessageResponses.GENERATION_COMPLETED, {
                message: 'Project generation completed',
                filesGenerated: Object.keys(this.state.generatedFilesMap).length
            });
            
            this.logger.info('Project generation completed');
            
        } catch (error) {
            this.logger.error('Project generation failed', error);
            this.broadcast(WebSocketMessageResponses.ERROR, {
                error: error instanceof Error ? error.message : 'Unknown error during generation'
            });
            throw error;
        } finally {
            this.generationPromise = null;
            this.clearAbortController();
        }
    }
}
