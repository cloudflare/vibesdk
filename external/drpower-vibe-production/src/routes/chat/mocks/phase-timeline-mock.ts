import type { PhaseTimelineItem } from '../hooks/use-chat';

// Mock file data for different phases
const mockFiles = {
  coreComponents: [
    { path: 'src/components/Button.tsx', purpose: 'Reusable button component with variants' },
    { path: 'src/components/Input.tsx', purpose: 'Form input component with validation' },
    { path: 'src/types/index.ts', purpose: 'Core TypeScript type definitions' },
  ],
  apiIntegration: [
    { path: 'src/api/client.ts', purpose: 'HTTP client with authentication' },
    { path: 'src/hooks/useApi.tsx', purpose: 'React hook for API calls' },
    { path: 'src/utils/request.ts', purpose: 'Request utilities and interceptors' },
  ],
  dashboardUI: [
    { path: 'src/pages/Dashboard.tsx', purpose: 'Main dashboard page component' },
    { path: 'src/components/Chart.tsx', purpose: 'Data visualization chart component' },
    { path: 'src/components/Sidebar.tsx', purpose: 'Navigation sidebar component' },
    { path: 'src/styles/dashboard.css', purpose: 'Dashboard-specific styles' },
  ],
  gameLogic: [
    { path: 'src/game/Game.tsx', purpose: 'Main 2048 game component' },
    { path: 'src/game/Board.tsx', purpose: '4x4 game board component' },
    { path: 'src/game/Tile.tsx', purpose: 'Individual tile component' },
    { path: 'src/game/logic.ts', purpose: 'Game logic and movement algorithms' },
    { path: 'src/game/animations.ts', purpose: 'Tile movement animations' },
  ],
  finalPolish: [
    { path: 'src/components/Header.tsx', purpose: 'Application header with navigation' },
    { path: 'src/utils/storage.ts', purpose: 'Local storage utilities' },
    { path: 'README.md', purpose: 'Project documentation' },
  ]
};

export function generateMockPhaseTimeline(): PhaseTimelineItem[] {
  const baseTime = Date.now() - 5 * 60 * 1000; // 5 minutes ago
  
  return [
    {
      id: `Core Components-${baseTime}`,
      name: 'Core Components',
      description: 'Setting up foundational React components',
      files: mockFiles.coreComponents.map(f => ({
        ...f,
        status: 'completed' as const
      })),
      status: 'completed',
      timestamp: baseTime
    },
    {
      id: `API Integration-${baseTime + 60000}`,
      name: 'API Integration',
      description: 'Implementing HTTP client and API hooks',
      files: mockFiles.apiIntegration.map(f => ({
        ...f,
        status: 'completed' as const
      })),
      status: 'completed',
      timestamp: baseTime + 60000
    },
    {
      id: `Dashboard UI-${baseTime + 120000}`,
      name: 'Dashboard UI',
      description: 'Building dashboard interface components',
      files: mockFiles.dashboardUI.map((f, index) => ({
        ...f,
        status: index < 2 ? 'completed' as const : 'generating' as const
      })),
      status: 'generating',
      timestamp: baseTime + 120000
    },
    {
      id: `Game Logic-${baseTime + 180000}`,
      name: 'Game Logic',
      description: 'Implementing 2048 game mechanics',
      files: mockFiles.gameLogic.map(f => ({
        ...f,
        status: 'generating' as const
      })),
      status: 'generating',
      timestamp: baseTime + 180000
    }
  ];
}

export function generateSequentialMockPhases(): PhaseTimelineItem[] {
  const baseTime = Date.now() - 3 * 60 * 1000; // 3 minutes ago
  
  return [
    // Phase 1: Complete
    {
      id: `Core Components-${baseTime}`,
      name: 'Core Components',
      description: 'Foundational React components',
      files: mockFiles.coreComponents.map(f => ({
        ...f,
        status: 'completed' as const
      })),
      status: 'completed',
      timestamp: baseTime
    },
    // Phase 2: Complete  
    {
      id: `API Integration-${baseTime + 45000}`,
      name: 'API Integration', 
      description: 'HTTP client and API hooks',
      files: mockFiles.apiIntegration.map(f => ({
        ...f,
        status: 'completed' as const
      })),
      status: 'completed',
      timestamp: baseTime + 45000
    },
    // Phase 3: Currently implementing
    {
      id: `Game Logic-${baseTime + 90000}`,
      name: 'Game Logic',
      description: '2048 game mechanics and animations',
      files: mockFiles.gameLogic.map((f, index) => ({
        ...f,
        status: index < 3 ? 'completed' as const : 'generating' as const
      })),
      status: 'generating',
      timestamp: baseTime + 90000
    },
    // Phase 4: Queued
    {
      id: `Final Polish-${baseTime + 135000}`,
      name: 'Final Polish',
      description: 'Documentation and final touches',
      files: mockFiles.finalPolish.map(f => ({
        ...f,
        status: 'generating' as const
      })),
      status: 'generating',
      timestamp: baseTime + 135000
    }
  ];
}

export function generateEmptyMockTimeline(): PhaseTimelineItem[] {
  return [];
}

// Mock data with very long file names for testing truncation
export function generateLongFileNamesMockTimeline(): PhaseTimelineItem[] {
  const baseTime = Date.now() - 3 * 60 * 1000;
  
  return [
    {
      id: `Long File Names Test-${baseTime}`,
      name: 'Complex Feature Implementation',
      description: 'Testing very long file paths and names',
      files: [
        {
          path: 'src/components/very-complex-and-extremely-long-named-components/super-detailed-user-interface-elements/advanced-dashboard-analytics-visualization-component.tsx',
          purpose: 'Complex dashboard component with analytics',
          status: 'completed' as const
        },
        {
          path: 'src/features/user-management/authentication/multi-factor-authentication/providers/oauth/google/configuration-and-settings.ts',
          purpose: 'OAuth Google configuration',
          status: 'completed' as const
        },
        {
          path: 'src/utils/database/migrations/version-2024-07-17/add-user-preferences-and-advanced-settings-with-json-schema-validation.sql',
          purpose: 'Database migration with user preferences',
          status: 'generating' as const
        },
        {
          path: 'src/api/endpoints/v2/external-integrations/third-party-services/payment-processing/stripe/webhooks/subscription-management.ts',
          purpose: 'Stripe webhook handler for subscriptions',
          status: 'error' as const
        },
        {
          path: 'src/types/interfaces/backend-api-contracts/user-generated-content/comments-and-ratings-system-with-moderation.ts',
          purpose: 'Type definitions for content moderation',
          status: 'validating' as const
        }
      ],
      status: 'generating',
      timestamp: baseTime
    },
    {
      id: `Mixed Length Names-${baseTime + 60000}`,
      name: 'Mixed File Name Lengths',
      description: 'Testing mixture of short and long file names',
      files: [
        {
          path: 'index.ts',
          purpose: 'Main entry point',
          status: 'completed' as const
        },
        {
          path: 'src/extremely-long-path-that-should-definitely-be-truncated-in-the-user-interface/nested/deeply/component.tsx',
          purpose: 'Deeply nested component',
          status: 'completed' as const
        },
        {
          path: 'src/app.tsx',
          purpose: 'App component',
          status: 'generating' as const
        },
        {
          path: 'src/features/advanced-enterprise-level-business-logic/complex-workflow-management/automated-processes/background-job-scheduler.ts',
          purpose: 'Background job processing system',
          status: 'generating' as const
        }
      ],
      status: 'generating',
      timestamp: baseTime + 60000
    }
  ];
}

// Mock scenarios for testing different states
export const mockScenarios = {
  'Sequential Phases': generateSequentialMockPhases,
  'Mixed States': generateMockPhaseTimeline,
  'Long File Names': generateLongFileNamesMockTimeline,
  'Empty Timeline': generateEmptyMockTimeline,
  'Single Phase': () => [generateMockPhaseTimeline()[0]],
  'All Completed': () => generateMockPhaseTimeline().map(phase => ({
    ...phase,
    status: 'completed' as const,
    files: phase.files.map(f => ({ ...f, status: 'completed' as const }))
  }))
};
