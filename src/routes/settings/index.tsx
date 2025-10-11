import React, { useState } from 'react';
// import { useNavigate } from 'react-router';
import {
	Eye,
	EyeOff,
	Github,
    Smartphone,
	Trash2,
	Key,
	Lock,
    Settings,
} from 'lucide-react';
import { ModelConfigTabs } from '@/components/model-config-tabs';
import type {
	ModelConfigsData,
	ModelConfigUpdate,
	EncryptedSecret,
	ActiveSessionsData,
	SecretTemplate,
} from '@/api-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/auth-context';
// import { useTheme } from '@/contexts/theme-context';
import { Badge } from '@/components/ui/badge';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { ByokApiKeysModal } from '@/components/byok-api-keys-modal';

// Import provider logos (reusing existing pattern from BYOK modal)
import OpenAILogo from '@/assets/provider-logos/openai.svg?react';
import AnthropicLogo from '@/assets/provider-logos/anthropic.svg?react';
import GoogleLogo from '@/assets/provider-logos/google.svg?react';
import CerebrasLogo from '@/assets/provider-logos/cerebras.svg?react';
import CloudflareLogo from '@/assets/provider-logos/cloudflare.svg?react';

export default function SettingsPage() {
	const { user } = useAuth();
	// Active sessions state
	const [activeSessions, setActiveSessions] = useState<
		ActiveSessionsData & { loading: boolean }
	>({ sessions: [], loading: true });

	// API Keys state - commented out since not used
	// const [apiKeys, setApiKeys] = useState<ApiKeysData & { loading: boolean }>({ keys: [], loading: true });

	// User Secrets state
	const [userSecrets, setUserSecrets] = useState<{
		secrets: EncryptedSecret[];
		loading: boolean;
	}>({ secrets: [], loading: true });

	// Templates state
	const [secretTemplates, setSecretTemplates] = useState<SecretTemplate[]>(
		[],
	);

	const [secretDialog, setSecretDialog] = useState(false);
	const [selectedTemplate, setSelectedTemplate] = useState<string | null>(
		null,
	);
	const [isCustomSecret, setIsCustomSecret] = useState(false);
	const [newSecret, setNewSecret] = useState({
		templateId: '',
		name: '',
		envVarName: '',
		value: '',
		environment: 'production',
		description: '',
	});
	const [showSecretValue, setShowSecretValue] = useState(false);
	const [isSavingSecret, setIsSavingSecret] = useState(false);

	// Model configurations state
	const [agentConfigs, setAgentConfigs] = useState<
		Array<{ key: string; name: string; description: string }>
	>([]);
	const [modelConfigs, setModelConfigs] = useState<
		ModelConfigsData['configs']
	>({} as ModelConfigsData['configs']);
	const [defaultConfigs, setDefaultConfigs] = useState<
		ModelConfigsData['defaults']
	>({} as ModelConfigsData['defaults']);
	const [loadingConfigs, setLoadingConfigs] = useState(true);
	const [savingConfigs, setSavingConfigs] = useState(false);
	const [testingConfig, setTestingConfig] = useState<string | null>(null);

	// BYOK modal state
	const [byokModalOpen, setByokModalOpen] = useState(false);

	// Handle BYOK key added/removed - refresh both secrets and model configs
	const handleByokKeyAdded = () => {
		loadUserSecrets();
		loadModelConfigs(); // Refresh model configs since BYOK provider availability changed
	};

	// const handleSaveProfile = async () => {
	// 	if (isSaving) return;

	// 	try {
	// 		setIsSaving(true);

	// 		const response = await fetch('/api/auth/profile', {
	// 			method: 'PUT',
	// 			credentials: 'include',
	// 			headers: {
	// 				'Content-Type': 'application/json',
	// 			},
	// 			body: JSON.stringify({
	// 				...profileData,
	// 				theme: currentTheme,
	// 			}),
	// 		});

	// 		const data = await response.json();

	// 		if (response.ok && data.success) {
	// 			toast.success('Profile settings saved');
	// 			// Theme context is already updated by handleThemeChange
	// 			// Refresh user data in auth context
	// 			await refreshUser();
	// 		} else {
	// 			toast.error(
	// 				data.error?.message || 'Failed to save profile settings',
	// 			);
	// 		}
	// 	} catch (error) {
	// 		console.error('Profile save error:', error);
	// 		toast.error('Failed to save profile settings');
	// 	} finally {
	// 		setIsSaving(false);
	// 	}
	// };

	// Helper function to format camelCase to human readable
	const formatAgentConfigName = React.useCallback((key: string) => {
		return key
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, (str) => str.toUpperCase())
			.trim();
	}, []);

	// Helper function to provide descriptions based on key patterns
	const getAgentConfigDescription = React.useCallback(
		(key: string) => {
			const descriptions: Record<string, string> = {
				templateSelection:
					'Quick template selection - Needs to be extremely fast with low latency. Intelligence level is less important than speed for rapid project bootstrapping.',
				blueprint:
					'Project architecture & UI design - Requires strong design thinking, UI/UX understanding, and architectural planning skills. Speed is important but coding ability is not critical.',
				projectSetup:
					'Technical scaffolding setup - Must excel at following technical instructions precisely and setting up proper project structure. Reliability and instruction-following are key.',
				phaseGeneration:
					'Development phase planning - Needs rapid planning abilities with large context windows for understanding project scope. Quick thinking is essential, coding skills are not required.',
				firstPhaseImplementation:
					'Initial development phase - Requires large context windows and excellent coding skills for implementing the foundation. Deep thinking is less critical than execution.',
				phaseImplementation:
					'Subsequent development phases - Needs large context windows and superior coding abilities for complex feature implementation. Focus is on execution rather than reasoning.',
				realtimeCodeFixer:
					'Real-time bug detection - Must be extremely fast at identifying and fixing code issues with strong debugging skills. Large context windows are not needed, speed is crucial.',
				fastCodeFixer:
					'Ultra-fast code fixes - Optimized for maximum speed with decent coding ability. No deep thinking or large context required, pure speed and basic bug fixing.',
				conversationalResponse:
					'User chat interactions - Handles natural conversation flow and user communication. Balanced capabilities for engaging dialogue and helpful responses.',
				userSuggestionProcessor:
					'User feedback processing - Analyzes and implements user suggestions and feedback. Requires understanding user intent and translating to actionable changes.',
				codeReview:
					'Code quality analysis - Needs large context windows, strong analytical thinking, and good speed for thorough code review. Must identify issues and suggest improvements.',
				fileRegeneration:
					'File recreation - Focused on pure coding ability to regenerate or rewrite files. No context window or deep thinking required, just excellent code generation.',
				screenshotAnalysis:
					'UI/design analysis - Analyzes visual designs and screenshots to understand UI requirements. Requires visual understanding and design interpretation skills.',
			};
			return (
				descriptions[key] ||
				`AI model configuration for ${formatAgentConfigName(key)}`
			);
		},
		[formatAgentConfigName],
	);

	// Load model configurations
	const loadModelConfigs = async () => {
		try {
			setLoadingConfigs(true);
			const response = await apiClient.getModelConfigs();

			if (response.success && response.data) {
				setModelConfigs(response.data.configs || {});
				setDefaultConfigs(response.data.defaults || {});
			} else {
				throw new Error(
					response.error?.message || 'Failed to load model configurations',
				);
			}
		} catch (error) {
			console.error('Error loading model configurations:', error);
			toast.error('Failed to load model configurations');
		} finally {
			setLoadingConfigs(false);
		}
	};

	// Save model configuration
	const saveModelConfig = async (
		agentAction: string,
		config: ModelConfigUpdate,
	) => {
		try {
			const response = await apiClient.updateModelConfig(
				agentAction,
				config,
			);

			if (response.success) {
				toast.success('Configuration saved successfully');
				await loadModelConfigs(); // Reload to get updated data
			}
		} catch (error) {
			console.error('Error saving model configuration:', error);
			toast.error('Failed to save configuration');
		}
	};

	// Test model configuration
	const testModelConfig = async (
		agentAction: string,
		tempConfig?: ModelConfigUpdate,
	) => {
		try {
			setTestingConfig(agentAction);
			const response = await apiClient.testModelConfig(
				agentAction,
				tempConfig,
			);

			if (response.success && response.data) {
				const result = response.data.testResult;
				if (result.success) {
					toast.success(
						`Test successful! Model: ${result.modelUsed}, Response time: ${result.latencyMs}ms`,
					);
				} else {
					toast.error(`Test failed: ${result.error}`);
				}
			}
		} catch (error) {
			console.error('Error testing configuration:', error);
			toast.error('Failed to test configuration');
		} finally {
			setTestingConfig(null);
		}
	};

	// Reset configuration to default
	const resetConfigToDefault = async (agentAction: string) => {
		try {
			await apiClient.resetModelConfig(agentAction);
			toast.success('Configuration reset to default');
			await loadModelConfigs();
		} catch (error) {
			console.error('Error resetting configuration:', error);
			toast.error('Failed to reset configuration');
		}
	};

	// Reset all configurations
	const resetAllConfigs = async () => {
		try {
			setSavingConfigs(true);
			const response = await apiClient.resetAllModelConfigs();
			toast.success(
				`${response.data?.resetCount} configurations reset to defaults`,
			);
			await loadModelConfigs();
		} catch (error) {
			console.error('Error resetting all configurations:', error);
			toast.error('Failed to reset all configurations');
		} finally {
			setSavingConfigs(false);
		}
	};

	const handleDeleteAccount = async () => {
		toast.error('Account deletion is not yet implemented');
	};

	// Load active sessions
	const loadActiveSessions = async () => {
		try {
			const response = await apiClient.getActiveSessions();
			setActiveSessions({
				sessions: response.data?.sessions || [
					{
						id: 'current',
						userAgent: navigator.userAgent,
						ipAddress: 'Current location',
						lastActivity: new Date(),
						createdAt: new Date(),
						isCurrent: true,
					},
				],
				loading: false,
			});
		} catch (error) {
			console.error('Error loading active sessions:', error);
			setActiveSessions({
				sessions: [
					{
						id: 'current',
						userAgent: navigator.userAgent,
						ipAddress: 'Current location',
						lastActivity: new Date(),
						createdAt: new Date(),
						isCurrent: true,
					},
				],
				loading: false,
			});
		}
	};

	const handleRevokeSession = async (sessionId: string) => {
		try {
			await apiClient.revokeSession(sessionId);
			toast.success('Session revoked successfully');
			loadActiveSessions();
		} catch (error) {
			console.error('Error revoking session:', error);
			toast.error('Failed to revoke session');
		}
	};

	// Load user secrets
	const loadUserSecrets = async () => {
		try {
			const response = await apiClient.getAllSecrets();
			setUserSecrets({
				secrets: response.data?.secrets || [],
				loading: false,
			});
		} catch (error) {
			console.error('Error loading user secrets:', error);
			setUserSecrets({
				secrets: [],
				loading: false,
			});
		}
	};

	// Load secret templates
	const loadSecretTemplates = async () => {
		try {
			const response = await apiClient.getSecretTemplates();
			setSecretTemplates(response.data?.templates || []);
		} catch (error) {
			console.error('Error loading secret templates:', error);
		}
	};

	const handleSaveSecret = async () => {
		if (isSavingSecret) return;

		try {
			setIsSavingSecret(true);

			const payload = isCustomSecret
				? {
						name: newSecret.name,
						envVarName: newSecret.envVarName,
						value: newSecret.value,
						environment: newSecret.environment,
						description: newSecret.description,
					}
				: {
						templateId: selectedTemplate || undefined,
						value: newSecret.value,
						environment: newSecret.environment,
					};

			await apiClient.storeSecret(payload);
			toast.success('Secret saved successfully');
			resetSecretDialog();
			loadUserSecrets();
		} catch (error) {
			console.error('Error saving secret:', error);
			toast.error('Failed to save secret');
		} finally {
			setIsSavingSecret(false);
		}
	};

	const resetSecretDialog = () => {
		setSecretDialog(false);
		setSelectedTemplate(null);
		setIsCustomSecret(false);
		setNewSecret({
			templateId: '',
			name: '',
			envVarName: '',
			value: '',
			environment: 'production',
			description: '',
		});
		setShowSecretValue(false);
	};

	const handleDeleteSecret = async (secretId: string) => {
		try {
			await apiClient.deleteSecret(secretId);
			toast.success('Secret deleted successfully');
			loadUserSecrets();
			// Also refresh model configs since BYOK provider availability may have changed
			loadModelConfigs();
		} catch (error) {
			console.error('Error deleting secret:', error);
			toast.error('Failed to delete secret');
		}
	};

	// Provider logo mapping (following existing BYOK modal pattern)
	const PROVIDER_LOGOS: Record<
		string,
		React.ComponentType<{ className?: string }>
	> = {
		openai: OpenAILogo,
		anthropic: AnthropicLogo,
		'google-ai-studio': GoogleLogo,
		google: GoogleLogo,
		cerebras: CerebrasLogo,
		cloudflare: CloudflareLogo,
	};

	const getProviderLogo = (
		provider: string,
		className: string = 'h-5 w-5',
	) => {
		const LogoComponent = PROVIDER_LOGOS[provider];
		if (LogoComponent) {
			return <LogoComponent className={className} />;
		}

		// Fallback to emoji for unknown providers
		const emojiMap: Record<string, string> = {
			stripe: '💳',
			github: '🐙',
			vercel: '▲',
			supabase: '🗄️',
			custom: '🔑',
		};

		return <span className="text-lg">{emojiMap[provider] || '🔑'}</span>;
	};

	// Load agent configurations dynamically from API
	React.useEffect(() => {
		apiClient
			.getModelDefaults()
			.then((response) => {
				if (response.success && response.data?.defaults) {
					const configs = Object.keys(response.data.defaults).map(
						(key) => ({
							key,
							name: formatAgentConfigName(key),
							description: getAgentConfigDescription(key),
						}),
					);
					setAgentConfigs(configs);
				}
			})
			.catch((error) => {
				console.error('Failed to load agent configurations:', error);
			});
	}, [formatAgentConfigName, getAgentConfigDescription]);

	// Load GitHub integration, sessions, API keys, user secrets, and model configs on component mount
	React.useEffect(() => {
		if (user) {
			loadActiveSessions();
			loadModelConfigs();
            loadSecretTemplates();
		}
	}, [user]);

	return (
		<div className="min-h-screen bg-bg-3 relative">
			<main className="container mx-auto px-4 py-8 max-w-4xl">
				<div className="space-y-8">
					{/* Page Header */}
					<div>
						<h1 className="text-4xl font-bold font-[departureMono] text-red-500">
							SETTINGS
						</h1>
						<p className="text-text-tertiary mt-2">
							Manage your account settings and preferences
						</p>
					</div>

					{/* Integrations Section */}
					{/* <Card id="integrations">
						<CardHeader variant="minimal">
							<div className="flex items-center gap-3 border-b w-full py-3 text-text-primary">
								<Link className="h-4 w-4" />
								<div>
									<CardTitle>Integrations</CardTitle>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-4 px-6 mt-6">
							{githubIntegration.loading ? (
								<div className="flex items-center gap-3">
									<Settings className="h-5 w-5 animate-spin text-text-tertiary" />
									<span className="text-sm text-text-tertiary">
										Loading GitHub integration status...
									</span>
								</div>
							) : githubIntegration.hasIntegration ? (
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div className="h-10 w-10 rounded-full bg-[#24292e] flex items-center justify-center">
											<Github className="h-5 w-5 text-white" />
										</div>
										<div>
											<p className="font-medium">
												GitHub Connected
											</p>
											<p className="text-sm text-text-tertiary">
												@
												{
													githubIntegration.githubUsername
												}
											</p>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Badge
											variant="secondary"
											className="bg-green-100 text-green-800"
										>
											Connected
										</Badge>
										<Button
											variant="outline"
											size="sm"
											onClick={handleDisconnectGithub}
											className="gap-2"
										>
											<Unlink className="h-4 w-4" />
											Disconnect
										</Button>
									</div>
								</div>
							) : (
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div className="h-10 w-10 rounded-full bg-bg-2 border-bg-1 dark:border-bg-4 border flex items-center justify-center">
											<Github className="h-5 w-5 text-text-tertiary" />
										</div>
										<div>
											<p className="font-medium">
												GitHub App for Exports
											</p>
											<div className="flex items-center justify-between">
												<span className="text-text-primary text-xs">
													Connect your GitHub account to export generated code directly to
													repositories
												</span>
												{githubIntegration.loading && (
													<RefreshCw className="w-3 h-3 text-text-primary/60 animate-spin" />
												)}
											</div>
										</div>
									</div>
									<Button
										onClick={handleConnectGithub}
										className="gap-2 bg-text-primary hover:bg-[#1a1e22] text-bg-1"
									>
										<Github className="h-4 w-4" />
										Install GitHub App
									</Button>
								</div>
							)}
						</CardContent>
					</Card> */}

					{/* Model Configuration Section */}
					<Card id="model-configs">
						<CardHeader variant="minimal">
							<div className="flex items-center gap-3 border-b w-full py-3 text-text-primary">
								{' '}
								<Settings className="h-5 w-5" />
								<div>
									<CardTitle>
										AI Model Configurations
									</CardTitle>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-6 px-6">
							{/* Provider API Keys Integration */}
							<div className="space-y-2 mt-6">
								<h4 className="font-medium">
									Provider API Keys
								</h4>
								<p className="text-sm text-text-tertiary">
									AI provider API keys are managed in the "API
									Keys & Secrets" section below. Configure
									your OpenAI, Anthropic, Google AI, and
									OpenRouter keys there.
								</p>

								<Button
									variant="outline"
									size="sm"
									onClick={() => {
										const secretsSection =
											document.getElementById('secrets');
										if (secretsSection) {
											secretsSection.scrollIntoView({
												behavior: 'smooth',
												block: 'start',
											});
										}
									}}
									className="gap-2 shrink-0"
								>
									<Key className="h-4 w-4" />
									Manage Keys
								</Button>
							</div>

							<Separator />

							{/* Model Configuration Tabs */}
							<ModelConfigTabs
								agentConfigs={agentConfigs}
								modelConfigs={modelConfigs}
								defaultConfigs={defaultConfigs}
								loadingConfigs={loadingConfigs}
								onSaveConfig={saveModelConfig}
								onTestConfig={testModelConfig}
								onResetConfig={resetConfigToDefault}
								onResetAllConfigs={resetAllConfigs}
								testingConfig={testingConfig}
								savingConfigs={savingConfigs}
							/>
						</CardContent>
					</Card>

					{/* User Secrets Section */}
					<Card id="secrets">
						<CardHeader variant="minimal">
							<div className="flex items-center gap-3 border-b w-full py-3 text-text-primary">
								<Key className="h-5 w-5" />
								<div>
									<CardTitle>API Keys & Secrets</CardTitle>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-3 mt-4 px-6">
							{/* App Environment Variables Section */}
							{/* <div className="space-y-4">
								<div className="flex justify-between items-center">
									<div>
										<h4 className="font-medium">
											Environment Variables for the
											generated apps
										</h4>
									</div>
									<Dialog
										open={secretDialog}
										onOpenChange={(open) => {
											if (open) {
												setSelectedTemplate(null);
												setIsCustomSecret(false);
												setNewSecret({
													templateId: '',
													name: '',
													envVarName: '',
													value: '',
													environment: 'production',
													description: '',
												});
											}
											setSecretDialog(open);
										}}
									>
										<DialogTrigger asChild>
											<Button size="sm" className="gap-2">
												<Plus className="h-4 w-4" />
												Add Env Vars
											</Button>
										</DialogTrigger>
									</Dialog>
								</div>

								{userSecrets.loading ? (
									<div className="flex items-center gap-3">
										<Settings className="h-5 w-5 animate-spin text-text-tertiary" />
										<span className="text-sm text-text-tertiary">
											Loading secrets...
										</span>
									</div>
								) : userSecrets.secrets.length === 0 ? (
									<div className="text-center py-8 border-2 border-dashed dark:border-bg-4 rounded-lg">
										<Key className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
										<p className="text-sm text-text-tertiary">
											Add API keys and secrets that your
											generated apps can use
										</p>
									</div>
								) : (
									<div className="space-y-3">
										{userSecrets.secrets
											.filter(
												(secret) =>
													!secret.secretType.endsWith(
														'_BYOK',
													),
											)
											.map((secret) => (
												<div
													key={secret.id}
													className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
														secret.isActive
															? 'bg-bg-4'
															: 'bg-bg-3/20 border-dashed opacity-70'
													}`}
												>
													<div className="flex items-center gap-3">
														<div
															className={`flex items-center justify-center w-8 h-8 rounded-md border shadow-sm ${
																secret.isActive
																	? 'bg-white'
																	: 'bg-bg-3 border-dashed opacity-60'
															}`}
														>
															{getProviderLogo(
																secret.provider,
																`h-5 w-5 ${secret.isActive ? '' : 'opacity-60'}`,
															)}
														</div>
														<div>
															<p
																className={`font-medium ${secret.isActive ? '' : 'opacity-60'}`}
															>
																{secret.name}
															</p>
															<div className="flex items-center gap-2 mt-1">
																<Badge
																	variant={
																		secret.isActive
																			? 'default'
																			: 'outline'
																	}
																	className={`text-xs ${secret.isActive ? '' : 'opacity-60'}`}
																>
																	{secret.isActive
																		? 'Active'
																		: 'Inactive'}
																</Badge>
																<Badge
																	variant="outline"
																	className={`text-xs ${secret.isActive ? '' : 'opacity-60'}`}
																>
																	{
																		secret.provider
																	}
																</Badge>
																<Badge
																	variant="secondary"
																	className={`text-xs ${secret.isActive ? '' : 'opacity-60'}`}
																>
																	{secret.secretType.replace(
																		'_',
																		' ',
																	)}
																</Badge>
																<span className="text-xs text-text-tertiary">
																	{
																		secret.keyPreview
																	}
																</span>
															</div>
															{secret.description && (
																<p className="text-xs text-text-tertiary mt-1">
																	{
																		secret.description
																	}
																</p>
															)}
														</div>
													</div>
													<div className="flex items-center gap-2">
														<AlertDialog>
															<AlertDialogTrigger
																asChild
															>
																<Button
																	variant="outline"
																	size="sm"
																	className="text-destructive hover:text-destructive"
																>
																	<Trash2 className="h-4 w-4" />
																</Button>
															</AlertDialogTrigger>
															<AlertDialogContent>
																<AlertDialogHeader>
																	<AlertDialogTitle>
																		Delete
																		Secret
																	</AlertDialogTitle>
																	<AlertDialogDescription>
																		Are you
																		sure you
																		want to
																		delete "
																		{
																			secret.name
																		}
																		"? This
																		action
																		cannot
																		be
																		undone.
																	</AlertDialogDescription>
																</AlertDialogHeader>
																<AlertDialogFooter>
																	<AlertDialogCancel>
																		Cancel
																	</AlertDialogCancel>
																	<AlertDialogAction
																		onClick={() =>
																			handleDeleteSecret(
																				secret.id,
																			)
																		}
																		className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
																	>
																		Delete
																	</AlertDialogAction>
																</AlertDialogFooter>
															</AlertDialogContent>
														</AlertDialog>
													</div>
												</div>
											))}
									</div>
								)}
							</div> */}

							{/* <Separator /> */}

							{/* BYOK API Keys Section */}
							<div className="space-y-4">
								<div className="flex justify-between items-center">
									<h4 className="font-medium">
										BYOK Provider Keys
									</h4>
									<Button
										size="sm"
										variant="outline"
										onClick={() => setByokModalOpen(true)}
                                        disabled // DISABLED: BYOK Disabled for security reasons
										className="gap-2"
									>
										<Key className="h-4 w-4" />
										{/* Manage BYOK Keys */}
                                        Coming Soon
									</Button>
								</div>

								{/* BYOK Status Display */}
								{(() => {
									const byokSecrets =
										userSecrets.secrets.filter((secret) =>
											secret.secretType.endsWith('_BYOK'),
										);

									if (byokSecrets.length === 0) {
										return (
											<div className="text-center py-6 border-2 border-dashed dark:border-bg-4 border-muted rounded-lg">
												<Key className="h-8 w-8 text-text-tertiary mx-auto mb-2" />

												<p className="text-sm text-text-tertiary">
													{/* Add your LLM keys to use
													your own billing */}
                                                    Coming Soon: You would be able to add your own LLM keys to bypass rate limits from here.
												</p>
											</div>
										);
									}

									return (
										<div className="rounded-lg bg-bg-3/50 p-4">
											<div className="flex items-center justify-between mb-3">
												<div className="flex items-center gap-2">
													<div className="w-2 h-2 bg-green-500 rounded-full"></div>
													<span className="text-sm font-medium">
														{byokSecrets.length}{' '}
														provider
														{byokSecrets.length !==
														1
															? 's'
															: ''}{' '}
														configured
													</span>
												</div>
											</div>
											<div className="space-y-3">
												{byokSecrets.map((secret) => {
													const providerName =
														secret.secretType
															.replace(
																'_API_KEY_BYOK',
																'',
															)
															.replace('_', ' ')
															.toLowerCase()
															.replace(
																/\b\w/g,
																(l) =>
																	l.toUpperCase(),
															);

													return (
														<div
															key={secret.id}
															className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
																secret.isActive
																	? 'bg-white/50 dark:bg-gray-800/50'
																	: 'bg-bg-3/20 border-dashed opacity-70'
															}`}
														>
															<div className="flex items-center gap-3">
																<div
																	className={`flex items-center justify-center w-8 h-8 rounded-md border shadow-sm ${
																		secret.isActive
																			? 'bg-white'
																			: 'bg-bg-3 border-dashed opacity-60'
																	}`}
																>
																	{getProviderLogo(
																		secret.provider,
																		`h-5 w-5 ${secret.isActive ? '' : 'opacity-60'}`,
																	)}
																</div>
																<div>
																	<span
																		className={`font-medium text-sm ${secret.isActive ? '' : 'opacity-60'}`}
																	>
																		{
																			providerName
																		}
																	</span>
																	<div
																		className={`text-xs text-text-tertiary ${secret.isActive ? '' : 'opacity-60'}`}
																	>
																		{
																			secret.keyPreview
																		}
																	</div>
																</div>
															</div>
															<div className="flex items-center gap-2">
																<Badge
																	variant={
																		secret.isActive
																			? 'default'
																			: 'outline'
																	}
																	className={`text-xs ${secret.isActive ? '' : 'opacity-60'}`}
																>
																	{secret.isActive
																		? 'Active'
																		: 'Inactive'}
																</Badge>
																<AlertDialog>
																	<AlertDialogTrigger
																		asChild
																	>
																		<Button
																			variant="outline"
																			size="sm"
																			className="text-destructive hover:text-destructive h-8 w-8 p-0"
																		>
																			<Trash2 className="h-4 w-4" />
																		</Button>
																	</AlertDialogTrigger>
																	<AlertDialogContent>
																		<AlertDialogHeader>
																			<AlertDialogTitle>
																				Remove{' '}
																				{
																					providerName
																				}{' '}
																				Key
																			</AlertDialogTitle>
																			<AlertDialogDescription>
																				Are
																				you
																				sure
																				you
																				want
																				to
																				remove
																				your{' '}
																				{
																					providerName
																				}{' '}
																				API
																				key?
																				You'll
																				need
																				to
																				add
																				it
																				again
																				to
																				use
																				BYOK
																				mode
																				with
																				this
																				provider.
																			</AlertDialogDescription>
																		</AlertDialogHeader>
																		<AlertDialogFooter>
																			<AlertDialogCancel>
																				Cancel
																			</AlertDialogCancel>
																			<AlertDialogAction
																				onClick={() =>
																					handleDeleteSecret(
																						secret.id,
																					)
																				}
																				className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
																			>
																				Remove
																				Key
																			</AlertDialogAction>
																		</AlertDialogFooter>
																	</AlertDialogContent>
																</AlertDialog>
															</div>
														</div>
													);
												})}
											</div>
											<p className="text-xs text-text-tertiary mt-3">
												These keys are used
												automatically when you select
												BYOK mode in model
												configurations.
												<Button
													variant="link"
													size="sm"
													className="text-xs p-0 h-auto ml-1"
													onClick={() => {
														const modelConfigsSection =
															document.getElementById(
																'model-configs',
															);
														if (
															modelConfigsSection
														) {
															modelConfigsSection.scrollIntoView(
																{
																	behavior:
																		'smooth',
																	block: 'start',
																},
															);
														}
													}}
												>
													Configure models →
												</Button>
											</p>
										</div>
									);
								})()}
							</div>

							{/* Add Secret Dialog */}
							<Dialog
								open={secretDialog}
								onOpenChange={resetSecretDialog}
							>
								<DialogContent className="max-w-lg">
									<DialogHeader>
										<DialogTitle>
											Add API Key or Secret
										</DialogTitle>
										<DialogDescription>
											Choose a predefined template or add
											a custom environment variable
										</DialogDescription>
									</DialogHeader>

									<div className="space-y-6">
										{/* Step 1: Template Selection */}
										{!selectedTemplate &&
											!isCustomSecret && (
												<div className="space-y-4">
													<div>
														<h4 className="font-medium mb-3">
															Quick Setup
															(Recommended)
														</h4>
														<div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
															{secretTemplates
																.sort(
																	(a, b) =>
																		(b.required
																			? 1
																			: 0) -
																		(a.required
																			? 1
																			: 0),
																)
																.map(
																	(
																		template,
																	) => (
																		<Button
																			key={
																				template.id
																			}
																			variant="outline"
																			className="justify-start h-auto p-3 text-left"
																			onClick={() => {
																				setSelectedTemplate(
																					template.id,
																				);
																				setNewSecret(
																					(
																						prev,
																					) => ({
																						...prev,
																						templateId:
																							template.id,
																						environment:
																							'production',
																					}),
																				);
																			}}
																		>
																			<div className="flex items-start">
																				<span className="text-lg">
																					{
																						template.icon
																					}
																				</span>
																				<div className="flex items-start">
																					<Github className="w-5 h-5 text-yellow-400 dark:text-yellow-200 mr-2" />
																					<ul className="space-y-1">
																						<li>
																							•{' '}
																							<strong>
																								More
																								secure:
																							</strong>{' '}
																							Uses
																							short-lived
																							tokens
																							(1
																							hour
																							expiry)
																						</li>
																						<li>
																							•{' '}
																							<strong>
																								Fine-grained
																								permissions:
																							</strong>{' '}
																							Only
																							accesses
																							repositories
																							you
																							choose
																						</li>
																						<li>
																							•{' '}
																							<strong>
																								One-time
																								setup:
																							</strong>{' '}
																							Install
																							once,
																							export
																							anytime
																						</li>
																						<li>
																							•{' '}
																							<strong>
																								GitHub
																								recommended:
																							</strong>{' '}
																							Apps
																							are
																							the
																							preferred
																							integration
																							method
																						</li>
																					</ul>
																				</div>
																			</div>
																		</Button>
																	),
																)}
														</div>
													</div>

													<div className="relative">
														<div className="absolute inset-0 flex items-center">
															<span className="w-full border-t" />
														</div>
														<div className="relative flex justify-center text-xs uppercase">
															<span className="bg-bg-3 px-2 text-text-tertiary">
																Or
															</span>
														</div>
													</div>

													<Button
														variant="outline"
														className="w-full justify-start h-auto p-3"
														onClick={() =>
															setIsCustomSecret(
																true,
															)
														}
													>
														<div className="flex items-center gap-3">
															<span className="text-lg">
																🔑
															</span>
															<div className="text-left">
																<div className="font-medium">
																	Custom
																	Environment
																	Variable
																</div>
																<p className="text-xs text-text-tertiary">
																	Add any
																	custom API
																	key or
																	secret with
																	your own
																	variable
																	name
																</p>
															</div>
														</div>
													</Button>
												</div>
											)}

										{/* Step 2: Template Form */}
										{selectedTemplate && (
											<div className="space-y-4">
												{(() => {
													const template =
														secretTemplates.find(
															(t) =>
																t.id ===
																selectedTemplate,
														);
													if (!template) return null;

													return (
														<>
															<div className="flex items-center gap-3 p-3 bg-bg-3/50 rounded-lg">
																<span className="text-xl">
																	{
																		template.icon
																	}
																</span>
																<div>
																	<h4 className="font-medium">
																		{
																			template.displayName
																		}
																	</h4>
																	<p className="text-sm text-text-tertiary">
																		{
																			template.description
																		}
																	</p>
																</div>
																<Button
																	variant="ghost"
																	size="sm"
																	onClick={() => {
																		setSelectedTemplate(
																			null,
																		);
																		setNewSecret(
																			(
																				prev,
																			) => ({
																				...prev,
																				templateId:
																					'',
																				value: '',
																			}),
																		);
																	}}
																>
																	Change
																</Button>
															</div>

															<div className="space-y-3">
																<div>
																	<Label>
																		Environment
																		Variable
																		Name
																	</Label>
																	<Input
																		value={
																			template.envVarName
																		}
																		disabled
																		className="bg-bg-3"
																	/>
																	<p className="text-xs text-text-tertiary mt-1">
																		This
																		will be
																		available
																		as{' '}
																		<code className="bg-bg-3 px-1 rounded text-xs">
																			{
																				template.envVarName
																			}
																		</code>{' '}
																		in your
																		generated
																		apps
																	</p>
																</div>

																<div>
																	<Label htmlFor="templateValue">
																		Value
																	</Label>
																	<div className="relative">
																		<Input
																			id="templateValue"
																			type={
																				showSecretValue
																					? 'text'
																					: 'password'
																			}
																			placeholder={
																				template.placeholder
																			}
																			value={
																				newSecret.value
																			}
																			onChange={(
																				e,
																			) =>
																				setNewSecret(
																					(
																						prev,
																					) => ({
																						...prev,
																						value: e
																							.target
																							.value,
																					}),
																				)
																			}
																			className="pr-10"
																		/>
																		<Button
																			type="button"
																			variant="ghost"
																			size="sm"
																			className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
																			onClick={() =>
																				setShowSecretValue(
																					!showSecretValue,
																				)
																			}
																		>
																			{showSecretValue ? (
																				<EyeOff className="h-4 w-4" />
																			) : (
																				<Eye className="h-4 w-4" />
																			)}
																		</Button>
																	</div>
																</div>

																<div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3">
																	<h5 className="font-medium text-blue-900 dark:text-blue-100 text-sm mb-1">
																		How to
																		get
																		this:
																	</h5>
																	<p className="text-xs text-blue-700 dark:text-blue-300">
																		{
																			template.instructions
																		}
																	</p>
																</div>
															</div>
														</>
													);
												})()}
											</div>
										)}

										{/* Step 3: Custom Secret Form */}
										{isCustomSecret && (
											<div className="space-y-4">
												<div className="flex items-center justify-between">
													<h4 className="font-medium">
														Custom Environment
														Variable
													</h4>
													<Button
														variant="ghost"
														size="sm"
														onClick={() => {
															setIsCustomSecret(
																false,
															);
															setNewSecret(
																(prev) => ({
																	...prev,
																	name: '',
																	envVarName:
																		'',
																	value: '',
																}),
															);
														}}
													>
														Back
													</Button>
												</div>

												<div>
													<Label htmlFor="customName">
														Display Name
													</Label>
													<Input
														id="customName"
														placeholder="e.g., My Custom API Key"
														value={newSecret.name}
														onChange={(e) =>
															setNewSecret(
																(prev) => ({
																	...prev,
																	name: e
																		.target
																		.value,
																}),
															)
														}
													/>
												</div>

												<div>
													<Label htmlFor="customEnvVar">
														Environment Variable
														Name
													</Label>
													<Input
														id="customEnvVar"
														placeholder="e.g., MY_API_KEY"
														value={
															newSecret.envVarName
														}
														onChange={(e) =>
															setNewSecret(
																(prev) => ({
																	...prev,
																	envVarName:
																		e.target.value.toUpperCase(),
																}),
															)
														}
													/>
													<p className="text-xs text-text-tertiary mt-1">
														Must be uppercase
														letters, numbers, and
														underscores only
													</p>
												</div>

												<div>
													<Label htmlFor="customValue">
														Value
													</Label>
													<div className="relative">
														<Input
															id="customValue"
															type={
																showSecretValue
																	? 'text'
																	: 'password'
															}
															placeholder="Enter your API key or secret"
															value={
																newSecret.value
															}
															onChange={(e) =>
																setNewSecret(
																	(prev) => ({
																		...prev,
																		value: e
																			.target
																			.value,
																	}),
																)
															}
															className="pr-10"
														/>
														<Button
															type="button"
															variant="ghost"
															size="sm"
															className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
															onClick={() =>
																setShowSecretValue(
																	!showSecretValue,
																)
															}
														>
															{showSecretValue ? (
																<EyeOff className="h-4 w-4" />
															) : (
																<Eye className="h-4 w-4" />
															)}
														</Button>
													</div>
												</div>

												<div>
													<Label htmlFor="customDescription">
														Description (Optional)
													</Label>
													<Textarea
														id="customDescription"
														placeholder="Brief description of this secret"
														value={
															newSecret.description
														}
														onChange={(e) =>
															setNewSecret(
																(prev) => ({
																	...prev,
																	description:
																		e.target
																			.value,
																}),
															)
														}
														rows={2}
													/>
												</div>
											</div>
										)}

										{/* Environment Selection (for both template and custom) */}
										{(selectedTemplate ||
											isCustomSecret) && (
											<div>
												<Label htmlFor="environment">
													Environment
												</Label>
												<Select
													value={
														newSecret.environment
													}
													onValueChange={(value) =>
														setNewSecret(
															(prev) => ({
																...prev,
																environment:
																	value,
															}),
														)
													}
												>
													<SelectTrigger>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="production">
															Production
														</SelectItem>
														<SelectItem value="sandbox">
															Sandbox
														</SelectItem>
														<SelectItem value="test">
															Test
														</SelectItem>
													</SelectContent>
												</Select>
											</div>
										)}
									</div>

									<DialogFooter>
										<Button
											variant="outline"
											onClick={resetSecretDialog}
										>
											Cancel
										</Button>
										{(selectedTemplate ||
											isCustomSecret) && (
											<Button
												onClick={handleSaveSecret}
												disabled={
													!newSecret.value ||
													(isCustomSecret &&
														(!newSecret.name ||
															!newSecret.envVarName)) ||
													isSavingSecret
												}
											>
												{isSavingSecret
													? 'Saving...'
													: 'Save Secret'}
											</Button>
										)}
									</DialogFooter>
								</DialogContent>
							</Dialog>
						</CardContent>
					</Card>

					{/* Security Section */}
					<Card id="security">
						<CardHeader variant="minimal">
							<div className="flex items-center gap-3 border-b w-full py-3 text-text-primary">
								<Lock className="h-5 w-5" />
								<div>
									<CardTitle className="text-lg">
										Security
									</CardTitle>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-3 mt-2 px-6">
							{/* Connected Accounts */}
							<div className="space-y-2">
								<h4 className="font-medium">
									Connected Accounts
								</h4>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3">
										<div className="h-5 w-5 rounded-full bg-bg-3 flex items-center justify-center">
											{user?.provider === 'google'
												? '🇬'
												: '🐙'}
										</div>
										<div>
											<p className="text-sm font-medium capitalize">
												{user?.provider}
											</p>
											<p className="text-sm text-text-tertiary">
												{user?.email}
											</p>
										</div>
									</div>
									<Badge variant="secondary">Connected</Badge>
								</div>
							</div>

							<Separator />

							{/* Active Sessions */}
							<div className="space-y-2">
								<h4 className="font-medium">Active Sessions</h4>
								{activeSessions.loading ? (
									<div className="flex items-center gap-3">
										<Settings className="h-5 w-5 animate-spin text-text-tertiary" />
										<span className="text-sm text-text-tertiary">
											Loading active sessions...
										</span>
									</div>
								) : (
									activeSessions.sessions.map((session) => (
										<div
											key={session.id}
											className="flex items-center justify-between"
										>
											<div className="flex items-center gap-3">
												<Smartphone className="h-5 w-5 text-text-tertiary" />
												<div>
													<p className="font-medium text-sm">
														{session.isCurrent
															? 'Current Session'
															: 'Other Session'}
													</p>
													<p className="text-sm text-text-tertiary">
														{session.ipAddress} •{' '}
														{new Date(
															session.lastActivity,
														).toLocaleDateString()}
													</p>
												</div>
											</div>
											<div className="flex items-center gap-2">
												{session.isCurrent ? (
													<div className="bg-green-400 size-3 rounded-full ring-green-200 ring-2 animate-pulse"></div>
												) : (
													<Button
														variant="outline"
														size="sm"
														onClick={() =>
															handleRevokeSession(
																session.id,
															)
														}
														className="text-destructive hover:text-destructive"
													>
														Revoke
													</Button>
												)}
											</div>
										</div>
									))
								)}
							</div>
						</CardContent>
					</Card>

					<div className="space-y-4 p-3">
						<h4 className="font-medium text-destructive">
							Danger Zone
						</h4>

						<div className="flex items-center justify-between">
							<div>
								<p className="font-medium text-text-primary">Delete Account</p>
								<p className="text-sm text-text-tertiary">
									Permanently delete your account and all data
								</p>
							</div>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="destructive"
										className="gap-2"
									>
										<Trash2 className="h-4 w-4" />
										Delete Account
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											Are you absolutely sure?
										</AlertDialogTitle>
										<AlertDialogDescription>
											This action cannot be undone. This
											will permanently delete your account
											and remove all your data from our
											servers.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>
											Cancel
										</AlertDialogCancel>
										<AlertDialogAction
											onClick={handleDeleteAccount}
											className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
										>
											Delete Account
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					</div>
				</div>
			</main>

			{/* BYOK API Keys Modal */}
			<ByokApiKeysModal
				isOpen={byokModalOpen}
				onClose={() => setByokModalOpen(false)}
				onKeyAdded={handleByokKeyAdded}
			/>
		</div>
	);
}
