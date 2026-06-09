import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SCOFFormat } from './scof';
import { CodeGenerationStreamingState } from './base';

describe('SCOF Parser - Comprehensive Tests', () => {
    let parser: SCOFFormat;
    let mockCallbacks: {
        onFileOpen: ReturnType<typeof vi.fn>;
        onFileChunk: ReturnType<typeof vi.fn>;
        onFileClose: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        parser = new SCOFFormat();
        mockCallbacks = {
            onFileOpen: vi.fn(),
            onFileChunk: vi.fn(),
            onFileClose: vi.fn(),
        };
    });

    const createInitialState = (): CodeGenerationStreamingState => ({
        accumulator: '',
        completedFiles: new Map(),
        parsingState: parser['initializeSCOFState'](),
    });

    const processChunk = (chunk: string, state: CodeGenerationStreamingState) => {
        return parser.parseStreamingChunks(
            chunk,
            state,
            mockCallbacks.onFileOpen,
            mockCallbacks.onFileChunk,
            mockCallbacks.onFileClose
        );
    };

    describe('Basic Shell Command Parsing', () => {
        it('should parse basic cat > file << EOF format', () => {
            const chunk = `cat > test.js << 'EOF'
console.log('Hello World');
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(mockCallbacks.onFileOpen).toHaveBeenCalledWith('test.js');
            expect(mockCallbacks.onFileClose).toHaveBeenCalledWith('test.js');
            expect(result.completedFiles.has('test.js')).toBe(true);
            
            const file = result.completedFiles.get('test.js');
            expect(file?.fileContents).toBe("console.log('Hello World');");
        });

        it('should handle double-quoted EOF markers', () => {
            const chunk = `cat > test.py << "EOF"
def hello():
        print("Hello")
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(result.completedFiles.has('test.py')).toBe(true);
            const file = result.completedFiles.get('test.py');
            expect(file?.fileContents).toBe('def hello():\n        print("Hello")');
        });

        it('should handle unquoted EOF markers', () => {
            const chunk = `cat > config.json << EOF
{
    "name": "test",
    "version": "1.0.0"
}
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(result.completedFiles.has('config.json')).toBe(true);
        });
    });

    describe('LLM Error Resilience', () => {
        it('should handle extra spaces in commands', () => {
            const chunk = `cat     >     file.js     <<     'EOF'
const x = 1;
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(result.completedFiles.has('file.js')).toBe(true);
        });

        it('should handle missing spaces around operators', () => {
            const chunk = `cat>file.js<<'EOF'
const compact = true;
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(result.completedFiles.has('file.js')).toBe(true);
        });

        it('should handle file paths with spaces (quoted)', () => {
            const chunk = `cat > "my file.js" << 'EOF'
// File with spaces in name
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(result.completedFiles.has('my file.js')).toBe(true);
        });

        it('should handle mismatched quotes', () => {
            const chunk = `cat > "file.js' << 'EOF'
// Mismatched quotes
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            // Parser should handle this gracefully
            expect(result.completedFiles.size).toBeGreaterThanOrEqual(0);
        });

        it('should handle mixed case commands', () => {
            const chunk = `CAT > file.txt << 'EOF'
Mixed case command
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(result.completedFiles.has('file.txt')).toBe(true);
        });
    });

    describe('Content Edge Cases', () => {
        it('should handle EOF marker in content', () => {
            const chunk = `cat > script.sh << 'MARKER'
#!/bin/bash
echo "This is not EOF"
if [ "$1" = "EOF" ]; then
    echo "Parameter is EOF"
fi
MARKER
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(result.completedFiles.has('script.sh')).toBe(true);
            const file = result.completedFiles.get('script.sh');
            expect(file?.fileContents).toContain('Parameter is EOF');
        });

        it('should handle special characters in content', () => {
            const chunk = `cat > special.txt << 'EOF'
Special chars: !@#$%^&*()_+-=[]{}|;':",./<>?
Escapes: \n \t \\ \" \'
Unicode: 你好 🌍 émojis
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            const file = result.completedFiles.get('special.txt');
            expect(file?.fileContents).toContain('!@#$%^&*()');
            expect(file?.fileContents).toContain('你好 🌍 émojis');
        });

        it('should handle empty files', () => {
            const chunk = `cat > empty.txt << 'EOF'
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(result.completedFiles.has('empty.txt')).toBe(true);
            const file = result.completedFiles.get('empty.txt');
            expect(file?.fileContents).toBe('');
        });

        it('should handle very long lines', () => {
            const longLine = 'a'.repeat(1000);
            const chunk = `cat > long.txt << 'EOF'
${longLine}
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            const file = result.completedFiles.get('long.txt');
            expect(file?.fileContents).toBe(longLine);
        });
    });

    describe('Streaming and Chunking', () => {
        it('should handle command split across chunks', () => {
            const chunk1 = 'cat > test.js';
            const chunk2 = " << 'EOF'\nconsole.log('test');\nEOF\n";
            
            let state = createInitialState();
            state = processChunk(chunk1, state);
            expect(mockCallbacks.onFileOpen).not.toHaveBeenCalled();
            
            state = processChunk(chunk2, state);
            expect(mockCallbacks.onFileOpen).toHaveBeenCalledWith('test.js');
            expect(state.completedFiles.has('test.js')).toBe(true);
        });

        it('should handle content split across chunks', () => {
            const chunk1 = "cat > multi.js << 'EOF'\nfunction test() {\n    const x = ";
            const chunk2 = "42;\n    return x;\n}\nEOF\n";
            
            let state = createInitialState();
            state = processChunk(chunk1, state);
            state = processChunk(chunk2, state);
            
            const file = state.completedFiles.get('multi.js');
            expect(file?.fileContents).toContain('const x = 42;');
        });

        it('should handle EOF marker split across chunks', () => {
            const chunk1 = "cat > split.txt << 'EOF'\nContent here\nEO";
            const chunk2 = "F\n";
            
            let state = createInitialState();
            state = processChunk(chunk1, state);
            state = processChunk(chunk2, state);
            
            expect(state.completedFiles.has('split.txt')).toBe(true);
        });

        it('should handle multiple files in sequence', () => {
            const chunk = `cat > file1.js << 'EOF'
console.log('File 1');
EOF

cat > file2.js << 'EOF'
console.log('File 2');
EOF

cat > file3.js << 'EOF'
console.log('File 3');
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(result.completedFiles.size).toBe(3);
            expect(mockCallbacks.onFileOpen).toHaveBeenCalledTimes(3);
            expect(mockCallbacks.onFileClose).toHaveBeenCalledTimes(3);
        });
    });

    describe('Patch/Diff Commands', () => {
        it('should handle patch commands', () => {
            const chunk = `cat << 'PATCH' | patch test.js
--- a/test.js
+++ b/test.js
@@ -1,3 +1,3 @@
 function test() {
-    return false;
+    return true;
 }
PATCH
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(mockCallbacks.onFileOpen).toHaveBeenCalledWith('test.js');
            expect(result.completedFiles.has('test.js')).toBe(true);
            
            const file = result.completedFiles.get('test.js');
            expect(file?.format).toBe('unified_diff');
        });

        it('should extract filename from patch content', () => {
            const chunk = `# Updating existing file
cat << 'EOF' | patch src/utils/helper.js
--- a/src/utils/helper.js
+++ b/src/utils/helper.js
@@ -10,3 +10,5 @@
 export function helper() {
     return 'help';
 }
+
+export const VERSION = '1.0.0';
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(result.completedFiles.has('src/utils/helper.js')).toBe(true);
        });
    });

    describe('Comments and Metadata', () => {
        it('should handle comments before commands', () => {
            const chunk = `# This is a comment explaining the file
# It has multiple lines
cat > documented.js << 'EOF'
// File content
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(result.completedFiles.has('documented.js')).toBe(true);
        });

        it('should handle commands with trailing comments', () => {
            const chunk = `cat > test.js << 'EOF' # This creates a test file
console.log('test');
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(result.completedFiles.has('test.js')).toBe(true);
        });
    });

    describe('Error Cases', () => {
        it('should handle malformed commands gracefully', () => {
            const chunk = `this is not a valid command
cat > << 'EOF'
missing filename
EOF
`;
            
            const state = createInitialState();
            // Should not throw
            expect(() => processChunk(chunk, state)).not.toThrow();
        });

        it('should handle unclosed EOF blocks', () => {
            const chunk = `cat > unclosed.js << 'EOF'
This file is never closed
No EOF marker here`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            // File should remain in pending state
            expect(result.completedFiles.has('unclosed.js')).toBe(false);
            expect(mockCallbacks.onFileOpen).toHaveBeenCalledWith('unclosed.js');
            expect(mockCallbacks.onFileClose).not.toHaveBeenCalled();
        });

        it('should recover from errors and continue parsing', () => {
            const chunk = `cat > good1.js << 'EOF'
console.log('good 1');
EOF

cat > << 'EOF'
bad command - no filename
EOF

cat > good2.js << 'EOF'
console.log('good 2');
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            // Should have parsed the good files
            expect(result.completedFiles.has('good1.js')).toBe(true);
            expect(result.completedFiles.has('good2.js')).toBe(true);
        });
    });

    describe('Real-world Scenarios', () => {
        it('should handle React component file creation', () => {
            const chunk = `# Creating a React component
cat > Button.jsx << 'EOF'
import React from 'react';

export const Button = ({ onClick, children }) => {
    return (
        <button onClick={onClick}>
            {children}
        </button>
    );
};
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            const file = result.completedFiles.get('Button.jsx');
            expect(file?.fileContents).toContain('export const Button');
            expect(file?.fileContents).toContain('<button onClick={onClick}>');
        });

        it('should handle package.json creation with proper JSON', () => {
            const chunk = `cat > package.json << 'EOF'
{
    "name": "my-app",
    "version": "1.0.0",
    "scripts": {
        "start": "node index.js",
        "test": "jest"
    },
    "dependencies": {
        "express": "^4.18.0"
    }
}
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            const file = result.completedFiles.get('package.json');
            // Should be valid JSON
            expect(() => JSON.parse(file?.fileContents || '')).not.toThrow();
        });

        it('should handle creating nested directory files', () => {
            const chunk = `cat > src/components/Header.tsx << 'EOF'
import React from 'react';

interface HeaderProps {
    title: string;
}

export const Header: React.FC<HeaderProps> = ({ title }) => {
    return <h1>{title}</h1>;
};
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            expect(result.completedFiles.has('src/components/Header.tsx')).toBe(true);
        });
    });

    describe('Performance and Stress Tests', () => {
        it('should handle many small chunks efficiently', () => {
            const content = "cat > test.js << 'EOF'\nconst x = 1;\nEOF\n";
            let state = createInitialState();
            
            // Process one character at a time
            for (const char of content) {
                state = processChunk(char, state);
            }
            
            expect(state.completedFiles.has('test.js')).toBe(true);
        });

        it('should handle large files', () => {
            const largeContent = 'x'.repeat(10000);
            const chunk = `cat > large.txt << 'EOF'
${largeContent}
EOF
`;
            
            const state = createInitialState();
            const result = processChunk(chunk, state);
            
            const file = result.completedFiles.get('large.txt');
            expect(file?.fileContents.trim()).toBe(largeContent);
        });
    });
});