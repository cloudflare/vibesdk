/**
 * Cloudflare Account & Gateway Selector
 * Allows users to select their active Cloudflare account and AI Gateway
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import CloudflareLogo from '@/assets/provider-logos/cloudflare.svg?react';
import { Loader2, CheckCircle2, AlertCircle, MoreVertical, ExternalLink, LogOut } from 'lucide-react';
import { useLimitsContext } from '@/contexts/limits-context';

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
	const [selectedAccountId, setSelectedAccountId] = useState<string>('');
	const [selectedGatewayId, setSelectedGatewayId] = useState<string>('');
	const [availableGateways, setAvailableGateways] = useState<Gateway[]>([]);

	// Whether an OAuth cookie is live on the server. Backend refreshes it
	// transparently, so the client only needs to know if it still exists.
	const { data: limitsData, refetch: refreshLimits } = useLimitsContext();
	const isConnected = !!limitsData?.hasUserToken;

	// Fetch accounts and gateways
	useEffect(() => {
		fetchAccounts();
	}, []);

	const fetchAccounts = async () => {
		try {
			setLoading(true);
			const response = await fetch('/api/cloudflare/accounts', {
				credentials: 'include',
			});

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
		}
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

	if (loading) {
		return (
			<Card>
				<CardHeader variant="minimal">
					<div className="flex items-center gap-3 border-b w-full py-3 text-text-primary">
						<CloudflareLogo className="w-5 h-5" />
						<div>
							<CardTitle>Cloudflare AI Gateway</CardTitle>
						</div>
					</div>
				</CardHeader>
				<CardContent className="px-6 mt-6">
					<div className="flex items-center justify-center py-8">
						<Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
					</div>
				</CardContent>
			</Card>
		);
	}

	if (accounts.length === 0) {
		return (
			<Card>
				<CardHeader variant="minimal">
					<div className="flex items-center gap-3 border-b w-full py-3 text-text-primary">
						<CloudflareLogo className="w-5 h-5" />
						<div>
							<CardTitle>Cloudflare AI Gateway</CardTitle>
						</div>
					</div>
				</CardHeader>
				<CardContent className="px-6 mt-6">
					<p className="text-sm text-muted-foreground mb-4">
						You haven't connected any Cloudflare accounts yet. Click the Cloudflare button in the top bar to connect your account.
					</p>
				</CardContent>
			</Card>
		);
	}

	const selectedAccount = accounts.find(a => a.id === selectedAccountId);
	const selectedGateway = availableGateways.find(g => g.id === selectedGatewayId);

	const handleReconnect = () => {
		const url = new URL('/oauth/login', window.location.origin);
		url.searchParams.set('return_url', window.location.pathname + window.location.search);
		window.location.href = url.toString();
	};

	const gatewayDashUrl = selectedAccount && selectedGateway
		? `https://dash.cloudflare.com/${selectedAccount.accountId}/ai/ai-gateway/gateways/${selectedGateway.gatewaySlug}`
		: null;

	return (
		<Card>
			<CardHeader variant="minimal">
				<div className="flex items-center justify-between gap-3 border-b w-full py-3 text-text-primary">
					<div className="flex items-center gap-3">
						<CloudflareLogo className="w-5 h-5" />
						<div>
							<CardTitle>Cloudflare AI Gateway</CardTitle>
						</div>
					</div>
					<div className="flex items-center gap-2">
						{isConnected && (
							<div className="flex items-center gap-1.5 text-xs">
								<CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
								<span className="text-green-600 dark:text-green-400">Connected</span>
							</div>
						)}
						{!isConnected && accounts.length > 0 && (
							<div className="flex items-center gap-1.5 text-xs">
								<AlertCircle className="w-3.5 h-3.5 text-amber-500" />
								<span className="text-amber-600 dark:text-amber-400">Not connected</span>
							</div>
						)}
						{isConnected && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon" className="h-7 w-7">
										<MoreVertical className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									{gatewayDashUrl && (
										<DropdownMenuItem onClick={() => window.open(gatewayDashUrl, '_blank')}>
											<ExternalLink className="w-4 h-4 mr-2" />
											View Gateway
										</DropdownMenuItem>
									)}
									<DropdownMenuItem
										onClick={handleDisconnect}
										className="text-red-600 focus:text-red-600"
									>
										<LogOut className="w-4 h-4 mr-2" />
										Disconnect
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-4 px-6 mt-6">
				{!isConnected ? (
					<div className="space-y-4">
						<p className="text-sm text-muted-foreground">
							Connect your Cloudflare account to use your own AI Gateway and credits.
						</p>
						<Button 
							onClick={handleReconnect}
							variant="outline"
							className="w-full gap-2 border-[#f48120] text-[#f48120] bg-white dark:bg-transparent hover:bg-[#f48120]/10"
						>
							<CloudflareLogo className="w-4 h-4" />
							Connect Cloudflare
						</Button>
					</div>
				) : (
					<>
						<div className="space-y-2">
							<Label htmlFor="account-select">Cloudflare Account</Label>
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
													<span className="text-xs text-muted-foreground">{account.accountEmail}</span>
												)}
											</div>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
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
								<p className="text-xs text-muted-foreground">
									Current balance: ${selectedGateway.creditsRemaining.toFixed(2)}
								</p>
							)}
							{availableGateways.length === 0 && selectedAccountId && (
								<p className="text-xs text-amber-600">
									No gateways available for this account. Please create one in your Cloudflare dashboard.
								</p>
							)}
						</div>

						<Button 
							onClick={handleSave} 
							disabled={saving || !selectedAccountId || !selectedGatewayId}
							className="w-full"
						>
							{saving ? (
								<>
									<Loader2 className="w-4 h-4 mr-2 animate-spin" />
									Saving...
								</>
							) : (
								'Save Configuration'
							)}
						</Button>
					</>
				)}
			</CardContent>
		</Card>
	);
}
