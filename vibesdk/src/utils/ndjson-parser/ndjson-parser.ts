export async function* ndjsonStream(response: Response) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? "";

        for (const line of lines) {
            if (line.trim()) {
                yield JSON.parse(line);
            }
        }
    }

    // Handle leftover buffer
    if (buffer.trim()) {
        yield JSON.parse(buffer);
    }
}


// Synchronous NDJSON parser for testing
type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

export class NDJSONStreamParser {
    private buffer = '';
    private onMessage: (message: JSONValue) => void;

    constructor(onMessage: (message: JSONValue) => void) {
        this.onMessage = onMessage;
    }

    processChunk(chunk: string): void {
        this.buffer += chunk;
        
        // Handle both \n and \r\n line endings
        const lines = this.buffer.split(/\r?\n/);
        
        // Keep the last partial line in the buffer
        this.buffer = lines.pop() || '';
        
        // Process complete lines
        for (const line of lines) {
            if (line.trim()) {
                try {
                    const message = JSON.parse(line);
                    this.onMessage(message);
                } catch (error) {
                    // Silently ignore invalid JSON
                    console.warn('Invalid JSON in NDJSON stream:', line);
                }
            }
        }
    }
}

export function createRepairingJSONParser() {
    let buffer = '';

    /* util – try JSON.parse without crashing -------------------------- */
    const parse = (str: string) => { try { return JSON.parse(str); } catch { 
        // pass
    } };

    /* STEP-1: close strings when required ----------------------------- */
    function closeStrings(src: string) {
        const out = [];
        let inStr = false, esc = false;

        for (let i = 0; i < src.length; i++) {
            const ch = src[i];

            if (inStr) {
                if (esc) { esc = false; out.push(ch); continue; }
                if (ch === '\\') { esc = true; out.push(ch); continue; }
                if (ch === '"') { inStr = false; out.push(ch); continue; }

                if (ch === ',') {                         // possible string-end
                    let j = i + 1;
                    while (j < src.length && /\s/.test(src[j])) j++;
                    const nxt = src[j] || '';
                    if (nxt === '"' || nxt === '}' || nxt === ']') {
                        out.push('"');                        // ← close the string
                        inStr = false;
                        i--;                                 // re-process the comma
                        continue;
                    }
                }
                out.push(ch);                             // normal char in str
                continue;
            }

            if (ch === '"') { inStr = true; out.push(ch); }
            else out.push(ch);
        }
        if (inStr) out.push('"');                     // EOF inside a string
        return out.join('');
    }

    /* STEP-2: kill dangling commas ------------------------------------ */
    const stripCommas = (s: string) => s.replace(/,\s*([}\]])/g, '$1');

    /* STEP-3: add missing  }  and  ]  --------------------------------- */
    function balanceBrackets(s: string) {
        let inStr = false, esc = false, obj = 0, arr = 0;
        for (const ch of s) {
            if (inStr) {
                if (esc) esc = false;
                else if (ch === '\\') esc = true;
                else if (ch === '"') inStr = false;
                continue;
            }
            if (ch === '"') inStr = true;
            else if (ch === '{') obj++;
            else if (ch === '}') obj--;
            else if (ch === '[') arr++;
            else if (ch === ']') arr--;
        }
        return s + ']'.repeat(Math.max(0, arr)) + '}'.repeat(Math.max(0, obj));
    }

    /* STEP-4: give empty string to dangling keys ---------------------- */
    function fixKeys(s: string) {
        // (a) key right before a }
        s = s.replace(/([{,]\s*)"([^"\\]*(?:\\.[^"\\]*)*)"\s*}(?=,?\s*[\]}]|$)/g,
            (_, pre, k) => `${pre}"${k}": ""}`);

        // (b) key that already has a colon but no value
        s = s.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"\s*:\s*(?=[}\],]|$)/g,
            '"$1": ""');

        // (c) key at very end of the stream
        s = s.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"\s*$/g,
            '"$1": ""');

        return s;
    }

    /* ---------- public API ------------------------------------------ */
    return {
        feed(chunk: string) { buffer += chunk; },

        finalize() {
            let txt = buffer, obj = parse(txt);

            if (obj) return obj;

            txt = closeStrings(txt); 
            obj = parse(txt)
            if (obj) return obj;
            txt = stripCommas(txt); 
            obj = parse(txt)
            if (obj) return obj;
            txt = balanceBrackets(txt);
            obj = parse(txt)
            if (obj) return obj;
            txt = fixKeys(txt); 
            obj = parse(txt)
            if (obj) return obj;

            throw new Error('createRepairingJSONParser: unable to repair JSON');
        }
    };
}

