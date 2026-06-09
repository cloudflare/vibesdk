import { unzipSync } from 'fflate';
import type { TemplateFile } from './sandboxTypes';

/**
 * In-memory zip extraction service for Cloudflare Workers
 * Extracts and encodes file contents as UTF-8 strings or base64 for binary data
 */
export class ZipExtractor {
    // Max uncompressed size (50MB)
    private static readonly MAX_UNCOMPRESSED_SIZE = 50 * 1024 * 1024;

    // Known binary file extensions - skip UTF-8 decode attempt
    private static readonly BINARY_EXTENSIONS = new Set([
        '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp',
        '.woff', '.woff2', '.ttf', '.otf', '.eot',
        '.zip', '.tar', '.gz', '.pdf',
        '.mp3', '.mp4', '.webm', '.ogg',
        '.bin', '.exe', '.dll', '.so'
    ]);

    // TextDecoder
    private static readonly utf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });

    /**
     * Extracts all files from a zip archive
     * 
     * Text files are decoded as UTF-8. Binary files that cannot be decoded as UTF-8
     * are encoded as base64 with a "base64:" prefix.
     * 
     * @param zipBuffer - ArrayBuffer containing the zip file
     * @returns Array of extracted files with paths and encoded contents
     * @throws Error if zip is invalid or exceeds size limits
     */
    static extractFiles(zipBuffer: ArrayBuffer): TemplateFile[] {
        try {
            const uint8Array = new Uint8Array(zipBuffer);
            const unzipped = unzipSync(uint8Array);
            
            const files: TemplateFile[] = [];
            let totalUncompressedSize = 0;
            
            for (const [filePath, fileData] of Object.entries(unzipped)) {
                // Skip directories
                if (filePath.endsWith('/')) {
                    continue;
                }
                
                // Check size limits
                totalUncompressedSize += fileData.byteLength;
                if (totalUncompressedSize > this.MAX_UNCOMPRESSED_SIZE) {
                    throw new Error(
                        `Total uncompressed size exceeds ${this.MAX_UNCOMPRESSED_SIZE / 1024 / 1024}MB limit`
                    );
                }
                
                let fileContents: string;
                
                // Check if file extension is known binary
                const isBinary = this.isBinaryExtension(filePath);
                
                if (isBinary) {
                    // Skip UTF-8 decode attempt, go straight to base64
                    fileContents = `base64:${this.base64Encode(fileData)}`;
                } else {
                    // Attempt UTF-8 decoding with fatal mode (throws on invalid)
                    try {
                        fileContents = this.utf8Decoder.decode(fileData);
                    } catch {
                        // Binary file detected, encode as base64
                        fileContents = `base64:${this.base64Encode(fileData)}`;
                    }
                }
                
                files.push({
                    filePath,
                    fileContents
                });
            }
            
            return files;
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(`Failed to extract zip: ${error.message}`);
            }
            throw new Error('Failed to extract zip: Unknown error');
        }
    }

    /**
     * Decodes file contents to bytes
     * 
     * Handles both base64-encoded binary data and UTF-8 text
     * 
     * @param fileContents - File content string (may be base64-prefixed)
     * @returns Byte array representation of the file
     */
    static decodeFileContents(fileContents: string): Uint8Array {
        if (fileContents.startsWith('base64:')) {
            const base64Data = fileContents.substring(7);
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes;
        }
        
        // UTF-8 text content
        const encoder = new TextEncoder();
        return encoder.encode(fileContents);
    }

    /**
     * Checks if file contents are base64-encoded
     * 
     * @param fileContents - File content string
     * @returns True if content is base64-encoded, false otherwise
     */
    static isBinaryContent(fileContents: string): boolean {
        return fileContents.startsWith('base64:');
    }

    /**
     * check if file extension is known binary type
     */
    private static isBinaryExtension(filePath: string): boolean {
        const lastDot = filePath.lastIndexOf('.');
        if (lastDot === -1) return false;
        
        const ext = filePath.substring(lastDot).toLowerCase();
        return this.BINARY_EXTENSIONS.has(ext);
    }

    /**
     * base64 encoding
     */
    private static base64Encode(data: Uint8Array): string {
        let binaryString = '';
        const len = data.length;
        
        // Process in chunks
        const chunkSize = 8192;
        for (let i = 0; i < len; i += chunkSize) {
            const chunk = data.subarray(i, Math.min(i + chunkSize, len));
            binaryString += String.fromCharCode(...chunk);
        }
        
        return btoa(binaryString);
    }
}
