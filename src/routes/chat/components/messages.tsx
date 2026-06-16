import { AIAvatar } from '../../../components/icons/logos';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeExternalLinks from 'rehype-external-links';
import { NO_IMAGE_MARKDOWN_COMPONENTS } from './markdown-components';
import { LoaderCircle, Check, AlertTriangle, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import type { ToolEvent } from '../utils/message-helpers';
import type { ConversationMessage } from '@/api-types';
import { useState, useEffect, useRef } from 'react';
import { DebugSessionBubble } from './debug-session-bubble';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

/**
 * Strip internal system tags that should not be displayed to users
 */
function sanitizeMessageForDisplay(message: string): string {
	// Remove <system_context>...</system_context> tags and their content
	return message.replace(/<system_context>[\s\S]*?<\/system_context>\n/gi, '').trim();
}

export function UserMessage({ message }: { message: string }) {
	const sanitizedMessage = sanitizeMessageForDisplay(message);
	
	return (
		<div className="flex gap-3">
			<div className="align-text-top pl-1">
				<div className="size-6 flex items-center justify-center rounded-full bg-accent text-text-on-brand">
					<span className="text-xs">U</span>
				</div>
			</div>
			<div className="flex flex-col gap-2 min-w-0">
				<div className="font-medium text-text-50">You</div>
				<Markdown className="text-text-primary/80">{sanitizedMessage}</Markdown>
			</div>
		</div>
	);
}

type ContentItem = 
	| { type: 'text'; content: string; key: string }
	| { type: 'tool'; event: ToolEvent; key: string };

function JsonRenderer({ data }: { data: unknown }) {
	if (typeof data !== 'object' || data === null) {
		return <span className="text-text-primary whitespace-pre-wrap">{String(data)}</span>;
	}

	return (
		<div className="flex flex-col gap-1">
			{Object.entries(data).map(([key, value]) => (
				<div key={key} className="flex gap-2">
					<span className="text-accent font-medium flex-shrink-0">{key}:</span>
					{typeof value === 'object' && value !== null ? (
						<div className="flex-1">
							<JsonRenderer data={value} />
						</div>
					) : (
						<span className="text-text-primary flex-1 whitespace-pre-wrap break-words">
							{String(value)}
						</span>
					)}
				</div>
			))}
		</div>
	);
}

function extractTextContent(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map(item => item.type === 'text' ? item.text : '')
			.join('');
	}
	return '';
}

function convertToToolEvent(msg: ConversationMessage, idx: number): ToolEvent | null {
	if (msg.role !== 'tool' || !('name' in msg) || !msg.name) return null;
	
	return {
		name: msg.name,
		status: 'success',
		timestamp: Date.now() + idx,
		result: extractTextContent(msg.content),
	};
}

export function MessageContentRenderer({ 
	content, 
	toolEvents = [],
	richToolPreview = false,
}: { 
	content: string;
	toolEvents?: ToolEvent[];
	richToolPreview?: boolean;
}) {
	const inlineToolEvents = toolEvents.filter(ev => ev.contentLength !== undefined)
		.sort((a, b) => (a.contentLength ?? 0) - (b.contentLength ?? 0));
	
	const orderedContent = buildOrderedContent(content, inlineToolEvents);
	
	if (orderedContent.length === 0) return null;
	
	return (
		<div className="flex flex-col gap-2">
			{orderedContent.map((item) => (
				item.type === 'text' ? (
					<Markdown key={item.key} className="a-tag">
						{item.content}
					</Markdown>
				) : (
					<div key={item.key} className="my-1">
						<ToolStatusIndicator event={item.event} richToolPreview={richToolPreview} />
					</div>
				)
			))}
		</div>
	);
}

/** Does the tool event have inspectable input (`args`)? */
function hasToolInput(event: ToolEvent): boolean {
	return !!event.args && Object.keys(event.args).length > 0;
}

/** Does the tool event have inspectable output (`result`)? */
function hasToolOutput(event: ToolEvent): boolean {
	return event.status === 'success' && !!event.result;
}

/**
 * Short, hover-only preview of a tool event's Input and Output, used
 * for think-agent tools where rich previews are enabled. Truncates long
 * values so the popover stays compact — full content is reachable via
 * click-to-expand below the trigger.
 */
function ToolEventHoverPreview({ event }: { event: ToolEvent }) {
	const inputPreview = event.args ? truncateInline(safeStringifyArgs(event.args)) : null;
	const outputPreview = event.result ? truncateInline(event.result) : null;
	return (
		<div className="flex flex-col gap-2 text-xs">
			<div className="font-mono font-medium text-text-secondary">{event.name}</div>
			{inputPreview && (
				<div className="flex flex-col gap-1">
					<span className="text-accent font-medium">Input</span>
					<span className="text-text-primary whitespace-pre-wrap break-words">{inputPreview}</span>
				</div>
			)}
			{outputPreview && (
				<div className="flex flex-col gap-1">
					<span className="text-accent font-medium">Output</span>
					<span className="text-text-primary whitespace-pre-wrap break-words">{outputPreview}</span>
				</div>
			)}
			{(inputPreview || outputPreview) && (
				<div className="text-text-tertiary italic">Click to expand</div>
			)}
		</div>
	);
}

/**
 * Full expanded panel rendered when the user clicks the chevron on a
 * rich-preview tool widget. Reuses `JsonRenderer` for input and the
 * existing `ToolResultRenderer` for output so both follow the codebase
 * conventions for structured data.
 */
function ToolEventExpandedPanel({ event }: { event: ToolEvent }) {
	const showInput = hasToolInput(event);
	const showOutput = hasToolOutput(event);
	if (!showInput && !showOutput) return null;
	return (
		<div className="flex flex-col gap-3">
			{showInput && (
				<div className="flex flex-col gap-1">
					<div className="text-[10px] uppercase tracking-wide text-text-tertiary">Input</div>
					<JsonRenderer data={event.args} />
				</div>
			)}
			{showOutput && (
				<div className="flex flex-col gap-1">
					<div className="text-[10px] uppercase tracking-wide text-text-tertiary">Output</div>
					<ToolResultRenderer result={event.result!} toolName={event.name} />
				</div>
			)}
		</div>
	);
}

/**
 * Best-effort JSON serialize for hover previews. Falls back to an
 * empty object on failure so the preview just renders nothing for
 * that section instead of crashing.
 */
function safeStringifyArgs(args: Record<string, unknown>): string {
	try {
		return JSON.stringify(args, null, 2);
	} catch {
		return '';
	}
}

/** Clamp long strings so hover previews stay compact. */
function truncateInline(s: string, limit = 220): string {
	if (s.length <= limit) return s;
	return `${s.slice(0, limit)}…`;
}

function DeepDebugTranscript({ transcript }: { transcript: ConversationMessage[] }) {
	// Build map of tool results by tool_call_id for matching
	const toolResultsMap = new Map<string, ToolEvent>();
	transcript.forEach((msg, idx) => {
		if (msg.role === 'tool' && 'tool_call_id' in msg) {
			const toolCallId = (msg as { tool_call_id?: string }).tool_call_id;
			if (toolCallId && typeof toolCallId === 'string') {
				const toolEvent = convertToToolEvent(msg, idx);
				if (toolEvent) toolResultsMap.set(toolCallId, toolEvent);
			}
		}
	});
	
	return (
		<div className="flex flex-col gap-3 p-3 rounded-md bg-surface-tertiary/50 border-l-2 border-accent/30">
			<div className="flex items-center gap-2 text-xs font-medium text-accent">
				<MessageSquare className="size-3" />
				<span>Deep Debugger Transcript</span>
			</div>
			{transcript.map((msg, idx) => {
				if (msg.role === 'tool') return null; // Tool results rendered with assistant messages
				
				const text = extractTextContent(msg.content);
				if (!text) return null;
				
				if (msg.role === 'assistant') {
					// Match tool_calls with their results
					const toolEvents: ToolEvent[] = msg.tool_calls?.map(tc => {
						const funcName = 'function' in tc ? tc.function.name : 'unknown_tool';
						const matchedResult = toolResultsMap.get(tc.id);
						return matchedResult || {
							name: funcName,
							status: 'start' as const,
							timestamp: Date.now() + idx,
							contentLength: 0,
						};
					}) || [];
					
					return (
						<div key={`${msg.conversationId}-${idx}`} className="text-xs">
							<MessageContentRenderer content={text} toolEvents={toolEvents} />
						</div>
					);
				}
				
				return null;
			})}
		</div>
	);
}

function ToolResultRenderer({ result, toolName }: { result: string; toolName: string }) {
	try {
		const parsed = JSON.parse(result);
		
		// Special handling for deep_debug transcript
		if (toolName === 'deep_debug' && Array.isArray(parsed.transcript)) {
			return <DeepDebugTranscript transcript={parsed.transcript} />;
		}
		
		return <JsonRenderer data={parsed} />;
	} catch {
		return <div className="whitespace-pre-wrap break-words">{result}</div>;
	}
}

export function ToolStatusIndicator({ event, richToolPreview = false }: { event: ToolEvent; richToolPreview?: boolean }) {
	const [isExpanded, setIsExpanded] = useState(false);
	const hasResult = event.status === 'success' && !!event.result;
	const isDeepDebug = event.name === 'deep_debug';

	// Rich preview (think only): allow expanding when *either* args
	// or result is present, and show a hover-card peek of both.
	// Default (phasic/agentic): click-to-expand requires a result; no
	// hover-card. This preserves today's exact UX outside think.
	const showInputSection = richToolPreview && hasToolInput(event);
	const canExpand = richToolPreview ? (showInputSection || hasResult) : hasResult;

	const statusText = event.status === 'start' ? 'Running' :
	                   event.status === 'success' ? 'Completed' :
	                   'Error';

	const StatusIcon = event.status === 'start' ? LoaderCircle :
	                   event.status === 'success' ? Check :
	                   AlertTriangle;

	const iconClass = event.status === 'start' ? 'size-3 animate-spin' : 'size-3';

	const button = (
		<button
			onClick={() => canExpand && setIsExpanded(!isExpanded)}
			className={clsx(
				'flex items-center gap-1.5 text-xs',
				isDeepDebug ? 'text-accent font-medium' : 'text-text-tertiary',
				canExpand && 'cursor-pointer hover:text-text-secondary transition-colors'
			)}
			disabled={!canExpand}
		>
			<StatusIcon className={iconClass} />
			<span className="font-mono tracking-tight">
				{statusText} {event.name}
			</span>
			{canExpand && (
				isExpanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />
			)}
		</button>
	);

	const trigger = richToolPreview && canExpand ? (
		<HoverCard openDelay={150} closeDelay={75}>
			<HoverCardTrigger asChild>{button}</HoverCardTrigger>
			<HoverCardContent align="start" className="w-80">
				<ToolEventHoverPreview event={event} />
			</HoverCardContent>
		</HoverCard>
	) : button;

	return (
		<div className="flex flex-col gap-2">
			{trigger}

			{isExpanded && canExpand && (
				<div className={clsx(
					'p-3 rounded-md text-xs font-mono border overflow-auto',
					isDeepDebug
						? 'bg-surface-tertiary/30 border-accent/20 max-h-[600px]'
						: 'bg-surface-secondary border-border max-h-96'
				)}>
					{richToolPreview ? (
						<ToolEventExpandedPanel event={event} />
					) : (
						event.result && <ToolResultRenderer result={event.result} toolName={event.name} />
					)}
				</div>
			)}
		</div>
	);
}

function buildOrderedContent(message: string, inlineToolEvents: ToolEvent[]): ContentItem[] {
	if (!inlineToolEvents.length) {
		return message ? [{ type: 'text', content: message, key: 'content-0' }] : [];
	}

	const items: ContentItem[] = [];
	let lastPos = 0;
	
	for (const event of inlineToolEvents) {
		const pos = event.contentLength ?? 0;
		
		// Add text before this event
		if (pos > lastPos && message.slice(lastPos, pos)) {
			items.push({ type: 'text', content: message.slice(lastPos, pos), key: `text-${lastPos}` });
		}
		
		// Add event
		items.push({ type: 'tool', event, key: `tool-${event.timestamp}` });
		lastPos = pos;
	}
	
	// Add remaining text
	if (lastPos < message.length && message.slice(lastPos)) {
		items.push({ type: 'text', content: message.slice(lastPos), key: `text-${lastPos}` });
	}
	
	return items;
}

export function AIMessage({
	message,
	isThinking,
	toolEvents = [],
	richToolPreview = false,
}: {
	message: string;
	isThinking?: boolean;
	toolEvents?: ToolEvent[];
	/**
	 * Enables the think-only tool widget UX (hover preview of
	 * Input/Output + click-expand panel with both sections). Defaults
	 * to `false` so phasic/agentic tool rendering stays untouched.
	 */
	richToolPreview?: boolean;
}) {
	const sanitizedMessage = sanitizeMessageForDisplay(message);
	
	// Check if this is a debug session (active or just completed in this session)
	const debugEvent = toolEvents.find(ev => ev.name === 'deep_debug');
	const isActiveDebug = debugEvent?.status === 'start';
	const isCompletedDebug = debugEvent?.status === 'success' || debugEvent?.status === 'error';
	
	// Check if this is a live session with actual content
	const hasInlineEvents = toolEvents.some(ev => ev.contentLength !== undefined);
	const hasToolCalls = toolEvents.some(ev => ev.name !== 'deep_debug');
	
	// Only show bubble if: actively debugging OR (completed/errored with actual content/tool calls and inline events)
	const isLiveDebugSession = debugEvent && (
		isActiveDebug || 
		(isCompletedDebug && hasInlineEvents && hasToolCalls)
	);
	
	// Calculate elapsed time for active debug sessions
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const startTimeRef = useRef<number | null>(null);
	
	useEffect(() => {
		if (!isActiveDebug) {
			startTimeRef.current = null;
			setElapsedSeconds(0);
			return;
		}
		
		if (!startTimeRef.current) {
			startTimeRef.current = Date.now();
		}
		
		const interval = setInterval(() => {
			if (startTimeRef.current) {
				const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
				setElapsedSeconds(elapsed);
			}
		}, 1000);
		
		return () => clearInterval(interval);
	}, [isActiveDebug]);
	
	// Render debug bubble for live debug sessions (active or just completed)
	// Don't show for old messages after page refresh (no inline events)
	if (isLiveDebugSession) {
		const toolCallCount = toolEvents.filter(e => e.name !== 'deep_debug').length;
		
		return (
			<DebugSessionBubble
				message={{
					conversationId: 'debug-session',
					role: 'assistant' as const,
					content: sanitizedMessage,
					ui: { toolEvents }
				}}
				isActive={isActiveDebug}
				elapsedSeconds={elapsedSeconds}
				toolCallCount={toolCallCount}
			/>
		);
	}
	
	// Separate: events without contentLength = top (restored), with contentLength = inline (streaming)
	const topToolEvents = toolEvents.filter(ev => ev.contentLength === undefined);
	const inlineToolEvents = toolEvents.filter(ev => ev.contentLength !== undefined)
		.sort((a, b) => (a.contentLength ?? 0) - (b.contentLength ?? 0));
	
	const orderedContent = buildOrderedContent(sanitizedMessage, inlineToolEvents);
	
	// Don't render if completely empty
	if (!sanitizedMessage && !topToolEvents.length && !orderedContent.length) {
		return null;
	}
	
	return (
		<div className="flex gap-3">
			<div className="align-text-top pl-1">
				<AIAvatar className="size-6 text-orange-500" />
			</div>
			<div className="flex flex-col gap-2 min-w-0">
				<div className="font-mono font-medium text-text-50">Orange</div>
				
				{/* Message content with inline tool events (from streaming) */}
				{orderedContent.length > 0 && (
					<div className={clsx(isThinking && 'animate-pulse')}>
						<MessageContentRenderer content={sanitizedMessage} toolEvents={inlineToolEvents} richToolPreview={richToolPreview} />
					</div>
				)}
				
				{/* Completed tools (from restoration) - shown at end */}
				{topToolEvents.length > 0 && (
					<div className="flex flex-col gap-1.5 mt-1">
						{topToolEvents.map((ev) => (
							<ToolStatusIndicator key={`${ev.name}-${ev.timestamp}`} event={ev} richToolPreview={richToolPreview} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}

interface MarkdownProps extends React.ComponentProps<'article'> {
	children: string;
}

export function Markdown({ children, className, ...props }: MarkdownProps) {
	return (
		<article
			className={clsx('prose prose-sm prose-teal', className)}
			{...props}
		>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[[rehypeExternalLinks, { target: '_blank' }]]}
				components={NO_IMAGE_MARKDOWN_COMPONENTS}
			>
				{children}
			</ReactMarkdown>
		</article>
	);
}
