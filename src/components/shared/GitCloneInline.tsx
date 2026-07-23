import { Lock, ArrowRight } from 'lucide-react';
import { normalizeAppTitle } from '@/utils/string';
import { ClipboardText } from '@cloudflare/kumo';

interface GitCloneCommandProps {
	cloneUrl: string;
	appTitle: string;
}

export function GitCloneCommand({ cloneUrl, appTitle }: GitCloneCommandProps) {
	const normalizedTitle = normalizeAppTitle(appTitle);
	const fullCommand = `git clone ${cloneUrl} ${normalizedTitle}`;

	return <ClipboardText text={fullCommand} className="max-w-lg text-xs" />;
}

interface GitClonePrivatePromptProps {
	onOpenModal: () => void;
}

export function GitClonePrivatePrompt({
	onOpenModal,
}: GitClonePrivatePromptProps) {
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
