import { SkeletonLine } from '@cloudflare/kumo';

export function AppLoadingSkeleton() {
	return (
		<div
			className="h-full bg-kumo-base flex items-center justify-center p-4"
			role="status"
			aria-busy="true"
			aria-live="polite"
		>
			<div className="w-full max-w-sm flex flex-col gap-5">
				<div className="flex flex-col gap-3" aria-hidden="true">
					<SkeletonLine
						className="h-3 rounded-full"
						minWidth={45}
						maxWidth={65}
					/>
					<div className="flex flex-col gap-2">
						<SkeletonLine
							className="h-2.5 rounded-full"
							minWidth={90}
							maxWidth={100}
						/>
						<SkeletonLine
							className="h-2.5 rounded-full"
							minWidth={70}
							maxWidth={85}
						/>
						<SkeletonLine
							className="h-2.5 rounded-full"
							minWidth={50}
							maxWidth={65}
						/>
					</div>
					<div className="mt-1 overflow-hidden rounded-xl">
						<SkeletonLine
							className="h-36 w-full rounded-none"
							minWidth={100}
							maxWidth={100}
						/>
					</div>
					<div className="flex gap-2 pt-1">
						<div className="w-24 overflow-hidden rounded-lg">
							<SkeletonLine
								className="h-8 w-full rounded-none"
								minWidth={100}
								maxWidth={100}
							/>
						</div>
						<div className="w-20 overflow-hidden rounded-lg">
							<SkeletonLine
								className="h-8 w-full rounded-none"
								minWidth={100}
								maxWidth={100}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
