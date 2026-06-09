import { StructuredLogger } from '../../logger';

export interface PlaceholderInfo {
    placeholder: string;
    resourceType: 'KV' | 'D1';
    binding?: string;
}

export interface PlaceholderReplacements {
    [placeholder: string]: string;
}

export interface ParseResult {
    hasPlaceholders: boolean;
    placeholders: PlaceholderInfo[];
    content: string;
}

export class TemplateParser {
    private logger: StructuredLogger;
    
    private static readonly PLACEHOLDER_PATTERNS: Record<string, 'KV' | 'D1'> = {
        '{{KV_ID}}': 'KV',
        '{{D1_ID}}': 'D1'
    };

    constructor(logger: StructuredLogger) {
        this.logger = logger;
    }

    detectPlaceholders(wranglerContent: string): PlaceholderInfo[] {
        const placeholders: PlaceholderInfo[] = [];
        
        for (const [placeholder, resourceType] of Object.entries(TemplateParser.PLACEHOLDER_PATTERNS)) {
            if (wranglerContent.includes(placeholder)) {
                this.logger.info(`Found ${resourceType} placeholder: ${placeholder}`);
                
                let binding: string | undefined;
                try {
                    binding = this.extractBindingName(wranglerContent, placeholder, resourceType);
                } catch (error) {
                    this.logger.warn(`Could not extract binding name for ${placeholder}:`, error);
                }
                
                placeholders.push({
                    placeholder,
                    resourceType,
                    binding
                });
            }
        }
        
        this.logger.info(`Detected ${placeholders.length} placeholders in wrangler.jsonc`);
        return placeholders;
    }

    private extractBindingName(content: string, placeholder: string, resourceType: 'KV' | 'D1'): string | undefined {
        try {
            const parsedContent = JSON.parse(content);
            
            if (resourceType === 'KV' && parsedContent.kv_namespaces) {
                for (const kvNamespace of parsedContent.kv_namespaces) {
                    if (kvNamespace.id === placeholder) {
                        return kvNamespace.binding;
                    }
                }
            } else if (resourceType === 'D1' && parsedContent.d1_databases) {
                for (const d1Database of parsedContent.d1_databases) {
                    if (d1Database.database_id === placeholder) {
                        return d1Database.binding;
                    }
                }
            }
        } catch (error) {
            this.logger.warn('Could not parse wrangler.jsonc as JSON to extract binding name:', error);
        }
        
        return undefined;
    }

    replacePlaceholders(content: string, replacements: PlaceholderReplacements): string {
        let updatedContent = content;
        
        for (const [placeholder, resourceId] of Object.entries(replacements)) {
            if (updatedContent.includes(placeholder)) {
                updatedContent = updatedContent.replace(new RegExp(placeholder, 'g'), resourceId);
                this.logger.info(`Replaced ${placeholder} with ${resourceId}`);
            }
        }
        
        return updatedContent;
    }

    parseWranglerConfig(content: string): ParseResult {
        const placeholders = this.detectPlaceholders(content);
        
        return {
            hasPlaceholders: placeholders.length > 0,
            placeholders,
            content
        };
    }

    validateReplacements(content: string): boolean {
        const remainingPlaceholders = this.detectPlaceholders(content);
        
        if (remainingPlaceholders.length > 0) {
            this.logger.warn(`Still has ${remainingPlaceholders.length} unresolved placeholders:`, 
                remainingPlaceholders.map(p => p.placeholder));
            return false;
        }
        
        this.logger.info('All placeholders have been successfully replaced');
        return true;
    }

    createReplacementSummary(replacements: PlaceholderReplacements): string {
        const summary = Object.entries(replacements)
            .map(([placeholder, id]) => `${placeholder} → ${id}`)
            .join(', ');
        
        return `Replaced ${Object.keys(replacements).length} placeholders: ${summary}`;
    }
}