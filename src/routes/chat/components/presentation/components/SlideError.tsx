interface SlideErrorProps {
	title: string;
	slideId: string;
	message: string;
	stack?: string;
}

export function SlideError({ title, slideId, message, stack }: SlideErrorProps) {
	return (
		<div
			className="flex h-full w-full items-center justify-center p-8"
			style={{
				background:
					'linear-gradient(135deg, rgba(255, 50, 50, 0.1), rgba(255, 100, 100, 0.05))',
			}}
		>
			<div
				className="max-w-2xl rounded-lg p-8"
				style={{
					background: 'rgba(0, 0, 0, 0.5)',
					border: '1px solid rgba(255, 100, 100, 0.3)',
					backdropFilter: 'blur(10px)',
				}}
			>
				<h2 className="mb-4 text-4xl font-bold text-red-400">{title}</h2>
				<p className="mb-2 text-xl text-red-300">{slideId}</p>
				<pre className="mt-4 whitespace-pre-wrap text-lg text-red-200">
					{message}
				</pre>
				{stack && (
					<details className="mt-4">
						<summary className="cursor-pointer text-sm text-red-300 hover:text-red-200">
							Stack Trace
						</summary>
						<pre className="mt-2 text-xs text-red-200/70">{stack}</pre>
					</details>
				)}
			</div>
		</div>
	);
}
