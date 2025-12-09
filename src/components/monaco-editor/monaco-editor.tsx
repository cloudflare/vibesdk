import React, { memo, useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { useTheme } from '../../contexts/theme-context';

import 'monaco-editor/esm/vs/editor/editor.all.js';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

import defaultCode from '../../routes?raw';
import './monaco-editor.module.css';

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
		if (
			label === 'typescript' ||
			label === 'javascript' ||
			label === 'typescriptreact' ||
			label === 'javascriptreact'
		) {
			return new tsWorker();
		}
		return new editorWorker();
	},
};

// From GitHub Dark theme
monaco.editor.defineTheme('vibesdk-dark', {
	base: 'vs-dark',
	inherit: true,
	rules: [
		{ token: '', foreground: 'c9d1d9', background: '0d1117' },
		{ token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
		{ token: 'keyword', foreground: 'ff7b72' },
		{ token: 'number', foreground: '79c0ff' },
		{ token: 'string', foreground: 'a5d6ff' },
		{ token: 'type', foreground: 'ffa657' },
		{ token: 'class', foreground: 'd2a8ff' },
		{ token: 'interface', foreground: 'ffdf5d' },
		{ token: 'function', foreground: 'd2a8ff' },
		{ token: 'member', foreground: '79c0ff' },
		{ token: 'variable', foreground: 'c9d1d9' },
		{ token: 'constant', foreground: 'ffab70' },
		{ token: 'operator', foreground: 'ff7b72' },
		{ token: 'namespace', foreground: 'ffab70' },
		{ token: 'predefined', foreground: 'ffa657' },
		{ token: 'invalid', foreground: 'ffffff', background: 'f85149' },
	],
	colors: {
		// default backgorund, overriden to match theme
		// 'editor.background': '#0d1117',
		'editor.background': '#171512',
		'editor.foreground': '#c9d1d9',
		'editorLineNumber.foreground': '#444c56',
		'editorLineNumber.activeForeground': '#8b949e',
		'editorCursor.foreground': '#58a6ff',
		'editorIndentGuide.background': '#21262d',
		'editorIndentGuide.activeBackground': '#30363d',
		'editor.selectionBackground': '#264f78',
		'editor.inactiveSelectionBackground': '#1f6feb44',
		'editor.lineHighlightBackground': '#161b22',
		'editor.wordHighlightBackground': '#3fb95040',
		'editor.wordHighlightStrongBackground': '#ff7b7240',
		'editor.findMatchBackground': '#ffd33d44',
		'editor.findMatchHighlightBackground': '#ffd33d22',
	},
});

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

monaco.editor.setTheme('vibesdk');

export type MonacoEditorProps = React.ComponentProps<'div'> & {
	createOptions?: monaco.editor.IStandaloneEditorConstructionOptions;
	find?: string;
	replace?: string;
	enableTypeScriptFeatures?: 'auto' | boolean;
};

export const MonacoEditor = memo<MonacoEditorProps>(function MonacoEditor({
	createOptions = {},
	find,
	replace,
	enableTypeScriptFeatures = 'auto',
	...props
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const editor = useRef<monaco.editor.IStandaloneCodeEditor>(undefined);
	const prevValue = useRef<string>(createOptions.value || '');
	const stickyScroll = useRef(true);
	const { theme } = useTheme();

	const shouldEnableTypeScript = React.useMemo(() => {
		if (enableTypeScriptFeatures === 'auto') {
			return !createOptions.readOnly;
		}
		return enableTypeScriptFeatures;
	}, [enableTypeScriptFeatures, createOptions.readOnly]);

	// Configure TypeScript diagnostics based on mode
	useEffect(() => {
		const tsDefaults = monaco.languages.typescript.typescriptDefaults;
		const jsDefaults = monaco.languages.typescript.javascriptDefaults;

		if (shouldEnableTypeScript) {
			// Enable full IntelliSense for editing
			tsDefaults.setDiagnosticsOptions({
				noSemanticValidation: false,
				noSyntaxValidation: false,
			});
			tsDefaults.setCompilerOptions({
				jsx: monaco.languages.typescript.JsxEmit.React,
				allowJs: true,
				allowSyntheticDefaultImports: true,
				esModuleInterop: true,
				moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
				module: monaco.languages.typescript.ModuleKind.ESNext,
				target: monaco.languages.typescript.ScriptTarget.ESNext,
				jsxFactory: 'React.createElement',
				jsxFragmentFactory: 'React.Fragment',
			});
			jsDefaults.setCompilerOptions({
				allowJs: true,
				allowSyntheticDefaultImports: true,
				esModuleInterop: true,
				jsx: monaco.languages.typescript.JsxEmit.React,
				moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
				module: monaco.languages.typescript.ModuleKind.ESNext,
				target: monaco.languages.typescript.ScriptTarget.ESNext,
				jsxFactory: 'React.createElement',
				jsxFragmentFactory: 'React.Fragment',
			});
		} else {
			// Disable expensive features for viewing
			tsDefaults.setDiagnosticsOptions({
				noSemanticValidation: true,
				noSyntaxValidation: true,
			});
			tsDefaults.setCompilerOptions({
				jsx: monaco.languages.typescript.JsxEmit.React,
				target: monaco.languages.typescript.ScriptTarget.ESNext,
			});
			jsDefaults.setCompilerOptions({
				jsx: monaco.languages.typescript.JsxEmit.React,
				target: monaco.languages.typescript.ScriptTarget.ESNext,
			});
		}
	}, [shouldEnableTypeScript]);


	useEffect(() => {
		let configuredTheme = theme;
		if (theme === 'system') {
			configuredTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
		}
		editor.current = monaco.editor.create(containerRef.current!, {
			language: createOptions.language || 'typescript',
			minimap: { enabled: false },
			theme: configuredTheme === 'dark' ? 'vibesdk-dark' : 'vibesdk',
			automaticLayout: true,
			value: defaultCode,
			fontSize: 13,
			...createOptions,
		});

		// Add scroll listener to detect user interaction
		const editorDomNode = editor.current.getDomNode();
		const handleWheel = () => {
			if (stickyScroll.current) {
				stickyScroll.current = false;
			}
		};
		const handleKeydown = (e: KeyboardEvent) => {
			// Disable sticky scroll on arrow keys, Page Up/Down
			if (e.key.includes('Arrow') || e.key.includes('Page')) {
				if (stickyScroll.current) {
					stickyScroll.current = false;
				}
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
			const model = editor.current?.getModel();
			if (model) {
				model.dispose();
			}
			editor.current?.dispose();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (editor.current && createOptions.value !== prevValue.current) {
			const model = editor.current.getModel();
			if (!model) return;

			model.pushEditOperations(
				[],
				[{
					range: model.getFullModelRange(),
					text: createOptions.value || ''
				}],
				() => null
			);

			if (stickyScroll.current) {
				const lineCount = model.getLineCount();
				editor.current.revealLine(lineCount);
			}

			if (createOptions.language) {
				monaco.editor.setModelLanguage(model, createOptions.language);
			}

			prevValue.current = createOptions.value || '';
		}
	}, [createOptions.value, createOptions.language]);

	useEffect(() => {
		if (!editor.current || !find) return;

		const model = editor.current.getModel();
		if (!model) return;

		const decorations: monaco.editor.IModelDeltaDecoration[] = [];
		const text = model.getValue();
		let match: RegExpExecArray | null;
		const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');

		while ((match = regex.exec(text)) !== null) {
			const startPos = model.getPositionAt(match.index);
			const endPos = model.getPositionAt(match.index + match[0].length);

			decorations.push({
				range: new monaco.Range(
					startPos.lineNumber,
					startPos.column,
					endPos.lineNumber,
					endPos.column,
				),
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
					range: new monaco.Range(
						startPos.lineNumber,
						startPos.column,
						endPos.lineNumber,
						endPos.column,
					),
					options: {
						after: {
							content: replace,
							inlineClassName: 'diffInsert',
						},
					},
				});
			}
		}

		const oldDecorations = editor.current.getModel()?.getAllDecorations() || [];
		editor.current.deltaDecorations(
			oldDecorations.map((d) => d.id),
			decorations,
		);
	}, [find, replace]);

	// Update theme when app theme changes
	useEffect(() => {
		if (editor.current) {
			monaco.editor.setTheme(theme === 'dark' ? 'vibesdk-dark' : 'vibesdk');
		}
	}, [theme]);

	return <div {...props} ref={containerRef}></div>;
});
