import type { LucideIcon } from 'lucide-react';

interface HeaderButtonProps {
	icon: LucideIcon;
	label?: string;
	onClick: () => void;
	title?: string;
	iconOnly?: boolean;
}

export function HeaderButton({
	icon: Icon,
	label,
	onClick,
	title,
	iconOnly = false,
}: HeaderButtonProps) {
	if (iconOnly) {
		return (
			<button
				className="p-1.5 rounded-full transition-all duration-300 ease-in-out hover:bg-bg-4 border border-transparent hover:border-border-primary hover:shadow-sm"
				onClick={onClick}
				title={title}
				type="button"
			>
				<Icon className="size-3.5 text-text-primary/60 hover:text-brand-primary transition-colors duration-300" />
			</button>
		);
	}

	return (
		<button
			className="group relative flex items-center gap-1.5 p-1.5 group-hover:pl-2 group-hover:pr-2.5 rounded-full group-hover:rounded-md transition-all duration-300 ease-in-out hover:bg-bg-4 border border-transparent hover:border-border-primary hover:shadow-sm overflow-hidden"
			onClick={onClick}
			title={title}
			type="button"
		>
			<Icon className="size-3.5 text-text-primary/60 group-hover:text-brand-primary transition-colors duration-300" />
			{label && (
				<span className="max-w-0 group-hover:max-w-xs overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out text-xs text-text-primary/80 group-hover:text-text-primary">
					{label}
				</span>
			)}
		</button>
	);
}
