import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { FileType } from '@/api-types';
import type { ComponentType } from 'react';
import { loadModule } from './compiler/ModuleLoader';
import { GlobalRegistry, type InitializationResult } from './compiler/GlobalRegistry';
import { PresentationView } from './PresentationView';
import { parseManifest, getSlideOrder, type ManifestData } from './utils/ManifestParser';
import { validateTemplate } from './validation/TemplateValidator';

const RECOMPILE_DEBOUNCE_MS = 300;

interface CompiledSlide {
	id: string;
	index: number;
	Component: ComponentType<unknown>;
	originalFile: FileType;
	hasError: boolean;
	error?: Error;
}

interface PresentationRendererProps {
	files: FileType[];
	activeFile: FileType | null;
	onFileChange?: (filePath: string, content: string) => void;
	slideDirectory?: string;
	speakerMode?: boolean;
	previewMode?: boolean;
	fullscreenMode?: boolean;
	onFullscreenChange?: (isFullscreen: boolean) => void;
}

export function PresentationRenderer({
	files,
	activeFile,
	onFileChange,
	slideDirectory = 'public/slides',
	speakerMode = false,
	previewMode = false,
	fullscreenMode = false,
	onFullscreenChange,
}: PresentationRendererProps) {
	const [slides, setSlides] = useState<CompiledSlide[]>([]);
	const [isInitializing, setIsInitializing] = useState(true);
	const [initializationError, setInitializationError] = useState<string | null>(null);
	const [initResult, setInitResult] = useState<InitializationResult | null>(null);
	const [manifest, setManifest] = useState<ManifestData | null>(null);

	const isCompilerReadyRef = useRef(false);
	const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const initializedRef = useRef(false);
	const slidesRef = useRef<CompiledSlide[]>([]);

	const hasFiles = files && files.length > 0;

	useEffect(() => {
		if (!hasFiles) {
			setIsInitializing(false);
			return;
		}

		let isCancelled = false;

		async function initialize() {
			try {
				setIsInitializing(true);

				const validation = validateTemplate(files, slideDirectory);
				if (!validation.valid) {
					setInitializationError(
						`Template validation failed: ${validation.errors.map((e) => e.message).join(', ')}`,
					);
					setIsInitializing(false);
					return;
				}

				const result = await GlobalRegistry.initialize(files, slideDirectory);

				if (!isCancelled) {
					setInitResult(result);

					if (!result.success) {
						setInitializationError(
							`Failed to initialize presentation runtime. ${result.failedFiles.length} files failed to compile.`,
						);
						setIsInitializing(false);
						return;
					}

					if (result.exportCount === 0) {
						setInitializationError(
							'No components found in template library files.',
						);
						setIsInitializing(false);
						return;
					}

					// Initialization successful
					isCompilerReadyRef.current = true;
					initializedRef.current = true;
					setInitializationError(null);
					setIsInitializing(false); // Allow slide compilation to proceed
				}
			} catch (error) {
				console.error('[PresentationRenderer] Initialization failed:', error);
				if (!isCancelled) {
					setInitializationError(
						`Initialization exception: ${error instanceof Error ? error.message : 'Unknown error'}`,
					);
					setIsInitializing(false);
				}
			}
		}

		if (!initializedRef.current) {
			initialize();
		}

		return () => {
			isCancelled = true;
		};
	}, [files, slideDirectory]);

	const orderedSlideFiles = useMemo(() => {
		const parsedManifest = parseManifest(files);
		const slideFiles = files.filter(
			(f) =>
				f.filePath.startsWith(`${slideDirectory}/`) &&
				(f.filePath.endsWith('.jsx') || f.filePath.endsWith('.tsx')),
		);
		return { manifest: parsedManifest, slides: getSlideOrder(parsedManifest, slideFiles) };
	}, [files, slideDirectory]);

	const slidesCss = useMemo(() => {
		const cssFile = files.find((f) => f.filePath.endsWith('slides-styles.css'));
		return cssFile?.fileContents ?? '';
	}, [files]);

	const tailwindConfigScript = useMemo(() => {
		const indexFile = files.find(
			(f) =>
				f.filePath === 'public/index.html' ||
				f.filePath.endsWith('/index.html'),
		);

		if (!indexFile) {
			return '';
		}

		if (typeof DOMParser === 'undefined') {
			return '';
		}

		try {
			const parser = new DOMParser();
			const doc = parser.parseFromString(indexFile.fileContents, 'text/html');
			const scripts = Array.from(doc.querySelectorAll('script'));
			const cfg = scripts.find(
				(s) => s.textContent && s.textContent.includes('tailwind.config'),
			);
			return cfg?.textContent ?? '';
		} catch (error) {
			console.error('[PresentationRenderer] Failed to extract Tailwind config:', error);
			return '';
		}
	}, [files]);

	// Build file map for dependency resolution
	const allFilesMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const file of files) {
			map.set(file.filePath, file.fileContents);
		}
		return map;
	}, [files]);

	// Compile slides when initialization completes
	useEffect(() => {
		if (!isCompilerReadyRef.current || !initializedRef.current || isInitializing) {
			return;
		}

		setManifest(orderedSlideFiles.manifest);
		const orderedSlides = orderedSlideFiles.slides;

		if (orderedSlides.length === 0) {
			console.warn('[PresentationRenderer] No slides found in directory:', slideDirectory);
			setSlides([]);
			return;
		}

		// Compile all slides in parallel
		const compileAllSlides = async () => {
			const compiledSlides: CompiledSlide[] = await Promise.all(
				orderedSlides.map(async (file, i) => {
					try {
						const result = await loadModule({
							code: file.fileContents,
							moduleId: file.filePath,
							filename: file.filePath,
							allFiles: allFilesMap,
						});

						if (typeof result.exports === 'function') {
							return {
								id: file.filePath,
								index: i,
								Component: result.exports as ComponentType<unknown>,
								originalFile: file,
								hasError: false,
							};
						} else {
							console.error(
								`[PresentationRenderer] Slide ${i + 1} (${file.filePath}) did not export a function component`,
							);
							return {
								id: file.filePath,
								index: i,
								Component: (() => null) as ComponentType<unknown>,
								originalFile: file,
								hasError: true,
								error: new Error('Slide did not export a component'),
							};
						}
					} catch (error) {
						return {
							id: file.filePath,
							index: i,
							Component: (() => null) as ComponentType<unknown>,
							originalFile: file,
							hasError: true,
							error: error instanceof Error ? error : new Error(`Failed to compile slide ${i + 1}`),
						};
					}
				})
			);

			console.log(`[PresentationRenderer] Compiled ${compiledSlides.length} slides`);
			setSlides(compiledSlides);
			slidesRef.current = compiledSlides;
		};

		compileAllSlides();
	}, [orderedSlideFiles, isInitializing, slideDirectory]);

	const debouncedRecompile = useCallback(
		(filePath: string, content: string) => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}

			debounceTimeoutRef.current = setTimeout(async () => {
				if (!isCompilerReadyRef.current) return;

				const slideIndex = slidesRef.current.findIndex((s) => s.id === filePath);
				if (slideIndex === -1) return;

				try {
					const result = await loadModule({
						code: content,
						moduleId: filePath,
						filename: filePath,
						allFiles: allFilesMap,
					});

					setSlides((prev) =>
						prev.map((slide, i) => {
							if (i === slideIndex) {
								if (typeof result.exports === 'function') {
									return {
										...slide,
										Component: result.exports as ComponentType<unknown>,
										hasError: false,
										error: undefined,
									};
								}
								return {
									...slide,
									hasError: true,
									error: new Error('Slide did not export a component'),
								};
							}
							return slide;
						}),
					);
				} catch (err) {
					setSlides((prev) =>
						prev.map((slide, i) =>
							i === slideIndex
								? {
										...slide,
										hasError: true,
										error: err instanceof Error ? err : new Error('Compilation failed'),
								  }
								: slide,
						),
					);
				}
			}, RECOMPILE_DEBOUNCE_MS);
		},
		[allFilesMap],
	);

	// Cleanup on unmount: clear timeouts
	useEffect(() => {
		return () => {
			if (debounceTimeoutRef.current) {
				clearTimeout(debounceTimeoutRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (!activeFile || !onFileChange) return;
		// Debounced recompilation for slide files as user edits
		const isSlideFile = slides.some((s) => s.id === activeFile.filePath);
		if (isSlideFile) {
			debouncedRecompile(activeFile.filePath, activeFile.fileContents);
		}
	}, [activeFile?.fileContents, activeFile?.filePath, debouncedRecompile, onFileChange, slides]);

	// Show initialization error if failed
	if (initializationError) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center max-w-2xl px-4">
					<div className="mb-4 text-lg text-red-500">Initialization Failed</div>
					<div className="text-sm text-text-50/70 mb-4">{initializationError}</div>
					{initResult && initResult.errors.length > 0 && (
						<div className="text-left bg-bg-2 p-4 rounded-lg max-h-64 overflow-y-auto">
							<div className="text-xs font-mono">
								{initResult.errors.map((err, i) => (
									<div key={i} className="mb-2">
										<div className="text-red-400">{err.file}</div>
										<div className="text-text-50/50 ml-2">{err.error}</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
		);
	}

	// Show loading state
	if (isInitializing) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<div className="mb-4 text-lg">Initializing presentation...</div>
					<div className="text-sm text-text-50/50">
						Compiling slides and loading components
					</div>
					{initResult && (
						<div className="mt-2 text-xs text-text-50/40">
							Loaded {initResult.exportCount} components
						</div>
					)}
				</div>
			</div>
		);
	}

	// Guard: Show loading state if no files
	if (!hasFiles) {
		return (
			<div className="flex items-center justify-center h-full text-text-tertiary">
				<div className="text-center">
					<p>No presentation files found</p>
					<p className="text-sm mt-2">Waiting for files to load...</p>
				</div>
			</div>
		);
	}

	// Show empty state
	if (slides.length === 0 && !initResult?.exportCount) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<div className="mb-4 text-lg">No presentation slides found</div>
					<div className="text-sm text-text-50/50">
						Make sure your project has slide files in the correct directory
					</div>
					{initResult && initResult.exportCount > 0 && (
						<div className="mt-2 text-xs text-text-50/40">
							{initResult.exportCount} library components loaded successfully
						</div>
					)}
				</div>
			</div>
		);
	}

	return (
		<PresentationView
			slides={slides}
			manifestMetadata={manifest?.metadata ?? null}
			slidesCss={slidesCss}
			tailwindConfigScript={tailwindConfigScript}
			speakerMode={speakerMode}
			previewMode={previewMode}
			fullscreenMode={fullscreenMode}
			onFullscreenChange={onFullscreenChange}
		/>
	);
}
