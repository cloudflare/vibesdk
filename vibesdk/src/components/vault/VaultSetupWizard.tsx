import { useCallback, useEffect, useMemo, useState } from 'react';
import { useVault } from '@/hooks/use-vault';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { RecoveryCodesDisplay } from './RecoveryCodesDisplay';
import { AlertCircle, Fingerprint, KeyRound, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'setup' | 'recovery';

type SetupMethod = 'passkey' | 'password';

interface Props {
	open: boolean;
	onComplete?: () => void;
	onCancel?: () => void;
}

export function VaultSetupWizard({ open, onComplete, onCancel }: Props) {
	const { setupVaultWithPassword, setupVaultWithPasskey } = useVault();

	const passkeySupported = useMemo(() => {
		return typeof window !== 'undefined' && !!window.PublicKeyCredential;
	}, []);

	const [step, setStep] = useState<Step>('setup');
	const [method, setMethod] = useState<SetupMethod | null>(null);
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);

	const resetState = useCallback(() => {
		setStep('setup');
		setMethod(null);
		setPassword('');
		setConfirmPassword('');
		setRecoveryCodes(null);
		setError(null);
		setIsCreating(false);
	}, []);

	useEffect(() => {
		if (!open) return;
		resetState();
	}, [open, resetState]);

	const passwordError = useMemo(() => {
		if (method !== 'password') return null;
		if (password.length > 0 && password.length < 12) return 'Password must be at least 12 characters';
		if (confirmPassword.length > 0 && password !== confirmPassword) return 'Passwords do not match';
		return null;
	}, [confirmPassword, method, password]);

	const canCreate = useMemo(() => {
		if (!method) return false;
		if (method === 'passkey') return true;
		return password.length >= 12 && password === confirmPassword;
	}, [confirmPassword, method, password]);

	const handleCreate = async () => {
		if (!method) return;
		setError(null);
		setIsCreating(true);

		try {
			let codes: string[];
			if (method === 'passkey') {
				if (!passkeySupported) {
					throw new Error('Passkeys are not supported in this browser');
				}
				codes = await setupVaultWithPasskey();
			} else {
				if (password !== confirmPassword) {
					throw new Error('Passwords do not match');
				}
				if (password.length < 12) {
					throw new Error('Password must be at least 12 characters');
				}
				codes = await setupVaultWithPassword(password);
			}

			setRecoveryCodes(codes);
			setStep('recovery');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Setup failed');
		} finally {
			setIsCreating(false);
		}
	};

	if (step === 'recovery' && recoveryCodes) {
		return (
			<div className="p-6">
				<h2 className="text-lg font-semibold">Save your recovery codes</h2>
				<p className="text-sm text-muted-foreground mt-1">
					These are the only way to regain access if you lose your unlock method.
				</p>

				<Separator className="my-4" />

				<RecoveryCodesDisplay
					codes={recoveryCodes}
					onConfirm={() => onComplete?.()}
					showWarning
					variant="inline"
				/>

				<div className="mt-6 flex items-center justify-between">
					<Button
						variant="outline"
						onClick={() => {
							setError(null);
							setStep('setup');
						}}
					>
						Back
					</Button>
					{onCancel ? (
						<Button
							variant="ghost"
							onClick={() => {
								resetState();
								onCancel();
							}}
						>
							Cancel
						</Button>
					) : (
						<div />
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="p-6">
			<h2 className="text-lg font-semibold">Set up your vault</h2>
			<p className="text-sm text-muted-foreground mt-1">
				Choose how you’ll unlock this vault. You’ll get recovery codes next.
			</p>

			<Separator className="my-4" />

			<div className="space-y-4">
				<div className="grid gap-2">
					{passkeySupported && (
						<button
							type="button"
							onClick={() => setMethod('passkey')}
							className={cn(
								'rounded-lg border p-4 text-left transition-colors',
								'focus:outline-none focus:ring-2 focus:ring-primary',
								method === 'passkey'
									? 'border-primary bg-muted/40'
									: 'hover:bg-muted/30'
							)}
						>
							<div className="flex items-start gap-3">
								<Fingerprint className="h-5 w-5 text-primary mt-0.5" />
								<div>
									<div className="font-medium">Passkey</div>
									<div className="text-sm text-muted-foreground mt-1">
										Touch ID / Face ID / security key.
									</div>
								</div>
							</div>
						</button>
					)}

					<button
						type="button"
						onClick={() => setMethod('password')}
						className={cn(
							'rounded-lg border p-4 text-left transition-colors',
							'focus:outline-none focus:ring-2 focus:ring-primary',
							method === 'password' ? 'border-primary bg-muted/40' : 'hover:bg-muted/30'
						)}
					>
						<div className="flex items-start gap-3">
							<KeyRound className="h-5 w-5 text-muted-foreground mt-0.5" />
							<div>
								<div className="font-medium">Password</div>
								<div className="text-sm text-muted-foreground mt-1">
									Works on all devices. Use at least 12 characters.
								</div>
							</div>
						</div>
					</button>
				</div>

				{method === 'password' && (
					<div className="space-y-3">
						<div className="space-y-2">
							<Label htmlFor="vault-password">Password</Label>
							<Input
								id="vault-password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="At least 12 characters"
								autoFocus
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="vault-confirm">Confirm password</Label>
							<Input
								id="vault-confirm"
								type="password"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								placeholder="Re-enter your password"
								onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
							/>
						</div>
						{passwordError && (
							<div className="text-sm text-destructive">{passwordError}</div>
						)}
					</div>
				)}

				{error && (
					<div className="flex items-center gap-2 text-sm text-destructive">
						<AlertCircle className="h-4 w-4" />
						{error}
					</div>
				)}

				<div className="flex items-center justify-between gap-2 pt-2">
					{onCancel ? (
						<Button
							variant="ghost"
							onClick={() => {
								resetState();
								onCancel();
							}}
						>
							Cancel
						</Button>
					) : (
						<div />
					)}

					<Button
						onClick={handleCreate}
						disabled={!canCreate || isCreating}
						className="min-w-32"
					>
						{isCreating ? (
							<>
								<Loader2 className="h-4 w-4 mr-2 animate-spin" />
								Creating
							</>
						) : method === 'passkey' ? (
							'Create passkey'
						) : (
							'Create vault'
						)}
					</Button>
				</div>
			</div>
		</div>
	);
}
