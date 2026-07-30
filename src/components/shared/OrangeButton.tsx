import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { Button, cn } from '@cloudflare/kumo';

type OrangeButtonSize = 'xs' | 'sm' | 'base' | 'lg';
type OrangeButtonShape = 'base' | 'square' | 'circle';

export interface OrangeButtonProps {
	children?: ReactNode;
	className?: string;
	disabled?: boolean;
	/** Stretch to fill the parent width (e.g. sidebar CTAs). */
	fullWidth?: boolean;
	icon?: ReactNode;
	id?: string;
	loading?: boolean;
	onClick?: MouseEventHandler<HTMLButtonElement>;
	shape?: OrangeButtonShape;
	size?: OrangeButtonSize;
	type?: 'button' | 'submit' | 'reset';
	/** Tooltip content; also used as accessible name for icon-only buttons. */
	title?: string;
	'aria-label'?: string;
	'aria-labelledby'?: string;
}

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

export function OrangeButton({
	children,
	className,
	disabled,
	fullWidth = false,
	icon,
	id,
	loading,
	onClick,
	shape = 'base',
	size = 'base',
	type = 'button',
	title,
	'aria-label': ariaLabel,
	'aria-labelledby': ariaLabelledBy,
}: OrangeButtonProps) {
	const mergedClassName = cn(fullWidth && 'w-full justify-start', className);

	if (shape === 'square' || shape === 'circle') {
		return (
			<Button
				type={type}
				shape={shape}
				size={size}
				variant="primary"
				className={mergedClassName}
				style={orangeEmphasisStyle}
				disabled={disabled}
				icon={icon}
				id={id}
				loading={loading}
				onClick={onClick}
				title={title ?? ariaLabel ?? ''}
				aria-label={ariaLabel}
				aria-labelledby={ariaLabelledBy}
			/>
		);
	}

	return (
		<Button
			type={type}
			shape="base"
			size={size}
			variant="primary"
			className={mergedClassName}
			style={orangeEmphasisStyle}
			disabled={disabled}
			icon={icon}
			id={id}
			loading={loading}
			onClick={onClick}
			title={title}
			aria-label={ariaLabel}
			aria-labelledby={ariaLabelledBy}
		>
			{children}
		</Button>
	);
}
