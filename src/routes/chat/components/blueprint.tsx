import type { BlueprintType, PhasicBlueprint } from '@/api-types';
import clsx from 'clsx';
import { Markdown } from './messages';

const isPhasicBlueprint = (blueprint: BlueprintType): blueprint is PhasicBlueprint =>
	'views' in blueprint;

export function Blueprint({
	blueprint,
	className,
	...props
}: React.ComponentProps<'div'> & {
	blueprint: BlueprintType;
}) {
	if (!blueprint) return null;

	const phasicBlueprint = isPhasicBlueprint(blueprint) ? blueprint : null;

	return (
		<div className={clsx('w-full flex flex-col', className)} {...props}>
			<div className="bg-accent p-6 rounded-t-xl flex items-center bg-graph-paper">
				<div className="flex flex-col gap-1">
					<div className="uppercase text-xs tracking-wider text-text-on-brand/90">
						Blueprint
					</div>
					<div className="text-2xl font-medium text-text-on-brand">
						{blueprint.title}
					</div>
				</div>
			</div>
			<div className="flex flex-col px-6 py-4 bg-bg-2 rounded-b-xl space-y-8">
				{/* Basic Info */}
				<div className="grid grid-cols-[120px_1fr] gap-4 text-sm">
					<div className="text-text-50/70 font-mono">Description</div>
					<Markdown className="text-text-50">{blueprint.description}</Markdown>

					{Array.isArray(blueprint.colorPalette) &&
						blueprint.colorPalette.length > 0 && (
							<>
								<div className="text-text-50/70 font-mono">Color Palette</div>
								<div className="flex items-center gap-2">
									{Array.isArray(blueprint.colorPalette) &&
										blueprint.colorPalette?.map((color, index) => (
											<div
												key={`color-${index}`}
												className="size-6 rounded-md border border-text/10 flex items-center justify-center"
												style={{ backgroundColor: color }}
												title={color}
											>
												<span className="sr-only">{color}</span>
											</div>
										))}
								</div>{' '}
							</>
						)}

					<div className="text-text-50/70 font-mono">Dependencies</div>
					<div className="flex flex-wrap gap-2 items-center">
						{Array.isArray(blueprint.frameworks) &&
							blueprint.frameworks.map((framework, index) => {
								let name: string, version: string | undefined;

								// support scoped packages
								if (framework.startsWith('@')) {
									const secondAt = framework.lastIndexOf('@');
									if (secondAt === 0) {
										name = framework;
									} else {
										name = framework.slice(0, secondAt);
										version = framework.slice(secondAt + 1);
									}
								} else {
									[name, version] = framework.split('@');
								}

								return (
									<span
										key={`framework-${framework}-${index}`}
										className="flex items-center text-xs border border-text/20 rounded-full px-2 py-0.5 text-text-primary/90 hover:border-white/40 transition-colors"
									>
										<span className="font-medium">{name}</span>
										{version && (
											<span className="text-text-primary/50">@{version}</span>
										)}
									</span>
								);
							})}
					</div>
				</div>

				{/* Views */}
				{phasicBlueprint && phasicBlueprint.views?.length > 0 && (
					<div>
						<h3 className="text-sm font-medium mb-3 text-text-50/70 uppercase tracking-wider">
							Views
						</h3>
						<div className="space-y-3">
							{phasicBlueprint.views?.map((view, index) => (
								<div key={`view-${index}`} className="space-y-1">
									<h4 className="text-xs font-medium text-text-50/70">
										{view.name}
									</h4>
									<Markdown className="text-sm text-text-50">
										{view.description}
									</Markdown>
								</div>
							))}
						</div>
					</div>
				)}

				{/* User Flow */}
				{phasicBlueprint?.userFlow && (
					<div>
						<h3 className="text-sm font-medium mb-3 text-text-50/70 uppercase tracking-wider">
							User Flow
						</h3>
						<div className="space-y-4">
							{phasicBlueprint.userFlow.uiLayout && (
								<div>
									<h4 className="text-xs font-medium mb-2 text-text-50/70">
										UI Layout
									</h4>
									<Markdown className="text-sm text-text-50">
									{phasicBlueprint.userFlow.uiLayout}
									</Markdown>
								</div>
							)}

							{phasicBlueprint.userFlow.uiDesign && (
								<div>
									<h4 className="text-xs font-medium mb-2 text-text-50/70">
										UI Design
									</h4>
									<Markdown className="text-sm text-text-50">
									{phasicBlueprint.userFlow.uiDesign}
									</Markdown>
								</div>
							)}

							{phasicBlueprint.userFlow.userJourney && (
								<div>
									<h4 className="text-xs font-medium mb-2 text-text-50/70">
										User Journey
									</h4>
									<Markdown className="text-sm text-text-50">
									{phasicBlueprint.userFlow.userJourney}
									</Markdown>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Data Flow */}
				{phasicBlueprint && (phasicBlueprint.dataFlow || phasicBlueprint.architecture?.dataFlow) && (
					<div>
						<h3 className="text-sm font-medium mb-2 text-text-50/70 uppercase tracking-wider">
							Data Flow
						</h3>
						<Markdown className="text-sm text-text-50">
							{phasicBlueprint.dataFlow || phasicBlueprint.architecture?.dataFlow}
						</Markdown>
					</div>
				)}

				{/* Implementation Roadmap */}
				{phasicBlueprint && phasicBlueprint.implementationRoadmap?.length > 0 && (
					<div>
						<h3 className="text-sm font-medium mb-2 text-text-50/70 uppercase tracking-wider">
							Implementation Roadmap
						</h3>
						<div className="space-y-3">
							{phasicBlueprint.implementationRoadmap?.map((roadmapItem, index) => (
								<div key={`roadmap-${index}`} className="space-y-1">
									<h4 className="text-xs font-medium text-text-50/70">
										Phase {index + 1}: {roadmapItem.phase}
									</h4>
									<Markdown className="text-sm text-text-50">
										{roadmapItem.description}
									</Markdown>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Initial Phase */}
				{phasicBlueprint?.initialPhase && (
					<div>
						<h3 className="text-sm font-medium mb-2 text-text-50/70 uppercase tracking-wider">
							Initial Phase
						</h3>
						<div className="space-y-3">
							<div>
								<h4 className="text-xs font-medium mb-2 text-text-50/70">
									{phasicBlueprint.initialPhase.name}
								</h4>
								<Markdown className="text-sm text-text-50 mb-3">
									{phasicBlueprint.initialPhase.description}
								</Markdown>
								{Array.isArray(phasicBlueprint.initialPhase.files) && phasicBlueprint.initialPhase.files.length > 0 && (
									<div>
										<h5 className="text-xs font-medium mb-2 text-text-50/60">
											Files to be created:
										</h5>
										<div className="space-y-2">
										{phasicBlueprint.initialPhase.files.map((file, fileIndex) => (
												<div key={`initial-phase-file-${fileIndex}`} className="border-l-2 border-text/10 pl-3">
													<div className="font-mono text-xs text-text-50/80">{file.path}</div>
													<div className="text-xs text-text-50/60">{file.purpose}</div>
												</div>
											))}
										</div>
									</div>
								)}
							</div>
						</div>
					</div>
				)}

				{/* Pitfalls */}
				{phasicBlueprint && phasicBlueprint.pitfalls?.length > 0 && (
					<div>
						<h3 className="text-sm font-medium mb-2 text-text-50/70 uppercase tracking-wider">
							Pitfalls
						</h3>
						<div className="prose prose-sm prose-invert">
							<ul className="">
								{phasicBlueprint.pitfalls?.map((pitfall, index) => (
									<li key={`pitfall-${index}`} className="">
										{pitfall}
									</li>
								))}
							</ul>
						</div>
					</div>
				)}


			</div>
		</div>
	);
}
