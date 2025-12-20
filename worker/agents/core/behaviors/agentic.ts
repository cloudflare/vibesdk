
import { AgentInitArgs } from '../types';
import { AgenticState } from '../state';
import { WebSocketMessageResponses } from '../../constants';
import { UserConversationProcessor } from '../../operations/UserConversationProcessor';
import { GenerationContext, AgenticGenerationContext } from '../../domain/values/GenerationContext';
import { PhaseImplementationOperation } from '../../operations/PhaseImplementation';
import { FileRegenerationOperation } from '../../operations/FileRegeneration';
import { AgenticProjectBuilderOperation, AgenticProjectBuilderInputs } from '../../operations/AgenticProjectBuilder';
import { buildToolCallRenderer } from '../../operations/UserConversationProcessor';
import { PhaseGenerationOperation } from '../../operations/PhaseGeneration';
import { FastCodeFixerOperation } from '../../operations/PostPhaseCodeFixer';
import { customizeTemplateFiles, generateProjectName } from '../../utils/templateCustomizer';
import { IdGenerator } from '../../utils/idGenerator';
import { generateNanoId } from '../../../utils/idGenerator';
import { BaseCodingBehavior, BaseCodingOperations } from './base';
import { ICodingAgent } from '../../services/interfaces/ICodingAgent';
import { SimpleCodeGenerationOperation } from '../../operations/SimpleCodeGeneration';
import { OperationOptions } from 'worker/agents/operations/common';
import { compactifyContext } from '../../utils/conversationCompactifier';
import { ConversationMessage, createMultiModalUserMessage, createUserMessage, Message } from '../../inferutils/common';
import { AbortError } from 'worker/agents/inferutils/core';
import { ImageAttachment, ProcessedImageAttachment } from 'worker/types/image-attachment';
import { ImageType, uploadImage } from 'worker/utils/images';

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

    // Conversation sync tracking
    private toolCallCounter: number = 0;
    private readonly COMPACTIFY_CHECK_INTERVAL = 9; // Check compactification every 9 tool calls

    /**
     * Initialize the code generator with project blueprint and template
     * Sets up services and begins deployment process
     */
    async initialize(
        initArgs: AgentInitArgs<AgenticState>,
        ..._args: unknown[]
    ): Promise<AgenticState> {
        await super.initialize(initArgs);

        const { query, hostname, inferenceContext, templateInfo, sandboxSessionId } = initArgs;

        const packageJson = templateInfo?.templateDetails?.allFiles['package.json'];

        const baseName = (query || 'project').toString();
        const projectName = generateProjectName(
            baseName,
            generateNanoId(),
            AgenticCodingBehavior.PROJECT_NAME_PREFIX_MAX_LENGTH
        );
        
        this.logger.info('Generated project name', { projectName });
        
        this.setState({
            ...this.state,
            projectName,
            query,
            blueprint: {
                title: baseName,
                projectName,
                description: query,
                colorPalette: ['#1e1e1e'],
                frameworks: [],
                plan: []
            },
            templateName: templateInfo?.templateDetails?.name || (this.projectType === 'general' ? 'scratch' : ''),
            sandboxInstanceId: undefined,
            commandsHistory: [],
            lastPackageJson: packageJson,
            sessionId: sandboxSessionId!,
            hostname,
            metadata: inferenceContext.metadata,
            projectType: this.projectType,
            behaviorType: 'agentic'
        });
        
        if (templateInfo && templateInfo.templateDetails.name !== 'scratch') {
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
                'Initialize project configuration files',
                true
            );
            
            this.logger.info('Committed customized template files to git');
            this.deployToSandbox();
        }
        this.logger.info(`Agent ${this.getAgentId()} session: ${this.state.sessionId} initialized successfully`);
        return this.state;
    }

    async onStart(props?: Record<string, unknown> | undefined): Promise<void> {
        await super.onStart(props);
    }

    /**
     * Override handleUserInput to just queue messages without AI processing
     * Messages will be injected into conversation after tool call completions
     */
    async handleUserInput(userMessage: string, images?: ImageAttachment[]): Promise<void> {
        let processedImages: ProcessedImageAttachment[] | undefined;

        if (images && images.length > 0) {
            processedImages = await Promise.all(images.map(async (image) => {
                return await uploadImage(this.env, image, ImageType.UPLOADS);
            }));

            this.logger.info('Uploaded images for queued request', {
                imageCount: processedImages.length
            });
        }

        await this.queueUserRequest(userMessage, processedImages);

        if (this.isCodeGenerating()) {
            // Code generating - render tool call for UI
            this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                message: '',
                conversationId: IdGenerator.generateConversationId(),
                isStreaming: false,
                tool: {
                    name: 'Message Queued',
                    status: 'success',
                    args: {
                        userMessage,
                        images: processedImages
                    }
                }
            });
        }

        this.logger.info('User message queued during agentic build', {
            message: userMessage,
            queueSize: this.state.pendingUserInputs.length,
            hasImages: !!processedImages && processedImages.length > 0
        });
    }

    /**
     * Handle tool call completion - sync to conversation and check queue/compactification
     */
    private async handleMessageCompletion(conversationMessage: ConversationMessage): Promise<void> {
        this.toolCallCounter++;

        this.infrastructure.addConversationMessage(conversationMessage);

        this.logger.debug('Message synced to conversation', {
            role: conversationMessage.role,
            toolCallCount: this.toolCallCounter
        });

        if (this.toolCallCounter % this.COMPACTIFY_CHECK_INTERVAL === 0) {
            await this.compactifyIfNeeded();
        }
    }

    /**
     * Compactify conversation state if needed
     */
    private async compactifyIfNeeded(): Promise<void> {
        const conversationState = this.infrastructure.getConversationState();

        const compactedHistory = await compactifyContext(
            conversationState.runningHistory,
            this.env,
            this.getOperationOptions(),
            (args) => {
                this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                    message: '',
                    conversationId: IdGenerator.generateConversationId(),
                    isStreaming: false,
                    tool: args
                });
            },
            this.logger
        );

        // Update if compactification occurred
        if (compactedHistory.length !== conversationState.runningHistory.length) {
            this.infrastructure.setConversationState({
                ...conversationState,
                runningHistory: compactedHistory
            });

            this.logger.info('Conversation compactified', {
                originalSize: conversationState.runningHistory.length,
                compactedSize: compactedHistory.length
            });
        }
    }

    getOperationOptions(): OperationOptions<AgenticGenerationContext> {
        const context = GenerationContext.from(this.state, this.getTemplateDetails(), this.logger);
        if (!GenerationContext.isAgentic(context)) {
            throw new Error('Expected AgenticGenerationContext');
        }
        return {
            env: this.env,
            agentId: this.getAgentId(),
            context,
            logger: this.logger,
            inferenceContext: this.getInferenceContext(),
            agent: this
        };
    }
    
    async build(): Promise<void> {
        let attempt = 0;
        while (!this.isMVPGenerated() || this.state.pendingUserInputs.length > 0) {
            await this.executeGeneration(attempt);
            attempt++;
        }
    }
    
    /**
     * Execute the project generation
     */
    private async executeGeneration(attempt: number): Promise<void> {
        // Reset tool call counter for this build session
        this.toolCallCounter = 0;

        this.logger.info('Starting project generation', {
            query: this.state.query,
            projectName: this.state.projectName
        });

        // Broadcast generation started
        this.broadcast(WebSocketMessageResponses.GENERATION_STARTED, {
            message: 'Starting project generation...',
            totalFiles: 1
        });

        const aiConversationId = IdGenerator.generateConversationId();

        try {
            const pendingUserInputs = this.fetchPendingUserRequests();
            if (pendingUserInputs.length > 0) {
                this.logger.info('Processing user requests', {
                    requests: pendingUserInputs,
                });
                let compiledMessage: Message;
                const images = this.pendingUserImages;
                if (images && images.length > 0) {
                    compiledMessage = createMultiModalUserMessage(
                        pendingUserInputs.join('\n'),
                        images.map(img => img.r2Key),
                        'high'
                    );
                } else {
                    compiledMessage = createUserMessage(pendingUserInputs.join('\n'));
                }
                // Save the message to conversation history
                this.infrastructure.addConversationMessage({
                    ...compiledMessage,
                    conversationId: IdGenerator.generateConversationId(),
                });
            }

            const conversationState = this.infrastructure.getConversationState();
            let conversationHistory = conversationState.runningHistory;

            if (!this.isMVPGenerated()) {
                if (attempt === 0) {
                    this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                        message: 'Initializing project builder...',
                        conversationId: aiConversationId,
                        isStreaming: false
                    });
                } else if (!pendingUserInputs) {
                    // MVP hasnt been generated but it's not the first attempt - indicates maybe the agent forgot to mark completion
                    conversationHistory = [...conversationHistory, {
                        role: 'user',
                        content: `<SYSTEM>Was the MVP generated successfully? If so, please make sure to mark it as completed by calling the mark completion tool.</SYSTEM>`,
                        conversationId: aiConversationId,
                    }]
                }
            }

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
                aiConversationId
            );

            // Create conversation sync callback
            const onToolComplete = async (toolMessage: Message) => {
                await this.handleMessageCompletion({
                    ...toolMessage,
                    conversationId: IdGenerator.generateConversationId()
                });

                // If user messages are queued, we throw an abort error, that shall break the tool call chain.
                if (this.state.pendingUserInputs.length > 0) {
                    throw new AbortError('User messages are queued');
                }
            };

            const onAssistantMessage = async (message: Message) => {
                const conversationMessage: ConversationMessage = {
                    ...message,
                    content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
                    conversationId: IdGenerator.generateConversationId(),
                };
                await this.handleMessageCompletion(conversationMessage);
            };

            // Prepare inputs for operation
            const builderInputs: AgenticProjectBuilderInputs = {
                query: this.state.query,
                projectName: this.state.projectName,
                blueprint: this.state.blueprint,
                filesIndex: Object.values(this.state.generatedFilesMap),
                projectType: this.state.projectType || 'app',
                operationalMode: this.isMVPGenerated() ? 'followup' : 'initial',
                conversationHistory,
                streamCb: (chunk: string) => {
                    this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                        message: chunk,
                        conversationId: aiConversationId,
                        isStreaming: true
                    });
                },
                toolRenderer: toolCallRenderer,
                onToolComplete,
                onAssistantMessage,
            };

            // Execute operation
            const operation = new AgenticProjectBuilderOperation();
            await operation.execute(builderInputs, this.getOperationOptions());

            // Final checks after generation completes
            await this.compactifyIfNeeded();

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
