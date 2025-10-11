import { ConfigurableSecuritySettings, getConfigurableSecurityDefaults } from "./security";
import { createLogger } from "../logger";

const logger = createLogger('GlobalConfigurableSettings');

let cachedConfig: GlobalConfigurableSettings | null = null;

// Per-invocation cache to avoid multiple KV calls within single worker invocation
const invocationUserCache = new Map<string, GlobalConfigurableSettings>();

/**
 *  deep merge utility for configuration objects
 * 
 * Merge rules:
 * - undefined in source: use target value (default)
 * - null/empty array/empty string in source: use source value (intentional override)
 * - objects: recursively merge
 * - primitives and arrays: source overwrites target
 */
type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>
} : T;

type MergeableValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

/**
 * Type guard to check if a value should be recursively merged
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.prototype.toString.call(value) === '[object Object]'
    );
}

/**
 * Deep merge implementation with full type safety
 */
function deepMerge<T>(
    target: T,
    source: DeepPartial<T>
): T {
    // Handle null/undefined source
    if (source === null || source === undefined) {
        return target;
    }
    
    // Handle non-object targets or sources
    if (!isPlainObject(target) || !isPlainObject(source)) {
        return (source !== undefined ? source : target) as T;
    }
    
    // Safe type assertion after guard checks
    const targetObj = target as Record<string, MergeableValue>;
    const sourceObj = source as Record<string, unknown>;
    const result = { ...targetObj } as Record<string, MergeableValue>;
    
    // Merge properties
    Object.entries(sourceObj).forEach(([key, sourceValue]) => {
        // Skip undefined - means "use default"
        if (sourceValue === undefined) {
            return;
        }
        
        const targetValue = targetObj[key];
        
        // Recursive merge for nested objects
        if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
            result[key] = deepMerge(targetValue, sourceValue);
        } else {
            // Direct assignment for primitives, arrays, null, or empty values
            result[key] = sourceValue as MergeableValue;
        }
    });
    
    return result as T;
}

export interface GlobalMessagingSettings {
    globalUserMessage: string;
    changeLogs: string;
}

export interface GlobalConfigurableSettings {
    security: ConfigurableSecuritySettings;
    globalMessaging: GlobalMessagingSettings;
}

type StoredConfig = DeepPartial<GlobalConfigurableSettings>;

const CONFIG_KEY = 'platform_configs';

export async function getGlobalConfigurableSettings(env: Env): Promise<GlobalConfigurableSettings> {
    if (cachedConfig) {
        return cachedConfig;
    }
    // Get default configuration
    const defaultConfig: GlobalConfigurableSettings = {
        security: getConfigurableSecurityDefaults(),
        globalMessaging: {
            globalUserMessage: "",
            changeLogs: ""
        }
    };
    
    try {
        // Try to fetch override config from KV
        const storedConfigJson = await env.VibecoderStore.get(CONFIG_KEY);
        
        if (!storedConfigJson) {
            // No stored config, use defaults
            return defaultConfig;
        }
        
        // Parse stored configuration
        const storedConfig: StoredConfig = JSON.parse(storedConfigJson);
        
        // Deep merge configurations (stored config overrides defaults)
        const mergedConfig = deepMerge<GlobalConfigurableSettings>(defaultConfig, storedConfig);
        
        logger.info('Loaded configuration with overrides from KV', { storedConfig, mergedConfig });
        cachedConfig = mergedConfig;
        return mergedConfig;
        
    } catch (error) {
        logger.error('Failed to load configuration from KV, using defaults', error);
        // On error, fallback to default configuration
        return defaultConfig;
    }
}

export async function getUserConfigurableSettings(env: Env, userId: string): Promise<GlobalConfigurableSettings> {
    const globalConfig = await getGlobalConfigurableSettings(env);
    if (!userId) {
        return globalConfig;
    }

    if (invocationUserCache.has(userId)) {
        const conf = invocationUserCache.get(userId)!
        logger.info(`Using cached configuration for user ${userId}`, conf);
        return conf;
    }
    try {
        // Try to fetch override config from KV
        const storedConfigJson = await env.VibecoderStore.get(`user_config:${userId}`);
        
        if (!storedConfigJson) {
            // No stored config, use defaults
            return globalConfig;
        }
        
        // Parse stored configuration
        const storedConfig: StoredConfig = JSON.parse(storedConfigJson);
        
        // Deep merge configurations (stored config overrides defaults)
        const mergedConfig = deepMerge<GlobalConfigurableSettings>(globalConfig, storedConfig);
        
        logger.info(`Loaded configuration with overrides from KV for user ${userId}`, { globalConfig, storedConfig, mergedConfig });
        invocationUserCache.set(userId, mergedConfig);
        return mergedConfig;
        
    } catch (error) {
        logger.error(`Failed to load configuration from KV for user ${userId}, using defaults`, error);
        // On error, fallback to default configuration
        return globalConfig;
    }
}
    
