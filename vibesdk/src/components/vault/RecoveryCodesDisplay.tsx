import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, Check, Download, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
	codes: string[];
	onConfirm?: () => void;
	showWarning?: boolean;
	variant?: 'card' | 'inline';
}

export function RecoveryCodesDisplay({
	codes,
	onConfirm,
	showWarning = true,
	variant = 'card',
}: Props) {
	const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
	const [allCopied, setAllCopied] = useState(false);
	const [confirmed, setConfirmed] = useState(false);

	const handleCopyCode = async (code: string, index: number) => {
		await navigator.clipboard.writeText(code);
		setCopiedIndex(index);
		setTimeout(() => setCopiedIndex(null), 2000);
	};

	const handleCopyAll = async () => {
		await navigator.clipboard.writeText(codes.join('\n'));
		setAllCopied(true);
		setTimeout(() => setAllCopied(false), 2000);
	};

	const handleDownload = () => {
		const content = [
			'Vault Recovery Codes',
			'====================',
			'',
			'Keep these codes safe. Each code can only be used once.',
			'',
			...codes.map((code, i) => `${i + 1}. ${code}`),
			'',
			`Generated: ${new Date().toISOString()}`,
		].join('\n');

		const blob = new Blob([content], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'vault-recovery-codes.txt';
		a.click();
		URL.revokeObjectURL(url);
	};

	const title = (
		<div className="flex items-center gap-2">
			{showWarning && <AlertTriangle className="h-5 w-5 text-amber-500" />}
			<span>Recovery Codes</span>
		</div>
	);

	const description = (
		<p className="text-sm text-muted-foreground">
			These are one-time use codes to recover your vault if you lose access. Store them securely.
		</p>
	);

	const body = (
		<div className="space-y-4">
			<div className="grid grid-cols-2 gap-2">
				{codes.map((code, index) => (
					<button
						key={index}
						onClick={() => handleCopyCode(code, index)}
						className={cn(
							'p-3 rounded-md border font-mono text-sm',
							'bg-muted/50 hover:bg-muted transition-colors',
							'flex items-center justify-between gap-2',
							'focus:outline-none focus:ring-2 focus:ring-primary'
						)}
					>
						<span className="text-muted-foreground text-xs">{index + 1}.</span>
						<span className="flex-1 text-left">{code}</span>
						{copiedIndex === index ? (
							<Check className="h-4 w-4 text-green-500 shrink-0" />
						) : (
							<Copy className="h-4 w-4 text-muted-foreground shrink-0" />
						)}
					</button>
				))}
			</div>

			<div className="flex gap-2">
				<Button variant="outline" onClick={handleCopyAll} className="flex-1">
					{allCopied ? (
						<>
							<Check className="h-4 w-4 mr-2" />
							Copied
						</>
					) : (
						<>
							<Copy className="h-4 w-4 mr-2" />
							Copy All
						</>
					)}
				</Button>
				<Button variant="outline" onClick={handleDownload} className="flex-1">
					<Download className="h-4 w-4 mr-2" />
					Download
				</Button>
			</div>

			{onConfirm && (
				<>
					<div className="border-t pt-4">
						<label className="flex items-start gap-3 cursor-pointer">
							<input
								type="checkbox"
								checked={confirmed}
								onChange={(e) => setConfirmed(e.target.checked)}
								className="mt-1 rounded"
							/>
							<span className="text-sm">
								I understand that these codes are the only way to recover my vault if I forget my
								password or lose my passkey. I have saved them securely.
							</span>
						</label>
					</div>

					<Button onClick={onConfirm} disabled={!confirmed} className="w-full">
						I've Saved My Codes
					</Button>
				</>
			)}
		</div>
	);

	if (variant === 'inline') {
		return (
			<div className="space-y-4">
				<div className="space-y-1">
					<div className="flex items-center gap-2 text-base font-semibold">
						{showWarning && <AlertTriangle className="h-5 w-5 text-amber-500" />}
						Recovery Codes
					</div>
					{description}
				</div>
				{body}
			</div>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>{body}</CardContent>
		</Card>
	);
}
