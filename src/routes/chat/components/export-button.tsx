import { useState } from 'react';
import { Loader, Check, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';

interface ExportButtonProps {
	icon: LucideIcon;
	onClick: () => void | Promise<void>;
	tooltip: string;
	disabled?: boolean;
}

export function ExportButton({ icon: Icon, onClick, tooltip, disabled }: ExportButtonProps) {
	const [state, setState] = useState<'idle' | 'loading' | 'success'>('idle');

	const handleClick = async () => {
		if (disabled || state !== 'idle') return;

		setState('loading');
		try {
			await onClick();
			setState('success');
			setTimeout(() => setState('idle'), 2000);
		} catch (error) {
			console.error('Export failed:', error);
			setState('idle');
		}
	};

	const CurrentIcon = state === 'loading' ? Loader : state === 'success' ? Check : Icon;

	return (
		<button
			onClick={handleClick}
			disabled={disabled || state !== 'idle'}
			title={tooltip}
			className={clsx(
				'p-1.5 rounded-md transition-colors',
				'hover:bg-bg-3 disabled:opacity-50 disabled:cursor-not-allowed',
				state === 'idle' && 'text-text-primary/70 hover:text-text-primary'
			)}
		>
			<CurrentIcon
				className={clsx(
					'size-4',
					state === 'loading' && 'animate-spin',
					state === 'success' && 'text-green-500'
				)}
			/>
		</button>
	);
}
