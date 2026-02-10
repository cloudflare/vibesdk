// ============================================================================
// Base64 / Binary Encoding Utilities
// ============================================================================

export function concatBuffers(chunks: Uint8Array[]): Uint8Array {
    if (chunks.length === 0) return new Uint8Array(0);
    if (chunks.length === 1) return chunks[0];
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

/** Convert a Uint8Array to an ArrayBuffer suitable for SQL BLOB binding. */
export function toBuffer(bytes: Uint8Array): ArrayBuffer {
    if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
        return bytes.buffer as ArrayBuffer;
    }
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Decode a row's data column into a Uint8Array, handling both BLOB and legacy base64. */
export function rowDataToBytes(data: ArrayBuffer | string | null): Uint8Array {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (typeof data === 'string' && data.length > 0) return base64ToUint8Array(data);
    return new Uint8Array(0);
}

/** Decode a base64 string into a Uint8Array. */
export function base64ToUint8Array(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
