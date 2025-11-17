/**
 * Manages import maps for module resolution
 * Creates shims to share bundled React with CDN packages
 */

interface ImportMap {
	imports: Record<string, string>;
	scopes?: Record<string, Record<string, string>>;
}

function createBundledModuleShims(): { 
	react: string; 
	reactDom: string; 
	jsxRuntime: string;
} {
	const reactShim = `
		const React = window.React;
		export default React;
		export const useState = React.useState;
		export const useEffect = React.useEffect;
		export const useContext = React.useContext;
		export const useReducer = React.useReducer;
		export const useCallback = React.useCallback;
		export const useMemo = React.useMemo;
		export const useRef = React.useRef;
		export const useImperativeHandle = React.useImperativeHandle;
		export const useLayoutEffect = React.useLayoutEffect;
		export const useDebugValue = React.useDebugValue;
		export const createContext = React.createContext;
		export const forwardRef = React.forwardRef;
		export const memo = React.memo;
		export const Fragment = React.Fragment;
		export const createElement = React.createElement;
		export const cloneElement = React.cloneElement;
		export const isValidElement = React.isValidElement;
		export const Children = React.Children;
		export const Component = React.Component;
		export const PureComponent = React.PureComponent;
		export const createRef = React.createRef;
		export const lazy = React.lazy;
		export const Suspense = React.Suspense;
		export const StrictMode = React.StrictMode;
	`.trim();
	
	const reactDomShim = `
		const ReactDOM = window.ReactDOM || {};
		export default ReactDOM;
	`.trim();
	
	const jsxRuntimeShim = `
		export const jsx = window.React.createElement;
		export const jsxs = window.React.createElement;
		export const Fragment = window.React.Fragment;
	`.trim();
	
	return {
		react: URL.createObjectURL(
			new Blob([reactShim], { type: 'application/javascript' })
		),
		reactDom: URL.createObjectURL(
			new Blob([reactDomShim], { type: 'application/javascript' })
		),
		jsxRuntime: URL.createObjectURL(
			new Blob([jsxRuntimeShim], { type: 'application/javascript' })
		),
	};
}

const DEFAULT_IMPORT_MAP: ImportMap = {
	imports: {
		// React shims (will be set at initialization)
		// These will be blob URLs pointing to bundled React
		'react': '', // Will be set by createReactShims()
		'react-dom': '', // Will be set by createReactShims()
		'react/jsx-runtime': '', // Will be set by createReactShims()
		'react/jsx-dev-runtime': '', // Will alias to jsx-runtime
		
		// Lucide Icons (with React external)
		'lucide-react': 'https://esm.sh/lucide-react@0.454.0?external=react,react-dom',

		// Recharts (with React externals)
		'recharts': 'https://esm.sh/recharts@2.13.0?external=react,react-dom',

		// Reveal.js (Cloudflare CDN - highest priority)
		'reveal.js': 'https://cdnjs.cloudflare.com/ajax/libs/reveal.js/5.1.0/reveal.esm.js',

		// Utilities
		'clsx': 'https://esm.sh/clsx@2.1.1',
		'tailwind-merge': 'https://esm.sh/tailwind-merge@2.5.5',

		// Framer Motion (with React externals)
		'framer-motion': 'https://esm.sh/framer-motion@12.23.24?external=react,react-dom',
	},
};

let isInitialized = false;

export function initializeImportMaps(): void {
	if (isInitialized) {
		console.log('[ImportMapManager] Already initialized');
		return;
	}

	if (!HTMLScriptElement.supports || !HTMLScriptElement.supports('importmap')) {
		console.warn('[ImportMapManager] Import maps not supported');
		isInitialized = true;
		return;
	}

	const existing = document.querySelector('script[type="importmap"]');
	if (existing) {
		console.log('[ImportMapManager] Import map already exists');
		isInitialized = true;
		return;
	}

	const shims = createBundledModuleShims();
	DEFAULT_IMPORT_MAP.imports['react'] = shims.react;
	DEFAULT_IMPORT_MAP.imports['react-dom'] = shims.reactDom;
	DEFAULT_IMPORT_MAP.imports['react/jsx-runtime'] = shims.jsxRuntime;
	DEFAULT_IMPORT_MAP.imports['react/jsx-dev-runtime'] = shims.jsxRuntime;

	const script = document.createElement('script');
	script.type = 'importmap';
	script.textContent = JSON.stringify(DEFAULT_IMPORT_MAP, null, 2);
	document.head.appendChild(script);

	isInitialized = true;
	console.log('[ImportMapManager] Import map initialized with React shims', DEFAULT_IMPORT_MAP);
}

export function addImportMapping(packageName: string, url: string): void {
	if (isInitialized) {
		console.warn('[ImportMapManager] Cannot add mappings after initialization');
		return;
	}

	DEFAULT_IMPORT_MAP.imports[packageName] = url;
}

export function getPackageUrl(packageName: string): string | undefined {
	return DEFAULT_IMPORT_MAP.imports[packageName];
}

export function resolveBareSpecifier(specifier: string): string | undefined {
	return DEFAULT_IMPORT_MAP.imports[specifier];
}

export function isImportMapsSupported(): boolean {
	return !!(HTMLScriptElement.supports && HTMLScriptElement.supports('importmap'));
}
