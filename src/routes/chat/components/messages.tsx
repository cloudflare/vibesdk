import { AIAvatar } from '../../../components/icons/logos';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeExternalLinks from 'rehype-external-links';
import { LoaderCircle, Check, AlertTriangle } from 'lucide-react';
import type { ToolEvent } from '../utils/message-helpers';

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

export function AIMessage({
	message,
	isThinking,
	toolEvents,
}: {
	message: string;
	isThinking?: boolean;
	toolEvents?: ToolEvent[];
}) {
	const sanitizedMessage = sanitizeMessageForDisplay(message);
	
	return (
		<div className="flex gap-3">
			<div className="align-text-top pl-1">
				<AIAvatar className="size-6 text-orange-500" />
			</div>
			<div className="flex flex-col gap-2 min-w-0">
				<div className="font-mono font-medium text-text-50">Orange</div>
				{toolEvents && toolEvents.length > 0 && (
					<div className="mb-1.5 flex flex-col gap-1">
						{toolEvents.map((ev) => (
							<div
								key={`${ev.name}-${ev.timestamp}`}
								className="flex items-center gap-1.5 text-xs text-text-tertiary"
							>
								{ev.status === 'start' && (
									<LoaderCircle className="size-3 animate-spin" />
								)}
								{ev.status === 'success' && <Check className="size-3" />}
								{ev.status === 'error' && <AlertTriangle className="size-3" />}
								<span className="font-mono tracking-tight">
									{ev.status === 'start' && 'Running'}
									{ev.status === 'success' && 'Completed'}
									{ev.status === 'error' && 'Error'}
									{' '}
									{ev.name}
								</span>
							</div>
						))}
					</div>
				)}
				<Markdown className={clsx('a-tag', isThinking ? 'animate-pulse' : '')}>
					{sanitizedMessage}
				</Markdown>
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
			>
				{children}
			</ReactMarkdown>
		</article>
	);
}
