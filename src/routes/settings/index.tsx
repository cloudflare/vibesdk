import React, { useState } from 'react';
import {
	Smartphone,
	Trash2,
	Key,
	Lock,
	Settings,
	Copy,
	Check,
	Eye,
	EyeOff,
} from 'lucide-react';
import { ModelConfigTabs } from '@/components/model-config-tabs';
import type {
	ModelConfigsData,
	ModelConfigUpdate,
	ActiveSessionsData,
	ApiKeysData,
} from '@/api-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/auth-context';
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
	DialogTrigger,
} from '@/components/ui/dialog';
import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
// import { SecretsManager } from '@/components/vault';

export default function SettingsPage() {
	const { user } = useAuth();
	// Active sessions state
	const [activeSessions, setActiveSessions] = useState<
		ActiveSessionsData & { loading: boolean }
	>({ sessions: [], loading: true });


	// SDK API keys state
	const [apiKeys, setApiKeys] = useState<ApiKeysData & { loading: boolean }>({
		keys: [],
		loading: true,
	});
	const [createKeyOpen, setCreateKeyOpen] = useState(false);
	const [newKeyName, setNewKeyName] = useState('');
	const [creatingKey, setCreatingKey] = useState(false);
	const [createdKey, setCreatedKey] = useState<{
		key: string;
		keyPreview: string;
		name: string;
	} | null>(null);
	const [showCreatedKey, setShowCreatedKey] = useState(true);
	const [keyToRevoke, setKeyToRevoke] = useState<
		ApiKeysData['keys'][number] | null
	>(null);
	const [revokingKey, setRevokingKey] = useState(false);
	const {
		copied: copiedCreatedKey,
		copy: copyCreatedKey,
		reset: resetCreatedKeyCopy,
	} = useCopyToClipboard();

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

	const loadApiKeys = async () => {
		try {
			setApiKeys((prev) => ({ ...prev, loading: true }));
			const response = await apiClient.getApiKeys();
			setApiKeys({ keys: response.data?.keys ?? [], loading: false });
		} catch (error) {
			console.error('Error loading API keys:', error);
			setApiKeys({ keys: [], loading: false });
			toast.error('Failed to load API keys');
		}
	};

	const handleCreateApiKey = async () => {
		if (!newKeyName.trim() || creatingKey) return;
		try {
			setCreatingKey(true);
			const response = await apiClient.createApiKey({ name: newKeyName.trim() });
			if (response.success && response.data) {
				setCreatedKey({
					key: response.data.key,
					keyPreview: response.data.keyPreview,
					name: response.data.name,
				});
				setShowCreatedKey(true);
				resetCreatedKeyCopy();
				toast.success('API key created');
				await loadApiKeys();
				setNewKeyName('');
			}
		} catch (error) {
			console.error('Error creating API key:', error);
			toast.error('Failed to create API key');
		} finally {
			setCreatingKey(false);
		}
	};

	const handleRevokeApiKey = async () => {
		if (!keyToRevoke || revokingKey) return;
		try {
			setRevokingKey(true);
			await apiClient.revokeApiKey(keyToRevoke.id);
			toast.success('API key revoked');
			setKeyToRevoke(null);
			await loadApiKeys();
		} catch (error) {
			console.error('Error revoking API key:', error);
			toast.error('Failed to revoke API key');
		} finally {
			setRevokingKey(false);
		}
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

	// Load sessions and model configs on component mount
	React.useEffect(() => {
		if (user) {
			loadActiveSessions();
			loadModelConfigs();
			loadApiKeys();
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
											document.getElementById('api-keys');
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
														API Keys
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

					{/* User Secrets Vault Section */}
					{/* <SecretsManager id="secrets" /> */}

					<Card id="api-keys">
						<CardHeader variant="minimal">
							<div className="flex items-center gap-3 border-b w-full py-3 text-text-primary">
								<Key className="h-5 w-5" />
								<div>
									<CardTitle>API Keys</CardTitle>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-4 mt-4 px-6">
							<div className="flex items-start justify-between gap-4">
								<div className="space-y-1">
									<h4 className="font-medium text-sm">VibeSDK API Keys</h4>
									<p className="text-sm text-text-secondary">
										Use these keys to authenticate external SDK clients. The full key is shown only once when created.
									</p>
								</div>

								<Dialog
									open={createKeyOpen}
									onOpenChange={(open) => {
										setCreateKeyOpen(open);
										if (!open) {
											setNewKeyName('');
											setCreatedKey(null);
											setShowCreatedKey(true);
											resetCreatedKeyCopy();
										}
									}}
								>
									<DialogTrigger asChild>
										<Button size="sm" className="gap-2">
											<Key className="h-4 w-4" />
											Create API Key
										</Button>
									</DialogTrigger>
									<DialogContent>
										<DialogHeader>
											<DialogTitle>
												{createdKey ? 'Your new API key' : 'Create API key'}
											</DialogTitle>
											<DialogDescription>
												{createdKey
													? 'Copy this key now. You will not be able to see it again.'
													: 'Give your key a memorable name. You can revoke it anytime.'}
											</DialogDescription>
										</DialogHeader>

										{!createdKey ? (
											<div className="space-y-3">
												<div className="space-y-2">
													<p className="text-sm font-medium">Key name</p>
													<Input
														value={newKeyName}
														onChange={(e) => setNewKeyName(e.target.value)}
														placeholder="e.g. My production SDK"
														autoFocus
													/>
												</div>

												<div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3">
													<p className="text-sm text-amber-800 dark:text-amber-200">
														<strong>Important:</strong> Treat this like a password. Anyone with this key can act as your VibeSDK account.
													</p>
												</div>
											</div>
										) : (
											<div className="space-y-3">
												<div className="space-y-2">
													<p className="text-sm font-medium">API key</p>
													<div className="relative">
														<Input
															type={showCreatedKey ? 'text' : 'password'}
															value={createdKey.key}
															readOnly
															className="font-mono text-sm pr-20"
														/>
														<div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
															<Button
																size="icon"
																variant="ghost"
																className="h-7 w-7"
																onClick={() => setShowCreatedKey(!showCreatedKey)}
															>
																{showCreatedKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
															</Button>
															<Button
																size="icon"
																variant="ghost"
																className="h-7 w-7"
																onClick={() => copyCreatedKey(createdKey.key)}
															>
																{copiedCreatedKey ? (
																	<Check className="h-4 w-4 text-green-500" />
																) : (
																	<Copy className="h-4 w-4" />
																)}
															</Button>
														</div>
													</div>
												</div>

												<div className="rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
													<p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">SDK usage</p>
													<code className="text-xs text-slate-600 dark:text-slate-400 block font-mono">
														VIBESDK_API_KEY={createdKey.keyPreview}
													</code>
												</div>
											</div>
										)}

										<DialogFooter>
											{!createdKey ? (
												<Button
													onClick={handleCreateApiKey}
													disabled={!newKeyName.trim() || creatingKey}
													className="gap-2"
												>
													{creatingKey ? (
														<>
															<Settings className="h-4 w-4 animate-spin" />
															Creating...
														</>
													) : (
														'Create'
													)}
												</Button>
											) : (
												<Button
													variant="outline"
													onClick={() => setCreateKeyOpen(false)}
												>
													Done
												</Button>
											)}
										</DialogFooter>
									</DialogContent>
								</Dialog>
							</div>

							{apiKeys.loading ? (
								<div className="flex items-center gap-3">
									<Settings className="h-5 w-5 animate-spin text-text-tertiary" />
									<span className="text-sm text-text-tertiary">Loading API keys...</span>
								</div>
							) : apiKeys.keys.length === 0 ? (
								<div className="rounded-lg border border-dashed border-bg-4 bg-bg-2/50 p-6">
									<div className="flex items-start gap-3">
										<div className="h-10 w-10 rounded-full bg-bg-3 flex items-center justify-center">
											<Key className="h-5 w-5 text-text-tertiary" />
										</div>
										<div className="space-y-1">
											<p className="font-medium">No API keys yet</p>
											<p className="text-sm text-text-tertiary">
												Create an API key to use the VibeSDK SDK from your own apps.
											</p>
										</div>
									</div>
								</div>
							) : (
								<>
									<Table>
										<TableCaption>Active keys for SDK usage</TableCaption>
										<TableHeader>
											<TableRow>
												<TableHead>Name</TableHead>
												<TableHead>Preview</TableHead>
												<TableHead>Created</TableHead>
												<TableHead>Last used</TableHead>
												<TableHead>Status</TableHead>
												<TableHead className="text-right">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{apiKeys.keys.map((k) => (
												<TableRow key={k.id}>
													<TableCell className="font-medium">{k.name}</TableCell>
													<TableCell className="font-mono text-xs text-text-secondary">{k.keyPreview}</TableCell>
													<TableCell className="text-text-secondary">
														{k.createdAt ? new Date(k.createdAt).toLocaleDateString() : '—'}
													</TableCell>
													<TableCell className="text-text-secondary">
														{k.lastUsed ? new Date(k.lastUsed).toLocaleDateString() : '—'}
													</TableCell>
													<TableCell>
														{k.isActive ? (
															<Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200">
																Active
															</Badge>
														) : (
															<Badge variant="secondary">Revoked</Badge>
														)}
													</TableCell>
													<TableCell className="text-right">
														<Button
															variant="outline"
															size="sm"
															disabled={!k.isActive}
															onClick={() => setKeyToRevoke(k)}
															className="gap-2 text-destructive hover:text-destructive"
														>
															<Trash2 className="h-4 w-4" />
															Revoke
														</Button>
													</TableCell>
												</TableRow>
											))}
										</TableBody>
									</Table>

									<AlertDialog open={!!keyToRevoke} onOpenChange={(open) => !open && setKeyToRevoke(null)}>
										<AlertDialogContent>
											<AlertDialogHeader>
												<AlertDialogTitle>Revoke API key?</AlertDialogTitle>
												<AlertDialogDescription>
													This will immediately disable the key <span className="font-mono">{keyToRevoke?.keyPreview}</span>. Any SDK clients using it will stop working.
												</AlertDialogDescription>
											</AlertDialogHeader>
											<AlertDialogFooter>
												<AlertDialogCancel disabled={revokingKey}>Cancel</AlertDialogCancel>
												<AlertDialogAction
													onClick={handleRevokeApiKey}
													disabled={revokingKey}
													className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
												>
													{revokingKey ? 'Revoking…' : 'Revoke key'}
												</AlertDialogAction>
											</AlertDialogFooter>
										</AlertDialogContent>
									</AlertDialog>
								</>
							)}
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
		</div>
	);
}
