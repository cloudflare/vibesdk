import * as Sentry from '@sentry/react';
import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

function ErrorFallback({ error, resetError }: { error: Error | unknown; resetError: () => void; }) {
  const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="flex justify-center">
          <AlertCircle className="h-16 w-16 text-red-500" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground">
            An unexpected error occurred. Our team has been notified.
          </p>
        </div>
        
        {import.meta.env.DEV && (
          <div className="bg-muted p-4 rounded-lg text-left">
            <p className="font-mono text-sm text-red-600 break-all">
              {errorMessage}
            </p>
          </div>
        )}
        
        <div className="flex gap-3 justify-center">
          <Button onClick={resetError} variant="default">
            Try Again
          </Button>
          <Button
            onClick={() => window.location.href = '/'}
            variant="outline"
          >
            Go Home
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  showDialog?: boolean;
}

export function ErrorBoundary({ 
  children, 
  showDialog = false 
}: ErrorBoundaryProps) {
  return (
    <Sentry.ErrorBoundary
      fallback={ErrorFallback}
      showDialog={showDialog}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}

// Export the default fallback component for reuse
export { ErrorFallback };
