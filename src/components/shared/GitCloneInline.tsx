import { Check, Lock, ArrowRight } from 'lucide-react';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { normalizeAppTitle } from '@/utils/string';

interface GitCloneCommandProps {
	cloneUrl: string;
	appTitle: string;
}

export function GitCloneCommand({ cloneUrl, appTitle }: GitCloneCommandProps) {
	const { copied, copy } = useCopyToClipboard({
		successMessage: 'Clone command copied!',
	});

	const normalizedTitle = normalizeAppTitle(appTitle);
	const fullCommand = `git clone ${cloneUrl} ${normalizedTitle}`;

	const handleCopy = () => {
		copy(fullCommand);
	};

	return (
		<div
			className="group relative flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-bg-4 border border-border-primary/50 hover:border-border-primary transition-all cursor-pointer"
			onClick={handleCopy}
			role="button"
			tabIndex={0}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					handleCopy();
				}
			}}
			aria-label="Click to copy git clone command"
			title="Click to copy"
		>
			<code className="flex-1 text-xs font-mono text-text-secondary truncate select-all min-w-0">
				{fullCommand}
			</code>
			{copied && (
				<Check className="size-3 text-green-400 flex-shrink-0" />
			)}
		</div>
	);
}

interface GitClonePrivatePromptProps {
	onOpenModal: () => void;
}

export function GitClonePrivatePrompt({ onOpenModal }: GitClonePrivatePromptProps) {
	return (
		<button
			className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-bg-4 border border-border-primary/50 hover:border-brand-primary transition-all text-left w-full group"
			onClick={onOpenModal}
		>
			<Lock className="size-3 text-brand-primary flex-shrink-0" />
			<div className="flex-1 min-w-0 flex items-center gap-1.5">
				<span className="text-xs font-medium text-text-primary truncate">
					Clone with authentication
				</span>
				<span className="text-xs text-text-tertiary truncate hidden lg:inline">
					· Generate token
				</span>
			</div>
			<ArrowRight className="size-3 text-text-tertiary group-hover:text-brand-primary transition-colors flex-shrink-0" />
		</button>
	);
}
