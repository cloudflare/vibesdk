// export interface CompleteFileObject {
//     filePath: string;
//     fileContents: string;
// }

import { FileGenerationOutputType } from "../../schemas";

// export interface FileObject extends CompleteFileObject {
//     format: 'full_content' | 'unified_diff';
// }

/**
 * A Chunk of llm output can contain partial contents of multiple files
 * the chunk can be very large and therefore multiple entire files can be present in the chunk
 * along with the partial ending contents of the last file and the beginning contents of the next file
 */

// export interface ParsedChunk {
//     filePath: string;
//     chunk: string;
//     isPartial: boolean;
//     // Maybe add more fields? or change the structure
// }

export interface ParsingState {
    // Current parsing mode for the active file
    currentMode: 'idle' | 'file_creation' | 'diff_patch';
    
    // Current file being processed
    currentFile: string | null;
    
    // Format of the current file being processed
    currentFileFormat: 'full_content' | 'unified_diff' | null;
    
    // Buffer for accumulating content within EOF blocks
    contentBuffer: string;
    
    // EOF marker we're looking for to end current block
    eofMarker: string | null;
    
    // Whether we're currently inside an EOF block
    insideEofBlock: boolean;
    
    // Track files that have been opened (to prevent duplicate opens)
    openedFiles: Set<string>;
    
    // Track files that have been closed (to prevent duplicate closes)
    closedFiles: Set<string>;
    
    // Buffer for partial lines that span across chunks
    partialLineBuffer: string;
    
    // Buffer for accumulating incomplete commands across chunks
    commandBuffer: string;
    
    // Track if we're in the middle of parsing a multi-line command
    parsingMultiLineCommand: boolean;
    
    // Track potential EOF marker detection across chunks
    potentialEofBuffer: string;
    
    // Track the last few characters to detect EOF markers that span chunks
    tailBuffer: string;
    
    // Track line state for proper line reconstruction
    lastChunkEndedWithNewline: boolean;
    
    // Buffer for accumulating content between SCOF file blocks
    betweenFilesBuffer: string;
    
    // Extracted install commands from content between files
    extractedInstallCommands: string[];
}

export interface CodeGenerationStreamingState {
    // Accumulator for the raw chunk stream
    accumulator: string;
    // Completed files map, file path -> FileObject
    completedFiles: Map<string, FileGenerationOutputType>;
    parsingState: ParsingState;
}

export abstract class CodeGenerationFormat {
    constructor() { 
    }

    // Parse a raw streaming chunk, identifying file paths and content
    // Maintain state in CodeGenerationStreamingState.
    // Return the updated state. Maintain all the state in the state object, do not use any global variables.
    // After the last chunk, completedFiles will contain all the files that were generated.
    // onFileOpen, onFileChunk, onFileClose are callbacks to be called sequentially while parsing the chunk from the llm output
    abstract parseStreamingChunks(
        chunk: string, 
        state: CodeGenerationStreamingState,
        onFileOpen: (filePath: string) => void,    // To be called when a new file is opened
        onFileChunk: (filePath: string, chunk: string, format: 'full_content' | 'unified_diff') => void,    // To be called to pass the chunk of a file
        onFileClose: (filePath: string) => void    // To be called when a file is closed
    ): CodeGenerationStreamingState;

    // Serialize FileObject array to a string
    abstract serialize(files: FileGenerationOutputType[]): string;

    // Deserialize a string to FileObject array
    abstract deserialize(serialized: string): FileGenerationOutputType[];

    // Prompt instructions for code generation in the format
    abstract formatInstructions(): string;
}

/*

Use familiar shell patterns for multi-file code generation:

FILE CREATION:
# Creating new file: filename.ext
cat > filename.ext << 'EOF'
[file content here]
EOF

UNIFIED DIFF PATCHES:
# Applying diff to file: filename.ext
cat << 'EOF' | patch filename.ext
@@ -1,3 +1,3 @@
 function example() {
-    old line
+    new line
 }
EOF

IMPORTANT RULES:
1. Command-line paths (cat > filename) ALWAYS override comment paths
2. Use single quotes around EOF markers for consistency
3. Ensure proper line endings and EOF markers
4. Large chunks may contain multiple complete files
5. Format supports streaming with partial file updates

This format enables real-time file generation with websocket callbacks for:
- FILE_GENERATING (when file operation starts)
- FILE_CHUNK_GENERATED (for partial content updates)  
- FILE_GENERATED (when file is completed)`;
*/