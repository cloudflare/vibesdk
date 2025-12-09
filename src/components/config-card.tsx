import { Settings, Play, RotateCcw, Zap, Brain, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getModelDisplayName, getProviderInfo } from '@/utils/model-helpers';
import type { ModelConfig, UserModelConfigWithMetadata, AgentDisplayConfig } from '@/api-types';

interface ConfigCardProps {
  agent: AgentDisplayConfig;
  userConfig?: UserModelConfigWithMetadata;
  defaultConfig?: ModelConfig;
  onConfigure: () => void;
  onTest: () => void;
  onReset: () => void;
  isTesting: boolean;
}

// Helper function to get agent icon based on type
const getAgentIcon = (agentKey: string) => {
  if (agentKey.includes('Code') || agentKey.includes('phase') || agentKey.includes('file')) return Code2;
  if (agentKey.includes('fast') || agentKey.includes('template')) return Zap;
  if (agentKey.includes('blueprint') || agentKey.includes('suggestion') || agentKey.includes('review')) return Brain;
  return Settings;
};

// Helper function to format parameter values for display
const formatParameterValue = (value: unknown, type: string): string | null => {
  if (value === null || value === undefined) return null;
  
  switch (type) {
    case 'temperature':
      return `T: ${value}`;
    case 'maxTokens':
      return typeof value === 'number' ? `${Math.round(value / 1000)}K tokens` : String(value);
    case 'reasoningEffort':
      return typeof value === 'string' ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : String(value);
    default:
      return String(value);
  }
};

export function ConfigCard({
  agent,
  userConfig,
  defaultConfig,
  onConfigure,
  onTest,
  onReset,
  isTesting
}: ConfigCardProps) {
  const isCustomized = userConfig?.isUserOverride || false;
  const currentModel = userConfig?.name || defaultConfig?.name;
  const modelDisplayName = getModelDisplayName(currentModel);
  const providerInfo = getProviderInfo(currentModel);
  const AgentIcon = getAgentIcon(agent.key);

  // Get current parameter values
  const temperature = userConfig?.temperature ?? defaultConfig?.temperature;
  const maxTokens = userConfig?.max_tokens ?? defaultConfig?.max_tokens;
  const reasoningEffort = userConfig?.reasoning_effort ?? defaultConfig?.reasoning_effort;

  return (
    <Card className={`h-full min-h-[280px] min-w-[280px] flex flex-col overflow-hidden transition-all dark:!bg-bg-3 !bg-bg-3 hover:shadow-md !border-bg-1/40`}>
      <CardHeader className="pb- flex-shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1 overflow-hidden">
            <div className="p-1.5 rounded-md bg-bg-3 shrink-0">
              <AgentIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1 overflow-hidden">
              <h5 className="font-medium text-md leading-tight mb-1 break-words" title={agent.name}>
                {agent.name}
              </h5>
              <p className="text-xs text-text-tertiary line-clamp-3 leading-tight overflow-hidden break-words" title={agent.description}>
                {agent.description}
              </p>
            </div>
          </div>
          
          <div className="shrink-0">
            <Badge 
              variant={isCustomized ? "default" : "outline"} 
              className="text-xs px-1.5 py-0.5 whitespace-nowrap dark:!bg-bg-1"
            >
              {isCustomized ? "Custom" : "Default"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 flex-1 flex flex-col justify-between overflow-hidden">
        <div className="space-y-3 overflow-hidden">
          {/* Current Model */}
          <div className="space-y-2 pl-7 mt-2">
            <div className="flex items-start justify-between gap-2 min-w-0">
              <span className="text-sm font-medium flex-1 min-w-0 break-words leading-tight" title={modelDisplayName}>
                {modelDisplayName}
              </span>
              <Badge 
                variant="secondary" 
                className={`text-xs shrink-0 px-1.5 py-0.5 mt-0.5 dark:contrast-50 ${providerInfo.color}`}
              >
                {providerInfo.name}
              </Badge>
            </div>
            
            {/* Parameter Summary - Contained within card bounds */}
            <div className="flex flex-wrap gap-1 overflow-hidden">
              {temperature !== null && temperature !== undefined ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs px-1.5 py-0.5 shrink-0 dark:bg-accent/20">
                        {formatParameterValue(temperature, 'temperature')}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Temperature: {temperature}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              
              {maxTokens ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs px-1.5 py-0.5 shrink-0 dark:bg-accent/20">
                        {formatParameterValue(maxTokens, 'maxTokens')}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Max Tokens: {maxTokens?.toLocaleString()}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              
              {reasoningEffort ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-xs px-1.5 py-0.5 shrink-0 dark:bg-accent/20">
                        {formatParameterValue(reasoningEffort, 'reasoningEffort')}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Reasoning Effort: {reasoningEffort}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </div>
          </div>
        </div>
        
        {/* Action Buttons - Fixed at bottom with proper containment */}
        <div className="flex gap-2 mt-3 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={onConfigure}
            className="flex-1 h-8 text-xs font-medium min-w-0 dark:bg-bg-2"
          >
            <Settings className="h-3 w-3 mr-1" />
            <span className="truncate">Configure</span>
          </Button>
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onTest}
                  disabled={isTesting}
                  className="h-8 w-8 p-0 shrink-0"
                >
                  {isTesting ? (
                    <Settings className="h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isTesting ? 'Testing...' : 'Test Config'}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {isCustomized && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onReset}
                    className="h-8 w-8 p-0 text-text-tertiary shrink-0"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset to Default</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  );
}