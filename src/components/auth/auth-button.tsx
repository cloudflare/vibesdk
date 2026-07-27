/**
 * Enhanced Auth Button
 * Provides OAuth + Email/Password authentication with enhanced UI
 */

import { useState } from 'react';
import { Loader2, LucideGlobeLock } from 'lucide-react';
import { useNavigate } from 'react-router';
import clsx from 'clsx';
import { Button, DropdownMenu } from '@cloudflare/kumo';
import { useAuth } from '../../contexts/auth-context';
import { LoginModal } from './login-modal';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Skeleton } from '../ui/skeleton';
import {
	useUsageLimitsBadgeState,
	type UsageLimitsBadgeState,
} from '../usage-limits-badge';
import {
	GearIcon,
	SignInIcon,
	SignOutIcon,
} from '@phosphor-icons/react';

interface AuthButtonProps {
	className?: string;
	display?: 'icon' | 'sidebar';
}

function getLimitsStatusText(limits: UsageLimitsBadgeState) {
	if (limits.loading) return 'Checking credits...';
	if (limits.needsConfiguration) return 'Configure AI Gateway';
	if (limits.showCredits) return limits.creditsText;
	if (limits.isExhausted && !limits.hasUserToken)
		return 'Free limit exhausted';
	if (limits.showUsage && !limits.isExhausted) return limits.usageText;
	return 'Connect Cloudflare';
}

function getLimitsDetailText(limits: UsageLimitsBadgeState) {
	if (limits.loading) return 'Loading your usage status';
	if (limits.needsConfiguration) return 'Select an account and AI Gateway';
	if (limits.showCredits && limits.showUsage && !limits.isExhausted)
		return limits.usageText;
	if (limits.showCredits) return 'Connected to AI Gateway';
	if (limits.isExhausted && !limits.hasUserToken)
		return 'Connect Cloudflare to continue building';
	if (limits.showUsage && !limits.isExhausted) return 'Free tier usage';
	return 'Use your Cloudflare AI Gateway credits';
}

function getLimitsActionLabel(limits: UsageLimitsBadgeState) {
	if (limits.needsConfiguration) return 'Configure AI Gateway';
	if (limits.showCredits) return 'Manage AI Gateway';
	return 'Connect Cloudflare';
}

export function AuthButton({ className, display = 'icon' }: AuthButtonProps) {
	const {
		user,
		isAuthenticated,
		isLoading,
		error,
		login, // OAuth method
		loginWithEmail,
		register,
		logout,
		clearError,
	} = useAuth();

	const navigate = useNavigate();
	const [showLoginModal, setShowLoginModal] = useState(false);
	const usageLimits = useUsageLimitsBadgeState();
	const showLimitsState = !usageLimits.hidden;
	const limitsStatusText = getLimitsStatusText(usageLimits);
	const limitsDetailText = getLimitsDetailText(usageLimits);
	const limitsActionLabel = getLimitsActionLabel(usageLimits);
	const limitsStatusClassName = clsx(
		'text-kumo-subtle',
		usageLimits.needsConfiguration && 'text-amber-500',
		usageLimits.isExhausted && !usageLimits.hasUserToken && 'text-red-500',
	);

	const connectCloudflare = () => {
		const url = new URL('/oauth/login', window.location.origin);
		url.searchParams.set(
			'return_url',
			window.location.pathname + window.location.search,
		);
		window.location.href = url.toString();
	};

	const handleLimitsAction = () => {
		if (usageLimits.needsConfiguration || usageLimits.showCredits) {
			navigate('/settings');
			return;
		}

		connectCloudflare();
	};

	if (isLoading) {
		return <Skeleton className="w-10 h-10 rounded-full" />;
	}

	if (!isAuthenticated || !user) {
		return (
			<>
				<Button
					variant="ghost"
					onClick={() => setShowLoginModal(true)}
					className={clsx('gap-2 text-sm', className)}
				>
					<SignInIcon className="h-4 w-4" />
					<span>Sign In</span>
				</Button>

				<LoginModal
					isOpen={showLoginModal}
					onClose={() => setShowLoginModal(false)}
					onLogin={(provider: 'google' | 'github' | 'cloudflare') => {
						// For backward compatibility with original login interface
						login(provider);
						setShowLoginModal(false);
					}}
					onEmailLogin={async (credentials) => {
						await loginWithEmail(credentials);
						if (!error) {
							setShowLoginModal(false);
						}
					}}
					onOAuthLogin={(
						provider: 'google' | 'github' | 'cloudflare',
					) => {
						login(provider);
						setShowLoginModal(false);
					}}
					onRegister={async (data) => {
						await register(data);
						if (!error) {
							setShowLoginModal(false);
						}
					}}
					error={error}
					onClearError={clearError}
				/>
			</>
		);
	}

	// Get user initials for avatar fallback
	const getInitials = () => {
		if (user.displayName) {
			return user.displayName
				.split(' ')
				.map((n) => n[0])
				.join('')
				.toUpperCase()
				.slice(0, 2);
		}
		return user.email.charAt(0).toUpperCase();
	};

	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				render={
					display === 'sidebar' ? (
						<Button
							variant="ghost"
							size="base"
							className={clsx(
								'h-auto min-h-10 min-w-0 flex-1 justify-start gap-2 rounded-lg px-2 py-1.5 text-left text-kumo-default',
								className,
							)}
						>
							<Avatar className="h-7 w-7 shrink-0">
								<AvatarImage
									src={user.avatarUrl}
									alt={user.displayName || user.email}
								/>
								<AvatarFallback className="bg-kumo-elevated text-xs font-semibold text-kumo-default">
									{getInitials()}
								</AvatarFallback>
							</Avatar>
							<span className="min-w-0 flex-1 flex-col group-data-[state=collapsed]/sidebar:hidden">
								<span className="block truncate text-sm font-medium text-kumo-default">
									{user.displayName || 'User'}
								</span>
								{showLimitsState && (
									<span
										className={clsx(
											'block truncate text-xs font-normal',
											limitsStatusClassName,
										)}
									>
										{limitsStatusText}
									</span>
								)}
							</span>
						</Button>
					) : (
						<Button
							variant="ghost"
							size="base"
							shape="circle"
							aria-label="Account menu"
							className={clsx(
								'relative rounded-full transition-all hover:ring-2 hover:ring-kumo-brand/20',
								className,
							)}
						>
							<Avatar className="h-8 w-8">
								<AvatarImage
									src={user.avatarUrl}
									alt={user.displayName || user.email}
								/>
								<AvatarFallback className="bg-kumo-elevated font-semibold text-kumo-default">
									{getInitials()}
								</AvatarFallback>
							</Avatar>
						</Button>
					)
				}
			/>

			<DropdownMenu.Content
				align={display === 'sidebar' ? 'start' : 'end'}
				className="w-72"
			>
				{showLimitsState && (
					<div className="border-b border-kumo-line p-3 mb-2">
						<div className="flex items-start gap-2">
							{usageLimits.loading ? (
								<Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-kumo-subtle" />
							) : (
								<LucideGlobeLock
									className={clsx(
										'mt-0.5 size-4 shrink-0',
										limitsStatusClassName,
									)}
								/>
							)}
							<div className="min-w-0">
								<p
									className={clsx(
										'truncate text-sm font-medium text-kumo-default',
										limitsStatusClassName,
									)}
								>
									{limitsStatusText}
								</p>
								<p className="mt-0.5 text-xs text-kumo-subtle">
									{limitsDetailText}
								</p>
							</div>
						</div>
					</div>
				)}

				<DropdownMenu.Group>
					{showLimitsState && !usageLimits.loading && (
						<DropdownMenu.Item
							onClick={handleLimitsAction}
							icon={LucideGlobeLock}
						>
							{limitsActionLabel}
						</DropdownMenu.Item>
					)}
					<DropdownMenu.Item
						onClick={() => navigate('/settings')}
						icon={GearIcon}
					>
						Settings
					</DropdownMenu.Item>
				</DropdownMenu.Group>

				<DropdownMenu.Item
					onClick={() => logout()}
					icon={SignOutIcon}
					variant="danger"
				>
					Sign Out
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}
