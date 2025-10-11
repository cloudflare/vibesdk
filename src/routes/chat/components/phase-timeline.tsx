import clsx from 'clsx';
import { Loader, Check, AlertCircle, ChevronDown, ChevronRight, ArrowUp, Zap } from 'lucide-react';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PhaseTimelineItem, FileType } from '../hooks/use-chat';
import { ThinkingIndicator } from './thinking-indicator';

import type { ProjectStage } from '../utils/project-stage-helpers';

// Unified status type for consistency
type UnifiedStatus = 'pending' | 'active' | 'completed' | 'error' | 'generating' | 'validating';

// Animation variants and transitions for consistent motion
const statusIconVariants = {
	initial: { scale: 0.2, opacity: 0.4 },
	animate: { scale: 1, opacity: 1 },
	exit: { scale: 0.2, opacity: 0.4 },
};

const commonTransitions = {
	smooth: { duration: 0.3, ease: 'easeOut' as const },
	premium: { duration: 0.4, ease: [0.23, 1, 0.32, 1] as const },
	fast: { duration: 0.2, ease: 'easeOut' as const },
	premiumShort: { duration: 0.3, ease: [0.23, 1, 0.32, 1] as const },
	smoothInOut: { duration: 0.3, ease: 'easeInOut' as const },
};

// Centralized phase status utilities
const getPhaseByStatus = (phases: PhaseTimelineItem[], status: PhaseTimelineItem['status']) =>
	phases.find(p => p.status === status);

const getLastCompletedPhase = (phases: PhaseTimelineItem[]) =>
	[...phases].reverse().find(p => p.status === 'completed');

const getCompletedPhaseCount = (phases: PhaseTimelineItem[]) =>
	phases.filter(p => p.status === 'completed').length;

// Consolidated status-specific loader components
interface StatusLoaderProps {
	size?: 'sm' | 'md';
	color?: 'accent' | 'blue' | 'orange' | 'tertiary' | 'green';
}

const StatusLoader = ({ size = 'md', color = 'accent' }: StatusLoaderProps) => {
	const sizeClass = size === 'sm' ? 'size-3' : 'w-4 h-4';
	const colorMap = {
		accent: 'text-accent',
		blue: 'text-blue-400',
		orange: 'text-orange-400',
		tertiary: 'text-text-tertiary',
		green: 'text-green-500'
	};
	return <Loader className={`${sizeClass} animate-spin ${colorMap[color]}`} />;
};

const StatusCheck = ({ size = 'md', color = 'green' }: StatusLoaderProps) => {
	const sizeClass = size === 'sm' ? 'size-3' : 'w-4 h-4';
	const colorMap = {
		accent: 'text-accent',
		blue: 'text-blue-400',
		orange: 'text-orange-400',
		tertiary: 'text-text-tertiary',
		green: 'text-green-500'
	};
	return <Check className={`${sizeClass} ${colorMap[color]}`} />;
};

// Unified StatusIcon component to eliminate DRY
interface StatusIconProps {
	status: UnifiedStatus;
	size?: 'sm' | 'md';
	className?: string;
}

function StatusIcon({ status, size = 'md', className }: StatusIconProps) {
	const sizeClasses = {
		sm: 'w-3 h-3',
		md: 'w-4 h-4',
	};

	const iconClasses = sizeClasses[size];

	switch (status) {
		case 'generating':
			return <Loader className={clsx(iconClasses, 'animate-spin text-accent', className)} />;
		case 'validating':
			return <Loader className={clsx(iconClasses, 'animate-spin text-blue-400', className)} />;
		case 'completed':
			return <Check className={clsx(iconClasses, 'text-green-500', className)} />;
		case 'error':
			return <AlertCircle className={clsx(iconClasses, 'text-red-500', className)} />;
		case 'active':
			return <Loader className={clsx(iconClasses, 'animate-spin text-accent', className)} />;
		case 'pending':
		default:
			return <div className={clsx(iconClasses, 'bg-bg-3-foreground/40 dark:bg-bg-3-foreground/30 rounded-full', className)} />;
	}
}

// Animated Status Indicator for project stages
interface AnimatedStatusIndicatorProps {
	status: 'pending' | 'active' | 'completed' | 'error';
	size?: number;
}

function AnimatedStatusIndicator({ status, size = 5 }: AnimatedStatusIndicatorProps) {
	const sizeClass = `size-${size}`;

	return (
		<div className="translate-y-px z-20">
			<AnimatePresence mode="wait">
				{status === 'pending' && (
					<motion.div
						key="pending"
						variants={statusIconVariants}
						initial="initial"
						animate="animate"
						exit="exit"
						transition={commonTransitions.smoothInOut}
						className={clsx(sizeClass, 'flex items-center justify-center')}
					>
						<div className="size-2 rounded-full bg-zinc-300" />
					</motion.div>
				)}
				{status === 'active' && (
					<motion.div
						key="active"
						variants={statusIconVariants}
						initial="initial"
						animate="animate"
						exit="exit"
						transition={commonTransitions.smoothInOut}
						className={clsx(sizeClass, 'bg-bg-4 dark:bg-bg-2 flex items-center justify-center')}
					>
						<Loader className="size-3 text-accent animate-spin" />
					</motion.div>
				)}
				{status === 'completed' && (
					<motion.div
						key="completed"
						variants={statusIconVariants}
						initial="initial"
						animate="animate"
						exit="exit"
						transition={commonTransitions.smoothInOut}
						className={clsx(sizeClass, 'flex items-center justify-center')}
					>
						<div className="size-2 rounded-full bg-accent" />
					</motion.div>
				)}
				{status === 'error' && (
					<motion.div
						key="error"
						variants={statusIconVariants}
						initial="initial"
						animate="animate"
						exit="exit"
						transition={commonTransitions.smoothInOut}
						className={clsx(sizeClass, 'flex items-center justify-center')}
					>
						<AlertCircle className="size-3 text-red-500" />
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

interface PhaseTimelineProps {
	projectStages: ProjectStage[];
	phaseTimeline: PhaseTimelineItem[];
	files: FileType[];
	view: string;
	activeFile?: FileType;
	onFileClick: (file: FileType) => void;
	isThinkingNext?: boolean;
	isPreviewDeploying?: boolean;
	progress: number;
	total: number;
	parentScrollRef?: RefObject<HTMLDivElement | null>;
	onViewChange?: (view: 'blueprint') => void;
	// Deployment functionality
	chatId?: string;
	isDeploying?: boolean;
	handleDeployToCloudflare?: (instanceId: string) => void;
}

// Helper function to truncate long file paths
function truncateFilePath(filePath: string, maxLength: number = 30): string {
	if (filePath.length <= maxLength) return filePath;

	const parts = filePath.split('/');
	const fileName = parts[parts.length - 1];

	// If even the filename is too long, truncate it more aggressively
	if (fileName.length > maxLength - 8) {
		const extension = fileName.includes('.') ? '.' + fileName.split('.').pop() : '';
		const nameWithoutExt = fileName.replace(extension, '');
		const truncatedName = nameWithoutExt.substring(0, Math.max(8, maxLength - 12));
		return `[...]/${truncatedName}[...]${extension}`;
	}

	// Otherwise, truncate the path but keep the filename
	const pathWithoutFile = parts.slice(0, -1).join('/');
	const availableSpace = maxLength - fileName.length - 6; // 6 for '[...]/'

	if (availableSpace <= 0) {
		return `[...]/${fileName}`;
	}

	// More aggressive path truncation
	if (pathWithoutFile.length > availableSpace) {
		return `[...]/${fileName}`;
	}

	return `${pathWithoutFile.substring(0, availableSpace)}[...]/${fileName}`;
}

// Helper function to truncate phase names consistently
function truncatePhaseName(name: string, maxLength: number = 40): string {
	return name.length > maxLength ? `${name.slice(0, maxLength)}...` : name;
}

// Helper function to calculate incremental line count for a file in a specific phase
function calculateIncrementalLineCount(
	currentFilePath: string,
	currentPhaseIndex: number,
	phaseTimeline: PhaseTimelineItem[],
	globalFiles: FileType[]
): number {
	const globalFile = globalFiles.find(f => f.filePath === currentFilePath);
	if (!globalFile) return 0;

	const currentTotalLines = globalFile.fileContents.split('\n').length;

	// Find the previous phase that contains this same file
	for (let i = currentPhaseIndex - 1; i >= 0; i--) {
		const previousPhase = phaseTimeline[i];
		const previousPhaseFile = previousPhase.files.find(f => f.path === currentFilePath);

		if (previousPhaseFile && previousPhaseFile.contents) {
			const previousLines = previousPhaseFile.contents.split('\n').length;
			return Math.max(0, currentTotalLines - previousLines); // Ensure non-negative
		}
	}

	// If this is the first appearance of the file, return the total line count
	return currentTotalLines;
}


export function PhaseTimeline({
	projectStages,
	phaseTimeline,
	files,
	view,
	activeFile,
	onFileClick,
	isThinkingNext,
	isPreviewDeploying,
	progress,
	total,
	parentScrollRef,
	onViewChange,
	chatId,
	isDeploying,
	handleDeployToCloudflare
}: PhaseTimelineProps) {
	const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
	const [showCollapsedBar, setShowCollapsedBar] = useState(false);
	const [isCollapsedBarExpanded, setIsCollapsedBarExpanded] = useState(false);
	const componentRef = useRef<HTMLDivElement>(null);
	const lastPhaseRef = useRef<HTMLDivElement>(null);
	const timelineCardRef = useRef<HTMLDivElement>(null);

	// Auto-expand only the currently generating or validating phase
	useEffect(() => {
		const activePhase = phaseTimeline.find(p => p.status === 'generating' || p.status === 'validating');
		if (activePhase) {
			setExpandedPhases(new Set([activePhase.id]));
		}
	}, [phaseTimeline]);

	// Reset collapsed bar expanded state when it disappears
	useEffect(() => {
		if (!showCollapsedBar) {
			setIsCollapsedBarExpanded(false);
		}
	}, [showCollapsedBar]);

	// Auto-scroll to bottom when new phases are added or thinking indicator appears
	useEffect(() => {
		if (lastPhaseRef.current) {
			lastPhaseRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
		}
	}, [phaseTimeline.length, isThinkingNext]);

	// Show/hide collapsed bar when 60% of timeline card has scrolled out of view
	useEffect(() => {
		const parentEl = parentScrollRef?.current;
		const timelineCard = timelineCardRef.current;
		if (!timelineCard || !parentEl) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				// Show collapsed bar when 30% of timeline has scrolled out of view
				const shouldCollapse = entry.intersectionRatio < 0.7; // 70% visible = 30% scrolled out
				const hasContent = projectStages.length > 0 || phaseTimeline.length > 0;
				setShowCollapsedBar(shouldCollapse && hasContent);
			},
			{
				root: parentEl,
				rootMargin: '0px 0px 0px 0px', // No margin - watch the actual card
				threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] // Granular thresholds
			}
		);

		observer.observe(timelineCard);
		return () => observer.disconnect();
	}, [parentScrollRef, projectStages.length, phaseTimeline.length]);

	// Get current status info for the collapsed bar
	const collapsedBarInfo = useMemo(() => {
		const completedPhases = getCompletedPhaseCount(phaseTimeline);
		const phaseBadge = phaseTimeline.length > 0 ? `${completedPhases}/${phaseTimeline.length}` : undefined;

		const validatingPhase = getPhaseByStatus(phaseTimeline, 'validating');
		if (validatingPhase) {
			return {
				text: `Reviewing: ${truncatePhaseName(validatingPhase.name)}`,
				subtitle: 'Running tests and fixing issues...',
				icon: <StatusLoader color="blue" />,
				badge: phaseBadge
			};
		}

		const generatingPhase = getPhaseByStatus(phaseTimeline, 'generating');
		if (generatingPhase) {
			return {
				text: `Implementing: ${truncatePhaseName(generatingPhase.name)}`,
				subtitle: `${progress}/${total} phases`,
				icon: <StatusLoader color="accent" />,
				badge: phaseBadge
			};
		}

		if (isPreviewDeploying) {
			return {
				text: 'Deploying preview',
				subtitle: 'Updating preview environment...',
				icon: <StatusLoader color="orange" />,
				badge: phaseBadge
			};
		}

		if (isThinkingNext) {
			return {
				text: 'Planning next phase',
				subtitle: 'Analyzing requirements...',
				icon: <StatusLoader color="tertiary" />,
				badge: phaseBadge
			};
		}

		const lastCompletedPhase = getLastCompletedPhase(phaseTimeline);
		if (lastCompletedPhase) {
			return {
				text: `Completed: ${truncatePhaseName(lastCompletedPhase.name)}`,
				subtitle: 'Ready for next phase',
				icon: <StatusCheck color="green" />,
				badge: phaseBadge
			};
		}

		const completedStages = projectStages.filter(s => s.status === 'completed').length;
		return {
			text: 'Ready to implement',
			subtitle: completedStages > 0 ? `${completedStages}/${projectStages.length} stages complete` : 'Waiting to begin...',
			icon: <div className="w-4 h-4 bg-gradient-to-br from-zinc-300/30 to-zinc-400/20 dark:from-zinc-600/30 dark:to-zinc-700/20 rounded-full" />,
			badge: undefined
		};
	}, [phaseTimeline, isThinkingNext, isPreviewDeploying, progress, total, projectStages]);

	const togglePhase = (phaseId: string) => {
		setExpandedPhases(prev => {
			const newSet = new Set(prev);
			if (newSet.has(phaseId)) {
				newSet.delete(phaseId);
			} else {
				newSet.add(phaseId);
			}
			return newSet;
		});
	};

	const scrollToTop = useCallback(() => {
		if (parentScrollRef?.current) {
			parentScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}, [parentScrollRef]);

	const getCurrentPhaseInfo = useMemo(() => {
		const generatingPhase = getPhaseByStatus(phaseTimeline, 'generating');
		const validatingPhase = getPhaseByStatus(phaseTimeline, 'validating');
		const lastCompletedPhase = getLastCompletedPhase(phaseTimeline);

		return generatingPhase || validatingPhase || lastCompletedPhase || phaseTimeline[phaseTimeline.length - 1];
	}, [phaseTimeline]);

	return (
		<>
			{/* Collapsed Bar with elegant compression animation and surrounding frosted area */}
			<AnimatePresence>
				{showCollapsedBar && (
					<motion.div
						initial={{
							opacity: 0,
							y: -24,
							scaleY: 0.6,
							transformOrigin: 'top center'
						}}
						animate={{
							opacity: 1,
							y: 0,
							scaleY: 1,
							transformOrigin: 'top center'
						}}
						exit={{
							opacity: 0,
							y: -16,
							scaleY: 0.8,
							transformOrigin: 'top center'
						}}
						transition={{
							duration: 0.4,
							ease: [0.16, 1, 0.3, 1],
							opacity: { duration: 0.25, ease: 'easeOut' },
							y: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
							scaleY: { duration: 0.35, ease: [0.23, 1, 0.32, 1] }
						}}
						className="absolute -top-2 -left-2 -right-2 z-50 px-2 pt-4 pb-2"
					>
						{/* Subtle frosted glass background area */}
						<motion.div
							className="absolute inset-0 backdrop-blur-sm rounded-2xl bg-gradient-to-b from-white/[0.02] via-white/[0.01] to-transparent dark:from-black/[0.02] dark:via-black/[0.01] dark:to-transparent"
							initial={{
								opacity: 0,
								scaleY: 0.8,
								transformOrigin: 'top'
							}}
							animate={{
								opacity: 1,
								scaleY: 1,
								transformOrigin: 'top'
							}}
							exit={{
								opacity: 0,
								scaleY: 0.9,
								transformOrigin: 'top'
							}}
							transition={{
								...commonTransitions.premium,
								opacity: commonTransitions.smooth,
								scaleY: { duration: 0.35, ease: [0.16, 1, 0.3, 1] }
							}}
						/>

						{/* Bottom border demarkation */}
						<motion.div
							className="absolute bottom-0 left-0 right-0 h-px bg-border-primary/50"
							initial={{ opacity: 0, scaleX: 0.8 }}
							animate={{ opacity: 1, scaleX: 1 }}
							exit={{ opacity: 0, scaleX: 0.9 }}
							transition={commonTransitions.smooth}
						/>

						{/* Main frosted panel - Hoverable and Expandable */}
						<motion.div
							className="relative bg-bg-4/95 dark:bg-bg-2/95 backdrop-blur-md border border-border-primary shadow-lg rounded-xl overflow-hidden mx-4 hover:bg-bg-3/95 dark:hover:bg-bg-1/95 transition-colors cursor-pointer group"
							onClick={() => setIsCollapsedBarExpanded(!isCollapsedBarExpanded)}
							initial={{ scale: 0.96 }}
							animate={{ scale: 1 }}
							exit={{ scale: 0.96 }}
							transition={commonTransitions.premiumShort}
							whileHover={{ scale: 1.02 }}
							whileTap={{ scale: 0.98 }}
						>
							{/* Collapsed Header */}
                            <motion.div
                                className="px-4 py-3 flex items-center gap-3"
                                initial={{ opacity: 0.8 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0.8 }}
                                transition={commonTransitions.fast}
                            >
                                <div className="flex-shrink-0">
                                    {collapsedBarInfo.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-text-primary truncate">
                                        {collapsedBarInfo.text}
                                    </div>
                                    {collapsedBarInfo.subtitle && (
                                        <div className="text-xs text-text-secondary truncate">
                                            {collapsedBarInfo.subtitle}
                                        </div>
                                    )}
                                </div>
                                {collapsedBarInfo.badge && (
                                    <div className="flex-shrink-0">
                                        <span className="text-xs font-medium px-2 py-0.5 bg-accent/10 text-accent rounded-full">
                                            {collapsedBarInfo.badge}
                                        </span>
                                    </div>
                                )}
                                {chatId && handleDeployToCloudflare && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeployToCloudflare(chatId);
                                        }}
                                        disabled={!!isDeploying}
                                        className="ml-2 flex items-center gap-1.5 px-2.5 py-1 bg-accent hover:bg-accent/90 disabled:bg-accent/50 text-white rounded-full text-xs font-medium transition-colors disabled:cursor-not-allowed"
                                        title={isDeploying ? 'Deploying...' : 'Deploy to Cloudflare'}
                                        aria-label={isDeploying ? 'Deploying' : 'Deploy to Cloudflare'}
                                    >
                                        {isDeploying ? (
                                            <StatusLoader size="sm" color="accent" />
                                        ) : (
                                            <Zap className="w-3 h-3" />
                                        )}
                                        <span className="hidden sm:inline">{isDeploying ? 'Deploying...' : 'Deploy'}</span>
                                    </button>
                                )}
                            </motion.div>

							{/* Expanded Content */}
							<AnimatePresence>
								{isCollapsedBarExpanded && (
									<motion.div
										initial={{ opacity: 0, height: 0 }}
										animate={{ opacity: 1, height: 'auto' }}
										exit={{ opacity: 0, height: 0 }}
										transition={commonTransitions.premiumShort}
										className="border-t border-border-primary/20"
									>
										<div className="p-4 space-y-4">
											{/* Files List */}
											{getCurrentPhaseInfo && getCurrentPhaseInfo.files.length > 0 && (
												<div className="space-y-1">
													<div className="text-xs font-medium text-text-secondary mb-2">
														Files ({getCurrentPhaseInfo.files.length}):
													</div>
													<div className="max-h-32 overflow-y-auto">
														{getCurrentPhaseInfo.files.slice(0, 5).map((file, index) => (
															<div key={file.path} className="relative flex items-center gap-2 text-xs py-1">
																{/* Timeline connection line */}
																{index > 0 && (
																	<div className="absolute left-1.5 -top-1 w-px h-2 bg-accent/60" />
																)}
																{/* Status dot/icon */}
																<div className="relative z-10 flex-shrink-0">
																	<StatusIcon status={file.status} size="sm" />
																</div>
																{/* File name offset to the right */}
																<span className="font-mono text-text-tertiary truncate ml-1">
																	{truncateFilePath(file.path, 35)}
																</span>
																{/* Bottom connection line */}
																{index < Math.min(getCurrentPhaseInfo.files.length, 5) - 1 && (
																	<div className="absolute left-1.5 bottom-0 w-px h-1 bg-accent/60" />
																)}
															</div>
														))}
														{getCurrentPhaseInfo.files.length > 5 && (
															<div className="relative flex items-center gap-2 text-xs py-1">
																{/* Connection line from last file */}
																<div className="absolute left-1.5 -top-1 w-px h-2 bg-accent/60" />
																<div className="relative z-10 flex-shrink-0">
																	<div className="w-3 h-3 rounded-full bg-accent/20 flex items-center justify-center">
																		<div className="w-1.5 h-1.5 rounded-full bg-accent/60" />
																	</div>
																</div>
																<span className="text-text-tertiary ml-1">
																	+{getCurrentPhaseInfo.files.length - 5} more files...
																</span>
															</div>
														)}
													</div>
												</div>
											)}

											{/* Action Buttons */}
											<div className="flex items-center gap-2 pt-2">
												<button
													onClick={(e) => {
														e.stopPropagation();
														scrollToTop();
													}}
													className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-2 hover:bg-bg-1 border border-border-primary rounded-lg text-xs font-medium text-text-primary transition-colors"
												>
													<ArrowUp className="w-3 h-3" />
													Scroll to Top
												</button>

												{chatId && handleDeployToCloudflare && (
													<button
														onClick={(e) => {
															e.stopPropagation();
															handleDeployToCloudflare(chatId);
														}}
														disabled={isDeploying}
														className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/90 disabled:bg-accent/50 text-white rounded-lg text-xs font-medium transition-colors disabled:cursor-not-allowed"
													>
														{isDeploying ? (
															<StatusLoader size="sm" color="accent" />
														) : (
															<Zap className="w-3 h-3" />
														)}
														{isDeploying ? 'Deploying...' : 'Deploy to Cloudflare'}
													</button>
												)}
											</div>
										</div>
									</motion.div>
								)}
							</AnimatePresence>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>

			<motion.div
				layout="position"
				animate={{
					scale: showCollapsedBar ? 0.97 : 1,
					opacity: showCollapsedBar ? 0.85 : 1,
					transformOrigin: 'top center'
				}}
				transition={{
					duration: 0.4,
					ease: [0.16, 1, 0.3, 1],
					scale: { duration: 0.35, ease: [0.23, 1, 0.32, 1] },
					opacity: commonTransitions.smooth
				}}
				className="pl-9 mb-2 relative"
				ref={componentRef}
			>
				{/* Main Timeline Card */}
				<div ref={timelineCardRef} className="px-2 pr-3.5 py-3 flex-1 rounded-xl border border-black/12 bg-bg-4 dark:bg-bg-2">
				{/* Project Stages */}
				{projectStages.map((stage, index) => (
					<div key={stage.id} className="flex relative w-full gap-2 pb-2.5 last:pb-0">
						<AnimatedStatusIndicator status={stage.status} />

						<div className="flex flex-col gap-2 flex-1">
							<div className="flex">
								<span className={clsx(
									'font-medium',
									stage.status === 'pending'
										? 'text-text-tertiary'
										: 'text-text-secondary'
								)}>
									{stage.title}
								</span>

								{/* Progress for code stage */}
								{stage.id === 'code' && stage.status !== 'pending' && (
									<motion.div
										initial={{ x: -120 }}
										animate={{ x: 0 }}
									>
										<span className="text-zinc-300 mx-1">&bull;</span>
										<span className="text-text-tertiary">
											{progress}/{total} phases
										</span>
									</motion.div>
								)}
							</div>

							{/* Blueprint button */}
							{stage.id === 'blueprint' && stage.status !== 'pending' && (
								<button
									onClick={() => onViewChange?.('blueprint')}
									className={clsx(
										'flex items-start ml-0.5 transition-colors font-mono',
										view === 'blueprint'
											? 'text-brand underline decoration-dotted'
											: 'text-text-secondary/80 hover:bg-bg-2/50 hover:text-text-secondary'
									)}
								>
									<span className="text-xs text-left truncate">
										Blueprint.md
									</span>
								</button>
							)}

							{/* Detailed Phase Timeline for code stage */}
							{stage.id === 'code' && (
								<div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 phase-timeline-scroll">
									{phaseTimeline.map((phase, phaseIndex) => (
										<div
											key={phase.id}
											className="space-y-1 relative"
											ref={phaseIndex === phaseTimeline.length - 1 ? lastPhaseRef : undefined}
										>
											{/* Phase Implementation Header */}
											<button
												onClick={() => phase.status === 'completed' && togglePhase(phase.id)}
												className="flex items-start gap-2 relative z-0 w-full text-left hover:bg-zinc-50/5 rounded px-1 py-1 transition-colors group"
												disabled={phase.status !== 'completed'}
											>
												{/* Expand/Collapse chevron for completed phases */}
												{phase.status === 'completed' && (
													<div className="flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity mt-0.5">
														{expandedPhases.has(phase.id) ? (
															<ChevronDown className="size-3" />
														) : (
															<ChevronRight className="size-3" />
														)}
													</div>
												)}

												<div className="flex-shrink-0 mt-0.5">
													{phase.status === 'generating' ? (
														<StatusLoader size="sm" color="accent" />
													) : phase.status === 'validating' ? (
														<StatusLoader size="sm" color="blue" />
													) : (
														<StatusCheck size="sm" color="green" />
													)}
												</div>
												<span className="text-sm font-medium text-text-50 flex-1 break-words">
													{phase.status === 'completed' ? `Implemented ${phase.name}` :
													 phase.status === 'validating' ? `Reviewing ${phase.name}` :
													 `Implementing ${phase.name}`}
												</span>

												{/* File count badge for collapsed completed phases */}
												{phase.status === 'completed' && !expandedPhases.has(phase.id) && (
													<span className="text-xs text-text-primary/50 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded flex-shrink-0">
														{phase.files.length} files
													</span>
												)}
											</button>

											{/* Phase Files - Show when implementing, validating, or expanded */}
											{(phase.status === 'generating' || phase.status === 'validating' || (phase.status === 'completed' && expandedPhases.has(phase.id))) && (
												<div className="ml-6 space-y-0.5">
													{phase.files.map((phaseFile) => {
														// Check if this file exists in the global files array for click handling
														const globalFile = files.find(f => f.filePath === phaseFile.path);
														const isFileActive = view === 'editor' && activeFile?.filePath === phaseFile.path;

														return (
															<button
																key={phaseFile.path}
																onClick={() => globalFile && onFileClick(globalFile)}
																className="flex items-start gap-2 py-1 transition-colors font-mono w-full text-left group hover:bg-zinc-50/5 rounded px-2 min-h-0"
																aria-selected={isFileActive}
																disabled={!globalFile}
															>
																{/* Status Icon BEFORE filename */}
																<span className="flex-shrink-0">
																	<StatusIcon status={phaseFile.status} size="sm" />
																</span>

																{/* File Path with proper truncation and wrapping */}
																<div className="flex-1 min-w-0">
																	<span
																		className={clsx(
																			'text-xs text-left block transition-colors break-all leading-tight',
																			isFileActive
																				? 'text-brand font-medium'
																				: globalFile ? 'text-text-primary/80 group-hover:text-text-primary' : 'text-text-primary/50',
																		)}
																		title={phaseFile.path}
																	>
																		{truncateFilePath(phaseFile.path)}
																	</span>
																</div>

																{/* Incremental line count with responsive width and truncation */}
																{globalFile && (() => {
																	const incrementalLines = calculateIncrementalLineCount(
																		phaseFile.path,
																		phaseIndex,
																		phaseTimeline,
																		files
																	);
																	const displayCount = incrementalLines > 999 ? `${Math.floor(incrementalLines / 1000)}k` : incrementalLines.toString();

																	return (
																		<span
																			className="flex-shrink-0 text-text-tertiary text-xs font-mono text-right w-12 ml-2"
																			title={`${incrementalLines} lines added in this phase`}
																		>
																			+{displayCount}
																		</span>
																	);
																})()}
															</button>
														);
													})}
												</div>
											)}
										</div>
									))}

									{/* Validation/Preview deployment indicator */}
									{(() => {
										const validatingPhase = getPhaseByStatus(phaseTimeline, 'validating');
										if (validatingPhase) {
											return (
												<div className="space-y-1 relative bg-blue-50/5 border border-blue-200/20 rounded-lg p-3">
													<div className="flex items-center gap-2">
														<StatusLoader size="sm" color="blue" />
														<span className="text-sm font-medium text-blue-400">Reviewing phase...</span>
													</div>
													<span className="text-xs text-blue-300/80 ml-5">Running tests and fixing any issues</span>
												</div>
											);
										} else if (isPreviewDeploying) {
											return (
												<div className="space-y-1 relative bg-orange-50/5 border border-orange-200/20 rounded-lg p-3">
													<div className="flex items-center gap-2">
														<StatusLoader size="sm" color="orange" />
														<span className="text-sm font-medium text-orange-400">Deploying preview...</span>
													</div>
													<span className="text-xs text-orange-300/80 ml-5">Updating your preview environment</span>
												</div>
											);
										}
										return null;
									})()}

									{/* Thinking indicator for next phase */}
									{isThinkingNext && (
										<div className="relative z-10" ref={lastPhaseRef}>
											<ThinkingIndicator visible={isThinkingNext} />
										</div>
									)}

									{/* Fallback for existing files when no phase timeline */}
									{phaseTimeline.length === 0 && files.map((file) => {
										const isFileActive = view === 'editor' && activeFile?.filePath === file.filePath;
										return (
											<button
												key={file.filePath}
												onClick={() => onFileClick(file)}
												className="flex items-start gap-2 py-1 font-mono w-full text-left group hover:bg-zinc-50/5 rounded px-2 min-h-0"
											>
												<span className="flex-shrink-0">
													{file.isGenerating ? <StatusLoader size="sm" color="accent" /> : <StatusCheck size="sm" color="green" />}
												</span>
												<div className="flex-1 min-w-0">
													<span className={clsx('text-xs block break-all leading-tight', isFileActive ? 'text-brand font-medium' : 'text-text-primary/80')}>
														{truncateFilePath(file.filePath)}
													</span>
												</div>
												<span className="flex-shrink-0 text-text-tertiary text-xs font-mono text-right w-12 ml-2">
													+{file.fileContents.split('\n').length}
												</span>
											</button>
										);
									})}
								</div>
							)}

							{stage.metadata && (
								<span className="font-mono text-xs text-zinc-500 tracking-tighter">
									{stage.metadata}
								</span>
							)}
						</div>

						{index !== projectStages.length - 1 && (
							<div className={clsx(
								'absolute left-[9.25px] w-px h-full top-2.5 z-10',
								stage.status === 'completed'
									? 'bg-accent'
									: 'bg-text/5'
							)} />
						)}
					</div>
				))}
			</div>
		</motion.div>
		</>
	);
}
