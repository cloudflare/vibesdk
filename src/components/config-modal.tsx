/**
 * Redesigned Model Configuration Modal
 * Three-mode interface: Platform Models, BYOK (Bring Your Own Key), Custom Providers
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Settings, Play, RotateCcw, Info, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModelSelector } from '@/components/ui/model-selector';
import { Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiClient } from '@/lib/api-client';
import { ByokApiKeysModal } from './byok-api-keys-modal';
import type {
  ModelConfig,
  UserModelConfigWithMetadata,
  ModelConfigUpdate,
  ByokProvidersData,
  AgentDisplayConfig
} from '@/api-types';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentConfig: AgentDisplayConfig;
  userConfig?: UserModelConfigWithMetadata;
  defaultConfig?: ModelConfig;
  onSave: (config: ModelConfigUpdate) => Promise<void>;
  onTest: (tempConfig?: ModelConfigUpdate) => Promise<void>;
  onReset: () => Promise<void>;
  isTesting: boolean;
}


// Helper to extract provider from model name (e.g., "openai/gpt-4" -> "openai")
const getProviderFromModel = (modelName: string): string => {
  if (!modelName || modelName === 'default') return '';
  return modelName.split('/')[0] || '';
};

// Helper to check if user has BYOK key for a model's provider
const hasUserKeyForModel = (modelName: string, byokProviders: Array<{ provider: string; hasValidKey: boolean }>): boolean => {
  const provider = getProviderFromModel(modelName);
  if (!provider) return false;
  
  return byokProviders.some(p => p.provider === provider && p.hasValidKey);
};


// Model recommendations by agent
const getModelRecommendation = (agentAction: string) => {
  const recommendations: Record<string, string> = {
    templateSelection: 'Recommended: Fast models for quick template selection',
    blueprint: 'Recommended: Creative models for architecture design',
    projectSetup: 'Recommended: Reliable models for precise setup',
    phaseGeneration: 'Recommended: Large context models for comprehensive planning',
    firstPhaseImplementation: 'Recommended: High-capability models for foundation development',
    phaseImplementation: 'Recommended: Strong coding models for implementation',
    realtimeCodeFixer: 'Recommended: Fast debugging models',
    fastCodeFixer: 'Recommended: Ultra-fast models for quick fixes',
    conversationalResponse: 'Recommended: Balanced models for natural conversation',
    codeReview: 'Recommended: Analytical models with large context',
    fileRegeneration: 'Recommended: Pure coding models',
    screenshotAnalysis: 'Recommended: Vision-capable models for image analysis'
  };
  return recommendations[agentAction] || '';
};

export function ConfigModal({
  isOpen,
  onClose,
  agentConfig,
  userConfig,
  defaultConfig,
  onSave,
  onTest,
  onReset,
  isTesting
}: ConfigModalProps) {
  // Form state
  const [formData, setFormData] = useState({
    modelName: userConfig?.name || 'default',
    temperature: userConfig?.temperature?.toString() || '',
    reasoningEffort: userConfig?.reasoning_effort || 'default',
    fallbackModel: userConfig?.fallbackModel || 'default'
  });

  // UI state
  const [hasChanges, setHasChanges] = useState(false);
  const [byokModalOpen, setByokModalOpen] = useState(false);
  
  // Modal lifecycle tracking
  const [isInitialOpen, setIsInitialOpen] = useState(false);

  // BYOK data state
  const [byokData, setByokData] = useState<ByokProvidersData | null>(null);
  const [loadingByok, setLoadingByok] = useState(false);

  // Load BYOK data (filtered by agent constraints)
  const loadByokData = useCallback(async () => {
    try {
      setLoadingByok(true);
      // Pass agent key to get constraint-filtered models
      const response = await apiClient.getByokProviders(agentConfig.key);
      if (response.success && response.data) {
        setByokData(response.data);
      }
    } catch (error) {
      console.error('Failed to load BYOK data:', error);
    } finally {
      setLoadingByok(false);
    }
  }, [agentConfig.key]);

  // Handle modal open/close lifecycle
  useEffect(() => {
    if (isOpen && !isInitialOpen) {
      // First time opening - reset everything and load data
      setFormData({
        modelName: userConfig?.name || 'default',
        temperature: userConfig?.temperature?.toString() || '',
        reasoningEffort: userConfig?.reasoning_effort || 'default',
        fallbackModel: userConfig?.fallbackModel || 'default'
      });
      setHasChanges(false);
      setByokModalOpen(false);
      setIsInitialOpen(true);
      loadByokData();
    } else if (!isOpen && isInitialOpen) {
      // Modal closed - reset for next time
      setIsInitialOpen(false);
    }
  }, [isOpen, isInitialOpen, userConfig, loadByokData]);

  // Load BYOK data when modal opens
  useEffect(() => {
    if (byokData && isInitialOpen) {
      // BYOK data is loaded, ready for model selection
    }
  }, [byokData, isInitialOpen, userConfig?.name]);

  // Check for changes
  useEffect(() => {
    const originalFormData = {
      modelName: userConfig?.name || 'default',
      temperature: userConfig?.temperature?.toString() || '',
      reasoningEffort: userConfig?.reasoning_effort || 'default',
      fallbackModel: userConfig?.fallbackModel || 'default'
    };
    
    setHasChanges(JSON.stringify(formData) !== JSON.stringify(originalFormData));
  }, [formData, userConfig]);

  // Get unified model list with BYOK status info
  const availableModels = useMemo(() => {
    if (!byokData) return [];

    const models: { value: string; label: string; provider: string; hasUserKey: boolean; byokAvailable: boolean }[] = [];
    const processedModels = new Set<string>();
    
    // First, add all BYOK models (they have BYOK capability)
    Object.values(byokData.modelsByProvider).forEach(providerModels => {
      providerModels.forEach(model => {
        const modelStr = model as string;
        if (!processedModels.has(modelStr)) {
          const provider = getProviderFromModel(modelStr);
          const hasUserKey = hasUserKeyForModel(modelStr, byokData.providers);
          
          models.push({
            value: modelStr,
            label: modelStr,
            provider,
            hasUserKey,
            byokAvailable: true
          });
          processedModels.add(modelStr);
        }
      });
    });
    
    // Then, add platform-only models (no BYOK capability)
    byokData.platformModels.forEach(model => {
      const modelStr = model as string;
      if (!processedModels.has(modelStr)) {
        models.push({
          value: modelStr,
          label: modelStr,
          provider: '',
          hasUserKey: false,
          byokAvailable: false
        });
        processedModels.add(modelStr);
      }
    });
    
    return models.sort((a, b) => a.label.localeCompare(b.label));
  }, [byokData]);

  // Get current model's BYOK status
  const selectedModelInfo = useMemo(() => {
    const currentModel = formData.modelName && formData.modelName !== 'default' 
      ? formData.modelName 
      : '';
      
    if (!currentModel || !byokData) {
      return { hasUserKey: false, provider: '', requiresBYOK: false, isPlatformModel: true };
    }
    
    // Check if this is a BYOK-capable model
    const isByokModel = Object.values(byokData.modelsByProvider).some(providerModels => 
      providerModels.some(model => model === currentModel)
    );
    
    const provider = getProviderFromModel(currentModel);
    const hasUserKey = hasUserKeyForModel(currentModel, byokData.providers);
    
    return {
      hasUserKey,
      provider,
      requiresBYOK: isByokModel && !hasUserKey, // Only BYOK-capable models can require keys
      isPlatformModel: !isByokModel
    };
  }, [formData.modelName, byokData]);

  // Create config object from current form state
  const buildCurrentConfig = (): ModelConfigUpdate => {
    return {
      ...(formData.modelName !== 'default' && { modelName: formData.modelName }),
      ...(formData.temperature && { temperature: parseFloat(formData.temperature) }),
      ...(formData.reasoningEffort !== 'default' && { reasoningEffort: formData.reasoningEffort }),
      ...(formData.fallbackModel !== 'default' && { fallbackModel: formData.fallbackModel }),
      isUserOverride: true
    };
  };

  const handleSave = async () => {
    const config = buildCurrentConfig();
    await onSave(config);
  };

  const handleTestWithCurrentConfig = async () => {
    const currentConfig = buildCurrentConfig();
    // We'll need to update the parent component to handle testing with temporary config
    await onTest(currentConfig);
  };

  const handleReset = async () => {
    await onReset();
    onClose();
  };

  const openByokModal = () => {
    setByokModalOpen(true);
  };

  const handleByokKeyAdded = () => {
    // Refresh BYOK data after a key is added
    loadByokData();
  };

  const isUserOverride = userConfig?.isUserOverride || false;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="overflow-y-auto max-w-3xl w-[90vw] max-h-[90vh] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configure {agentConfig.name}
          </DialogTitle>
          <DialogDescription>
            {agentConfig.description}
          </DialogDescription>
        </DialogHeader>

        {/* Alerts outside DialogDescription to avoid nested p/div issues */}
        <div className="space-y-2 -mt-2">
          {agentConfig.constraint?.enabled && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Model selection limited to {agentConfig.constraint.allowedModels.length} allowed model{agentConfig.constraint.allowedModels.length !== 1 ? 's' : ''} for this operation.
              </AlertDescription>
            </Alert>
          )}
          {getModelRecommendation(agentConfig.key) && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {getModelRecommendation(agentConfig.key)}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="space-y-6">
          {/* Current Status */}
          <div className="flex items-center justify-between p-3 bg-bg-3/50 rounded-lg">
            <div>
              <p className="font-medium text-sm">Configuration Status</p>
              <p className="text-xs text-text-tertiary">
                {isUserOverride ? 'Using custom configuration' : 'Using system defaults'}
              </p>
            </div>
            <Badge variant={isUserOverride ? "default" : "outline"}>
              {isUserOverride ? "Custom" : "Default"}
            </Badge>
          </div>


          {/* Model Selection Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Model Configuration</Label>
                <p className="text-xs text-text-tertiary mt-1">
                  Select primary and fallback models - we'll use your API keys if available
                </p>
              </div>
              <Button variant="outline" size="sm" 
              onClick={openByokModal}
              disabled // DISABLED: BYOK Disabled for security reasons
              className="gap-2">
                <Key className="h-4 w-4" />
                {/* Manage Keys */}
                Coming Soon
              </Button>
            </div>
            
            {/* Two-Column Model Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Primary AI Model */}
              <div className="space-y-2">
                <ModelSelector
                  value={formData.modelName}
                  onValueChange={(value) => setFormData({...formData, modelName: value})}
                  availableModels={availableModels}
                  placeholder="Select model..."
                  label="AI Model"
                  systemDefault={defaultConfig?.name}
                  disabled={loadingByok}
                />
                
                {/* Model Status Messages */}
                {selectedModelInfo.requiresBYOK && (
                  <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 rounded-md border border-amber-200 dark:border-amber-800">
                    <Key className="h-4 w-4" />
                    <span>API key needed for {selectedModelInfo.provider}</span>
                    <Button variant="link" size="sm" onClick={openByokModal} className="p-0 h-auto text-amber-600 hover:text-amber-700">
                      Setup now
                    </Button>
                  </div>
                )}
                
                {selectedModelInfo.isPlatformModel && formData.modelName && formData.modelName !== 'default' && (
                  <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 dark:bg-blue-950/20 px-3 py-2 rounded-md border border-blue-200 dark:border-blue-800">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Platform model with usage limits. Consider BYOK for higher usage.</span>
                  </div>
                )}
                
                {formData.modelName && formData.modelName !== 'default' && selectedModelInfo.hasUserKey && (
                  <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-950/20 px-3 py-2 rounded-md border border-green-200 dark:border-green-800">
                    <Check className="h-4 w-4" />
                    <span>Using your {selectedModelInfo.provider} API key</span>
                  </div>
                )}
              </div>

              {/* Fallback Model */}
              <div className="space-y-2">
                <ModelSelector
                  value={formData.fallbackModel}
                  onValueChange={(value) => setFormData({...formData, fallbackModel: value})}
                  availableModels={availableModels}
                  placeholder="Select fallback model..."
                  label="Fallback Model"
                  systemDefault={defaultConfig?.fallbackModel}
                  includeDefaultOption={true}
                  disabled={loadingByok}
                />
              </div>
            </div>
          </div>


          <Separator />

          {/* BYOK Information */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border bg-blue-50/50 border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                  <h4 className="font-medium text-sm text-blue-900">Platform Models</h4>
                </div>
                <p className="text-xs text-blue-700">
                  Models served through our platform with limited quota. No API keys required.
                </p>
              </div>
              
              <div className="p-4 rounded-lg border bg-green-50/50 border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <h4 className="font-medium text-sm text-green-900">BYOK (Your Keys)</h4>
                </div>
                <p className="text-xs text-green-700">
                  Your API keys are used for direct billing with providers. Unlimited usage based on your provider account.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Parameters */}
          <div className="space-y-4">
            <h4 className="font-medium text-sm">Parameters</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Temperature */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Temperature</Label>
                <Input
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  value={formData.temperature}
                  placeholder={defaultConfig?.temperature ? `${defaultConfig.temperature}` : '0.7'}
                  onChange={(e) => setFormData({...formData, temperature: e.target.value})}
                  className="h-10"
                />
                {defaultConfig?.temperature && (
                  <p className="text-xs text-text-tertiary">
                    🔧 Default: {defaultConfig.temperature}
                  </p>
                )}
              </div>

              {/* Reasoning Effort */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Reasoning Effort</Label>
                <Select value={formData.reasoningEffort} onValueChange={(value) => setFormData({...formData, reasoningEffort: value})}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select effort..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Use default</SelectItem>
                    <SelectItem value="low">Low (Fast)</SelectItem>
                    <SelectItem value="medium">Medium (Balanced)</SelectItem>
                    <SelectItem value="high">High (Deep)</SelectItem>
                  </SelectContent>
                </Select>
                {defaultConfig?.reasoning_effort && (
                  <p className="text-xs text-text-tertiary">
                    🔧 Default: {defaultConfig.reasoning_effort}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-3 flex-col sm:flex-row sm:justify-between">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestWithCurrentConfig}
              disabled={isTesting}
              className="gap-2"
            >
              {isTesting ? (
                <>
                  <Settings className="h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Test Config
                </>
              )}
            </Button>
            
            {isUserOverride && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="gap-2 text-text-tertiary"
              >
                <RotateCcw className="h-4 w-4" />
                Reset to Default
              </Button>
            )}
          </div>

          <div className="flex gap-2 flex-wrap sm:justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={!hasChanges}
            >
              Save Changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* BYOK API Keys Modal */}
      <ByokApiKeysModal
        isOpen={byokModalOpen}
        onClose={() => setByokModalOpen(false)}
        onKeyAdded={handleByokKeyAdded}
      />
    </Dialog>
  );
}