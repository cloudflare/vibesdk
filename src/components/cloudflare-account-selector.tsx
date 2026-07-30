/**
 * Cloudflare Account & Gateway Selector
 * Allows users to select their active Cloudflare account and AI Gateway
 */

import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button, DropdownMenu, LayerCard } from '@cloudflare/kumo';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { CloudflareLogo } from '@cloudflare/kumo';
import { Loader2, CheckCircle2, AlertCircle, MoreVertical, ExternalLink, LogOut, RefreshCw } from 'lucide-react';
import { useLimitsContext } from '@/contexts/limits-context';
import { CloudflareLogoThemed } from './shared/CloudflareLogoThemed';

interface CloudflareAccount {
	id: string;
	userId: string;
	accountId: string;
	accountName: string;
	accountEmail?: string;
	isActive: boolean;
	isDefault: boolean;
	createdAt: string;
	gateways: Gateway[];
}

interface Gateway {
	id: string;
	userId: string;
	cloudflareAccountId: string;
	gatewayId: string;
	gatewayName: string;
	gatewaySlug: string;
	creditsRemaining: number | null;
	creditsLastUpdated: string | null;
	isDefault: boolean;
	autoCreated: boolean;
	isActive: boolean;
	createdAt: string;
}

export function CloudflareAccountSelector() {
	const [accounts, setAccounts] = useState<CloudflareAccount[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [selectedAccountId, setSelectedAccountId] = useState<string>('');
	const [selectedGatewayId, setSelectedGatewayId] = useState<string>('');
	const [availableGateways, setAvailableGateways] = useState<Gateway[]>([]);

	// Whether an OAuth cookie is live on the server. Backend refreshes it
	// transparently, so the client only needs to know if it still exists.
	const { data: limitsData, refetch: refreshLimits } = useLimitsContext();
	const isConnected = !!limitsData?.hasUserToken;

	// AI Gateway usage toggle. Reflects the resolved server preference; updates optimistically.
	const [aiGatewayEnabled, setAiGatewayEnabled] = useState<boolean>(false);
	const [togglingGateway, setTogglingGateway] = useState(false);
	useEffect(() => {
		if (typeof limitsData?.aiGatewayEnabled === 'boolean') {
			setAiGatewayEnabled(limitsData.aiGatewayEnabled);
		}
	}, [limitsData?.aiGatewayEnabled]);

	const handleToggleAiGateway = async (next: boolean) => {
		const previous = aiGatewayEnabled;
		setAiGatewayEnabled(next);
		setTogglingGateway(true);
		try {
			const response = await apiClient.setAiGatewayPreference(next);
			if (response.success && response.data) {
				setAiGatewayEnabled(response.data.enabled);
			} else {
				setAiGatewayEnabled(previous);
			}
			await refreshLimits?.();
		} catch (error) {
			console.error('Error updating AI Gateway preference:', error);
			setAiGatewayEnabled(previous);
		} finally {
			setTogglingGateway(false);
		}
	};

	// Fetch accounts and gateways
	useEffect(() => {
		fetchAccounts();
	}, []);

	const fetchAccounts = async ({ refresh = false }: { refresh?: boolean } = {}) => {
		try {
			if (refresh) {
				setRefreshing(true);
			} else {
				setLoading(true);
			}
			const response = await fetch(
				`/api/cloudflare/accounts${refresh ? '?refresh=true' : ''}`,
				{
					credentials: 'include',
				},
			);

			if (!response.ok) {
				throw new Error('Failed to fetch accounts');
			}

			const result = await response.json();
			const accountsData = result.data || [];
			setAccounts(accountsData);

			// Find the currently selected gateway (where isActive=true)
			let foundActive = false;
			for (const account of accountsData) {
				const activeGateway = account.gateways.find((g: Gateway) => g.isActive);
				if (activeGateway) {
					setSelectedAccountId(account.id);
					setAvailableGateways(account.gateways);
					setSelectedGatewayId(activeGateway.id);
					foundActive = true;
					break;
				}
			}

			// If no active gateway found, auto-select if only 1 account
			if (!foundActive) {
				if (accountsData.length === 1) {
					const singleAccount = accountsData[0];
					setSelectedAccountId(singleAccount.id);
					setAvailableGateways(singleAccount.gateways);
					if (singleAccount.gateways.length === 1) {
						setSelectedGatewayId(singleAccount.gateways[0].id);
					}
				} else {
					setSelectedAccountId('');
					setSelectedGatewayId('');
					setAvailableGateways([]);
				}
			}
		} catch (error) {
			console.error('Error fetching accounts:', error);
			toast.error('Failed to load Cloudflare accounts');
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	};

	const handleRefresh = async () => {
		await fetchAccounts({ refresh: true });
		toast.success('Refreshed Cloudflare accounts and gateways');
	};

	// Update available gateways when account changes
	const handleAccountChange = (accountId: string) => {
		setSelectedAccountId(accountId);
		const account = accounts.find(a => a.id === accountId);
		if (account) {
			setAvailableGateways(account.gateways);
			// Auto-select first gateway
			if (account.gateways.length > 0) {
				setSelectedGatewayId(account.gateways[0].id);
			} else {
				setSelectedGatewayId('');
			}
		}
	};

	// Save selection
	const handleSave = async () => {
		if (!selectedAccountId || !selectedGatewayId) {
			toast.error('Please select both an account and a gateway');
			return;
		}

		try {
			setSaving(true);
			const response = await apiClient.setCloudflareSelection(selectedAccountId, selectedGatewayId);

			if (response.success) {
				toast.success('Cloudflare configuration saved successfully');
				// Refresh the page to update the badge
				window.location.reload();
			}
		} catch (error) {
			console.error('Error saving selection:', error);
			// apiClient already shows toast for errors, but we can add additional handling if needed
		} finally {
			setSaving(false);
		}
	};

	// Disconnect: ask the backend to clear the HttpOnly OAuth cookie.
	const handleDisconnect = async () => {
		try {
			await apiClient.disconnectCloudflare();
			toast.success('Disconnected from Cloudflare. You can reconnect anytime.');
			await refreshLimits?.();
			setTimeout(() => window.location.reload(), 500);
		} catch (error) {
			console.error('Error disconnecting:', error);
		}
	};

	const handleReconnect = () => {
		const url = new URL('/oauth/login', window.location.origin);
		url.searchParams.set('return_url', window.location.pathname + window.location.search);
		window.location.href = url.toString();
	};

	const cardHeader = (
		<div className="flex items-center gap-2 font-funky-mono tracking-tighter">
			<span className="h-lh flex items-center">
				<CloudflareLogoThemed className="size-5" />
			</span>
			<span>Cloudflare AI Gateway</span>
		</div>
	);

	if (loading) {
		return (
			<LayerCard>
				<LayerCard.Secondary>{cardHeader}</LayerCard.Secondary>
				<LayerCard.Primary>
					<div className="flex items-center justify-center py-8">
						<Loader2 className="size-5 animate-spin text-kumo-subtle" />
					</div>
				</LayerCard.Primary>
			</LayerCard>
		);
	}

	if (accounts.length === 0) {
		return (
			<LayerCard>
				<LayerCard.Secondary>{cardHeader}</LayerCard.Secondary>
				<LayerCard.Primary>
					<div className="grid gap-4">
						<p className="text-sm text-kumo-subtle">
							You haven't connected any Cloudflare accounts yet.
						</p>
						<div>
							<Button onClick={handleReconnect} variant="secondary" className="gap-2">
								<CloudflareLogo variant="glyph" className="size-4" />
								Connect Cloudflare
							</Button>
						</div>
					</div>
				</LayerCard.Primary>
			</LayerCard>
		);
	}

	const selectedAccount = accounts.find(a => a.id === selectedAccountId);
	const selectedGateway = availableGateways.find(g => g.id === selectedGatewayId);

	const gatewayDashUrl = selectedAccount && selectedGateway
		? `https://dash.cloudflare.com/${selectedAccount.accountId}/ai/ai-gateway/gateways/${selectedGateway.gatewaySlug}`
		: null;

	return (
		<LayerCard>
			<LayerCard.Secondary className="flex items-center justify-between gap-3">
				{cardHeader}
				<div className="flex items-center gap-2">
					{isConnected && (
						<div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
							<span className="h-lh flex items-center">
								<CheckCircle2 className="size-3.5" />
							</span>
							<span>Connected</span>
						</div>
					)}
					{!isConnected && (
						<div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
							<span className="h-lh flex items-center">
								<AlertCircle className="size-3.5" />
							</span>
							<span>Not connected</span>
						</div>
					)}
					{isConnected && (
						<>
							<Button
								variant="ghost"
								size="sm"
								shape="square"
								onClick={handleRefresh}
								disabled={refreshing}
								aria-label="Refresh accounts and gateways"
							>
								<RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
							</Button>
							<DropdownMenu>
								<DropdownMenu.Trigger
									render={
										<Button
											variant="ghost"
											size="sm"
											shape="square"
											aria-label="Account actions"
										>
											<MoreVertical className="size-4" />
										</Button>
									}
								/>
								<DropdownMenu.Content align="end">
									{gatewayDashUrl && (
										<DropdownMenu.Item
											onClick={() => window.open(gatewayDashUrl, '_blank')}
										>
											<ExternalLink className="size-4" />
											View gateway
										</DropdownMenu.Item>
									)}
									<DropdownMenu.Item
										onClick={handleDisconnect}
										variant="danger"
									>
										<LogOut className="size-4" />
										Disconnect
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu>
						</>
					)}
				</div>
			</LayerCard.Secondary>
			<LayerCard.Primary>
				{!isConnected ? (
					<div className="grid gap-4">
						<p className="text-sm text-kumo-subtle">
							Connect your Cloudflare account to use your own AI Gateway and credits.
						</p>
						<div>
							<Button onClick={handleReconnect} variant="secondary" className="gap-2">
								<CloudflareLogo variant="glyph" className="size-4" />
								Connect Cloudflare
							</Button>
						</div>
					</div>
				) : (
					<div className="grid gap-4">
						<div className="flex items-start justify-between gap-4 rounded-lg ring ring-kumo-line px-4 py-3">
							<div className="grid gap-1.5">
								<Label htmlFor="ai-gateway-toggle" className="text-sm font-medium">
									Use my AI Gateway
								</Label>
								<p className="text-sm text-kumo-subtle">
									When enabled, requests run through your Cloudflare AI Gateway and
									use your own credits. When disabled, the platform's free tier and
									limits apply.
								</p>
							</div>
							<Switch
								id="ai-gateway-toggle"
								checked={aiGatewayEnabled}
								disabled={togglingGateway}
								onCheckedChange={handleToggleAiGateway}
							/>
						</div>

						<div className="grid gap-1.5">
							<Label htmlFor="account-select">Cloudflare account</Label>
							<Select value={selectedAccountId || undefined} onValueChange={handleAccountChange}>
								<SelectTrigger id="account-select" className="w-full">
									<SelectValue placeholder="Select an account" />
								</SelectTrigger>
								<SelectContent>
									{accounts.map((account) => (
										<SelectItem key={account.id} value={account.id}>
											<div className="flex flex-col">
												<span className="font-medium">{account.accountName}</span>
												{account.accountEmail && (
													<span className="text-xs text-kumo-subtle">{account.accountEmail}</span>
												)}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="grid gap-1.5">
							<Label htmlFor="gateway-select">AI Gateway</Label>
							<Select
								value={selectedGatewayId || undefined}
								onValueChange={setSelectedGatewayId}
								disabled={availableGateways.length === 0}
							>
								<SelectTrigger id="gateway-select" className="w-full">
									<SelectValue placeholder="Select a gateway" />
								</SelectTrigger>
								<SelectContent>
									{availableGateways.map((gateway) => (
										<SelectItem key={gateway.id} value={gateway.id}>
											{gateway.gatewayId}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{selectedGateway && selectedGateway.creditsRemaining !== null && (
								<p className="text-sm text-kumo-subtle">
									Current balance: ${selectedGateway.creditsRemaining.toFixed(2)}
								</p>
							)}
							{availableGateways.length === 0 && selectedAccountId && (
								<p className="text-sm text-amber-600">
									No gateways available for this account. Please create one in your Cloudflare dashboard.
								</p>
							)}
						</div>

						<div>
							<Button
								onClick={handleSave}
								disabled={saving || !selectedAccountId || !selectedGatewayId}
							>
								{saving ? (
									<>
										<Loader2 className="size-4 animate-spin" />
										Saving...
									</>
								) : (
									'Save configuration'
								)}
							</Button>
						</div>
					</div>
				)}
			</LayerCard.Primary>
		</LayerCard>
	);
}
