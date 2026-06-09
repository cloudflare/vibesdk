import { useState } from 'react';
import { useVault } from '@/contexts/vault-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle, Loader2, Key } from 'lucide-react';

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSecretAdded?: () => void;
}

export function AddSecretModal({ open, onOpenChange, onSecretAdded }: Props) {
	const { encryptAndStoreSecret, isUnlocked, state } = useVault();
	const [name, setName] = useState('');
	const [value, setValue] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	const handleSave = async () => {
		setError(null);

		if (!isUnlocked) {
			setError('Please unlock your vault first');
			return;
		}

		if (!name.trim()) {
			setError('Please enter a name for the secret');
			return;
		}

		if (!value.trim()) {
			setError('Please enter the secret value');
			return;
		}

		setIsSaving(true);

		try {
			const secretId = await encryptAndStoreSecret(name.trim(), value.trim());

			if (secretId) {
				setName('');
				setValue('');
				onOpenChange(false);
				onSecretAdded?.();
			} else {
				setError(state.error || 'Failed to save secret');
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save secret');
		} finally {
			setIsSaving(false);
		}
	};

	const handleClose = (open: boolean) => {
		if (!open) {
			setName('');
			setValue('');
			setError(null);
		}
		onOpenChange(open);
	};

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Key className="h-5 w-5" />
						Add Secret
					</DialogTitle>
					<DialogDescription>
						Your secret will be encrypted locally before being stored. Only you can decrypt it.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{/* Name */}
					<div className="space-y-2">
						<Label htmlFor="secret-name">Name</Label>
						<Input
							id="secret-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g., API Key, Database Password"
							autoFocus
						/>
					</div>

					{/* Value */}
					<div className="space-y-2">
						<Label htmlFor="secret-value">Secret Value</Label>
						<Input
							id="secret-value"
							type="password"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							placeholder="Enter the secret value"
							onKeyDown={(e) => e.key === 'Enter' && handleSave()}
						/>
					</div>

					{/* Error message */}
					{error && (
						<div className="flex items-center gap-2 text-sm text-destructive">
							<AlertCircle className="h-4 w-4 flex-shrink-0" />
							{error}
						</div>
					)}

					{/* Save button */}
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => handleClose(false)} className="flex-1">
							Cancel
						</Button>
						<Button onClick={handleSave} disabled={isSaving || !isUnlocked} className="flex-1">
							{isSaving ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Encrypting...
								</>
							) : (
								'Add Secret'
							)}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
