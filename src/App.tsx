import { Outlet } from 'react-router';
import { AuthProvider } from './contexts/auth-context';
import { AuthModalProvider } from './components/auth/AuthModalProvider';
import { ThemeProvider } from './contexts/theme-context';
import { VaultProvider } from './contexts/vault-context';
import { LimitsProvider } from './contexts/limits-context';
import { Toaster } from './components/ui/sonner';
import { AppLayout } from './components/layout/app-layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FeatureProvider } from './features';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <FeatureProvider>
          <AuthProvider>
            <VaultProvider>
              <LimitsProvider>
                <AuthModalProvider>
                  <AppLayout>
                    <Outlet />
                  </AppLayout>
                  <Toaster richColors position="top-right" />
                </AuthModalProvider>
              </LimitsProvider>
            </VaultProvider>
          </AuthProvider>
        </FeatureProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
