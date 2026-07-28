import { Outlet } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/auth-context';
import { AuthModalProvider } from './components/auth/AuthModalProvider';
import { ThemeProvider } from './contexts/theme-context';
import { VaultProvider } from './contexts/vault-context';
import { LimitsProvider } from './contexts/limits-context';
import { Toaster } from './components/ui/sonner';
import { AppLayout } from './components/layout/app-layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FeatureProvider } from './features';
import { Toasty } from '@cloudflare/kumo';
import { queryClient } from './lib/query-client';
import { useAppsQuerySync } from './hooks/use-apps';

function AppsQuerySync() {
	useAppsQuerySync();
	return null;
}

export default function App() {
	return (
		<ErrorBoundary>
			<QueryClientProvider client={queryClient}>
				<ThemeProvider>
					<FeatureProvider>
						<AuthProvider>
							<AppsQuerySync />
							<VaultProvider>
								<LimitsProvider>
									<AuthModalProvider>
										<AppLayout>
											<Toasty>
												<Outlet />
											</Toasty>
										</AppLayout>
										<Toaster
											richColors
											position="top-right"
										/>
									</AuthModalProvider>
								</LimitsProvider>
							</VaultProvider>
						</AuthProvider>
					</FeatureProvider>
				</ThemeProvider>
			</QueryClientProvider>
		</ErrorBoundary>
	);
}
