import { useState, useCallback, useEffect } from 'react';
import { WebSocket } from 'partysocket';
import { useAuth } from '@/contexts/auth-context';
import { apiClient } from '@/lib/api-client';
import type {
    AuthUser,
    GitHubExportOptions,
    GitHubExportResult
} from '../api-types';
import type { WebSocketMessageData } from '@/api-types';

// Use existing backend WebSocket types
type GitHubExportProgress = WebSocketMessageData<'github_export_progress'>;

export interface GitHubExportState {
    isExporting: boolean;
    progress?: GitHubExportProgress;
    result?: GitHubExportResult;
    isModalOpen: boolean;
}

export interface GitHubInstallationData {
    installationId: number;
    username: string;
    repositories?: string[];
}

export function useGitHubExport(_websocket?: WebSocket | null, agentId?: string): {
    isExporting: boolean;
    progress?: GitHubExportProgress;
    result?: GitHubExportResult;
    isModalOpen: boolean;
    openModal: () => void;
    closeModal: () => void;
    startExport: (options: GitHubExportOptions) => Promise<void>;
    isAuthenticated: boolean;
    user: AuthUser | null;
    retry: () => void;
} {
    const { user, isAuthenticated } = useAuth();
    const [state, setState] = useState<GitHubExportState>({
        isExporting: false,
        isModalOpen: false
    });

    // NOTE: WebSocket-based GitHub export has been replaced with secure OAuth flow
    // All GitHub export now happens via HTTP API with proper OAuth authorization

    // Open the export modal
    const openModal = useCallback(() => {
        setState(prev => ({
            ...prev,
            isModalOpen: true,
            result: undefined // Clear any previous results
        }));
    }, []);

    // Close the export modal
    const closeModal = useCallback(() => {
        setState(prev => ({
            ...prev,
            isModalOpen: false,
            isExporting: false,
            progress: undefined,
            result: undefined
        }));
    }, []);

    // Check for GitHub export callback results on component mount
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const githubExport = urlParams.get('github_export');
        
        if (githubExport === 'success') {
            const repositoryUrl = urlParams.get('repository_url');
            setState(prev => ({
                ...prev,
                isExporting: false,
                isModalOpen: true, // Auto-open modal to show success result
                result: {
                    success: true,
                    repositoryUrl: repositoryUrl || undefined
                }
            }));
            
            // Clean up URL
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('github_export');
            newUrl.searchParams.delete('repository_url');
            window.history.replaceState({}, '', newUrl.toString());
            
        } else if (githubExport === 'error') {
            const reason = urlParams.get('reason') || 'Unknown error';
            setState(prev => ({
                ...prev,
                isExporting: false,
                isModalOpen: true, // Auto-open modal to show error result
                result: {
                    success: false,
                    error: `GitHub export failed: ${reason}`
                }
            }));
            
            // Clean up URL
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.delete('github_export');
            newUrl.searchParams.delete('reason');
            window.history.replaceState({}, '', newUrl.toString());
        }
    }, []);

    // Start GitHub export with secure backend flow
    const startExport = useCallback(async (options: GitHubExportOptions) => {
        setState(prev => ({
            ...prev,
            isExporting: true,
            progress: { message: 'Initiating GitHub authorization...', step: 'creating_repository', progress: 10 },
            result: undefined
        }));

        try {
            // Validate agentId is available (should be from URL params)
            if (!agentId) {
                setState(prev => ({
                    ...prev,
                    isExporting: false,
                    result: {
                        success: false,
                        error: 'Invalid chat session. Please ensure you are on a valid chat page.'
                    }
                }));
                return;
            }

            // Initiate GitHub export with OAuth flow
            const response = await apiClient.initiateGitHubExport({
                repositoryName: options.repositoryName,
                description: options.description,
                isPrivate: options.isPrivate,
                agentId: agentId
            });

            if (response.data?.authUrl) {
                setState(prev => ({
                    ...prev,
                    progress: { message: 'Redirecting to GitHub...', step: 'creating_repository', progress: 25 }
                }));
                
                // Small delay for user feedback, then redirect
                setTimeout(() => {
                    window.location.href = response.data?.authUrl || '';
                }, 500);
            } else {
                setState(prev => ({
                    ...prev,
                    isExporting: false,
                    result: {
                        success: false,
                        error: 'Failed to initiate GitHub authorization'
                    }
                }));
            }
        } catch (error: any) {
            setState(prev => ({
                ...prev,
                isExporting: false,
                result: {
                    success: false,
                    error: error?.message || 'Failed to initiate GitHub export'
                }
            }));
        }
    }, [agentId]);

    // Retry function that resets state and allows a new export attempt
    const retry = useCallback(() => {
        setState(prev => ({
            ...prev,
            result: undefined,
            progress: undefined,
            isExporting: false
        }));
    }, []);

    return {
        ...state,
        openModal,
        closeModal,
        startExport,
        isAuthenticated,
        user,
        retry
    };
}