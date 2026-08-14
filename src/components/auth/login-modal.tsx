/**
 * Enhanced Login Modal
 * Supports both OAuth and email/password authentication with backward compatibility
 */

import { useState } from 'react';
import {
	Banner,
	Button,
	cn,
	Dialog,
	Input,
	InputGroup,
} from '@cloudflare/kumo';
import { useAuth } from '@/contexts/auth-context';
import CloudflareLogo from '@/assets/provider-logos/cloudflare.svg?react';
import {
	EyeIcon,
	EyeSlashIcon,
	WarningCircleIcon,
	XIcon,
} from '@phosphor-icons/react';
import { OrangeButton } from '../shared/OrangeButton';

interface LoginModalProps {
	isOpen: boolean;
	onClose: () => void;

	// Original OAuth-only interface (for backward compatibility)
	onLogin: (provider: 'google' | 'github' | 'cloudflare') => void;

	// New enhanced interfaces (optional)
	onEmailLogin?: (credentials: {
		email: string;
		password: string;
	}) => Promise<void>;
	onOAuthLogin?: (
		provider: 'google' | 'github' | 'cloudflare',
		redirectUrl?: string,
	) => void;
	onRegister?: (data: {
		email: string;
		password: string;
		name?: string;
	}) => Promise<void>;
	error?: string | null;
	onClearError?: () => void;

	// Contextual messaging
	actionContext?: string; // e.g., "to star this app", "to fork this project"
	showCloseButton?: boolean;
}

type AuthMode = 'login' | 'register';

export function LoginModal({
	isOpen,
	onClose,
	onLogin, // Original OAuth interface
	onEmailLogin,
	onOAuthLogin,
	onRegister,
	error,
	onClearError,
	actionContext,
	showCloseButton = true,
}: LoginModalProps) {
	const { authProviders, hasOAuth } = useAuth();
	const [mode, setMode] = useState<AuthMode>('login');
	const [showPassword, setShowPassword] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	// Form state
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [name, setName] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');

	// Validation errors
	const [validationErrors, setValidationErrors] = useState<
		Record<string, string>
	>({});

	// Determine if enhanced features are available. Email/password auth is offered
	// whenever the backend reports the email provider is enabled, independently of
	// whether any OAuth provider is also configured.
	const emailAuthEnabled = authProviders?.email ?? true;
	const hasEmailAuth = emailAuthEnabled && !!onEmailLogin;
	const hasRegistration = emailAuthEnabled && !!onRegister;
	const showGitHub = authProviders?.github && hasOAuth;
	const showGoogle = authProviders?.google && hasOAuth;
	const showCloudflare = authProviders?.cloudflare && hasOAuth;

	const resetForm = () => {
		setEmail('');
		setPassword('');
		setName('');
		setConfirmPassword('');
		setValidationErrors({});
		setShowPassword(false);
		if (onClearError) onClearError();
	};

	const handleClose = () => {
		resetForm();
		onClose();
	};

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			handleClose();
		}
	};

	const switchMode = (newMode: AuthMode) => {
		setMode(newMode);
		resetForm();
		setValidationErrors({});
		if (onClearError) onClearError();
	};

	const validateForm = (): boolean => {
		const errors: Record<string, string> = {};

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!email.trim()) {
			errors.email = 'Email is required';
		} else if (!emailRegex.test(email)) {
			errors.email = 'Invalid email format';
		}

		// Basic password validation
		if (!password) {
			errors.password = 'Password is required';
		} else if (password.length < 8) {
			errors.password = 'Password must be at least 8 characters';
		}

		// Additional validation for registration
		if (mode === 'register') {
			// Name validation
			if (!name.trim()) {
				errors.name = 'Name is required';
			} else if (name.trim().length < 2) {
				errors.name = 'Name must be at least 2 characters';
			}

			const passwordStrengthRegex =
				/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
			if (!passwordStrengthRegex.test(password)) {
				errors.password =
					'Password must include at least one uppercase letter, one lowercase letter, one number, and one special character';
			}

			// Confirm password validation
			if (password !== confirmPassword) {
				errors.confirmPassword = 'Passwords do not match';
			}
		}

		setValidationErrors(errors);
		return Object.keys(errors).length === 0;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!validateForm()) return;

		setIsLoading(true);
		try {
			if (mode === 'login' && onEmailLogin) {
				await onEmailLogin({ email, password });
			} else if (mode === 'register' && onRegister) {
				await onRegister({ email, password, name: name.trim() });
			}
			// Don't auto-close here - let the parent handle success/error
		} catch (err) {
			// Error handling is done in the auth context
		} finally {
			setIsLoading(false);
		}
	};

	const handleOAuthClick = (provider: 'google' | 'github' | 'cloudflare') => {
		// Use the new interface if available, otherwise fall back to original
		if (onOAuthLogin) {
			// Pass the current URL as redirect URL for context preservation
			onOAuthLogin(
				provider,
				window.location.pathname + window.location.search,
			);
		} else {
			onLogin(provider);
		}
	};

	const title = actionContext
		? `Sign in ${actionContext}`
		: hasEmailAuth && mode === 'register'
			? 'Create an account'
			: 'Welcome back';

	const description = actionContext
		? 'Authentication required for this action'
		: hasEmailAuth && mode === 'register'
			? 'Join to start building amazing applications'
			: 'Sign in to save your apps and access your workspace';

	return (
		<Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
			<Dialog size="base" className="p-0 overflow-hidden">
				{/* Header */}
				<div className="relative p-6 pb-0">
					{showCloseButton && (
						<Dialog.Close
							aria-label="Close dialog"
							render={(props) => (
								<Button
									{...props}
									className="absolute right-4 top-4"
									title="Close dialog"
									icon={XIcon}
									variant="ghost"
									shape="square"
								/>
							)}
						/>
					)}

					<div className="text-center space-y-2">
						<div className="mx-auto w-12 h-12 rounded-full bg-kumo-elevated flex items-center justify-center mb-4">
							<svg
								className="w-6 h-6"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
								/>
							</svg>
						</div>
						<Dialog.Title className="text-2xl font-semibold mb-2">
							{title}
						</Dialog.Title>
						<Dialog.Description className="text-kumo-subtle">
							{description}
						</Dialog.Description>
					</div>
				</div>

				{/* Error display */}
				{error && (
					<div className="px-6 mt-4">
						<Banner
							variant="error"
							icon={<WarningCircleIcon />}
							title={error}
						/>
					</div>
				)}

				{/* Authentication Options */}
				<div className={cn('p-6 space-y-4 pt-6')}>
					{/* GitHub */}
					{showGitHub && (
						<Button
							type="button"
							variant="secondary"
							className="w-full justify-center"
							onClick={() => handleOAuthClick('github')}
							icon={
								<svg
									className="h-5 w-5"
									fill="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										fillRule="evenodd"
										clipRule="evenodd"
										d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
									/>
								</svg>
							}
						>
							Continue with GitHub
						</Button>
					)}

					{/* Google */}
					{showGoogle && (
						<Button
							type="button"
							variant="secondary"
							className="w-full justify-center"
							onClick={() => handleOAuthClick('google')}
							icon={
								<svg className="h-5 w-5" viewBox="0 0 24 24">
									<path
										d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
										fill="#4285F4"
									/>
									<path
										d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
										fill="#34A853"
									/>
									<path
										d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
										fill="#FBBC05"
									/>
									<path
										d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
										fill="#EA4335"
									/>
								</svg>
							}
						>
							Continue with Google
						</Button>
					)}

					{/* Cloudflare */}
					{showCloudflare && (
						<Button
							type="button"
							variant="secondary"
							className="w-full justify-center mb-4"
							onClick={() => handleOAuthClick('cloudflare')}
							icon={<CloudflareLogo className="h-5 w-5" />}
						>
							Continue with Cloudflare
						</Button>
					)}

					{/* Divider (only if both OAuth and email are available) */}
					{hasEmailAuth && hasOAuth && (
						<div className="relative">
							<div className="absolute inset-0 flex items-center">
								<div className="w-full border-t" />
							</div>
							<div className="relative flex justify-center text-xs uppercase">
								<span className="bg-kumo-base px-2 text-kumo-subtle">
									Or continue with
								</span>
							</div>
						</div>
					)}

					{/* Email/Password Form */}
					{hasEmailAuth && (
						<form
							onSubmit={handleSubmit}
							className="flex w-full flex-col gap-3"
						>
							{mode === 'register' && (
								<div className="w-full min-w-0 [&_input]:w-full [&_[data-slot=field]]:gap-1.5">
									<Input
										label="Full name"
										type="text"
										placeholder="Full name"
										value={name}
										onChange={(e) =>
											setName(e.target.value)
										}
										error={validationErrors.name}
										disabled={isLoading}
										autoComplete="name"
										className="w-full"
									/>
								</div>
							)}

							<div className="w-full min-w-0 [&_input]:w-full [&_[data-slot=field]]:gap-1.5">
								<Input
									label="Email address"
									type="email"
									placeholder="Email address"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									error={validationErrors.email}
									disabled={isLoading}
									autoComplete="email"
									className="w-full"
								/>
							</div>

							<div className="w-full min-w-0 [&_input]:w-full [&_[data-slot=field]]:gap-1.5">
								<InputGroup
									label="Password"
									error={
										validationErrors.password
											? {
													message:
														validationErrors.password,
													match: true,
												}
											: undefined
									}
									disabled={isLoading}
								>
									<InputGroup.Input
										type={
											showPassword ? 'text' : 'password'
										}
										placeholder="Password"
										value={password}
										onChange={(e) =>
											setPassword(e.target.value)
										}
										autoComplete={
											mode === 'register'
												? 'new-password'
												: 'current-password'
										}
									/>
									<InputGroup.Addon align="end">
										<InputGroup.Button
											type="button"
											variant="ghost"
											tooltip={
												showPassword
													? 'Hide password'
													: 'Show password'
											}
											onClick={() =>
												setShowPassword(!showPassword)
											}
											disabled={isLoading}
											aria-label={
												showPassword
													? 'Hide password'
													: 'Show password'
											}
											icon={
												showPassword
													? EyeSlashIcon
													: EyeIcon
											}
										/>
									</InputGroup.Addon>
								</InputGroup>
							</div>

							{mode === 'register' && (
								<div className="w-full min-w-0 [&_input]:w-full [&_[data-slot=field]]:gap-1.5">
									<Input
										label="Confirm password"
										type="password"
										placeholder="Confirm password"
										value={confirmPassword}
										onChange={(e) =>
											setConfirmPassword(e.target.value)
										}
										error={validationErrors.confirmPassword}
										disabled={isLoading}
										autoComplete="new-password"
										className="w-full"
									/>
								</div>
							)}

							<OrangeButton
								type="submit"
								disabled={isLoading}
								className="w-full justify-center"
							>
								{isLoading
									? mode === 'register'
										? 'Creating account...'
										: 'Signing in...'
									: mode === 'register'
										? 'Create account'
										: 'Sign in'}
							</OrangeButton>
						</form>
					)}
				</div>

				{/* Footer */}
				<div className="px-6 pb-6 space-y-4">
					{/* Mode switching (only if registration is available) */}
					{hasRegistration && hasEmailAuth && (
						<div className="text-center">
							<button
								type="button"
								onClick={() =>
									switchMode(
										mode === 'login' ? 'register' : 'login',
									)
								}
								className="text-sm text-kumo-subtle hover:text-kumo-default transition-colors"
							>
								{mode === 'login'
									? "Don't have an account? Sign up"
									: 'Already have an account? Sign in'}
							</button>
						</div>
					)}

					<p className="text-center text-xs text-kumo-subtle">
						By continuing, you agree to our{' '}
						<a
							href="https://www.cloudflare.com/website-terms/"
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-kumo-default"
						>
							Terms of Service
						</a>{' '}
						and{' '}
						<a
							href="https://www.cloudflare.com/privacypolicy/"
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-kumo-default"
						>
							Privacy Policy
						</a>
					</p>
				</div>
			</Dialog>
		</Dialog.Root>
	);
}
