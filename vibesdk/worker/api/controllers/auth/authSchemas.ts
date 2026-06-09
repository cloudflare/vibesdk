/**
 * Authentication Validation Schemas
 * Zod schemas for validating auth-related requests
 */

import { z } from 'zod';
import { commonSchemas } from '../../../utils/inputValidator';

/**
 * Login request schema
 */
export const loginSchema = z.object({
  email: commonSchemas.email,
  password: z.string().min(1, 'Password is required')
});

export type LoginRequest = z.infer<typeof loginSchema>;

/**
 * Registration request schema
 */
export const registerSchema = z.object({
  email: commonSchemas.email,
  password: commonSchemas.password,
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional()
});

export type RegisterRequest = z.infer<typeof registerSchema>;

/**
 * OAuth callback schema
 */
export const oauthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State is required'),
  error: z.string().optional(),
  error_description: z.string().optional()
});

export type OAuthCallbackRequest = z.infer<typeof oauthCallbackSchema>;

/**
 * Change password schema
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: commonSchemas.password,
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
});

export type ChangePasswordRequest = z.infer<typeof changePasswordSchema>;

/**
 * Forgot password schema
 */
export const forgotPasswordSchema = z.object({
  email: commonSchemas.email
});

export type ForgotPasswordRequest = z.infer<typeof forgotPasswordSchema>;

/**
 * Reset password schema
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: commonSchemas.password,
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
});

export type ResetPasswordRequest = z.infer<typeof resetPasswordSchema>;

/**
 * Verify email schema
 */
export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required')
});

export type VerifyEmailRequest = z.infer<typeof verifyEmailSchema>;

/**
 * OAuth provider schema
 */
export const oauthProviderSchema = z.enum(['google', 'github']);

export type OAuthProviderParam = z.infer<typeof oauthProviderSchema>;