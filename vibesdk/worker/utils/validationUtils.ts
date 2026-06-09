/**
 * Centralized Validation Utilities
 */

import type { PasswordValidationResult } from '../types/auth-types';
import { z } from 'zod';

/**
 * Email validation configuration
 */
export interface EmailValidationConfig {
	allowPlusAddressing?: boolean; // Allow email+tag@domain.com
	allowInternational?: boolean; // Allow international domains
	maxLength?: number; // Maximum email length
	blockedDomains?: string[]; // Blocked email domains
}

/**
 * Default email validation configuration
 */
const DEFAULT_EMAIL_CONFIG: EmailValidationConfig = {
	allowPlusAddressing: true,
	allowInternational: true,
	maxLength: 254, // RFC 5321 limit
	blockedDomains: ['10minutemail.com', 'tempmail.org'], // Add known temp email domains
};

/**
 * Comprehensive email validation
 */
export function validateEmail(
	email: string,
	config: EmailValidationConfig = DEFAULT_EMAIL_CONFIG,
): { valid: boolean; error?: string } {
	if (!email || typeof email !== 'string') {
		return { valid: false, error: 'Email is required' };
	}

	// Length check
	const maxLength = config.maxLength || DEFAULT_EMAIL_CONFIG.maxLength!;
	if (email.length > maxLength) {
		return {
			valid: false,
			error: `Email must be less than ${maxLength} characters`,
		};
	}

	// Basic format validation
	const emailRegex = config.allowInternational
		? /^[^\s@]+@[^\s@]+\.[^\s@]+$/ // Basic international-friendly regex
		: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/; // ASCII only

	if (!emailRegex.test(email)) {
		return { valid: false, error: 'Invalid email format' };
	}

	// Domain validation
	const domain = email.split('@')[1]?.toLowerCase();
	if (config.blockedDomains?.includes(domain)) {
		return { valid: false, error: 'Email domain is not allowed' };
	}

	// Plus addressing check (if disabled)
	if (!config.allowPlusAddressing && email.includes('+')) {
		return { valid: false, error: 'Plus addressing is not allowed' };
	}

	return { valid: true };
}

/**
 * Zod schema for password validation
 */
const passwordSchema = z
	.string()
	.min(8, 'Password must be at least 8 characters')
	.max(128, 'Password must be less than 128 characters')
	.regex(/[a-z]/, 'Password must contain at least one lowercase letter')
	.regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
	.regex(/[0-9]/, 'Password must contain at least one number');

/**
 * Password validation using Zod
 */
export function validatePassword(
	password: string,
	_config?: unknown,
	_userInfo?: { email?: string; username?: string; name?: string },
): PasswordValidationResult {
	if (!password || typeof password !== 'string') {
		return {
			valid: false,
			errors: ['Password is required'],
			score: 0,
			requirements: {
				minLength: false,
				hasLowercase: false,
				hasUppercase: false,
				hasNumbers: false,
				hasSpecialChars: false,
				notCommon: false,
				noSequential: false,
			},
		};
	}

	const result = passwordSchema.safeParse(password);
	
	const requirements = {
		minLength: password.length >= 8,
		hasLowercase: /[a-z]/.test(password),
		hasUppercase: /[A-Z]/.test(password),
		hasNumbers: /[0-9]/.test(password),
		hasSpecialChars: /[^a-zA-Z0-9]/.test(password),
		notCommon: true,
		noSequential: true,
	};

	// Calculate score based on strength
	let score = 0;
	if (requirements.minLength) score++;
	if (requirements.hasLowercase && requirements.hasUppercase) score++;
	if (requirements.hasNumbers) score++;
	if (requirements.hasSpecialChars) score++;
	if (password.length >= 12) score = Math.min(4, score + 1);

	// Generate suggestions
	const suggestions: string[] = [];
	if (password.length < 12) {
		suggestions.push('Use at least 12 characters for better security');
	}
	if (!requirements.hasSpecialChars) {
		suggestions.push('Add special characters for enhanced security');
	}

	if (!result.success) {
		return {
			valid: false,
			errors: result.error.errors.map(e => e.message),
			score,
			requirements,
			suggestions: suggestions.length > 0 ? suggestions : undefined,
		};
	}

	return {
		valid: true,
		score,
		requirements,
		suggestions: suggestions.length > 0 ? suggestions : undefined,
	};
}

/**
 * Validate username format
 */
export function validateUsername(
	username: string,
	config?: {
		minLength?: number;
		maxLength?: number;
		allowSpecialChars?: boolean;
		reservedNames?: string[];
	},
): { valid: boolean; error?: string } {
	const {
		minLength = 3,
		maxLength = 30,
		allowSpecialChars = false,
		reservedNames = ['admin', 'root', 'api', 'www', 'mail', 'support'],
	} = config || {};

	if (!username || typeof username !== 'string') {
		return { valid: false, error: 'Username is required' };
	}

	if (username.length < minLength) {
		return {
			valid: false,
			error: `Username must be at least ${minLength} characters`,
		};
	}

	if (username.length > maxLength) {
		return {
			valid: false,
			error: `Username must be less than ${maxLength} characters`,
		};
	}

	// Format validation
	const validPattern = allowSpecialChars
		? /^[a-zA-Z0-9_.-]+$/
		: /^[a-zA-Z0-9_]+$/;

	if (!validPattern.test(username)) {
		return {
			valid: false,
			error: allowSpecialChars
				? 'Username can only contain letters, numbers, underscores, dots, and hyphens'
				: 'Username can only contain letters, numbers, and underscores',
		};
	}

	// Reserved names check
	if (reservedNames.includes(username.toLowerCase())) {
		return { valid: false, error: 'Username is reserved' };
	}

	// Must start with letter or number
	if (!/^[a-zA-Z0-9]/.test(username)) {
		return {
			valid: false,
			error: 'Username must start with a letter or number',
		};
	}

	return { valid: true };
}

/**
 * Batch validation utility
 */
export interface ValidationField<
	T extends readonly unknown[] = readonly unknown[],
> {
	value: string;
	validator: (
		value: string,
		...args: T
	) => { valid: boolean; error?: string };
	validatorArgs?: T;
	fieldName: string;
}
