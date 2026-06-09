import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronDown, AlertTriangle, ArrowDown, Loader } from 'lucide-react';
import clsx from 'clsx';
import type { ChatMessage } from '../utils/message-helpers';
import { formatElapsedTime } from '../hooks/use-debug-session';
import { MessageContentRenderer, ToolStatusIndicator } from './messages';

interface DebugSessionBubbleProps {
message: ChatMessage;
isActive: boolean;
elapsedSeconds: number;
toolCallCount: number;
}

export function DebugSessionBubble({
message,
isActive,
elapsedSeconds,
toolCallCount,
}: DebugSessionBubbleProps) {
const [isExpanded, setIsExpanded] = useState(true);
const [showScrollButton, setShowScrollButton] = useState(false);
const scrollAreaRef = useRef<HTMLDivElement>(null);
const autoScrollRef = useRef(true);

// Auto-scroll to bottom when content changes
useEffect(() => {
if (autoScrollRef.current && scrollAreaRef.current) {
scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
}
}, [message.content]);

// Track scroll position
const handleScroll = () => {
const container = scrollAreaRef.current;
if (!container) return;

const isNearBottom = 
container.scrollHeight - container.scrollTop - container.clientHeight < 100;

autoScrollRef.current = isNearBottom;
setShowScrollButton(!isNearBottom && container.scrollHeight > container.clientHeight);
};

const scrollToBottom = () => {
if (scrollAreaRef.current) {
scrollAreaRef.current.scrollTo({
top: scrollAreaRef.current.scrollHeight,
behavior: 'smooth'
});
autoScrollRef.current = true;
setShowScrollButton(false);
}
};

const debugEvent = message.ui?.toolEvents?.find(e => e.name === 'deep_debug');
const hasError = debugEvent?.status === 'error';

return (
<motion.div
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: 10 }}
transition={{ duration: 0.2 }}
className="my-4"
>
<div className={clsx(
"rounded-lg border overflow-hidden bg-bg-2",
isActive && "border-accent/30",
!isActive && hasError && "border-red-500/30",
!isActive && !hasError && "border-green-500/30"
)}>
{/* Header */}
<button
onClick={() => setIsExpanded(!isExpanded)}
className={clsx(
"w-full px-4 py-3 flex items-center justify-between",
"hover:bg-bg-3/50 transition-colors",
isExpanded && "border-b border-border-primary/30"
)}
>
<div className="flex items-center gap-2.5 flex-1 min-w-0">
{/* Status icon - minimal */}
{isActive ? (
<Loader className="size-4 text-accent animate-spin shrink-0" />
) : hasError ? (
<AlertTriangle className="size-4 text-red-500 shrink-0" />
) : (
<Check className="size-4 text-green-500 shrink-0" />
)}

{/* Title */}
<span className={clsx(
"text-sm font-medium",
isActive && "text-accent",
hasError && !isActive && "text-red-500",
!isActive && !hasError && "text-green-500"
)}>
{isActive ? 'Deep Debugging' : 
 hasError ? 'Debugging Failed' : 
 'Debugging Complete'}
</span>

{/* Timer and tool count */}
<div className="flex items-center gap-2 ml-auto text-xs text-text-tertiary">
{isActive && (
<span className="font-mono tabular-nums">
{formatElapsedTime(elapsedSeconds)}
</span>
)}
{toolCallCount > 0 && (
<span className="px-1.5 py-0.5 rounded bg-bg-3/50 font-medium">
{toolCallCount}
</span>
)}
</div>
</div>

{/* Expand/collapse icon */}
<motion.div
animate={{ rotate: isExpanded ? 180 : 0 }}
transition={{ duration: 0.2 }}
className="ml-2"
>
<ChevronDown className="size-4 text-text-tertiary" />
</motion.div>
</button>

{/* Expandable content */}
<AnimatePresence initial={false}>
{isExpanded && (
<motion.div
initial={{ height: 0, opacity: 0 }}
animate={{ height: 'auto', opacity: 1 }}
exit={{ height: 0, opacity: 0 }}
transition={{ duration: 0.2 }}
className="overflow-hidden"
>
<div className="relative">
{/* Scrollable content area */}
<div
ref={scrollAreaRef}
onScroll={handleScroll}
className="max-h-[600px] overflow-y-auto px-4 py-3"
>
<div className="space-y-3">
{/* Render message content */}
<MessageContentRenderer 
content={message.content || 'Initializing debug session...'}
toolEvents={message.ui?.toolEvents?.filter(ev => ev.contentLength !== undefined) || []}
/>

{/* Tool events */}
{message.ui?.toolEvents && message.ui.toolEvents.length > 0 && (
<div className="flex flex-col gap-1.5">
{message.ui.toolEvents
.filter(ev => ev.name !== 'deep_debug' && ev.contentLength === undefined)
.map((event, idx) => (
<ToolStatusIndicator 
key={`${event.name}-${event.timestamp}-${idx}`}
event={event}
/>
))}
</div>
)}
</div>
</div>

{/* Scroll to bottom button */}
<AnimatePresence>
{showScrollButton && (
<motion.button
initial={{ opacity: 0, y: 10 }}
animate={{ opacity: 1, y: 0 }}
exit={{ opacity: 0, y: 10 }}
onClick={scrollToBottom}
className={clsx(
"absolute bottom-3 right-3 size-8 rounded-md",
"bg-bg-3 hover:bg-bg-3/80 border border-border-primary/30",
"flex items-center justify-center",
"transition-colors"
)}
title="Scroll to bottom"
>
<ArrowDown className="size-4 text-text-secondary" />
</motion.button>
)}
</AnimatePresence>
</div>
</motion.div>
)}
</AnimatePresence>
</div>
</motion.div>
);
}
