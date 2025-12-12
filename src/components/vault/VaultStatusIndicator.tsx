import { useState } from 'react';
import { useVault } from '@/hooks/use-vault';
import { Button } from '@/components/ui/button';
import { VaultUnlockModal } from './VaultUnlockModal';
import { VaultSetupWizard } from './VaultSetupWizard';
import { Lock, Unlock, ShieldOff, Loader2 } from 'lucide-react';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import {
	Dialog,
	DialogContent,
} from '@/components/ui/dialog';

export function VaultStatusIndicator() {
	const { state, lockVault } = useVault();
	const [showUnlock, setShowUnlock] = useState(false);
	const [showSetup, setShowSetup] = useState(false);

	if (state.isLoading) {
		return (
			<Button variant="ghost" size="sm" disabled className="gap-1.5">
				<Loader2 className="h-4 w-4 animate-spin" />
				<span className="hidden sm:inline">Vault</span>
			</Button>
		);
	}

	if (state.status === 'not_setup') {
		return (
			<>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => setShowSetup(true)}
							className="text-muted-foreground hover:text-foreground"
						>
							<ShieldOff className="h-4 w-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>Set up your secure vault to store API keys</p>
					</TooltipContent>
				</Tooltip>
				<Dialog open={showSetup} onOpenChange={setShowSetup}>
					<DialogContent className="sm:max-w-lg p-0 overflow-hidden">
						<VaultSetupWizard
							open={showSetup}
							onComplete={() => setShowSetup(false)}
							onCancel={() => setShowSetup(false)}
						/>
					</DialogContent>
				</Dialog>
			</>
		);
	}

	if (state.status === 'locked') {
		return (
			<>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => setShowUnlock(true)}
							className="text-amber-500 hover:text-amber-600"
						>
							<Lock className="h-4 w-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						<p>Unlock vault to access your secrets</p>
					</TooltipContent>
				</Tooltip>
				<VaultUnlockModal open={showUnlock} onOpenChange={setShowUnlock} />
			</>
		);
	}

	if (state.status === 'unlocked') {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						onClick={lockVault}
						className="text-green-500 hover:text-green-600"
					>
						<Unlock className="h-4 w-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<p>Click to lock your vault</p>
				</TooltipContent>
			</Tooltip>
		);
	}

	// Unknown state - don't render
	return null;
}
