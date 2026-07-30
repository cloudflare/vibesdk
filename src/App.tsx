import { useState } from 'react';
import { Outlet } from 'react-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AuthProvider } from './contexts/auth-context';
import { AuthModalProvider } from './components/auth/AuthModalProvider';
import { ThemeProvider } from './contexts/theme-context';
import { LimitsProvider } from './contexts/limits-context';
import { Toaster } from './components/ui/sonner';
import { AppLayout } from './components/layout/app-layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FeatureProvider } from './features';
import { Toasty } from '@cloudflare/kumo';
import { createQueryClient, queryPersistOptions } from './lib/query-client';
import { useAppsQuerySync } from './hooks/use-apps';
import { AppLinkProvider } from './components/providers/app-link-provider';

function AppsQuerySync() {
	useAppsQuerySync();
	return null;
}

export default function App() {
	const [queryClient] = useState(createQueryClient);

	return (
		<ErrorBoundary>
			<PersistQueryClientProvider
				client={queryClient}
				persistOptions={queryPersistOptions}
			>
				<ThemeProvider>
					<FeatureProvider>
						<AuthProvider>
							<AppsQuerySync />
							<LimitsProvider>
								<AuthModalProvider>
									<AppLayout>
										<Toasty>
											<AppLinkProvider>
												<Outlet />
											</AppLinkProvider>
										</Toasty>
									</AppLayout>
									<Toaster
										richColors
										position="top-right"
									/>
								</AuthModalProvider>
							</LimitsProvider>
						</AuthProvider>
					</FeatureProvider>
				</ThemeProvider>
			</PersistQueryClientProvider>
		</ErrorBoundary>
	);
}
