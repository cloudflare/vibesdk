import { useEffect, useState } from 'react';
import { useVault } from '@/hooks/use-vault';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Fingerprint, KeyRound, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	reason?: string;
}

type UnlockMethod = 'passkey' | 'password' | 'recovery';

type UnlockResult = { success: boolean; error?: string };

export function VaultUnlockModal({ open, onOpenChange, reason }: Props) {
	const { unlockWithPassword, unlockWithPasskey, unlockWithRecoveryCode, resetVault, state } = useVault();
	const hasPasskey = state.unlockMethod === 'webauthn-prf';

	const [method, setMethod] = useState<UnlockMethod>(hasPasskey ? 'passkey' : 'password');
	const [password, setPassword] = useState('');
	const [recoveryCode, setRecoveryCode] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [isUnlocking, setIsUnlocking] = useState(false);
	const [showResetConfirm, setShowResetConfirm] = useState(false);

	useEffect(() => {
		if (!open) return;
		setError(null);
		setPassword('');
		setRecoveryCode('');
		setMethod(hasPasskey ? 'passkey' : 'password');
	}, [hasPasskey, open]);

	const handleUnlock = async () => {
		setError(null);
		setIsUnlocking(true);

		try {
			let result: UnlockResult = { success: false, error: 'Unlock failed' };

			switch (method) {
				case 'passkey':
					result = await unlockWithPasskey();
					break;
				case 'password':
					if (!password) {
						setError('Please enter your password');
						setIsUnlocking(false);
						return;
					}
					result = await unlockWithPassword(password);
					break;
				case 'recovery':
					if (!recoveryCode) {
						setError('Please enter a recovery code');
						setIsUnlocking(false);
						return;
					}
					result = await unlockWithRecoveryCode(recoveryCode);
					break;
			}

			if (result.success) {
				onOpenChange(false);
				setPassword('');
				setRecoveryCode('');
			} else {
				setError(result.error ?? 'Unlock failed');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Unlock failed');
		} finally {
			setIsUnlocking(false);
		}
	};

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Unlock Vault</DialogTitle>
						<DialogDescription>
							{reason ?? 'Your secrets are encrypted. Unlock your vault to access them.'}
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-4 py-4">
						<div className="flex gap-2">
							{hasPasskey && (
								<Button
									variant={method === 'passkey' ? 'default' : 'outline'}
									onClick={() => setMethod('passkey')}
									className="flex-1"
								>
									<Fingerprint className="h-4 w-4 mr-2" />
									Passkey
								</Button>
							)}
							<Button
								variant={method === 'password' ? 'default' : 'outline'}
								onClick={() => setMethod('password')}
								className="flex-1"
							>
								<KeyRound className="h-4 w-4 mr-2" />
								Password
							</Button>
						</div>

						{method === 'passkey' && (
							<div className="text-center py-4">
								<Fingerprint className="h-12 w-12 mx-auto text-primary mb-3" />
								<p className="text-sm text-muted-foreground">
									Click unlock to authenticate with your passkey
								</p>
							</div>
						)}

						{method === 'password' && (
							<div className="space-y-2">
								<Label htmlFor="unlock-password">Vault Password</Label>
								<Input
									id="unlock-password"
									type="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
									placeholder="Enter your vault password"
									autoFocus
								/>
							</div>
						)}

						{method === 'recovery' && (
							<div className="space-y-2">
								<Label htmlFor="recovery-code">Recovery Code</Label>
								<Input
									id="recovery-code"
									value={recoveryCode}
									onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
									onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
									placeholder="XXXXX-XXXXX"
									className="font-mono"
									autoFocus
								/>
							</div>
						)}

						{error && (
							<div className="flex items-center gap-2 text-sm text-destructive">
								<AlertCircle className="h-4 w-4" />
								{error}
							</div>
						)}

						{error?.includes('Vault configuration invalid') && (
							<Button variant="destructive" onClick={() => setShowResetConfirm(true)} className="w-full">
								Reset Vault
							</Button>
						)}

						<Button onClick={handleUnlock} disabled={isUnlocking} className="w-full">
							{isUnlocking ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Unlocking...
								</>
							) : (
								'Unlock'
							)}
						</Button>

						{method !== 'recovery' && (
							<button
								onClick={() => setMethod('recovery')}
								className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
							>
								Use recovery code instead
							</button>
						)}
					</div>
				</DialogContent>
			</Dialog>

			<AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Reset vault?</AlertDialogTitle>
						<AlertDialogDescription>
							This deletes all vault secrets and configuration for this account.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								setShowResetConfirm(false);
								const ok = await resetVault();
								if (ok) onOpenChange(false);
							}}
						>
							Reset
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
