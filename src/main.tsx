import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';

import { routes } from './routes.ts';
import './index.css';

// Initialize Sentry lazily to enable code-splitting of Sentry bundle
if (typeof window !== 'undefined') {
	const schedule = (cb: () => void) => {
		// Prefer idle time to avoid blocking initial render
		if (typeof requestIdleCallback === 'function') return requestIdleCallback(cb);
		setTimeout(cb, 0);
	};
	schedule(() => {
		import('@/utils/sentry')
			.then(({ initSentry }) => initSentry())
			.catch(() => {
				// Swallow errors to avoid breaking first paint if Sentry fails to load
			});
	});
}

// Type for React Router hydration data  
import type { RouterState } from 'react-router';

declare global {
  interface Window {
    __staticRouterHydrationData?: Partial<Pick<RouterState, 'loaderData' | 'actionData' | 'errors'>>;
  }
}

const router = createBrowserRouter(routes, {
	hydrationData: window.__staticRouterHydrationData,
});

createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />
);
