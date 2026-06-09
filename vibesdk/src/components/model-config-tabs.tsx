import { useState, useCallback } from 'react';
import { Search, RotateCcw, Play, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ConfigCard } from './config-card';
import { ConfigModal } from './config-modal';
import { categorizeAgent } from '@/utils/model-helpers';
import { WORKFLOW_TABS } from '@/lib/constants/workflow-tabs';
import type {
  ModelConfig,
  UserModelConfigWithMetadata,
  ModelConfigUpdate,
  AgentDisplayConfig
} from '@/api-types';

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