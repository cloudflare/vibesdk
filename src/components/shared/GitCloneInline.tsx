import { normalizeAppTitle } from '@/utils/string';
import { Button, ClipboardText } from '@cloudflare/kumo';
import { FolderSimpleLockIcon } from '@phosphor-icons/react';

interface GitCloneCommandProps {
	cloneUrl: string;
	appTitle: string;
}

export function GitCloneCommand({ cloneUrl, appTitle }: GitCloneCommandProps) {
	const normalizedTitle = normalizeAppTitle(appTitle);
	const fullCommand = `git clone ${cloneUrl} ${normalizedTitle}`;

	return <ClipboardText text={fullCommand} size="sm" className="max-w-lg" />;
}

interface GitClonePrivatePromptProps {
	onOpenModal: () => void;
}

export function GitClonePrivatePrompt({
	onOpenModal,
}: GitClonePrivatePromptProps) {
	return (
		<Button
			variant="secondary"
			size="sm"
			icon={
				<FolderSimpleLockIcon
					weight="duotone"
					className="size-4 mr-1"
				/>
			}
			onClick={onOpenModal}
		>
			Clone with authentication
		</Button>
	);
}
