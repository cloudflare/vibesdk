import { useState } from 'react';
import type { ProjectType } from '@/api-types';

export interface ProjectModeOption {
	id: ProjectType;
	label: string;
	description: string;
}

interface ProjectModeSelectorProps {
	value: ProjectType;
	onChange: (mode: ProjectType) => void;
	modes: ProjectModeOption[];
	disabled?: boolean;
	className?: string;
}

export function ProjectModeSelector({
	value,
	onChange,
	modes,
	disabled = false,
	className = '',
}: ProjectModeSelectorProps) {
	const [hoveredMode, setHoveredMode] = useState<ProjectType | null>(null);

	return (
		<div className={`flex items-center gap-1 ${className}`}>
			{modes.map((mode, index) => {
				const isSelected = value === mode.id;
				const isHovered = hoveredMode === mode.id;

				return (
					<div key={mode.id} className="flex items-center">
						<button
							type="button"
							disabled={disabled}
							onClick={() => onChange(mode.id)}
							onMouseEnter={() => setHoveredMode(mode.id)}
							onMouseLeave={() => setHoveredMode(null)}
							className={
								`relative px-3 py-1.5 text-sm font-normal transition-all duration-200 ease-out ` +
								(disabled ? 'opacity-50 cursor-not-allowed ' : 'cursor-pointer ') +
								(isSelected
									? 'text-text-primary'
									: 'text-text-primary/40 hover:text-text-primary/70')
							}
						>
							{mode.label}
							{isSelected && (
								<div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />
							)}
							{isHovered && !disabled && (
								<div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 bg-bg-2/95 backdrop-blur-sm border border-text-primary/10 rounded-md text-xs text-text-secondary pointer-events-none z-50">
									{mode.description}
									<div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-bg-2 border-l border-t border-text-primary/10 rotate-45" />
								</div>
							)}
						</button>
						{index < modes.length - 1 && (
							<div className="w-1 h-1 rounded-full bg-text-primary/10" />
						)}
					</div>
				);
			})}
		</div>
	);
}

