import { useState, useCallback } from 'react';
import { 
  Settings, 
  Rocket, 
  Wrench, 
  Code, 
  Bug,
  Brain,
  Search,
  RotateCcw,
  Play
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ConfigCard } from './config-card';
import { ConfigModal } from './config-modal';
import type { ModelConfig, UserModelConfigWithMetadata, ModelConfigUpdate } from '@/api-types';

// Define workflow-based tab structure with dynamic agent categorization
export const WORKFLOW_TABS = {
  quickstart: {
    id: 'quickstart',
    label: 'Quick Start',
    icon: Rocket,
    description: 'Most commonly customized settings',
    patterns: ['template', 'blueprint', 'conversational']
  },
  planning: {
    id: 'planning', 
    label: 'Planning',
    icon: Brain,
    description: 'Project planning and setup',
    patterns: ['phase', 'project', 'suggestion', 'generation']
  },
  coding: {
    id: 'coding',
    label: 'Coding', 
    icon: Code,
    description: 'Development and implementation',
    patterns: ['implementation', 'file', 'regeneration']
  },
  debugging: {
    id: 'debugging',
    label: 'Debugging',
    icon: Bug, 
    description: 'Code fixing and review',
    patterns: ['fixer', 'fix', 'review', 'debug']
  },
  advanced: {
    id: 'advanced',
    label: 'Advanced',
    icon: Wrench,
    description: 'Specialized operations',
    patterns: ['screenshot', 'analysis', 'image', 'vision']
  }
} as const;

// Helper function to categorize agents dynamically with specific mappings
const categorizeAgent = (agentKey: string): string => {
  // Specific agent mappings first (highest priority)
  const specificMappings: Record<string, string> = {
    // Quick Start - Most commonly used
    'templateSelection': 'quickstart',
    'blueprint': 'quickstart', 
    'conversationalResponse': 'quickstart',
    
    // Planning - Project planning and setup
    'phaseGeneration': 'planning',
    'projectSetup': 'planning',
    
    // Coding - Development and implementation 
    'phaseImplementation': 'coding',        // Fix: was going to planning due to "phase"
    'firstPhaseImplementation': 'coding',   // Fix: was going to planning due to "phase"
    'fileRegeneration': 'coding',           // Fix: was going to planning due to "generation"
    
    // Debugging - Code fixing and review
    'realtimeCodeFixer': 'debugging',
    'fastCodeFixer': 'debugging',
    'codeReview': 'debugging',
    
    // Advanced - Specialized operations
    'screenshotAnalysis': 'advanced'
  };
  
  // Check specific mappings first
  if (specificMappings[agentKey]) {
    return specificMappings[agentKey];
  }
  
  // Fallback to pattern matching for unknown agents (future-proofing)
  const key = agentKey.toLowerCase();
  
  // More targeted pattern matching to avoid conflicts
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
  
  // Default to advanced for completely unknown agents
  return 'advanced';
};

// Frontend-specific agent display interface 
export interface AgentDisplayConfig {
  key: string;
  name: string;
  description: string;
}

interface ModelConfigTabsProps {
  agentConfigs: AgentDisplayConfig[];
  modelConfigs: Record<string, UserModelConfigWithMetadata>;
  defaultConfigs: Record<string, ModelConfig>;
  loadingConfigs: boolean;
  onSaveConfig: (agentAction: string, config: ModelConfigUpdate) => Promise<void>;
  onTestConfig: (agentAction: string, tempConfig?: ModelConfigUpdate) => Promise<void>;
  onResetConfig: (agentAction: string) => Promise<void>;
  onResetAllConfigs: () => Promise<void>;
  testingConfig: string | null;
  savingConfigs: boolean;
}

export function ModelConfigTabs({
  agentConfigs,
  modelConfigs,
  defaultConfigs,
  loadingConfigs,
  onSaveConfig,
  onTestConfig, 
  onResetConfig,
  onResetAllConfigs,
  testingConfig,
  savingConfigs
}: ModelConfigTabsProps) {
  const [activeTab, setActiveTab] = useState('quickstart');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConfigKey, setSelectedConfigKey] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filter agent configs by search term
  const filteredAgentConfigs = agentConfigs.filter(config =>
    config.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    config.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get agents for a specific tab using dynamic categorization
  const getAgentsForTab = useCallback((tabId: string) => {
    return filteredAgentConfigs.filter(config => 
      categorizeAgent(config.key) === tabId
    );
  }, [filteredAgentConfigs]);

  // Count customized configs per tab
  const getCustomizedCountForTab = useCallback((tabId: string) => {
    const agents = getAgentsForTab(tabId);
    return agents.filter(agent => modelConfigs[agent.key]?.isUserOverride).length;
  }, [getAgentsForTab, modelConfigs]);

  // Handle opening config modal
  const handleConfigureAgent = (agentKey: string) => {
    setSelectedConfigKey(agentKey);
    setIsModalOpen(true);
  };

  // Handle closing config modal
  const handleCloseModal = () => {
    setSelectedConfigKey(null);
    setIsModalOpen(false);
  };

  // Handle bulk test all configured agents
  const handleTestAllConfigured = async () => {
    const customizedConfigs = agentConfigs.filter(config => 
      modelConfigs[config.key]?.isUserOverride
    );
    
    if (customizedConfigs.length === 0) {
      toast.info('No customized configurations to test');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const config of customizedConfigs) {
      try {
        await onTestConfig(config.key);
        successCount++;
      } catch (error) {
        errorCount++;
      }
    }

    toast.success(`Tested ${customizedConfigs.length} configs: ${successCount} passed, ${errorCount} failed`);
  };

  if (loadingConfigs) {
    return (
      <div className="flex items-center gap-3 p-8">
        <Settings className="h-5 w-5 animate-spin text-text-tertiary" />
        <span className="text-sm text-text-tertiary">Loading model configurations...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex-1">
          <h4 className="font-medium">Model Configuration Overrides</h4>
          <p className="text-sm text-text-tertiary">
            Customize AI model settings for different operations. Organized by workflow stage.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-text-tertiary" />
            <Input
              placeholder="Search configurations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full sm:w-64 dark:bg-bg-1 bg-bg-4"
            />
          </div>
          
          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestAllConfigured}
              className="gap-2"
            >
              <Play className="h-4 w-4" />
              Test All
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={onResetAllConfigs}
              disabled={savingConfigs}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              {savingConfigs ? 'Resetting...' : 'Reset All'}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabbed interface */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-12 items-center border-2 border-bg-2 dark:border-bg-4">
          {Object.values(WORKFLOW_TABS).map((tab) => {
            const Icon = tab.icon;
            const customizedCount = getCustomizedCountForTab(tab.id);
            
            return (
              <TabsTrigger 
                key={tab.id} 
                value={tab.id}
                className="flex flex-col gap-1 py-1 relative h-[calc(100%-4px)] min-h-[calc(100%-4px)] justify-center"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </div>
                {customizedCount > 0 && (
                  <Badge variant="secondary" className="text-xs absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center">
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
                {/* Tab description */}
                <div className="text-sm text-text-tertiary">
                  {tab.description} • {agents.length} agent{agents.length !== 1 ? 's' : ''}
                  {getCustomizedCountForTab(tab.id) > 0 && (
                    <span className="ml-2 text-text-primary font-medium">
                      ({getCustomizedCountForTab(tab.id)} customized)
                    </span>
                  )}
                </div>

                {/* Agent config cards */}
                {agents.length === 0 ? (
                  <div className="text-center py-8 text-text-tertiary">
                    {searchTerm ? 'No configurations match your search.' : 'No configurations in this category.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-8 auto-rows-fr">
                    {agents.map((agent) => (
                      <ConfigCard
                        key={agent.key}
                        agent={agent}
                        userConfig={modelConfigs[agent.key]}
                        defaultConfig={defaultConfigs[agent.key]}
                        onConfigure={() => handleConfigureAgent(agent.key)}
                        onTest={() => onTestConfig(agent.key)}
                        onReset={() => onResetConfig(agent.key)}
                        isTesting={testingConfig === agent.key}
                      />
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Configuration Modal */}
      {selectedConfigKey && (
        <ConfigModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          agentConfig={agentConfigs.find(a => a.key === selectedConfigKey)!}
          userConfig={modelConfigs[selectedConfigKey]}
          defaultConfig={defaultConfigs[selectedConfigKey]}
          onSave={(config) => onSaveConfig(selectedConfigKey, config)}
          onTest={(tempConfig) => onTestConfig(selectedConfigKey, tempConfig)}
          onReset={() => onResetConfig(selectedConfigKey)}
          isTesting={testingConfig === selectedConfigKey}
        />
      )}
    </div>
  );
}