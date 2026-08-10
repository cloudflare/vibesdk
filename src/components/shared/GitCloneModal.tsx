import { useState, useEffect, type ReactNode } from 'react';
import {
	Banner,
	Button,
	Dialog,
	DialogClose,
	DialogDescription,
	DialogRoot,
	DialogTitle,
	cn,
	useKumoToastManager,
} from '@cloudflare/kumo';
import { CodeHighlighted, ShikiProvider } from '@cloudflare/kumo/code';
import {
	EyeIcon,
	EyeSlashIcon,
	GitBranchIcon,
	WarningCircleIcon,
	XIcon,
	ClockIcon,
} from '@phosphor-icons/react';
import { apiClient } from '@/lib/api-client';
import { normalizeAppTitle } from '@/utils/string';
import type { GitCloneTokenData } from '@/api-types';

interface GitCloneModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	appId: string;
	appTitle: string;
	isPublic: boolean;
	isOwner: boolean;
}

function CodeCommandBlock({
	code,
	label,
	blurred = false,
	onReveal,
	headerAction,
}: {
	code: string;
	label: string;
	blurred?: boolean;
	onReveal?: () => void;
	headerAction?: ReactNode;
}) {
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-2">
				<span className="text-sm font-medium text-kumo-default">
					{label}
				</span>
				{headerAction}
			</div>
			<div className="relative min-w-0 overflow-hidden rounded-lg ring ring-kumo-line">
				<div className={cn(blurred && 'blur-sm select-none')}>
					<CodeHighlighted
						code={code}
						lang="bash"
						showCopyButton={!blurred}
					/>
				</div>
				{blurred && onReveal && (
					<button
						type="button"
						onClick={onReveal}
						className="absolute inset-0 flex items-center justify-center rounded-lg bg-kumo-base/80 backdrop-blur-sm"
					>
						<span className="inline-flex items-center gap-2 text-sm font-medium text-kumo-default">
							<EyeIcon className="size-4" weight="duotone" />
							Click to reveal token
						</span>
					</button>
				)}
			</div>
		</div>
	);
}

export function GitCloneModal({
	open,
	onOpenChange,
	appId,
	appTitle,
	isPublic,
}: GitCloneModalProps) {
	const toast = useKumoToastManager();
	const [tokenData, setTokenData] = useState<GitCloneTokenData | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [tokenRevealed, setTokenRevealed] = useState(false);
	const [timeRemaining, setTimeRemaining] = useState<string | null>(null);

	const host = window.location.host;
	const protocol =
		host.startsWith('localhost') || host.startsWith('127.0.0.1')
			? 'http'
			: 'https';
	const publicCloneUrl = `${protocol}://${host}/apps/${appId}.git`;

	useEffect(() => {
		if (!open) {
			setTokenData(null);
			setIsGenerating(false);
			setTokenRevealed(false);
			setTimeRemaining(null);
		}
	}, [open]);

	useEffect(() => {
		if (!tokenData?.expiresAt) return;

		const interval = setInterval(() => {
			const expiresAt = new Date(tokenData.expiresAt).getTime();
			const diff = expiresAt - Date.now();

			if (diff <= 0) {
				setTimeRemaining('Expired');
				clearInterval(interval);
			} else {
				const minutes = Math.floor(diff / 60000);
				const seconds = Math.floor((diff % 60000) / 1000);
				setTimeRemaining(`${minutes}m ${seconds}s`);
			}
		}, 1000);

		return () => clearInterval(interval);
	}, [tokenData?.expiresAt]);

	const handleGenerateToken = async () => {
		setIsGenerating(true);
		try {
			const response = await apiClient.generateGitCloneToken(appId);
			if (response.data) {
				setTokenData(response.data);
				setTokenRevealed(false);
				toast.add({
					title: 'Token generated successfully',
					variant: 'success',
				});
			}
		} catch (error) {
			console.error('Failed to generate token:', error);
			toast.add({
				title: 'Failed to generate token',
				variant: 'error',
			});
		} finally {
			setIsGenerating(false);
		}
	};

	const normalizedTitle = normalizeAppTitle(appTitle);

	const gitCloneCommand = isPublic
		? `git clone ${publicCloneUrl} ${normalizedTitle}`
		: tokenData
			? `git clone ${tokenData.cloneUrl} ${normalizedTitle}`
			: '';

	const setupCommands = `cd ${normalizedTitle}\nbun install\nbun run dev`;

	return (
		<DialogRoot open={open} onOpenChange={onOpenChange}>
			<Dialog size="lg" className="p-0 sm:w-[32rem]">
				<div className="flex items-center justify-between border-b border-kumo-line px-6 py-4">
					<div className="grid min-w-0 gap-1">
						<DialogTitle className="flex items-center gap-2 text-lg font-semibold">
							<span className="h-lh flex items-center">
								<GitBranchIcon
									className="size-5 text-kumo-brand"
									weight="duotone"
								/>
							</span>
							Clone repository
						</DialogTitle>
						<DialogDescription className="text-sm text-kumo-subtle">
							{isPublic
								? 'Clone this app to your local machine'
								: 'Generate a temporary access token to clone this private repository'}
						</DialogDescription>
					</div>
					<DialogClose
						render={(props) => (
							<Button
								{...props}
								variant="ghost"
								shape="square"
								size="sm"
								aria-label="Close"
							>
								<XIcon className="size-4.5" />
							</Button>
						)}
					/>
				</div>

				<div className="grid gap-4 p-6">
					<ShikiProvider engine="javascript" languages={['bash']}>
						{isPublic ? (
							<>
								<CodeCommandBlock
									label="Clone command"
									code={gitCloneCommand}
								/>
								<CodeCommandBlock
									label="Quick start"
									code={setupCommands}
								/>
							</>
						) : !tokenData ? (
							<div className="grid gap-4">
								<Banner
									icon={<WarningCircleIcon />}
									description="Generate a temporary access token to clone
									this private repository. The token expires
									in 1 hour."
								/>

								<div className="flex w-full">
									<Button
										variant="primary"
										className="self-end ml-auto"
										onClick={() => {
											void handleGenerateToken();
										}}
										disabled={isGenerating}
										loading={isGenerating}
										icon={
											!isGenerating ? (
												<GitBranchIcon
													className="size-4"
													weight="duotone"
												/>
											) : undefined
										}
									>
										{isGenerating
											? 'Generating token...'
											: 'Generate clone token'}
									</Button>
								</div>
							</div>
						) : (
							<>
								<CodeCommandBlock
									label="Clone command"
									code={gitCloneCommand}
									blurred={!tokenRevealed}
									onReveal={() => setTokenRevealed(true)}
									headerAction={
										<Button
											variant="ghost"
											size="sm"
											shape="square"
											aria-label={
												tokenRevealed
													? 'Hide token'
													: 'Reveal token'
											}
											onClick={() =>
												setTokenRevealed(
													(prev) => !prev,
												)
											}
											icon={
												tokenRevealed ? (
													<EyeSlashIcon className="size-4" />
												) : (
													<EyeIcon className="size-4" />
												)
											}
										/>
									}
								/>

								<div className="flex items-center gap-2 rounded-lg bg-kumo-recessed px-3 py-2.5 ring ring-kumo-line">
									<span className="h-lh flex items-center">
										<ClockIcon
											weight="duotone"
											className="size-4 text-kumo-subtle"
										/>
									</span>
									<span className="text-sm text-kumo-subtle">
										Token expires in{' '}
										<span className="font-medium text-kumo-default tabular-nums">
											{timeRemaining}
										</span>
									</span>
								</div>

								<CodeCommandBlock
									label="Quick start"
									code={setupCommands}
								/>

								<Button
									variant="secondary"
									onClick={() => {
										void handleGenerateToken();
									}}
									disabled={isGenerating}
									loading={isGenerating}
								>
									{isGenerating
										? 'Generating...'
										: 'Generate new token'}
								</Button>
							</>
						)}
					</ShikiProvider>
				</div>
			</Dialog>
		</DialogRoot>
	);
}
