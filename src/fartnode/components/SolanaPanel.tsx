export function SolanaPanel() {
	return (
		<section className="space-y-4 rounded-lg border border-border-primary bg-bg-2 p-6">
			<h3 className="text-lg font-semibold">Solana</h3>
			<div className="text-sm text-text-secondary">Network: devnet</div>
			<button
				type="button"
				onClick={() => console.log('connect phantom (stub)')}
				className="inline-flex items-center justify-center rounded-md border border-border-primary bg-bg-3 px-4 py-2 text-sm font-medium text-text-primary shadow-sm transition hover:bg-bg-4"
			>
				Connect Phantom
			</button>
		</section>
	);
}
