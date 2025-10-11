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
import type { ModelConfig, UserModelConfigWithMetadata } from '@/api-types';
import type { AgentDisplayConfig } from '@/components/model-config-tabs';

// Reuse workflow tabs from settings (DRY principle)
const WORKFLOW_TABS = {
  quickstart: {
    id: 'quickstart',
    label: 'Quick Start',
    icon: Settings,
    description: 'Most commonly used agents',
  },
  planning: {
    id: 'planning', 
    label: 'Planning',
    icon: Settings,
    description: 'Project planning and setup',
  },
  coding: {
    id: 'coding',
    label: 'Coding', 
    icon: Settings,
    description: 'Development and implementation',
  },
  debugging: {
    id: 'debugging',
    label: 'Debugging',
    icon: Settings,
    description: 'Code fixing and review',
  },
  advanced: {
    id: 'advanced',
    label: 'Advanced',
    icon: Settings,
    description: 'Specialized operations',
  }
} as const;

// Reuse categorization logic from settings (DRY principle)
const categorizeAgent = (agentKey: string): string => {
  const specificMappings: Record<string, string> = {
    'templateSelection': 'quickstart',
    'blueprint': 'quickstart', 
    'conversationalResponse': 'quickstart',
    'phaseGeneration': 'planning',
    'projectSetup': 'planning',
    'phaseImplementation': 'coding',
    'firstPhaseImplementation': 'coding',
    'fileRegeneration': 'coding',
    'realtimeCodeFixer': 'debugging',
    'fastCodeFixer': 'debugging',
    'codeReview': 'debugging',
    'screenshotAnalysis': 'advanced'
  };
  
  if (specificMappings[agentKey]) {
    return specificMappings[agentKey];
  }
  
  const key = agentKey.toLowerCase();
  if (key.includes('template') || key.includes('selection')) return 'quickstart';
  if (key.includes('blueprint') || key.includes('architect')) return 'quickstart';
  if (key.includes('conversation') || key.includes('chat') || key.includes('response')) return 'quickstart';
  if (key.includes('project') && key.includes('setup')) return 'planning';
  if (key.includes('suggestion') && key.includes('process')) return 'planning';
  if (key.includes('planning') || key.includes('plan')) return 'planning';
  if (key.includes('implementation') || key.includes('implement')) return 'coding';
  if (key.includes('regenerat') || key.includes('regen')) return 'coding';
  if (key.includes('code') && key.includes('gen')) return 'coding';
  if (key.includes('fixer') || key.includes('fix')) return 'debugging';
  if (key.includes('debug') || key.includes('review')) return 'debugging';
  if (key.includes('lint') || key.includes('check')) return 'debugging';
  if (key.includes('screenshot') || key.includes('image') || key.includes('vision')) return 'advanced';
  if (key.includes('analysis') || key.includes('analyz')) return 'advanced';
  
  return 'advanced';
};

// Helper to get model display name
const getModelDisplayName = (modelValue?: string) => {
  if (!modelValue) return 'Default';
  return modelValue.split('/').pop() || modelValue;
};

// Helper to get provider info
const getProviderInfo = (modelValue?: string) => {
  if (!modelValue) return { name: 'Default', color: 'bg-bg-3 text-text-tertiary' };
  
  if (modelValue.includes('cerebras/')) {
    return { name: 'Cerebras', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400' };
  }
  if (modelValue.includes('[openrouter]')) {
    return { name: 'OpenRouter', color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/20 dark:text-pink-400' };
  }
  if (modelValue.includes('openai/') || modelValue.includes('gpt') || modelValue.includes('o3') || modelValue.includes('o4')) {
    return { name: 'OpenAI', color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' };
  }
  if (modelValue.includes('anthropic/') || modelValue.includes('claude')) {
    return { name: 'Anthropic', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' };
  }
  if (modelValue.includes('google-ai-studio/') || modelValue.includes('gemini')) {
    return { name: 'Google', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' };
  }
  
  return { name: 'Custom', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400' };
};

// Simplified config card for read-only display
function ConfigInfoCard({ 
  agent, 
  userConfig, 
  defaultConfig 
}: { 
  agent: AgentDisplayConfig; 
  userConfig?: UserModelConfigWithMetadata; 
  defaultConfig?: ModelConfig; 
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
        
        <Badge variant={isCustomized ? "default" : "outline"} className="text-xs shrink-0">
          {isCustomized ? "Custom" : "Default"}
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
              {reasoningEffort.charAt(0).toUpperCase()}{reasoningEffort.slice(1)}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

interface ModelConfigInfoProps {
  configs?: {
    agents: AgentDisplayConfig[];
    userConfigs: Record<string, UserModelConfigWithMetadata>;
    defaultConfigs: Record<string, ModelConfig>;
  };
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

  // Get agents for a specific tab
  const getAgentsForTab = (tabId: string) => {
    if (!configs) return [];
    return configs.agents.filter(agent => categorizeAgent(agent.key) === tabId);
  };

  // Count customized configs per tab
  const getCustomizedCountForTab = (tabId: string) => {
    const agents = getAgentsForTab(tabId);
    return agents.filter(agent => configs?.userConfigs[agent.key]?.isUserOverride).length;
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpen}
        className="gap-2 text-xs"
        title="View current model configurations"
      >
        <Info className="size-3" />
        <span className="hidden sm:inline">Model Info</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              Current Model Configurations
            </DialogTitle>
            <DialogDescription>
              View the AI model settings currently being used for app generation (defaults + your overrides).
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
                        <Badge variant="secondary" className="text-xs absolute -top-1 -right-1 h-4 w-4 rounded-full p-0 flex items-center justify-center text-[10px]">
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
                        <div className="text-center py-8 text-text-tertiary">
                          No agents in this category.
                        </div>
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