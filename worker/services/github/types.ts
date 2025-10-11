/**
 * GitHub service types and utilities
 * Extends Octokit types where possible to avoid duplication
 */

import { RestEndpointMethodTypes } from '@octokit/rest';

// Use Octokit's built-in repository type
export type GitHubRepository = RestEndpointMethodTypes['repos']['get']['response']['data'];

// Use Octokit's built-in user type
export type GitHubUser = RestEndpointMethodTypes['users']['getByUsername']['response']['data'];

// Use Octokit's built-in installation type
export type GitHubInstallation = RestEndpointMethodTypes['apps']['getInstallation']['response']['data'];

// Use Octokit's built-in app token type  
export type GitHubAppToken = RestEndpointMethodTypes['apps']['createInstallationAccessToken']['response']['data'];

// OAuth token response (not covered by Octokit types)
export interface GitHubUserAccessToken {
    access_token: string;
    token_type: string;
    scope: string;
    refresh_token?: string;
    expires_in?: number;
}

// Service-specific options interface
export interface CreateRepositoryOptions {
    name: string;
    description?: string;
    private: boolean;
    auto_init?: boolean;
    token: string;
}

// Service result interfaces
export interface CreateRepositoryResult {
    success: boolean;
    repository?: GitHubRepository;
    error?: string;
}

export interface GitHubTokenResult {
    success: boolean;
    token?: string;
    expires_at?: string;
    error?: string;
}

export interface GitHubExportOptions {
    repositoryName: string;
    description?: string;
    isPrivate: boolean;
    installationId?: number;
}

export interface GitHubExportResult {
    success: boolean;
    repositoryUrl?: string;
    cloneUrl?: string;
    token?: string;
    error?: string;
}

// Note: GitHubPushRequest and GitHubPushResponse are defined in sandboxTypes.ts
// to maintain proper architectural boundaries between services

export type GitHubTokenType = 'installation' | 'user_access' | 'oauth';

export interface GitHubServiceConfig {
    clientId?: string;
    clientSecret?: string;
}

export class GitHubServiceError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly statusCode?: number,
        public readonly originalError?: unknown
    ) {
        super(message);
        this.name = 'GitHubServiceError';
    }
}