import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Schema enum arrays derived from config types  
const REASONING_EFFORT_VALUES = ['low', 'medium', 'high'] as const;
const PROVIDER_OVERRIDE_VALUES = ['cloudflare', 'direct'] as const;

// ========================================
// CORE USER AND IDENTITY MANAGEMENT
// ========================================

/**
 * Users table - Core user identity and profile information
 * Supports OAuth providers and user preferences
 */
export const users = sqliteTable('users', {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    username: text('username').unique(), // Optional username for public identity
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    
    // OAuth and Authentication
    provider: text('provider').notNull(), // 'github', 'google', 'email'
    providerId: text('provider_id').notNull(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
    passwordHash: text('password_hash'), // Only for provider: 'email'
    
    // Security enhancements
    failedLoginAttempts: integer('failed_login_attempts').default(0),
    lockedUntil: integer('locked_until', { mode: 'timestamp' }),
    passwordChangedAt: integer('password_changed_at', { mode: 'timestamp' }),
    
    // User Preferences and Settings
    preferences: text('preferences', { mode: 'json' }).default('{}'),
    theme: text('theme', { enum: ['light', 'dark', 'system'] }).default('system'),
    timezone: text('timezone').default('UTC'),
    
    // Account Status
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    isSuspended: integer('is_suspended', { mode: 'boolean' }).default(false),
    
    // Metadata
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
    lastActiveAt: integer('last_active_at', { mode: 'timestamp' }),
    
    // Soft delete
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
}, (table) => ({
    emailIdx: index('users_email_idx').on(table.email),
    providerIdx: uniqueIndex('users_provider_unique_idx').on(table.provider, table.providerId),
    usernameIdx: index('users_username_idx').on(table.username),
    failedLoginAttemptsIdx: index('users_failed_login_attempts_idx').on(table.failedLoginAttempts),
    lockedUntilIdx: index('users_locked_until_idx').on(table.lockedUntil),
    isActiveIdx: index('users_is_active_idx').on(table.isActive),
    lastActiveAtIdx: index('users_last_active_at_idx').on(table.lastActiveAt),
}));

/**
 * Sessions table - JWT session management with refresh token support
 */
export const sessions = sqliteTable('sessions', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    
    // Session Details
    deviceInfo: text('device_info'),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    
    // Security metadata
    isRevoked: integer('is_revoked', { mode: 'boolean' }).default(false),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    revokedReason: text('revoked_reason'),
    
    // Token Management
    accessTokenHash: text('access_token_hash').notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    
    // Timing
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
    lastActivity: integer('last_activity', { mode: 'timestamp' }),
}, (table) => ({
    userIdIdx: index('sessions_user_id_idx').on(table.userId),
    expiresAtIdx: index('sessions_expires_at_idx').on(table.expiresAt),
    accessTokenHashIdx: index('sessions_access_token_hash_idx').on(table.accessTokenHash),
    refreshTokenHashIdx: index('sessions_refresh_token_hash_idx').on(table.refreshTokenHash),
    lastActivityIdx: index('sessions_last_activity_idx').on(table.lastActivity),
    isRevokedIdx: index('sessions_is_revoked_idx').on(table.isRevoked),
}));

/**
 * API Keys table - Manage user API keys for programmatic access
 */
export const apiKeys = sqliteTable('api_keys', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    
    // Key Details
    name: text('name').notNull(), // User-friendly name for the API key
    keyHash: text('key_hash').notNull().unique(), // Hashed API key for security
    keyPreview: text('key_preview').notNull(), // First few characters for display (e.g., "sk_prod_1234...")
    
    // Security and Access Control
    scopes: text('scopes').notNull(), // JSON array of allowed scopes
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    
    // Usage Tracking
    lastUsed: integer('last_used', { mode: 'timestamp' }),
    requestCount: integer('request_count').default(0), // Track usage
    
    // Timing
    expiresAt: integer('expires_at', { mode: 'timestamp' }), // Optional expiration
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    userIdIdx: index('api_keys_user_id_idx').on(table.userId),
    keyHashIdx: index('api_keys_key_hash_idx').on(table.keyHash),
    isActiveIdx: index('api_keys_is_active_idx').on(table.isActive),
    expiresAtIdx: index('api_keys_expires_at_idx').on(table.expiresAt),
}));

// ========================================
// CORE APP AND GENERATION SYSTEM
// ========================================

/**
 * Apps table - Generated applications with comprehensive metadata
 */
export const apps = sqliteTable('apps', {
    id: text('id').primaryKey(),
    
    // App Identity
    title: text('title').notNull(),
    description: text('description'),
    iconUrl: text('icon_url'), // App icon URL
    
    // Original Generation Data
    originalPrompt: text('original_prompt').notNull(), // The user's original request
    finalPrompt: text('final_prompt'), // The processed/refined prompt used for generation
    
    // Generated Content  
    framework: text('framework'), // 'react', 'vue', 'svelte', etc.
    
    // Ownership and Context
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }), // Null for anonymous
    sessionToken: text('session_token'), // For anonymous users
    
    // Visibility and Sharing
    visibility: text('visibility', { enum: ['private', 'public'] }).notNull().default('private'),
    
    // Status and State
    status: text('status', { enum: ['generating', 'completed'] }).notNull().default('generating'),
    
    // Deployment Information
    deploymentId: text('deployment_id'), // Deployment ID (extracted from deployment URL)
    
    // GitHub Repository Integration
    githubRepositoryUrl: text('github_repository_url'), // GitHub repository URL
    githubRepositoryVisibility: text('github_repository_visibility', { enum: ['public', 'private'] }), // Repository visibility
    
    // App Metadata
    isArchived: integer('is_archived', { mode: 'boolean' }).default(false),
    isFeatured: integer('is_featured', { mode: 'boolean' }).default(false), // Featured by admins
    
    // Versioning (for future support)
    version: integer('version').default(1),
    parentAppId: text('parent_app_id'), // If forked from another app
    
    // Screenshot Information
    screenshotUrl: text('screenshot_url'), // URL to saved screenshot image
    screenshotCapturedAt: integer('screenshot_captured_at', { mode: 'timestamp' }), // When screenshot was last captured
    
    // Metadata
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
    lastDeployedAt: integer('last_deployed_at', { mode: 'timestamp' }),
}, (table) => ({
    userIdx: index('apps_user_idx').on(table.userId),
    statusIdx: index('apps_status_idx').on(table.status),
    visibilityIdx: index('apps_visibility_idx').on(table.visibility),
    sessionTokenIdx: index('apps_session_token_idx').on(table.sessionToken),
    parentAppIdx: index('apps_parent_app_idx').on(table.parentAppId),
    // Performance indexes for common queries
    searchIdx: index('apps_search_idx').on(table.title, table.description),
    frameworkStatusIdx: index('apps_framework_status_idx').on(table.framework, table.status),
    visibilityStatusIdx: index('apps_visibility_status_idx').on(table.visibility, table.status),
    createdAtIdx: index('apps_created_at_idx').on(table.createdAt),
    updatedAtIdx: index('apps_updated_at_idx').on(table.updatedAt),
}));

/**
 * Favorites table - Track user favorite apps
 */
export const favorites = sqliteTable('favorites', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    appId: text('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    userAppIdx: uniqueIndex('favorites_user_app_idx').on(table.userId, table.appId),
    userIdx: index('favorites_user_idx').on(table.userId),
    appIdx: index('favorites_app_idx').on(table.appId),
}));

/**
 * Stars table - Track app stars (like GitHub stars)
 */
export const stars = sqliteTable('stars', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    appId: text('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
    starredAt: integer('starred_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    userAppIdx: uniqueIndex('stars_user_app_idx').on(table.userId, table.appId),
    userIdx: index('stars_user_idx').on(table.userId),
    appIdx: index('stars_app_idx').on(table.appId),
    appStarredAtIdx: index('stars_app_starred_at_idx').on(table.appId, table.starredAt),
}));

// ========================================
// COMMUNITY INTERACTIONS
// ========================================

/**
 * AppLikes table - User likes/reactions on apps
 */
export const appLikes = sqliteTable('app_likes', {
    id: text('id').primaryKey(),
    appId: text('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    
    // Reaction Details
    reactionType: text('reaction_type').notNull().default('like'), // 'like', 'love', 'helpful', etc.
    
    // Metadata
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    appUserIdx: uniqueIndex('app_likes_app_user_idx').on(table.appId, table.userId),
    userIdx: index('app_likes_user_idx').on(table.userId),
}));

/**
 * CommentLikes table - User likes on comments
 */
export const commentLikes = sqliteTable('comment_likes', {
    id: text('id').primaryKey(),
    commentId: text('comment_id').notNull().references(() => appComments.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    
    // Reaction Details
    reactionType: text('reaction_type').notNull().default('like'), // 'like', 'love', 'helpful', etc.
    
    // Metadata
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    commentUserIdx: uniqueIndex('comment_likes_comment_user_idx').on(table.commentId, table.userId),
    userIdx: index('comment_likes_user_idx').on(table.userId),
    commentIdx: index('comment_likes_comment_idx').on(table.commentId),
}));

/**
 * AppComments table - Comments and discussions on apps
 */
export const appComments = sqliteTable('app_comments', {
    id: text('id').primaryKey(),
    appId: text('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    
    // Comment Content
    content: text('content').notNull(),
    parentCommentId: text('parent_comment_id'), // For threaded comments
    
    // Moderation
    isEdited: integer('is_edited', { mode: 'boolean' }).default(false),
    isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
    
    // Removed likeCount and replyCount - use COUNT() queries with proper indexes instead
    
    // Metadata
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    appIdx: index('app_comments_app_idx').on(table.appId),
    userIdx: index('app_comments_user_idx').on(table.userId),
    parentIdx: index('app_comments_parent_idx').on(table.parentCommentId),
}));

// ========================================
// ANALYTICS AND TRACKING
// ========================================

/**
 * AppViews table - Track app views for analytics
 */
export const appViews = sqliteTable('app_views', {
    id: text('id').primaryKey(),
    appId: text('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),
    
    // Viewer Information
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }), // Null for anonymous
    sessionToken: text('session_token'), // For anonymous tracking
    ipAddressHash: text('ip_address_hash'), // Hashed IP for privacy
    
    // View Context
    referrer: text('referrer'),
    userAgent: text('user_agent'),
    deviceType: text('device_type'), // 'desktop', 'mobile', 'tablet'
    
    // Timing
    viewedAt: integer('viewed_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
    durationSeconds: integer('duration_seconds'), // How long they viewed
}, (table) => ({
    appIdx: index('app_views_app_idx').on(table.appId),
    userIdx: index('app_views_user_idx').on(table.userId),
    viewedAtIdx: index('app_views_viewed_at_idx').on(table.viewedAt),
    appViewedAtIdx: index('app_views_app_viewed_at_idx').on(table.appId, table.viewedAt),
}));

// ========================================
// OAUTH AND EXTERNAL INTEGRATIONS
// ========================================

/**
 * OAuthStates table - Manage OAuth flow states securely
 */
export const oauthStates = sqliteTable('oauth_states', {
    id: text('id').primaryKey(),
    state: text('state').notNull().unique(), // OAuth state parameter
    provider: text('provider').notNull(), // 'github', 'google', etc.
    
    // Flow Context
    redirectUri: text('redirect_uri'),
    scopes: text('scopes', { mode: 'json' }).default('[]'),
    userId: text('user_id').references(() => users.id), // If linking to existing account
    
    // Security
    codeVerifier: text('code_verifier'), // For PKCE
    nonce: text('nonce'),
    
    // Metadata
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    isUsed: integer('is_used', { mode: 'boolean' }).default(false),
}, (table) => ({
    stateIdx: uniqueIndex('oauth_states_state_idx').on(table.state),
    expiresAtIdx: index('oauth_states_expires_at_idx').on(table.expiresAt),
}));

// ========================================
// NORMALIZED RELATIONSHIPS
// ========================================

/**
 * Auth Attempts table - Security monitoring and rate limiting
 */
export const authAttempts = sqliteTable('auth_attempts', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    identifier: text('identifier').notNull(),
    attemptType: text('attempt_type', { 
        enum: ['login', 'register', 'oauth_google', 'oauth_github', 'refresh', 'reset_password'] 
    }).notNull(),
    success: integer('success', { mode: 'boolean' }).notNull(),
    ipAddress: text('ip_address').notNull(),
    userAgent: text('user_agent'),
    attemptedAt: integer('attempted_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    lookupIdx: index('auth_attempts_lookup_idx').on(table.identifier, table.attemptedAt),
    ipIdx: index('auth_attempts_ip_idx').on(table.ipAddress, table.attemptedAt),
    successIdx: index('auth_attempts_success_idx').on(table.success, table.attemptedAt),
    attemptTypeIdx: index('auth_attempts_type_idx').on(table.attemptType, table.attemptedAt),
}));

/**
 * Password Reset Tokens table - Secure password reset functionality
 */
export const passwordResetTokens = sqliteTable('password_reset_tokens', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    used: integer('used', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    lookupIdx: index('password_reset_tokens_lookup_idx').on(table.tokenHash),
    expiryIdx: index('password_reset_tokens_expiry_idx').on(table.expiresAt),
}));

/**
 * Email Verification Tokens table - Email verification functionality
 */
export const emailVerificationTokens = sqliteTable('email_verification_tokens', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    email: text('email').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    used: integer('used', { mode: 'boolean' }).default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    lookupIdx: index('email_verification_tokens_lookup_idx').on(table.tokenHash),
    expiryIdx: index('email_verification_tokens_expiry_idx').on(table.expiresAt),
}));

/**
 * Verification OTPs table - Store OTP codes for email verification
 */
export const verificationOtps = sqliteTable('verification_otps', {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    otp: text('otp').notNull(), // Hashed OTP code
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    used: integer('used', { mode: 'boolean' }).default(false),
    usedAt: integer('used_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    emailIdx: index('verification_otps_email_idx').on(table.email),
    expiresAtIdx: index('verification_otps_expires_at_idx').on(table.expiresAt),
    usedIdx: index('verification_otps_used_idx').on(table.used),
}));

/**
 * AuditLogs table - Track important changes for compliance
 */
export const auditLogs = sqliteTable('audit_logs', {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    oldValues: text('old_values', { mode: 'json' }),
    newValues: text('new_values', { mode: 'json' }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    userIdx: index('audit_logs_user_idx').on(table.userId),
    entityIdx: index('audit_logs_entity_idx').on(table.entityType, table.entityId),
    createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
}));

// ========================================
// USER SECRETS AND API KEYS
// ========================================

/**
 * User Secrets table - Stores encrypted API keys and secrets for code generation
 * Used by code generator to access external services (Stripe, OpenAI, etc.)
 */
export const userSecrets = sqliteTable('user_secrets', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    
    // Secret identification
    name: text('name').notNull(), // User-friendly name (e.g., "My Stripe API Key")
    provider: text('provider').notNull(), // Service provider (stripe, openai, etc.)
    secretType: text('secret_type').notNull(), // api_key, account_id, secret_key, token, etc.
    
    // Encrypted secret data
    encryptedValue: text('encrypted_value').notNull(), // AES-256 encrypted secret
    keyPreview: text('key_preview').notNull(), // First/last few chars for identification
    
    // Configuration and metadata
    description: text('description'), // Optional user description
    expiresAt: integer('expires_at', { mode: 'timestamp' }), // Optional expiration
    
    // Usage tracking
    lastUsed: integer('last_used', { mode: 'timestamp' }),
    usageCount: integer('usage_count').default(0),
    
    // Status and security
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    
    // Metadata
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    userIdx: index('user_secrets_user_idx').on(table.userId),
    providerIdx: index('user_secrets_provider_idx').on(table.provider),
    userProviderIdx: index('user_secrets_user_provider_idx').on(table.userId, table.provider, table.secretType),
    activeIdx: index('user_secrets_active_idx').on(table.isActive),
}));

// ========================================
// USER MODEL CONFIGURATIONS
// ========================================

/**
 * User Model Configurations table - User-specific AI model settings that override defaults
 */
export const userModelConfigs = sqliteTable('user_model_configs', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    
    // Configuration Details
    agentActionName: text('agent_action_name').notNull(), // Maps to AgentActionKey from config.ts
    modelName: text('model_name'), // Override for AIModels - null means use default
    maxTokens: integer('max_tokens'), // Override max tokens - null means use default
    temperature: real('temperature'), // Override temperature - null means use default
    reasoningEffort: text('reasoning_effort', { enum: REASONING_EFFORT_VALUES }), // Override reasoning effort  
    providerOverride: text('provider_override', { enum: PROVIDER_OVERRIDE_VALUES }), // Override provider
    fallbackModel: text('fallback_model'), // Override fallback model
    
    // Status and Metadata
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    userAgentIdx: uniqueIndex('user_model_configs_user_agent_idx').on(table.userId, table.agentActionName),
    userIdx: index('user_model_configs_user_idx').on(table.userId),
    isActiveIdx: index('user_model_configs_is_active_idx').on(table.isActive),
}));

/**
 * User Model Providers table - Custom OpenAI-compatible providers
 */
export const userModelProviders = sqliteTable('user_model_providers', {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    
    // Provider Details
    name: text('name').notNull(), // User-friendly name (e.g., "My Local Ollama")
    baseUrl: text('base_url').notNull(), // OpenAI-compatible API base URL
    secretId: text('secret_id').references(() => userSecrets.id), // API key stored in userSecrets
    
    // Status and Metadata
    isActive: integer('is_active', { mode: 'boolean' }).default(true),
    createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
    userNameIdx: uniqueIndex('user_model_providers_user_name_idx').on(table.userId, table.name),
    userIdx: index('user_model_providers_user_idx').on(table.userId),
    isActiveIdx: index('user_model_providers_is_active_idx').on(table.isActive),
}));

// ========================================
// SYSTEM CONFIGURATION
// ========================================

/**
 * SystemSettings table - Global system configuration
 */
export const systemSettings = sqliteTable('system_settings', {
    id: text('id').primaryKey(),
    key: text('key').notNull().unique(),
    value: text('value', { mode: 'json' }),
    description: text('description'),
    
    // Metadata
    updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
    updatedBy: text('updated_by').references(() => users.id),
}, (table) => ({
    keyIdx: uniqueIndex('system_settings_key_idx').on(table.key),
}));

// ========================================
// TYPE EXPORTS FOR APPLICATION USE
// ========================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type App = typeof apps.$inferSelect;
export type NewApp = typeof apps.$inferInsert;

export type AppLike = typeof appLikes.$inferSelect;
export type NewAppLike = typeof appLikes.$inferInsert;

export type CommentLike = typeof commentLikes.$inferSelect;
export type NewCommentLike = typeof commentLikes.$inferInsert;

export type AppComment = typeof appComments.$inferSelect;
export type NewAppComment = typeof appComments.$inferInsert;

export type AppView = typeof appViews.$inferSelect;
export type NewAppView = typeof appViews.$inferInsert;

export type OAuthState = typeof oauthStates.$inferSelect;
export type NewOAuthState = typeof oauthStates.$inferInsert;

export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;

export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;

export type AuthAttempt = typeof authAttempts.$inferSelect;
export type NewAuthAttempt = typeof authAttempts.$inferInsert;

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetToken = typeof passwordResetTokens.$inferInsert;

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type NewEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type UserSecret = typeof userSecrets.$inferSelect;
export type NewUserSecret = typeof userSecrets.$inferInsert;

export type UserModelConfig = typeof userModelConfigs.$inferSelect;
export type NewUserModelConfig = typeof userModelConfigs.$inferInsert;
export type UserModelProvider = typeof userModelProviders.$inferSelect;
export type NewUserModelProvider = typeof userModelProviders.$inferInsert;

export type Star = typeof stars.$inferSelect;
export type NewStar = typeof stars.$inferInsert;
