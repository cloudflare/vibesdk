import type { ReactNode } from 'react';

interface ViewContainerProps {
	children: ReactNode;
}

export function ViewContainer({ children }: ViewContainerProps) {
	return (
		<div className="flex-1 flex flex-col bg-kumo-base overflow-hidden border-l">
			{children}
		</div>
	);
}
