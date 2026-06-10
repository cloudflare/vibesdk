import { useState } from 'react';
import { Bot, Layers } from 'lucide-react';
import type { BehaviorType } from '@/api-types';

interface BehaviorModeOption {
	id: Extract<BehaviorType, 'think' | 'phasic'>;
	label: string;
	description: string;
	icon: React.ReactNode;
}

const OPTIONS: BehaviorModeOption[] = [
	{ id: 'think', label: 'Agent', description: 'Adaptive agentic coding loop', icon: <Bot className="size-3" /> },
	{ id: 'phasic', label: 'Phasic', description: 'Structured phase-by-phase generation', icon: <Layers className="size-3" /> },
];

interface BehaviorModeToggleProps {
	value: Extract<BehaviorType, 'think' | 'phasic'>;
	onChange: (mode: Extract<BehaviorType, 'think' | 'phasic'>) => void;
	disabled?: boolean;
	className?: string;
}

export function BehaviorModeToggle({ value, onChange, disabled = false, className = '' }: BehaviorModeToggleProps) {
	const [hovered, setHovered] = useState<string | null>(null);
	return (
		<div className={`flex items-center gap-1 ${className}`}>
			{OPTIONS.map((opt, index) => {
				const isSelected = value === opt.id;
				return (
					<div key={opt.id} className="flex items-center">
						<button
							type="button"
							disabled={disabled}
							onClick={() => onChange(opt.id)}
							onMouseEnter={() => setHovered(opt.id)}
							onMouseLeave={() => setHovered(null)}
							className={
								`relative flex items-center gap-1.5 px-3 py-1.5 text-sm font-normal transition-all duration-200 ease-out ` +
								(disabled ? 'opacity-50 cursor-not-allowed ' : 'cursor-pointer ') +
								(isSelected ? 'text-text-primary' : 'text-text-primary/40 hover:text-text-primary/70')
							}
						>
							{opt.icon}
							{opt.label}
							{isSelected && (
								<div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />
							)}
							{hovered === opt.id && !disabled && (
								<div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 bg-bg-2/95 backdrop-blur-sm border border-text-primary/10 rounded-md text-xs text-text-secondary pointer-events-none z-50">
									{opt.description}
									<div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-bg-2 border-l border-t border-text-primary/10 rotate-45" />
								</div>
							)}
						</button>
						{index < OPTIONS.length - 1 && (
							<div className="w-1 h-1 rounded-full bg-text-primary/10" />
						)}
					</div>
				);
			})}
		</div>
	);
}
