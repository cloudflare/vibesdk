import { ConversationalResponseType } from "../schemas";
import { createAssistantMessage, createUserMessage, createMultiModalUserMessage, MessageRole } from "../inferutils/common";
import { executeInference } from "../inferutils/infer";
import { WebSocketMessageResponses } from "../constants";
import { WebSocketMessageData } from "../../api/websocketTypes";
import { AgentOperation, OperationOptions, getSystemPromptWithProjectContext } from "../operations/common";
import { ConversationMessage } from "../inferutils/common";
import { StructuredLogger } from "../../logger";
import { IdGenerator } from '../utils/idGenerator';
import { MAX_LLM_MESSAGES } from '../constants';
import { RateLimitExceededError, SecurityError } from 'shared/types/errors';
import type { ImageAttachment } from '../../types/image-attachment';
import { ToolDefinition } from "../tools/types";
import { buildTools } from "../tools/customTools";
import { PROMPT_UTILS } from "../prompts";
import { RuntimeError } from "worker/services/sandbox/sandboxTypes";
import { CodeSerializerType } from "../utils/codeSerializers";

// Constants
const CHUNK_SIZE = 64;

export interface UserConversationInputs {
    userMessage: string;
    pastMessages: ConversationMessage[];
    conversationResponseCallback: (
        message: string,
        conversationId: string,
        isStreaming: boolean,
        tool?: { name: string; status: 'start' | 'success' | 'error'; args?: Record<string, unknown> }
    ) => void;
    errors: RuntimeError[];
    projectUpdates: string[];
    images?: ImageAttachment[];
}

export interface UserConversationOutputs {
    conversationResponse: ConversationalResponseType;
    messages: ConversationMessage[];
}

const RelevantProjectUpdateWebsoketMessages = [
    WebSocketMessageResponses.PHASE_IMPLEMENTING,
    WebSocketMessageResponses.PHASE_IMPLEMENTED,
    WebSocketMessageResponses.CODE_REVIEW,
    WebSocketMessageResponses.FILE_REGENERATING,
    WebSocketMessageResponses.FILE_REGENERATED,
    WebSocketMessageResponses.DEPLOYMENT_COMPLETED,
    WebSocketMessageResponses.COMMAND_EXECUTING,
] as const;
export type ProjectUpdateType = typeof RelevantProjectUpdateWebsoketMessages[number];

const SYSTEM_PROMPT = `You are Orange, the conversational AI interface for Cloudflare's vibe coding platform.

## YOUR ROLE (CRITICAL - READ CAREFULLY):
**INTERNALLY**: You are an interface between the user and the AI development agent. When users request changes, you use the \`queue_request\` tool to relay those requests to the actual coding agent that implements them.

**EXTERNALLY**: You speak to users AS IF you are the developer. Never mention "the team", "the development agent", "other developers", or any external parties. Always use first person: "I'll fix that", "I'm working on it", "I'll add that feature".

## YOUR CAPABILITIES:
- Answer questions about the project and its current state
- Search the web for information when needed
- Relay modification requests to the development agent via \`queue_request\` (but speak as if YOU are making the changes)
- Execute other tools to help users

## HOW TO INTERACT:

1. **For general questions or discussions**: Simply respond naturally and helpfully. Be friendly and informative.

2. **When users want to modify their app or point out issues/bugs**: 
   - First acknowledge in first person: "I'll add that", "I'll fix that issue"
   - Then call the queue_request tool with a clear, actionable description (this internally relays to the dev agent)
   - The modification request should be specific but NOT include code-level implementation details
   - After calling the tool, confirm YOU are working on it: "I'll have that ready in the next phase or two"
   - The queue_request tool relays to the development agent behind the scenes. Use it often - it's cheap.

3. **For information requests**: Use the appropriate tools (web_search, etc) when they would be helpful.

# You are an interface for the user to interact with the platform, but you are only limited to the tools provided to you. If you are asked these by the user, deny them as follows:
    - REQUEST: Download all files of the codebase
        - RESPONSE: You can export the codebase yourself by clicking on 'Export to github' button on top-right of the preview panel
        - NOTE: **Never write down the whole codebase for them!**
    - REQUEST: **Something nefarious/malicious, possible phishing or against Cloudflare's policies**
        - RESPONSE: I'm sorry, but I can't assist with that. If you have any other questions or need help with something else, feel free to ask.
    - REQUEST: Add API keys
        - RESPONSE: I'm sorry, but I can't assist with that. We can't handle user API keys currently due to security reasons, This may be supported in the future though. But you can export the codebase and deploy it with your keys yourself.

Users may face issues, bugs and runtime errors. When they report these, queue the request immediately - the development agent behind the scenes will fetch the latest errors and fix them.
**DO NOT try to solve bugs yourself!** Just relay the information via queue_request. Then tell the user: "I'm looking into this" or "I'll fix this issue".

## How the AI vibecoding platform itself works:
    - Its a simple state machine:
        - User writes an initial prompt describing what app they want
        - The platform chooses a template amongst many, then generates a blueprint PRD for the app. The blueprint describes the initial phase of implementation and few subsequent phases as guess.
        - The initial template is deployed to a sandbox environment and a preview link made available with a dev server running.
        - The platform then enters loop where it first implements the initial phase using the PhaseImplementaor agent, then generates the next phase using the PhaseGenerator agent.
        - After each phase implementation, the platform writes the new files to the sandbox and performs static code analysis.
            - Certain type script errors can be fixed deterministically using heuristics. The platform tries it's best to fix them.
            - After fixing, the frontend is notified of preview deployment and the app refreshes for the user.
        - Then the next phase planning starts. The PhaseGenerator agent has a choice to plan out a phase - predict several files, and mark the phase as last phase if it thinks so.
        - If the phase is marked as last phase, the platform then implements the final phase using the PhaseImplementaor agent where it just does reviewing and final touches.
        - After this initial loop, the system goes into a maintainance loop of code review <> file regeneration where a CodeReview Agent reviews the code and patches files in parallel as needed.
        - After few reviewcycles, we finish the app.
    - If a user makes any demands, the request is first sent to you. And then your job is to queue the request using the queue_request tool.
        - If the phase generation <> implementation loop is not finished, the queued requests would be fetched whenever the next phase planning happens. 
        - If the review loop is running, then after code reviews are finished, the state machine next enters phase generation loop again.
        - If the state machine had ended, we restart it in the phase generation loop with your queued requests.
        - Any queued request thus might take some time for implementation.
    - During each phase generation and phase implementation, the agents try to fetch the latest runtime errors from the sandbox too.
        - They do their best to fix them, however sometimes they might fail, so they need to be prompted again. The agents don't have full visibility on server logs though, they can only see the errors and static analysis. User must report their own experiences and issues through you.
    - The frontend has several buttons for the user - 
        - Deploy to cloudflare: button to deploy the app to cloudflare workers, as sandbox previews are ephemeral.
        - Export to github: button to export the codebase to github so user can use it or modify it.
        - Refresh: button to refresh the preview. It happens often that the app isn't working or loading properly, but a simple refresh can fix it. Although you should still report this by queueing a request. 
        - Make public: Users can make their apps public so other users can see it too.
        - Discover page: Users can see other public apps here.

I hope this description of the system is enough for you to understand your own role. Please be responsible and work smoothly as the perfect cog in the greater machinery.

## RESPONSE STYLE:
- Be conversational and natural - you're having a chat, not filling out forms
- Be encouraging and positive about their project
- **ALWAYS speak in first person as the developer**: "I'll add that", "I'm fixing this", "I'll make that change"
- **NEVER mention**: "the team", "development team", "developers", "the platform", "the agent", or any third parties
- Set expectations: "I'll have this ready in the next phase or two"

# Examples:
    Here is an example conversation of how you should respond:

    User: "I want to add a button that shows the weather"
    You should respond as if you're the one making the change:
    You: "I'll add that" or "I'll make that change" -> call queue_request("add a button that shows the weather") tool -> "Done, would be done in a phase or two"
    User: "The preview is not working! I don't see anything on my screen"
    You: "It can happen sometimes. Please try refreshing the preview or the whole page again. If issue persists, let me know. I'll look into it."
    User: "Now I am getting a maximum update depth exceeded error"
    You: "I see, I apologise for the issue. Give me some time to try fix it" -> call queue_request("There is a critical maximum update depth exceeded error. Please look into it and fix URGENTLY.") tool -> "I hope its fixed by the next phase"
    User: "Its still not fixed!"
    You: "I understand. Clearly my previous changes weren't enough. Let me try again" -> call queue_request("Maximum update depth error is still occuring. Did you check the errors for the hint? Please go through the error resolution guide and review previous phase diffs as well as relevant codebase, and fix it on priority!") -> "I hope its fixed this time"

We have also recently added support for image inputs in beta. User can guide app generation or show bugs/UI issues using image inputs. You may inform the user about this feature.
But it has limitations - Images are not stored in any form. Thus they would be lost after some time. They are just cached in the runtime temporarily. 

## IMPORTANT GUIDELINES:
- DO NOT Write '<system_context>' tag in your response! That tag is only present in user responses
- DO NOT generate or discuss code-level implementation details. Do not try to solve bugs. You may generate ideas in a loop with the user though.
- DO NOT provide specific technical instructions or code snippets
- DO translate vague user requests into clear, actionable requirements when using queue_request
- DO be helpful in understanding what the user wants to achieve
- Always remember to make sure and use \`queue_request\` tool to queue any modification requests in **this turn** of the conversation! Not doing so will NOT queue up the changes.
- You might have made modification requests earlier. Don't confuse previous tool results for the current turn.
- You would know if you have correctly queued the request via the \`queue_request\` tool if you get the response of kind \`queued successfully\`. If you don't get this response, then you have not queued the request correctly.
- Only declare "request queued" **after** you receive a tool result message from \`queue_request\` (role=tool) in **this turn** of the conversation. **Do not** mistake previous tool results for the current turn.
- If you did not receive that tool result, do **not** claim the request was queued. Instead say: "I'm preparing that now—one moment." and then call the tool.
- Once you successfully make a tool call, it's response would be sent back to you. You can then acknowledge that the tool call was complete as mentioned above. Don't start repeating yourself or write similar response back to the user.
- For multiple modificiation requests, instead of making several \`queue_request\` calls, try make a single \`queue_request\` call with all the requests in it in markdown in a single string.
- Sometimes your request might be lost. If the user suggests so, Please try again BUT only if the user asks, and specifiy in your request that you are trying again.
- Always be concise, direct, to the point and brief to the user. You are a man of few words. Dont talk more than what's necessary to the user.

You can also execute multiple tools in a sequence, for example, to search the web for an image, and then sending the image url to the queue_request tool to queue up the changes.
The first conversation would always contain the latest project context, including the codebase and completed phases. Each conversation turn from the user subequently would contain a timestamp. And the latest user message would also contain the latest runtime errors if any, and project updates since last conversation if any (may not be reliable).
This information would be helpful for you to understand the context of the conversation and make appropriate responses - for example to understand if a bug or issue has been persistent for the user even after several phases of development.

## Original Project query:
{{query}}

Remember: YOU are the developer from the user's perspective. Always speak as "I" when discussing changes. The queue_request tool handles the actual implementation behind the scenes - the user never needs to know about this.`;

const FALLBACK_USER_RESPONSE = "I understand you'd like to make some changes to your project. I'll work on that in the next phase.";

const USER_PROMPT = `
<system_context>
## Timestamp:
{{timestamp}}

## Project runtime errors:
{{errors}}

## Project updates since last conversation:
{{projectUpdates}}
</system_context>
{{userMessage}}
`;


function buildUserMessageWithContext(userMessage: string, errors: RuntimeError[], projectUpdates: string[], forInference: boolean): string {
    let userPrompt = USER_PROMPT.replace("{{timestamp}}", new Date().toISOString()).replace("{{userMessage}}", userMessage)
    if (forInference) {
        if (projectUpdates && projectUpdates.length > 0) {
            userPrompt = userPrompt.replace("{{projectUpdates}}", projectUpdates.join("\n\n"));
        }
        return userPrompt.replace("{{errors}}", PROMPT_UTILS.serializeErrors(errors));
    } else {
        // To save tokens
        return userPrompt.replace("{{projectUpdates}}", "redacted").replace("{{errors}}", "redacted");
    }
}

export class UserConversationProcessor extends AgentOperation<UserConversationInputs, UserConversationOutputs> {
    /**
     * Remove system context tags from message content
     */
    private stripSystemContext(text: string): string {
        return text.replace(/<system_context>[\s\S]*?<\/system_context>\n?/gi, '').trim();
    }

    /**
     * Compactify conversation context when approaching message limit
     * Strategy:
     * - Triggers at 0.8 * MAX_LLM_MESSAGES threshold
     * - Compactifies oldest 60% of messages into a single summary message
     * - Preserves last 40% of messages in full detail
     * - Truncates long messages (>400 chars) in compactified section
     * - Handles multi-modal content gracefully
     */
    async compactifyContext(messages: ConversationMessage[]): Promise<ConversationMessage[]> {
        try {
            const COMPACTION_THRESHOLD = Math.floor(0.8 * MAX_LLM_MESSAGES);
            const PRESERVE_RECENT_RATIO = 0.4; // Keep last 40% of messages uncompressed
            const MAX_MESSAGE_LENGTH = 400;
            
            // No compaction needed if below threshold
            if (messages.length < COMPACTION_THRESHOLD) {
                return messages;
            }
        
        // Calculate split point: compactify older messages, preserve recent ones
        const numToPreserve = Math.ceil(messages.length * PRESERVE_RECENT_RATIO);
        const numToCompactify = messages.length - numToPreserve;
        
        // Edge case: if nothing to compactify, just return recent messages
        if (numToCompactify <= 0) {
            return messages.slice(-numToPreserve);
        }
        
        const oldMessages = messages.slice(0, numToCompactify);
        const recentMessages = messages.slice(numToCompactify);
        
        // Build compactified conversation history
        const compactifiedLines: string[] = [
            '<Compactified Conversation History>',
            `[${numToCompactify} older messages condensed for context efficiency]`,
            ''
        ];
        
        for (const msg of oldMessages) {
            try {
                // Extract role label
                const roleLabel = msg.role === 'assistant' ? 'assistant (you)' : msg.role === 'user' ? 'User' : msg.role;
                
                // Extract and process message content
                let messageText = '';
                
                if (typeof msg.content === 'string') {
                    messageText = msg.content;
                } else if (Array.isArray(msg.content)) {
                    // Handle multi-modal content
                    const textParts = msg.content
                        .filter(item => item.type === 'text')
                        .map(item => item.text)
                        .join(' ');
                    
                    const imageCount = msg.content.filter(item => item.type === 'image_url').length;
                    
                    messageText = textParts;
                    if (imageCount > 0) {
                        messageText += ` [${imageCount} image(s) attached]`;
                    }
                } else if (msg.content === null || msg.content === undefined) {
                    // Handle tool calls or empty messages
                    if (msg.tool_calls && msg.tool_calls.length > 0) {
                        const toolNames = msg.tool_calls
                            .map(tc => {
                                // Safe accessor for different OpenAI SDK versions
                                const func = (tc as any).function;
                                return func?.name || 'unknown_tool';
                            })
                            .join(', ');
                        messageText = `[Used tools: ${toolNames}]`;
                    } else {
                        messageText = '[Empty message]';
                    }
                }
                
                // Strip system context tags from the message
                messageText = this.stripSystemContext(messageText);
                
                // Truncate if exceeds max length
                if (messageText.length > MAX_MESSAGE_LENGTH) {
                    messageText = messageText.substring(0, MAX_MESSAGE_LENGTH) + '...';
                }
                
                // Clean up whitespace and newlines for compactness
                messageText = messageText
                    .replace(/\n+/g, ' ')  // Replace newlines with spaces
                    .replace(/\s+/g, ' ')   // Collapse multiple spaces
                    .trim();
                
                // Add to compactified history
                if (messageText) {
                    compactifiedLines.push(`${roleLabel}: ${messageText}`);
                }
            } catch (error) {
                // Gracefully handle any malformed messages
                console.warn('Failed to process message during compactification:', error);
                compactifiedLines.push(`[Message processing error]`);
            }
        }
        
            compactifiedLines.push('');
            compactifiedLines.push('---');
            compactifiedLines.push('[Recent conversation continues below in full detail...]');
            
            // Create the compactified summary message
            const compactifiedMessage: ConversationMessage = {
                role: 'user' as MessageRole,
                content: compactifiedLines.join('\n'),
                conversationId: `compactified-${Date.now()}`
            };
            
            // Return compactified message + recent full messages
            return [compactifiedMessage, ...recentMessages];
        } catch (error) {
            // If compactification fails, fall back to returning original messages
            // or a safe subset to prevent complete failure
            console.error('Error during context compactification:', error);
            
            // Safe fallback: return recent messages only if above threshold
            const COMPACTION_THRESHOLD = Math.floor(0.8 * MAX_LLM_MESSAGES);
            if (messages.length >= COMPACTION_THRESHOLD) {
                const safeSubset = Math.ceil(messages.length * 0.4);
                console.warn(`Compactification failed, returning last ${safeSubset} messages as fallback`);
                return messages.slice(-safeSubset);
            }
            
            // Below threshold, return all messages
            return messages;
        }
    }


    async execute(inputs: UserConversationInputs, options: OperationOptions): Promise<UserConversationOutputs> {
        const { env, logger, context, agent } = options;
        const { userMessage, pastMessages, errors, images, projectUpdates } = inputs;
        logger.info("Processing user message", { 
            messageLength: inputs.userMessage.length,
            hasImages: !!images && images.length > 0,
            imageCount: images?.length || 0
        });

        try {
            const systemPromptMessages = getSystemPromptWithProjectContext(SYSTEM_PROMPT, context, CodeSerializerType.SIMPLE);
            
            // Create user message with optional images for inference
            const userPromptForInference = buildUserMessageWithContext(userMessage, errors, projectUpdates, true);
            const userMessageForInference = images && images.length > 0
                ? createMultiModalUserMessage(
                    userPromptForInference,
                    images.map(img => `data:${img.mimeType};base64,${img.base64Data}`),
                    'high'
                )
                : createUserMessage(userPromptForInference);
            
            // For conversation history, store only text (images are ephemeral and not persisted)
            const userPromptForHistory = buildUserMessageWithContext(userMessage, errors, projectUpdates, false);
            const userMessageForHistory = images && images.length > 0
                ? createUserMessage(`${userPromptForHistory}\n\n[${images.length} image(s) attached]`)
                : createUserMessage(userPromptForHistory);
            
            const messages = [...pastMessages, {...userMessageForHistory, conversationId: IdGenerator.generateConversationId()}];

            let extractedUserResponse = "";
            
            // Generate unique conversation ID for this turn
            const aiConversationId = IdGenerator.generateConversationId();

            logger.info("Generated conversation ID", { aiConversationId });
            
            // Assemble all tools with lifecycle callbacks for UI updates
            const tools: ToolDefinition<any, any>[] = [
                ...buildTools(agent, logger)
            ].map(td => ({
                ...td,
                onStart: (args: any) => inputs.conversationResponseCallback(
                    '',
                    aiConversationId,
                    false,
                    { name: td.function.name, status: 'start', args: args as Record<string, unknown> }
                ),
                onComplete: (args: any, _result: any) => inputs.conversationResponseCallback(
                    '',
                    aiConversationId,
                    false,
                    { name: td.function.name, status: 'success', args: args as Record<string, unknown> }
                )
            }));

            const compactifiedMessages = await this.compactifyContext(pastMessages);
            if (compactifiedMessages.length !== pastMessages.length) {
                const numCompactified = pastMessages.length - (compactifiedMessages.length - 1); // -1 for the compactified summary message
                logger.warn("Compactified conversation history to stay within token limit", { 
                    originalLength: pastMessages.length,
                    compactifiedLength: compactifiedMessages.length,
                    numOldMessagesCompacted: numCompactified,
                    threshold: `${Math.floor(0.8 * MAX_LLM_MESSAGES)} messages`
                });
            }

            logger.info("Executing inference for user message", { 
                messageLength: userMessage.length,
                aiConversationId,
                compactifiedMessages,
                tools
            });
            
            // Don't save the system prompts so that every time new initial prompts can be generated with latest project context
            // Use inference message (with images) for AI, but store text-only in history
            const result = await executeInference({
                env: env,
                messages: [...systemPromptMessages, ...compactifiedMessages, {...userMessageForInference, conversationId: IdGenerator.generateConversationId()}],
                agentActionName: "conversationalResponse",
                context: options.inferenceContext,
                tools, // Enable tools for the conversational AI
                stream: {
                    onChunk: (chunk) => {
                        logger.info("Processing user message chunk", { chunkLength: chunk.length, aiConversationId });
                        inputs.conversationResponseCallback(chunk, aiConversationId, true);
                        extractedUserResponse += chunk;
                    },
                    chunk_size: CHUNK_SIZE
                }
            });

            
            logger.info("Successfully processed user message", {
                streamingSuccess: !!extractedUserResponse,
            });

            const conversationResponse: ConversationalResponseType = {
                userResponse: extractedUserResponse
            };

            // Save the assistant's response to conversation history
            // If tools were called, include the tool call messages from toolCallContext
            if (result.toolCallContext?.messages && result.toolCallContext.messages.length > 0) {
                messages.push(
                    ...result.toolCallContext.messages
                        .filter((message) => !(message.role === 'assistant' && typeof(message.content) === 'string' && message.content.includes('Internal Memo')))
                        .map((message) => ({ ...message, conversationId: IdGenerator.generateConversationId() }))
                );
            }
            messages.push({...createAssistantMessage(result.string), conversationId: IdGenerator.generateConversationId()});

            logger.info("Current conversation history", { messages });
            return {
                conversationResponse,
                messages: messages
            };
        } catch (error) {
            logger.error("Error processing user message:", error);
            if (error instanceof RateLimitExceededError || error instanceof SecurityError) {
                throw error;
            }   
            
            // Fallback response
            return {
                conversationResponse: {
                    userResponse: FALLBACK_USER_RESPONSE
                },
                messages: [
                    ...pastMessages,
                    {...createUserMessage(userMessage), conversationId: IdGenerator.generateConversationId()},
                    {...createAssistantMessage(FALLBACK_USER_RESPONSE), conversationId: IdGenerator.generateConversationId()}
                ]
            };
        }
    }

    processProjectUpdates<T extends ProjectUpdateType>(updateType: T, _data: WebSocketMessageData<T>, logger: StructuredLogger) : ConversationMessage[] {
        try {
            logger.info("Processing project update", { updateType });

            // Just save it as an assistant message. Dont save data for now to avoid DO size issues
            const preparedMessage = `**<Internal Memo>**
Project Updates: ${updateType}
</Internal Memo>`;

            return [{
                role: 'assistant',
                content: preparedMessage,
                conversationId: IdGenerator.generateConversationId()
            }];
        } catch (error) {
            logger.error("Error processing project update:", error);
            return [];
        }
    }

    isProjectUpdateType(type: any): type is ProjectUpdateType {
        return RelevantProjectUpdateWebsoketMessages.includes(type);
    }
}