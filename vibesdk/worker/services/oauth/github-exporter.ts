import type { OAuthUserInfo } from '../../types/auth-types';
import { createLogger } from '../../logger';
import { createGitHubHeaders } from '../../utils/githubUtils';
import { GitHubOAuthProvider } from './github';

const logger = createLogger('GitHubExporterOAuth');

export class GitHubExporterOAuthProvider extends GitHubOAuthProvider {
    protected readonly scopes = [
        'public_repo',
        'repo'
    ];
    
    async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
        try {
            const userResponse = await fetch(this.userInfoUrl, {
                headers: createGitHubHeaders(accessToken)
            });
            
            if (!userResponse.ok) {
                throw new Error('Failed to retrieve user information from GitHub');
            }
            
            const userData = await userResponse.json() as {
                id: number;
                login: string;
                email?: string;
                name?: string;
                avatar_url?: string;
            };
            
            return {
                id: String(userData.id),
                email: userData.email || `${userData.login}@github.local`,
                name: userData.name || userData.login,
                picture: userData.avatar_url,
                emailVerified: true
            };
        } catch (error) {
            logger.error('Error getting user info', error);
            throw error;
        }
    }
    
    static create(env: Env, baseUrl: string): GitHubExporterOAuthProvider {
        if (!env.GITHUB_EXPORTER_CLIENT_ID || !env.GITHUB_EXPORTER_CLIENT_SECRET) {
            throw new Error('GitHub App OAuth credentials not configured');
        }

        const redirectUri = `${baseUrl}/api/github-exporter/callback`;
        
        return new GitHubExporterOAuthProvider(
            env.GITHUB_EXPORTER_CLIENT_ID,
            env.GITHUB_EXPORTER_CLIENT_SECRET,
            redirectUri
        );
    }
}
