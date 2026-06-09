import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SCOFFormat } from './scof';
import { CodeGenerationStreamingState } from './base';

describe('SCOFFormat', () => {
    let scofParser: SCOFFormat;
    let mockCallbacks: {
        onFileOpen: ReturnType<typeof vi.fn>;
        onFileChunk: ReturnType<typeof vi.fn>;
        onFileClose: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        scofParser = new SCOFFormat();
        mockCallbacks = {
            onFileOpen: vi.fn(),
            onFileChunk: vi.fn(),
            onFileClose: vi.fn(),
        };
    });

    const createInitialState = (): CodeGenerationStreamingState => ({
        accumulator: '',
        completedFiles: new Map(),
        parsingState: (scofParser as any).initializeSCOFState(),
    });

    describe('parseStreamingChunks', () => {
        it('should parse a complete shell command file creation', () => {
            const chunk = `cat > src/index.ts << 'EOF'
export function main() {
    console.log('Hello World');
}
EOF
`;

            const state = createInitialState();
            const result = scofParser.parseStreamingChunks(
                chunk,
                state,
                mockCallbacks.onFileOpen,
                mockCallbacks.onFileChunk,
                mockCallbacks.onFileClose
            );

            expect(result.completedFiles.size).toBe(1);
            expect(result.completedFiles.has('src/index.ts')).toBe(true);
            
            const file = result.completedFiles.get('src/index.ts');
            expect(file?.filePath).toBe('src/index.ts');
            expect(file?.fileContents).toBe(`export function main() {
    console.log('Hello World');
}`);
            expect(file?.format).toBe('full_content');

            expect(mockCallbacks.onFileOpen).toHaveBeenCalledWith('src/index.ts');
            expect(mockCallbacks.onFileClose).toHaveBeenCalledWith('src/index.ts');
        });

        it('should handle multiple files in a single chunk', () => {
            const chunk = `cat > file1.js << 'EOF'
console.log('File 1');
EOF

cat > file2.js << 'EOF'
console.log('File 2');
EOF
`;

            const state = createInitialState();
            const result = scofParser.parseStreamingChunks(
                chunk,
                state,
                mockCallbacks.onFileOpen,
                mockCallbacks.onFileChunk,
                mockCallbacks.onFileClose
            );

            expect(result.completedFiles.size).toBe(2);
            expect(result.completedFiles.has('file1.js')).toBe(true);
            expect(result.completedFiles.has('file2.js')).toBe(true);
            
            expect(mockCallbacks.onFileOpen).toHaveBeenCalledTimes(2);
            expect(mockCallbacks.onFileClose).toHaveBeenCalledTimes(2);
        });

        it('should handle streaming chunks correctly', () => {
            const chunk1 = `cat > streaming.ts << 'EOF'
export class StreamingTest {`;
            const chunk2 = `
    constructor() {
        this.name = 'test';
    }
}
EOF
`;

            let state = createInitialState();
            
            // Process first chunk
            state = scofParser.parseStreamingChunks(
                chunk1,
                state,
                mockCallbacks.onFileOpen,
                mockCallbacks.onFileChunk,
                mockCallbacks.onFileClose
            );
            
            expect(state.completedFiles.size).toBe(0); // File not complete yet
            expect(mockCallbacks.onFileOpen).toHaveBeenCalledWith('streaming.ts');
            
            // Process second chunk
            state = scofParser.parseStreamingChunks(
                chunk2,
                state,
                mockCallbacks.onFileOpen,
                mockCallbacks.onFileChunk,
                mockCallbacks.onFileClose
            );
            
            expect(state.completedFiles.size).toBe(1);
            expect(state.completedFiles.has('streaming.ts')).toBe(true);
            expect(mockCallbacks.onFileClose).toHaveBeenCalledWith('streaming.ts');
        });

        it('should handle files with special characters', () => {
            const chunk = `cat > "special chars!@#.js" << 'EOF'
// Special characters in filename
const special = "!@#$%^&*()";
EOF
`;

            const state = createInitialState();
            const result = scofParser.parseStreamingChunks(
                chunk,
                state,
                mockCallbacks.onFileOpen,
                mockCallbacks.onFileChunk,
                mockCallbacks.onFileClose
            );

            expect(result.completedFiles.size).toBe(1);
            expect(result.completedFiles.has('special chars!@#.js')).toBe(true);
        });

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
            const result = scofParser.parseStreamingChunks(
                chunk,
                state,
                mockCallbacks.onFileOpen,
                mockCallbacks.onFileChunk,
                mockCallbacks.onFileClose
            );

            expect(result.completedFiles.size).toBe(1);
            expect(result.completedFiles.has('test.js')).toBe(true);
            
            const file = result.completedFiles.get('test.js');
            expect(file?.format).toBe('unified_diff');
        });

        it('should handle comments and empty lines', () => {
            const chunk = `# This is a comment
# Creating a new file

cat > commented.js << 'EOF'
// File with comments before it
const x = 1;
EOF
`;

            const state = createInitialState();
            const result = scofParser.parseStreamingChunks(
                chunk,
                state,
                mockCallbacks.onFileOpen,
                mockCallbacks.onFileChunk,
                mockCallbacks.onFileClose
            );

            expect(result.completedFiles.size).toBe(1);
            expect(result.completedFiles.has('commented.js')).toBe(true);
        });

        it('should handle EOF marker variations', () => {
            const chunk = `cat > double.js << "MARKER"
// Double quoted marker
MARKER

cat > unquoted.js << END
// Unquoted marker
END

cat > single.js << 'DONE'
// Single quoted marker
DONE
`;

            const state = createInitialState();
            const result = scofParser.parseStreamingChunks(
                chunk,
                state,
                mockCallbacks.onFileOpen,
                mockCallbacks.onFileChunk,
                mockCallbacks.onFileClose
            );

            expect(result.completedFiles.size).toBe(3);
            expect(result.completedFiles.has('double.js')).toBe(true);
            expect(result.completedFiles.has('unquoted.js')).toBe(true);
            expect(result.completedFiles.has('single.js')).toBe(true);
        });
    });

    describe('deserialize', () => {
        it('should deserialize SCOF format to files', () => {
            const serialized = `cat > test.js << 'EOF'
console.log("test");
EOF

cat << 'EOF' | patch other.js
--- a/other.js
+++ b/other.js
@@ -1 +1 @@
-old
+new
EOF
`;

            const files = scofParser.deserialize(serialized);
            
            expect(files).toHaveLength(2);
            expect(files[0].filePath).toBe('test.js');
            expect(files[0].format).toBe('full_content');
            expect(files[1].filePath).toBe('other.js');
            expect(files[1].format).toBe('unified_diff');
        });
    });
});