import { useId, type ComponentType } from 'react';
import type { IconProps } from '@phosphor-icons/react';

export type BrandEmphasisIconProps = IconProps & {
	icon: ComponentType<IconProps>;
};

/** Applies the same vertical brand gradient as `text-brand-emphasis` to a Phosphor icon. */
export function BrandEmphasisIcon({
	icon: Icon,
	children,
	...props
}: BrandEmphasisIconProps) {
	const gradientId = useId().replace(/:/g, '');

	return (
		<Icon {...props} color={`url(#${gradientId})`}>
			<defs>
				<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
					<stop
						offset="0%"
						stopColor="color-mix(in oklch, var(--color-brand), white 15%)"
					/>
					<stop offset="100%" stopColor="var(--color-brand)" />
				</linearGradient>
			</defs>
			{children}
		</Icon>
	);
}
