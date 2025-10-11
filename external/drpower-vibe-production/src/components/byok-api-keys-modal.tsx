/**
 * Enhanced BYOK API Keys Modal with Two-Tab Layout
 * Tab 1: Add new keys
 * Tab 2: Manage existing keys with toggle/delete functionality
 */

import { useState, useEffect } from 'react';
import { Key, Check, AlertCircle, Loader2, Plus, Settings, Trash2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import type { SecretTemplate } from '@/api-types';

// Import provider logos
import OpenAILogo from '@/assets/provider-logos/openai.svg?react';
import AnthropicLogo from '@/assets/provider-logos/anthropic.svg?react';
import GoogleLogo from '@/assets/provider-logos/google.svg?react';
import CerebrasLogo from '@/assets/provider-logos/cerebras.svg?react';
import CloudflareLogo from '@/assets/provider-logos/cloudflare.svg?react';

interface ByokApiKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyAdded?: () => void;
}

interface ManagedSecret {
  id: string;
  name: string;
  provider: string;
  keyPreview: string;
  isActive: boolean;
  lastUsed: string | null;
  createdAt: string;
  logo: React.ComponentType<{ className?: string }>;
}

// Logo mapping for dynamic provider support
const PROVIDER_LOGOS: Record<string, React.ComponentType<{ className?: string }>> = {
  openai: OpenAILogo,
  anthropic: AnthropicLogo,
  'google-ai-studio': GoogleLogo,
  cerebras: CerebrasLogo,
};

interface BYOKProvider {
  id: string;
  name: string;
  provider: string;
  logo: React.ComponentType<{ className?: string }>;
  placeholder: string;
  validation: RegExp;
}

/**
 * Convert BYOK template to provider configuration
 */
function templateToBYOKProvider(template: SecretTemplate): BYOKProvider {
  const logo = PROVIDER_LOGOS[template.provider] || (() => <div className="w-4 h-4 bg-gray-300 rounded" />);
  
  return {
    id: template.id,
    name: template.displayName.replace(' (BYOK)', ''),
    provider: template.provider,
    logo,
    placeholder: template.placeholder,
    validation: new RegExp(template.validation),
  };
}

export function ByokApiKeysModal({ isOpen, onClose, onKeyAdded }: ByokApiKeysModalProps) {
  // Tab management
  const [activeTab, setActiveTab] = useState<'add' | 'manage'>('add');
  
  // Add keys tab state
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [byokProviders, setBYOKProviders] = useState<BYOKProvider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Manage keys tab state
  const [managedSecrets, setManagedSecrets] = useState<ManagedSecret[]>([]);
  const [loadingSecrets, setLoadingSecrets] = useState(false);
  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [secretToDelete, setSecretToDelete] = useState<ManagedSecret | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get selected provider details
  const provider = byokProviders.find(p => p.id === selectedProvider);

  // Load BYOK templates and existing secrets when modal opens
  useEffect(() => {
    if (isOpen) {
      // Reset add keys tab
      setSelectedProvider(null);
      setApiKey('');
      setIsSaving(false);
      
      // Reset manage keys tab
      setToggleLoadingId(null);
      setDeleteDialogOpen(false);
      setSecretToDelete(null);
      setIsDeleting(false);
      
      // Load data
      loadBYOKProviders();
      loadManagedSecrets();
    }
  }, [isOpen]);

  const loadBYOKProviders = async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.getBYOKTemplates();
      
      if (response.success && response.data) {
        const providers = response.data.templates.map(templateToBYOKProvider);
        setBYOKProviders(providers);
      } else {
        toast.error('Failed to load BYOK providers');
      }
    } catch (error) {
      console.error('Error loading BYOK templates:', error);
      toast.error('Failed to load BYOK providers');
    } finally {
      setIsLoading(false);
    }
  };

  const loadManagedSecrets = async () => {
    try {
      setLoadingSecrets(true);
      const response = await apiClient.getAllSecrets(); // Use getAllSecrets for toggle functionality
      
      if (response.success && response.data) {
        // Filter BYOK secrets only (show both active and inactive for management)
        const byokSecrets = response.data.secrets.filter(secret => 
          secret.secretType.endsWith('_BYOK')
        );
        
        // Convert to ManagedSecret format with logos
        const managedSecrets: ManagedSecret[] = byokSecrets.map(secret => {
          const logo = PROVIDER_LOGOS[secret.provider] || (() => <div className="w-4 h-4 bg-gray-300 rounded" />);
          
          return {
            id: secret.id,
            name: secret.name,
            provider: secret.provider,
            keyPreview: secret.keyPreview,
            isActive: secret.isActive ?? false,
            lastUsed: secret.lastUsed ? secret.lastUsed.toString() : null,
            createdAt: secret.createdAt?.toString() ?? '',
            logo
          };
        });
        
        setManagedSecrets(managedSecrets);
      } else {
        toast.error('Failed to load managed secrets');
      }
    } catch (error) {
      console.error('Error loading managed secrets:', error);
      toast.error('Failed to load managed secrets');
    } finally {
      setLoadingSecrets(false);
    }
  };

  // Handle provider selection
  const handleProviderSelect = (providerId: string) => {
    setSelectedProvider(providerId);
    setApiKey('');
  };

  // Validate key format
  const isKeyFormatValid = provider && apiKey && provider.validation.test(apiKey);

  // Save API key
  const handleSaveKey = async () => {
    if (!provider || !apiKey || !isKeyFormatValid) return;

    setIsSaving(true);

    try {
      await apiClient.storeSecret({
        templateId: provider.id,
        value: apiKey.trim(),
        environment: 'production'
      });

      toast.success(`${provider.name} API key added successfully!`);
      onKeyAdded?.();
      
      // Reload managed secrets and switch to manage tab
      await loadManagedSecrets();
      setActiveTab('manage');
      
      // Reset add form
      setSelectedProvider(null);
      setApiKey('');
    } catch (error) {
      console.error('Failed to save API key:', error);
      toast.error('Failed to save API key. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Toggle secret active status
  const handleToggleSecret = async (secretId: string) => {
    setToggleLoadingId(secretId);
    
    try {
      const response = await apiClient.toggleSecret(secretId);
      
      if (response.success && response.data) {
        const updatedSecret = response.data.secret;
        toast.success(response.data.message);
        
        // Update local state
        setManagedSecrets(prev => 
          prev.map(secret => 
            secret.id === secretId 
              ? { ...secret, isActive: updatedSecret.isActive ?? false }
              : secret
          )
        );
        
        // Notify parent about key changes
        onKeyAdded?.();
      } else {
        toast.error('Failed to toggle secret status');
      }
    } catch (error) {
      console.error('Error toggling secret:', error);
      toast.error('Failed to toggle secret status');
    } finally {
      setToggleLoadingId(null);
    }
  };
  
  // Delete secret
  const handleDeleteSecret = async () => {
    if (!secretToDelete) return;
    
    setIsDeleting(true);
    
    try {
      await apiClient.deleteSecret(secretToDelete.id);
      toast.success(`${secretToDelete.name} API key deleted successfully`);
      
      // Remove from local state
      setManagedSecrets(prev => 
        prev.filter(secret => secret.id !== secretToDelete.id)
      );
      
      // Notify parent about key changes
      onKeyAdded?.();
      
      // Close dialog
      setDeleteDialogOpen(false);
      setSecretToDelete(null);
    } catch (error) {
      console.error('Error deleting secret:', error);
      toast.error('Failed to delete API key');
    } finally {
      setIsDeleting(false);
    }
  };
  
  const openDeleteDialog = (secret: ManagedSecret) => {
    setSecretToDelete(secret);
    setDeleteDialogOpen(true);
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Bring Your Own Key
              <span className="flex items-center gap-1 text-xs text-text-tertiary font-normal">
                via <CloudflareLogo className="h-3 w-3" /> AI Gateway
              </span>
            </DialogTitle>
            <DialogDescription>
              Add your API keys to use your own provider accounts for billing, or manage existing keys
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'add' | 'manage')} className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="add" className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Keys
              </TabsTrigger>
              <TabsTrigger value="manage" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Manage Keys
              </TabsTrigger>
            </TabsList>

            {/* Add Keys Tab */}
            <TabsContent value="add" className="space-y-6">
              {/* Provider Selection - Clean List */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Select Provider</Label>
                {isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-gray-200">
                        <div className="w-8 h-8 bg-gray-200 rounded-md animate-pulse" />
                        <div className="h-4 bg-gray-200 rounded animate-pulse flex-1" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {byokProviders.map((providerOption) => {
                      const LogoComponent = providerOption.logo;
                      const isSelected = selectedProvider === providerOption.id;
                      return (
                        <button
                          key={providerOption.id}
                          onClick={() => handleProviderSelect(providerOption.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all duration-200 text-left ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-center w-8 h-8 bg-white rounded-md border shadow-sm">
                            <LogoComponent className="h-5 w-5" />
                          </div>
                          <span className="font-medium">{providerOption.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* API Key Input - Smooth Expansion */}
              {selectedProvider && provider && (
                <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                  <Label htmlFor="apiKey" className="text-sm font-medium">
                    Enter your {provider.name} API key
                  </Label>
                  <div className="relative">
                    <Input
                      id="apiKey"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={provider.placeholder}
                      className={`pr-10 ${
                        apiKey 
                          ? isKeyFormatValid 
                            ? 'border-green-500 focus:border-green-500' 
                            : 'border-red-500 focus:border-red-500'
                          : ''
                      }`}
                    />
                    {apiKey && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {isKeyFormatValid ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    )}
                  </div>
                  {apiKey && !isKeyFormatValid && (
                    <p className="text-xs text-red-600">
                      Invalid format. Expected: {provider.placeholder}
                    </p>
                  )}
                </div>
              )}
            </TabsContent>

            {/* Manage Keys Tab */}
            <TabsContent value="manage" className="space-y-4">
              {loadingSecrets ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-4 p-4 rounded-lg border">
                      <div className="w-8 h-8 bg-gray-200 rounded-md animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded animate-pulse w-1/3" />
                        <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
                      </div>
                      <div className="w-12 h-6 bg-gray-200 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : managedSecrets.length === 0 ? (
                <div className="text-center py-8 text-text-tertiary">
                  <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">No API keys configured</p>
                  <p className="text-sm">Add your first API key using the "Add Keys" tab</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Your API Keys</Label>
                    <Badge variant="secondary">
                      {managedSecrets.filter(s => s.isActive).length} active, {managedSecrets.length} total
                    </Badge>
                  </div>
                  
                  <div className="space-y-3">
                    {managedSecrets.map((secret) => {
                      const LogoComponent = secret.logo;
                      const isTogglingThis = toggleLoadingId === secret.id;
                      
                      return (
                        <div key={secret.id} className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                          secret.isActive 
                            ? 'hover:bg-bg-3/50' 
                            : 'bg-bg-3/20 border-dashed hover:bg-bg-3/30'
                        }`}>
                          {/* Provider Logo */}
                          <div className={`flex items-center justify-center w-8 h-8 rounded-md border shadow-sm ${
                            secret.isActive 
                              ? 'bg-white' 
                              : 'bg-bg-3 border-dashed opacity-60'
                          }`}>
                            <LogoComponent className={`h-5 w-5 ${secret.isActive ? '' : 'opacity-60'}`} />
                          </div>
                          
                          {/* Key Info */}
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium capitalize ${
                                secret.isActive ? '' : 'opacity-60'
                              }`}>
                                {secret.name.replace(' (BYOK)', '')}
                              </span>
                              <Badge 
                                variant={secret.isActive ? "default" : "outline"}
                                className={`text-xs ${secret.isActive ? '' : 'opacity-60'}`}
                              >
                                {secret.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-text-tertiary">
                              <div className="flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                <span>{secret.keyPreview}</span>
                              </div>
                              <Separator orientation="vertical" className="h-3" />
                              <span>Added {formatDate(secret.createdAt)}</span>
                              {secret.lastUsed && (
                                <>
                                  <Separator orientation="vertical" className="h-3" />
                                  <span>Last used {formatDate(secret.lastUsed)}</span>
                                </>
                              )}
                            </div>
                          </div>
                          
                          {/* Controls */}
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <Switch 
                                checked={secret.isActive}
                                onCheckedChange={() => handleToggleSecret(secret.id)}
                                disabled={isTogglingThis}
                              />
                              {isTogglingThis && (
                                <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />
                              )}
                            </div>
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(secret)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {activeTab === 'add' && selectedProvider && (
              <Button 
                onClick={handleSaveKey}
                disabled={!apiKey || !isKeyFormatValid || isSaving}
                className="gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add Key
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the {secretToDelete?.name} API key? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteSecret}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete Key'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}