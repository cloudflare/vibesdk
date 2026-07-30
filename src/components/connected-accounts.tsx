/**
 * Connected Accounts
 * Lists the OAuth providers linked to the current user and lets them link
 * additional providers or unlink existing ones. Backed by the multi-provider
 * identity endpoints (/api/auth/identities, /api/auth/link/:provider).
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Link2, Unlink, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/auth-context';
import type { LinkedIdentitiesData, OAuthProvider } from '@/api-types';
import { CloudflareLogo } from '@cloudflare/kumo';

type LinkedIdentity = LinkedIdentitiesData['identities'][number];

const PROVIDER_META: Record<
	OAuthProvider,
	{ label: string; icon: React.ReactNode }
> = {
	github: {
		label: 'GitHub',
		icon: (
			<svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
				<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
			</svg>
		),
	},
	google: {
		label: 'Google',
		icon: (
			<svg className="h-5 w-5" viewBox="0 0 24 24">
				<path
					d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
					fill="#4285F4"
				/>
				<path
					d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
					fill="#34A853"
				/>
				<path
					d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
					fill="#FBBC05"
				/>
				<path
					d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
					fill="#EA4335"
				/>
			</svg>
		),
	},
	cloudflare: {
		label: 'Cloudflare',
		icon: <CloudflareLogo variant="glyph" className="h-5 w-5" />,
	},
};

const PROVIDER_ORDER: OAuthProvider[] = ['github', 'google', 'cloudflare'];

export function ConnectedAccounts() {
	const { authProviders } = useAuth();
	const [identities, setIdentities] = useState<LinkedIdentity[]>([]);
	const [loading, setLoading] = useState(true);
	const [pendingProvider, setPendingProvider] =
		useState<OAuthProvider | null>(null);
	const [providerToUnlink, setProviderToUnlink] =
		useState<OAuthProvider | null>(null);
	const [unlinking, setUnlinking] = useState(false);

	const loadIdentities = useCallback(async () => {
		try {
			setLoading(true);
			const response = await apiClient.getLinkedIdentities();
			setIdentities(response.data?.identities ?? []);
		} catch (error) {
			console.error('Error loading linked identities:', error);
			toast.error('Failed to load connected accounts');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadIdentities();
	}, [loadIdentities]);

	// Surface the result of a link round-trip that redirected back to /settings.
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const linked = params.get('linked');
		const error = params.get('error');

		if (linked) {
			const label =
				PROVIDER_META[linked as OAuthProvider]?.label ?? linked;
			toast.success(`${label} account linked successfully`);
		} else if (error) {
			const messages: Record<string, string> = {
				link_conflict:
					'That provider account is already linked to another user.',
				link_unauthorized: 'Sign in again to link a new provider.',
				link_failed: 'Failed to link provider. Please try again.',
			};
			toast.error(messages[error] ?? 'Failed to link provider.');
		}

		if (linked || error) {
			params.delete('linked');
			params.delete('error');
			const query = params.toString();
			window.history.replaceState(
				{},
				'',
				`${window.location.pathname}${query ? `?${query}` : ''}`,
			);
		}
	}, []);

	const handleLink = (provider: OAuthProvider) => {
		setPendingProvider(provider);
		apiClient.initiateProviderLink(provider);
	};

	const handleUnlink = async () => {
		if (!providerToUnlink || unlinking) return;
		try {
			setUnlinking(true);
			const response = await apiClient.unlinkProvider(providerToUnlink);
			if (response.success) {
				const label = PROVIDER_META[providerToUnlink].label;
				toast.success(`${label} account unlinked`);
				await loadIdentities();
				setProviderToUnlink(null);
			}
		} catch (error) {
			console.error('Error unlinking provider:', error);
			toast.error('Failed to unlink provider');
		} finally {
			setUnlinking(false);
		}
	};

	const linkedByProvider = new Map<OAuthProvider, LinkedIdentity>();
	for (const identity of identities) {
		linkedByProvider.set(identity.provider as OAuthProvider, identity);
	}

	// Only offer providers that are actually enabled on this deployment, but
	// always show identities that are already linked even if later disabled.
	const visibleProviders = PROVIDER_ORDER.filter(
		(provider) =>
			authProviders?.[provider] || linkedByProvider.has(provider),
	);

	const canUnlink = identities.length > 1;

	return (
		<div className="grid gap-4">
			<div className="grid gap-1.5">
				<h4 className="text-sm font-medium text-kumo-default">
					Connected accounts
				</h4>
				<p className="text-sm text-kumo-subtle">
					Link multiple sign-in providers to your account. You can use
					any linked provider to sign in.
				</p>
			</div>

			{loading ? (
				<div className="flex items-center gap-3 py-2">
					<Loader2 className="h-5 w-5 animate-spin text-kumo-subtle" />
					<span className="text-sm text-kumo-subtle">
						Loading connected accounts...
					</span>
				</div>
			) : (
				<div className="space-y-2">
					{visibleProviders.map((provider) => {
						const identity = linkedByProvider.get(provider);
						const meta = PROVIDER_META[provider];
						const isLinked = !!identity;

						return (
							<div
								key={provider}
								className="flex items-center justify-between gap-4 rounded-lg border border-bg-4 p-3"
							>
								<div className="flex items-center gap-3 min-w-0">
									<div className="flex h-9 w-9 items-center justify-center rounded-full bg-kumo-base text-text-primary shrink-0">
										{meta.icon}
									</div>
									<div className="min-w-0 grid gap-1.5">
										<p className="text-sm font-medium text-kumo-default">
											{meta.label}
										</p>
										<p className="truncate text-sm text-kumo-subtle">
											{isLinked
												? identity?.email || 'Linked'
												: 'Not connected'}
										</p>
									</div>
								</div>

								<div className="flex items-center gap-2 shrink-0">
									{isLinked ? (
										<>
											{identity?.emailVerified && (
												<Badge
													variant="secondary"
													className="gap-1"
												>
													<ShieldCheck className="h-3 w-3" />
													Verified
												</Badge>
											)}
											<Button
												variant="outline"
												size="sm"
												disabled={!canUnlink}
												title={
													canUnlink
														? undefined
														: 'You must keep at least one sign-in method'
												}
												onClick={() =>
													setProviderToUnlink(
														provider,
													)
												}
												className="gap-2 text-destructive hover:text-destructive"
											>
												<Unlink className="h-4 w-4" />
												Unlink
											</Button>
										</>
									) : (
										<Button
											variant="outline"
											size="sm"
											disabled={
												pendingProvider === provider
											}
											onClick={() => handleLink(provider)}
											className="gap-2"
										>
											{pendingProvider === provider ? (
												<Loader2 className="h-4 w-4 animate-spin" />
											) : (
												<Link2 className="h-4 w-4" />
											)}
											Link
										</Button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}

			<AlertDialog
				open={!!providerToUnlink}
				onOpenChange={(open) => !open && setProviderToUnlink(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Unlink provider?</AlertDialogTitle>
						<AlertDialogDescription>
							You will no longer be able to sign in with your{' '}
							{providerToUnlink
								? PROVIDER_META[providerToUnlink].label
								: ''}{' '}
							account. You can re-link it at any time.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={unlinking}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleUnlink}
							disabled={unlinking}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{unlinking ? 'Unlinking…' : 'Unlink'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
