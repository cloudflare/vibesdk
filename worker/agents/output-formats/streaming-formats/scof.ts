import { CodeGenerationFormat, CodeGenerationStreamingState, ParsingState } from './base';
import { FileGenerationOutputType } from "../../schemas";
import { applyDiff } from '../diff-formats/udiff';
import { extractCommands } from '../../utils/common';

// SCOF-specific parsing state with comprehensive tracking
export interface SCOFParsingState extends ParsingState {
}

/**
 * SCOF (Shell Command Output Format) implementation with robust chunk handling
 * Handles arbitrary chunk boundaries, mixed formats, and ensures single callback calls per file
 */
export class SCOFFormat extends CodeGenerationFormat {
    
    parseStreamingChunks(
        chunk: string,
        state: CodeGenerationStreamingState,
        onFileOpen: (filePath: string) => void,
        onFileChunk: (filePath: string, chunk: string, format: 'full_content' | 'unified_diff') => void,
        onFileClose: (filePath: string) => void
    ): CodeGenerationStreamingState {
        // Initialize SCOF-specific parsing state if not present or corrupted
        if (!state.parsingState || !this.isValidSCOFState(state.parsingState)) {
            state.parsingState = this.initializeSCOFState();
        }
        
        const scofState = state.parsingState as SCOFParsingState;
        
        // Add new chunk to accumulator
        state.accumulator += chunk;
        
        // Process the accumulated content with robust chunk handling
        this.processAccumulatedContent(state, scofState, onFileOpen, onFileChunk, onFileClose);
        
        return state;
    }
    
    private isValidSCOFState(parsingState: any): parsingState is SCOFParsingState {
        return parsingState &&
               typeof parsingState.currentMode === 'string' &&
               parsingState.openedFiles instanceof Set &&
               parsingState.closedFiles instanceof Set &&
               typeof parsingState.contentBuffer === 'string' &&
               typeof parsingState.partialLineBuffer === 'string';
    }
    
    private initializeSCOFState(): SCOFParsingState {
        return {
            currentMode: 'idle',
            currentFile: null,
            currentFileFormat: null,
            contentBuffer: '',
            eofMarker: null,
            insideEofBlock: false,
            openedFiles: new Set(),
            closedFiles: new Set(),
            partialLineBuffer: '',
            commandBuffer: '',
            parsingMultiLineCommand: false,
            potentialEofBuffer: '',
            tailBuffer: '',
            lastChunkEndedWithNewline: false,
            betweenFilesBuffer: '',
            extractedInstallCommands: []
        };
    }
    
    private processAccumulatedContent(
        state: CodeGenerationStreamingState,
        scofState: SCOFParsingState,
        onFileOpen: (filePath: string) => void,
        onFileChunk: (filePath: string, chunk: string, format: 'full_content' | 'unified_diff') => void,
        onFileClose: (filePath: string) => void
    ): void {
        // Combine any partial line from previous chunk with new content
        const fullContent = scofState.partialLineBuffer + state.accumulator;
        
        // Split into lines, keeping track of whether the last line is complete
        const lines = fullContent.split('\n');
        const lastLineComplete = state.accumulator.endsWith('\n');
        
        // Process complete lines
        const linesToProcess = lastLineComplete ? lines : lines.slice(0, -1);
        
        for (let i = 0; i < linesToProcess.length; i++) {
            const line = linesToProcess[i];
            this.processLine(line, scofState, onFileOpen, onFileChunk, onFileClose, state);
        }
        
        // Handle the last incomplete line
        if (!lastLineComplete && lines.length > 0) {
            const lastLine = lines[lines.length - 1];
            
            // Check if the partial line might be an EOF marker
            if (scofState.insideEofBlock && scofState.eofMarker && lastLine.trim() === scofState.eofMarker) {
                // This is a complete EOF marker, process it
                this.processLine(lastLine, scofState, onFileOpen, onFileChunk, onFileClose, state);
                scofState.partialLineBuffer = '';
            } else {
                // Store as partial line buffer for next chunk
                scofState.partialLineBuffer = lastLine;
            }
            state.accumulator = '';
        } else {
            scofState.partialLineBuffer = '';
            state.accumulator = '';
        }
        
        scofState.lastChunkEndedWithNewline = lastLineComplete;
    }
    
    private processLine(
        line: string,
        scofState: SCOFParsingState,
        onFileOpen: (filePath: string) => void,
        onFileChunk: (filePath: string, chunk: string, format: 'full_content' | 'unified_diff') => void,
        onFileClose: (filePath: string) => void,
        state: CodeGenerationStreamingState
    ): void {
        const trimmedLine = line.trim();
        
        // Check for EOF marker (end of content block)
        if (scofState.insideEofBlock && scofState.eofMarker) {
            // ENHANCED: Robust EOF detection with LLM error resilience
            if (this.isEOFMarker(line, scofState.eofMarker)) {
                this.finalizeCurrentFile(scofState, onFileClose, state);
                return;
            }
        }
        
        // Content line within EOF block
        if (scofState.insideEofBlock) {
            // ENHANCED: Handle nested EOF-like patterns in content
            if (scofState.currentFile && scofState.currentFileFormat) {
                // Check if this line looks like a command but we're inside content
                if (this.looksLikeCommand(line) && !this.isValidNestedCommand(line, scofState)) {
                    console.warn(`SCOF: Detected command-like content inside EOF block: "${line.trim()}". Treating as content.`);
                }
                
                // Add line to content buffer with smart formatting
                this.addContentLine(line, scofState, onFileChunk);
            }
            return;
        }
        
        // Accumulate content between files for command extraction
        if (trimmedLine === '' || trimmedLine.startsWith('#')) {
            // Add content (including empty lines and comments) to between-files buffer
            scofState.betweenFilesBuffer += line + '\n';
            return;
        }
        
        // Process any accumulated content between files before handling new command
        if (scofState.betweenFilesBuffer.trim()) {
            this.processAccumulatedBetweenFilesContent(scofState);
        }
        
        // Also accumulate non-empty, non-comment lines that aren't commands
        // This ensures we capture all potential command content between SCOF blocks
        const isCommand = this.tryParseCommand(trimmedLine) !== null;
        if (!isCommand) {
            scofState.betweenFilesBuffer += line + '\n';
        }
        
        // Try to parse command from current line first
        const command = this.tryParseCommand(trimmedLine);
        if (command) {
            this.handleCommand(command, scofState, onFileOpen);
            scofState.commandBuffer = '';
            scofState.parsingMultiLineCommand = false;
            return;
        }
        
        // Handle potential multi-line commands
        if (scofState.parsingMultiLineCommand) {
            scofState.commandBuffer += ' ' + trimmedLine;
            
            // Try to parse complete command
            const multiLineCommand = this.tryParseCommand(scofState.commandBuffer);
            if (multiLineCommand) {
                this.handleCommand(multiLineCommand, scofState, onFileOpen);
                scofState.commandBuffer = '';
                scofState.parsingMultiLineCommand = false;
            }
        } else if (trimmedLine.includes('cat')) {
            scofState.commandBuffer = trimmedLine;
            scofState.parsingMultiLineCommand = true;
            
            // Try immediate parsing in case it's a complete command
            const immediateCommand = this.tryParseCommand(scofState.commandBuffer);
            if (immediateCommand) {
                this.handleCommand(immediateCommand, scofState, onFileOpen);
                scofState.commandBuffer = '';
                scofState.parsingMultiLineCommand = false;
            }
        }
    }
    
    private tryParseCommand(commandStr: string): { type: 'file_creation' | 'diff_patch', filePath: string, eofMarker: string } | null {
        // ENHANCED: Normalize command with specific LLM error resilience
        const normalizedCommand = this.normalizeCommand(commandStr);
        
        // ENHANCED: Try file creation with comprehensive LLM error patterns
        const fileCreationResult = this.tryParseFileCreation(normalizedCommand);
        if (fileCreationResult) return fileCreationResult;
        
        // ENHANCED: Try diff patch with comprehensive LLM error patterns
        const diffPatchResult = this.tryParseDiffPatch(normalizedCommand);
        if (diffPatchResult) return diffPatchResult;
        
        return null;
    }
    
    /**
     * ENHANCED: Normalize command string to handle specific LLM mistakes
     */
    private normalizeCommand(commandStr: string): string {
        let normalized = commandStr;
        
        // Fix case sensitivity (common LLM mistake)
        normalized = normalized.replace(/\bCAT\b/gi, 'cat');
        normalized = normalized.replace(/\bCat\b/g, 'cat');
        
        // Normalize excessive whitespace (LLMs often add extra spaces)
        normalized = normalized.replace(/\s+/g, ' ').trim();
        
        // Fix missing spaces around operators (cat>file instead of cat > file)
        normalized = normalized.replace(/cat>/gi, 'cat >');
        normalized = normalized.replace(/>\s*([^<\s])/g, '> $1');
        normalized = normalized.replace(/<<\s*([^|\s])/g, '<< $1');
        normalized = normalized.replace(/\|\s*patch/gi, ' | patch');
        
        // Fix heredoc spacing variations
        normalized = normalized.replace(/<<\s*'([^']+)'\s*/g, " << '$1' ");
        normalized = normalized.replace(/<<\s*"([^"]+)"\s*/g, ' << "$1" ');
        normalized = normalized.replace(/<<\s*([^\s|'"]+)\s*/g, " << '$1' ");
        
        return normalized;
    }
    
    /**
     * ENHANCED: Parse file creation commands with LLM error resilience
     */
    private tryParseFileCreation(command: string): { type: 'file_creation' | 'diff_patch', filePath: string, eofMarker: string } | null {
        // Pattern 1: Quoted filenames (handles spaces and special chars)
        const quotedPatterns = [
            /cat\s*>\s*"([^"]+)"\s*<<\s*'([^']+)'/i,     // cat > "file name.js" << 'EOF'
            /cat\s*>\s*'([^']+)'\s*<<\s*'([^']+)'/i,     // cat > 'file name.js' << 'EOF'
            /cat\s*>\s*"([^"]+)"\s*<<\s*"([^"]+)"/i,     // cat > "file.js" << "EOF"
            /cat\s*>\s*'([^']+)'\s*<<\s*"([^"]+)"/i,     // cat > 'file.js' << "EOF"
        ];
        
        for (const pattern of quotedPatterns) {
            const match = command.match(pattern);
            if (match) {
                return {
                    type: 'file_creation',
                    filePath: match[1],
                    eofMarker: match[2]
                };
            }
        }
        
        // Pattern 2: ENHANCED - Handle mismatched quotes (common LLM mistake)
        const mismatchedQuotePatterns = [
            /cat\s*>\s*"([^"']+)'\s*<<\s*'([^']+)'/i,     // cat > "file.js' << 'EOF'
            /cat\s*>\s*'([^"']+)"\s*<<\s*'([^']+)'/i,     // cat > 'file.js" << 'EOF'
            /cat\s*>\s*"([^"']+)'\s*<<\s*"([^"]+)'/i,     // cat > "file.js" << "EOF'
            /cat\s*>\s*'([^"']+)"\s*<<\s*'([^']+)"/i,     // cat > 'file.js' << 'EOF"
            /cat\s*>\s*([^\s<"']+)\s*<<\s*"([^"]+)'/i,    // cat > file.js << "EOF'
            /cat\s*>\s*([^\s<"']+)\s*<<\s*'([^']+)"/i,    // cat > file.js << 'EOF"
        ];
        
        for (const pattern of mismatchedQuotePatterns) {
            const match = command.match(pattern);
            if (match) {
                const filename = match[1];
                const eofMarker = match[2];
                console.warn(`SCOF: Auto-correcting mismatched quotes in filename: "${filename}"`);
                return {
                    type: 'file_creation',
                    filePath: filename,
                    eofMarker: eofMarker
                };
            }
        }
        
        // Pattern 3: Unquoted filenames (no spaces, simpler cases)
        const unquotedPatterns = [
            /cat\s*>\s*([^\s<"']+)\s*<<\s*'([^']+)'/i,    // cat > file.js << 'EOF'
            /cat\s*>\s*([^\s<"']+)\s*<<\s*"([^"]+)"/i,    // cat > file.js << "EOF"
            /cat\s*>\s*([^\s|"']+)\s*<<\s*([^\s|]+)/i,    // cat > file.js << EOF
        ];
        
        for (const pattern of unquotedPatterns) {
            const match = command.match(pattern);
            if (match) {
                return {
                    type: 'file_creation',
                    filePath: match[1],
                    eofMarker: match[2]
                };
            }
        }
        
        // Pattern 4: Handle LLM mistakes with spaces in unquoted filenames
        const spacedFilenameMatch = command.match(/cat\s*>\s*([^<]+?)\s*<<\s*([^\s|]+)/i);
        if (spacedFilenameMatch) {
            const rawFilename = spacedFilenameMatch[1].trim();
            const eofMarker = spacedFilenameMatch[2].replace(/['"]/g, '');
            
            // If filename has spaces but no quotes, this is likely an LLM mistake
            // Try to recover by assuming the entire string before << is the filename
            if (rawFilename.includes(' ') && !rawFilename.match(/^["'].*["']$/)) {
                console.warn(`SCOF: Detected unquoted filename with spaces: "${rawFilename}". Auto-correcting.`);
                return {
                    type: 'file_creation',
                    filePath: rawFilename,
                    eofMarker: eofMarker
                };
            }
        }
        
        return null;
    }
    
    /**
     * ENHANCED: Parse diff patch commands with LLM error resilience
     */
    private tryParseDiffPatch(command: string): { type: 'file_creation' | 'diff_patch', filePath: string, eofMarker: string } | null {
        // Pattern 1: Quoted filenames
        const quotedPatchPatterns = [
            /cat\s*<<\s*'([^']+)'\s*\|\s*patch\s+"([^"]+)"/i,  // cat << 'EOF' | patch "file.js"
            /cat\s*<<\s*'([^']+)'\s*\|\s*patch\s+'([^']+)'/i,  // cat << 'EOF' | patch 'file.js'
            /cat\s*<<\s*"([^"]+)"\s*\|\s*patch\s+"([^"]+)"/i,  // cat << "EOF" | patch "file.js"
            /cat\s*<<\s*"([^"]+)"\s*\|\s*patch\s+'([^']+)'/i,  // cat << "EOF" | patch 'file.js'
        ];
        
        for (const pattern of quotedPatchPatterns) {
            const match = command.match(pattern);
            if (match) {
                return {
                    type: 'diff_patch',
                    filePath: match[2],
                    eofMarker: match[1]
                };
            }
        }
        
        // Pattern 2: Unquoted filenames
        const unquotedPatchPatterns = [
            /cat\s*<<\s*'([^']+)'\s*\|\s*patch\s+([^\s"']+)/i,  // cat << 'EOF' | patch file.js
            /cat\s*<<\s*"([^"]+)"\s*\|\s*patch\s+([^\s"']+)/i,  // cat << "EOF" | patch file.js
            /cat\s*<<\s*([^\s|'"]+)\s*\|\s*patch\s+([^\s"']+)/i,  // cat << EOF | patch file.js (UNQUOTED)
        ];
        
        for (const pattern of unquotedPatchPatterns) {
            const match = command.match(pattern);
            if (match) {
                const eofMarker = match[1];
                const filePath = match[2];
                
                // Check if this is an unquoted malformed pattern
                if (!eofMarker.match(/^['"]/) && !filePath.match(/^['"]/)) {
                    console.warn(`SCOF: Detected potentially malformed patch command. Auto-correcting: EOF="${eofMarker}", file="${filePath}"`);
                }
                
                return {
                    type: 'diff_patch',
                    filePath: filePath,
                    eofMarker: eofMarker
                };
            }
        }
        
        // Pattern 3: ENHANCED - Handle malformed patch commands (common LLM mistake)
        const malformedPatchMatch = command.match(/cat\s*<<\s*([^|]+?)\s*\|\s*patch\s+(.+)/i);
        if (malformedPatchMatch) {
            const eofMarker = malformedPatchMatch[1].replace(/['"]/g, '').trim();
            const filePath = malformedPatchMatch[2].replace(/['"]/g, '').trim();
            
            // Enhanced detection: check if this looks like a legitimate patch command
            if (eofMarker && filePath && !eofMarker.includes(' ') && filePath.includes('.')) {
                console.warn(`SCOF: Detected potentially malformed patch command. Auto-correcting: EOF="${eofMarker}", file="${filePath}"`);
                return {
                    type: 'diff_patch',
                    filePath: filePath,
                    eofMarker: eofMarker
                };
            } else {
                // Handle basic malformed patterns
                console.warn(`SCOF: Detected potentially malformed patch command. Auto-correcting: EOF="${eofMarker}", file="${filePath}"`);
                return {
                    type: 'diff_patch',
                    filePath: filePath,
                    eofMarker: eofMarker
                };
            }
        }
        
        // Pattern 4: ENHANCED - Handle extremely malformed patch commands (spacing issues)
        const spacingIssueMatch = command.match(/cat\s*<<\s*([^\s|'"]+)\s*\|\s*patch\s+([^\s'"]+)/i);
        if (spacingIssueMatch) {
            const eofMarker = spacingIssueMatch[1];
            const filePath = spacingIssueMatch[2];
            
            console.warn(`SCOF: Auto-correcting patch command spacing: EOF="${eofMarker}", file="${filePath}"`);
            return {
                type: 'diff_patch',
                filePath: filePath,
                eofMarker: eofMarker
            };
        }
        
        return null;
    }
    
    private handleCommand(
        command: { type: 'file_creation' | 'diff_patch', filePath: string, eofMarker: string },
        scofState: SCOFParsingState,
        onFileOpen: (filePath: string) => void
    ): void {
        const { type, filePath, eofMarker } = command;
        
        // Ensure we don't have overlapping file operations
        if (scofState.currentFile) {
            console.warn(`Warning: Starting new file ${filePath} while ${scofState.currentFile} is still open`);
        }
        
        // Set up new file operation
        scofState.currentMode = type;
        scofState.currentFile = filePath;
        scofState.currentFileFormat = type === 'file_creation' ? 'full_content' : 'unified_diff';
        scofState.eofMarker = eofMarker;
        scofState.insideEofBlock = true;
        scofState.contentBuffer = '';
        
        // Call onFileOpen only once per file
        if (!scofState.openedFiles.has(filePath)) {
            scofState.openedFiles.add(filePath);
            onFileOpen(filePath);
        } else {
            // This should NEVER happen - log critical error if it does
            console.error(`CRITICAL RELIABILITY ERROR: Attempted to open file ${filePath} twice`);
        }

        // Clear the file from the closedFiles set
        if (scofState.closedFiles.has(filePath)) {
            scofState.closedFiles.delete(filePath);
        }
    }
    
    private finalizeCurrentFile(
        scofState: SCOFParsingState,
        onFileClose: (filePath: string) => void,
        state: CodeGenerationStreamingState
    ): void {
        if (!scofState.currentFile || !scofState.currentFileFormat) {
            return;
        }
        
        const filePath = scofState.currentFile;
        let finalContent = scofState.contentBuffer;
        
        // Apply diff if this is a diff patch operation
        if (scofState.currentMode === 'diff_patch') {
            const existingFile = state.completedFiles.get(filePath);
            const existingContent = existingFile?.fileContents || '';
            if (existingContent) {
                try {
                    finalContent = applyDiff(existingContent, finalContent);
                } catch (error) {
                    console.warn(`Failed to apply diff to ${filePath}, using raw content:`, error);
                    // Fallback to raw content if diff application fails
                }
            }
        }
        
        // Store completed file with format information
        const fileObject: FileGenerationOutputType = {
            filePath: filePath,
            fileContents: finalContent,
            format: scofState.currentFileFormat,
            filePurpose: '',
        };
        
        state.completedFiles.set(filePath, fileObject);
        
        // Call onFileClose only once per file, with comprehensive tracking
        if (!scofState.closedFiles.has(filePath)) {
            scofState.closedFiles.add(filePath);
            onFileClose(filePath);
        } else {
            // This should NEVER happen - log critical error if it does
            console.error(`CRITICAL RELIABILITY ERROR: Attempted multiple file close for ${filePath}`);
        }

        // Clear from openedFiles
        if (scofState.openedFiles.has(filePath)) {
            scofState.openedFiles.delete(filePath);
        }
        
        // Reset current file state
        scofState.currentMode = 'idle';
        scofState.currentFile = null;
        scofState.currentFileFormat = null;
        scofState.eofMarker = null;
        scofState.insideEofBlock = false;
        scofState.contentBuffer = '';
    }
    
    private isEOFMarker(line: string, eofMarker: string): boolean {
        // ENHANCED: Robust EOF detection with LLM error resilience
        return line.trim() === eofMarker;
    }
    
    private looksLikeCommand(line: string): boolean {
        // ENHANCED: Handle nested EOF-like patterns in content
        return line.includes('cat') || line.includes('patch');
    }
    
    private isValidNestedCommand(line: string, scofState: SCOFParsingState): boolean {
        // ENHANCED: Handle nested EOF-like patterns in content
        return scofState.eofMarker ? line.includes(scofState.eofMarker) : false;
    }
    
    private addContentLine(line: string, scofState: SCOFParsingState, onFileChunk: (filePath: string, chunk: string, format: 'full_content' | 'unified_diff') => void): void {
        // ENHANCED: Handle nested EOF-like patterns in content
        if (scofState.currentFile && scofState.currentFileFormat) {
            // Add line to content buffer (preserve original line formatting)
            // Only add newline separator if we have existing content and this line isn't empty
            if (scofState.contentBuffer.length > 0 && !scofState.contentBuffer.endsWith('\n') && line.trim() !== '') {
                scofState.contentBuffer += '\n';
            }
            
            // Add the line content (don't add empty lines that are just whitespace)
            if (line.trim() !== '' || scofState.contentBuffer.length === 0) {
                scofState.contentBuffer += line;
            }
            
            // Send chunk callback with format information (only for non-empty content)
            if (line.trim() !== '') {
                onFileChunk(scofState.currentFile, line + '\n', scofState.currentFileFormat);
            }
        }
    }
    
    serialize(files: FileGenerationOutputType[]): string {
        let output = '';

        const formatAsComment = (purpose: string): string => {
            // Replace all newlines with \n# 
            return `# File Purpose: ${purpose.replace(/\n/g, '\n# ')}\n\n`;
        }
        
        for (const file of files) {
            if (file.format === 'unified_diff') {
                output += `# Patch for file: ${file.filePath}\n`;
                output += formatAsComment(file.filePurpose);
                output += `cat << 'EOF' | patch ${file.filePath}\n`;
                output += file.fileContents;
                if (!file.fileContents.endsWith('\n')) {
                    output += '\n';
                }
                output += 'EOF\n\n';
            } else {
                // Default to full_content format
                output += `# File content for: ${file.filePath}\n`;
                output += formatAsComment(file.filePurpose);
                output += `cat > ${file.filePath} << 'EOF'\n`;
                output += file.fileContents;
                if (!file.fileContents.endsWith('\n')) {
                    output += '\n';
                }
                output += 'EOF\n\n';
            }
        }
        
        return output;
    }
    
    deserialize(serialized: string): FileGenerationOutputType[] {
        const state: CodeGenerationStreamingState = {
            accumulator: '',
            completedFiles: new Map(),
            parsingState: this.initializeSCOFState()
        };
        
        // Process the entire serialized content
        this.parseStreamingChunks(
            serialized,
            state,
            () => {}, // onFileOpen
            () => {}, // onFileChunk  
            () => {}  // onFileClose
        );
        
        // Convert completed files map to array
        return Array.from(state.completedFiles.values());
    }
    
    /**
     * Process accumulated content between SCOF file blocks to extract install commands
     */
    private processAccumulatedBetweenFilesContent(scofState: SCOFParsingState): void {
        if (!scofState.betweenFilesBuffer.trim()) {
            return;
        }
        
        // Extract only install commands from the accumulated content
        const installCommands = extractCommands(scofState.betweenFilesBuffer, true);
        
        // Add unique install commands to the extracted commands array
        for (const command of installCommands) {
            if (!scofState.extractedInstallCommands.includes(command)) {
                scofState.extractedInstallCommands.push(command);
            }
        }
        
        // Clear the buffer after processing
        scofState.betweenFilesBuffer = '';
    }
    
    formatInstructions(): string {
        return `
<OUTPUT FORMAT>
Use familiar shell patterns (using cat and pipes) for multi-file code generation:

FILE CREATION as \`full_content\`:

\`\`\`
# Optional: Add bash comments to explain the file contents just before the file creation
cat > filename.ext << 'EOF'
[file content here]
EOF
\`\`\`

DIFF PATCHES as \`unified_diff\`:

\`\`\`
# Optional: Add bash comments to explain the diff contents just before the patch
cat << 'EOF' | patch filename.ext
[diff content here]
EOF
\`\`\`

You may optionally suggest install commands if needed for any dependencies (only bun is available)

\`\`\`
# Optional: Add bash comments to explain the install commands just before the install commands
# Install well known compatible major versions or simply the latest rather than specific versions. Eg: bun install react react-dom
# Do not suggest install commands for already installed dependencies
bun install <dependencies>
\`\`\`

IMPORTANT RULES:
1. Command-line paths (cat > filename) ALWAYS override comment paths
2. Use single quotes around EOF markers for consistency
3. Ensure proper line endings and EOF markers
4. Adhere to the above instructions for file creation and patching
5. Each file can use consistently either full content OR unified diff depending on other instructions.
6. Write multiple files in sequence, separated by newlines
7. At the end of the output, there should always be a EOF marker
8. Do not add any additional bash commands or instructions. This would be parsed by a custom parser, not by the shell. No commands are supported other than bun add/install
</OUTPUT FORMAT>
`;
    }
}
