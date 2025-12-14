import { useState, useEffect, useCallback } from 'react';
import { useVault, type SecretListItem } from '@/contexts/vault-context';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Key, Lock, Trash2, Plus, Loader2, RefreshCw, Shield, ShieldOff, Eye } from 'lucide-react';
import { AddSecretModal } from './AddSecretModal';
import { VaultUnlockModal } from './VaultUnlockModal';
import { VaultSetupWizard } from './VaultSetupWizard';
import { formatDistanceToNow } from 'date-fns';

// Import provider logos for BYOK badges
import OpenAILogo from '@/assets/provider-logos/openai.svg?react';
import AnthropicLogo from '@/assets/provider-logos/anthropic.svg?react';
import GoogleLogo from '@/assets/provider-logos/google.svg?react';
import CerebrasLogo from '@/assets/provider-logos/cerebras.svg?react';

// Provider logo mapping
const PROVIDER_LOGOS: Record<string, React.ComponentType<{ className?: string }>> = {
	openai: OpenAILogo,
	anthropic: AnthropicLogo,
	'google-ai-studio': GoogleLogo,
	cerebras: CerebrasLogo,
};

interface Props {
	className?: string;
	compact?: boolean;
	id?: string;
}

export function SecretsManager({ className, compact = false, id }: Props) {
	const { state, isUnlocked, listSecrets, deleteSecret, lockVault, getSecretValue, resetVault } = useVault();
	const [secrets, setSecrets] = useState<SecretListItem[]>([]);
	const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
	const [isResetting, setIsResetting] = useState(false);

	const [isLoading, setIsLoading] = useState(false);
	const [showAddModal, setShowAddModal] = useState(false);
	const [showUnlockModal, setShowUnlockModal] = useState(false);
	const [showSetupModal, setShowSetupModal] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState<SecretListItem | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [viewingSecret, setViewingSecret] = useState<{ id: string; name: string; value?: string } | null>(null);
	const [isLoadingValue, setIsLoadingValue] = useState(false);

	const loadSecrets = useCallback(async () => {
		if (!isUnlocked) return;

		setIsLoading(true);
		try {
			const list = await listSecrets();
			setSecrets(list);
		} catch (err) {
			console.error('Failed to load secrets:', err);
		} finally {
			setIsLoading(false);
		}
	}, [isUnlocked, listSecrets]);

	useEffect(() => {
		if (isUnlocked) {
			loadSecrets();
		} else {
			setSecrets([]);
		}
	}, [isUnlocked, loadSecrets]);

	const handleDelete = async () => {
		if (!deleteConfirm) return;

		setIsDeleting(true);
		try {
			const success = await deleteSecret(deleteConfirm.id);
			if (success) {
				setSecrets((prev) => prev.filter((s) => s.id !== deleteConfirm.id));
			}
		} finally {
			setIsDeleting(false);
			setDeleteConfirm(null);
		}
	};

	const handleSecretAdded = () => {
		loadSecrets();
	};

	const handleViewSecret = async (secret: SecretListItem) => {
		setIsLoadingValue(true);
		setViewingSecret({ id: secret.id, name: secret.name });

		try {
			const result = await getSecretValue(secret.id);
			setViewingSecret((prev) => (prev ? { ...prev, value: result?.value || 'Unable to decrypt' } : null));
		} catch (err) {
			console.error('Failed to get secret value:', err);
			setViewingSecret((prev) => (prev ? { ...prev, value: 'Error loading value' } : null));
		} finally {
			setIsLoadingValue(false);
		}
	};

	// Not setup state
	if (state.status === 'not_setup') {
		return (
			<>
				<Card id={id} className={className}>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Shield className="h-5 w-5" />
							Secrets Vault
						</CardTitle>
						<CardDescription>
							Set up your encrypted vault to securely store API keys and secrets.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button onClick={() => setShowSetupModal(true)} className="w-full">
							<Shield className="h-4 w-4 mr-2" />
							Set Up Vault
						</Button>
					</CardContent>
				</Card>

				<Dialog open={showSetupModal} onOpenChange={setShowSetupModal}>
					<DialogContent className="sm:max-w-lg p-0 overflow-hidden">
						<VaultSetupWizard
							open={showSetupModal}
							onComplete={() => setShowSetupModal(false)}
							onCancel={() => setShowSetupModal(false)}
						/>
					</DialogContent>
				</Dialog>
			</>
		);
	}

	// Locked state
	if (state.status === 'locked') {
		return (
			<>
				<Card id={id} className={className}>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<ShieldOff className="h-5 w-5" />
							Vault Locked
						</CardTitle>
						<CardDescription>Unlock your vault to view and manage secrets.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<Button onClick={() => setShowUnlockModal(true)} className="w-full">
							<Lock className="h-4 w-4 mr-2" />
							Unlock Vault
						</Button>
						<Button
							variant="outline"
							onClick={() => setResetConfirmOpen(true)}
							className="w-full text-destructive hover:text-destructive"
						>
							Reset Vault
						</Button>
						<VaultUnlockModal open={showUnlockModal} onOpenChange={setShowUnlockModal} />
					</CardContent>
				</Card>

				<AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Reset vault?</AlertDialogTitle>
							<AlertDialogDescription>
								This deletes all vault secrets and configuration. This cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
							<AlertDialogAction
								disabled={isResetting}
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
								onClick={async () => {
									setIsResetting(true);
									try {
										await lockVault();
										await resetVault();
										setResetConfirmOpen(false);
									} finally {
										setIsResetting(false);
									}
								}}
							>
								{isResetting ? (
									<>
										<Loader2 className="h-4 w-4 mr-2 animate-spin" />
										Resetting...
									</>
								) : (
									'Reset'
								)}
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</>
		);
	}

	// Unlocked state
	return (
		<Card id={id} className={className}>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<div>
					<CardTitle className="flex items-center gap-2">
						<Shield className="h-5 w-5 text-green-500" />
						Secrets Vault
					</CardTitle>
					{!compact && (
						<CardDescription>
							{secrets.length} secret{secrets.length !== 1 ? 's' : ''} stored securely
						</CardDescription>
					)}
				</div>
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="icon" onClick={loadSecrets} disabled={isLoading}>
						<RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
					</Button>
					<Button variant="ghost" size="icon" onClick={() => lockVault()}>
						<Lock className="h-4 w-4" />
					</Button>
					<Button size="sm" onClick={() => setShowAddModal(true)}>
						<Plus className="h-4 w-4 mr-1" />
						Add
					</Button>
					<Button variant="ghost" size="icon" onClick={() => setResetConfirmOpen(true)}>
						<Trash2 className="h-4 w-4" />
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				{isLoading && secrets.length === 0 ? (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				) : secrets.length === 0 ? (
					<div className="text-center py-8 text-muted-foreground">
						<Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
						<p>No secrets stored yet</p>
						<Button variant="link" onClick={() => setShowAddModal(true)} className="mt-2">
							Add your first secret
						</Button>
					</div>
				) : (
					<div className="space-y-2">
						{secrets.map((secret) => {
							const providerKey = secret.metadata?.provider as string | undefined;
							const ProviderLogo = providerKey ? PROVIDER_LOGOS[providerKey] : null;

							return (
								<div
									key={secret.id}
									className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
								>
									<div className="flex items-center gap-3 min-w-0">
										{ProviderLogo ? (
											<div className="p-2 rounded-md bg-white border shadow-sm">
												<ProviderLogo className="h-4 w-4" />
											</div>
										) : (
											<div className="p-2 rounded-md bg-blue-500/10 text-blue-500">
												<Key className="h-4 w-4" />
											</div>
										)}
										<div className="min-w-0">
											<div className="flex items-center gap-2">
												<p className="font-medium truncate">{secret.name}</p>
												{providerKey && (
													<Badge variant="outline" className="text-xs capitalize">
														{providerKey}
													</Badge>
												)}
											</div>
											{!compact && (
												<p className="text-xs text-muted-foreground">
													Added {formatDistanceToNow(new Date(secret.createdAt), { addSuffix: true })}
												</p>
											)}
										</div>
									</div>
									<div className="flex items-center gap-1">
										<Button
											variant="ghost"
											size="icon"
											className="text-muted-foreground hover:text-foreground"
											onClick={() => handleViewSecret(secret)}
										>
											<Eye className="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="text-muted-foreground hover:text-destructive"
											onClick={() => setDeleteConfirm(secret)}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</CardContent>

			<AddSecretModal
				open={showAddModal}
				onOpenChange={setShowAddModal}
				onSecretAdded={handleSecretAdded}
			/>

			<AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Reset vault?</AlertDialogTitle>
						<AlertDialogDescription>
							This deletes all vault secrets and configuration. This cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={isResetting}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							onClick={async () => {
								setIsResetting(true);
								try {
									await lockVault();
									await resetVault();
									setResetConfirmOpen(false);
								} finally {
									setIsResetting(false);
								}
							}}
						>
							{isResetting ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Resetting...
								</>
							) : (
								'Reset'
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Secret</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							disabled={isDeleting}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							{isDeleting ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Deleting...
								</>
							) : (
								'Delete'
							)}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<Dialog open={!!viewingSecret} onOpenChange={(open) => !open && setViewingSecret(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{viewingSecret?.name}</DialogTitle>
						<DialogDescription>Secret value (encrypted at rest)</DialogDescription>
					</DialogHeader>
					<div className="mt-4">
						{isLoadingValue ? (
							<div className="flex justify-center py-4">
								<Loader2 className="h-6 w-6 animate-spin" />
							</div>
						) : (
							<code className="block p-3 bg-muted rounded-md break-all font-mono text-sm">
								{viewingSecret?.value}
							</code>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
