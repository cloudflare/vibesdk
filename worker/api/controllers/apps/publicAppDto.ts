/**
 * Public response projections for app endpoints.
 *
 * The persistence model (schema.apps / EnhancedAppData) intentionally carries
 * sensitive and operational data (original prompts, deployment IDs, anonymous
 * session tokens, internal user IDs). These helpers are the single source of
 * truth for what may leave the worker on the public app endpoints. Any new
 * public field must be added here explicitly.
 */

import type {
    EnhancedAppData,
    PublicAppListData,
    PublicAppDetailData,
} from '../../../database/types';

/**
 * GitHub repository fields are only safe to expose for public repositories.
 * For private repos (or non-owner viewers) both fields are nulled.
 */
function publicGithubFields(
    app: Pick<EnhancedAppData, 'githubRepositoryUrl' | 'githubRepositoryVisibility'>,
): Pick<PublicAppListData, 'githubRepositoryUrl' | 'githubRepositoryVisibility'> {
    const isPublicRepo = app.githubRepositoryVisibility === 'public';
    return {
        githubRepositoryUrl: isPublicRepo ? app.githubRepositoryUrl : null,
        githubRepositoryVisibility: isPublicRepo ? app.githubRepositoryVisibility : null,
    };
}

/**
 * Whitelist an enhanced app row for the public listing response. Drops every
 * sensitive/operational column; exposes GitHub fields only for public repos.
 */
export function toPublicAppListItem(app: EnhancedAppData): PublicAppListData {
    return {
        id: app.id,
        title: app.title,
        description: app.description,
        iconUrl: app.iconUrl,
        framework: app.framework,
        visibility: app.visibility,
        status: app.status,
        isFeatured: app.isFeatured,
        screenshotUrl: app.screenshotUrl,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
        lastDeployedAt: app.lastDeployedAt,
        ...publicGithubFields(app),
        userName: app.userName,
        userAvatar: app.userAvatar,
        starCount: app.starCount,
        viewCount: app.viewCount,
        forkCount: app.forkCount,
        likeCount: app.likeCount,
        userStarred: app.userStarred,
        userFavorited: app.userFavorited,
    };
}

/**
 * Whitelist an enhanced app row for the detail response.
 *
 * The original prompt and generated code are intended to be visible on public
 * apps, so `originalPrompt` is always included. Operational fields (`userId`,
 * `deploymentId`) and private-repo GitHub URLs are only exposed to the owner.
 */
export function toPublicAppDetail(
    app: EnhancedAppData,
    isOwner: boolean,
): PublicAppDetailData {
    const base = toPublicAppListItem(app);
    const github = isOwner
        ? {
              githubRepositoryUrl: app.githubRepositoryUrl,
              githubRepositoryVisibility: app.githubRepositoryVisibility,
          }
        : {};

    return {
        ...base,
        ...github,
        originalPrompt: app.originalPrompt,
        userId: isOwner ? app.userId : undefined,
        deploymentId: isOwner ? app.deploymentId : undefined,
    };
}
