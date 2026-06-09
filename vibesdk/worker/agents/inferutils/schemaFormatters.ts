import { z } from 'zod';
// Markdown Parser: unified/remark
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toString as mdastToString } from 'mdast-util-to-string';
import type {
    Root, Content, Node as UnistNode,
    Heading, List, ListItem, Code, ThematicBreak
} from 'mdast';
import { createLogger, StructuredLogger } from '../../logger';

// --- Existing Types and Logger Setup ---
export type SchemaFormat = 'markdown';
export type FormatterOptions = {
    rootTagName?: string;
    headingLevel?: number;
    debug?: boolean;
};

// ReturnType<typeof createLogger> removed - using structured logger throughout
const logger = createLogger('SchemaFormatter');


// --- Helper: Simple Singularization ---
/**
 * Basic singularization heuristic. Converts plural nouns ending in 's' to singular.
 * Handles simple cases like 'files' -> 'File', 'phases' -> 'Phase'.
 * Capitalizes the first letter. Returns capitalized original if no 's' ending.
 * @param word The plural word (usually the Zod key).
 * @returns The singularized and capitalized word.
 */
function singularize(word: string): string {
    let singularBase = word;
    // Basic heuristic: remove trailing 's' if it's likely plural and not possessive/double-s
    if (word.toLowerCase().endsWith('s') && !word.toLowerCase().endsWith('ss') && word.length > 1) {
        // Avoid removing 's' if the word before it is also 's' (e.g. 'process') - simple check
        if (word.length < 2 || word.charAt(word.length - 2).toLowerCase() !== 's') {
            singularBase = word.slice(0, -1);
        }
    }
    // Capitalize the first letter
    return singularBase.charAt(0).toUpperCase() + singularBase.slice(1);
}


// --- UPDATED Markdown Formatter ---
export function formatSchemaAsMarkdown<T extends z.ZodRawShape>(schema: z.ZodObject<T>, options: FormatterOptions = {}): string {
    const headingLevel = options.headingLevel || 2;
    const headingMarker = '#'.repeat(headingLevel);
    // Add instructions preamble
//     const instructions = `# Instructions for Generation

// Please fill out the following structure.
// - Use the headings provided (e.g., \`## name\`, \`#### filePath\`).
// - Place the value for each field inside triple backticks (\`\`\`) on the line(s) following the heading and description.
// - For arrays (like \`files\`), use a heading like \`### File 1\`, \`### File 2\`, etc., for each item in the list, where "File" is the singular form of the array name.
// - Provide all required fields. Optional sections can be omitted entirely or have an empty code block if explicitly empty.
// - Ensure the content within the code blocks is raw text/code as appropriate for the field.

// ---

// `;
    return formatZodSchemaAsMarkdownFields(schema, headingMarker, undefined, false, 'template');
}

/**
 * Formats a JavaScript object into a Markdown string based on a Zod schema.
 * @param data The JavaScript object/data to format.
 * @param schema The Zod schema defining the structure.
 * @param options Formatting options.
 * @returns A Markdown string representing the data.
 */
 function formatDataAsMarkdown<T extends z.ZodRawShape>(
    data: z.infer<z.ZodObject<T>>,
    schema: z.ZodObject<T>,
    options: FormatterOptions = {}
): string {
    const headingLevel = options.headingLevel || 2;
    const headingMarker = '#'.repeat(headingLevel);
    const debug = options.debug ?? false;

    if (debug) logger.debug("--- Starting Data Formatting to Markdown ---");
    
    // Validate (for logging/diagnostics only). We intentionally avoid merging defaults
    // so that serialization does not introduce placeholder/template scaffolding.
    const validation = schema.safeParse(data);
    if (!validation.success) {
        logger.error("Input data failed Zod validation before formatting:", validation.error);
        logger.error("Original data:", data);
    }

    // Always serialize using the provided data object (no default merging),
    // and render in strict data mode (no template placeholders).
    return formatZodSchemaAsMarkdownFields(schema, headingMarker, data, debug, 'data');
}

/**
 * Recursive helper to format fields of an object.
 */
function formatZodSchemaAsMarkdownFields(
    schema: z.ZodObject<any>,
    headingPrefix: string,
    dataObject?: Record<string, any>,
    debug: boolean = false,
    mode: 'template' | 'data' = dataObject ? 'data' : 'template'
): string {
    const shape = schema._def.shape();
    let result = '';

    if (debug) logger.debug(`[Format Data Path: object] Formatting object with keys: ${Object.keys(shape).join(', ')}`);

    // Iterate through the keys defined in the SCHEMA's shape
    for (const key of Object.keys(shape)) {
        const fieldSchema = shape[key] as z.ZodTypeAny;
        const value = dataObject ? dataObject[key] : undefined; // Get value from data

        if (debug) logger.debug(`[Format Data Path: object.${key}] Processing key "${key}"`);

        if (dataObject) {
            // Skip formatting optional fields if the value is undefined
            let isOptional = false;
            let checkSchema = fieldSchema;
            while (checkSchema instanceof z.ZodOptional || checkSchema instanceof z.ZodNullable || checkSchema instanceof z.ZodDefault) {
                if (checkSchema instanceof z.ZodOptional) isOptional = true;
                if (checkSchema instanceof z.ZodNullable) isOptional = true;
                // Consider Default as optional for skipping if value is exactly undefined
                if (checkSchema instanceof z.ZodDefault && value === undefined) isOptional = true;
                checkSchema = checkSchema._def.innerType;
            }
    
            if (isOptional && (value === undefined || value === null || value === '') ) {
                if (debug) logger.debug(`[Format Data Path: object.${key}] Skipping optional field with undefined value.`);
                continue; // Skip this field entirely
            }
        }
        result += formatZodTypeAsMarkdown(key, fieldSchema, headingPrefix, value, mode);
    }
    return result;
}

function getMarkdownPlaceholderValue(key: string, field: z.ZodTypeAny, headingPrefix: string): string {
    let value = '';
    // Base type formatting
    if (field instanceof z.ZodArray) {
        const innerType = field._def.type;
        let example = '';
        // *** CHANGE: Use singularize for item name ***
        const singularKeyName = singularize(key);
        const itemHeadingPrefix = headingPrefix + '#'; // Increase heading level for items

        if (innerType instanceof z.ZodObject) {
            // Generate example items using the singularized name
            example = `${itemHeadingPrefix} ${singularKeyName} 1\n\n${formatZodSchemaAsMarkdownFields(innerType, itemHeadingPrefix + '#')}\n`; // Note: recursive call uses deeper heading
            example += `${itemHeadingPrefix} ${singularKeyName} 2\n\n${formatZodSchemaAsMarkdownFields(innerType, itemHeadingPrefix + '#')}\n`;
        } else {
            // Example for arrays of primitives
            const simpleDesc = getSimpleTypeDescription(innerType);
            example = `\n\nExample items (one per line or in code block):\n\n`
            example += `- [${simpleDesc} 1]\n`;
            example += `- [${simpleDesc} 2]\n\n`;
            example += `Or for multi-line content, use code blocks like this:\n\n`;
            example += "```\n[Multi-line content for item 1]\n```\n\n";
            example += "```\n[Multi-line content for item 2]\n```\n";
        }
        // Add extra newline after array example for spacing
        // return `${heading}${description}\n\n${example}\n`;
        return example;
    }
    else if (field instanceof z.ZodObject) {
        // Recurse with increased heading level
        return formatZodSchemaAsMarkdownFields(field, headingPrefix + '#');
    } else if (field instanceof z.ZodString) {
        value = field._def.checks?.find(c => c.kind === 'uuid') ? '[UUID string]' :
        field._def.checks?.find(c => c.kind === 'email') ? '[email string]' :
        field._def.checks?.find(c => c.kind === 'url') ? 'https://example.com/string' :
                    '[String content]';
    }
    else if (field instanceof z.ZodNumber) {
        value = field._def.checks?.some(c => c.kind === 'int') ? '[Integer value]' : '[Numeric value]';
    }
    else if (field instanceof z.ZodBoolean) {
        value = 'true or false';
    }
    else if (field instanceof z.ZodEnum || field instanceof z.ZodNativeEnum) {
        const values = field._def.values;
        const placeholder = `[One of: ${values.join(', ')}]`;
        value = placeholder;
    }
    else if (field instanceof z.ZodUnion) {
        value = '[Content based on one of the allowed types]';
    }
    else if (field instanceof z.ZodOptional) {
        // Handle optional fields
        const innerType = field._def.innerType;
        if (innerType instanceof z.ZodObject) {
            return formatZodSchemaAsMarkdownFields(innerType, headingPrefix + '#');
        } else {
            value = `[Optional content for ${key}]`;
        }
    }
    else {
        // Fallback for other types
        value = `[Content for ${key}]`;
    }

    return `\`\`\`\n${value}\n\`\`\`\n`
}


function formatZodTypeAsMarkdown(
    key: string, 
    field: z.ZodTypeAny, 
    headingPrefix = '##',
    value?: unknown,
    mode: 'template' | 'data' = 'template',
): string {
    let optionalMarker = '';
    let baseField = field;
    let isOptional = false;

    // Determine optionality and get base type
    while (baseField instanceof z.ZodOptional || baseField instanceof z.ZodNullable || baseField instanceof z.ZodDefault) {
        // Treat Nullable and Default as optional in the schema representation for clarity to the LLM
        if (baseField instanceof z.ZodOptional || baseField instanceof z.ZodDefault || baseField instanceof z.ZodNullable) {
            isOptional = true;
        }
        baseField = baseField._def.innerType;
    }
    // Add the marker directly to the heading text if optional
    if (isOptional && mode === 'template') {
        // Show optional marker only in template mode
        optionalMarker = ' (Optional section)';
    }

    // Determine if the field actually has a value (type-aware)
    let hasValue: boolean;
    if (value === undefined || value === null) {
        hasValue = false;
    } else if (baseField instanceof z.ZodString) {
        hasValue = String(value).trim().length > 0;
    } else if (baseField instanceof z.ZodArray) {
        hasValue = Array.isArray(value) && value.length > 0;
    } else {
        // Numbers, booleans, enums, objects, etc. are considered present if not null/undefined
        hasValue = true;
    }

    // Only include schema field descriptions when generating templates
    const description = (mode === 'template' && !hasValue && field.description) ? `\n\n*Description: ${field.description}*` : '';

    // Generate heading
    const heading = `${headingPrefix} ${key}${optionalMarker}`; // Optional marker added here

    if (!hasValue) {
        // Template mode -> emit helpful placeholders. Data mode -> avoid scaffolding
        if (mode === 'template') {
            const placeholder = getMarkdownPlaceholderValue(key, field, headingPrefix);
            return `${heading}${description}\n\n${placeholder}\n`;
        }
        // DATA MODE
        // - For arrays/objects with no content, skip the entire section
        if (baseField instanceof z.ZodArray || baseField instanceof z.ZodObject) {
            return '';
        }
        // - For primitives, emit an empty code fence to represent "no value" without placeholders
        return `${heading}\n\n\`\`\`\n\n\`\`\`\n\n`;
    } else if (baseField instanceof z.ZodObject) {
        if (typeof value === 'object') {
            // logger.debug(`[Format Data Path: ...${key}] Formatting object with ${Object.keys(value).length} keys.`);
            // Ensure value is not null before recursing
            return `${heading}${description}\n\n${formatZodSchemaAsMarkdownFields(baseField, headingPrefix + '#', value as Record<string, any>, false, mode)}\n`;
        } else {
            // Handle cases where data is missing or not an object for a required object schema
            if (mode === 'template') {
                logger.warn(`[Format Data Path: ...${key}] Expected object but got ${typeof value}. Rendering empty section.`);
                return `${heading}${description}\n\n\`\`\`\n[Missing or invalid object data]\n\`\`\`\n\n`;
            }
            // Data mode: skip invalid object sections
            return '';
        }
    }
    // --- Array Formatting ---
    else if (baseField instanceof z.ZodArray) {
        const itemSchema = baseField._def.type;
        const singularKeyName = singularize(key);
        const itemHeadingPrefix = headingPrefix + '#';
        let itemsMarkdown = '';

        // logger.debug(`[Format Data Path: ...${key}] Formatting array with ${Array.isArray(value) ? value.length : 0} items.`);

        if (Array.isArray(value) && value.length > 0) {
            itemsMarkdown += `\n`;
            value.forEach((item, index) => {
                const itemHeading = `${itemHeadingPrefix} ${singularKeyName} ${index + 1}`;
                // logger.debug(`[Format Data Path: ...${key}[${index}]] Formatting object item: ${item}, schema: ${itemSchema}, heading: ${itemHeading}`);
                // Check if array items are objects
                if (itemSchema instanceof z.ZodObject) {
                    if (item && typeof item === 'object') {
                        // console.debug(`[Format Data Path: ...${key}[${index}]] Formatting object item with ${Object.keys(item).length} keys.`);
                        itemsMarkdown += `${itemHeading}\n\n${formatZodSchemaAsMarkdownFields(itemSchema, itemHeadingPrefix + '#', item as Record<string, any>, false, mode)}\n`;
                    } else {
                        if (mode === 'template') {
                            logger.warn(`[Format Data Path: ...${key}[${index}]] Expected object item but got ${typeof item}. Rendering empty item.`);
                            itemsMarkdown += `${itemHeading}\n\n\`\`\`\n[Missing or invalid object item data]\n\`\`\`\n\n`;
                        }
                    }
                } else {
                    // Handle arrays of primitives (e.g., strings, numbers)
                    // Option: Format as a list or multi-line code block
                    // Current choice: Format each primitive item in its own section (less ideal, but fits pattern)
                    // Better: Format as list or single code block
                    // logger.warn(`[Format Data Path: ...${key}[${index}]] Formatting array of primitives - current output might be suboptimal.`);
                    // Simple primitive formatting (could be improved to list/code block)
                    const primitiveValueStr = String(item ?? ''); // Handle null/undefined primitives
                    // itemsMarkdown += `${itemHeading}\n\n*Description: ${itemSchema.description ?? `Value for ${singularKeyName} ${index + 1}`}*\n\n\`\`\`\n${primitiveValueStr}\n\`\`\`\n\n`;
                    itemsMarkdown += `- ${primitiveValueStr}\n`;
                }
            });
        } else {
            // Template mode may include a helpful note; Data mode omits empty arrays entirely
            if (mode === 'template') {
                itemsMarkdown = '\n\n[No items provided for this list]\n\n';
            } else {
                return '';
            }
        }
        return `${heading}${description}\n${itemsMarkdown}\n`; // Add extra newline after array section
    } else {
        // Handle null specifically for nullable fields
        const valueStr = String(value ?? '');
        return `${heading}${description}\n\n\`\`\`\n${valueStr}\n\`\`\`\n\n`;
    }
}


function getSimpleTypeDescription(field: z.ZodTypeAny): string {
    if (field instanceof z.ZodString) return 'string value';
    if (field instanceof z.ZodNumber) return 'numeric value';
    if (field instanceof z.ZodBoolean) return 'true or false';
    if (field instanceof z.ZodEnum || field instanceof z.ZodNativeEnum) return 'enum value';
    if (field instanceof z.ZodOptional || field instanceof z.ZodNullable || field instanceof z.ZodDefault) {
        return getSimpleTypeDescription(field._def.innerType) + " (optional/nullable)";
    }
    return 'value';
}

// --- Shared Helper Functions ---
function getDefaultValue(field: z.ZodTypeAny): unknown {
    if (field instanceof z.ZodOptional) return undefined;
    if (field instanceof z.ZodNullable) return null;
    if (field instanceof z.ZodDefault) {
        try {
            const defaultValue = field._def.defaultValue;
            return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
        } catch (e) {
            logger.warn(`Error getting default value for field: ${e instanceof Error ? e.message : String(e)}`);
            let inner = field._def.innerType;
            while (inner instanceof z.ZodDefault) inner = inner._def.innerType;
            return getDefaultValue(inner); // Try getting default from inner type
        }
    }
    // Base type defaults
    if (field instanceof z.ZodString) return '';
    if (field instanceof z.ZodNumber) return 0;
    if (field instanceof z.ZodBoolean) return false;
    if (field instanceof z.ZodArray) return [];
    if (field instanceof z.ZodObject) {
        const shape = field._def.shape();
        const defaultObj: Record<string, unknown> = {};
        for (const key in shape) {
            // Use the actual field definition from the shape to get the correct default
            defaultObj[key] = getDefaultValue(shape[key] as z.ZodTypeAny);
        }
        return defaultObj;
    }
    // Enums, Unions, etc., don't have a clear universal default
    if (field instanceof z.ZodEnum || field instanceof z.ZodNativeEnum) return undefined;
    if (field instanceof z.ZodUnion) return undefined;
    // Add other types as needed
    return undefined;
}

function convertToPrimitive(value: any, schema: z.ZodTypeAny, debugInfo?: { path: string | string[], logger: any, debug: boolean }): any {
    const { path = '?', logger: currentLogger = logger, debug = false } = debugInfo || {};
    const pathStr = Array.isArray(path) ? path.join('.') : path; // Ensure path is string for logs

    // 1. Handle non-string inputs (pass-through or basic conversion)
    if (typeof value !== 'string') {
        if (debug) currentLogger.debug(`[Convert Path: ${pathStr}] Input is not a string (${typeof value}). Value: ${JSON.stringify(value)}`);
        // Allow null/undefined through if schema permits
        if (value === null && schema instanceof z.ZodNullable) return null;
        if (value === undefined && schema instanceof z.ZodOptional) return undefined;
        if (value === null && schema instanceof z.ZodOptional) return undefined; // Treat null as undefined for optional

        // Handle defaults if input is null/undefined
        if ((value === null || value === undefined) && schema instanceof z.ZodDefault) {
            if (debug) currentLogger.debug(`[Convert Path: ${pathStr}] Non-string null/undefined for ZodDefault. Returning default.`);
            return getDefaultValue(schema);
        }
        // Handle null for ZodNullable when input is undefined
        if (value === undefined && schema instanceof z.ZodNullable) {
            if (debug) currentLogger.debug(`[Convert Path: ${pathStr}] Non-string undefined for ZodNullable. Returning null.`);
            return null;
        }

        // If type already matches base schema type, pass through (validation happens later)
        let baseSchema = schema;
        while (baseSchema instanceof z.ZodOptional || baseSchema instanceof z.ZodNullable || baseSchema instanceof z.ZodDefault) {
            baseSchema = baseSchema._def.innerType;
        }
        if (baseSchema instanceof z.ZodString && typeof value === 'string') return value; // Already handled string case above
        if (baseSchema instanceof z.ZodNumber && typeof value === 'number') return value;
        if (baseSchema instanceof z.ZodBoolean && typeof value === 'boolean') return value;
        // If type doesn't match, convert to string and proceed with string parsing logic
        if (debug) currentLogger.debug(`[Convert Path: ${pathStr}] Non-string type (${typeof value}) doesn't match schema ${baseSchema.constructor.name}. Converting to string.`);
        value = String(value); // Convert to string for further processing
    }

    // 2. Handle string input (trimming)
    const stringValue = value.trim();
    if (debug) currentLogger.debug(`[Convert Path: ${pathStr}] Processing trimmed string value: "${stringValue.substring(0, 100)}..."`);


    // 3. Unwrap Zod modifiers (Optional, Nullable, Default) for processing empty/nullish strings
    if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) {
        const innerSchema = schema._def.innerType;
        const isEmpty = stringValue === '';
        // More robust check for common "empty" values from LLMs
        const isNullish = isEmpty || ['null', 'none', 'n/a', 'undefined', 'nil', 'empty', 'missing', '[no value]', '[not applicable]'].includes(stringValue.toLowerCase());

        if (debug) currentLogger.debug(`[Convert Path: ${pathStr}] Checking modifiers: Optional=${schema instanceof z.ZodOptional}, Nullable=${schema instanceof z.ZodNullable}, Default=${schema instanceof z.ZodDefault}. IsEmpty=${isEmpty}, IsNullish=${isNullish}`);

        // Handle based on the *outer* modifier first if the string is considered nullish
        if (isNullish) {
            if (schema instanceof z.ZodDefault) {
                if (debug) currentLogger.debug(`[Convert Path: ${pathStr}] Empty/nullish string for ZodDefault. Returning default value.`);
                return getDefaultValue(schema); // Return default *before* attempting inner parse
            }
            if (schema instanceof z.ZodOptional) {
                if (debug) currentLogger.debug(`[Convert Path: ${pathStr}] Empty/nullish string for ZodOptional. Returning undefined.`);
                return undefined;
            }
            if (schema instanceof z.ZodNullable) {
                if (debug) currentLogger.debug(`[Convert Path: ${pathStr}] Empty/nullish string for ZodNullable. Returning null.`);
                return null;
            }
        }
        // If not empty/nullish, or if modifiers didn't result in a return, parse using the inner type
        if (debug) currentLogger.debug(`[Convert Path: ${pathStr}] Passing value to inner schema: ${innerSchema.constructor.name}`);
        return convertToPrimitive(stringValue, innerSchema, debugInfo);
    }

    // 4. Base type conversions from non-empty string
    if (schema instanceof z.ZodString) {
        // Basic XML unescape - harmless for plain text
        const unescaped = stringValue
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
        if (debug) currentLogger.debug(`[Convert Path: ${pathStr}] Returning string value: "${unescaped.substring(0, 100)}..."`);
        return unescaped;
    } else if (schema instanceof z.ZodNumber) {
        const cleanValue = stringValue.replace(/[, $£€]/g, ''); // Remove common currency/grouping chars
        if (cleanValue === '') {
            // This case should ideally be caught by ZodOptional/Nullable/Default handling above
            if (debug) currentLogger.warn(`[Convert Path: ${pathStr}] Empty string reached number conversion. Returning default (0).`);
            return getDefaultValue(z.number()); // Use number default (0) - pass base type
        }
        const num = Number(cleanValue);
        if (debug) currentLogger.debug(`[Convert Path: ${pathStr}] Parsed number: ${num}`);
        // Let Zod handle NaN/Infinity validation during the final parse step
        return num;
    } else if (schema instanceof z.ZodBoolean) {
        const lower = stringValue.toLowerCase();
        if (['true', 'yes', '1', 'on'].includes(lower)) { // Added 'on'
            if (debug) currentLogger.debug(`[Convert Path: ${pathStr}] Parsed boolean: true`);
            return true;
        }
        if (['false', 'no', '0', 'off'].includes(lower)) { // Added 'off'
            if (debug) currentLogger.debug(`[Convert Path: ${pathStr}] Parsed boolean: false`);
            return false;
        }
        // This case should ideally be caught by ZodOptional/Nullable/Default handling above
        if (debug) currentLogger.warn(`[Convert Path: ${pathStr}] Could not parse "${stringValue}" as boolean. Returning default (false).`);
        return getDefaultValue(z.boolean()); // Use boolean default (false) - pass base type
    } else if (schema instanceof z.ZodEnum || schema instanceof z.ZodNativeEnum) {
        const enumValues = schema._def.values as (string | number)[];
        // Try direct match first
        if (enumValues.includes(stringValue)) return stringValue;
        // Try matching number value
        const numValue = Number(stringValue);
        if (!isNaN(numValue) && enumValues.includes(numValue)) return numValue;
        // Try case-insensitive match for string enums
        const lowerValue = stringValue.toLowerCase();
        const matchedEnum = enumValues.find((enumVal) => typeof enumVal === 'string' && enumVal.toLowerCase() === lowerValue);
        if (matchedEnum !== undefined) return matchedEnum;

        if (debug) currentLogger.warn(`[Convert Path: ${pathStr}] Value "${stringValue}" not in enum [${enumValues.join(', ')}]. Returning undefined.`);
        return undefined; // No clear default for enum, let Zod validation handle it
    } else {
        // Fallback for unknown Zod types during conversion
        if (debug) currentLogger.warn(`[Convert Path: ${pathStr}] Unhandled Zod type ${schema.constructor.name} in convertToPrimitive. Returning raw string value.`);
        return stringValue;
    }
}


// --- MARKDOWN PARSING ---

// Define MdNode type
type MdNode = Content; // Use the imported Content type from mdast

// Setup Markdown parser (unified/remark)
const mdParser = unified().use(remarkParse).use(remarkGfm);

/* Helper: Get last element of array */
const last = <T,>(arr: readonly T[]): T | undefined =>
    arr.length ? arr[arr.length - 1] : undefined;

function normalize(text: string): string {
    if (!text) return '';
    let normalized = text.toLowerCase();

    // Remove common parenthetical modifiers from the end of the string.
    // This helps treat "heading (optional)" as "heading".
    // Extend the list of keywords in the regex as needed.
    const commonModifiersRegex = /\s*\((?:optional|required|note|info|beta|new|deprecated|experimental|advanced|basic|default|example|eg|ie|important|warning|tip|hint|faq|todo|fixme|bug|issue|ref|see|compare|contrast|aka|viz|etc|misc|other)\)\s*$/i;
    normalized = normalized.replace(commonModifiersRegex, '');

    // General punctuation removal (keeps alphanumeric, underscores, and spaces)
    // \w in JavaScript regex includes [A-Za-z0-9_], so underscores are preserved.
    normalized = normalized
        .replace(/[^\w\s]/g, '') // Remove characters that are NOT word characters or whitespace.
        .replace(/\s+/g, ' ')    // Normalize multiple spaces to a single space
        .trim();

    return normalized;
}

/* Helper: Type guards for mdast nodes */
function isCode(node: UnistNode): node is Code {
    return node.type === 'code';
}
function isList(node: UnistNode): node is List {
    return node.type === 'list';
}
function isListItem(node: UnistNode): node is ListItem {
    return node.type === 'listItem';
}
function isHeading(node: UnistNode): node is Heading {
    return node.type === 'heading';
}
function isThematicBreak(node: UnistNode): node is ThematicBreak {
    return node.type === 'thematicBreak';
}


/* Helper: Extract primitive value from a section's nodes */
function extractPrimitiveValueFromNodes(nodes: MdNode[], debugInfo?: { path: string, logger: StructuredLogger, debug: boolean }): string {
    const { path = '?', logger: currentLogger = logger, debug = false } = debugInfo || {};
    if (!nodes || nodes.length === 0) {
        if (debug) currentLogger.debug(`[Extract Path: ${path}] No nodes provided.`);
        return '';
    }

    // Strategy 1: Find the *first* code block and return its value.
    const firstCodeBlock = nodes.find(isCode);
    if (firstCodeBlock) {
        if (debug) currentLogger.debug(`[Extract Path: ${path}] Strategy 1: Found code block. Returning its value.`);
        return firstCodeBlock.value.trim();
    }

    // Strategy 2: If no code block, look for a single list (less common for primitives, but possible).
    const listNodes = nodes.filter(isList);
    if (nodes.length === 1 && listNodes.length === 1) {
        if (debug) currentLogger.debug(`[Extract Path: ${path}] Strategy 2: Found a single list node.`);
        const list = listNodes[0] as List;
        // Join list items, assuming primitive content within them
        return list.children.map(li => mdastToString(li).trim()).join('\n');
    }

    // Strategy 3: If no code block and not a single list, stringify all paragraph/text content.
    // Filter out descriptions/instructions if possible (heuristics)
    if (debug) currentLogger.debug(`[Extract Path: ${path}] Strategy 3: No code block or single list found. Stringifying relevant nodes.`);
    const relevantNodes = nodes.filter(node =>
        node.type === 'paragraph' || node.type === 'text' || node.type === 'inlineCode'
        // Avoid including descriptions that might be paragraphs
        // This simple check assumes descriptions are italicized paragraphs
        // !(node.type === 'paragraph' && node.children?.[0]?.type === 'emphasis')
    );
    const tempRoot: Root = { type: 'root', children: relevantNodes };
    const stringified = mdastToString(tempRoot).trim();

    // Avoid returning just the description if it was the only paragraph
    if (stringified.startsWith('Description:')) {
        if (debug) currentLogger.debug(`[Extract Path: ${path}] Stringified value seems to be only the description. Returning empty string.`);
        return '';
    }

    if (debug) currentLogger.debug(`[Extract Path: ${path}] Stringified value: "${stringified.substring(0, 100)}..."`);
    return stringified;
}


/* Helper: Build a tree structure based on Markdown headings */
interface Section { heading: Heading | null; nodes: MdNode[]; children: Section[] }

function buildSectionTree(root: Root): Section {
    const top: Section = { heading: null, nodes: [], children: [] };
    const stack: Section[] = [top];

    for (const node of root.children as MdNode[]) {
        if (isHeading(node)) { // Use type guard
            const headingNode = node as Heading;
            const headingText = mdastToString(headingNode);
            // Ignore headings that are empty or just whitespace/markers after normalization
            if (normalize(headingText) === '') {
                continue;
            }
            const sec: Section = { heading: headingNode, nodes: [], children: [] };
            // Adjust stack based on heading depth
            while (stack.length > 1 && (last(stack)!.heading?.depth ?? 0) >= headingNode.depth) {
                stack.pop();
            }
            // Add section to the correct parent
            if (stack.length > 0) {
                last(stack)!.children.push(sec);
                stack.push(sec); // Push the new section onto the stack
            } else {
                // This case should ideally not happen with a valid root node
                logger.error("Stack became empty unexpectedly during tree build for heading:", headingText);
                stack.push(top); // Attempt recovery?
                top.children.push(sec);
                stack.push(sec);
            }

        } else {
            // Add non-heading nodes to the current section at the top of the stack
            if (stack.length > 0) {
                // Ignore nodes that are just whitespace or thematic breaks between sections
                const nodeString = mdastToString(node).trim();
                if (nodeString !== '' && !isThematicBreak(node)) {
                    last(stack)!.nodes.push(node);
                }
            } else {
                // Content before the first heading
                const nodeString = mdastToString(node).trim();
                if (nodeString !== '' && !isThematicBreak(node)) {
                    logger.warn("Node found outside any section (before first heading?)", { 
                        nodeType: node.type, 
                        content: nodeString.substring(0, 50) 
                    });
                    top.nodes.push(node); // Add to the top-level node list
                }
            }
        }
    }
    return top;
}

/* --- Preprocessing Function --- */
function preprocessMarkdown(markdown: string, debug: boolean): string {
    if (debug) logger.debug("--- Preprocessing Markdown ---");
    let processed = markdown.trim();

    // Remove outer ```markdown ... ``` fences or similar
    // Make language tag optional and handle potential leading/trailing whitespace better
    const outerFenceRegex = /^```(?:\w*\s*)?\n([\s\S]*?)\n```$/i;
    const match = processed.match(outerFenceRegex);
    if (match && match[1]) {
        // Heuristic: Only strip if content looks like our structured markdown (contains ##)
        // This avoids stripping fences from single code block outputs meant for a simple string field.
        if (match[1].includes('##')) {
            if (debug) logger.debug("Removed outer ```...``` fences (heuristic match).");
            processed = match[1].trim();
        } else {
            if (debug) logger.debug("Outer ```...``` fences found, but content doesn't look like markdown structure. Keeping fences.");
        }
    }

    // Remove potential preamble (like the instructions) before the first real heading
    // Make this more robust: find the first line starting with ##
    const lines = processed.split('\n');
    const firstHeadingIndex = lines.findIndex(line => line.trim().startsWith('##'));

    if (firstHeadingIndex > 0) {
        // Check if lines *before* the first heading contain other headings - if so, don't strip
        const preamble = lines.slice(0, firstHeadingIndex).join('\n');
        if (!preamble.includes('\n##')) {
            if (debug) logger.debug("Removing potential preamble before first H2 heading.");
            processed = lines.slice(firstHeadingIndex).join('\n');
        } else {
            if (debug) logger.debug("Content found before first H2, but it contains other headings. Not removing preamble.");
        }
    } else if (firstHeadingIndex === -1 && processed.length > 0 && !processed.startsWith('##')) {
        // Handle case where there's content but NO H2 headings at all (might be invalid input)
        if (debug) logger.debug("No H2 headings found in input. Preprocessing might not apply.");
    }


    // Optional: Uncomment headings within code fences (use with caution)
    // processed = processed.replace(/```\s*(##+.*)\s*```/g, '$1');

    if (debug) logger.debug("--- Preprocessing Complete ---");
    return processed;
}


/* --- Public Markdown Parser Entry Point --- */
export function parseMarkdownContent<OutputSchema extends z.AnyZodObject>(
    markdownInput: string,
    schema: OutputSchema,
    options: FormatterOptions = {}
): z.infer<OutputSchema> {
    const { debug = false } = options;
    // Pass debug flag to logger if necessary (or handle globally)
    // logger.setDebug(debug); // Example if logger supports it

    if (debug) logger.debug("--- Starting Markdown Parsing ---");

    // 1. Preprocess Markdown
    const cleanedMarkdown = preprocessMarkdown(markdownInput, debug);
    if (debug) {
        logger.debug("--- Cleaned Markdown Input ---");
        console.log(cleanedMarkdown); // Use console.log for multi-line visibility
        logger.debug("--- End Cleaned Markdown Input ---");
    }

    // 2. Parse Markdown to AST
    let root: Root;
    try {
        root = mdParser.parse(cleanedMarkdown) as Root;
        if (debug) {
            logger.debug("--- MDAST Root ---");
            // console.log(JSON.stringify(root, null, 2)); // Full AST can be huge
            console.log(JSON.stringify(root, (key, value) => key === 'position' ? undefined : value, 2)); // Cleaner log
            logger.debug("--- End MDAST Root ---");
        }
    } catch (error) {
        logger.error("Markdown parsing failed:", error);
        // Return default value of the schema on critical parsing failure
        return getDefaultValue(schema) as z.infer<OutputSchema>;
    }


    // 3. Build Section Tree
    let sectionTree: Section;
    try {
        sectionTree = buildSectionTree(root);
        if (debug) {
            logger.debug("--- Section Tree ---");
            // console.log(JSON.stringify(sectionTree, null, 2)); // Full tree can be huge
            console.log(JSON.stringify(sectionTree, (key, value) => key === 'position' ? undefined : value, 2)); // Cleaner log
            logger.debug("--- End Section Tree ---");
        }
    } catch (error) {
        logger.error("Building section tree failed:", error);
        return getDefaultValue(schema) as z.infer<OutputSchema>;
    }


    // 4. Map AST/Tree to Zod Schema Structure
    let draftData: any;
    try {
        // Pass the original schema (including wrappers) to the mapping function
        draftData = mapSectionToSchema(sectionTree, schema, [], debug, schema); // Pass root schema
        if (debug) {
            logger.debug("--- Draft Data (Before Validation) ---");
            console.log(JSON.stringify(draftData, null, 2));
            logger.debug("--- End Draft Data ---");
        }
    } catch (error) {
        logger.error("Mapping section tree to schema failed:", error);
        // Return partially parsed data if available, otherwise default
        return draftData ?? getDefaultValue(schema);
    }


    // 5. Validate with Zod Schema
    const validationResult = schema.safeParse(draftData);

    if (!validationResult.success) {
        logger.warn('--- Zod Validation Failed ---');
        // Use console.error for better visibility of the error object
        console.error(JSON.stringify(validationResult.error.format(), null, 2));
        logger.warn('--- End Zod Validation Failure ---');
        // Return the draft data even if validation fails, allowing partial results
        return draftData;
    }

    if (debug) logger.debug('--- Markdown Parsed & Validated Successfully ---');
    return validationResult.data;
}
/**
 * A list of common English stop words.
 * This list can be expanded for better results.
 */
const STOP_WORDS: Set<string> = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
    'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
    'will', 'with', 'i', 'you', 'me', 'my', 'your', 'they', 'them', 'their',
    'this', 'these', 'those', 'am', 'if', 'or', 'but', 'not', 's', 't', 'can',
    'mr', 'mrs', 'ms', 'dr', 'prof'
    // Add more domain-specific stop words if necessary
]);

/**
 * Performs basic stemming on a word.
 * This is a very simplified stemmer. For more accuracy, a proper stemming algorithm
 * (like Porter stemmer) would be needed, but that adds complexity/dependencies.
 * @param word The input word.
 * @returns The stemmed word.
 */
function simpleStem(word: string): string {
    if (word.length < 3) return word;

    const suffixes: string[] = ['s', 'es', 'ed', 'ing', 'ly', 'er', 'est'];
    for (const suffix of suffixes) {
        if (word.endsWith(suffix)) {
            // Be careful not to over-stem, e.g., "address" -> "addre" if "ss" is a suffix
            // This simple version just removes it if the remaining part is long enough.
            if (word.length - suffix.length >= 2) {
                 return word.slice(0, -suffix.length);
            }
        }
    }
    // A common case: plural 's'
    if (word.endsWith('s') && word.length > 1 && !word.endsWith('ss') && !word.endsWith('us')) {
        return word.slice(0, -1);
    }
    return word;
}


/**
 * Tokenizes a string into words, removes stop words, and optionally stems them.
 * @param text The input string (should be pre-normalized).
 * @param useStemming Whether to apply simple stemming.
 * @returns An array of processed tokens.
 */
function preprocessText(text: string, useStemming: boolean = true): string[] {
    if (!text) return [];
    return text
        .split(' ')
        .filter(token => token.length > 0 && !STOP_WORDS.has(token))
        .map(token => (useStemming ? simpleStem(token) : token));
}

/**
 * Generates N-grams from an array of tokens.
 * @param tokens The input array of tokens.
 * @param n The size of the N-grams (e.g., 1 for unigrams, 2 for bigrams).
 * @returns A Set of N-grams.
 */
function generateNgrams(tokens: string[], n: number): Set<string> {
    const ngrams: Set<string> = new Set();
    if (n <= 0 || tokens.length === 0) return ngrams;

    for (let i = 0; i <= tokens.length - n; i++) {
        ngrams.add(tokens.slice(i, i + n).join(' '));
    }
    return ngrams;
}

/**
 * Calculates the Jaccard Index between two sets.
 * Jaccard Index = |Intersection(A, B)| / |Union(A, B)|
 * @param setA The first set.
 * @param setB The second set.
 * @returns The Jaccard Index (a value between 0 and 1).
 */
function jaccardIndex<T>(setA: Set<T>, setB: Set<T>): number {
    if (setA.size === 0 && setB.size === 0) return 1.0; // Both empty, considered identical
    if (setA.size === 0 || setB.size === 0) return 0.0; // One empty, no similarity

    const intersection: Set<T> = new Set();
    setA.forEach(elem => {
        if (setB.has(elem)) {
            intersection.add(elem);
        }
    });

    const unionSize = setA.size + setB.size - intersection.size;
    return intersection.size / unionSize;
}


/**
 * Calculates a semantic similarity score between two text strings.
 * This implementation is fast and does not use LLMs.
 * It relies on normalization, stop word removal, N-grams, and Jaccard index.
 *
 * @param text1 The first text string.
 * @param text2 The second text string.
 * @param options Optional configuration for the similarity calculation.
 * @returns A similarity score between 0 (no similarity) and 1 (identical).
 */
function getSemanticSimilarity(
    text1: string,
    text2: string,
    options?: {
        useStemming?: boolean;      // Whether to apply simple stemming (default: true)
        ngramMinSize?: number;    // Minimum N-gram size (default: 1, i.e., unigrams)
        ngramMaxSize?: number;    // Maximum N-gram size (default: 2, i.e., bigrams)
        weights?: { [key: string]: number }; // Optional: weights for different N-gram sizes (e.g., {unigram: 0.4, bigram: 0.6})
    }
): number {
    // Default options
    const config = {
        useStemming: options?.useStemming ?? true,
        ngramMinSize: options?.ngramMinSize ?? 1,
        ngramMaxSize: options?.ngramMaxSize ?? 2,
        weights: options?.weights // If not provided, will average scores or use only max N-gram
    };

    if (!text1 && !text2) return 1.0; // Both empty, consider them identical
    if (!text1 || !text2) return 0.0; // One is empty, no similarity

    // 1. Normalize text
    const normalizedText1 = normalize(text1);
    const normalizedText2 = normalize(text2);

    if (normalizedText1 === normalizedText2) return 1.0; // Identical after normalization

    // 2. Preprocess (tokenize, remove stop words, optionally stem)
    const tokens1 = preprocessText(normalizedText1, config.useStemming);
    const tokens2 = preprocessText(normalizedText2, config.useStemming);

    if (tokens1.length === 0 && tokens2.length === 0) return 1.0; // Both become empty after preprocessing
    if (tokens1.length === 0 || tokens2.length === 0) return 0.0; // One becomes empty

    let totalSimilarityScore = 0;
    let totalWeight = 0;
    const scoresByNgramSize: { [n: number]: number } = {};

    // 3. Generate N-grams and calculate Jaccard Index for each N-gram size
    for (let n = config.ngramMinSize; n <= config.ngramMaxSize; n++) {
        if (n <= 0) continue; // Skip invalid N-gram sizes

        const ngrams1 = generateNgrams(tokens1, n);
        const ngrams2 = generateNgrams(tokens2, n);

        const similarity = jaccardIndex(ngrams1, ngrams2);
        scoresByNgramSize[n] = similarity;

        // Apply weighting if provided
        if (config.weights) {
            const weightKey = n === 1 ? 'unigram' : n === 2 ? 'bigram' : `ngram${n}`;
            const weight = config.weights[weightKey] || (n === config.ngramMaxSize ? 1 : 0); // Default to weight 1 for max N-gram if not specified
            totalSimilarityScore += similarity * weight;
            totalWeight += weight;
        }
    }

    if (config.weights) {
        return totalWeight > 0 ? totalSimilarityScore / totalWeight : 0;
    } else {
        // If no weights, average the scores of the N-grams calculated,
        // or simply return the score for the largest N-gram size if only one size is effectively used.
        // For simplicity, let's average if multiple N-gram sizes were processed.
        const NgramSizesProcessed = Object.keys(scoresByNgramSize).length;
        if (NgramSizesProcessed === 0) return 0.0;

        let sumOfScores = 0;
        for (const n in scoresByNgramSize) {
            sumOfScores += scoresByNgramSize[n];
        }
        return sumOfScores / NgramSizesProcessed;
    }
}

/* --- Core Recursive Mapper: Section Tree -> Zod Schema (REVISED) --- */
function mapSectionToSchema(
    section: Section,
    schema: z.ZodTypeAny, // The schema for the *current* level being processed
    path: string[],
    debug: boolean,
    rootSchema: z.ZodObject<any> // Keep a reference to the top-level schema if needed
): any {
    const currentPath = path.join('.') || '<root>';
    const sectionHeadingText = section.heading ? mdastToString(section.heading) : '<root>'; // Use <root> for top level
    if (debug) logger.debug(`[Map Path: ${currentPath}] > Section: "${sectionHeadingText}", Target Schema: ${schema.constructor.name}`);

    // --- 1. Handle Schema Modifiers (Extract Base Schema) ---
    let baseSchema = schema;
    let isOptional = false;
    let isNullable = false;
    let hasDefault = false;
    // Need to check the original schema for modifiers
    let checkSchema = schema;
    while (checkSchema instanceof z.ZodOptional || checkSchema instanceof z.ZodNullable || checkSchema instanceof z.ZodDefault) {
        if (checkSchema instanceof z.ZodOptional) isOptional = true;
        if (checkSchema instanceof z.ZodNullable) isNullable = true;
        if (checkSchema instanceof z.ZodDefault) hasDefault = true;
        baseSchema = checkSchema._def.innerType; // Keep updating baseSchema here
        checkSchema = checkSchema._def.innerType; // Continue unwrapping checkSchema
    }
    // If no modifiers were found, baseSchema is the same as the original schema
    if (!isOptional && !isNullable && !hasDefault) {
        baseSchema = schema;
    }


    const schemaInfo = `Base: ${baseSchema.constructor.name}, Optional=${isOptional}, Nullable=${isNullable}, Default=${hasDefault}`;
    if (debug && baseSchema !== schema) logger.debug(`[Map Path: ${currentPath}] Schema Info: ${schemaInfo}`);

    // --- 2. Handle Base Schema Types ---

    /* --- 2a. ZodObject --- */
    if (baseSchema instanceof z.ZodObject) {
        if (debug) logger.debug(`[Map Path: ${currentPath}] Handling ZodObject.`);
        const shape = baseSchema.shape;
        const outputObject: Record<string, any> = {};

        // Initialize with default values for all keys in the schema
        // Important: Use the field definition from the shape for getDefaultValue
        const remainingKeys: Record<string, boolean> = {};
        for (const key of Object.keys(shape)) {
            remainingKeys[key] = true; // Track remaining keys
        }
        for (const key of Object.keys(shape)) {
            outputObject[key] = getDefaultValue(shape[key] as z.ZodTypeAny);
        }
        if (debug) logger.debug(`[Map Path: ${currentPath}] Initialized object with defaults`, { 
            path: currentPath, 
            defaults: outputObject 
        });


        // Iterate through the *actual* children found in the Markdown section
        if (debug) logger.debug(`[Map Path: ${currentPath}] Iterating through ${section.children.length} children of section "${sectionHeadingText}" to find matches...`);
        for (const childSection of section.children) {
            if (childSection.heading) {
                const childHeadingText = mdastToString(childSection.heading);
                const normalizedChildHeading = normalize(childHeadingText); // Normalize here
                if (debug) logger.debug(`[Map Path: ${currentPath}]  -- Checking child heading: "${childHeadingText}" (Normalized: "${normalizedChildHeading}")`);

                // Find the corresponding key in the Zod schema shape (case-insensitive on normalized)
                let matchedKey: string | undefined = undefined;

                // --- Fuzzy Matching Logic (Optional but Recommended) ---
                let minDistance = 3; // Example threshold
                for (const key of Object.keys(remainingKeys)) {
                    // Ignore already matched keys
                    // const keyDistance = levenshtein.get(normalize(key), normalizedChildHeading);
                    const keyDistance = 1.0 - getSemanticSimilarity(normalize(key), normalizedChildHeading, {
                        useStemming: true,
                        ngramMinSize: 1,
                        ngramMaxSize: 2,
                        // weights: { unigram: 0.4, bigram: 0.6 }
                    });
                    if (debug) logger.debug(`[Map Path: ${currentPath}]   - Comparing "${key}" (Normalized: "${normalize(key)}") with "${normalizedChildHeading}". Distance: ${keyDistance}`);
                    if (keyDistance < minDistance) {
                        minDistance = keyDistance;
                        matchedKey = key;
                    } else if (normalize(key) === normalizedChildHeading && keyDistance === 0) {
                        // Prioritize exact match even if a fuzzy match was found earlier
                        matchedKey = key;
                        break;
                    }
                }

                if (matchedKey) {
                    const fieldPath = [...path, matchedKey];
                    const fieldPathStr = fieldPath.join('.');
                    if (debug) logger.debug(`[Map Path: ${fieldPathStr}]   -- Normalized heading "${normalizedChildHeading}" matches schema key "${matchedKey}". Recursing.`);
                    // Recurse and update the output object, overwriting the default
                    // Pass the specific field schema from the shape
                    outputObject[matchedKey] = mapSectionToSchema(childSection, shape[matchedKey] as z.ZodTypeAny, fieldPath, debug, rootSchema);
                    // Remove the matched key from remainingKeys to avoid duplicates
                    delete remainingKeys[matchedKey];
                } else {
                    if (debug) logger.debug(`[Map Path: ${currentPath}] Normalized heading does not match schema shape`, { 
                        path: currentPath, 
                        normalizedHeading: normalizedChildHeading 
                    });
                }
            } else {
                if (debug) logger.debug(`[Map Path: ${currentPath}]  -- Skipping child section with no heading.`);
            }
        }
        if (debug) logger.debug(`[Map Path: ${currentPath}] Finished processing children`, { 
            path: currentPath, 
            outputObject 
        });
        return outputObject;
    }

    /* --- 2b. ZodArray --- */
    if (baseSchema instanceof z.ZodArray) {
        if (debug) logger.debug(`[Map Path: ${currentPath}] Handling ZodArray.`);
        const itemSchema = baseSchema._def.type;
        const results: any[] = [];

        // *** CHANGE: Use singularize for item name matching ***
        const arrayKey = path.length > 0 ? path[path.length - 1] : ''; // Get the key name for this array
        const singularKeyName = singularize(arrayKey); // e.g., "File", "Phase"
        // Create a regex to match headings like "File 1", "File #2", "File" (optional number)
        // Make it case-insensitive
        const itemHeadingRegex = new RegExp(`^${singularKeyName.toLowerCase()}(?:\\s*(?:#|\\d+))?$`, 'i');


        // Strategy ①: Look for Markdown list items directly within the current section's nodes
        // This is less likely with the new format but kept as a fallback for simple arrays
        const directList = section.nodes.find(isList) as List | undefined;
        if (directList && !(itemSchema instanceof z.ZodObject)) { // Only use for primitive arrays
            if (debug) logger.debug(`[Map Path: ${currentPath}] Strategy 1: Found direct list in section nodes for primitive array (${directList.children.length} items).`);
            directList.children.forEach((listItem, i) => {
                if (isListItem(listItem)) {
                    const itemPath = [...path, String(i)];
                    // Create a temporary section for the list item content
                    const itemSection: Section = { heading: null, nodes: listItem.children as MdNode[], children: [] };
                    if (debug) logger.debug(`[Map Path: ${itemPath.join('.')}] Mapping list item ${i}.`);
                    // Pass the itemSchema for the primitive type
                    results.push(mapSectionToSchema(itemSection, itemSchema, itemPath, debug, rootSchema));
                }
            });
            if (results.length > 0) {
                if (debug) logger.debug(`[Map Path: ${currentPath}] Returning ${results.length} items from direct list.`);
                return results;
            }
        }

        // Strategy ②: Look for child sections indicating items (e.g., "### File 1", "### Phase 2")
        if (debug) logger.debug(`[Map Path: ${currentPath}] Strategy 2: Looking for item sections matching regex: ${itemHeadingRegex}`);

        const itemSections: Section[] = [];
        const itemMatchPath = currentPath + `[${singularKeyName} items]`; // For logging
        if (debug) logger.debug(`[ItemMatching Path: ${itemMatchPath}] Searching in parent section "${sectionHeadingText}" with ${section.children.length} children.`);

        for (const childSection of section.children) {
            if (childSection.heading) {
                const headingText = mdastToString(childSection.heading);
                // No need to normalize here, regex handles variations
                const match = itemHeadingRegex.test(headingText.trim()); // Test raw heading text
                if (debug) logger.debug(`[ItemMatching Path: ${itemMatchPath}]   - Checking child heading: "${headingText}". Regex match result: ${match}`);
                if (match) {
                    itemSections.push(childSection);
                }
            } else {
                if (debug) logger.debug(`[ItemMatching Path: ${itemMatchPath}]   - Child section has no heading. Skipping.`);
            }
        }


        if (itemSections.length > 0) {
            if (debug) logger.debug(`[Map Path: ${currentPath}] Strategy 2: Found ${itemSections.length} item sections based on headings matching '${singularKeyName} X'.`);
            return itemSections.map((itemSec, i) => {
                const itemPath = [...path, String(i)];
                if (debug) logger.debug(`[Map Path: ${itemPath.join('.')}] Mapping item section ${i} with heading "${mdastToString(itemSec.heading!)}".`);
                // Pass the item's section and the itemSchema for recursion
                return mapSectionToSchema(itemSec, itemSchema, itemPath, debug, rootSchema);
            });
        }

        // Strategy ③: Thematic breaks (---) separating items (Less likely with new format, but kept)
        const slices: MdNode[][] = [];
        let currentSlice: MdNode[] = [];
        for (const node of section.nodes) {
            if (isThematicBreak(node)) { // Use type guard
                // Only push if the slice has meaningful content (not just whitespace/description)
                const sliceContent = mdastToString({ type: 'root', children: currentSlice }).trim();
                if (currentSlice.length > 0 && sliceContent !== '' && !sliceContent.startsWith('*Description:')) {
                    slices.push(currentSlice);
                }
                currentSlice = [];
            } else {
                currentSlice.push(node);
            }
        }
        const lastSliceContent = mdastToString({ type: 'root', children: currentSlice }).trim();
        if (currentSlice.length > 0 && lastSliceContent !== '' && !lastSliceContent.startsWith('*Description:')) {
            slices.push(currentSlice);
        }

        if (slices.length > 0) {
            if (debug) logger.debug(`[Map Path: ${currentPath}] Strategy 3: Found ${slices.length} items based on thematic breaks.`);
            return slices.map((sliceNodes, i) => {
                const itemPath = [...path, String(i)];
                const itemSection: Section = { heading: null, nodes: sliceNodes, children: [] };
                if (debug) logger.debug(`[Map Path: ${itemPath.join('.')}] Mapping thematic break slice ${i}.`);
                return mapSectionToSchema(itemSection, itemSchema, itemPath, debug, rootSchema);
            });
        }

        // Strategy ④: Primitive Array Fallback (if itemSchema is not Object)
        if (!(itemSchema instanceof z.ZodObject)) {
            if (debug) logger.debug(`[Map Path: ${currentPath}] Strategy 4: Handling array of primitives fallback.`);
            // Extract value considering it might just be lines of text or a list
            const contentString = extractPrimitiveValueFromNodes(section.nodes, { path: currentPath, logger: logger as ReturnType<typeof createLogger>, debug });
            if (!contentString) {
                if (debug) logger.debug(`[Map Path: ${currentPath}] No content found for primitive array. Returning empty array.`);
                return [];
            }
            // Split by newline, trim, and filter empty lines
            const lines = contentString.split('\n').map(l => l.trim()).filter(Boolean);
            // Check if it looks like a markdown list
            const looksLikeList = lines.length > 0 && lines.every(l => /^\s*[-*+]\s/.test(l));

            if (looksLikeList) {
                if (debug) logger.debug(`[Map Path: ${currentPath}] Parsing primitive array from ${lines.length} list-like lines.`);
                return lines.map((ln, i) => {
                    const itemPath = [...path, String(i)];
                    const itemContent = ln.replace(/^\s*[-*+]\s+/, '').trim(); // Extract content from list item
                    return convertToPrimitive(itemContent, itemSchema, { path: itemPath, logger: logger as ReturnType<typeof createLogger>, debug });
                });
            } else if (lines.length > 0) {
                // If not a list, treat each non-empty line as an item (use with caution)
                if (debug) logger.debug(`[Map Path: ${currentPath}] Parsing primitive array by splitting into ${lines.length} non-empty lines (non-list format).`);
                return lines.map((ln, i) => {
                    const itemPath = [...path, String(i)];
                    return convertToPrimitive(ln, itemSchema, { path: itemPath, logger: logger as ReturnType<typeof createLogger>, debug });
                });
            }
        }

        // Strategy ⑤: Fallback - No items found
        if (debug) logger.debug(`[Map Path: ${currentPath}] No array items found using any strategy. Returning empty array.`);
        return [];
    }

    /* --- 2c. Primitive Types (and others like Union, Enum) --- */
    if (debug) logger.debug(`[Map Path: ${currentPath}] Handling Primitive/Other Schema (${baseSchema.constructor.name}).`);
    if (debug) {
        // Log nodes more concisely for primitives
        logger.debug(`[Map Path: ${currentPath}] Nodes for primitive extraction:`, section.nodes.map(n => ({ type: n.type, value: (n as any).value?.substring(0, 30) ?? mdastToString(n).substring(0, 30) + '...' })));
    }
    // Extract the raw string value from the section's nodes
    const extractedValue = extractPrimitiveValueFromNodes(section.nodes, { path: currentPath, logger: logger as ReturnType<typeof createLogger>, debug });
    if (debug) logger.debug(`[Map Path: ${currentPath}] Extracted raw value: "${extractedValue.substring(0, 100)}${extractedValue.length > 100 ? '...' : ''}"`);

    // Convert the extracted string using the *original* schema (which includes wrappers like optional/nullable/default)
    const convertedValue = convertToPrimitive(
        extractedValue,
        schema, // Pass the original schema with wrappers
        { path: path, logger: logger as ReturnType<typeof createLogger>, debug }
    );
    if (debug) logger.debug(`[Map Path: ${currentPath}] Converted value: ${JSON.stringify(convertedValue)}`);

    // Final checks (optional, as Zod validation catches most issues)
    // These checks compare the *result* of conversion against the *original* schema's modifiers
    if (convertedValue === undefined && !(schema instanceof z.ZodOptional || schema instanceof z.ZodDefault)) {
        // It's okay if it's nullable, null might be the intended conversion from empty/missing
        if (!(schema instanceof z.ZodNullable)) {
            if (debug) logger.warn(`[Map Path: ${currentPath}] CONVERTED UNDEFINED for non-optional/non-default field.`);
        }
    }
    if (convertedValue === null && !(schema instanceof z.ZodNullable || schema instanceof z.ZodDefault)) {
        // It's okay if it's optional, undefined might be the intended conversion
        if (!(schema instanceof z.ZodOptional)) {
            if (debug) logger.warn(`[Map Path: ${currentPath}] CONVERTED NULL for non-nullable/non-default field.`);
        }
    }

    return convertedValue;
}

// --- Template Registry (Update parsers) ---
interface TemplateRegistryEntry {
    template: (schema: z.AnyZodObject, options?: FormatterOptions) => string;
    serialize: <OutputSchema extends z.AnyZodObject>(data: z.infer<OutputSchema>, schema: OutputSchema, options?: FormatterOptions) => string;
    prompt: (template: string) => string;
    parser: <OutputSchema extends z.AnyZodObject>(content: string, schema: OutputSchema, options?: FormatterOptions) => z.infer<OutputSchema>;
}

const markdownPrompt = (template: string) => `
<OUTPUT FORMAT>
Output format: Structured Markdown based schema

Please fill out the following structure.
    - Use the headings provided (e.g., \`## name\`, \`#### filePath\`) as is. These are schema field names and must not be changed.
    - Place the value for each field inside triple backticks (\`\`\`) on the line(s) following the heading.
    - For arrays (like \`files\`), use a heading like \`### File 1\`, \`### File 2\`, etc., for each item in the list, where "File" is the singular form of the array name.
    - Provide all required fields. Optional sections can be omitted entirely or have an empty code block if explicitly empty.
    - Ensure the content within the code blocks is raw text/code as appropriate for the field.
    - Do not include any XML tags in the formatting. This is a pure Markdown format.
    - Do not include any additional text or explanations outside of the specified format.
    - All fields are required no matter how trivial unless specified as optional in the schema.
    
Please output your response **strictly** in the custom Markdown-based format with the **exact** structure as the following template **without the \`Description\` fields**:

${template}

</OUTPUT FORMAT>
`;
export const TemplateRegistry: Record<SchemaFormat, TemplateRegistryEntry> = {
    markdown: {
        template: formatSchemaAsMarkdown,
        serialize: formatDataAsMarkdown,
        prompt: markdownPrompt,
        parser: parseMarkdownContent,
    },
};


export function generateTemplateForSchema(
    schema: z.AnyZodObject, 
    schemaFormat: SchemaFormat,
    options?: FormatterOptions
): string {
    const template = TemplateRegistry[schemaFormat].template(schema, options);
    const formatInstructions = TemplateRegistry[schemaFormat].prompt(template);
    return formatInstructions;
}

export function parseContentForSchema<OutputSchema extends z.AnyZodObject>(content: string, schemaFormat: SchemaFormat, schema: OutputSchema, options?: FormatterOptions): z.infer<OutputSchema> {
    const parser = TemplateRegistry[schemaFormat].parser;
    if (!parser) {
        throw new Error(`No parser function found for format: ${schemaFormat}`);
    }
    return parser(content, schema, options);
}