export type CrossOrigin = 'anonymous' | 'use-credentials';

export interface ExternalResource {
	url: string;
	integrity?: string;
	crossOrigin?: CrossOrigin;
}

export const BABEL_STANDALONE: ExternalResource = {
	url: 'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js',
	crossOrigin: 'anonymous',
};

export const TAILWIND_CDN: ExternalResource = {
	url: 'https://cdn.tailwindcss.com',
};

export const PRISM_THEME: ExternalResource = {
	url: 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css',
	crossOrigin: 'anonymous',
};

export const INTER_JETBRAINS_FONTS: ExternalResource = {
	url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
	crossOrigin: 'anonymous',
};

export const HTML2CANVAS_CDN: ExternalResource = {
	url: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
	crossOrigin: 'anonymous',
};
