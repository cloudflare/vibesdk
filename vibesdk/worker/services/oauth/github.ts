/**
 * GitHub OAuth Provider
 * Implements GitHub OAuth 2.0 authentication
 */

import { BaseOAuthProvider } from './base';
import type { OAuthUserInfo } from '../../types/auth-types';
import { OAuthProvider } from '../../types/auth-types';
import { createLogger } from '../../logger';
import { createGitHubHeaders, extractGitHubErrorText } from '../../utils/githubUtils';

const logger = createLogger('GitHubOAuth');

/**
 * GitHub OAuth Provider implementation
 */
export class GitHubOAuthProvider extends BaseOAuthProvider {
    protected readonly provider: OAuthProvider = 'github';
    protected readonly authorizationUrl = 'https://github.com/login/oauth/authorize';
    protected readonly tokenUrl = 'https://github.com/login/oauth/access_token';
    protected readonly userInfoUrl = 'https://api.github.com/user';
    protected readonly emailsUrl = 'https://api.github.com/user/emails';
    
    // Minimal scopes for authentication only - NO repo access
    protected readonly scopes = [
        'read:user',
        'user:email'
    ];
    
    /**
     * Get user info from GitHub
     */
    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
        try {
            // Get basic user info
            const userResponse = await fetch(this.userInfoUrl, {
                headers: createGitHubHeaders(accessToken)
            });
            
            if (!userResponse.ok) {
                const error = await extractGitHubErrorText(userResponse);
                logger.error('Failed to get user info', { 
                    status: userResponse.status, 
                    error: error.substring(0, 200) // Log only first 200 chars
                });
                throw new Error('Failed to retrieve user information from GitHub');
            }
            
            const userData = await userResponse.json() as {
                id: number;
                login: string;
                email?: string;
                name?: string;
                avatar_url?: string;
            };
            
            // GitHub might not return email in user endpoint
            let email = userData.email;
            
            if (!email) {
                // Fetch email from emails endpoint
                const emailsResponse = await fetch(this.emailsUrl, {
                    headers: createGitHubHeaders(accessToken)
                });
                
                if (emailsResponse.ok) {
                    const emails = await emailsResponse.json() as Array<{
                        email: string;
                        verified: boolean;
                        primary: boolean;
                    }>;
                    
                    // Find primary email
                    const primaryEmail = emails.find(e => e.primary);
                    if (primaryEmail) {
                        email = primaryEmail.email;
                    } else if (emails.length > 0) {
                        // Fallback to first verified email
                        const verifiedEmail = emails.find(e => e.verified);
                        email = verifiedEmail?.email || emails[0].email;
                    }
                }
            }
            
            if (!email) {
                throw new Error('Could not retrieve user email from GitHub');
            }
            
            return {
                id: String(userData.id),
                email,
                name: userData.name || userData.login,
                picture: userData.avatar_url,
                emailVerified: true // GitHub verifies emails
            };
        } catch (error) {
            logger.error('Error getting user info', error);
            throw error;
        }
    }
    
    /**
     * Create GitHub OAuth provider instance
     */
    static create(env: Env, baseUrl: string): GitHubOAuthProvider {
        if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
            throw new Error('GitHub OAuth credentials not configured');
        }
        
        const redirectUri = `${baseUrl}/api/auth/callback/github`;
        
        return new GitHubOAuthProvider(
            env.GITHUB_CLIENT_ID,
            env.GITHUB_CLIENT_SECRET,
            redirectUri
        );
    }
}