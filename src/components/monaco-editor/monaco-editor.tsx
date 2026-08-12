import React, { memo, useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { useTheme } from '../../contexts/theme-context';

import 'monaco-editor/editor/editor.api';
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

import './monaco-editor.module.css';
import { vesperTheme } from './vesper-theme';

self.MonacoEnvironment = {
	getWorker(_, label) {
		if (label === 'json') {
			return new jsonWorker();
		}
		if (label === 'css' || label === 'scss' || label === 'less') {
			return new cssWorker();
		}
		if (label === 'html' || label === 'handlebars' || label === 'razor') {
			return new htmlWorker();
		}
		if (label === 'typescript' || label === 'javascript') {
			return new tsWorker();
		}
		return new editorWorker();
	},
};

monaco.editor.defineTheme('vesper', vesperTheme);

monaco.editor.defineTheme('vibesdk', {
	base: 'vs',
	inherit: true,
	rules: [
		{ token: '', foreground: '000000', background: 'fbfbfc' },
		{ token: 'comment', foreground: '6e7781', fontStyle: 'italic' },
		{ token: 'keyword', foreground: '0092b8' },
		{ token: 'number', foreground: '0550ae' },
		{ token: 'string', foreground: '0a3069' },
		{ token: 'type', foreground: '0092b8' },
		{ token: 'class', foreground: '0092b8' },
		{ token: 'interface', foreground: '0092b8' },
		{ token: 'function', foreground: '953800' },
		{ token: 'member', foreground: '0550ae' },
		{ token: 'variable', foreground: '24292f' },
		{ token: 'constant', foreground: '0550ae' },
		{ token: 'operator', foreground: '0092b8' },
		{ token: 'namespace', foreground: '0092b8' },
		{ token: 'predefined', foreground: '0092b8' },
		{ token: 'invalid', foreground: 'ff0000' },
	],
	colors: {
		'editor.background': '#fbfbfc',
		'editor.foreground': '#24292f',
		'editorLineNumber.foreground': '#8c959f',
		'editorLineNumber.activeForeground': '#24292f',
		'editorCursor.foreground': '#0092b8',
		'editorIndentGuide.background': '#d0d7de',
		'editorIndentGuide.activeBackground': '#8c959f',
		'editor.selectionBackground': '#0092b820',
		'editor.inactiveSelectionBackground': '#0092b810',
		'editor.lineHighlightBackground': '#0092b808',
		'editor.wordHighlightBackground': '#0092b815',
		'editor.wordHighlightStrongBackground': '#0092b820',
		'editor.findMatchBackground': '#0092b830',
		'editor.findMatchHighlightBackground': '#0092b815',
	},
});

/** Ref-count editors that want TS IntelliSense so global defaults stay consistent. */
let typescriptFeaturesUsers = 0;

function applyTypeScriptDefaults(enabled: boolean) {
	const tsDefaults = monaco.typescript.typescriptDefaults;
	const jsDefaults = monaco.typescript.javascriptDefaults;

	if (enabled) {
		tsDefaults.setDiagnosticsOptions({
			noSemanticValidation: false,
			noSyntaxValidation: false,
		});
		const compilerOptions: monaco.typescript.CompilerOptions = {
			jsx: monaco.typescript.JsxEmit.React,
			allowJs: true,
			allowSyntheticDefaultImports: true,
			esModuleInterop: true,
			moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
			module: monaco.typescript.ModuleKind.ESNext,
			target: monaco.typescript.ScriptTarget.ESNext,
			jsxFactory: 'React.createElement',
			jsxFragmentFactory: 'React.Fragment',
		};
		tsDefaults.setCompilerOptions(compilerOptions);
		jsDefaults.setCompilerOptions(compilerOptions);
	} else {
		// Keep workers quiet for read-only viewers — avoids inmemory://model races
		tsDefaults.setDiagnosticsOptions({
			noSemanticValidation: true,
			noSyntaxValidation: true,
			noSuggestionDiagnostics: true,
		});
		jsDefaults.setDiagnosticsOptions({
			noSemanticValidation: true,
			noSyntaxValidation: true,
			noSuggestionDiagnostics: true,
		});
		tsDefaults.setCompilerOptions({
			jsx: monaco.typescript.JsxEmit.React,
			target: monaco.typescript.ScriptTarget.ESNext,
			noLib: true,
			allowNonTsExtensions: true,
		});
		jsDefaults.setCompilerOptions({
			jsx: monaco.typescript.JsxEmit.React,
			target: monaco.typescript.ScriptTarget.ESNext,
			noLib: true,
			allowNonTsExtensions: true,
		});
	}
}

// Default to lightweight diagnostics until an editable editor mounts.
applyTypeScriptDefaults(false);

function resolveEditorTheme(resolvedTheme: string | undefined) {
	return resolvedTheme === 'dark' ? 'vesper' : 'vs';
}

function toModelUri(path: string | undefined): monaco.Uri {
	if (path) {
		const normalized = path.replace(/^\/+/, '');
		return monaco.Uri.parse(`file:///${normalized}`);
	}
	// Anonymous model — unique URI so TS worker never reuses a disposed id
	return monaco.Uri.parse(
		`inmemory://vibesdk/${crypto.randomUUID()}.tsx`,
	);
}

/**
 * Get or create a model at a stable URI. Switching files via setModel (not
 * setValue on one model) avoids TS worker "Could not find source file" races.
 */
function getOrCreateModel(
	value: string,
	language: string,
	path: string | undefined,
): monaco.editor.ITextModel {
	const uri = toModelUri(path);
	const existing = monaco.editor.getModel(uri);
	if (existing) {
		if (existing.getValue() !== value) {
			existing.setValue(value);
		}
		if (existing.getLanguageId() !== language) {
			monaco.editor.setModelLanguage(existing, language);
		}
		return existing;
	}
	return monaco.editor.createModel(value, language, uri);
}

/** Dispose model after detaching so the TS worker can finish in-flight work. */
function disposeModelDeferred(model: monaco.editor.ITextModel | null) {
	if (!model || model.isDisposed()) return;
	// Detach first; delay dispose so worker callbacks don't hit a dead model
	window.setTimeout(() => {
		if (!model.isDisposed()) {
			model.dispose();
		}
	}, 0);
}

export type MonacoEditorProps = React.ComponentProps<'div'> & {
	createOptions?: monaco.editor.IStandaloneEditorConstructionOptions;
	/** Stable file path — used as model URI for clean file switches */
	path?: string;
	/**
	 * When true, path switches keep the viewport at the bottom (live generation).
	 * When false, path switches jump to the top (browsing complete files).
	 */
	stickToBottom?: boolean;
	find?: string;
	replace?: string;
	enableTypeScriptFeatures?: 'auto' | boolean;
};

const EMPTY_CREATE_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions =
	{};

export const MonacoEditor = memo<MonacoEditorProps>(function MonacoEditor({
	createOptions = EMPTY_CREATE_OPTIONS,
	path,
	stickToBottom = false,
	find,
	replace,
	enableTypeScriptFeatures = 'auto',
	...props
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const editor = useRef<monaco.editor.IStandaloneCodeEditor>(undefined);
	const ownedModel = useRef<monaco.editor.ITextModel | null>(null);
	const prevPath = useRef<string | undefined>(path);
	const prevValue = useRef<string>(createOptions.value || '');
	const stickyScroll = useRef(true);
	const findDecorationIds = useRef<string[]>([]);
	const { resolvedTheme } = useTheme();
	const createOptionsRef = useRef(createOptions);
	createOptionsRef.current = createOptions;
	const pathRef = useRef(path);
	pathRef.current = path;

	const shouldEnableTypeScript = React.useMemo(() => {
		if (enableTypeScriptFeatures === 'auto') {
			return !createOptions.readOnly;
		}
		return enableTypeScriptFeatures;
	}, [enableTypeScriptFeatures, createOptions.readOnly]);

	// Configure TypeScript diagnostics with multi-instance ref-counting
	useEffect(() => {
		if (shouldEnableTypeScript) {
			typescriptFeaturesUsers += 1;
			if (typescriptFeaturesUsers === 1) {
				applyTypeScriptDefaults(true);
			}
			return () => {
				typescriptFeaturesUsers -= 1;
				if (typescriptFeaturesUsers === 0) {
					applyTypeScriptDefaults(false);
				}
			};
		}
	}, [shouldEnableTypeScript]);

	useEffect(() => {
		const options = createOptionsRef.current;
		const {
			theme: _ignoredTheme,
			value,
			language,
			model: _ignoredModel,
			...restOptions
		} = options;

		const initialLanguage = language || 'typescript';
		const initialValue = value ?? '';
		const model = getOrCreateModel(
			initialValue,
			initialLanguage,
			pathRef.current,
		);
		ownedModel.current = model;

		editor.current = monaco.editor.create(containerRef.current!, {
			model,
			minimap: { enabled: false },
			theme: resolveEditorTheme(resolvedTheme),
			automaticLayout: true,
			fontSize: 13,
			...restOptions,
		});

		prevValue.current = initialValue;
		prevPath.current = pathRef.current;

		const editorDomNode = editor.current.getDomNode();
		const handleWheel = () => {
			stickyScroll.current = false;
		};
		const handleKeydown = (e: KeyboardEvent) => {
			if (e.key.includes('Arrow') || e.key.includes('Page')) {
				stickyScroll.current = false;
			}
		};

		if (editorDomNode) {
			editorDomNode.addEventListener('wheel', handleWheel);
			editorDomNode.addEventListener('keydown', handleKeydown);
		}

		return () => {
			if (editorDomNode) {
				editorDomNode.removeEventListener('wheel', handleWheel);
				editorDomNode.removeEventListener('keydown', handleKeydown);
			}
			findDecorationIds.current = [];
			// Detach model before dispose so worker doesn't race
			editor.current?.setModel(null);
			editor.current?.dispose();
			editor.current = undefined;
			disposeModelDeferred(ownedModel.current);
			ownedModel.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Keep non-value construction options in sync after mount
	const {
		theme: _ignoredTheme,
		value: _value,
		language: _language,
		model: _model,
		...updateableOptions
	} = createOptions;
	const updateableOptionsKey = JSON.stringify(updateableOptions);

	useEffect(() => {
		if (!editor.current) return;
		editor.current.updateOptions(updateableOptions);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [updateableOptionsKey]);

	// Path / value / language — switch models on path change; update content otherwise
	useEffect(() => {
		if (!editor.current) return;

		const nextValue = createOptions.value ?? '';
		const nextLanguage = createOptions.language || 'typescript';
		const pathChanged = path !== prevPath.current;
		const valueChanged = nextValue !== prevValue.current;

		if (pathChanged) {
			const previous = ownedModel.current;
			const nextModel = getOrCreateModel(nextValue, nextLanguage, path);

			// Clear decorations tied to the old model
			findDecorationIds.current = [];
			editor.current.setModel(nextModel);
			ownedModel.current = nextModel;

			// Don't dispose if getOrCreate reused the same instance
			if (previous && previous !== nextModel) {
				disposeModelDeferred(previous);
			}

			if (stickToBottom) {
				// Live generation: follow the end of the file
				stickyScroll.current = true;
				editor.current.revealLine(nextModel.getLineCount());
			} else {
				// Browsing complete files: start at top
				stickyScroll.current = false;
				editor.current.setScrollTop(0);
				editor.current.setPosition({ lineNumber: 1, column: 1 });
			}

			prevPath.current = path;
			prevValue.current = nextValue;
			return;
		}

		const model = editor.current.getModel();
		if (!model) return;

		if (valueChanged) {
			const isAppend =
				prevValue.current.length > 0 &&
				nextValue.startsWith(prevValue.current);

			if (isAppend) {
				// Streaming: preserve sticky-to-bottom behavior
				if (createOptions.readOnly) {
					model.setValue(nextValue);
				} else {
					model.pushEditOperations(
						[],
						[
							{
								range: model.getFullModelRange(),
								text: nextValue,
							},
						],
						() => null,
					);
				}
				if (stickyScroll.current) {
					editor.current.revealLine(model.getLineCount());
				}
			} else {
				// Content replaced on same path
				if (createOptions.readOnly) {
					model.setValue(nextValue);
				} else {
					model.pushEditOperations(
						[],
						[
							{
								range: model.getFullModelRange(),
								text: nextValue,
							},
						],
						() => null,
					);
				}
				stickyScroll.current = true;
				if (stickyScroll.current) {
					editor.current.revealLine(model.getLineCount());
				}
			}

			prevValue.current = nextValue;
		}

		if (model.getLanguageId() !== nextLanguage) {
			monaco.editor.setModelLanguage(model, nextLanguage);
		}
	}, [
		path,
		stickToBottom,
		createOptions.value,
		createOptions.language,
		createOptions.readOnly,
	]);

	// Find/replace decorations — owned IDs only; clear when find is gone; refresh on value
	useEffect(() => {
		if (!editor.current) return;

		const model = editor.current.getModel();
		if (!model) return;

		if (!find) {
			findDecorationIds.current = editor.current.deltaDecorations(
				findDecorationIds.current,
				[],
			);
			return;
		}

		const decorations: monaco.editor.IModelDeltaDecoration[] = [];
		const text = model.getValue();
		const regex = new RegExp(
			find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
			'g',
		);
		let match: RegExpExecArray | null;

		while ((match = regex.exec(text)) !== null) {
			const startPos = model.getPositionAt(match.index);
			const endPos = model.getPositionAt(match.index + match[0].length);
			const range = new monaco.Range(
				startPos.lineNumber,
				startPos.column,
				endPos.lineNumber,
				endPos.column,
			);

			decorations.push({
				range,
				options: {
					inlineClassName: 'diffDelete',
					hoverMessage: {
						value: replace
							? `Will be replaced with: ${replace}`
							: 'Will be deleted',
					},
				},
			});

			if (replace) {
				decorations.push({
					range,
					options: {
						after: {
							content: replace,
							inlineClassName: 'diffInsert',
						},
					},
				});
			}
		}

		findDecorationIds.current = editor.current.deltaDecorations(
			findDecorationIds.current,
			decorations,
		);
	}, [find, replace, createOptions.value, path]);

	useEffect(() => {
		if (editor.current) {
			monaco.editor.setTheme(resolveEditorTheme(resolvedTheme));
		}
	}, [resolvedTheme]);

	return <div {...props} ref={containerRef}></div>;
});

export type MonacoDiffEditorProps = React.ComponentProps<'div'> & {
	/** Stable file path — only used to key model recreation. */
	path?: string;
	/** Left/original side (e.g. the parent commit's version). */
	originalValue: string;
	/** Right/modified side (e.g. the selected commit's version). */
	modifiedValue: string;
	language?: string;
	/** Side-by-side (true) vs inline (false). Defaults to side-by-side. */
	renderSideBySide?: boolean;
};

/**
 * Read-only Monaco diff editor. Shares the theme and worker setup defined in
 * this module (light -> `vs`, dark -> `vesper`) so diffs match the code editor.
 * Models use anonymous URIs so they never collide with the main editor's
 * `file:///` models for the same path.
 */
export const MonacoDiffEditor = memo<MonacoDiffEditorProps>(
	function MonacoDiffEditor({
		path,
		originalValue,
		modifiedValue,
		language,
		renderSideBySide = true,
		...props
	}) {
		const containerRef = useRef<HTMLDivElement>(null);
		const diffEditor = useRef<monaco.editor.IStandaloneDiffEditor>(undefined);
		const originalModel = useRef<monaco.editor.ITextModel | null>(null);
		const modifiedModel = useRef<monaco.editor.ITextModel | null>(null);
		const { resolvedTheme } = useTheme();
		const renderSideBySideRef = useRef(renderSideBySide);
		renderSideBySideRef.current = renderSideBySide;

		useEffect(() => {
			diffEditor.current = monaco.editor.createDiffEditor(containerRef.current!, {
				readOnly: true,
				originalEditable: false,
				automaticLayout: true,
				minimap: { enabled: false },
				fontSize: 13,
				scrollBeyondLastLine: false,
				renderSideBySide: renderSideBySideRef.current,
				theme: resolveEditorTheme(resolvedTheme),
			});
			return () => {
				diffEditor.current?.setModel(null);
				diffEditor.current?.dispose();
				diffEditor.current = undefined;
				disposeModelDeferred(originalModel.current);
				disposeModelDeferred(modifiedModel.current);
				originalModel.current = null;
				modifiedModel.current = null;
			};
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, []);

		useEffect(() => {
			if (!diffEditor.current) return;
			const lang = language || 'plaintext';
			const prevOriginal = originalModel.current;
			const prevModified = modifiedModel.current;
			const original = monaco.editor.createModel(
				originalValue,
				lang,
				monaco.Uri.parse(`inmemory://diff-original/${crypto.randomUUID()}`),
			);
			const modified = monaco.editor.createModel(
				modifiedValue,
				lang,
				monaco.Uri.parse(`inmemory://diff-modified/${crypto.randomUUID()}`),
			);
			originalModel.current = original;
			modifiedModel.current = modified;
			diffEditor.current.setModel({ original, modified });
			disposeModelDeferred(prevOriginal);
			disposeModelDeferred(prevModified);
		}, [path, originalValue, modifiedValue, language]);

		useEffect(() => {
			if (diffEditor.current) {
				diffEditor.current.updateOptions({ renderSideBySide });
			}
		}, [renderSideBySide]);

		useEffect(() => {
			if (diffEditor.current) {
				monaco.editor.setTheme(resolveEditorTheme(resolvedTheme));
			}
		}, [resolvedTheme]);

		return <div {...props} ref={containerRef}></div>;
	},
);
