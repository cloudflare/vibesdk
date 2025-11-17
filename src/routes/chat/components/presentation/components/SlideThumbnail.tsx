import { useEffect, useRef, useState, type ComponentType } from 'react';

interface SlideThumbnailProps {
	component: ComponentType<unknown>;
}

export function SlideThumbnail({ component: SlideComponent }: SlideThumbnailProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [scale, setScale] = useState(0.1);

	useEffect(() => {
		const el = containerRef.current;
		if (!el || typeof ResizeObserver === 'undefined') return;

		const baseWidth = 1920;
		const baseHeight = 1080;

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const { width, height } = entry.contentRect;
			if (!width || !height) return;

			const scaleX = width / baseWidth;
			const scaleY = height / baseHeight;
			const nextScale = Math.min(scaleX, scaleY) * 1.15;
			setScale(nextScale);
		});

		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const baseWidth = 1920;
	const baseHeight = 1080;

	return (
		<div ref={containerRef} className="relative w-full h-full overflow-hidden">
			<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
				<div
					style={{
						width: baseWidth,
						height: baseHeight,
						transform: `scale(${scale})`,
						transformOrigin: 'center center',
					}}
				>
					<div className="presentation-thumbnail-slide">
						<SlideComponent />
					</div>
				</div>
			</div>
		</div>
	);
}
