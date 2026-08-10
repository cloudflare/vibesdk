import { Tabs } from '@cloudflare/kumo';
import { GlobeIcon, LockIcon, SparkleIcon } from '@phosphor-icons/react';

interface VisibilityFilterProps {
	value: string;
	onChange: (value: string) => void;
	className?: string;
}

const visibilityOptions = [
	{
		value: 'all',
		label: 'All',
		icon: SparkleIcon,
	},
	{
		value: 'public',
		label: 'Public',
		icon: GlobeIcon,
	},
	{
		value: 'private',
		label: 'Private',
		icon: LockIcon,
	},
] as const;

export function VisibilityFilter({
	value,
	onChange,
	className,
}: VisibilityFilterProps) {
	return (
		<Tabs
			value={value}
			onValueChange={onChange}
			size="sm"
			className={className}
			tabs={visibilityOptions.map((option) => {
				const Icon = option.icon;
				return {
					value: option.value,
					label: (
						<span className="inline-flex items-center gap-1.5">
							<span className="h-lh flex items-center">
								<Icon className="size-3" weight="duotone" />
							</span>
							{option.label}
						</span>
					),
				};
			})}
		/>
	);
}
