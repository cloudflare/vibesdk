import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, Code, FileText, Presentation } from 'lucide-react';
import { featureRegistry } from '@/features';
import type { ProjectType } from '@/api-types';

// Map icon names to components
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
	Eye,
	Presentation,
};

export function ViewModeSwitch({
	view,
	onChange,
	previewAvailable = false,
	showTooltip = false,
	hasDocumentation = false,
	previewUrl,
	projectType,
}: {
	view: 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation'
	onChange: (mode: 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation') => void;
	previewAvailable: boolean;
	showTooltip: boolean;
	hasDocumentation: boolean;
	previewUrl?: string;
	projectType?: ProjectType;
}) {
	// Get feature definition to determine icon and label
	const featureDefinition = projectType ? featureRegistry.getDefinition(projectType) : null;

	// Get the preview view definition to find the icon
	const featureModule = projectType ? featureRegistry.getModule(projectType) : null;
	const views = featureModule?.getViews() ?? [];
	const previewView = views.find(v => v.id === 'preview');
	const iconName = previewView?.iconName;
	const PreviewIcon = (iconName && ICON_MAP[iconName]) || Eye;

	if (!previewAvailable) {
		return null;
	}

	return (
		<div className="flex items-center gap-1 bg-bg-1 rounded-md p-0.5 relative">
			<AnimatePresence>
				{showTooltip && (
					<motion.div
						initial={{ opacity: 0, scale: 0.4 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0 }}
						className="absolute z-50 top-10 left-0 bg-bg-2 text-text-primary text-xs px-2 py-1 rounded whitespace-nowrap animate-fade-in"
					>
						You can view code anytime from here
					</motion.div>
				)}
			</AnimatePresence>

			{/* Preview button - show when app has preview URL */}
			{previewUrl && (
				<button
					onClick={() => onChange('preview')}
					className={clsx(
						'p-1 flex items-center justify-between h-full rounded-md transition-colors',
						view === 'preview' || view === 'presentation'
							? 'bg-bg-4 text-text-primary'
							: 'text-text-50/70 hover:text-text-primary hover:bg-accent',
					)}
					title={featureDefinition?.name ?? 'Preview'}
				>
					<PreviewIcon className="size-4" />
				</button>
			)}

			<button
				onClick={() => onChange('editor')}
				className={clsx(
					'p-1 flex items-center justify-between h-full rounded-md transition-colors',
					view === 'editor'
						? 'bg-bg-4 text-text-primary'
						: 'text-text-50/70 hover:text-text-primary hover:bg-accent',
				)}
				title="Code"
			>
				<Code className="size-4" />
			</button>

			{/* Docs button - show when documentation exists */}
			{hasDocumentation && (
				<button
					onClick={() => onChange('docs')}
					className={clsx(
						'p-1 flex items-center justify-between h-full rounded-md transition-colors',
						view === 'docs'
							? 'bg-bg-4 text-text-primary'
							: 'text-text-50/70 hover:text-text-primary hover:bg-accent',
					)}
					title="Docs"
				>
					<FileText className="size-4" />
				</button>
			)}
			{/* {terminalAvailable && (
				<button
					onClick={() => onChange('terminal')}
					className={clsx(
						'p-1 flex items-center justify-between h-full rounded-md transition-colors',
						view === 'terminal'
							? 'bg-bg-4 text-text-primary'
							: 'text-text-50/70 hover:text-text-primary hover:bg-accent',
					)}
					title="Terminal"
				>
					<Terminal className="size-4" />
				</button>
			)} */}
		</div>
	);
}
