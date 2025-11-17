export type CrossOrigin = 'anonymous' | 'use-credentials';

export interface ExternalResource {
	url: string;
	integrity?: string;
	crossOrigin?: CrossOrigin;
}

export const BABEL_STANDALONE: ExternalResource = {
	url: 'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js',
	integrity: 'sha384-1qlE7MZPM2pHD/pBZCU/yB8UCP52RYL8bge/qNdfNBCWToySp8/M+JL2waXU4hjJ',
	crossOrigin: 'anonymous',
};

export const TAILWIND_CDN: ExternalResource = {
	url: 'https://cdn.tailwindcss.com',
};

export const PRISM_THEME: ExternalResource = {
	url: 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css',
	integrity: 'sha384-wFjoQjtV1y5jVHbt0p35Ui8aV8GVpEZkyF99OXWqP/eNJDU93D3Ugxkoyh6Y2I4A',
	crossOrigin: 'anonymous',
};

export const INTER_JETBRAINS_FONTS: ExternalResource = {
	url: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
	crossOrigin: 'anonymous',
};

export const HTML2CANVAS_CDN: ExternalResource = {
	url: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
	integrity: 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H',
	crossOrigin: 'anonymous',
};
