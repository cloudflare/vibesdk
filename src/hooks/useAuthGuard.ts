/**
 * Authentication Guard Hook
 * Provides easy authentication checks and login prompts for protected actions
 */

import { useCallback } from 'react';
import { useAuth } from '../contexts/auth-context';
import { useAuthModal } from '../components/auth/AuthModalProvider';
import { AuthUser } from '@/api-types';

export interface AuthGuardOptions {
  requireFullAuth?: boolean; // If true, anonymous users are not allowed
  actionContext?: string; // Context message for the login modal
  onSuccess?: () => void; // Callback to execute after successful authentication
  intendedUrl?: string; // URL to redirect to after authentication
}

export interface AuthGuardReturn {
  isAuthenticated: boolean;
  user: AuthUser | null;
  requireAuth: (options?: AuthGuardOptions) => boolean;
}

/**
 * Hook that provides authentication guard functionality
 */
export function useAuthGuard(): AuthGuardReturn {
  const { isAuthenticated, user } = useAuth();
  const { showAuthModal } = useAuthModal();

  const requireAuth = useCallback((options: AuthGuardOptions = {}) => {
    // If already authenticated, check if anonymous users are allowed
    if (isAuthenticated) {
      if (options.requireFullAuth && user?.isAnonymous) {
        showAuthModal(options.actionContext, options.onSuccess, options.intendedUrl);
        return false;
      }
      // User is authenticated and meets requirements, execute success callback immediately
      if (options.onSuccess) {
        options.onSuccess();
      }
      return true;
    }

    // Show login modal with context, pending action, and intended URL
    showAuthModal(options.actionContext, options.onSuccess, options.intendedUrl);
    return false;
  }, [isAuthenticated, user?.isAnonymous, showAuthModal]);

  return {
    isAuthenticated,
    user,
    requireAuth,
  };
}