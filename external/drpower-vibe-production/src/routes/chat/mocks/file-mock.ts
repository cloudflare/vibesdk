import type { FileType } from '../hooks/use-chat';

// Mock file contents for different file types
const mockFileContents = {
  'src/components/Button.tsx': `import React from 'react';
import clsx from 'clsx';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function Button({ 
  variant = 'primary', 
  size = 'md',
  children,
  onClick,
  disabled = false,
  className 
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'font-medium rounded-lg transition-colors focus:outline-none focus:ring-2',
        {
          'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500': variant === 'primary',
          'bg-gray-600 hover:bg-gray-700 text-white focus:ring-gray-500': variant === 'secondary',
          'border border-gray-300 hover:bg-gray-50 text-gray-700 focus:ring-gray-500': variant === 'outline',
          'px-3 py-1.5 text-sm': size === 'sm',
          'px-4 py-2 text-base': size === 'md',
          'px-6 py-3 text-lg': size === 'lg',
          'opacity-50 cursor-not-allowed': disabled
        },
        className
      )}
    >
      {children}
    </button>
  );
}`,

  'src/components/Input.tsx': `import React from 'react';
import clsx from 'clsx';

interface InputProps {
  label?: string;
  type?: 'text' | 'email' | 'password' | 'number';
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export function Input({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  disabled = false,
  required = false,
  className
}: InputProps) {
  return (
    <div className={clsx('space-y-1', className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        required={required}
        className={clsx(
          'block w-full px-3 py-2 border rounded-md shadow-sm transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
          {
            'border-gray-300 hover:border-gray-400': !error,
            'border-red-300 hover:border-red-400': error,
            'bg-gray-50 cursor-not-allowed': disabled
          }
        )}
      />
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}`,

  'src/game/Game.tsx': `import React, { useState, useEffect, useCallback } from 'react';
import { Board } from './Board';
import { Tile } from './Tile';
import { initializeBoard, moveBoard, addRandomTile, isGameOver } from './logic';

export function Game() {
  const [board, setBoard] = useState(() => initializeBoard());
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);

  const handleMove = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (gameOver) return;

    const { newBoard, moved, scoreIncrease } = moveBoard(board, direction);
    
    if (moved) {
      const boardWithNewTile = addRandomTile(newBoard);
      setBoard(boardWithNewTile);
      setScore(prev => prev + scoreIncrease);
      
      if (isGameOver(boardWithNewTile)) {
        setGameOver(true);
      }
    }
  }, [board, gameOver]);

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          handleMove('up');
          break;
        case 'ArrowDown':
          event.preventDefault();
          handleMove('down');
          break;
        case 'ArrowLeft':
          event.preventDefault();
          handleMove('left');
          break;
        case 'ArrowRight':
          event.preventDefault();
          handleMove('right');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleMove]);

  const resetGame = () => {
    setBoard(initializeBoard());
    setScore(0);
    setGameOver(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800">2048</h1>
          <div className="text-right">
            <p className="text-sm text-gray-600">Score</p>
            <p className="text-2xl font-bold text-blue-600">{score}</p>
          </div>
        </div>
        
        <Board board={board} />
        
        {gameOver && (
          <div className="mt-6 text-center">
            <p className="text-xl font-semibold text-red-600 mb-4">Game Over!</p>
            <button
              onClick={resetGame}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Play Again
            </button>
          </div>
        )}
        
        <div className="mt-6 text-center text-sm text-gray-600">
          <p>Use arrow keys to move tiles</p>
        </div>
      </div>
    </div>
  );
}`,

  'src/api/client.ts': `interface ApiConfig {
  baseURL: string;
  timeout: number;
  headers: Record<string, string>;
}

class ApiClient {
  private config: ApiConfig;

  constructor(config: Partial<ApiConfig> = {}) {
    this.config = {
      baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001/api',
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
      ...config,
    };
  }

  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = \`\${this.config.baseURL}\${endpoint}\`;
    
    const response = await fetch(url, {
      timeout: this.config.timeout,
      headers: {
        ...this.config.headers,
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }

    return response.json();
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();`
};

export function generateMockFiles(): FileType[] {
  const filePaths = Object.keys(mockFileContents);
  
  return filePaths.map((filePath, index) => ({
    filePath: filePath,
    fileContents: mockFileContents[filePath as keyof typeof mockFileContents],
    isGenerating: index >= filePaths.length - 2, // Last 2 files are "generating"
  }));
}

// Generate mock files with very long names and high line counts for testing truncation
export function generateLongFileNameMockFiles(): FileType[] {
  // Helper function to generate content with specific line count
  const generateContent = (lines: number, fileType = 'tsx') => {
    const imports = `import React from 'react';
import { useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';
`;
    const content = Array.from({ length: Math.max(1, lines - 10) }, (_, i) => 
      `// Line ${i + 4}: ${fileType === 'tsx' ? 'Component logic' : 'Business logic'} implementation`
    ).join('\n');
    const footer = fileType === 'tsx' 
      ? `\nexport default function Component() {\n  return <div>Component</div>;\n}` 
      : `\nexport { default };`;
    return imports + content + footer;
  };

  return [
    {
      filePath: 'src/components/very-complex-and-extremely-long-named-components/super-detailed-user-interface-elements/advanced-dashboard-analytics-visualization-component.tsx',
      fileContents: generateContent(15234, 'tsx'), // Very high line count
      isGenerating: false,
    },
    {
      filePath: 'src/features/user-management/authentication/multi-factor-authentication/providers/oauth/google/configuration-and-settings.ts',
      fileContents: generateContent(8947, 'ts'),
      isGenerating: false,
    },
    {
      filePath: 'src/utils/database/migrations/version-2024-07-17/add-user-preferences-and-advanced-settings-with-json-schema-validation.sql',
      fileContents: generateContent(2456, 'sql'),
      isGenerating: true,
    },
    {
      filePath: 'src/api/endpoints/v2/external-integrations/third-party-services/payment-processing/stripe/webhooks/subscription-management.ts',
      fileContents: generateContent(12589, 'ts'),
      isGenerating: false,
    },
    {
      filePath: 'src/types/interfaces/backend-api-contracts/user-generated-content/comments-and-ratings-system-with-moderation.ts',
      fileContents: generateContent(6743, 'ts'),
      isGenerating: false,
    },
    {
      filePath: 'index.ts',
      fileContents: generateContent(42, 'ts'), // Short file name, low line count
      isGenerating: false,
    },
    {
      filePath: 'src/extremely-long-path-that-should-definitely-be-truncated-in-the-user-interface/nested/deeply/component.tsx',
      fileContents: generateContent(987, 'tsx'),
      isGenerating: false,
    },
    {
      filePath: 'src/app.tsx',
      fileContents: generateContent(156, 'tsx'), // Short file name, normal line count
      isGenerating: true,
    },
    {
      filePath: 'src/features/advanced-enterprise-level-business-logic/complex-workflow-management/automated-processes/background-job-scheduler.ts',
      fileContents: generateContent(23847, 'ts'), // Extremely high line count + long name
      isGenerating: true,
    }
  ];
}

export function generateMockFilesForPhases(): FileType[] {
  // Generate files that match the phase timeline mock data
  const allFiles = [
    // Core Components (completed)
    {
      filePath: 'src/components/Button.tsx',
      fileContents: mockFileContents['src/components/Button.tsx'],
      isGenerating: false,
    },
    {
      filePath: 'src/components/Input.tsx', 
      fileContents: mockFileContents['src/components/Input.tsx'],
      isGenerating: false,
    },
    {
      filePath: 'src/types/index.ts',
      fileContents: `export interface User {
  id: string;
  displayName: string;
  email: string;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}`,
      isGenerating: false,
    },
    // API Integration (completed)
    {
      filePath: 'src/api/client.ts',
      fileContents: mockFileContents['src/api/client.ts'],
      isGenerating: false,
    },
    {
      filePath: 'src/hooks/useApi.tsx', 
      fileContents: `import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';

export function useApi<T>(endpoint: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<T>(endpoint)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [endpoint]);

  return { data, loading, error };
}`,
      isGenerating: false,
    },
    // Game Logic (currently generating)
    {
      filePath: 'src/game/Game.tsx',
      fileContents: mockFileContents['src/game/Game.tsx'],
      isGenerating: true,
    },
    {
      filePath: 'src/game/Board.tsx',
      fileContents: `import React from 'react';
import { Tile } from './Tile';

interface BoardProps {
  board: number[][];
}

export function Board({ board }: BoardProps) {
  return (
    <div className="grid grid-cols-4 gap-2 bg-gray-300 p-4 rounded-lg">
      {board.flat().map((value, index) => (
        <Tile key={index} value={value} />
      ))}
    </div>
  );
}`,
      isGenerating: true,
    }
  ];

  return allFiles;
}
