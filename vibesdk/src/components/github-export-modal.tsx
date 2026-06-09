import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    X, 
    Github, 
    Lock, 
    Globe, 
    Upload, 
    CheckCircle, 
    AlertCircle, 
    Loader
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

// Shared button styles
const BUTTON_STYLES = {
    primary: 'bg-brand hover:bg-brand/90 text-text-on-brand py-2 px-4 rounded-lg transition-colors',
    secondary: 'bg-bg-2 hover:bg-border text-text-primary py-2 px-4 rounded-lg transition-colors',
    ghost: 'bg-transparent hover:bg-bg-2 text-text-primary/60 hover:text-text-primary py-2 px-4 rounded-lg transition-colors',
    warning: 'bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-4 rounded-lg font-medium transition-colors',
    danger: 'bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-lg transition-colors'
} as const;

// Helper functions
const getInitialMode = (existingUrl: string | null | undefined): 'first_export' | 'sync' => 
    existingUrl ? 'sync' : 'first_export';

const extractRepoName = (url: string): string => url.split('/').pop() || '';

const generateRepoName = (appTitle?: string): string => {
    if (appTitle) {
        return appTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 100) || 'my-app';
    }
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    return `generated-app-${timestamp}`;
};

const createExportOptions = (repositoryName: string, isPrivate: boolean, description: string) => ({
    repositoryName: repositoryName.trim(),
    isPrivate,
    description: description.trim() || undefined
});

interface GitHubExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (options: {
        repositoryName: string;
        isPrivate: boolean;
        description?: string;
    }) => void;
    isExporting?: boolean;
    exportProgress?: {
        message: string;
        step: 'creating_repository' | 'uploading_files' | 'finalizing';
        progress: number;
    };
    exportResult?: {
        success: boolean;
        repositoryUrl?: string;
        error?: string;
        repositoryAlreadyExists?: boolean;
        existingRepositoryUrl?: string;
    };
    onRetry?: () => void;
    existingGithubUrl?: string | null;
    agentId?: string;
    appTitle?: string;
}

// Sub-components
const ModalHeader: React.FC<{ mode: string; existingUrl?: string | null; onClose: () => void; disabled?: boolean }> = 
    ({ mode, existingUrl, onClose, disabled }) => (
    <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
            <div className="p-2 bg-bg-2 rounded-lg">
                <Github className="w-5 h-5 text-text-secondary" />
            </div>
            <div>
                <h2 className="text-lg font-semibold text-text-secondary">
                    {mode === 'sync' ? 'Sync to GitHub' : 'Export to GitHub'}
                </h2>
                <p className="text-sm text-text-primary/60">
                    {mode === 'sync' && existingUrl
                        ? `Update ${extractRepoName(existingUrl)} with your latest changes`
                        : 'Create a new repository with your generated code'
                    }
                </p>
            </div>
        </div>
        {!disabled && (
            <button onClick={onClose} className="p-1 hover:bg-bg-2 rounded-md transition-colors">
                <X className="w-5 h-5 text-text-primary/60" />
            </button>
        )}
    </div>
);

const StatusMessage: React.FC<{ icon: React.ComponentType<any>; iconColor: string; title: string; message: string; children?: React.ReactNode }> = 
    ({ icon: Icon, iconColor, title, message, children }) => (
    <div className="text-center py-8">
        <Icon className={`w-12 h-12 ${iconColor} mx-auto mb-4`} />
        <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
        <p className="text-sm text-text-primary/60 mb-4">{message}</p>
        {children}
    </div>
);

const ProgressStep: React.FC<{ label: string; isActive: boolean; isComplete: boolean }> = 
    ({ label, isActive, isComplete }) => (
    <div className={`flex items-center gap-1 ${
        isActive ? 'text-brand' : isComplete ? 'text-green-500' : 'text-text-primary/40'
    }`}>
        <div className="w-2 h-2 rounded-full bg-current" />
        {label}
    </div>
);

const StatusIndicator: React.FC<{ type: 'success' | 'warning' | 'error'; message: string }> = 
    ({ type, message }) => {
    const colors = {
        success: 'text-green-500',
        warning: 'text-yellow-500',
        error: 'text-red-500'
    };
    const Icon = type === 'success' ? CheckCircle : AlertCircle;
    
    return (
        <div className={`flex items-center gap-1.5 text-xs ${colors[type]}`}>
            <Icon className="w-3.5 h-3.5" />
            {message}
        </div>
    );
};

export function GitHubExportModal({
    isOpen,
    onClose,
    onExport,
    isExporting = false,
    exportProgress,
    exportResult,
    onRetry,
    existingGithubUrl,
    agentId,
    appTitle
}: GitHubExportModalProps) {
    const [repositoryName, setRepositoryName] = useState('');
    const [description, setDescription] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [mode, setMode] = useState<'first_export' | 'sync' | 'change_repo'>(
        getInitialMode(existingGithubUrl)
    );
    const [remoteStatus, setRemoteStatus] = useState<{
        compatible: boolean;
        behindBy: number;
        aheadBy: number;
        divergedCommits: Array<{ sha: string; message: string; author: string; date: string }>;
    } | null>(null);
    const [showConflictWarning, setShowConflictWarning] = useState(false);
    const [isCheckingRemote, setIsCheckingRemote] = useState(false);
    const [lastExportSuccess, setLastExportSuccess] = useState<{
        repositoryUrl: string;
        timestamp: number;
    } | null>(null);

    React.useEffect(() => {
        if (isOpen) {
            setMode(getInitialMode(existingGithubUrl));
            setRepositoryName('');
        }
    }, [isOpen, existingGithubUrl, agentId]);

    React.useEffect(() => {
        if (exportResult?.success && exportResult.repositoryUrl) {
            setLastExportSuccess({
                repositoryUrl: exportResult.repositoryUrl,
                timestamp: Date.now()
            });
        }
    }, [exportResult]);

    const exportOptions = useMemo(() => 
        createExportOptions(repositoryName, isPrivate, description),
        [repositoryName, isPrivate, description]
    );

    const handleExport = useCallback(() => {
        onExport(exportOptions);
    }, [onExport, exportOptions]);

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (repositoryName.trim()) {
            handleExport();
        }
    }, [repositoryName, handleExport]);

    const handleClose = useCallback(() => {
        if (!isExporting) {
            setMode(getInitialMode(existingGithubUrl));
            setRepositoryName('');
            setDescription('');
            
            if (lastExportSuccess && Date.now() - lastExportSuccess.timestamp > 10000) {
                setLastExportSuccess(null);
            }
            
            onClose();
        }
    }, [isExporting, onClose, existingGithubUrl, lastExportSuccess]);

    React.useEffect(() => {
        if (isOpen && !repositoryName) {
            setRepositoryName(
                existingGithubUrl
                    ? extractRepoName(existingGithubUrl)
                    : generateRepoName(appTitle)
            );
        }
    }, [isOpen, repositoryName, existingGithubUrl, appTitle]);

    React.useEffect(() => {
        if (isOpen && mode === 'sync' && existingGithubUrl && agentId) {
            setIsCheckingRemote(true);
            setShowConflictWarning(false);
            setRemoteStatus(null);
            
            apiClient.checkRemoteStatus({
                repositoryUrl: existingGithubUrl,
                agentId
            })
            .then(response => {
                if (response.success && response.data) {
                    setRemoteStatus(response.data);
                    if (response.data.aheadBy > 0) {
                        setShowConflictWarning(true);
                    }
                }
            })
            .catch(error => {
                console.error('Failed to check remote status:', error);
            })
            .finally(() => {
                setIsCheckingRemote(false);
            });
        }
    }, [isOpen, mode, existingGithubUrl, agentId]);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={handleClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-bg-4 border border-border-primary rounded-xl max-w-md w-full p-6"
                    onClick={(e) => e.stopPropagation()}
                >
                    <ModalHeader 
                        mode={mode} 
                        existingUrl={existingGithubUrl} 
                        onClose={handleClose} 
                        disabled={isExporting} 
                    />

                    {showConflictWarning && remoteStatus && remoteStatus.aheadBy > 0 ? (
                        <div className="py-6">
                            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                            <h3 className="text-lg font-semibold text-text-primary mb-2 text-center">
                                Repository Has Different History
                            </h3>
                            <div className="text-sm text-text-primary/80 space-y-3">
                                <p>
                                    Remote has <strong>{remoteStatus.aheadBy} commit(s)</strong> not in your app.
                                    Your app has <strong>{remoteStatus.behindBy} commit(s)</strong> not on GitHub.
                                </p>
                                
                                {remoteStatus.divergedCommits.length > 0 && (
                                    <div>
                                        <p className="font-medium mb-2">Commits that will be lost:</p>
                                        <div className="bg-bg-2 rounded-lg p-3 max-h-32 overflow-y-auto space-y-2">
                                            {remoteStatus.divergedCommits.slice(0, 5).map((commit, i) => (
                                                <div key={i} className="text-xs">
                                                    <div className="font-medium">{commit.message}</div>
                                                    <div className="text-text-primary/50">
                                                        {commit.author} • {new Date(commit.date).toLocaleString()}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                                    <p className="text-yellow-600 dark:text-yellow-400 font-medium">
                                        ⚠️ Force pushing will replace GitHub's history with yours.
                                        This action cannot be undone.
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => {
                                        setShowConflictWarning(false);
                                        onClose();
                                    }}
                                    className={`flex-1 ${BUTTON_STYLES.secondary}`}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        setShowConflictWarning(false);
                                        handleExport();
                                    }}
                                    className={`flex-1 ${BUTTON_STYLES.warning}`}
                                >
                                    Force Push Anyway
                                </button>
                            </div>
                        </div>
                    ) : exportResult ? (
                        exportResult.success ? (
                            <StatusMessage
                                icon={CheckCircle}
                                iconColor="text-green-500"
                                title="Export Successful!"
                                message="Your code has been successfully exported to GitHub"
                            >
                                <a
                                    href={exportResult.repositoryUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-flex items-center gap-2 ${BUTTON_STYLES.secondary}`}
                                >
                                    <Github className="w-4 h-4" />
                                    View Repository
                                </a>
                            </StatusMessage>
                        ) : exportResult.repositoryAlreadyExists && exportResult.existingRepositoryUrl ? (
                            <StatusMessage
                                icon={AlertCircle}
                                iconColor="text-orange-500"
                                title="Repository Already Exists"
                                message="A repository with this name already exists on your GitHub account:"
                            >
                                    <a 
                                        href={exportResult.existingRepositoryUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-brand hover:underline mb-4 block break-all"
                                    >
                                        {exportResult.existingRepositoryUrl}
                                    </a>
                                    <p className="text-sm text-text-primary/60 mb-6">
                                        Would you like to sync your changes to this existing repository?
                                    </p>
                                <div className="space-x-2">
                                    <button onClick={handleExport} className={BUTTON_STYLES.primary}>
                                        Sync to Existing
                                    </button>
                                    <button onClick={onRetry || onClose} className={BUTTON_STYLES.secondary}>
                                        Change Name
                                    </button>
                                    <button onClick={onClose} className={BUTTON_STYLES.ghost}>
                                        Cancel
                                    </button>
                                </div>
                            </StatusMessage>
                        ) : (
                            <StatusMessage
                                icon={AlertCircle}
                                iconColor="text-red-500"
                                title="Export Failed"
                                message={exportResult.error || 'An error occurred during export'}
                            >
                                <div className="space-x-2">
                                    <button
                                        onClick={onRetry || (() => window.location.reload())}
                                        className={BUTTON_STYLES.secondary}
                                    >
                                        Try Again
                                    </button>
                                    <button onClick={onClose} className={BUTTON_STYLES.ghost}>
                                        Close
                                    </button>
                                </div>
                            </StatusMessage>
                        )
                    ) : isExporting && exportProgress ? (
                        <div className="py-8">
                            <div className="text-center mb-6">
                                <Loader className="w-8 h-8 text-brand mx-auto mb-4 animate-spin" />
                                <h3 className="text-lg font-semibold text-text-primary mb-2">Exporting to GitHub</h3>
                                <p className="text-sm text-text-primary/60">{exportProgress.message}</p>
                            </div>
                            
                            <div className="mb-4">
                                <div className="flex justify-between text-xs text-text-primary/60 mb-2">
                                    <span>Progress</span>
                                    <span>{exportProgress.progress}%</span>
                                </div>
                                <div className="w-full bg-bg-2 rounded-full h-2">
                                    <motion.div
                                        className="bg-brand h-2 rounded-full"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${exportProgress.progress}%` }}
                                        transition={{ duration: 0.5 }}
                                    />
                                </div>
                            </div>
                            
                            <div className="flex justify-between text-xs">
                                <ProgressStep 
                                    label="Creating Repository" 
                                    isActive={exportProgress.step === 'creating_repository'} 
                                    isComplete={exportProgress.progress > 30} 
                                />
                                <ProgressStep 
                                    label="Uploading Files" 
                                    isActive={exportProgress.step === 'uploading_files'} 
                                    isComplete={exportProgress.progress > 70} 
                                />
                                <ProgressStep 
                                    label="Finalizing" 
                                    isActive={exportProgress.step === 'finalizing'} 
                                    isComplete={exportProgress.progress > 90} 
                                />
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {mode === 'sync' && lastExportSuccess && !exportResult && (
                                <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-green-600 dark:text-green-400">
                                                Last sync successful
                                            </p>
                                            <a 
                                                href={lastExportSuccess.repositoryUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-xs text-green-600/80 dark:text-green-400/80 hover:underline break-all"
                                            >
                                                {lastExportSuccess.repositoryUrl}
                                            </a>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setLastExportSuccess(null)}
                                            className="text-green-600/60 hover:text-green-600 dark:text-green-400/60 dark:hover:text-green-400 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-text-primary mb-2">
                                    Repository Name *
                                </label>
                                <input
                                    type="text"
                                    value={repositoryName}
                                    onChange={(e) => setRepositoryName(e.target.value)}
                                    placeholder="my-awesome-app"
                                    className="w-full px-3 py-2 bg-bg-2 border border-border-primary rounded-lg text-text-primary placeholder:text-text-primary/40 focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand"
                                    required
                                />
                            </div>

                            {mode === 'sync' && existingGithubUrl && (
                                <div className="p-3 bg-bg-2 rounded-lg space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs font-medium text-text-primary/60">
                                            Remote Repository
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setMode('change_repo')}
                                            className="text-xs text-brand hover:text-brand/80 transition-colors"
                                        >
                                            Change
                                        </button>
                                    </div>
                                    
                                    <a 
                                        href={existingGithubUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-xs text-text-primary/60 hover:text-brand transition-colors break-all flex items-center gap-1"
                                    >
                                        <Github className="w-3 h-3 flex-shrink-0" />
                                        {existingGithubUrl}
                                    </a>

                                    {isCheckingRemote ? (
                                        <div className="flex items-center gap-2 text-xs text-text-primary/60 pt-1">
                                            <Loader className="w-3 h-3 animate-spin" />
                                            Checking sync status...
                                        </div>
                                    ) : remoteStatus ? (
                                        <div className="pt-1">
                                            {remoteStatus.compatible ? (
                                                remoteStatus.behindBy === 0 && remoteStatus.aheadBy === 0 ? (
                                                    <StatusIndicator type="success" message="Up to date" />
                                                ) : (
                                                    <div className="space-y-1">
                                                        {remoteStatus.behindBy > 0 && (
                                                            <StatusIndicator 
                                                                type="warning" 
                                                                message={`Local has ${remoteStatus.behindBy} unpushed commit${remoteStatus.behindBy !== 1 ? 's' : ''}`} 
                                                            />
                                                        )}
                                                        {remoteStatus.aheadBy > 0 && (
                                                            <StatusIndicator 
                                                                type="warning" 
                                                                message={`Remote has ${remoteStatus.aheadBy} newer commit${remoteStatus.aheadBy !== 1 ? 's' : ''}`} 
                                                            />
                                                        )}
                                                    </div>
                                                )
                                            ) : (
                                                <StatusIndicator 
                                                    type="error" 
                                                    message="Incompatible histories - force push required" 
                                                />
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            )}

                            
                            {mode !== 'sync' && (
                                <div>
                                    <label className="block text-sm font-medium text-text-primary mb-2">
                                        Description (Optional)
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="A brief description of your app..."
                                        rows={3}
                                        className="w-full px-3 py-2 bg-bg-2 border border-border-primary rounded-lg text-text-primary placeholder:text-text-primary/40 focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand resize-none"
                                    />
                                </div>
                            )}

                            {mode !== 'sync' && (
                                <div>
                                    <label className="block text-sm font-medium text-text-primary mb-3">
                                        Repository Privacy
                                    </label>
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-3 p-3 bg-bg-2 rounded-lg cursor-pointer hover:bg-border transition-colors">
                                            <input
                                                type="radio"
                                                name="privacy"
                                                checked={!isPrivate}
                                                onChange={() => setIsPrivate(false)}
                                                className="w-4 h-4 text-brand focus:ring-brand/50"
                                            />
                                            <Globe className="w-4 h-4 text-text-primary/60" />
                                            <div>
                                                <p className="text-sm font-medium text-text-secondary">Public</p>
                                                <p className="text-xs text-text-primary/60">Anyone can see this repository</p>
                                            </div>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 bg-bg-2 rounded-lg cursor-pointer hover:bg-border transition-colors">
                                            <input
                                                type="radio"
                                                name="privacy"
                                                checked={isPrivate}
                                                onChange={() => setIsPrivate(true)}
                                                className="w-4 h-4 text-brand focus:ring-brand/50"
                                            />
                                            <Lock className="w-4 h-4 text-text-primary/60" />
                                            <div>
                                                <p className="text-sm font-medium text-text-secondary">Private</p>
                                                <p className="text-xs text-text-primary/60">Only you can see this repository</p>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={handleClose} className={`flex-1 ${BUTTON_STYLES.secondary}`}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!repositoryName.trim() || isExporting}
                                    className={`flex-1 ${BUTTON_STYLES.primary} disabled:bg-brand/50 flex items-center justify-center gap-2`}
                                >
                                    <Upload className="w-4 h-4" />
                                    {mode === 'sync' ? 'Sync to GitHub' : 'Export to GitHub'}
                                </button>
                            </div>
                        </form>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}