import { useState } from 'react';
import { Info, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { getModelDisplayName, getProviderInfo, categorizeAgent } from '@/utils/model-helpers';
import { WORKFLOW_TABS } from '@/lib/constants/workflow-tabs';
import type { AgentDisplayConfig, ModelConfigsInfo } from '@/api-types';

function ConfigInfoCard({
	agent,
	userConfig,
	defaultConfig,
}: {
	agent: AgentDisplayConfig;
	userConfig?: ModelConfigsInfo['userConfigs'][string];
	defaultConfig?: ModelConfigsInfo['defaultConfigs'][string];
}) {
	const isCustomized = userConfig?.isUserOverride || false;
	const currentModel = userConfig?.name || defaultConfig?.name;
	const modelDisplayName = getModelDisplayName(currentModel);
	const providerInfo = getProviderInfo(currentModel);

	const temperature = userConfig?.temperature ?? defaultConfig?.temperature;
	const maxTokens = userConfig?.max_tokens ?? defaultConfig?.max_tokens;
	const reasoningEffort = userConfig?.reasoning_effort ?? defaultConfig?.reasoning_effort;

	return (
		<div className="p-4 border rounded-lg bg-bg-3/50 space-y-3">
			<div className="flex items-start justify-between gap-2">
				<div className="flex items-start gap-2 min-w-0 flex-1">
					<div className="p-1 rounded-sm bg-bg-3">
						<Settings className="h-3 w-3" />
					</div>
					<div className="min-w-0 flex-1">
						<h6 className="font-medium text-sm mb-1 text-text-secondary" title={agent.name}>
							{agent.name}
						</h6>
						<p className="text-xs text-text-tertiary line-clamp-2" title={agent.description}>
							{agent.description}
						</p>
					</div>
				</div>

				<Badge variant={isCustomized ? 'default' : 'outline'} className="text-xs shrink-0">
					{isCustomized ? 'Custom' : 'Default'}
				</Badge>
			</div>

			<div className="space-y-2">
				<div className="flex items-center justify-between gap-2">
					<span className="text-sm font-medium text-text-secondary" title={modelDisplayName}>
						{modelDisplayName}
					</span>
					<Badge variant="secondary" className={`text-xs shrink-0 ${providerInfo.color}`}>
						{providerInfo.name}
					</Badge>
				</div>

				<div className="flex flex-wrap gap-1">
					{temperature !== null && temperature !== undefined && (
						<Badge variant="outline" className="text-xs">
							T: {temperature}
						</Badge>
					)}
					{maxTokens && (
						<Badge variant="outline" className="text-xs">
							{Math.round(maxTokens / 1000)}K tokens
						</Badge>
					)}
					{reasoningEffort && (
						<Badge variant="outline" className="text-xs">
							{reasoningEffort.charAt(0).toUpperCase()}
							{reasoningEffort.slice(1)}
						</Badge>
					)}
				</div>
			</div>
		</div>
	);
}

interface ModelConfigInfoProps {
	configs?: ModelConfigsInfo;
	onRequestConfigs: () => void;
	loading?: boolean;
}

export function ModelConfigInfo({ configs, onRequestConfigs, loading }: ModelConfigInfoProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [activeTab, setActiveTab] = useState('quickstart');

	const handleOpen = () => {
		setIsOpen(true);
		if (!configs) {
			onRequestConfigs();
		}
	};

	const getAgentsForTab = (tabId: string) => {
		if (!configs) return [];
		return configs.agents.filter((agent) => categorizeAgent(agent.key) === tabId);
	};

	const getCustomizedCountForTab = (tabId: string) => {
		const agents = getAgentsForTab(tabId);
		return agents.filter((agent) => configs?.userConfigs[agent.key]?.isUserOverride).length;
	};

	return (
		<>
			<button
				onClick={handleOpen}
				className="group relative flex items-center gap-1.5 p-1.5 group-hover:pl-2 group-hover:pr-2.5 rounded-full group-hover:rounded-md transition-all duration-300 ease-in-out hover:bg-bg-4 border border-transparent hover:border-border-primary hover:shadow-sm overflow-hidden"
				title="View current model configurations"
				type="button"
			>
				<Info className="size-3.5 text-text-primary/60 group-hover:text-brand-primary transition-colors duration-300 flex-shrink-0" />
				<span className="max-w-0 group-hover:max-w-[75px] opacity-0 group-hover:opacity-100 overflow-hidden transition-all duration-300 ease-in-out whitespace-nowrap text-xs font-medium text-text-primary">
					Model Info
				</span>
			</button>

			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<Info className="h-5 w-5" />
							Current Model Configurations
						</DialogTitle>
						<DialogDescription>
							View the AI model settings currently being used for generation (defaults + overrides).
						</DialogDescription>
					</DialogHeader>

					{loading ? (
						<div className="flex items-center gap-3 p-8">
							<Settings className="h-5 w-5 animate-spin text-text-tertiary" />
							<span className="text-sm text-text-tertiary">Loading model configurations...</span>
						</div>
					) : !configs ? (
						<div className="text-center py-8 text-text-tertiary">
							<p>No configuration data available.</p>
							<Button
								variant="outline"
								size="sm"
								onClick={onRequestConfigs}
								className="mt-4"
							>
								Retry
							</Button>
						</div>
					) : (
						<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
							<TabsList className="grid w-full grid-cols-5 h-12">
								{Object.values(WORKFLOW_TABS).map((tab) => {
									const customizedCount = getCustomizedCountForTab(tab.id);

									return (
										<TabsTrigger
											key={tab.id}
											value={tab.id}
											className="flex flex-col gap-1 py-2 relative justify-center"
										>
											<div className="flex items-center gap-2">
												<span className="hidden sm:inline text-xs">{tab.label}</span>
												<span className="sm:hidden text-xs">{tab.label.split(' ')[0]}</span>
											</div>
											{customizedCount > 0 && (
												<Badge
													variant="secondary"
													className="text-xs absolute -top-1 -right-1 h-4 w-4 rounded-full p-0 flex items-center justify-center text-[10px]"
												>
													{customizedCount}
												</Badge>
											)}
										</TabsTrigger>
									);
								})}
							</TabsList>

							{Object.values(WORKFLOW_TABS).map((tab) => {
								const agents = getAgentsForTab(tab.id);

								return (
									<TabsContent key={tab.id} value={tab.id} className="mt-6">
										<div className="space-y-4">
											<div className="text-sm text-text-tertiary">
												{tab.description} • {agents.length} agent{agents.length !== 1 ? 's' : ''}
												{getCustomizedCountForTab(tab.id) > 0 && (
													<span className="ml-2 text-text-primary font-medium">
														({getCustomizedCountForTab(tab.id)} customized)
													</span>
												)}
											</div>

											{agents.length === 0 ? (
												<div className="text-center py-8 text-text-tertiary">No agents in this category.</div>
											) : (
												<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
													{agents.map((agent) => (
														<ConfigInfoCard
															key={agent.key}
															agent={agent}
															userConfig={configs.userConfigs[agent.key]}
															defaultConfig={configs.defaultConfigs[agent.key]}
														/>
													))}
												</div>
											)}
										</div>
									</TabsContent>
								);
							})}
						</Tabs>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
