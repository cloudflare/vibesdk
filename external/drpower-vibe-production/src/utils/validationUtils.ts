/**
 * Client-side Validation Utilities
 * Mirrors server-side validation logic for consistent user experience
 * Provides immediate feedback without server round-trips
 */

/**
 * Email validation result
 */
export interface EmailValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Password validation result
 */
export interface PasswordValidationResult {
  valid: boolean;
  errors?: string[];
  score: number; // 0-4 strength score
  suggestions?: string[];
}

/**
 * Validate email format (client-side)
 * Matches server-side validation logic
 */
export function validateEmail(email: string): EmailValidationResult {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }

  // Length check (RFC 5321 limit)
  if (email.length > 254) {
    return { valid: false, error: 'Email must be less than 254 characters' };
  }

  // Basic format validation (international-friendly)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Basic domain validation
  const domain = email.split('@')[1]?.toLowerCase();
  const blockedDomains = ['10minutemail.com', 'tempmail.org'];
  if (blockedDomains.includes(domain)) {
    return { valid: false, error: 'Email domain is not allowed' };
  }

  return { valid: true };
}

/**
 * Validate password strength (client-side)
 * Provides immediate feedback to users
 */
export function validatePassword(
  password: string,
): PasswordValidationResult {
  const errors: string[] = [];
  let score = 0;

  if (!password || typeof password !== 'string') {
    return {
      valid: false,
      errors: ['Password is required'],
      score: 0
    };
  }

  // Length validation
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  } else if (password.length >= 12) {
    score += 2;
  } else {
    score += 1;
  }

  if (password.length > 128) {
    errors.push('Password must be less than 128 characters long');
  }

  // Generate suggestions
  const suggestions: string[] = [];
  if (password.length < 12) {
    suggestions.push('Use at least 12 characters for better security');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    score: Math.min(4, Math.max(0, score)),
    suggestions: suggestions.length > 0 ? suggestions : undefined
  };
}

/**
 * Validate display name
 */
export function validateDisplayName(displayName: string): { valid: boolean; error?: string } {
  if (!displayName || typeof displayName !== 'string') {
    return { valid: false, error: 'Display name is required' };
  }

  const trimmed = displayName.trim();
  
  if (trimmed.length < 2) {
    return { valid: false, error: 'Display name must be at least 2 characters' };
  }

  if (trimmed.length > 50) {
    return { valid: false, error: 'Display name must be less than 50 characters' };
  }

  return { valid: true };
}

/**
 * Get password strength label
 */
export function getPasswordStrengthLabel(score: number): {
  label: string;
  color: string;
  percentage: number;
} {
  const percentage = (score / 4) * 100;
  
  if (score === 0) {
    return { label: 'Very Weak', color: 'red', percentage };
  } else if (score === 1) {
    return { label: 'Weak', color: 'orange', percentage };
  } else if (score === 2) {
    return { label: 'Fair', color: 'yellow', percentage };
  } else if (score === 3) {
    return { label: 'Good', color: 'blue', percentage };
  } else {
    return { label: 'Strong', color: 'green', percentage };
  }
}

/**
 * Batch form validation
 */
export interface FormField {
  name: string;
  value: string;
  validator: (value: string) => { valid: boolean; error?: string };
  required?: boolean;
}

/**
 * Validate form fields
 */
export function validateForm(fields: FormField[]): {
  valid: boolean;
  errors: Record<string, string>;
  firstError?: string;
} {
  const errors: Record<string, string> = {};
  
  for (const field of fields) {
    if (field.required !== false && (!field.value || field.value.trim() === '')) {
      errors[field.name] = `${field.name} is required`;
      continue;
    }
    
    if (field.value && field.value.trim() !== '') {
      const result = field.validator(field.value);
      if (!result.valid && result.error) {
        errors[field.name] = result.error;
      }
    }
  }
  
  const errorKeys = Object.keys(errors);
  
  return {
    valid: errorKeys.length === 0,
    errors,
    firstError: errorKeys.length > 0 ? errors[errorKeys[0]] : undefined
  };
}

/**
 * Debounced validation hook for React
 */
export function createDebouncedValidator<T>(
  validator: (value: T) => { valid: boolean; error?: string },
  delay: number = 500
) {
  let timeoutId: NodeJS.Timeout;
  
  return (value: T, callback: (result: { valid: boolean; error?: string }) => void) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      const result = validator(value);
      callback(result);
    }, delay);
  };
}