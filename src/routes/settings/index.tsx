import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
	useMutation,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query';
import {
	Smartphone,
	Trash2,
	Key,
	Lock,
	Settings,
	Copy,
	Check,
	Eye,
	EyeOff,
} from 'lucide-react';
import type { ActiveSessionsData, ApiKeysData } from '@/api-types';
import {
	Button,
	DeleteResource,
	Dialog,
	DialogClose,
	DialogDescription,
	DialogRoot,
	DialogTitle,
	DialogTrigger,
	LayerCard,
	Input,
	Table,
} from '@cloudflare/kumo';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/auth-context';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { CloudflareAccountSelector } from '@/components/cloudflare-account-selector';
import { ConnectedAccounts } from '@/components/connected-accounts';
import { BiohazardIcon, TrashIcon } from '@phosphor-icons/react';

type CreatedApiKey = {
	key: string;
	keyPreview: string;
	name: string;
};

function getFallbackActiveSessions(): ActiveSessionsData {
	return {
		sessions: [
			{
				id: 'current',
				userAgent:
					typeof navigator === 'undefined'
						? null
						: navigator.userAgent,
				ipAddress: 'Current location',
				lastActivity: new Date(),
				createdAt: new Date(),
				isCurrent: true,
			},
		],
	};
}

async function fetchActiveSessions(): Promise<ActiveSessionsData> {
	try {
		const response = await apiClient.getActiveSessions();
		return response.data ?? getFallbackActiveSessions();
	} catch (error) {
		console.error('Error loading active sessions:', error);
		return getFallbackActiveSessions();
	}
}

async function fetchApiKeys(): Promise<ApiKeysData> {
	const response = await apiClient.getApiKeys();
	if (!response.success) {
		throw new Error(response.error?.message || 'Failed to load API keys');
	}
	return { keys: response.data?.keys ?? [] };
}

export default function SettingsPage() {
	const { user } = useAuth();
	const queryClient = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();

	useEffect(() => {
		const status = searchParams.get('cloudflare');
		if (!status) return;

		if (status === 'connected') {
			toast.success('Cloudflare connected successfully');
		} else {
			const reason = searchParams.get('reason');
			const messages: Record<string, string> = {
				connect_endpoint_changed: 'Please try connecting Cloudflare again.',
				session_mismatch: 'Your session changed during connection. Please try again.',
				missing_verifier: 'Cloudflare connection expired. Please try again.',
				invalid_state: 'Cloudflare connection could not be verified. Please try again.',
			};
			toast.error(messages[reason ?? ''] ?? 'Failed to connect Cloudflare. Please try again.');
		}

		const next = new URLSearchParams(searchParams);
		next.delete('cloudflare');
		next.delete('reason');
		next.delete('accounts');
		setSearchParams(next, { replace: true });
	}, [searchParams, setSearchParams]);
	const activeSessionsQuery = useQuery({
		queryKey: queryKeys.account.settings.activeSessions(user?.id),
		queryFn: fetchActiveSessions,
		enabled: !!user,
	});
	const apiKeysQuery = useQuery({
		queryKey: queryKeys.account.settings.apiKeys(user?.id),
		queryFn: fetchApiKeys,
		enabled: !!user,
	});
	const [createKeyOpen, setCreateKeyOpen] = useState(false);
	const [newKeyName, setNewKeyName] = useState('');
	const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
	const [showCreatedKey, setShowCreatedKey] = useState(true);
	const [keyToRevoke, setKeyToRevoke] = useState<
		ApiKeysData['keys'][number] | null
	>(null);
	const [revokeError, setRevokeError] = useState<string>();
	const {
		copied: copiedCreatedKey,
		copy: copyCreatedKey,
		reset: resetCreatedKeyCopy,
	} = useCopyToClipboard();
	const apiKeysError = apiKeysQuery.error;
	const activeSessions = activeSessionsQuery.data?.sessions ?? [];
	const apiKeys = apiKeysQuery.data?.keys ?? [];

	const handleDeleteAccount = async () => {
		toast.error('Account deletion is not yet implemented');
	};

	const revokeSessionMutation = useMutation({
		mutationFn: async (sessionId: string) => {
			const response = await apiClient.revokeSession(sessionId);
			if (!response.success) {
				throw new Error(
					response.error?.message || 'Failed to revoke session',
				);
			}
		},
		onSuccess: () => {
			toast.success('Session revoked successfully');
			void queryClient.invalidateQueries({
				queryKey: queryKeys.account.settings.activeSessions(user?.id),
			});
		},
		onError: (error) => {
			console.error('Error revoking session:', error);
			toast.error('Failed to revoke session');
		},
	});

	const createApiKeyMutation = useMutation({
		mutationFn: async (name: string) => {
			const response = await apiClient.createApiKey({ name });
			if (!response.success || !response.data) {
				throw new Error(
					response.error?.message || 'Failed to create API key',
				);
			}
			return response.data;
		},
		onSuccess: (data) => {
			setCreatedKey({
				key: data.key,
				keyPreview: data.keyPreview,
				name: data.name,
			});
			setShowCreatedKey(true);
			resetCreatedKeyCopy();
			toast.success('API key created');
			void queryClient.invalidateQueries({
				queryKey: queryKeys.account.settings.apiKeys(user?.id),
			});
			setNewKeyName('');
		},
		onError: (error) => {
			console.error('Error creating API key:', error);
			toast.error('Failed to create API key');
		},
	});

	const revokeApiKeyMutation = useMutation({
		mutationFn: async (keyId: string) => {
			const response = await apiClient.revokeApiKey(keyId);
			if (!response.success) {
				throw new Error(
					response.error?.message || 'Failed to revoke API key',
				);
			}
		},
		onSuccess: () => {
			toast.success('API key revoked');
			setKeyToRevoke(null);
			setRevokeError(undefined);
			void queryClient.invalidateQueries({
				queryKey: queryKeys.account.settings.apiKeys(user?.id),
			});
		},
		onError: (error) => {
			console.error('Error revoking API key:', error);
			setRevokeError(
				error instanceof Error
					? error.message
					: 'Failed to revoke API key',
			);
		},
	});

	const creatingKey = createApiKeyMutation.isPending;
	const revokingKey = revokeApiKeyMutation.isPending;
	const apiKeysLoading = !!user && apiKeysQuery.isLoading;
	const activeSessionsLoading = !!user && activeSessionsQuery.isLoading;

	const handleRevokeSession = (sessionId: string) => {
		revokeSessionMutation.mutate(sessionId);
	};

	const handleCreateApiKey = () => {
		const name = newKeyName.trim();
		if (!name || creatingKey) return;
		createApiKeyMutation.mutate(name);
	};

	const handleRevokeApiKey = async () => {
		if (!keyToRevoke || revokingKey) return;
		setRevokeError(undefined);
		await revokeApiKeyMutation.mutateAsync(keyToRevoke.id);
	};

	useEffect(() => {
		if (!apiKeysError) return;
		console.error('Error loading API keys:', apiKeysError);
		toast.error('Failed to load API keys');
	}, [apiKeysError]);

	return (
		<div className="relative">
			<title>Settings - Build</title>
			<main className="container mx-auto px-4 py-16 max-w-4xl pb-48">
				<div className="grid gap-8">
					{/* Page Header */}
					<div className="grid gap-1.5 mb-4">
						<h1 className="text-4xl font-semibold font-funky-mono text-kumo-default">
							Settings
						</h1>
						<p className="text-sm text-kumo-subtle font-funky-mono">
							Manage your account settings and preferences
						</p>
					</div>

					{/* Cloudflare Account & Gateway Selection */}
					<CloudflareAccountSelector />

					<LayerCard id="api-keys">
						<LayerCard.Secondary className="font-funky-mono tracking-tighter">
							<div className="flex items-center gap-2">
								<span className="flex items-center">
									<Key className="size-4" />
								</span>
								<span>API keys</span>
							</div>
						</LayerCard.Secondary>
						<LayerCard.Primary>
							<div className="grid gap-6">
								<div className="flex items-start justify-between gap-4">
									<div className="grid gap-1.5">
										<h4 className="text-sm font-medium text-kumo-default">
											VibeSDK API keys
										</h4>
										<p className="text-sm text-kumo-subtle">
											Use these keys to authenticate
											external SDK clients. The full key
											is shown only once when created.
										</p>
									</div>

									<DialogRoot
										open={createKeyOpen}
										onOpenChange={(open) => {
											setCreateKeyOpen(open);
											if (!open) {
												setNewKeyName('');
												setCreatedKey(null);
												setShowCreatedKey(true);
												resetCreatedKeyCopy();
											}
										}}
									>
										<DialogTrigger
											render={(p) => (
												<Button
													{...p}
													variant="primary"
													size="sm"
													className="gap-2"
												>
													<Key className="size-4" />
													Create API key
												</Button>
											)}
										/>
										<Dialog className="p-8">
											<div className="mb-4 grid gap-1.5">
												<DialogTitle className="text-xl font-semibold">
													{createdKey
														? 'Your new API key'
														: 'Create API key'}
												</DialogTitle>
												<DialogDescription className="text-kumo-subtle">
													{createdKey
														? 'Copy this key now. You will not be able to see it again.'
														: 'Give your key a memorable name. You can revoke it anytime.'}
												</DialogDescription>
											</div>

											{!createdKey ? (
												<div className="grid gap-4">
													<div className="grid gap-1.5">
														<p className="text-sm font-medium text-kumo-default">
															Key name
														</p>
														<Input
															value={newKeyName}
															onChange={(e) =>
																setNewKeyName(
																	e.target
																		.value,
																)
															}
															placeholder="e.g. My production SDK"
															autoFocus
														/>
													</div>

													<div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3">
														<p className="text-sm text-amber-800 dark:text-amber-200">
															<strong>
																Important:
															</strong>{' '}
															Treat this like a
															password. Anyone
															with this key can
															act as your VibeSDK
															account.
														</p>
													</div>
												</div>
											) : (
												<div className="grid gap-4">
													<div className="grid gap-1.5">
														<p className="text-sm font-medium text-kumo-default">
															API key
														</p>
														<div className="relative">
															<Input
																type={
																	showCreatedKey
																		? 'text'
																		: 'password'
																}
																value={
																	createdKey.key
																}
																readOnly
																className="font-mono text-sm pr-20"
															/>
															<div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
																<Button
																	size="sm"
																	shape="square"
																	variant="ghost"
																	aria-label={
																		showCreatedKey
																			? 'Hide API key'
																			: 'Show API key'
																	}
																	onClick={() =>
																		setShowCreatedKey(
																			!showCreatedKey,
																		)
																	}
																	icon={
																		showCreatedKey ? (
																			<EyeOff className="size-4" />
																		) : (
																			<Eye className="size-4" />
																		)
																	}
																/>
																<Button
																	size="sm"
																	shape="square"
																	variant="ghost"
																	aria-label={
																		copiedCreatedKey
																			? 'Copied'
																			: 'Copy API key'
																	}
																	onClick={() =>
																		copyCreatedKey(
																			createdKey.key,
																		)
																	}
																	icon={
																		copiedCreatedKey ? (
																			<Check className="size-4 text-green-500" />
																		) : (
																			<Copy className="size-4" />
																		)
																	}
																/>
															</div>
														</div>
													</div>

													<div className="rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 grid gap-1.5">
														<p className="text-xs font-medium text-slate-700 dark:text-slate-300">
															SDK usage
														</p>
														<code className="text-xs text-slate-600 dark:text-slate-400 block font-mono text-[0.9em]">
															VIBESDK_API_KEY=
															{
																createdKey.keyPreview
															}
														</code>
													</div>
												</div>
											)}

											<div className="mt-8 flex justify-end gap-2">
												{!createdKey ? (
													<Button
														variant="primary"
														onClick={
															handleCreateApiKey
														}
														disabled={
															!newKeyName.trim() ||
															creatingKey
														}
														loading={creatingKey}
														className="gap-2"
													>
														Create
													</Button>
												) : (
													<DialogClose
														render={(props) => (
															<Button
																variant="secondary"
																{...props}
															>
																Done
															</Button>
														)}
													/>
												)}
											</div>
										</Dialog>
									</DialogRoot>
								</div>

								{apiKeysLoading ? (
									<div className="flex items-center gap-3">
										<Settings className="size-4 animate-spin text-kumo-subtle" />
										<span className="text-sm text-kumo-subtle">
											Loading API keys...
										</span>
									</div>
								) : apiKeys.length === 0 ? (
									<div className="rounded-lg ring ring-kumo-line border-dashed px-5 py-4">
										<div className="flex items-start gap-3">
											<span className="h-lh flex items-center">
												<Key className="size-4 text-kumo-subtle" />
											</span>
											<div className="grid gap-1.5">
												<p className="text-sm font-medium text-kumo-default">
													No API keys yet
												</p>
												<p className="text-sm text-kumo-subtle">
													Create an API key to use the
													VibeSDK SDK from your own
													apps.
												</p>
											</div>
										</div>
									</div>
								) : (
									<>
										<p className="mb-2 text-sm text-kumo-subtle">
											Active keys for SDK usage
										</p>
										<LayerCard className="overflow-x-auto p-0">
											<Table>
												<Table.Header>
													<Table.Row>
														<Table.Head>Name</Table.Head>
														<Table.Head>Preview</Table.Head>
														<Table.Head>Created</Table.Head>
														<Table.Head>Last used</Table.Head>
														<Table.Head>Status</Table.Head>
														<Table.Head className="text-right">
															Actions
														</Table.Head>
													</Table.Row>
												</Table.Header>
												<Table.Body>
													{apiKeys.map((k) => (
														<Table.Row key={k.id}>
															<Table.Cell className="font-medium">
																{k.name}
															</Table.Cell>
															<Table.Cell className="font-mono text-[0.9em] text-kumo-subtle">
																{k.keyPreview}
															</Table.Cell>
															<Table.Cell className="text-kumo-subtle">
																{k.createdAt
																	? new Date(
																			k.createdAt,
																		).toLocaleDateString()
																	: '—'}
															</Table.Cell>
															<Table.Cell className="text-kumo-subtle">
																{k.lastUsed
																	? new Date(
																			k.lastUsed,
																		).toLocaleDateString()
																	: '—'}
															</Table.Cell>
															<Table.Cell>
																{k.isActive ? (
																	<Badge
																		variant="secondary"
																		className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
																	>
																		Active
																	</Badge>
																) : (
																	<Badge variant="secondary">
																		Revoked
																	</Badge>
																)}
															</Table.Cell>
															<Table.Cell className="text-right">
																<Button
																	variant="secondary-destructive"
																	size="sm"
																	disabled={
																		!k.isActive
																	}
																onClick={() => {
																	setRevokeError(
																		undefined,
																	);
																	setKeyToRevoke(
																		k,
																	);
																}}
																	className="gap-2"
																>
																	<Trash2 className="size-4" />
																	Revoke
																</Button>
															</Table.Cell>
														</Table.Row>
													))}
												</Table.Body>
											</Table>
										</LayerCard>

									{keyToRevoke && (
										<DeleteResource
											open={!!keyToRevoke}
											onOpenChange={(open) => {
												if (!open) {
													setKeyToRevoke(null);
													setRevokeError(undefined);
												}
											}}
											resourceType="API key"
											resourceName={keyToRevoke.name}
											onDelete={handleRevokeApiKey}
											isDeleting={revokingKey}
											errorMessage={revokeError}
											deleteButtonText="Revoke API key"
											className="sm:w-[32rem]"
										/>
									)}
									</>
								)}
							</div>
						</LayerCard.Primary>
					</LayerCard>

					{/* Security Section */}
					<LayerCard id="security">
						<LayerCard.Secondary className="font-funky-mono tracking-tighter">
							<div className="flex items-center gap-2">
								<span className="h-lh flex items-center">
									<Lock className="size-4" />
								</span>
								<span>Security</span>
							</div>
						</LayerCard.Secondary>
						<LayerCard.Primary>
							<div className="grid gap-6">
								<ConnectedAccounts />

								<Separator />

								<div className="grid gap-4">
									<h4 className="text-sm font-medium text-kumo-default">
										Active sessions
									</h4>
									{activeSessionsLoading ? (
										<div className="flex items-center gap-3">
											<Settings className="size-4 animate-spin text-kumo-subtle" />
											<span className="text-sm text-kumo-subtle">
												Loading active sessions...
											</span>
										</div>
									) : (
										activeSessions.map(
											(session) => (
												<div
													key={session.id}
													className="flex items-center justify-between gap-4"
												>
													<div className="flex items-start gap-2">
														<span className="h-lh flex items-center">
															<Smartphone className="size-4 text-kumo-subtle" />
														</span>
														<div className="grid gap-1.5">
															<p className="text-sm font-medium text-kumo-default">
																{session.isCurrent
																	? 'Current session'
																	: 'Other session'}
															</p>
															<p className="text-sm text-kumo-subtle">
																{
																	session.ipAddress
																}{' '}
																•{' '}
																{new Date(
																	session.lastActivity,
																).toLocaleDateString()}
															</p>
														</div>
													</div>
													<div className="flex items-center gap-2">
														{session.isCurrent ? (
															<div className="bg-green-400 size-3 rounded-full ring-2 ring-green-200 animate-pulse" />
														) : (
															<Button
																variant="secondary"
																size="sm"
																onClick={() =>
																	handleRevokeSession(
																		session.id,
																	)
																}
															>
																Revoke
															</Button>
														)}
													</div>
												</div>
											),
										)
									)}
								</div>
							</div>
						</LayerCard.Primary>
					</LayerCard>

					<LayerCard id="danger-zone">
						<LayerCard.Secondary className="font-funky-mono tracking-tighter">
							<div className="flex items-center gap-2 text-kumo-danger">
								<span className="h-lh flex items-center">
									<BiohazardIcon weight="duotone" className="size-4" />
								</span>
								Danger zone
							</div>
						</LayerCard.Secondary>
						<LayerCard.Primary>
							<div className="flex items-center justify-between gap-4">
								<div className="grid gap-1.5">
									<p className="text-sm font-medium text-kumo-default">
										Delete account
									</p>
									<p className="text-sm text-kumo-subtle">
										Permanently delete your account and all
										data
									</p>
								</div>

								<DialogRoot role="alertdialog">
									<DialogTrigger
										render={(p) => (
											<Button
												{...p}
												variant="destructive"
												className="gap-2"
											>
												<TrashIcon
													weight="duotone"
													className="size-4"
												/>
												Delete account
											</Button>
										)}
									/>
									<Dialog className="p-8">
										<div className="mb-4 grid gap-1.5">
											<DialogTitle className="text-xl font-semibold">
												Delete account?
											</DialogTitle>
											<DialogDescription className="text-kumo-subtle">
												This action cannot be undone.
												This will permanently delete
												your account and remove all your
												data from our servers.
											</DialogDescription>
										</div>
										<div className="mt-8 flex justify-end gap-2">
											<DialogClose
												render={(props) => (
													<Button
														variant="secondary"
														{...props}
													>
														Cancel
													</Button>
												)}
											/>
											<DialogClose
												render={(props) => (
													<Button
														variant="destructive"
														{...props}
														onClick={(e) => {
															props.onClick?.(e);
															void handleDeleteAccount();
														}}
													>
														Delete account
													</Button>
												)}
											/>
										</div>
									</Dialog>
								</DialogRoot>
							</div>
						</LayerCard.Primary>
					</LayerCard>
				</div>
			</main>
		</div>
	);
}
