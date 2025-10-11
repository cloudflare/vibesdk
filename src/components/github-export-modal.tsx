import React, { useState, useCallback } from 'react';
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
    };
    onRetry?: () => void;
}

export function GitHubExportModal({
    isOpen,
    onClose,
    onExport,
    isExporting = false,
    exportProgress,
    exportResult,
    onRetry
}: GitHubExportModalProps) {
    const [repositoryName, setRepositoryName] = useState('');
    const [description, setDescription] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        
        if (!repositoryName.trim()) {
            return;
        }

        // Always call onExport - the parent component will handle OAuth flow
        onExport({
            repositoryName: repositoryName.trim(),
            isPrivate,
            description: description.trim() || undefined
        });
    }, [repositoryName, description, isPrivate, onExport]);

    const handleClose = useCallback(() => {
        if (!isExporting) {
            onClose();
        }
    }, [isExporting, onClose]);

    // Auto-generate repository name based on current timestamp
    React.useEffect(() => {
        if (isOpen && !repositoryName) {
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
            setRepositoryName(`generated-app-${timestamp}`);
        }
    }, [isOpen, repositoryName]);

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
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-bg-2 rounded-lg">
                                <Github className="w-5 h-5 text-text-secondary" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-text-secondary">Export to GitHub</h2>
                                <p className="text-sm text-text-primary/60">Create a new repository with your generated code</p>
                            </div>
                        </div>
                        {!isExporting && (
                            <button
                                onClick={handleClose}
                                className="p-1 hover:bg-bg-2 rounded-md transition-colors"
                            >
                                <X className="w-5 h-5 text-text-primary/60" />
                            </button>
                        )}
                    </div>

                    {/* Content */}
                    {exportResult ? (
                        /* Export Result */
                        <div className="text-center py-8">
                            {exportResult.success ? (
                                <div>
                                    <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold text-text-primary mb-2">Export Successful!</h3>
                                    <p className="text-sm text-text-primary/60 mb-4">
                                        Your code has been successfully exported to GitHub
                                    </p>
                                    <a
                                        href={exportResult.repositoryUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 bg-bg-2 hover:bg-border text-text-primary py-2 px-4 rounded-lg transition-colors"
                                    >
                                        <Github className="w-4 h-4" />
                                        View Repository
                                    </a>
                                </div>
                            ) : (
                                <div>
                                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                                    <h3 className="text-lg font-semibold text-text-primary mb-2">Export Failed</h3>
                                    <p className="text-sm text-text-primary/60 mb-4">
                                        {exportResult.error || 'An error occurred during export'}
                                    </p>
                                    <div className="space-x-2">
                                        <button
                                            onClick={onRetry || (() => window.location.reload())}
                                            className="bg-bg-2 hover:bg-border text-text-primary py-2 px-4 rounded-lg transition-colors"
                                        >
                                            Try Again
                                        </button>
                                        <button
                                            onClick={onClose}
                                            className="bg-transparent hover:bg-bg-2 text-text-primary/60 hover:text-text-primary py-2 px-4 rounded-lg transition-colors"
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : isExporting && exportProgress ? (
                        /* Export Progress */
                        <div className="py-8">
                            <div className="text-center mb-6">
                                <Loader className="w-8 h-8 text-brand mx-auto mb-4 animate-spin" />
                                <h3 className="text-lg font-semibold text-text-primary mb-2">Exporting to GitHub</h3>
                                <p className="text-sm text-text-primary/60">{exportProgress.message}</p>
                            </div>
                            
                            {/* Progress Bar */}
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
                            
                            {/* Step Indicators */}
                            <div className="flex justify-between text-xs">
                                <div className={`flex items-center gap-1 ${
                                    exportProgress.step === 'creating_repository' ? 'text-brand' : 
                                    exportProgress.progress > 30 ? 'text-green-500' : 'text-text-primary/40'
                                }`}>
                                    <div className="w-2 h-2 rounded-full bg-current" />
                                    Creating Repository
                                </div>
                                <div className={`flex items-center gap-1 ${
                                    exportProgress.step === 'uploading_files' ? 'text-brand' : 
                                    exportProgress.progress > 70 ? 'text-green-500' : 'text-text-primary/40'
                                }`}>
                                    <div className="w-2 h-2 rounded-full bg-current" />
                                    Uploading Files
                                </div>
                                <div className={`flex items-center gap-1 ${
                                    exportProgress.step === 'finalizing' ? 'text-brand' : 
                                    exportProgress.progress > 90 ? 'text-green-500' : 'text-text-primary/40'
                                }`}>
                                    <div className="w-2 h-2 rounded-full bg-current" />
                                    Finalizing
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Export Form */
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Repository Name */}
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

                            {/* Description */}
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

                            {/* Privacy Setting */}
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

                            {/* Submit Button */}
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="flex-1 bg-bg-2 hover:bg-border text-text-primary py-2 px-4 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!repositoryName.trim()}
                                    className="flex-1 bg-brand hover:bg-brand/90 disabled:bg-brand/50 text-text-on-brand py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <Upload className="w-4 h-4" />
                                    Export to GitHub
                                </button>
                            </div>
                        </form>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}