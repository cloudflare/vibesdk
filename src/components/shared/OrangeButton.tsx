import { forwardRef, type CSSProperties, type ComponentRef } from 'react';
import { Button, type ButtonProps, cn } from '@cloudflare/kumo';

export type OrangeButtonProps = Omit<ButtonProps, 'variant'>;

/** Mirrors Kumo primary emphasis tokens, keyed off brand orange instead of kumo-brand blue. */
const orangeEmphasisStyle = {
	'--kumo-button-emphasis-ring':
		'color-mix(in oklch, var(--color-brand), black 10%)',
	'--kumo-button-emphasis-bg':
		'color-mix(in oklch, var(--color-brand), white 30%)',
	'--kumo-button-emphasis-gradient-start':
		'color-mix(in oklch, var(--color-brand), white 15%)',
	'--kumo-button-emphasis-gradient-end': 'var(--color-brand)',
} as CSSProperties;

export const OrangeButton = forwardRef<
	ComponentRef<typeof Button>,
	OrangeButtonProps
>(function OrangeButton({ className, style, ...props }, ref) {
	return (
		<Button
			ref={ref}
			{...(props as ButtonProps)}
			variant="primary"
			className={cn(className)}
			style={{ ...orangeEmphasisStyle, ...style }}
		/>
	);
});
