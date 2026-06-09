import type { ReactNode } from 'react';

interface ViewContainerProps {
	children: ReactNode;
}

export function ViewContainer({ children }: ViewContainerProps) {
	return (
		<div className="flex-1 flex flex-col bg-bg-3 rounded-xl shadow-md shadow-bg-2 overflow-hidden border border-border-primary">
			{children}
		</div>
	);
}
