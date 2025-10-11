import { useState, useRef, useMemo, Component } from 'react';
import { Bug, X, Download, Mail, Maximize2, Minimize2, Clock, BookmarkPlus, Bookmark, Activity, BarChart3 } from 'lucide-react';
import { Button } from '../../../components/primitives/button';
import { captureDebugScreenshot } from '../../../utils/screenshot';

// Custom Error Boundary to prevent debug panel crashes from affecting main site
class DebugPanelErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Debug Panel Error:', error, errorInfo);
    // Log to external service if needed
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-red-50 border border-red-200 rounded-lg shadow-lg max-w-sm">
          <div className="flex items-center gap-2 text-red-800 mb-2">
            <Bug className="w-4 h-4" />
            <span className="font-medium">Debug Panel Error</span>
          </div>
          <p className="text-sm text-red-700 mb-3">
            The debug panel encountered an error but your main application is still working normally.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
          >
            Retry Debug Panel
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export interface DebugMessage {
  id: string;
  timestamp: number;
  type: 'error' | 'warning' | 'info' | 'websocket';
  message: string;
  details?: string;
  source?: string;
  messageType?: string;
  rawMessage?: unknown;
  wsCategory?: 'generation' | 'phase' | 'file' | 'deployment' | 'system';
  duration?: number; // Time since previous message
  isBookmarked?: boolean;
  performance?: {
    tokens?: number;
    fileCount?: number;
    memoryUsage?: number;
  };
}

interface DebugPanelProps {
  messages: DebugMessage[];
  onClear: () => void;
  chatSessionId?: string;
}

interface DebugDump {
  timestamp: number;
  chatSessionId: string;
  messages: DebugMessage[];
  appState: {
    url: string;
    userAgent: string;
    viewport: { width: number; height: number };
  };
  screenshot?: string;
}

function DebugPanelCore({ messages, onClear, chatSessionId }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'error' | 'warning' | 'info' | 'websocket'>('all');
  const [wsFilter, setWsFilter] = useState<'all' | 'generation' | 'phase' | 'file' | 'deployment' | 'system'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isGeneratingDump, setIsGeneratingDump] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'timeline' | 'analytics'>('list');
  const [bookmarkedMessages, setBookmarkedMessages] = useState<Set<string>>(new Set());
  // notifications removed per design request
  
  // Helper functions defined first to avoid hoisting issues
  const calculateOperationMetrics = (wsMessages: DebugMessage[]) => {
    try {
      const operations = {
        phaseGeneration: [] as number[],
        fileGeneration: [] as { duration: number; lines: number; chars: number }[],
        cfDeployment: [] as number[],
        runnerDeployment: [] as number[]
      };
      
      // Track phase lifecycle: phase_generating → phase_generated → phase_implementing → phase_implemented
      const phaseStarts = wsMessages.filter(m => m.messageType === 'phase_generating');
      const phaseCompletes = wsMessages.filter(m => m.messageType === 'phase_implemented');
      
      phaseStarts.forEach(start => {
        const complete = phaseCompletes.find(c => c.timestamp > start.timestamp);
        if (complete) {
          operations.phaseGeneration.push(complete.timestamp - start.timestamp);
        }
      });
      
      // Enhanced file generation tracking with content analysis
      const fileStarts = wsMessages.filter(m => m.messageType === 'file_generating');
      const fileCompletes = wsMessages.filter(m => m.messageType === 'file_generated');
      
      fileStarts.forEach(start => {
        const complete = fileCompletes.find(c => c.timestamp > start.timestamp);
        if (complete) {
          const duration = complete.timestamp - start.timestamp;
          
          // Extract file content info from message if available
          let lines = 0;
          let chars = 0;
          
          try {
            // Try to extract content metrics from the complete message
            const content = complete.message || '';
            
            // Look for content indicators in the message
            const linesMatch = content.match(/(\d+)\s*lines?/i);
            const charsMatch = content.match(/(\d+)\s*characters?/i);
            const sizeMatch = content.match(/(\d+)\s*bytes?/i);
            
            if (linesMatch) {
              lines = parseInt(linesMatch[1]);
            } else {
              // Estimate lines from file content if present
              const fileContentMatch = content.match(/```[\s\S]*?```/g);
              if (fileContentMatch) {
                lines = fileContentMatch[0].split('\n').length - 2; // Subtract code fence lines
              }
            }
            
            if (charsMatch) {
              chars = parseInt(charsMatch[1]);
            } else if (sizeMatch) {
              chars = parseInt(sizeMatch[1]);
            } else {
              // Estimate characters from content
              const fileContentMatch = content.match(/```[\s\S]*?```/g);
              if (fileContentMatch) {
                chars = fileContentMatch[0].length;
              } else {
                chars = content.length;
              }
            }
            
            // Fallback estimates if no metrics found
            if (lines === 0 && chars > 0) {
              lines = Math.max(1, Math.floor(chars / 50)); // Estimate ~50 chars per line
            }
            if (chars === 0 && lines > 0) {
              chars = lines * 50; // Estimate 50 chars per line
            }
            
          } catch (parseError) {
            // Use default estimates for unknown content
            lines = 50; // Default estimate
            chars = 2500; // Default estimate
          }
          
          operations.fileGeneration.push({ duration, lines, chars });
        }
      });
      
      // Track CF deployment: cloudflare_deployment_started → cloudflare_deployment_completed
      const cfStarts = wsMessages.filter(m => m.messageType === 'cloudflare_deployment_started');
      const cfCompletes = wsMessages.filter(m => m.messageType === 'cloudflare_deployment_completed');
      
      cfStarts.forEach(start => {
        const complete = cfCompletes.find(c => c.timestamp > start.timestamp);
        if (complete) {
          operations.cfDeployment.push(complete.timestamp - start.timestamp);
        }
      });
      
      // Track runner deployment: phase_implemented → deployment_completed
      const runnerStarts = wsMessages.filter(m => m.messageType === 'phase_implemented');
      const runnerCompletes = wsMessages.filter(m => m.messageType === 'deployment_completed');
      
      runnerStarts.forEach(start => {
        const complete = runnerCompletes.find(c => c.timestamp > start.timestamp);
        if (complete) {
          operations.runnerDeployment.push(complete.timestamp - start.timestamp);
        }
      });
      
      // Calculate statistics for duration-only operations
      const getStats = (durations: number[]) => {
        if (durations.length === 0) return { avg: 0, median: 0, p99: 0, count: 0 };
        
        const sorted = [...durations].sort((a, b) => a - b);
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        const median = sorted.length % 2 === 0 ? 
          (sorted[sorted.length/2-1] + sorted[sorted.length/2]) / 2 :
          sorted[Math.floor(sorted.length/2)];
        const p99Index = Math.ceil(sorted.length * 0.99) - 1;
        const p99 = sorted[Math.max(0, p99Index)];
        
        return { avg, median, p99, count: durations.length };
      };
      
      // Calculate enhanced file generation statistics
      const getFileStats = (fileOps: { duration: number; lines: number; chars: number }[]) => {
        if (fileOps.length === 0) {
          return {
            duration: { avg: 0, median: 0, p99: 0, count: 0 },
            linesPerSecond: { avg: 0, median: 0, p99: 0 },
            charsPerSecond: { avg: 0, median: 0, p99: 0 },
            totalLines: 0,
            totalChars: 0
          };
        }
        
        const durations = fileOps.map(op => op.duration);
        const linesPerSec = fileOps.map(op => op.duration > 0 ? (op.lines / (op.duration / 1000)) : 0);
        const charsPerSec = fileOps.map(op => op.duration > 0 ? (op.chars / (op.duration / 1000)) : 0);
        
        const totalLines = fileOps.reduce((sum, op) => sum + op.lines, 0);
        const totalChars = fileOps.reduce((sum, op) => sum + op.chars, 0);
        
        const calcStats = (values: number[]) => {
          const sorted = [...values].sort((a, b) => a - b);
          const avg = values.reduce((a, b) => a + b, 0) / values.length;
          const median = sorted.length % 2 === 0 ? 
            (sorted[sorted.length/2-1] + sorted[sorted.length/2]) / 2 :
            sorted[Math.floor(sorted.length/2)];
          const p99Index = Math.ceil(sorted.length * 0.99) - 1;
          const p99 = sorted[Math.max(0, p99Index)];
          return { avg, median, p99 };
        };
        
        return {
          duration: { ...getStats(durations), count: fileOps.length },
          linesPerSecond: calcStats(linesPerSec),
          charsPerSecond: calcStats(charsPerSec),
          totalLines,
          totalChars
        };
      };
      
      return {
        phaseGeneration: getStats(operations.phaseGeneration),
        fileGeneration: getFileStats(operations.fileGeneration),
        cfDeployment: getStats(operations.cfDeployment),
        runnerDeployment: getStats(operations.runnerDeployment)
      };
    } catch (error) {
      console.error('Error calculating operation metrics:', error);
      return {
        phaseGeneration: { avg: 0, median: 0, p99: 0, count: 0 },
        fileGeneration: {
          duration: { avg: 0, median: 0, p99: 0, count: 0 },
          linesPerSecond: { avg: 0, median: 0, p99: 0 },
          charsPerSecond: { avg: 0, median: 0, p99: 0 },
          totalLines: 0,
          totalChars: 0
        },
        cfDeployment: { avg: 0, median: 0, p99: 0, count: 0 },
        runnerDeployment: { avg: 0, median: 0, p99: 0, count: 0 }
      };
    }
  };
  
  const processTimelineData = (messages: DebugMessage[]) => {
    try {
      if (!messages || messages.length === 0) return { events: [], lanes: [] };
      
      const events = messages.map((msg, index) => ({
        id: msg.id || `msg-${index}`,
        timestamp: msg.timestamp || Date.now(),
        message: msg.message || 'Unknown message',
        type: msg.type || 'info',
        messageType: msg.messageType,
        category: msg.wsCategory || categorizeWebSocketMessage(msg.messageType),
        duration: index > 0 ? (msg.timestamp || 0) - (messages[index - 1]?.timestamp || 0) : 0,
        isBookmarked: bookmarkedMessages.has(msg.id || '')
      }));
      
      // Group events into lanes by category for better visualization
      const lanes = [
        { id: 'generation', label: 'Generation', color: 'bg-blue-100 border-blue-300' },
        { id: 'phase', label: 'Phases', color: 'bg-green-100 border-green-300' },
        { id: 'file', label: 'Files', color: 'bg-purple-100 border-purple-300' },
        { id: 'deployment', label: 'Deployment', color: 'bg-orange-100 border-orange-300' },
        { id: 'system', label: 'System', color: 'bg-red-100 border-red-300' }
      ];
      
      return { events, lanes };
    } catch (error) {
      console.error('Error processing timeline data:', error);
      return { events: [], lanes: [] };
    }
  };
  
  // Advanced performance analytics - only compute when panel is open
  const analyticsData = useMemo(() => {
    try {
      if (!isOpen) return null; // Performance optimization: don't compute when closed
      
      const now = Date.now();
      const last24h = messages.filter(m => now - m.timestamp < 24 * 60 * 60 * 1000);
      const errors = messages.filter(m => m.type === 'error');
      const warnings = messages.filter(m => m.type === 'warning');
      const wsMessages = messages.filter(m => m.type === 'websocket');
      
      // Calculate statistical metrics for message intervals
      const intervals = [];
      for (let i = 1; i < messages.length; i++) {
        intervals.push(messages[i].timestamp - messages[i-1].timestamp);
      }
      
      const sortedIntervals = [...intervals].sort((a, b) => a - b);
      const median = sortedIntervals.length > 0 ? 
        sortedIntervals.length % 2 === 0 ? 
          (sortedIntervals[sortedIntervals.length/2-1] + sortedIntervals[sortedIntervals.length/2]) / 2 :
          sortedIntervals[Math.floor(sortedIntervals.length/2)] : 0;
      
      const p99Index = Math.ceil(sortedIntervals.length * 0.99) - 1;
      const p99 = sortedIntervals.length > 0 ? sortedIntervals[Math.max(0, p99Index)] : 0;
      const avgInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;
      
      // Track operation-specific durations
      const operationMetrics = calculateOperationMetrics(wsMessages);
      
      return {
        totalMessages: messages.length,
        last24h: last24h.length,
        errorRate: messages.length > 0 ? (errors.length / messages.length * 100).toFixed(1) : '0',
        warningRate: messages.length > 0 ? (warnings.length / messages.length * 100).toFixed(1) : '0',
        wsMessages: wsMessages.length,
        intervals: {
          avg: avgInterval > 1000 ? `${(avgInterval/1000).toFixed(1)}s` : `${avgInterval.toFixed(0)}ms`,
          median: median > 1000 ? `${(median/1000).toFixed(1)}s` : `${median.toFixed(0)}ms`,
          p99: p99 > 1000 ? `${(p99/1000).toFixed(1)}s` : `${p99.toFixed(0)}ms`
        },
        operations: operationMetrics
      };
    } catch (error) {
      console.error('Error calculating analytics data:', error);
      return null;
    }
  }, [messages, isOpen, bookmarkedMessages]);
  
  // Timeline data processing - optimized for performance
  const timelineData = useMemo(() => {
    try {
      if (!isOpen || viewMode !== 'timeline') return null; // Only compute when timeline is active
      
      return processTimelineData(messages);
    } catch (error) {
      console.error('Error processing timeline data:', error);
      return null;
    }
  }, [messages, isOpen, viewMode, bookmarkedMessages]);
  
  // notifications logic removed
  
  // Message bookmarking functionality
  const toggleBookmark = (messageId: string) => {
    const newBookmarks = new Set(bookmarkedMessages);
    if (newBookmarks.has(messageId)) {
      newBookmarks.delete(messageId);
    } else {
      newBookmarks.add(messageId);
    }
    setBookmarkedMessages(newBookmarks);
  };
  
  // WebSocket message categorization
  const categorizeWebSocketMessage = (messageType?: string): 'generation' | 'phase' | 'file' | 'deployment' | 'system' | undefined => {
    if (!messageType) return undefined;
    
    // Generation messages
    if (['generation_started', 'generation_complete', 'generation_errors'].includes(messageType)) {
      return 'generation';
    }
    
    // Phase messages  
    if (['phase_generating', 'phase_generated', 'phase_implementing', 'phase_implemented'].includes(messageType)) {
      return 'phase';
    }
    
    // File operation messages
    if (['file_generating', 'file_generated', 'file_regenerated', 'file_chunk_generated', 'file_enhanced', 'file_regenerating'].includes(messageType)) {
      return 'file';
    }
    
    // Deployment messages
    if (['cloudflare_deployment_started', 'cloudflare_deployment_completed', 'cloudflare_deployment_error', 'deployment_completed'].includes(messageType)) {
      return 'deployment';
    }
    
    // System/Runtime messages
    if (['runtime_error_found', 'command_executing', 'code_review', 'error'].includes(messageType)) {
      return 'system';
    }
    
    return 'system'; // Default fallback
  };
  
  const panelRef = useRef<HTMLDivElement>(null);

  const filteredMessages = messages.filter(msg => {
    // Basic type filtering
    if (filter !== 'all' && msg.type !== filter) return false;
    
    // WebSocket category filtering
    if (filter === 'websocket' && wsFilter !== 'all') {
      const category = msg.wsCategory || categorizeWebSocketMessage(msg.messageType);
      if (category !== wsFilter) return false;
    }
    
    // Search filtering
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return msg.message.toLowerCase().includes(query) ||
             msg.source?.toLowerCase().includes(query) ||
             msg.messageType?.toLowerCase().includes(query);
    }
    return true;
  });

  const toggleExpanded = (messageId: string) => {
    const newExpanded = new Set(expandedMessages);
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId);
    } else {
      newExpanded.add(messageId);
    }
    setExpandedMessages(newExpanded);
  };

  const captureScreenshot = async (): Promise<string | undefined> => {
    try {
      const result = await captureDebugScreenshot();
      return result.dataUrl;
    } catch (error) {
      console.error('Screenshot capture failed:', error);
      return undefined;
    }
  };

  const generateDebugDump = async (): Promise<DebugDump> => {
    const screenshot = await captureScreenshot();
    
    return {
      timestamp: Date.now(),
      chatSessionId: chatSessionId || 'unknown',
      messages: messages.map(msg => ({...msg})), // Deep copy
      appState: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      },
      screenshot
    };
  };

  const downloadDump = async () => {
    setIsGeneratingDump(true);
    try {
      const dump = await generateDebugDump();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `debug-dump-${new Date().toISOString().slice(0,19)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsGeneratingDump(false);
    }
  };

  const emailDump = async () => {
    setIsGeneratingDump(true);
    try {
      const dump = await generateDebugDump();
      const subject = `Debug Dump - ${chatSessionId || 'Unknown Session'}`;
      const body = `Debug dump generated at ${new Date().toISOString()}\n\nDump data attached as JSON.`;
      
      // Create mailto link with dump as attachment workaround
      const mailtoLink = `mailto:ashishsingh@cloudflare.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body + '\n\n' + JSON.stringify(dump, null, 2))}`;
      window.open(mailtoLink);
    } finally {
      setIsGeneratingDump(false);
    }
  };

  const errorCount = messages.filter(m => m.type === 'error').length;
  const warningCount = messages.filter(m => m.type === 'warning').length;

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 p-3 rounded-full shadow-lg transition-all duration-300 hover:scale-105 ${
          (errorCount > 0 || warningCount > 0) && !isOpen
            ? 'bg-red-500 text-white animate-pulse'
            : 'bg-zinc-800 text-white hover:bg-zinc-700'
        }`}
        title={`Debug Console (${errorCount + warningCount} issues)`}
      >
        <Bug className="w-4 h-4" />
        {(errorCount > 0 || warningCount > 0) && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">
            {errorCount > 0 ? errorCount : warningCount}
          </span>
        )}
      </button>

      {/* Debug Panel */}
      <div
        ref={panelRef}
        className={`fixed right-0 top-0 h-full bg-bg-3 dark:bg-bg-4 shadow-2xl border-l border-border-primary z-[60] transform transition-all duration-300 ease-in-out flex flex-col ${
          isMaximized ? 'w-[80vw]' : 'w-[600px]'
        } ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-primary bg-gradient-to-r from-muted to-accent">
          <div className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-text-primary" />
            <h3 className="font-semibold text-text-primary">Debug Console</h3>
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full">
              {filteredMessages.length}/{messages.length}
            </span>
            {bookmarkedMessages.size > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <Bookmark className="w-3 h-3" />
                {bookmarkedMessages.size}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* View Mode Toggle */}
            <div className="flex bg-bg-3 dark:bg-zinc-800 rounded p-0.5">
              {[
                { key: 'list' as const, icon: Bug, label: 'List' },
                { key: 'analytics' as const, icon: BarChart3, label: 'Analytics' },
                { key: 'timeline' as const, icon: Activity, label: 'Timeline' }
              ].map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setViewMode(key)}
                  className={`px-2 py-1 text-xs rounded transition-all flex items-center gap-1 ${
                    viewMode === key
                      ? 'bg-bg-3 text-text-primary shadow-sm'
                      : 'text-text-tertiary hover:text-text-primary'
                  }`}
                  title={`${label} view`}
                >
                  <Icon className="w-3 h-3" />
                  {label}
                </button>
              ))}
            </div>
            
            {/* Notifications removed per design */}
            <div className="flex items-center gap-2 basis-full justify-end pt-2">
              <Button
                onClick={downloadDump}
                disabled={isGeneratingDump}
                title="Download debug dump"
              >
                <Download className="w-4 h-4" />
                {isGeneratingDump ? 'Generating...' : 'Download'}
              </Button>
              <Button
                onClick={emailDump}
                disabled={isGeneratingDump}
                title="Email debug dump to developers"
              >
                <Mail className="w-4 h-4" />
                Email
              </Button>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto pt-2 sm:pt-0">
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="text-text-tertiary hover:text-text-primary p-1 hover:bg-bg-3 rounded transition-colors"
                title={isMaximized ? 'Minimize panel' : 'Maximize panel'}
              >
                {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={onClear}
                className="text-xs text-text-tertiary hover:text-text-primary px-2 py-1 hover:bg-bg-3 rounded transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-text-tertiary hover:text-text-primary p-1 hover:bg-bg-3 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="p-3 border-b border-border-primary dark:border-border-primary bg-bg-3/30 dark:bg-bg-3/20">
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm bg-input border border-border-primary rounded focus:outline-none focus:ring-2 focus:ring-ring text-text-primary"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {[
              { key: 'all' as const, label: 'All', count: messages.length },
              { key: 'error' as const, label: 'Errors', count: errorCount },
              { key: 'warning' as const, label: 'Warnings', count: warningCount },
              { key: 'websocket' as const, label: 'WebSocket', count: messages.filter(m => m.type === 'websocket').length },
              { key: 'info' as const, label: 'Info', count: messages.filter(m => m.type === 'info').length }
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => {
                  setFilter(key);
                  if (key !== 'websocket') {
                    setWsFilter('all'); // Reset WebSocket filter when not filtering by WebSocket
                  }
                }}
                className={`px-3 py-1 text-xs rounded-full transition-all ${
                  filter === key
                    ? 'bg-blue-500 text-white'
                    : 'bg-bg-3 text-text-primary hover:bg-bg-3 border border-border-primary'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
          
          {/* WebSocket Category Filters - Show only when WebSocket filter is active */}
          {filter === 'websocket' && (
            <div className="mt-3 pt-3 border-t border-border-primary">
              <div className="text-xs text-text-tertiary mb-2 font-medium">WebSocket Message Types:</div>
              <div className="flex gap-1 flex-wrap">
                {[
                  { key: 'all' as const, label: 'All WS', count: messages.filter(m => m.type === 'websocket').length },
                  { key: 'generation' as const, label: 'Generation', count: messages.filter(m => m.type === 'websocket' && (m.wsCategory === 'generation' || categorizeWebSocketMessage(m.messageType) === 'generation')).length },
                  { key: 'phase' as const, label: 'Phases', count: messages.filter(m => m.type === 'websocket' && (m.wsCategory === 'phase' || categorizeWebSocketMessage(m.messageType) === 'phase')).length },
                  { key: 'file' as const, label: 'Files', count: messages.filter(m => m.type === 'websocket' && (m.wsCategory === 'file' || categorizeWebSocketMessage(m.messageType) === 'file')).length },
                  { key: 'deployment' as const, label: 'Deploy', count: messages.filter(m => m.type === 'websocket' && (m.wsCategory === 'deployment' || categorizeWebSocketMessage(m.messageType) === 'deployment')).length },
                  { key: 'system' as const, label: 'System', count: messages.filter(m => m.type === 'websocket' && (m.wsCategory === 'system' || categorizeWebSocketMessage(m.messageType) === 'system')).length }
                ].map(({ key, label, count }) => (
                  <button
                    key={key}
                    onClick={() => setWsFilter(key)}
                    className={`px-2 py-1 text-xs rounded transition-all ${
                      wsFilter === key
                        ? 'bg-purple-600 text-white dark:bg-purple-700'
                        : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-200 dark:hover:bg-purple-900/40 dark:border-purple-800'
                    }`}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Content Area - Changes based on view mode */}
        <div className="flex-1 overflow-y-auto">
          {viewMode === 'analytics' ? (
            /* Analytics Dashboard */
            <div className="p-6 space-y-6">
              {analyticsData ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{analyticsData.totalMessages}</div>
                      <div className="text-sm text-blue-800">Total Messages</div>
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-red-600">{analyticsData.errorRate}%</div>
                      <div className="text-sm text-red-800">Error Rate</div>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-yellow-600">{analyticsData.warningRate}%</div>
                      <div className="text-sm text-yellow-800">Warning Rate</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{analyticsData.intervals.avg}</div>
                      <div className="text-sm text-green-800">Avg Interval</div>
                    </div>
                  </div>
                  
                  {/* Statistical Analysis */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-bg-3/50 p-4 rounded-lg">
                      <h4 className="font-medium text-text-primary mb-2">Response Time Statistics</h4>
                      <div className="space-y-1 text-sm">
                        <div>Average: <span className="font-mono">{analyticsData.intervals.avg}</span></div>
                        <div>Median: <span className="font-mono">{analyticsData.intervals.median}</span></div>
                        <div>P99: <span className="font-mono">{analyticsData.intervals.p99}</span></div>
                      </div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <h4 className="font-medium text-purple-800 mb-2 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4" />
                        WebSocket Activity
                      </h4>
                      <div className="text-lg font-bold text-purple-600">{analyticsData.wsMessages} messages</div>
                      <div className="text-sm text-purple-700">Last 24h: {analyticsData.last24h} messages</div>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-lg">
                      <h4 className="font-medium text-amber-800 mb-2">Performance Score</h4>
                      <div className="text-2xl font-bold text-amber-600">
                        {analyticsData.errorRate === '0' ? '100' : (100 - parseFloat(analyticsData.errorRate)).toFixed(0)}%
                      </div>
                      <div className="text-sm text-amber-700">System Health</div>
                    </div>
                  </div>
                  
                  {/* Enhanced Operation-Specific Metrics */}
                  <div className="space-y-6">
                    <h4 className="font-medium text-text-primary text-lg">🚀 Operation Performance Metrics</h4>
                    
                    {/* File Generation - Special Enhanced Display */}
                    {analyticsData.operations.fileGeneration.duration.count > 0 && (
                      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                          <h5 className="font-bold text-purple-900 text-lg">📝 File Generation Performance</h5>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                          <div className="bg-bg-4/70 dark:bg-bg-4/50 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-purple-600">
                              {analyticsData.operations.fileGeneration.linesPerSecond.avg.toFixed(1)}
                            </div>
                            <div className="text-sm text-purple-800">Lines/sec (avg)</div>
                          </div>
                          <div className="bg-bg-4/70 dark:bg-bg-4/50 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-indigo-600">
                              {(analyticsData.operations.fileGeneration.charsPerSecond.avg / 1000).toFixed(1)}k
                            </div>
                            <div className="text-sm text-indigo-800">Chars/sec (avg)</div>
                          </div>
                          <div className="bg-bg-4/70 dark:bg-bg-4/50 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-blue-600">
                              {analyticsData.operations.fileGeneration.totalLines.toLocaleString()}
                            </div>
                            <div className="text-sm text-blue-800">Total Lines</div>
                          </div>
                          <div className="bg-bg-4/70 dark:bg-bg-4/50 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold text-teal-600">
                              {analyticsData.operations.fileGeneration.duration.count}
                            </div>
                            <div className="text-sm text-teal-800">Files Generated</div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-bg-4/70 dark:bg-bg-4/50 rounded-lg p-4">
                            <h6 className="font-medium text-text-primary mb-2">⚡ Generation Speed</h6>
                            <div className="space-y-1 text-sm">
                              <div>Avg: <span className="font-mono font-medium">{analyticsData.operations.fileGeneration.linesPerSecond.avg.toFixed(1)} lines/s</span></div>
                              <div>Median: <span className="font-mono font-medium">{analyticsData.operations.fileGeneration.linesPerSecond.median.toFixed(1)} lines/s</span></div>
                              <div>Peak (P99): <span className="font-mono font-medium">{analyticsData.operations.fileGeneration.linesPerSecond.p99.toFixed(1)} lines/s</span></div>
                            </div>
                          </div>
                          <div className="bg-bg-4/70 dark:bg-bg-4/50 rounded-lg p-4">
                            <h6 className="font-medium text-text-primary mb-2">⏱️ Duration Stats</h6>
                            <div className="space-y-1 text-sm">
                              <div>Avg: <span className="font-mono font-medium">{analyticsData.operations.fileGeneration.duration.avg > 1000 ? `${(analyticsData.operations.fileGeneration.duration.avg/1000).toFixed(1)}s` : `${analyticsData.operations.fileGeneration.duration.avg.toFixed(0)}ms`}</span></div>
                              <div>Median: <span className="font-mono font-medium">{analyticsData.operations.fileGeneration.duration.median > 1000 ? `${(analyticsData.operations.fileGeneration.duration.median/1000).toFixed(1)}s` : `${analyticsData.operations.fileGeneration.duration.median.toFixed(0)}ms`}</span></div>
                              <div>P99: <span className="font-mono font-medium">{analyticsData.operations.fileGeneration.duration.p99 > 1000 ? `${(analyticsData.operations.fileGeneration.duration.p99/1000).toFixed(1)}s` : `${analyticsData.operations.fileGeneration.duration.p99.toFixed(0)}ms`}</span></div>
                            </div>
                          </div>
                          <div className="bg-bg-4/70 dark:bg-bg-4/50 rounded-lg p-4">
                            <h6 className="font-medium text-text-primary mb-2">📊 Content Volume</h6>
                            <div className="space-y-1 text-sm">
                              <div>Total Characters: <span className="font-mono font-medium">{analyticsData.operations.fileGeneration.totalChars.toLocaleString()}</span></div>
                              <div>Avg File Size: <span className="font-mono font-medium">{Math.round(analyticsData.operations.fileGeneration.totalChars / analyticsData.operations.fileGeneration.duration.count).toLocaleString()} chars</span></div>
                              <div>Avg Lines/File: <span className="font-mono font-medium">{Math.round(analyticsData.operations.fileGeneration.totalLines / analyticsData.operations.fileGeneration.duration.count)}</span></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Other Operations */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {Object.entries(analyticsData.operations)
                        .filter(([operation]) => operation !== 'fileGeneration')
                        .map(([operation, stats]) => {
                          const simpleStats = stats as { avg: number; median: number; p99: number; count: number };
                          const operationConfig = {
                            phaseGeneration: { icon: '🔄', color: 'green', label: 'Phase Generation' },
                            cfDeployment: { icon: '☁️', color: 'orange', label: 'CF Deployment' },
                            runnerDeployment: { icon: '🚀', color: 'blue', label: 'Runner Deployment' }
                          }[operation] || { icon: '⚙️', color: 'gray', label: operation };
                          
                          return (
                            <div key={operation} className={`bg-${operationConfig.color}-50 border border-${operationConfig.color}-200 rounded-lg p-4`}>
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-lg">{operationConfig.icon}</span>
                                <h5 className="font-medium text-text-primary">{operationConfig.label}</h5>
                              </div>
                              {simpleStats.count > 0 ? (
                                <div className="space-y-3">
                                  <div className="text-center">
                                    <div className={`text-2xl font-bold text-${operationConfig.color}-600`}>
                                      {simpleStats.avg > 1000 ? `${(simpleStats.avg/1000).toFixed(1)}s` : `${simpleStats.avg.toFixed(0)}ms`}
                                    </div>
                                    <div className={`text-sm text-${operationConfig.color}-800`}>Average Duration</div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                      <div className="text-text-tertiary">Median</div>
                                      <div className="font-mono font-medium">{simpleStats.median > 1000 ? `${(simpleStats.median/1000).toFixed(1)}s` : `${simpleStats.median.toFixed(0)}ms`}</div>
                                    </div>
                                    <div>
                                      <div className="text-text-tertiary">P99</div>
                                      <div className="font-mono font-medium">{simpleStats.p99 > 1000 ? `${(simpleStats.p99/1000).toFixed(1)}s` : `${simpleStats.p99.toFixed(0)}ms`}</div>
                                    </div>
                                  </div>
                                  <div className="pt-2 border-t border-border-primary text-center">
                                    <div className="text-text-tertiary text-sm">{simpleStats.count} operations</div>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-text-tertiary text-sm text-center py-4">No operations recorded</div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-text-tertiary">
                  <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">Analytics loading...</p>
                </div>
              )}
              
              {bookmarkedMessages.size > 0 && (
                <div className="bg-amber-50 p-4 rounded-lg">
                  <h4 className="font-medium text-amber-800 mb-3 flex items-center gap-2">
                    <Bookmark className="w-4 h-4" />
                    Bookmarked Messages
                  </h4>
                  <div className="space-y-2">
                    {messages.filter(m => bookmarkedMessages.has(m.id)).slice(0, 5).map(msg => (
                      <div key={msg.id} className="text-sm text-amber-700 truncate">
                        <Clock className="w-3 h-3 inline mr-1" />
                        {new Date(msg.timestamp).toLocaleTimeString()}: {msg.message}
                      </div>
                    ))}
                    {bookmarkedMessages.size > 5 && (
                      <div className="text-xs text-amber-600">+{bookmarkedMessages.size - 5} more...</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : viewMode === 'timeline' ? (
            /* Timeline View */
            <div className="p-4">
              {timelineData && timelineData.events.length > 0 ? (
                <div className="space-y-6">
                  {/* Timeline Header */}
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-text-primary flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      Message Timeline ({timelineData.events.length} events)
                    </h4>
                    <div className="text-sm text-text-tertiary">
                      Duration: {((timelineData.events[timelineData.events.length - 1]?.timestamp || 0) - (timelineData.events[0]?.timestamp || 0)) > 1000 ? 
                        `${(((timelineData.events[timelineData.events.length - 1]?.timestamp || 0) - (timelineData.events[0]?.timestamp || 0)) / 1000).toFixed(1)}s` : 
                        `${((timelineData.events[timelineData.events.length - 1]?.timestamp || 0) - (timelineData.events[0]?.timestamp || 0)).toFixed(0)}ms`}
                    </div>
                  </div>
                  
                  {/* Lane Legend */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {timelineData.lanes.map(lane => (
                      <div key={lane.id} className={`px-3 py-1 rounded text-xs font-medium ${lane.color}`}>
                        {lane.label}
                      </div>
                    ))}
                  </div>
                  
                  {/* Timeline Events */}
                  <div className="relative">
                    {/* Vertical timeline line */}
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border"></div>
                    
                    <div className="space-y-4">
                      {timelineData.events.map((event, index) => {
                        const lane = timelineData.lanes.find(l => l.id === event.category) || timelineData.lanes[4]; // Default to system
                        const relativeTime = index > 0 ? event.timestamp - timelineData.events[0].timestamp : 0;
                        
                        return (
                          <div key={event.id} className="relative flex items-start">
                            {/* Timeline marker */}
                            <div className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 ${lane.color} ${event.isBookmarked ? 'ring-2 ring-amber-400' : ''}`}>
                              {event.type === 'error' ? (
                                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                              ) : event.type === 'warning' ? (
                                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                              ) : event.type === 'websocket' ? (
                                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                              ) : (
                                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                              )}
                            </div>
                            
                            {/* Event content */}
                            <div className="ml-4 flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-1 text-xs font-medium rounded ${lane.color}`}>
                                    {lane.label}
                                  </span>
                                  {event.messageType && (
                                    <span className="px-2 py-1 text-xs bg-bg-3 text-text-tertiary rounded font-mono">
                                      {event.messageType}
                                    </span>
                                  )}
                                  {event.isBookmarked && (
                                    <Bookmark className="w-3 h-3 text-amber-500 fill-current" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-text-tertiary">
                                  <span>+{relativeTime > 1000 ? `${(relativeTime/1000).toFixed(1)}s` : `${relativeTime.toFixed(0)}ms`}</span>
                                  <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                                </div>
                              </div>
                              
                              <div className="mt-2 text-sm text-text-primary truncate" title={event.message}>
                                {event.message}
                              </div>
                              
                              {event.duration > 0 && (
                                <div className="mt-1 text-xs text-text-tertiary">
                                  Duration: {event.duration > 1000 ? `${(event.duration/1000).toFixed(1)}s` : `${event.duration.toFixed(0)}ms`}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-text-tertiary">
                  <Activity className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">No timeline events to display</p>
                  <p className="text-xs text-text-tertiary/70 mt-2">Messages will appear here as they are logged</p>
                </div>
              )}
            </div>
          ) : (
            /* List View */
            <div className="p-4 space-y-3">
              {filteredMessages.length === 0 ? (
                <div className="text-center py-12 text-text-tertiary">
                  <Bug className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p className="text-sm">No messages match your filters</p>
                </div>
              ) : (
            filteredMessages
              .slice()
              .reverse()
              .map((message) => {
                const isExpanded = expandedMessages.has(message.id);
                return (
                  <div
                    key={message.id}
                    className={`border-l-4 rounded-r-lg p-3 pr-10 transition-all relative ${
                      message.type === 'error'
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20 dark:border-red-400'
                        : message.type === 'warning'
                        ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-400'
                        : message.type === 'websocket'
                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-400'
                        : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                    } ${bookmarkedMessages.has(message.id) ? 'ring-2 ring-amber-300' : ''}`}
                  >
                    {/* Bookmark Button */}
                    <button
                      onClick={() => toggleBookmark(message.id)}
                      className={`absolute top-2 right-2 p-1 rounded transition-all ${
                        bookmarkedMessages.has(message.id)
                          ? 'text-amber-500 hover:text-amber-600'
                          : 'text-text-tertiary hover:text-amber-500'
                      }`}
                      title={bookmarkedMessages.has(message.id) ? 'Remove bookmark' : 'Add bookmark'}
                    >
                      {bookmarkedMessages.has(message.id) ? (
                        <Bookmark className="w-4 h-4 fill-current" />
                      ) : (
                        <BookmarkPlus className="w-4 h-4" />
                      )}
                    </button>
                    <div className="flex items-start justify-between gap-2 mb-2 pr-6">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm capitalize">
                          {message.type}
                        </span>
                        {message.messageType && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-mono dark:bg-purple-900/40 dark:text-purple-200 dark:border dark:border-purple-800">
                            {message.messageType}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-text-tertiary">
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="text-sm text-text-primary mb-2">
                      {message.message}
                    </div>

                    {message.details && (
                      <div>
                        <button
                          onClick={() => toggleExpanded(message.id)}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          {isExpanded ? 'Hide details' : 'Show details'}
                        </button>
                        {isExpanded && (
                          <pre className="mt-2 text-xs bg-bg-3 dark:bg-zinc-900 p-2 rounded overflow-x-auto text-text-tertiary whitespace-pre-wrap max-h-40">
                            {message.details}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Frosted Glass Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 transition-all duration-300 backdrop-blur-sm bg-black/10"
          onClick={() => setIsOpen(false)}
          style={{
            backdropFilter: 'blur(8px) saturate(180%)',
            WebkitBackdropFilter: 'blur(8px) saturate(180%)'
          }}
        />
      )}
    </>
  );
}

// Wrap DebugPanel with Error Boundary to prevent crashes from affecting main site
export function DebugPanel(props: DebugPanelProps) {
  return (
    <DebugPanelErrorBoundary>
      <DebugPanelCore {...props} />
    </DebugPanelErrorBoundary>
  );
}
