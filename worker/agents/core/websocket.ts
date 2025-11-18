import { Connection } from 'agents';
import { createLogger } from '../../logger';
import { WebSocketMessageRequests, WebSocketMessageResponses } from '../constants';
import { SimpleCodeGeneratorAgent } from './simpleGeneratorAgent';
import { WebSocketMessage, WebSocketMessageData, WebSocketMessageType } from '../../api/websocketTypes';
import { MAX_IMAGES_PER_MESSAGE, MAX_IMAGE_SIZE_BYTES } from '../../types/image-attachment';

const logger = createLogger('CodeGeneratorWebSocket');

export function handleWebSocketMessage(agent: SimpleCodeGeneratorAgent, connection: Connection, message: string): void {
    try {
        logger.info(`Received WebSocket message from ${connection.id}: ${message}`);
        const parsedMessage = JSON.parse(message);

        switch (parsedMessage.type) {
            case WebSocketMessageRequests.GENERATE_ALL:
                // Set shouldBeGenerating flag to indicate persistent intent
                agent.setState({ 
                    ...agent.state, 
                    shouldBeGenerating: true 
                });
                
                // Check if generation is already active to avoid duplicate processes
                if (agent.isCodeGenerating()) {
                    logger.info('Generation already in progress, skipping duplicate request');
                    // sendToConnection(connection, WebSocketMessageResponses.GENERATION_STARTED, {
                    //     message: 'Code generation is already in progress'
                    // });
                    return;
                }
                
                // Start generation process
                logger.info('Starting code generation process');
                agent.generateAllFiles().catch(error => {
                    logger.error('Error during code generation:', error);
                    sendError(connection, `Error generating files: ${error instanceof Error ? error.message : String(error)}`);
                }).finally(() => {
                    // Only clear shouldBeGenerating on successful completion
                    // (errors might want to retry, so this could be handled differently)
                    if (!agent.isCodeGenerating()) {
                        agent.setState({ 
                            ...agent.state, 
                            shouldBeGenerating: false 
                        });
                    }
                });
                break;
            case WebSocketMessageRequests.DEPLOY:
                agent.deployToCloudflare().then((deploymentResult) => {
                    if (!deploymentResult) {
                        logger.error('Failed to deploy to Cloudflare Workers');
                        return;
                    }
                    logger.info('Successfully deployed to Cloudflare Workers!', deploymentResult);
                }).catch((error: unknown) => {
                    logger.error('Error during deployment:', error);
                });
                break;
            case WebSocketMessageRequests.PREVIEW:
                // Deploy current state for preview
                logger.info('Deploying for preview');
                agent.deployToSandbox().then((deploymentResult) => {
                    logger.info(`Preview deployed successfully!, deploymentResult:`, deploymentResult);
                }).catch((error: unknown) => {
                    logger.error('Error during preview deployment:', error);
                });
                break;
            case WebSocketMessageRequests.CAPTURE_SCREENSHOT:
                agent.captureScreenshot(parsedMessage.data.url, parsedMessage.data.viewport).then((screenshotResult) => {
                    if (!screenshotResult) {
                        logger.error('Failed to capture screenshot');
                        return;
                    }
                    logger.info('Screenshot captured successfully!', screenshotResult);
                }).catch((error: unknown) => {
                    logger.error('Error during screenshot capture:', error);
                });
                break;
            case WebSocketMessageRequests.STOP_GENERATION:
                logger.info('User requested to stop generation');
                
                // Cancel current inference operation
                const wasCancelled = agent.cancelCurrentInference();
                
                // Clear shouldBeGenerating flag
                agent.setState({ 
                    ...agent.state, 
                    shouldBeGenerating: false 
                });
                
                sendToConnection(connection, WebSocketMessageResponses.GENERATION_STOPPED, {
                    message: wasCancelled 
                        ? 'Inference operation cancelled successfully'
                        : 'No active inference to cancel'
                });
                break;
            case WebSocketMessageRequests.RESUME_GENERATION:
                // Set shouldBeGenerating and restart generation
                logger.info('Resuming code generation');
                agent.setState({ 
                    ...agent.state, 
                    shouldBeGenerating: true 
                });
                
                if (!agent.isCodeGenerating()) {
                    sendToConnection(connection, WebSocketMessageResponses.GENERATION_RESUMED, {
                        message: 'Code generation resumed'
                    });
                    agent.generateAllFiles().catch(error => {
                        logger.error('Error resuming code generation:', error);
                        sendError(connection, `Error resuming generation: ${error instanceof Error ? error.message : String(error)}`);
                    });
                } else {
                    // sendToConnection(connection, WebSocketMessageResponses.GENERATION_STARTED, {
                    //     message: 'Code generation is already in progress'
                    // });
                }
                break;
            case WebSocketMessageRequests.GITHUB_EXPORT:
                // DEPRECATED: WebSocket-based GitHub export replaced with OAuth flow
                // GitHub Apps require OAuth user access tokens for user repository creation
                sendToConnection(connection, WebSocketMessageResponses.GITHUB_EXPORT_ERROR, {
                    message: 'GitHub export via WebSocket is deprecated',
                    error: 'Please use the GitHub export button which will redirect you to authorize with GitHub OAuth'
                });
                break;
            case WebSocketMessageRequests.USER_SUGGESTION:
                // Handle user suggestion for conversational AI
                logger.info('Received user suggestion', {
                    messageLength: parsedMessage.message?.length || 0,
                    hasImages: !!parsedMessage.images && parsedMessage.images.length > 0,
                    imageCount: parsedMessage.images?.length || 0
                });
                
                if (!parsedMessage.message) {
                    sendError(connection, 'No message provided in user suggestion');
                    return;
                }
                
                // Validate image count and size
                if (parsedMessage.images && parsedMessage.images.length > 0) {
                    if (parsedMessage.images.length > MAX_IMAGES_PER_MESSAGE) {
                        sendError(connection, `Maximum ${MAX_IMAGES_PER_MESSAGE} images allowed per message. Received ${parsedMessage.images.length} images.`);
                        return;
                    }
                    
                    // Validate each image size
                    for (const image of parsedMessage.images) {
                        if (image.size > MAX_IMAGE_SIZE_BYTES) {
                            sendError(connection, `Image "${image.filename}" exceeds maximum size of ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB`);
                            return;
                        }
                    }
                }
                
                agent.handleUserInput(parsedMessage.message, parsedMessage.images).catch((error: unknown) => {
                    logger.error('Error handling user suggestion:', error);
                    sendError(connection, `Error processing user suggestion: ${error instanceof Error ? error.message : String(error)}`);
                });
                break;
            case WebSocketMessageRequests.GET_MODEL_CONFIGS:
                logger.info('Fetching model configurations');
                agent.getModelConfigsInfo().then(configsInfo => {
                    sendToConnection(connection, WebSocketMessageResponses.MODEL_CONFIGS_INFO, {
                        message: 'Model configurations retrieved',
                        configs: configsInfo
                    });
                }).catch((error: unknown) => {
                    logger.error('Error fetching model configs:', error);
                    sendError(connection, `Error fetching model configurations: ${error instanceof Error ? error.message : String(error)}`);
                });
                break;
            case WebSocketMessageRequests.CLEAR_CONVERSATION:
                logger.info('Clearing conversation history');
                agent.clearConversation();
                break;
            case WebSocketMessageRequests.GET_CONVERSATION_STATE:
                try {
                    const state = agent.getConversationState();
                    const debugState = agent.getDeepDebugSessionState();
                    logger.info('Conversation state retrieved', state);
                    sendToConnection(connection, WebSocketMessageResponses.CONVERSATION_STATE, { 
                        state,
                        deepDebugSession: debugState
                    });
                } catch (error) {
                    logger.error('Error fetching conversation state:', error);
                    sendError(connection, `Error fetching conversation state: ${error instanceof Error ? error.message : String(error)}`);
                }
                break;
            // Disabled it for now
            // case WebSocketMessageRequests.TERMINAL_COMMAND:
            //     // Handle terminal command execution
            //     logger.info('Received terminal command', {
            //         command: parsedMessage.command,
            //         timestamp: parsedMessage.timestamp
            //     });
                
            //     if (!parsedMessage.command) {
            //         sendError(connection, 'No command provided');
            //         return;
            //     }
                
            //     // Execute terminal command  
            //     agent.executeTerminalCommand(parsedMessage.command, connection as any)
            //         .catch((error: unknown) => {
            //             logger.error('Error executing terminal command:', error);
            //             sendToConnection(connection, WebSocketMessageResponses.TERMINAL_OUTPUT, {
            //                 output: `Error: ${error instanceof Error ? error.message : String(error)}`,
            //                 outputType: 'stderr' as const,
            //                 timestamp: Date.now()
            //             });
            //         });
            //     break;
            default:
                sendError(connection, `Unknown message type: ${parsedMessage.type}`);
        }
    } catch (error) {
        logger.error('Error processing WebSocket message:', error);
        sendError(connection, `Error processing message: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function handleWebSocketClose(connection: Connection): void {
    logger.info(`WebSocket connection closed: ${connection.id}`);
}

export function broadcastToConnections<T extends WebSocketMessageType>(
    agent: { getWebSockets(): WebSocket[] },
    type: T,
    data: WebSocketMessageData<T>
): void {
    const connections = agent.getWebSockets();
    for (const connection of connections) {
        sendToConnection(connection, type, data);
    }
}

export function sendToConnection<T extends WebSocketMessageType>(
    connection: WebSocket, 
    type: T, 
    data: WebSocketMessageData<T>
): void {
    try {
        const message: WebSocketMessage = { type, ...data } as WebSocketMessage;
        connection.send(JSON.stringify(message));
    } catch (error) {
        console.error(`Error sending message to connection ${connection.url}:`, error);
    }
}

export function sendError(connection: WebSocket, errorMessage: string): void {
    sendToConnection(connection, 'error', { error: errorMessage });
}