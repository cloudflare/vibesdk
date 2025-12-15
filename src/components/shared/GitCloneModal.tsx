import { useState, useEffect } from 'react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
	GitBranch,
	Copy,
	Check,
	Loader2,
	Eye,
	EyeOff,
	AlertCircle,
	Clock,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
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

export function GitCloneModal({
	open,
	onOpenChange,
	appId,
	appTitle,
	isPublic,
}: GitCloneModalProps) {
	const [tokenData, setTokenData] = useState<GitCloneTokenData | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [tokenRevealed, setTokenRevealed] = useState(false);
	const [timeRemaining, setTimeRemaining] = useState<string | null>(null);

	const { copied: copiedCommand, copy: copyCommand, reset: resetCommand } = useCopyToClipboard({
		successMessage: 'Copied to clipboard!',
	});
	const { copied: copiedSetup, copy: copySetup, reset: resetSetup } = useCopyToClipboard({
		successMessage: 'Copied to clipboard!',
	});

	const host = window.location.host; // includes port
	const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
	const publicCloneUrl = `${protocol}://${host}/apps/${appId}.git`;

	useEffect(() => {
		if (!open) {
			setTokenData(null);
			setIsGenerating(false);
			resetCommand();
			resetSetup();
			setTokenRevealed(false);
			setTimeRemaining(null);
		}
	}, [open, resetCommand, resetSetup]);

	useEffect(() => {
		if (tokenData?.expiresAt) {
			const interval = setInterval(() => {
				const expiresAt = new Date(tokenData.expiresAt).getTime();
				const now = Date.now();
				const diff = expiresAt - now;

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
		}
	}, [tokenData?.expiresAt]);

	const handleGenerateToken = async () => {
		setIsGenerating(true);
		try {
			const response = await apiClient.generateGitCloneToken(appId);
			if (response.data) {
				setTokenData(response.data);
				toast.success('Token generated successfully');
			}
		} catch (error) {
			console.error('Failed to generate token:', error);
			toast.error('Failed to generate token');
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
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[550px] max-w-[calc(100%-2rem)]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<GitBranch className="h-5 w-5 text-brand-primary" />
						Clone Repository
					</DialogTitle>
					<DialogDescription>
						{isPublic
							? 'Clone this app to your local machine'
							: 'Generate a temporary access token to clone this private repository'}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					{isPublic ? (
						<>
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium text-text-secondary">
										Clone Command
									</span>
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										onClick={() => copyCommand(gitCloneCommand)}
									>
										{copiedCommand ? (
											<Check className="h-4 w-4 text-green-400" />
										) : (
											<Copy className="h-4 w-4" />
										)}
									</Button>
								</div>
								<code className="block p-3 rounded-lg bg-bg-4 border border-border-primary font-mono text-sm text-text-primary break-all max-w-full">
									{gitCloneCommand}
								</code>
							</div>

							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium text-text-secondary">Quick Start</span>
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8"
										onClick={() => copySetup(setupCommands)}
									>
										{copiedSetup ? (
											<Check className="h-4 w-4 text-green-400" />
										) : (
											<Copy className="h-4 w-4" />
										)}
									</Button>
								</div>
								<code className="block p-3 rounded-lg bg-bg-4 border border-border-primary font-mono text-sm text-text-primary whitespace-pre-wrap break-words max-w-full">
									{setupCommands}
								</code>
							</div>
						</>
					) : (
						<>
							{!tokenData ? (
								<div className="space-y-4">
									<div className="flex items-start gap-3 p-4 rounded-lg bg-bg-4 border border-border-primary">
										<AlertCircle className="h-5 w-5 text-brand-primary mt-0.5" />
										<div className="flex-1 space-y-1">
											<p className="text-sm font-medium text-text-primary">
												Private Repository
											</p>
											<p className="text-sm text-text-tertiary">
												Generate a temporary access token to clone this repository.
												The token expires in 1 hour.
											</p>
										</div>
									</div>

									<Button
										onClick={handleGenerateToken}
										disabled={isGenerating}
										className="w-full bg-brand-primary hover:bg-brand-primary/90"
									>
										{isGenerating ? (
											<>
												<Loader2 className="h-4 w-4 animate-spin mr-2" />
												Generating Token...
											</>
										) : (
											<>
												<GitBranch className="h-4 w-4 mr-2" />
												Generate Clone Token
											</>
										)}
									</Button>
								</div>
							) : (
								<>
									<div className="space-y-2">
										<div className="flex items-center justify-between">
											<span className="text-sm font-medium text-text-secondary">
												Clone Command
											</span>
											<div className="flex items-center gap-2">
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8"
													onClick={() => setTokenRevealed(!tokenRevealed)}
												>
													{tokenRevealed ? (
														<EyeOff className="h-4 w-4" />
													) : (
														<Eye className="h-4 w-4" />
													)}
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8"
													onClick={() => copyCommand(gitCloneCommand)}
												>
													{copiedCommand ? (
														<Check className="h-4 w-4 text-green-400" />
													) : (
														<Copy className="h-4 w-4" />
													)}
												</Button>
											</div>
										</div>
										<div className="relative">
											<code
												className={cn(
													'block p-3 rounded-lg bg-bg-4 border border-border-primary font-mono text-sm text-text-primary break-all max-w-full',
													!tokenRevealed && 'blur-sm select-none',
												)}
											>
												{gitCloneCommand}
											</code>
											{!tokenRevealed && (
												<button
													onClick={() => setTokenRevealed(true)}
													className="absolute inset-0 flex items-center justify-center bg-bg-3/80 rounded-lg backdrop-blur-sm"
												>
													<div className="flex items-center gap-2 text-text-primary">
														<Eye className="h-4 w-4" />
														<span className="text-sm font-medium">
															Click to reveal token
														</span>
													</div>
												</button>
											)}
										</div>
									</div>

									<div className="flex items-center gap-2 p-3 rounded-lg bg-bg-4 border border-border-primary">
										<Clock className="h-4 w-4 text-brand-primary" />
										<span className="text-sm text-text-secondary">
											Token expires in:{' '}
											<span className="font-medium text-text-primary">
												{timeRemaining}
											</span>
										</span>
									</div>

									<div className="space-y-2">
										<div className="flex items-center justify-between">
											<span className="text-sm font-medium text-text-secondary">Quick Start</span>
											<Button
												variant="ghost"
												size="icon"
												className="h-8 w-8"
												onClick={() => copySetup(setupCommands)}
											>
												{copiedSetup ? (
													<Check className="h-4 w-4 text-green-400" />
												) : (
													<Copy className="h-4 w-4" />
												)}
											</Button>
										</div>
										<code className="block p-3 rounded-lg bg-bg-4 border border-border-primary font-mono text-sm text-text-primary whitespace-pre-wrap break-words max-w-full">
											{setupCommands}
										</code>
									</div>

									<Button
										onClick={handleGenerateToken}
										variant="outline"
										className="w-full"
										disabled={isGenerating}
									>
										{isGenerating ? (
											<>
												<Loader2 className="h-4 w-4 animate-spin mr-2" />
												Generating...
											</>
										) : (
											<>Generate New Token</>
										)}
									</Button>
								</>
							)}
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
