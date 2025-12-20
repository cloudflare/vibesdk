import { WebSocketMessageResponses } from '../../../agents/constants';
import { BaseController } from '../baseController';
import { generateId } from '../../../utils/idGenerator';
import { AgentState } from '../../../agents/core/state';
import { BehaviorType, ProjectType } from '../../../agents/core/types';
import { getAgentStub, getTemplateForQuery } from '../../../agents';
import {
    AgentConnectionData,
    AgentPreviewResponse,
    CodeGenArgs,
    MAX_AGENT_QUERY_LENGTH,
} from './types';
import { SecurityError, SecurityErrorType } from 'shared/types/errors';
import { ApiResponse, ControllerResponse } from '../types';
import { RouteContext } from '../../types/route-context';
import { ModelConfigService } from '../../../database';
import { ModelConfig, credentialsToRuntimeOverrides } from '../../../agents/inferutils/config.types';
import { RateLimitService } from '../../../services/rate-limit/rateLimits';
import { validateWebSocketOrigin } from '../../../middleware/security/websocket';
import { createLogger } from '../../../logger';
import { getPreviewDomain } from 'worker/utils/urls';
import { ImageType, uploadImage } from 'worker/utils/images';
import { ProcessedImageAttachment } from 'worker/types/image-attachment';
import { getTemplateImportantFiles } from 'worker/services/sandbox/utils';

const defaultCodeGenArgs: Partial<CodeGenArgs> = {
    language: 'typescript',
    frameworks: ['react', 'vite'],
    selectedTemplate: 'auto',
};

const resolveBehaviorType = (body: CodeGenArgs): BehaviorType => {
    if (body.behaviorType) return body.behaviorType;
    const pt = body.projectType;
    if (pt === 'presentation' || pt === 'workflow' || pt === 'general') return 'agentic';
    // default (including 'app' and when projectType omitted)
    return 'phasic';
};

const resolveProjectType = (body: CodeGenArgs): ProjectType | 'auto' => {
    return body.projectType || 'auto';
};


/**
 * CodingAgentController to handle all code generation related endpoints
 */
export class CodingAgentController extends BaseController {
    static logger = createLogger('CodingAgentController');
    /**
     * Start the incremental code generation process
     */
    static async startCodeGeneration(request: Request, env: Env, _: ExecutionContext, context: RouteContext): Promise<Response> {
        try {
            this.logger.info('Starting code generation process');

            const url = new URL(request.url);
            const hostname = url.hostname === 'localhost' ? `localhost:${url.port}`: getPreviewDomain(env);
            // Parse the query from the request body
            let body: CodeGenArgs;
            try {
                body = await request.json() as CodeGenArgs;
            } catch (error) {
                return CodingAgentController.createErrorResponse(`Invalid JSON in request body: ${JSON.stringify(error, null, 2)}`, 400);
            }

            const query = body.query;
            if (typeof query !== 'string' || query.trim().length === 0) {
                return CodingAgentController.createErrorResponse('Missing "query" field in request body', 400);
            }
            if (query.length > MAX_AGENT_QUERY_LENGTH) {
                return CodingAgentController.createErrorResponse(
                    new SecurityError(
                        SecurityErrorType.INVALID_INPUT,
                        `Prompt too large (${query.length} characters). Maximum allowed is ${MAX_AGENT_QUERY_LENGTH} characters.`,
                        413,
                    ),
                    413,
                );
            }
            const { readable, writable } = new TransformStream({
                transform(chunk, controller) {
                    if (chunk === "terminate") {
                        controller.terminate();
                    } else {
                        const encoded = new TextEncoder().encode(JSON.stringify(chunk) + '\n');
                        controller.enqueue(encoded);
                    }
                }
            });
            const writer = writable.getWriter();
            // Check if user is authenticated (required for app creation)
            const user = context.user!;
            try {
                await RateLimitService.enforceAppCreationRateLimit(env, context.config.security.rateLimit, user, request);
            } catch (error) {
                if (error instanceof Error) {
                    return CodingAgentController.createErrorResponse(error, 429);
                } else {
                    this.logger.error('Unknown error in enforceAppCreationRateLimit', error);
                    return CodingAgentController.createErrorResponse(JSON.stringify(error), 429);
                }
            }

            const agentId = generateId();
            const modelConfigService = new ModelConfigService(env);
            const projectType = resolveProjectType(body);
            const behaviorType = resolveBehaviorType(body);

            this.logger.info(`Resolved behaviorType: ${behaviorType}, projectType: ${projectType} for agent ${agentId}`);
                                
            // Fetch all user model configs, api keys and agent instance at once
            const userConfigsRecord = await modelConfigService.getUserModelConfigs(user.id);
                                
            // Extract only user-overridden configs, stripping metadata fields
            const userModelConfigs: Record<string, ModelConfig> = {};
            for (const [actionKey, mergedConfig] of Object.entries(userConfigsRecord)) {
                if (mergedConfig.isUserOverride) {
                    const { isUserOverride, userConfigId, ...modelConfig } = mergedConfig;
                    userModelConfigs[actionKey] = modelConfig;
                }
            }

            const runtimeOverrides = credentialsToRuntimeOverrides(body.credentials);

            const inferenceContext = {
                metadata: {
                    agentId: agentId,
                    userId: user.id,
                },
                userModelConfigs,
                runtimeOverrides,
                enableRealtimeCodeFix: false, // This costs us too much, so disabled it for now
                enableFastSmartCodeFix: false,
            }
                                
            this.logger.info(`Initialized inference context for user ${user.id}`, {
                modelConfigsCount: Object.keys(userModelConfigs).length,
            });
            this.logger.info(`Creating project of type: ${projectType}`);

            const { templateDetails, selection, projectType: finalProjectType } = await getTemplateForQuery(env, inferenceContext, query, projectType, body.images, this.logger);

            const websocketUrl = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}/api/agent/${agentId}/ws`;
            const httpStatusUrl = `${url.origin}/api/agent/${agentId}`;

            let uploadedImages: ProcessedImageAttachment[] = [];
            if (body.images) {
                uploadedImages = await Promise.all(body.images.map(async (image) => {
                    return uploadImage(env, image, ImageType.UPLOADS);
                }));
            }

            writer.write({
                message: 'Code generation started',
                agentId: agentId,
                websocketUrl,
                httpStatusUrl,
                behaviorType,
                projectType: finalProjectType,
                template: {
                    name: templateDetails.name,
                    files: getTemplateImportantFiles(templateDetails),
                }
            });
            const agentInstance = await getAgentStub(env, agentId, { behaviorType, projectType: finalProjectType });

            const baseInitArgs = {
                query,
                language: body.language || defaultCodeGenArgs.language,
                frameworks: body.frameworks || defaultCodeGenArgs.frameworks,
                hostname,
                inferenceContext,
                images: uploadedImages,
                onBlueprintChunk: (chunk: string) => {
                    writer.write({chunk});
                },
            } as const;

            const initArgs = { ...baseInitArgs, templateInfo: { templateDetails, selection } }

            const agentPromise = agentInstance.initialize(initArgs) as Promise<AgentState>;
            agentPromise.then(async (_state: AgentState) => {
                writer.write("terminate");
                writer.close();
                this.logger.info(`Agent ${agentId} terminated successfully`);
            });

            this.logger.info(`Agent ${agentId} init launched successfully`);
            
            return new Response(readable, {
                status: 200,
                headers: {
                    // Use SSE content-type to ensure Cloudflare disables buffering,
                    // while the payload remains NDJSON lines consumed by the client.
                    'Content-Type': 'text/event-stream; charset=utf-8',
                    // Prevent intermediary caches/proxies from buffering or transforming
                    'Cache-Control': 'no-cache, no-store, must-revalidate, no-transform',
                    'Pragma': 'no-cache',
                    'Connection': 'keep-alive'
                }
            });
        } catch (error) {
            this.logger.error('Error starting code generation', error);
            return CodingAgentController.handleError(error, 'start code generation');
        }
    }

    /**
     * Handle WebSocket connections for code generation
     * This routes the WebSocket connection directly to the Agent
     */
    static async handleWebSocketConnection(
        request: Request,
        env: Env,
        _: ExecutionContext,
        context: RouteContext
    ): Promise<Response> {
        try {
            const chatId = context.pathParams.agentId; // URL param is still agentId for backward compatibility
            if (!chatId) {
                return CodingAgentController.createErrorResponse('Missing agent ID parameter', 400);
            }

            // Ensure the request is a WebSocket upgrade request
            if (request.headers.get('Upgrade') !== 'websocket') {
                return new Response('Expected WebSocket upgrade', { status: 426 });
            }
            
            // Validate WebSocket origin
            if (!validateWebSocketOrigin(request, env)) {
                return new Response('Forbidden: Invalid origin', { status: 403 });
            }

            // Extract user for rate limiting
            const user = context.user!;
            if (!user) {
                return CodingAgentController.createErrorResponse('Missing user', 401);
            }

            this.logger.info(`WebSocket connection request for chat: ${chatId}`);
            
            // Log request details for debugging
            const headers: Record<string, string> = {};
            request.headers.forEach((value, key) => {
                headers[key] = value;
            });
            this.logger.info('WebSocket request details', {
                headers,
                url: request.url,
                chatId
            });

            try {
                // Get the agent instance to handle the WebSocket connection
                const agentInstance = await getAgentStub(env, chatId);
                
                this.logger.info(`Successfully got agent instance for chat: ${chatId}`);

                // Let the agent handle the WebSocket connection directly
                return agentInstance.fetch(request);
            } catch (error) {
                this.logger.error(`Failed to get agent instance with ID ${chatId}:`, error);
                // Return an appropriate WebSocket error response
                // We need to emulate a WebSocket response even for errors
                const { 0: client, 1: server } = new WebSocketPair();

                server.accept();
                server.send(JSON.stringify({
                    type: WebSocketMessageResponses.ERROR,
                    error: `Failed to get agent instance: ${error instanceof Error ? error.message : String(error)}`
                }));

                server.close(1011, 'Agent instance not found');

                return new Response(null, {
                    status: 101,
                    webSocket: client
                });
            }
        } catch (error) {
            this.logger.error('Error handling WebSocket connection', error);
            return CodingAgentController.handleError(error, 'handle WebSocket connection');
        }
    }

    /**
     * Connect to an existing agent instance
     * Returns connection information for an already created agent
     */
    static async connectToExistingAgent(
        request: Request,
        env: Env,
        _: ExecutionContext,
        context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<AgentConnectionData>>> {
        try {
            const agentId = context.pathParams.agentId;
            if (!agentId) {
                return CodingAgentController.createErrorResponse<AgentConnectionData>('Missing agent ID parameter', 400);
            }

            this.logger.info(`Connecting to existing agent: ${agentId}`);

            try {
                // Verify the agent instance exists
                const agentInstance = await getAgentStub(env, agentId);
                if (!agentInstance || !(await agentInstance.isInitialized())) {
                    return CodingAgentController.createErrorResponse<AgentConnectionData>('Agent instance not found or not initialized', 404);
                }
                this.logger.info(`Successfully connected to existing agent: ${agentId}`);

                // Construct WebSocket URL
                const url = new URL(request.url);
                const websocketUrl = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}/api/agent/${agentId}/ws`;

                const responseData: AgentConnectionData = {
                    websocketUrl,
                    agentId,
                };

                return CodingAgentController.createSuccessResponse(responseData);
            } catch (error) {
                this.logger.error(`Failed to connect to agent ${agentId}:`, error);
                return CodingAgentController.createErrorResponse<AgentConnectionData>(`Agent instance not found or unavailable: ${error instanceof Error ? error.message : String(error)}`, 404);
            }
        } catch (error) {
            this.logger.error('Error connecting to existing agent', error);
            return CodingAgentController.handleError(error, 'connect to existing agent') as ControllerResponse<ApiResponse<AgentConnectionData>>;
        }
    }

    static async deployPreview(
        _request: Request,
        env: Env,
        _: ExecutionContext,
        context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<AgentPreviewResponse>>> {
        try {
            const agentId = context.pathParams.agentId;
            if (!agentId) {
                return CodingAgentController.createErrorResponse<AgentPreviewResponse>('Missing agent ID parameter', 400);
            }

            this.logger.info(`Deploying preview for agent: ${agentId}`);

            try {
                // Get the agent instance
                const agentInstance = await getAgentStub(env, agentId);
                
                // Deploy the preview
                const preview = await agentInstance.deployToSandbox();
                if (!preview) {
                    return CodingAgentController.createErrorResponse<AgentPreviewResponse>('Failed to deploy preview', 500);
                }
                this.logger.info('Preview deployed successfully', {
                    agentId,
                    previewUrl: preview.previewURL
                });

                return CodingAgentController.createSuccessResponse(preview);
            } catch (error) {
                this.logger.error('Failed to deploy preview', { agentId, error });
                return CodingAgentController.createErrorResponse<AgentPreviewResponse>('Failed to deploy preview', 500);
            }
        } catch (error) {
            this.logger.error('Error deploying preview', error);
            const appError = CodingAgentController.handleError(error, 'deploy preview') as ControllerResponse<ApiResponse<AgentPreviewResponse>>;
            return appError;
        }
    }
}
