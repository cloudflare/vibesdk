/**
 * TS2304: Cannot find name fixer
 * Handles undefined names by creating placeholder declarations
 */

import * as t from '@babel/types';
import type { CodeIssue } from '../../sandbox/sandboxTypes';
import { FixerContext, FixResult, FixedIssue, UnfixableIssue, FileObject } from '../types';
import { generateCode, parseCode } from '../utils/ast';
import { getFileContent } from '../utils/imports';
import { handleFixerError } from '../utils/helpers';

/**
 * Fix TS2304 "Cannot find name" errors
 * Preserves exact logic from working DeclarationFixer.fixUndefinedName
 */
export function fixUndefinedName(
    context: FixerContext,
    issues: CodeIssue[]
): FixResult {
    const fixedIssues: FixedIssue[] = [];
    const unfixableIssues: UnfixableIssue[] = [];
    const modifiedFilesMap = new Map<string, FileObject>();
    const newFiles: FileObject[] = [];
    
    // Group issues by file to handle multiple undefined names in the same file
    const issuesByFile = new Map<string, CodeIssue[]>();
    for (const issue of issues) {
        const fileIssues = issuesByFile.get(issue.filePath) || [];
        fileIssues.push(issue);
        issuesByFile.set(issue.filePath, fileIssues);
    }

    // Process each file's issues together
    for (const [filePath, fileIssues] of issuesByFile) {
        try {
            const fileContent = getFileContent(
                filePath, 
                context.files
            );
            
            if (!fileContent) {
                for (const issue of fileIssues) {
                    unfixableIssues.push({
                        issueCode: 'TS2304',
                        filePath: issue.filePath,
                        line: issue.line,
                        column: issue.column,
                        originalMessage: issue.message,
                        reason: 'File content not available'
                    });
                }
                continue;
            }

            let ast = parseCode(fileContent);
            let hasChanges = false;
            const appliedDeclarations: string[] = [];

            // Process all undefined names for this file
            for (const issue of fileIssues) {
                // Extract the undefined name from the error message
                const undefinedName = extractUndefinedName(issue.message);
                if (!undefinedName) {
                    unfixableIssues.push({
                        issueCode: 'TS2304',
                        filePath: issue.filePath,
                        line: issue.line,
                        column: issue.column,
                        originalMessage: issue.message,
                        reason: 'Could not extract undefined name from error message'
                    });
                    continue;
                }

                // Skip common global variables that shouldn't be declared
                if (isGlobalVariable(undefinedName)) {
                    unfixableIssues.push({
                        issueCode: 'TS2304',
                        filePath: issue.filePath,
                        line: issue.line,
                        column: issue.column,
                        originalMessage: issue.message,
                        reason: `${undefinedName} is a global variable and should not be declared`
                    });
                    continue;
                }

                // Analyze how the name is used to infer the appropriate declaration
                const usageContext = analyzeUsageContext(fileContent, undefinedName, issue.line);
                const declaration = generateDeclaration(undefinedName, usageContext);

                // Add declaration to the AST (accumulating changes)
                ast = addDeclarationToAST(ast, declaration);
                hasChanges = true;
                appliedDeclarations.push(undefinedName);

                fixedIssues.push({
                    issueCode: 'TS2304',
                    filePath: issue.filePath,
                    line: issue.line,
                    column: issue.column,
                    originalMessage: issue.message,
                    fixApplied: `Added declaration for '${undefinedName}' (${usageContext})`,
                    fixType: 'declaration_fix',
                });
            }

            // Generate code once for all accumulated changes
            if (hasChanges) {
                const generatedCode = generateCode(ast);
                modifiedFilesMap.set(filePath, {
                    filePath,
                    fileContents: generatedCode.code,
                });
            }
        } catch (error) {
            // If there's an error processing the file, mark all its issues as unfixable
            for (const issue of fileIssues) {
                unfixableIssues.push(handleFixerError(issue, error as Error, 'TS2304Fixer'));
            }
        }
    }

    return {
        fixedIssues,
        unfixableIssues,
        modifiedFiles: Array.from(modifiedFilesMap.values()),
        newFiles
    };
}

/**
 * Extract undefined name from error message
 */
function extractUndefinedName(message: string): string | null {
    // Extract name from messages like "Cannot find name 'SomeName'"
    const match = message.match(/Cannot find name '([^']+)'/);
    return match ? match[1] : null;
}

/**
 * Check if a name is a global variable that shouldn't be declared
 */
function isGlobalVariable(name: string): boolean {
    const globalVars = [
        'window', 'document', 'console', 'process', 'global', 'Buffer',
        'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
        'fetch', 'localStorage', 'sessionStorage', 'location', 'history'
    ];
    return globalVars.includes(name);
}

/**
 * Analyze usage context to infer the appropriate declaration type
 * Enhanced with better pattern detection and multi-line context
 */
function analyzeUsageContext(fileContent: string, name: string, line: number): string {
    const lines = fileContent.split('\n');
    
    // Get expanded context: more surrounding lines for better analysis
    const startLine = Math.max(0, line - 5);
    const endLine = Math.min(lines.length, line + 5);
    const contextLines = lines.slice(startLine, endLine).join('\n');
    const errorLine = lines[line - 1] || '';
    // Enhanced pattern detection with priority order and improved accuracy
    
    // 1. Class instantiation - check for 'new' keyword
    // Look for: new Name( or new Name<T>( or new Name ()
    const classPattern = new RegExp(`new\\s+${name}\\s*[<(]`, 'g');
    if (classPattern.test(contextLines)) {
        return 'class';
    }
    
    // 2. React/JSX component - check for JSX usage
    // Look for: <Name or <Name> or <Name/> or <Name prop=
    // Also check if file is .tsx and name starts with capital
    const jsxPattern = new RegExp(`<${name}(?:\\s|>|/>)`, 'g');
    if (jsxPattern.test(contextLines) || 
        (fileContent.includes('React') && name[0] === name[0].toUpperCase() && jsxPattern.test(contextLines))) {
        return 'react_component';
    }
    
    // 3. Function call - check for invocation with better accuracy
    // Look for: Name( or Name.method( but not new Name(
    // Also check for async/await patterns
    const functionPattern = new RegExp(`(?<!new\\s)\\b${name}\\s*\\(`, 'g');
    const asyncPattern = new RegExp(`await\\s+${name}\\s*\\(`, 'g');
    const promisePattern = new RegExp(`${name}\\s*\\([^)]*\\)\\s*\\.\\s*(then|catch|finally)`, 'g');
    if (functionPattern.test(errorLine) || asyncPattern.test(contextLines) || promisePattern.test(contextLines)) {
        return 'function';
    }
    
    // 4. Type usage - check for TypeScript type contexts with better patterns
    // Look for: : Name or extends Name or implements Name or Name<
    // Also check for type assertions and generic constraints
    const typePattern = new RegExp(`(?::|extends|implements|satisfies)\\s+${name}\\b|\\b${name}\\s*<|as\\s+${name}\\b`, 'g');
    const genericPattern = new RegExp(`<[^>]*${name}[^>]*>`, 'g');
    if (typePattern.test(contextLines) || genericPattern.test(contextLines)) {
        return 'type_or_interface';
    }
    
    // 5. Object property/method access with better detection
    // Look for: Name.property or Name.method() or Name?.property
    // Also check for destructuring patterns
    const objectPattern = new RegExp(`\\b${name}\\s*[\\?\\.]+\\s*\\w+`, 'g');
    const destructurePattern = new RegExp(`const\\s*\\{[^}]*\\}\\s*=\\s*${name}`, 'g');
    if (objectPattern.test(errorLine) || destructurePattern.test(contextLines)) {
        return 'object';
    }
    
    // 6. Array or object indexing
    // Look for: Name[index] or Name['key']
    // Also check for array methods
    const indexPattern = new RegExp(`\\b${name}\\s*\\[`, 'g');
    const arrayMethodPattern = new RegExp(`${name}\\s*\\.\\s*(map|filter|reduce|forEach|find|some|every|push|pop)\\s*\\(`, 'g');
    if (indexPattern.test(errorLine) || arrayMethodPattern.test(contextLines)) {
        return 'array_or_object';
    }
    
    // 7. Assignment target - check if being assigned to
    // Look for: Name = value or let/const/var Name
    const assignmentPattern = new RegExp(`\\b${name}\\s*=(?!=)`, 'g');
    const declarationPattern = new RegExp(`\\b(let|const|var)\\s+${name}\\b`, 'g');
    if (assignmentPattern.test(errorLine) && !declarationPattern.test(errorLine)) {
        return 'variable';
    }
    
    // 8. Enum or constant usage with improved patterns
    // Look for: Name.CONSTANT or usage in switch cases
    // Also check for string literal types patterns
    const enumPattern = new RegExp(`\\b${name}\\.[A-Z_][A-Z0-9_]*\\b`, 'g');
    const switchPattern = new RegExp(`switch\\s*\\([^)]*${name}[^)]*\\)|case\\s+${name}\\.`, 'g');
    if (enumPattern.test(contextLines) || switchPattern.test(contextLines)) {
        return 'enum_or_constants';
    }
    
    // 9. Check if used as a value in expressions
    // Look for usage in conditions, returns, etc.
    const valuePattern = new RegExp(`(return|if|while|for|switch|case|throw).*\\b${name}\\b`, 'g');
    if (valuePattern.test(errorLine)) {
        return 'value';
    }
    
    // 10. Hook pattern for React
    if (name.startsWith('use') && name[3] && name[3] === name[3].toUpperCase()) {
        return 'react_hook';
    }
    
    return 'unknown';
}

/**
 * Generate appropriate declaration based on usage context
 * Enhanced with better TypeScript declarations and proper AST nodes
 */
function generateDeclaration(name: string, context: string): string {
    switch (context) {
        case 'react_component':
            // Proper React component with better typing
            return `
interface ${name}Props {
    // TODO: Define component props based on usage
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
    [key: string]: unknown;
}

const ${name}: React.FC<${name}Props> = ({ children, className, style, ...props }) => {
    return (
        <div className={className} style={style} {...props}>
            {children || 'TODO: Implement ${name} component'}
        </div>
    );
};

export default ${name};`;
        
        case 'function':
            // Better function typing with generic return type
            return `
/**
 * TODO: Implement ${name} function
 * @template T - Return type
 * @param args - Function arguments
 * @returns Function result
 */
function ${name}<T = unknown>(...args: unknown[]): T | null {
    // TODO: Implement ${name}
    console.warn('${name} is not implemented', args);
    return null as T | null;
}

export { ${name} };`;
        
        case 'class':
            // Better class template with common patterns
            return `
/**
 * TODO: Implement ${name} class
 */
class ${name} {
    private _initialized = false;
    
    constructor(...args: unknown[]) {
        // TODO: Initialize ${name}
        console.warn('${name} constructor called with:', args);
        this._initialized = true;
    }
    
    // TODO: Add methods
    public isInitialized(): boolean {
        return this._initialized;
    }
}

export { ${name} };`;
        
        case 'type_or_interface':
            // Better TypeScript interface with common patterns
            return `
/**
 * TODO: Define ${name} type/interface
 */
interface ${name} {
    id?: string | number;
    // TODO: Add specific properties based on usage
    [key: string]: unknown;
}

export type { ${name} };`;
        
        case 'object':
            // Better object with typed methods
            return `
/**
 * TODO: Implement ${name} object
 */
const ${name} = {
    // TODO: Add properties and methods based on usage
    _stub: true,
    
    // Common utility methods
    init: (...args: unknown[]): void => {
        console.warn('${name}.init not implemented', args);
    },
    
    getValue: <T = unknown>(key: string): T | undefined => {
        console.warn('${name}.getValue not implemented', key);
        return undefined;
    },
    
    setValue: <T = unknown>(key: string, value: T): void => {
        console.warn('${name}.setValue not implemented', key, value);
    }
} as const;

export { ${name} };`;
        
        case 'array_or_object':
            // Better array/collection type
            return `
/**
 * TODO: Initialize ${name} collection
 */
type ${name}Item = unknown; // TODO: Define item type

const ${name}: ${name}Item[] = [];

// Helper functions for the collection
export const ${name}Utils = {
    add: (item: ${name}Item): void => {
        ${name}.push(item);
    },
    remove: (index: number): ${name}Item | undefined => {
        return ${name}.splice(index, 1)[0];
    },
    get: (index: number): ${name}Item | undefined => {
        return ${name}[index];
    },
    size: (): number => {
        return ${name}.length;
    }
};

export { ${name} };`;
        
        case 'enum_or_constants':
            // Better enum with TypeScript enum syntax
            return `
/**
 * TODO: Define ${name} enum/constants
 */
enum ${name} {
    // TODO: Add enum values
    DEFAULT = 'DEFAULT',
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    // Add more values as needed
}

// Alternative const assertion pattern
const ${name}Values = {
    DEFAULT: 'DEFAULT',
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
} as const;

export { ${name}, ${name}Values };
export type ${name}Type = keyof typeof ${name}Values;`;
        
        case 'variable':
            // Better typed mutable variable
            return `
/**
 * TODO: Initialize ${name} variable
 */
let ${name}: unknown = null;

// Getter and setter for better control
export const get${name[0].toUpperCase()}${name.slice(1)} = (): unknown => ${name};
export const set${name[0].toUpperCase()}${name.slice(1)} = (value: unknown): void => {
    ${name} = value;
};

export { ${name} };`;
        
        case 'value':
            // Better constant with proper typing
            return `
/**
 * TODO: Define ${name} constant value
 */
const ${name}: unknown = null; // TODO: Set actual value and type

export { ${name} };`;
        
        case 'react_hook':
            // React custom hook template
            return `
/**
 * TODO: Implement ${name} custom hook
 */
function ${name}<T = unknown>(initialValue?: T): [T | undefined, (value: T) => void] {
    const [state, setState] = React.useState<T | undefined>(initialValue);
    
    // TODO: Implement hook logic
    React.useEffect(() => {
        console.warn('${name} hook not fully implemented');
    }, []);
    
    return [state, setState];
}

export { ${name} };`;
        
        default:
            // Better generic fallback
            return `
/**
 * TODO: Implement ${name}
 * Context: ${context}
 * Unable to determine the exact type from usage context.
 * Please update the type and implementation based on actual requirements.
 */
const ${name}: unknown = (() => {
    console.warn('${name} stub - please implement based on usage context');
    return null;
})();

export { ${name} };`;
    }
}

/**
 * Add declaration to AST at appropriate location
 */
function addDeclarationToAST(ast: t.File, declaration: string): t.File {
    try {
        // Parse the declaration as a statement
        const declarationAst = parseCode(declaration);
        const declarationStatement = declarationAst.program.body[0];
        
        if (declarationStatement) {
            // Find the position after imports to insert the declaration
            let insertIndex = 0;
            for (let i = 0; i < ast.program.body.length; i++) {
                const statement = ast.program.body[i];
                if (t.isImportDeclaration(statement)) {
                    insertIndex = i + 1;
                } else {
                    break;
                }
            }
            
            // Insert the declaration
            ast.program.body.splice(insertIndex, 0, declarationStatement);
        }
    } catch (error) {
        // Fallback: just add as comment if parsing fails
        const commentStatement = t.expressionStatement(
            t.identifier(`/* ${declaration} */`)
        );
        ast.program.body.unshift(commentStatement);
    }
    
    return ast;
}

