import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import type { MonacoEditorProps, MonacoDiffEditorProps } from './monaco-editor';

const MonacoEditorImpl = lazy(() =>
	import('./monaco-editor').then((mod) => ({ default: mod.MonacoEditor })),
);

const MonacoDiffEditorImpl = lazy(() =>
	import('./monaco-editor').then((mod) => ({ default: mod.MonacoDiffEditor })),
);

function MonacoEditorFallback({ className }: { className?: string }) {
	return (
		<div
			className={`flex h-full w-full items-center justify-center bg-kumo-base ${className ?? ''}`}
			aria-busy="true"
			aria-live="polite"
		>
			<div className="flex flex-col items-center gap-3 text-center px-6">
				<Loader2
					className="size-6 animate-spin text-kumo-brand"
					aria-hidden
				/>
				<div className="grid gap-1">
					<p className="text-sm font-medium text-text-primary">
						Preparing code editor
					</p>
					<p className="text-xs text-kumo-subtle">
						Loading syntax highlighting and language tools…
					</p>
				</div>
			</div>
		</div>
	);
}

/** Code-splits monaco-editor + workers until the editor is actually mounted. */
export function MonacoEditor(props: MonacoEditorProps) {
	const { className } = props;
	return (
		<Suspense fallback={<MonacoEditorFallback className={className} />}>
			<MonacoEditorImpl {...props} />
		</Suspense>
	);
}

/** Code-splits monaco-editor + workers until the diff editor is mounted. */
export function MonacoDiffEditor(props: MonacoDiffEditorProps) {
	const { className } = props;
	return (
		<Suspense fallback={<MonacoEditorFallback className={className} />}>
			<MonacoDiffEditorImpl {...props} />
		</Suspense>
	);
}

export type { MonacoEditorProps, MonacoDiffEditorProps };
