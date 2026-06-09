import clsx from 'clsx';

type ButtonProps = React.ComponentProps<'button'> & {
	variant?: 'primary' | 'secondary';
};

export function Button({
	variant = 'secondary',
	children,
	className,
	...props
}: ButtonProps) {
	return (
		<button
			className={clsx(
				'inline-flex items-center gap-1 px-2 h-8 rounded-lg text-sm font-medium',
				variant === 'primary' && 'bg-bg-bright text-black',
				variant === 'secondary' && 'bg-bg-darkest text-text-primary',
				className,
			)}
			{...props}
		>
			{children}
		</button>
	);
}
