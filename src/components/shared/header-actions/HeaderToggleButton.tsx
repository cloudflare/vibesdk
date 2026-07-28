import type { LucideIcon } from 'lucide-react';
import { cn } from '@cloudflare/kumo';

interface HeaderToggleButtonProps {
	icon: LucideIcon;
	label?: string;
	onClick: () => void;
	title?: string;
	active?: boolean;
}

export function HeaderToggleButton({
	icon: Icon,
	label,
	onClick,
	title,
	active = false,
}: HeaderToggleButtonProps) {
	return (
		<button
			className={cn(
				'group relative flex items-center gap-1.5 p-1.5 group-hover:pl-2 group-hover:pr-2.5 rounded-full group-hover:rounded-md transition-all duration-300 ease-in-out border hover:shadow-sm overflow-hidden',
				active
					? 'bg-brand-primary/20 text-kumo-brand-primary'
					: 'hover:bg-bg-4 border-transparent',
			)}
			onClick={onClick}
			title={title}
			type="button"
		>
			<Icon
				className={cn(
					'size-3.5 transition-colors duration-300',
					active ? 'text-kumo-brand-primary' : 'text-text-primary/60 group-hover:text-kumo-brand-primary',
				)}
			/>
			{label && (
				<span className="max-w-0 group-hover:max-w-xs overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out text-xs text-text-primary/80 group-hover:text-text-primary">
					{label}
				</span>
			)}
		</button>
	);
}
