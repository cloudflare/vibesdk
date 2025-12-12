/**
 * User Secrets Controller Types
 */

export interface UserSecretsListData {
    secrets: unknown[];
}

export interface UserSecretStoreData {
    secret: unknown;
    message: string;
}

export interface UserSecretValueData {
    value: string;
    metadata: unknown;
}

export interface UserSecretUpdateData {
    secret: unknown;
    message: string;
}

export interface UserSecretDeleteData {
    message: string;
}