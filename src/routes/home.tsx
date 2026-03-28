import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { ArrowUp, Mic, Github, GitFork, ChevronDown, Paperclip, Sparkles, Settings, Bot, MonitorSmartphone, Smartphone, LayoutTemplate, Headphones } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/contexts/auth-context';
import { MAX_AGENT_QUERY_LENGTH, SUPPORTED_IMAGE_MIME_TYPES, type ProjectType } from '@/api-types';
import { useFeature } from '@/features';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { usePaginatedApps } from '@/hooks/use-paginated-apps';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { AppCard } from '@/components/shared/AppCard';
import clsx from 'clsx';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useDragDrop } from '@/hooks/use-drag-drop';
import { ImageAttachmentPreview } from '@/components/image-attachment-preview';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { MatrixBackground } from '@/components/matrix-background';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MODEL_OPTIONS = [
  { id: 'e1', label: 'E-1', sublabel: 'Lite', description: 'Fast, lightweight agent for simple tasks' },
  { id: 'e1.5', label: 'E-1.5', sublabel: 'Standard', description: 'Balanced performance and quality' },
  { id: 'e2', label: 'E-2', sublabel: 'Ultra', description: 'Maximum capability for complex projects' },
] as const;

const LLM_PROVIDERS = [
  { id: 'gemini', label: 'Gemini Pro', icon: '✦' },
  { id: 'claude', label: 'Claude 4.5 Opus', icon: '✳' },
  { id: 'gpt', label: 'GPT-5.2', icon: '◈' },
] as const;

const TAB_OPTIONS = [
  { id: 'app' as ProjectType, label: 'Full Stack App', icon: MonitorSmartphone },
  { id: 'general' as ProjectType, label: 'Mobile App', icon: Smartphone },
  { id: 'presentation' as ProjectType, label: 'Landing Page', icon: LayoutTemplate },
];

export default function Home() {
  const navigate = useNavigate();
  const { requireAuth } = useAuthGuard();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projectMode, setProjectMode] = useState<ProjectType>('app');
  const [query, setQuery] = useState('');
  const [selectedModel, setSelectedModel] = useState('e1');
  const [selectedProvider, setSelectedProvider] = useState('gemini');
  const [ultraMode, setUltraMode] = useState(false);
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [githubRepoName, setGithubRepoName] = useState('');
  const [githubRepoDesc, setGithubRepoDesc] = useState('');
  const [githubIsPrivate, setGithubIsPrivate] = useState(false);
  const [forkDialogOpen, setForkDialogOpen] = useState(false);
  const [forkAppId, setForkAppId] = useState('');
  const { isAuthenticated } = useAuth();
  const { isLoadingCapabilities, capabilities, getEnabledFeatures } = useFeature();

  const modeOptions = useMemo(() => {
    if (isLoadingCapabilities || !capabilities) return [];
    return getEnabledFeatures().map((def) => def.id);
  }, [capabilities, getEnabledFeatures, isLoadingCapabilities]);

  useEffect(() => {
    if (isLoadingCapabilities) return;
    if (modeOptions.length === 0) {
      if (projectMode !== 'app') setProjectMode('app');
      return;
    }
    if (!modeOptions.includes(projectMode)) {
      setProjectMode(modeOptions[0]);
    }
  }, [isLoadingCapabilities, modeOptions, projectMode]);

  const { images, addImages, removeImage, clearImages, isProcessing } = useImageUpload({
    onError: (error) => toast.error(error),
  });

  const { isDragging, dragHandlers } = useDragDrop({
    onFilesDropped: addImages,
    accept: [...SUPPORTED_IMAGE_MIME_TYPES],
  });

  const { apps, loading } = usePaginatedApps({
    type: 'public',
    defaultSort: 'popular',
    defaultPeriod: 'week',
    limit: 6,
  });

  const discoverReady = useMemo(() => !loading && (apps?.length ?? 0) > 5, [loading, apps]);

  const handleCreateApp = useCallback((query: string, mode: ProjectType) => {
    if (query.length > MAX_AGENT_QUERY_LENGTH) {
      toast.error(`Prompt too large (${query.length} characters). Max ${MAX_AGENT_QUERY_LENGTH}.`);
      return;
    }
    const encodedQuery = encodeURIComponent(query);
    const encodedMode = encodeURIComponent(mode);
    const imageParam = images.length > 0 ? `&images=${encodeURIComponent(JSON.stringify(images))}` : '';
    const intendedUrl = `/chat/new?query=${encodedQuery}&projectType=${encodedMode}${imageParam}`;

    if (!requireAuth({ requireFullAuth: true, actionContext: 'to create applications', intendedUrl })) return;
    navigate(intendedUrl);
    clearImages();
  }, [images, requireAuth, navigate, clearImages]);

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 300) + 'px';
    }
  };

  useEffect(() => { adjustTextareaHeight(); }, []);

  const handleFileClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) addImages(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleVoiceInput = () => toast.info('Voice input coming soon');

  const handleGitHubSave = useCallback(() => {
    if (!requireAuth({ requireFullAuth: true, actionContext: 'to save to GitHub' })) return;
    setGithubDialogOpen(true);
  }, [requireAuth]);

  const handleGitHubExport = useCallback(async () => {
    if (!githubRepoName.trim()) { toast.error('Repository name is required'); return; }
    try { apiClient.initiateGitHubOAuth(); } catch { toast.error('Failed to connect to GitHub.'); }
    setGithubDialogOpen(false);
  }, [githubRepoName]);

  const handleForkClick = useCallback(() => {
    if (!requireAuth({ requireFullAuth: true, actionContext: 'to fork a project' })) return;
    setForkDialogOpen(true);
  }, [requireAuth]);

  const handleForkApp = useCallback(async () => {
    if (!forkAppId.trim()) { toast.error('App ID is required'); return; }
    try {
      const response = await apiClient.forkApp(forkAppId);
      if (response.success && response.data) {
        toast.success('App forked successfully!');
        navigate(`/chat/${response.data.forkedAppId}`);
      } else {
        toast.error('Failed to fork app');
      }
    } catch { toast.error('Failed to fork app. Make sure the App ID is valid.'); }
    setForkDialogOpen(false);
    setForkAppId('');
  }, [forkAppId, navigate]);

  const currentModel = MODEL_OPTIONS.find(m => m.id === selectedModel) || MODEL_OPTIONS[0];
  const currentProvider = LLM_PROVIDERS.find(p => p.id === selectedProvider) || LLM_PROVIDERS[0];

  return (
    <div className="relative flex flex-col items-center min-h-[calc(100vh-60px)] w-full overflow-hidden bg-gray-50 dark:bg-[#0a0a0a]" data-testid="home-page">
      {/* Matrix Background */}
      <div className="absolute inset-0 z-0">
        <MatrixBackground />
      </div>

      <LayoutGroup>
        {/* Hero Section */}
        <motion.div
          layout
          transition={{ layout: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }}
          className={clsx(
            "relative z-10 flex flex-col items-center w-full max-w-3xl mx-auto px-4",
            discoverReady ? "mt-28" : "mt-[18vh] sm:mt-[22vh]"
          )}
        >
          {/* Heading */}
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter text-center mb-8 text-teal-700 dark:text-cyan-400 dark:drop-shadow-[0_0_20px_rgba(34,211,238,0.35)]"
            data-testid="home-heading"
          >
            What will you build today?
          </h1>

          {/* Prompt Interface */}
          <form
            method="POST"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateApp(textareaRef.current!.value, projectMode);
            }}
            className="w-full flex flex-col gap-2 relative"
            data-testid="prompt-form"
          >
            {/* Tab Bar */}
            <div className="flex flex-row self-start gap-1 p-1 rounded-full bg-black/5 dark:bg-white/[0.04] border border-black/10 dark:border-white/[0.08] backdrop-blur-md" data-testid="project-type-tabs">
              {TAB_OPTIONS.map((tab) => {
                const Icon = tab.icon;
                const isActive = projectMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setProjectMode(tab.id)}
                    className={clsx(
                      "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-black/10 dark:bg-white/10 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    )}
                    data-testid={`tab-${tab.id}`}
                  >
                    <Icon className="size-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Main Card */}
            <div
              className={clsx(
                "w-full rounded-2xl backdrop-blur-2xl shadow-xl flex flex-col overflow-hidden transition-all duration-300",
                "bg-white/80 border border-black/10 dark:bg-zinc-900/60 dark:border-white/[0.08]",
                isDragging && "ring-2 ring-cyan-400 dark:ring-cyan-400"
              )}
              {...dragHandlers}
              data-testid="prompt-card"
            >
              {isDragging && (
                <div className="absolute inset-0 flex items-center justify-center bg-cyan-400/10 backdrop-blur-sm rounded-2xl z-30 pointer-events-none">
                  <p className="text-cyan-600 dark:text-cyan-400 font-medium">Drop files here</p>
                </div>
              )}

              {/* Textarea */}
              <textarea
                className="w-full min-h-[140px] bg-transparent p-6 text-base sm:text-lg outline-none resize-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
                name="query"
                value={query}
                placeholder="Build me a clone of netflix..."
                ref={textareaRef}
                onChange={(e) => { setQuery(e.target.value); adjustTextareaHeight(); }}
                onInput={adjustTextareaHeight}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCreateApp(textareaRef.current!.value, projectMode);
                  }
                }}
                data-testid="prompt-textarea"
              />

              {images.length > 0 && (
                <div className="px-6 pb-2">
                  <ImageAttachmentPreview images={images} onRemove={removeImage} />
                </div>
              )}

              {/* Bottom Toolbar */}
              <div className="flex flex-row items-center justify-between px-3 py-2.5 bg-black/[0.03] dark:bg-black/40 border-t border-black/5 dark:border-white/5">
                {/* Left Controls */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {/* Attach */}
                  <input ref={fileInputRef} type="file" accept={SUPPORTED_IMAGE_MIME_TYPES.join(',')} multiple onChange={handleFileChange} className="hidden" disabled={isProcessing} />
                  <button
                    type="button"
                    onClick={handleFileClick}
                    disabled={isProcessing}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5 text-gray-600 dark:text-gray-300 transition-colors"
                    title="Attach files"
                    data-testid="attach-btn"
                  >
                    <Paperclip className="size-3.5" />
                  </button>

                  {/* Voice/Headphones dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5 text-gray-600 dark:text-gray-300 text-sm transition-colors"
                        data-testid="voice-dropdown-btn"
                      >
                        <Headphones className="size-3.5" />
                        <ChevronDown className="size-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuItem onClick={handleVoiceInput} data-testid="voice-option-stt">
                        <Mic className="size-4 mr-2" /> Speech to Text
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid="voice-option-tts">
                        <Headphones className="size-4 mr-2" /> Text to Speech
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Model Selector */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5 text-gray-700 dark:text-gray-200 text-sm font-medium transition-colors"
                        data-testid="model-selector-btn"
                      >
                        <Bot className="size-3.5" />
                        <span>{currentModel.label}</span>
                        <ChevronDown className="size-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      {MODEL_OPTIONS.map((model) => (
                        <DropdownMenuItem
                          key={model.id}
                          onClick={() => setSelectedModel(model.id)}
                          className={clsx(selectedModel === model.id && "bg-accent/10")}
                          data-testid={`model-option-${model.id}`}
                        >
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{model.label}</span>
                              <span className="text-xs text-gray-500">{model.sublabel}</span>
                            </div>
                            <span className="text-xs text-gray-500">{model.description}</span>
                          </div>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Ultra Toggle */}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/[0.06] border border-black/5 dark:border-white/5">
                    <Sparkles className="size-3.5 text-gray-600 dark:text-gray-300" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200 hidden sm:inline">Ultra</span>
                    <Switch
                      checked={ultraMode}
                      onCheckedChange={setUltraMode}
                      className="scale-90"
                      data-testid="ultra-toggle"
                    />
                  </div>

                  {/* LLM Provider Selector */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10 border border-black/5 dark:border-white/5 text-gray-700 dark:text-gray-200 text-sm font-medium transition-colors"
                        data-testid="provider-selector-btn"
                      >
                        <span className="text-base leading-none">{currentProvider.icon}</span>
                        <span className="hidden sm:inline">{currentProvider.label}</span>
                        <ChevronDown className="size-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      {LLM_PROVIDERS.map((provider) => (
                        <DropdownMenuItem
                          key={provider.id}
                          onClick={() => setSelectedProvider(provider.id)}
                          className={clsx(selectedProvider === provider.id && "bg-accent/10")}
                          data-testid={`provider-option-${provider.id}`}
                        >
                          <span className="text-base mr-2">{provider.icon}</span>
                          <span>{provider.label}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Right Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Settings */}
                  <button
                    type="button"
                    onClick={() => toast.info('Settings panel coming soon')}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 transition-colors"
                    data-testid="settings-btn"
                  >
                    <Settings className="size-4" />
                  </button>

                  {/* Mic */}
                  <button
                    type="button"
                    onClick={handleVoiceInput}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-black/5 dark:bg-white/[0.06] hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 transition-colors"
                    title="Voice input"
                    data-testid="voice-btn"
                  >
                    <Mic className="size-4" />
                  </button>

                  {/* Send */}
                  <button
                    type="submit"
                    disabled={!query.trim()}
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-700 dark:bg-cyan-400 text-white dark:text-black hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed ml-1"
                    data-testid="send-btn"
                  >
                    <ArrowUp className="size-4" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* Attachment hint */}
          <AnimatePresence>
            {images.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full mt-3"
              >
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-white/50 dark:bg-white/[0.03] border border-black/10 dark:border-white/[0.08]">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Attachments:</span> Files guide app layout and design but may not be replicated exactly.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Community Apps */}
        <AnimatePresence>
          {discoverReady && (
            <motion.section
              key="discover-section"
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="relative z-10 w-full max-w-4xl mx-auto px-4 mt-12 mb-8"
              data-testid="discover-section"
            >
              <div className="flex flex-col items-start">
                <h2 className="text-base font-medium text-gray-600 dark:text-gray-400 mb-1">Discover Apps built by the community</h2>
                <div
                  className="text-sm text-gray-500 dark:text-gray-500 hover:underline underline-offset-4 cursor-pointer mb-4"
                  onClick={() => navigate('/discover')}
                  data-testid="view-all-link"
                >
                  View All
                </div>
                <motion.div
                  layout
                  transition={{ duration: 0.4 }}
                  className="grid grid-cols-2 xl:grid-cols-3 gap-4 w-full"
                >
                  <AnimatePresence mode="popLayout">
                    {apps.map(app => (
                      <AppCard
                        key={app.id}
                        app={app}
                        onClick={() => navigate(`/app/${app.id}`)}
                        showStats={true}
                        showUser={true}
                        showActions={false}
                      />
                    ))}
                  </AnimatePresence>
                </motion.div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </LayoutGroup>

      {/* GitHub Save Dialog */}
      <Dialog open={githubDialogOpen} onOpenChange={setGithubDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="github-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Github className="size-5" />
              Save to GitHub
            </DialogTitle>
            <DialogDescription>
              Connect your GitHub account to save and sync your project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="repo-name">Repository Name</Label>
              <Input id="repo-name" placeholder="my-vibesdk-project" value={githubRepoName} onChange={(e) => setGithubRepoName(e.target.value)} data-testid="github-repo-name-input" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="repo-desc">Description (optional)</Label>
              <Input id="repo-desc" placeholder="Built with VibeSDK" value={githubRepoDesc} onChange={(e) => setGithubRepoDesc(e.target.value)} data-testid="github-repo-desc-input" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="private-repo" checked={githubIsPrivate} onChange={(e) => setGithubIsPrivate(e.target.checked)} className="rounded border-gray-300" data-testid="github-private-checkbox" />
              <Label htmlFor="private-repo" className="text-sm font-normal">Make repository private</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGithubDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleGitHubExport} disabled={!githubRepoName.trim()} data-testid="github-connect-btn">
              <Github className="size-4 mr-2" /> Connect GitHub
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fork Dialog */}
      <Dialog open={forkDialogOpen} onOpenChange={setForkDialogOpen}>
        <DialogContent className="sm:max-w-md" data-testid="fork-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitFork className="size-5" />
              Fork a Project
            </DialogTitle>
            <DialogDescription>
              Enter the App ID of a public project to fork it into your workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="fork-id">App ID</Label>
              <Input id="fork-id" placeholder="Enter app ID to fork..." value={forkAppId} onChange={(e) => setForkAppId(e.target.value)} data-testid="fork-app-id-input" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForkDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleForkApp} disabled={!forkAppId.trim()} data-testid="fork-submit-btn">
              <GitFork className="size-4 mr-2" /> Fork Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
