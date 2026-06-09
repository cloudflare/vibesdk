/**
 * GitHub-specific Utilities
 * Centralized GitHub API helpers
 */

/**
 * Create standardized GitHub API headers with consistent User-Agent
 */
export function createGitHubHeaders(
    accessToken: string,
): Record<string, string> {
    return {
        Authorization: `token ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Cloudflare-OrangeBuild-OAuth-Integration/1.0',
    };
}

/**
 * Extract error text from GitHub API response
 */
export async function extractGitHubErrorText(
    response: Response,
): Promise<string> {
    try {
        // Try to parse as JSON first (GitHub usually returns JSON errors)
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            const errorData = (await response.json()) as {
                message?: string;
                error?: string;
            };
            return (
                errorData.message ||
                errorData.error ||
                `HTTP ${response.status}`
            );
        } else {
            // Fallback to plain text
            const errorText = await response.text();
            return errorText || `HTTP ${response.status}`;
        }
    } catch (parseError) {
        // If parsing fails, return generic error
        return `HTTP ${response.status}`;
    }
}
