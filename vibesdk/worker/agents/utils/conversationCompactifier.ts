import { ConversationMessage, MessageRole, createUserMessage } from "../inferutils/common";
import { executeInference } from "../inferutils/infer";
import { StructuredLogger } from "../../logger";
import { IdGenerator } from './idGenerator';
import { OperationOptions } from "../operations/common";
import type { ChatCompletionMessageFunctionToolCall } from 'openai/resources';

/**
 * Compactification configuration constants
 */
export const COMPACTIFICATION_CONFIG = {
    MAX_TURNS: 40,            // Trigger after 40 conversation turns
    MAX_ESTIMATED_TOKENS: 100000,
    PRESERVE_RECENT_MESSAGES: 10, // Always keep last 10 messages uncompacted
    CHARS_PER_TOKEN: 4,         // Rough estimation: 1 token ≈ 4 characters
} as const;

/**
 * Tool call renderer type for UI feedback during compactification
 * Compatible with RenderToolCall from UserConversationProcessor
 */
export type CompactificationRenderer = (args: {
    name: string;
    status: 'start' | 'success' | 'error';
    args?: Record<string, unknown>;
    result?: string;
}) => void;

/**
 * Count conversation turns (user message to next user message)
 */
function countTurns(messages: ConversationMessage[]): number {
    return messages.filter(m => m.role === 'user').length;
}

/**
 * Convert character count to estimated token count
 */
function tokensFromChars(chars: number): number {
    return Math.ceil(chars / COMPACTIFICATION_CONFIG.CHARS_PER_TOKEN);
}

/**
 * Remove system context tags from message content
 */
function stripSystemContext(text: string): string {
    return text.replace(/<system_context>[\s\S]*?<\/system_context>\n?/gi, '').trim();
}

/**
 * Estimate token count for messages (4 chars ≈ 1 token)
 */
function estimateTokens(messages: ConversationMessage[]): number {
    let totalChars = 0;

    for (const msg of messages) {
        if (typeof msg.content === 'string') {
            totalChars += msg.content.length;
        } else if (Array.isArray(msg.content)) {
            // Multi-modal content
            for (const part of msg.content) {
                if (part.type === 'text') {
                    totalChars += part.text.length;
                } else if (part.type === 'image_url') {
                    // Images use ~1000 tokens each (approximate)
                    totalChars += 4000;
                }
            }
        }

        // Account for tool calls
        if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
            for (const tc of msg.tool_calls as ChatCompletionMessageFunctionToolCall[]) {
                // Function name
                if (tc.function?.name) {
                    totalChars += tc.function.name.length;
                }
                // Function arguments (JSON string)
                if (tc.function?.arguments) {
                    totalChars += tc.function.arguments.length;
                }
                // Tool call structure overhead (id, type, etc.) - rough estimate
                totalChars += 50;
            }
        }
    }

    return tokensFromChars(totalChars);
}

/**
 * Check if compactification should be triggered
 */
export function shouldCompactify(messages: ConversationMessage[]): {
    should: boolean;
    reason?: 'turns' | 'tokens';
    turns: number;
    estimatedTokens: number;
} {
    const turns = countTurns(messages);
    const estimatedTokens = estimateTokens(messages);

    console.log(`[ConversationCompactifier] shouldCompactify: turns=${turns}, estimatedTokens=${estimatedTokens}`);

    if (turns >= COMPACTIFICATION_CONFIG.MAX_TURNS) {
        return { should: true, reason: 'turns', turns, estimatedTokens };
    }

    if (estimatedTokens >= COMPACTIFICATION_CONFIG.MAX_ESTIMATED_TOKENS) {
        return { should: true, reason: 'tokens', turns, estimatedTokens };
    }

    return { should: false, turns, estimatedTokens };
}

/**
 * Find the last valid turn boundary before the preserve threshold
 * A turn boundary is right before a user message
 */
function findTurnBoundary(messages: ConversationMessage[], preserveCount: number): number {
    // Start from the point where we want to split
    const targetSplitIndex = messages.length - preserveCount;

    if (targetSplitIndex <= 0) {
        return 0;
    }

    // Walk backwards to find the nearest user message boundary
    for (let i = targetSplitIndex; i >= 0; i--) {
        if (messages[i].role === 'user') {
            // Split right before this user message to preserve turn integrity
            return i;
        }
    }

    // If no user message found, don't split
    return 0;
}

/**
 * Generate LLM-powered conversation summary
 * Sends the full conversation history as-is to the LLM with a summarization instruction
 */
async function generateConversationSummary(
    messages: ConversationMessage[],
    env: Env,
    options: OperationOptions,
    logger: StructuredLogger
): Promise<string> {
    try {
        // Prepare summarization instruction
        const summarizationInstruction = createUserMessage(
            `Please provide a comprehensive summary of the entire conversation above. Your summary should:

1. Capture the key features, changes, and fixes discussed
2. Note any recurring issues or important bugs mentioned
3. Highlight the current state of the project
4. Preserve critical technical details and decisions made
5. Maintain chronological flow of major changes and developments

Format your summary as a cohesive, well-structured narrative. Focus on what matters for understanding the project's evolution and current state.

Provide the summary now:`
        );

        logger.info('Generating conversation summary via LLM', {
            messageCount: messages.length,
            estimatedInputTokens: estimateTokens(messages)
        });

        // Send full conversation history + summarization request
        const summaryResult = await executeInference({
            env,
            messages: [...messages, summarizationInstruction],
            agentActionName: 'conversationalResponse',
            context: options.inferenceContext,
        });

        const summary = summaryResult.string.trim();

        logger.info('Generated conversation summary', {
            summaryLength: summary.length,
            summaryTokens: tokensFromChars(summary.length)
        });

        return summary;
    } catch (error) {
        logger.error('Failed to generate conversation summary', { error });
        // Fallback to simple concatenation
        return messages
            .map(m => {
                const content = typeof m.content === 'string' ? m.content : '[complex content]';
                return `${m.role}: ${stripSystemContext(content).substring(0, 200)}`;
            })
            .join('\n')
            .substring(0, 2000);
    }
}

/**
 * Intelligent conversation compactification system
 *
 * Strategy:
 * - Monitors turns (user message to user message) and token count
 * - Triggers at 40 turns OR ~100k tokens
 * - Uses LLM to generate intelligent summary
 * - Preserves last 10 messages in full
 * - Respects turn boundaries to avoid tool call fragmentation
 */
export async function compactifyContext(
    runningHistory: ConversationMessage[],
    env: Env,
    options: OperationOptions,
    toolCallRenderer: CompactificationRenderer,
    logger: StructuredLogger
): Promise<ConversationMessage[]> {
    try {
        // Check if compactification is needed on the running history
        const analysis = shouldCompactify(runningHistory);

        if (!analysis.should) {
            // No compactification needed
            return runningHistory;
        }

        logger.info('Compactification triggered', {
            reason: analysis.reason,
            turns: analysis.turns,
            estimatedTokens: analysis.estimatedTokens,
            totalRunningMessages: runningHistory.length,
        });

        // Find turn boundary for splitting
        const splitIndex = findTurnBoundary(
            runningHistory,
            COMPACTIFICATION_CONFIG.PRESERVE_RECENT_MESSAGES
        );

        // Safety check: ensure we have something to compactify
        if (splitIndex <= 0) {
            logger.warn('Cannot find valid turn boundary for compactification, preserving all messages');
            return runningHistory;
        }

        // Split messages
        const messagesToSummarize = runningHistory.slice(0, splitIndex);
        const recentMessages = runningHistory.slice(splitIndex);

        logger.info('Compactification split determined', {
            summarizeCount: messagesToSummarize.length,
            preserveCount: recentMessages.length,
            splitIndex
        });

        toolCallRenderer({
            name: 'summarize_history',
            status: 'start',
            args: {
                messageCount: messagesToSummarize.length,
                recentCount: recentMessages.length
            }
        });

        // Generate LLM-powered summary
        const summary = await generateConversationSummary(
            messagesToSummarize,
            env,
            options,
            logger
        );

        // Create summary message - its conversationId will be the archive ID
        const summarizedTurns = countTurns(messagesToSummarize);
        const archiveId = `archive-${Date.now()}-${IdGenerator.generateConversationId()}`;

        const summaryMessage: ConversationMessage = {
            role: 'assistant' as MessageRole,
            content: `[Conversation History Summary: ${messagesToSummarize.length} messages, ${summarizedTurns} turns]\n[Archive ID: ${archiveId}]\n\n${summary}`,
            conversationId: archiveId
        };

        toolCallRenderer({
            name: 'summarize_history',
            status: 'success',
            args: {
                summary: summary.substring(0, 200) + '...',
                archiveId
            }
        });

        // Return summary + recent messages
        const compactifiedHistory = [summaryMessage, ...recentMessages];

        logger.info('Compactification completed with archival', {
            originalMessageCount: runningHistory.length,
            newMessageCount: compactifiedHistory.length,
            compressionRatio: (compactifiedHistory.length / runningHistory.length).toFixed(2),
            estimatedTokenSavings: analysis.estimatedTokens - estimateTokens(compactifiedHistory),
            archivedMessageCount: messagesToSummarize.length,
            archiveId
        });

        return compactifiedHistory;

    } catch (error) {
        logger.error('Compactification failed, preserving original messages', { error });

        // Safe fallback: if we have too many messages, keep recent ones
        if (runningHistory.length > COMPACTIFICATION_CONFIG.PRESERVE_RECENT_MESSAGES * 3) {
            const fallbackCount = COMPACTIFICATION_CONFIG.PRESERVE_RECENT_MESSAGES * 2;
            logger.warn(`Applying emergency fallback: keeping last ${fallbackCount} messages`);
            return runningHistory.slice(-fallbackCount);
        }

        return runningHistory;
    }
}
