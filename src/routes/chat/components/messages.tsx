import { AIAvatar } from '../../../components/icons/logos';
import { cn } from '@cloudflare/kumo';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeExternalLinks from 'rehype-external-links';
import { NO_IMAGE_MARKDOWN_COMPONENTS } from './markdown-components';
import { LoaderCircle, Check, AlertTriangle, ChevronDown, ChevronRight, MessageSquare, Brain, Sparkles, HelpCircle, RotateCcw } from 'lucide-react';
import type { ToolEvent, MessagePart } from '../utils/message-helpers';
import { parseClarifyingQuestions } from '../utils/message-helpers';
import {
	getGroupStatus,
	getToolGroupSummary,
	getToolSummary,
} from '../utils/tool-display';
import { useRollback } from '../contexts/rollback-context';
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
		<div className="flex flex-col gap-2 min-w-0">
			<div className="flex items-center gap-2 mb-3">
				<div className="size-5 flex items-center justify-center rounded-full bg-brand text-white shrink-0">
					<span className="text-[10px]">U</span>
				</div>
				<div className="font-medium text-text-50">You</div>
			</div>
			<Markdown className="text-text-primary/80">{sanitizedMessage}</Markdown>
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
					<span className="text-kumo-brand font-medium flex-shrink-0">{key}:</span>
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
			<div className="font-medium text-text-secondary">{getToolSummary(event)}</div>
			{inputPreview && (
				<div className="flex flex-col gap-1">
					<span className="text-kumo-brand font-medium">Input</span>
					<span className="text-text-primary whitespace-pre-wrap break-words font-mono">{inputPreview}</span>
				</div>
			)}
			{outputPreview && (
				<div className="flex flex-col gap-1">
					<span className="text-kumo-brand font-medium">Output</span>
					<span className="text-text-primary whitespace-pre-wrap break-words font-mono">{outputPreview}</span>
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
					<ToolResultRenderer result={event.result!} toolName={event.name} event={event} />
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
		<div className="flex flex-col gap-3 p-3 rounded-md bg-surface-tertiary/50 border-l-2 border-brand/30">
			<div className="flex items-center gap-2 text-xs font-medium text-kumo-brand">
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

function ClarifyingQuestionsResult({ event }: { event: ToolEvent }) {
	const questions = parseClarifyingQuestions(event);
	if (questions.length === 0) return <JsonRenderer data={event.args ?? event.result} />;

	return (
		<div className="flex flex-col gap-3">
			{questions.map((q, i) => (
				<div key={i} className="flex flex-col gap-1.5">
					<div className="flex items-center gap-1.5 text-text-primary font-medium">
						<HelpCircle className="size-3.5 text-kumo-brand" />
						<span>{q.question}</span>
					</div>
					{q.options && q.options.length > 0 && (
						<div className="text-xs text-text-secondary pl-5">
							Options: {q.options.join(', ')}
						</div>
					)}
				</div>
			))}
		</div>
	);
}

function ToolResultRenderer({ result, toolName, event }: { result: string; toolName: string; event?: ToolEvent }) {
	try {
		const parsed = JSON.parse(result);

		// Special handling for deep_debug transcript
		if (toolName === 'deep_debug' && Array.isArray(parsed.transcript)) {
			return <DeepDebugTranscript transcript={parsed.transcript} />;
		}

		// Special handling for ask_questions clarifying questions
		if (toolName === 'ask_questions' && event) {
			return <ClarifyingQuestionsResult event={event} />;
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

	const StatusIcon = event.status === 'start' ? LoaderCircle :
	                   event.status === 'success' ? Check :
	                   AlertTriangle;

	const iconClass = event.status === 'start' ? 'size-3 animate-spin' : 'size-3';
	const summary = getToolSummary(event);

	const button = (
		<button
			onClick={() => canExpand && setIsExpanded(!isExpanded)}
			className={cn(
				'flex items-center gap-1.5 text-xs',
				isDeepDebug ? 'text-kumo-brand font-medium' : 'text-text-tertiary',
				canExpand && 'cursor-pointer hover:text-text-secondary transition-colors'
			)}
			disabled={!canExpand}
		>
			<StatusIcon className={iconClass} />
			<span className="tracking-tight">
				{summary}
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
				<div className={cn(
					'p-3 rounded-md text-xs font-mono border overflow-auto',
					isDeepDebug
						? 'bg-surface-tertiary/30 border-brand/20 max-h-[600px]'
						: 'bg-surface-secondary max-h-96'
				)}>
					{richToolPreview ? (
						<ToolEventExpandedPanel event={event} />
					) : (
						event.result && <ToolResultRenderer result={event.result} toolName={event.name} event={event} />
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

/** Trace parts (reasoning + tool) are the collapsible, out-of-band steps. */
type TracePart = Extract<MessagePart, { type: 'reasoning' } | { type: 'tool' }>;

function isTracePart(part: MessagePart): part is TracePart {
	return part.type === 'reasoning' || part.type === 'tool';
}

type RenderUnit =
	| { kind: 'text'; text: string; key: string }
	| { kind: 'trace'; items: TracePart[]; key: string };

/**
 * Walk an assistant turn's ordered parts and group contiguous reasoning/tool
 * steps into a single trace unit, flushing on each text block. This mirrors the
 * emission order exactly, so live and reloaded renders are identical.
 */
function bucketParts(parts: MessagePart[]): RenderUnit[] {
	const units: RenderUnit[] = [];
	let buffer: TracePart[] = [];
	let bufferStart = 0;

	const flush = () => {
		if (buffer.length === 0) return;
		units.push({ kind: 'trace', items: buffer, key: `trace-${bufferStart}` });
		buffer = [];
	};

	parts.forEach((part, i) => {
		if (isTracePart(part)) {
			if (buffer.length === 0) bufferStart = i;
			buffer.push(part);
			return;
		}
		const text = sanitizeMessageForDisplay(part.text);
		if (!text) return;
		flush();
		units.push({ kind: 'text', text, key: `text-${i}` });
	});
	flush();
	return units;
}

/** Tiny trailing status — spinner while live, nothing on success, soft mark on error. */
function ToolStatusMark({ status }: { status: ToolEvent['status'] }) {
	if (status === 'start') {
		return <LoaderCircle className="size-3 shrink-0 text-kumo-subtle animate-spin" />;
	}
	if (status === 'error') {
		return <span className="size-1.5 shrink-0 rounded-full bg-red-500/80" aria-hidden />;
	}
	return null;
}

/** Collapsible reasoning ("thinking") block. Opens while streaming. */
function ReasoningBlock({ part, streaming }: { part: Extract<MessagePart, { type: 'reasoning' }>; streaming: boolean }) {
	const active = streaming && !part.done;
	const [open, setOpen] = useState(active);
	const text = part.text.trim();
	if (!text) return null;

	return (
		<div className="rounded-lg border bg-surface-secondary/40">
			<button
				type="button"
				onClick={() => setOpen(o => !o)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left"
			>
				{active
					? <LoaderCircle className="size-3.5 shrink-0 text-kumo-brand animate-spin" />
					: <Brain className="size-3.5 shrink-0 text-text-tertiary" />}
				<span className={cn('flex-1 text-xs font-medium text-text-secondary', active && 'animate-pulse')}>
					{active ? 'Thinking' : 'Thoughts'}
				</span>
				<ChevronDown className={cn('size-3.5 shrink-0 text-text-tertiary transition-transform', open && 'rotate-180')} />
			</button>
			{open && (
				<div className="px-3 pb-3 max-h-96 overflow-y-auto text-xs text-text-tertiary">
					<Markdown className="a-tag">{text}</Markdown>
				</div>
			)}
		</div>
	);
}

/**
 * Extract a git commit sha from a successful `commit`/`deploy_space` tool
 * result, so the tool card can offer a rollback-to-this-commit control.
 */
function getRollbackCommitHash(event: ToolEvent): string | null {
	if (event.status !== 'success') return null;
	if (event.name !== 'commit' && event.name !== 'deploy_space') return null;
	if (!event.result) return null;
	try {
		const parsed = JSON.parse(event.result) as Record<string, unknown>;
		const hash = parsed.commit_hash;
		return typeof hash === 'string' && hash.length > 0 ? hash : null;
	} catch {
		return null;
	}
}

/** Inline "Rollback" control shown on commit/deploy tool cards. */
function RollbackButton({ commitHash }: { commitHash: string }) {
	const onRollback = useRollback();
	const [confirming, setConfirming] = useState(false);
	if (!onRollback) return null;

	if (confirming) {
		return (
			<span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
				<span className="text-[10px] text-text-tertiary">Roll back?</span>
				<button
					type="button"
					onClick={() => { onRollback(commitHash); setConfirming(false); }}
					className="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-500/10"
				>
					Confirm
				</button>
				<button
					type="button"
					onClick={() => setConfirming(false)}
					className="rounded px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary hover:bg-surface-tertiary/40"
				>
					Cancel
				</button>
			</span>
		);
	}

	return (
		<button
			type="button"
			onClick={e => { e.stopPropagation(); setConfirming(true); }}
			title={`Roll back to ${commitHash.slice(0, 8)}`}
			className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary hover:bg-surface-tertiary/40 hover:text-text-secondary"
		>
			<RotateCcw className="size-3 shrink-0" />
			Rollback
		</button>
	);
}

function toolEventCanExpand(event: ToolEvent): boolean {
	const hasInput = !!event.args && Object.keys(event.args).length > 0;
	const hasOutput = event.status !== 'start' && !!event.result;
	return hasInput || hasOutput;
}

/** Expanded Input/Output body — quiet indent, no heavy panel chrome. */
function ToolEventDetails({ event }: { event: ToolEvent }) {
	const hasInput = !!event.args && Object.keys(event.args).length > 0;
	const hasOutput = event.status !== 'start' && !!event.result;
	if (!hasInput && !hasOutput) return null;
	return (
		<div className="mt-1.5 mb-1 ml-0.5 border-l border-kumo-line/60 pl-3 flex flex-col gap-2.5 text-[11px] font-mono max-h-72 overflow-auto text-kumo-subtle">
			{hasInput && (
				<div className="flex flex-col gap-0.5 min-w-0">
					<div className="text-[10px] uppercase tracking-wider text-kumo-subtle/70">Input</div>
					<div className="text-kumo-subtle">
						<JsonRenderer data={event.args} />
					</div>
				</div>
			)}
			{hasOutput && (
				<div className="flex flex-col gap-0.5 min-w-0">
					<div className="text-[10px] uppercase tracking-wider text-kumo-subtle/70">Output</div>
					<div className="text-kumo-subtle">
						<ToolResultRenderer result={event.result!} toolName={event.name} event={event} />
					</div>
				</div>
			)}
		</div>
	);
}

/**
 * Single tool row: plain-English label, no box. Click expands details.
 * Nested rows (inside a group) are slightly indented.
 */
function ToolCard({ event, nested = false }: { event: ToolEvent; nested?: boolean }) {
	const [open, setOpen] = useState(false);
	const isRunning = event.status === 'start';
	const canExpand = !isRunning && toolEventCanExpand(event);
	const rollbackHash = getRollbackCommitHash(event);
	const summary = getToolSummary(event);

	return (
		<div className={cn(nested && 'pl-2')}>
			<div className="group/tool flex items-center gap-1.5 min-h-7">
				<button
					type="button"
					onClick={() => canExpand && setOpen((o) => !o)}
					disabled={!canExpand}
					className={cn(
						'flex flex-1 min-w-0 items-center gap-1.5 text-left rounded-sm py-1',
						canExpand && 'cursor-pointer hover:text-kumo-default',
						!canExpand && 'cursor-default',
					)}
				>
					<span
						className={cn(
							'min-w-0 truncate text-[13px] leading-snug text-kumo-subtle',
							isRunning && 'animate-pulse',
							event.status === 'error' && 'text-red-500/90',
						)}
					>
						{summary}
					</span>
					{canExpand && (
						<ChevronRight
							className={cn(
								'size-3 shrink-0 text-kumo-subtle/50 transition-transform duration-150',
								open && 'rotate-90',
								'opacity-0 group-hover/tool:opacity-100',
								open && 'opacity-100',
							)}
						/>
					)}
					<ToolStatusMark status={event.status} />
				</button>
				{rollbackHash && <RollbackButton commitHash={rollbackHash} />}
			</div>
			{open && canExpand && <ToolEventDetails event={event} />}
		</div>
	);
}

/**
 * Consecutive same-name tools collapse to one line; expand reveals
 * individual rows (each still expandable for Input/Output).
 */
function ToolGroupCard({ events }: { events: ToolEvent[] }) {
	const [open, setOpen] = useState(false);
	const status = getGroupStatus(events);
	const summary = getToolGroupSummary(events);
	const isRunning = status === 'start';

	if (events.length === 1) {
		return <ToolCard event={events[0]} />;
	}

	return (
		<div>
			<button
				type="button"
				onClick={() => !isRunning && setOpen((o) => !o)}
				disabled={isRunning}
				className={cn(
					'group/tool flex w-full items-center gap-1.5 min-h-7 text-left rounded-sm py-1',
					isRunning ? 'cursor-default' : 'cursor-pointer hover:text-kumo-default',
				)}
			>
				<span
					className={cn(
						'min-w-0 truncate text-[13px] leading-snug text-kumo-subtle',
						isRunning && 'animate-pulse',
						status === 'error' && 'text-red-500/90',
					)}
				>
					{summary}
				</span>
				<span className="text-[11px] tabular-nums text-kumo-subtle/50 shrink-0">
					{events.length}
				</span>
				{!isRunning && (
					<ChevronRight
						className={cn(
							'size-3 shrink-0 text-kumo-subtle/50 transition-transform duration-150',
							open && 'rotate-90',
							'opacity-60 group-hover/tool:opacity-100',
						)}
					/>
				)}
				<ToolStatusMark status={status} />
			</button>
			{open && !isRunning && (
				<div className="mt-1 ml-0.5 border-l border-kumo-line/50 pl-2.5 flex flex-col gap-1">
					{events.map((event, i) => (
						<ToolCard key={event.id ?? `g-${event.name}-${i}`} event={event} nested />
					))}
				</div>
			)}
		</div>
	);
}

type TraceRenderItem =
	| { kind: 'reasoning'; part: Extract<MessagePart, { type: 'reasoning' }>; key: string; streaming: boolean }
	| { kind: 'tools'; events: ToolEvent[]; key: string };

/**
 * Collapse contiguous same-name tools, but only once finished.
 * In-flight tools stay as individual rows ("Writing foo…") so the
 * group count doesn't flicker as each write starts. Completed runs
 * ahead of a still-running tool collapse progressively
 * ("Wrote 3 files" + "Writing bar…").
 */
function collapseTraceItems(items: TracePart[], streaming: boolean): TraceRenderItem[] {
	const out: TraceRenderItem[] = [];
	let i = 0;
	while (i < items.length) {
		const item = items[i];
		if (item.type === 'reasoning') {
			out.push({
				kind: 'reasoning',
				part: item,
				key: `r-${i}`,
				streaming: streaming && i === items.length - 1,
			});
			i += 1;
			continue;
		}
		const name = item.event.name;
		const events: ToolEvent[] = [item.event];
		const start = i;
		i += 1;
		while (i < items.length) {
			const next = items[i];
			if (next.type !== 'tool' || next.event.name !== name) break;
			events.push(next.event);
			i += 1;
		}

		// Split the same-name run: finished stretches may group; running stays solo.
		let j = 0;
		while (j < events.length) {
			const abs = start + j;
			if (events[j].status === 'start') {
				out.push({
					kind: 'tools',
					events: [events[j]],
					key: events[j].id ?? `tools-${abs}-${name}`,
				});
				j += 1;
				continue;
			}
			const done: ToolEvent[] = [];
			const doneStart = abs;
			while (j < events.length && events[j].status !== 'start') {
				done.push(events[j]);
				j += 1;
			}
			out.push({
				kind: 'tools',
				events: done,
				key: done[0]?.id ?? `tools-${doneStart}-${name}`,
			});
		}
	}
	return out;
}

/** Render a contiguous run of reasoning/tool steps as a vertical trace. */
function TraceGroup({ items, streaming }: { items: TracePart[]; streaming: boolean }) {
	const collapsed = collapseTraceItems(items, streaming);
	return (
		<div className="flex flex-col gap-1.5">
			{collapsed.map((item) =>
				item.kind === 'reasoning'
					? <div key={item.key} className="my-1"><ReasoningBlock part={item.part} streaming={item.streaming} /></div>
					: <ToolGroupCard key={item.key} events={item.events} />,
			)}
		</div>
	);
}

/** Render an assistant turn's ordered parts (text + reasoning/tool traces). */
function AssistantParts({ parts, streaming }: { parts: MessagePart[]; streaming: boolean }) {
	const units = bucketParts(parts);
	if (units.length === 0) return null;
	return (
		<div className="flex flex-col gap-2">
			{units.map(unit =>
				unit.kind === 'text'
					? <Markdown key={unit.key} className="a-tag">{unit.text}</Markdown>
					: <TraceGroup key={unit.key} items={unit.items} streaming={streaming} />,
			)}
		</div>
	);
}

export function AIMessage({
	message = '',
	parts,
	isThinking,
	toolEvents = [],
}: {
	message?: string;
	parts?: MessagePart[];
	isThinking?: boolean;
	toolEvents?: ToolEvent[];
	/** @deprecated Input/Output is now shown for all behaviors; kept for call-site compat. */
	richToolPreview?: boolean;
}) {
	const sanitizedMessage = sanitizeMessageForDisplay(message);

	// Ordered parts are authoritative; fall back to a single text part for the
	// few literal placeholder messages that are constructed without parts.
	const resolvedParts: MessagePart[] = parts && parts.length > 0
		? parts
		: (sanitizedMessage ? [{ type: 'text', text: sanitizedMessage }] : []);

	// Check if this is a debug session (active or just completed in this session)
	const debugEvent = toolEvents.find(ev => ev.name === 'deep_debug');
	const isActiveDebug = debugEvent?.status === 'start';
	const isCompletedDebug = debugEvent?.status === 'success' || debugEvent?.status === 'error';
	const hasToolCalls = toolEvents.some(ev => ev.name !== 'deep_debug');
	const isLiveDebugSession = debugEvent && (isActiveDebug || (isCompletedDebug && hasToolCalls));

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
				setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
			}
		}, 1000);
		return () => clearInterval(interval);
	}, [isActiveDebug]);

	if (isLiveDebugSession) {
		const toolCallCount = toolEvents.filter(e => e.name !== 'deep_debug').length;
		return (
			<DebugSessionBubble
				message={{
					conversationId: 'debug-session',
					role: 'assistant' as const,
					content: sanitizedMessage,
					ui: { toolEvents },
				}}
				isActive={isActiveDebug}
				elapsedSeconds={elapsedSeconds}
				toolCallCount={toolCallCount}
			/>
		);
	}

	if (resolvedParts.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-col gap-2 min-w-0">
			<div className="font-mono font-medium text-text-50 flex items-center gap-2 mb-3">
				<AIAvatar className="size-5 text-orange-500 shrink-0" />
				Orange
				{isThinking && <Sparkles className="size-3 text-orange-400 animate-pulse" />}
			</div>
			<div className={cn(isThinking && 'animate-pulse')}>
				<AssistantParts parts={resolvedParts} streaming={!!isThinking} />
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
			className={cn('prose prose-sm prose-teal', className)}
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
