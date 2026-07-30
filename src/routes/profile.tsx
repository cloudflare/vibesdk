import React from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
	Badge,
	Button,
	cn,
	Empty,
	Input,
	InputArea,
	LayerCard,
	Loader,
	Tabs,
	Text,
} from '@cloudflare/kumo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
	CalendarBlank,
	Code,
	EnvelopeSimple,
	Eye,
	Gear,
	Globe,
	GithubLogo,
	Lightning,
	PencilSimple,
	Pulse,
	ShieldCheck,
	Star,
	Trophy,
	X,
} from '@phosphor-icons/react';
import { useNavigate } from 'react-router';
import { capitalizeFirstLetter, getInitials } from '@/lib/utils';
import { formatNumber } from '@/utils/analytics';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useUserStats, useUserActivity } from '@/hooks/use-stats';
import { useUpdateProfile } from '@/hooks/use-profile';
import { useApps } from '@/hooks/use-apps';

const STATS = [
	{
		key: 'appCount' as const,
		label: 'Total apps',
		icon: Code,
		iconClass: 'text-kumo-brand',
	},
	{
		key: 'publicAppCount' as const,
		label: 'Public apps',
		icon: Globe,
		iconClass: 'text-teal-500',
	},
	{
		key: 'totalViewsReceived' as const,
		label: 'Total views',
		icon: Eye,
		iconClass: 'text-purple-500',
	},
	{
		key: 'totalLikesReceived' as const,
		label: 'Total likes',
		icon: Star,
		iconClass: 'text-amber-500',
	},
] as const;

export default function Profile() {
	const { user } = useAuth();
	const navigate = useNavigate();
	const [isEditing, setIsEditing] = React.useState(false);
	const [profileData, setProfileData] = React.useState({
		displayName: user?.displayName || '',
		username: user?.username || '',
		bio: user?.bio || '',
		timezone: user?.timezone || 'UTC',
	});
	const [activeTab, setActiveTab] = React.useState('about');

	// Sync the form from the cached user, but never while editing: a background
	// session refetch would otherwise overwrite unsaved input mid-edit.
	React.useEffect(() => {
		if (user && !isEditing) {
			setProfileData({
				displayName: user.displayName || '',
				username: user.username || '',
				bio: user.bio || '',
				timezone: user.timezone || 'UTC',
			});
		}
	}, [user, isEditing]);

	const { stats, loading: statsLoading } = useUserStats();
	const { activities, loading: activityLoading } = useUserActivity();
	const { apps: recentApps, loading: appsLoading } = useApps();
	const { mutateAsync: saveProfile, isPending: isSaving } =
		useUpdateProfile();

	const achievements = stats?.achievements || [];

	const handleEdit = () => {
		setActiveTab('about');
		setIsEditing(true);
	};

	const handleSave = async () => {
		if (isSaving) return;

		try {
			// The mutation invalidates the auth session, so `user` (and the
			// header/sidebar) pick up the new values.
			await saveProfile({
				displayName: profileData.displayName,
				username: profileData.username,
				bio: profileData.bio,
				timezone: profileData.timezone,
			});
			toast.success('Profile updated successfully');
			setIsEditing(false);
		} catch (error) {
			console.error('Profile update error:', error);
			toast.error('Failed to update profile');
		}
	};

	const handleCancel = () => {
		setProfileData({
			displayName: user?.displayName || '',
			username: user?.username || '',
			bio: user?.bio || '',
			timezone: user?.timezone || 'UTC',
		});
		setIsEditing(false);
	};

	const handleTabChange = (value: string) => {
		setActiveTab(value);
		if (value !== 'about' && isEditing) {
			handleCancel();
		}
	};

	const initials = getInitials(user?.displayName, user?.email);

	return (
		<div className="min-h-screen">
			<title>
				{user?.displayName
					? `${user.displayName} - Profile - Build`
					: 'Profile - Build'}
			</title>
			<main className="container mx-auto max-w-4xl px-4 py-12 pb-24">
				{/* Header */}
				<div className="mb-10 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
					<Avatar className="size-20 ring-2 ring-kumo-line shadow-md sm:size-24">
						<AvatarImage src={user?.avatarUrl} />
						<AvatarFallback className="bg-kumo-base text-3xl font-semibold">
							{initials}
						</AvatarFallback>
					</Avatar>

					<div className="min-w-0 flex-1 text-center sm:text-left">
						<div className="mb-1.5 flex flex-col items-center gap-2 sm:flex-row sm:flex-wrap">
							<h1 className="font-funky-mono text-2xl font-semibold text-kumo-strong">
								{user?.displayName || 'Your profile'}
							</h1>
							<div className="flex flex-wrap items-center justify-center gap-1.5">
								<Badge variant="secondary" className="gap-1">
									{user?.provider === 'github' ? (
										<GithubLogo
											className="size-3"
											weight="fill"
										/>
									) : (
										<Globe className="size-3" />
									)}
									{capitalizeFirstLetter(
										user?.provider ?? '',
									)}
								</Badge>
								{user?.emailVerified && (
									<Badge variant="success" className="gap-1">
										<ShieldCheck
											className="size-3"
											weight="fill"
										/>
										Verified
									</Badge>
								)}
							</div>
						</div>
						<Text variant="secondary" size="sm">
							{user?.email}
						</Text>
						{user?.bio && !isEditing && (
							<p className="mt-2 max-w-xl text-sm text-kumo-default">
								{user.bio}
							</p>
						)}
					</div>

					<div className="flex shrink-0 gap-2">
						{isEditing ? (
							<>
								<Button
									variant="primary"
									size="sm"
									onClick={handleSave}
									loading={isSaving}
								>
									Save changes
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={handleCancel}
									icon={<X className="size-4" />}
								>
									Cancel
								</Button>
							</>
						) : (
							<>
								<Button
									variant="secondary"
									size="sm"
									onClick={handleEdit}
									icon={<PencilSimple className="size-4" />}
								>
									Edit profile
								</Button>
								<Button
									variant="outline"
									size="sm"
									onClick={() => navigate('/settings')}
									icon={<Gear className="size-4" />}
								>
									Settings
								</Button>
							</>
						)}
					</div>
				</div>

				{/* Stats */}
				<div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
					{STATS.map(({ key, label, icon: Icon, iconClass }) => (
						<div
							key={key}
							className="relative overflow-hidden rounded-xl px-4 py-4 bg-kumo-base ring ring-kumo-line/70"
						>
							<Icon
								className={cn(
									'pointer-events-none absolute -top-2 -right-5 size-24 rotate-12 opacity-10',
									iconClass,
								)}
								weight="duotone"
							/>
							<div className="relative grid gap-1">
								<p className="text-3xl font-semibold tabular-nums text-kumo-strong">
									{statsLoading
										? '–'
										: formatNumber(stats?.[key] ?? 0)}
								</p>
								<p className="text-sm text-kumo-subtle">
									{label}
								</p>
							</div>
						</div>
					))}
				</div>

				{/* Tabs + content */}
				<div className="flex flex-col gap-6">
					<Tabs
						value={activeTab}
						onValueChange={handleTabChange}
						className="w-fit"
						tabs={[
							{ value: 'about', label: 'About' },
							{ value: 'apps', label: 'Apps' },
							{ value: 'achievements', label: 'Achievements' },
							{ value: 'activity', label: 'Activity' },
						]}
					/>

					{activeTab === 'about' && (
						<LayerCard>
							<LayerCard.Secondary className="font-funky-mono tracking-tighter">
								Profile information
							</LayerCard.Secondary>
							<LayerCard.Primary>
								<div className="grid gap-6">
									<div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
										{isEditing ? (
											<Input
												id="displayName"
												label="Display name"
												value={profileData.displayName}
												onChange={(e) =>
													setProfileData({
														...profileData,
														displayName:
															e.target.value,
													})
												}
											/>
										) : (
											<div className="grid gap-1">
												<p className="text-sm text-kumo-subtle">
													Display name
												</p>
												<p className="text-sm text-kumo-default">
													{user?.displayName || '—'}
												</p>
											</div>
										)}

										{isEditing ? (
											<Input
												id="username"
												label="Username"
												value={profileData.username}
												onChange={(e) =>
													setProfileData({
														...profileData,
														username:
															e.target.value,
													})
												}
												placeholder="@username"
											/>
										) : (
											<div className="grid gap-1">
												<p className="text-sm text-kumo-subtle">
													Username
												</p>
												<p className="text-sm text-kumo-default">
													{user?.username ||
														'Not set'}
												</p>
											</div>
										)}

										<div className="grid gap-1">
											<p className="text-sm text-kumo-subtle">
												Email
											</p>
											<p className="flex items-center gap-2 text-sm text-kumo-default">
												<span className="h-lh flex items-center text-kumo-subtle">
													<EnvelopeSimple className="size-4" />
												</span>
												{user?.email}
											</p>
										</div>

										<div className="grid gap-1">
											<p className="text-sm text-kumo-subtle">
												Member since
											</p>
											<p className="flex items-center gap-2 text-sm text-kumo-default">
												<span className="h-lh flex items-center text-kumo-subtle">
													<CalendarBlank className="size-4" />
												</span>
												{user?.createdAt
													? format(
															new Date(
																user.createdAt,
															),
															'MMMM d, yyyy',
														)
													: 'Unknown'}
											</p>
										</div>
									</div>

									{isEditing ? (
										<InputArea
											id="bio"
											label="Bio"
											value={profileData.bio}
											onChange={(e) =>
												setProfileData({
													...profileData,
													bio: e.target.value,
												})
											}
											placeholder="Tell us about yourself..."
											rows={4}
										/>
									) : (
										<div className="grid gap-1">
											<p className="text-sm text-kumo-subtle">
												Bio
											</p>
											<p className="text-sm text-kumo-default">
												{user?.bio ||
													'No bio yet — hit edit to add one!'}
											</p>
										</div>
									)}
								</div>
							</LayerCard.Primary>
						</LayerCard>
					)}

					{activeTab === 'apps' && (
						<LayerCard>
							<LayerCard.Secondary className="font-funky-mono tracking-tighter">
								Recent apps
							</LayerCard.Secondary>
							<LayerCard.Primary>
								{appsLoading ? (
									<div className="flex justify-center py-10">
										<Loader />
									</div>
								) : recentApps && recentApps.length > 0 ? (
									<div className="grid gap-2">
										{recentApps.slice(0, 5).map((app) => (
											<button
												key={app.id}
												type="button"
												className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left ring ring-kumo-hairline hover:bg-kumo-tint"
												onClick={() =>
													navigate(`/app/${app.id}`)
												}
											>
												<div className="flex min-w-0 items-center gap-3">
													<span className="flex size-10 shrink-0 items-center justify-center rounded-lg text-kumo-subtle">
														<Code className="size-5" />
													</span>
													<div className="min-w-0">
														<p className="truncate text-sm font-medium text-kumo-default">
															{app.title}
														</p>
														<div className="mt-1 flex flex-wrap items-center gap-2">
															{app.framework && (
																<Badge
																	variant="neutral"
																	className="text-xs"
																>
																	{
																		app.framework
																	}
																</Badge>
															)}
															<span className="text-xs text-kumo-subtle">
																{app.createdAt
																	? format(
																			new Date(
																				app.createdAt,
																			),
																			'MMM d, yyyy',
																		)
																	: 'Recently'}
															</span>
														</div>
													</div>
												</div>
												<Badge
													variant={
														app.visibility ===
														'public'
															? 'success'
															: 'secondary'
													}
												>
													{app.visibility}
												</Badge>
											</button>
										))}
									</div>
								) : (
									<Empty
										size="sm"
										icon={
											<Code
												size={40}
												className="text-kumo-inactive"
												weight="duotone"
											/>
										}
										title="No apps yet"
										description="Build something fun — your first app is one prompt away."
										contents={
											<Button
												variant="primary"
												size="sm"
												onClick={() =>
													navigate('/chat')
												}
											>
												Create your first app
											</Button>
										}
									/>
								)}
							</LayerCard.Primary>
						</LayerCard>
					)}

					{activeTab === 'achievements' && (
						<LayerCard>
							<LayerCard.Secondary className="font-funky-mono tracking-tighter">
								Achievements
							</LayerCard.Secondary>
							<LayerCard.Primary>
								{statsLoading ? (
									<div className="flex justify-center py-10">
										<Loader />
									</div>
								) : achievements && achievements.length > 0 ? (
									<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
										{achievements.map(
											(achievement, index) => (
												<div
													key={index}
													className="flex items-start gap-3 rounded-lg px-3 py-3 ring ring-kumo-hairline"
												>
													<span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
														<Trophy
															className="size-5"
															weight="duotone"
														/>
													</span>
													<div className="min-w-0 grid gap-0.5">
														<p className="text-sm font-medium text-kumo-default">
															{achievement}
														</p>
														<p className="text-sm text-kumo-subtle">
															Unlocked — nice
															work!
														</p>
													</div>
												</div>
											),
										)}
									</div>
								) : (
									<Empty
										size="sm"
										icon={
											<Trophy
												size={40}
												className="text-kumo-inactive"
												weight="duotone"
											/>
										}
										title="No achievements yet"
										description="Create apps and share them to unlock badges."
									/>
								)}
							</LayerCard.Primary>
						</LayerCard>
					)}

					{activeTab === 'activity' && (
						<LayerCard>
							<LayerCard.Secondary className="font-funky-mono tracking-tighter">
								Activity
							</LayerCard.Secondary>
							<LayerCard.Primary>
								{activityLoading ? (
									<div className="flex justify-center py-10">
										<Loader />
									</div>
								) : activities && activities.length > 0 ? (
									<div className="grid gap-0">
										{activities.map((activity, index) => (
											<div
												key={index}
												className="flex items-start gap-3 border-b border-kumo-line/50 py-3 last:border-0 last:pb-0 first:pt-0"
											>
												<span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-kumo-subtle">
													{activity.type ===
														'created' && (
														<Lightning className="size-4" />
													)}
													{activity.type ===
														'updated' && (
														<PencilSimple className="size-4" />
													)}
													{activity.type ===
														'favorited' && (
														<Star className="size-4" />
													)}
												</span>
												<div className="min-w-0 flex-1 grid gap-0.5">
													<p className="text-sm text-kumo-default">
														<span className="font-medium">
															{activity.type ===
																'created' &&
																'Created'}
															{activity.type ===
																'updated' &&
																'Updated'}
															{activity.type ===
																'favorited' &&
																'Favorited'}
														</span>{' '}
														<span className="text-kumo-subtle">
															{activity.title}
														</span>
													</p>
													<p className="text-xs text-kumo-subtle">
														{activity.timestamp
															? format(
																	new Date(
																		activity.timestamp,
																	),
																	'MMM d, yyyy h:mm a',
																)
															: 'Recently'}
													</p>
												</div>
											</div>
										))}
									</div>
								) : (
									<Empty
										size="sm"
										icon={
											<Pulse
												size={40}
												className="text-kumo-inactive"
												weight="duotone"
											/>
										}
										title="No recent activity"
										description="Your creations and updates will show up here."
									/>
								)}
							</LayerCard.Primary>
						</LayerCard>
					)}
				</div>
			</main>
		</div>
	);
}
