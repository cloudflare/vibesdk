import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from './auth-context';
import type { VaultConfigResponse, KdfAlgorithm, SecretMetadata } from '@/api-types';
import {
	deriveVMKFromPassword,
	deriveVMKFromPRF,
	deriveVMKFromRecoveryCode,
	generateSessionKey,
	encryptVMKForSession,
	storeSession,
	getSession,
	clearSession,
	decryptWithKey,
	encryptWithKey,
	generateRecoveryCodes,
	encryptRecoveryCodes,
	createVerificationBlob,
	verifyVMK,
	generateSalt,
	uint8ArrayToBase64,
	base64ToUint8Array,
} from '@/lib/vault-crypto';

type VaultStatus = 'unknown' | 'not_setup' | 'locked' | 'unlocked';

interface VaultState {
	status: VaultStatus;
	config: VaultConfigResponse | null;
	unlockMethod: KdfAlgorithm | null;
	isLoading: boolean;
	error: string | null;
	unlockRequested: boolean;
	unlockReason: string | null;
}

export interface SecretListItem {
	id: string;
	name: string; // Decrypted name
	secretType: 'secret';
	metadata?: SecretMetadata; // Plaintext metadata (e.g., { provider: "openai" })
	createdAt: string;
	updatedAt: string;
}

interface VaultContextValue {
	state: VaultState;
	isUnlocked: boolean;

	// Setup
	setupVaultWithPassword(password: string): Promise<string[]>;
	setupVaultWithPasskey(): Promise<string[]>;

	// Unlock
	unlockWithPassword(password: string): Promise<{ success: boolean; error?: string }>;
	unlockWithPasskey(): Promise<{ success: boolean; error?: string }>;
	unlockWithRecoveryCode(code: string): Promise<{ success: boolean; error?: string }>;

	// Lock
	lockVault(): Promise<void>;
	resetVault(): Promise<boolean>;

	// Secrets CRUD
	encryptAndStoreSecret(name: string, value: string, metadata?: SecretMetadata): Promise<string | null>;
	listSecrets(): Promise<SecretListItem[]>;
	getSecretValue(secretId: string): Promise<{ value: string; metadata?: SecretMetadata } | null>;
	deleteSecret(secretId: string): Promise<boolean>;
	decryptSecret(encryptedValue: Uint8Array, nonce: Uint8Array): Promise<string | null>;
	decryptSecretName(encryptedName: Uint8Array, nonce: Uint8Array): Promise<string | null>;

	// Unlock request (for agent flow)
	requestUnlock(reason: string): void;
	clearUnlockRequest(): void;

	// Refresh
	refreshStatus(): Promise<void>;
}

const VaultContext = createContext<VaultContextValue | undefined>(undefined);

export function VaultProvider({ children }: { children: React.ReactNode }) {
	const { isAuthenticated, user } = useAuth();
	const [state, setState] = useState<VaultState>({
		status: 'unknown',
		config: null,
		unlockMethod: null,
		isLoading: true,
		error: null,
		unlockRequested: false,
		unlockReason: null,
	});
	const vaultWsRef = useRef<WebSocket | null>(null);
	const vmkRef = useRef<CryptoKey | null>(null);
	const pendingRequestsRef = useRef<Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void }>>(
		new Map()
	);

	const setError = useCallback((error: string | null) => {
		setState((s) => ({ ...s, error }));
	}, []);

	const setLoading = useCallback((isLoading: boolean) => {
		setState((s) => ({ ...s, isLoading }));
	}, []);

	const connectVaultWebSocket = useCallback(
		(
			encryptedVMK: Uint8Array<ArrayBuffer>,
			nonce: Uint8Array<ArrayBuffer>,
			sessionKey: Uint8Array<ArrayBuffer>
		): Promise<boolean> => {
			return new Promise((resolve) => {
				const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
				const ws = new WebSocket(`${protocol}//${window.location.host}/api/vault/ws`);

				ws.onopen = () => {
					ws.send(
						JSON.stringify({
							type: 'vault_session_init',
							encryptedVMK: uint8ArrayToBase64(encryptedVMK),
							nonce: uint8ArrayToBase64(nonce),
							sessionKey: uint8ArrayToBase64(sessionKey),
						})
					);
				};

				ws.onmessage = (event) => {
					const msg = JSON.parse(event.data);
					if (msg.type === 'vault_session_ready') {
						vaultWsRef.current = ws;
						resolve(true);
					} else if (msg.type === 'vault_ws_error') {
						console.error('Vault WebSocket error:', msg.error);
						resolve(false);
					} else if (msg.requestId && pendingRequestsRef.current.has(msg.requestId)) {
						const pending = pendingRequestsRef.current.get(msg.requestId);
						pendingRequestsRef.current.delete(msg.requestId);
						pending?.resolve(msg);
					}
				};

				ws.onerror = () => {
					resolve(false);
				};

				ws.onclose = () => {
					if (vaultWsRef.current === ws) {
						vaultWsRef.current = null;
					}
				};

				setTimeout(() => resolve(false), 10000);
			});
		},
		[]
	);

	const unlockWithDerivedKey = useCallback(
		async (vmk: CryptoKey): Promise<void> => {
			const sessionKey = generateSessionKey();
			const encryptedVMK = await encryptVMKForSession(vmk, sessionKey);

			const connected = await connectVaultWebSocket(encryptedVMK.ciphertext, encryptedVMK.nonce, sessionKey);
			if (!connected) {
				throw new Error('Failed to establish vault WebSocket connection');
			}

			storeSession({ sessionKey });
			vmkRef.current = vmk;
		},
		[connectVaultWebSocket],
	);

	// Fetch vault status
	const refreshStatus = useCallback(async () => {
		if (!isAuthenticated) {
			setState({
				status: 'unknown',
				config: null,
				unlockMethod: null,
				isLoading: false,
				error: null,
				unlockRequested: false,
				unlockReason: null,
			});
			return;
		}

		try {
			setLoading(true);
			const response = await apiClient.getVaultStatus();

			if (!response.data?.exists) {
				setState((prev) => ({
					...prev,
					status: 'not_setup',
					config: null,
					unlockMethod: null,
					isLoading: false,
					error: null,
				}));
				return;
			}

			// Check if we have a valid session (WebSocket still connected and VMK cached)
			const session = getSession();
			const kdfAlgorithm = response.data?.kdfAlgorithm || null;
			if (session && vmkRef.current && vaultWsRef.current?.readyState === WebSocket.OPEN) {
				setState((prev) => ({
					...prev,
					status: 'unlocked',
					config: null,
					unlockMethod: kdfAlgorithm,
					isLoading: false,
					error: null,
				}));
			} else {
				// Clear any stale session data
				clearSession();
				vmkRef.current = null;
				setState((prev) => ({
					...prev,
					status: 'locked',
					config: null,
					unlockMethod: kdfAlgorithm,
					isLoading: false,
					error: null,
				}));
			}
		} catch (error) {
			console.error('Failed to fetch vault status:', error);
			setState((prev) => ({
				...prev,
				status: 'unknown',
				config: null,
				unlockMethod: null,
				isLoading: false,
				error: 'Failed to check vault status',
			}));
		}
	}, [isAuthenticated, setLoading]);

	// Setup with password
	const setupVaultWithPassword = useCallback(
		async (password: string): Promise<string[]> => {
			try {
				setLoading(true);
				setError(null);

				// Generate salt
				const kdfSalt = generateSalt(32);

				// Derive VMK
				const vmk = await deriveVMKFromPassword(password, kdfSalt);

				// Create verification blob
				const verification = await createVerificationBlob(vmk);

				// Generate recovery codes
				const codes = generateRecoveryCodes(8);
				const encryptedCodes = await encryptRecoveryCodes(vmk, codes);

				// Setup vault on server
				const response = await apiClient.setupVault({
					kdfAlgorithm: 'argon2id',
					kdfSalt: uint8ArrayToBase64(kdfSalt),
					kdfParams: { time: 3, mem: 65536, parallelism: 4 },
					encryptedRecoveryCodes: uint8ArrayToBase64(encryptedCodes.ciphertext),
					recoveryCodesNonce: uint8ArrayToBase64(encryptedCodes.nonce),
					verificationBlob: uint8ArrayToBase64(verification.ciphertext),
					verificationNonce: uint8ArrayToBase64(verification.nonce),
				});

				if (!response.data?.success) {
					throw new Error('Failed to setup vault');
				}

				// Auto-unlock after setup
				await unlockWithDerivedKey(vmk);

				setState((s) => ({
					...s,
					status: 'unlocked',
					unlockMethod: 'argon2id',
					isLoading: false,
				}));

				return codes;
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unlock failed';
				setError(message);
				setLoading(false);
				throw error;
			}
		},
		[setLoading, setError, unlockWithDerivedKey],
	);

	// Setup with passkey (WebAuthn PRF)
	const setupVaultWithPasskey = useCallback(async (): Promise<string[]> => {
		try {
			setLoading(true);
			setError(null);

			// Check WebAuthn PRF support
			if (!window.PublicKeyCredential) {
				throw new Error('WebAuthn not supported');
			}

			// Generate salts
			const prfSalt = generateSalt(32);
			const hkdfSalt = generateSalt(32);

			// Create credential with PRF extension
			const credential = (await navigator.credentials.create({
				publicKey: {
					challenge: crypto.getRandomValues(new Uint8Array(32)),
					rp: { name: 'vibesdk', id: window.location.hostname },
					user: {
						id: new TextEncoder().encode(user?.id || 'user'),
						name: user?.email || 'user',
						displayName: user?.displayName || 'User',
					},
					pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
					authenticatorSelection: {
						userVerification: 'required',
						residentKey: 'preferred',
					},
					extensions: {
						prf: {},
					},
				},
			})) as PublicKeyCredential;

			if (!credential) {
				throw new Error('Failed to create passkey');
			}

			// Get PRF output
			const assertion = (await navigator.credentials.get({
				publicKey: {
					challenge: crypto.getRandomValues(new Uint8Array(32)),
					rpId: window.location.hostname,
					allowCredentials: [{ id: credential.rawId, type: 'public-key' }],
					extensions: {
						prf: { eval: { first: prfSalt } },
					},
				},
			})) as PublicKeyCredential;

			const prfResults = assertion.getClientExtensionResults().prf;
			if (!prfResults?.results?.first) {
				throw new Error('PRF not supported by authenticator');
			}

			// Derive VMK from PRF output (PRF spec guarantees ArrayBuffer output)
			const vmk = await deriveVMKFromPRF(prfResults.results.first as ArrayBuffer, hkdfSalt);

			// Create verification blob
			const verification = await createVerificationBlob(vmk);

			// Generate recovery codes
			const codes = generateRecoveryCodes(8);
			const encryptedCodes = await encryptRecoveryCodes(vmk, codes);

			// Setup vault on server
			const response = await apiClient.setupVault({
				kdfAlgorithm: 'webauthn-prf',
				kdfSalt: uint8ArrayToBase64(hkdfSalt),
				prfCredentialId: uint8ArrayToBase64(new Uint8Array(credential.rawId)),
				prfSalt: uint8ArrayToBase64(prfSalt),
				encryptedRecoveryCodes: uint8ArrayToBase64(encryptedCodes.ciphertext),
				recoveryCodesNonce: uint8ArrayToBase64(encryptedCodes.nonce),
				verificationBlob: uint8ArrayToBase64(verification.ciphertext),
				verificationNonce: uint8ArrayToBase64(verification.nonce),
			});

			if (!response.data?.success) {
				throw new Error('Failed to setup vault');
			}

			// Auto-unlock after setup
			await unlockWithDerivedKey(vmk);

			setState((s) => ({
				...s,
				status: 'unlocked',
				unlockMethod: 'webauthn-prf',
				isLoading: false,
			}));

			return codes;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Setup failed';
			setError(message);
			setLoading(false);
			throw error;
		}
	}, [setLoading, setError, unlockWithDerivedKey, user]);


	// Unlock with password
	const unlockWithPassword = useCallback(
		async (password: string): Promise<{ success: boolean; error?: string }> => {
			try {
				setLoading(true);
				setError(null);

				// Get vault config
				const configResponse = await apiClient.getVaultConfig();
				if (!configResponse.data?.config) {
					throw new Error('Vault not configured');
				}

				const config = configResponse.data.config;
				const kdfSalt = base64ToUint8Array(config.kdfSalt);

				// Derive VMK
				const vmk = await deriveVMKFromPassword(password, kdfSalt);

				// Verify VMK
				const verificationBlob = base64ToUint8Array(config.verificationBlob);
				const verificationNonce = base64ToUint8Array(config.verificationNonce);
				const isValid = await verifyVMK(vmk, verificationBlob, verificationNonce);

				if (!isValid) {
					const errorMessage = 'Invalid password';
					setError(errorMessage);
					setLoading(false);
					return { success: false, error: errorMessage };
				}

				await unlockWithDerivedKey(vmk);

				setState((s) => ({
					...s,
					status: 'unlocked',
					isLoading: false,
				}));

				return { success: true };
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unlock failed';
				setError(message);
				setLoading(false);
				return { success: false, error: message };
			}
		},
		[setLoading, setError, unlockWithDerivedKey]
	);

	// Unlock with passkey
	const unlockWithPasskey = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
		try {
			setLoading(true);
			setError(null);

			// Get vault config
			const configResponse = await apiClient.getVaultConfig();
			if (!configResponse.data?.config) {
				throw new Error('Vault not configured');
			}

			const config = configResponse.data.config;

			if (!config.prfCredentialId || !config.prfSalt) {
				throw new Error('Vault configuration invalid. Reset your vault and set it up again.');
			}

			const credentialId = base64ToUint8Array(config.prfCredentialId);
			const prfSalt = base64ToUint8Array(config.prfSalt);
			const hkdfSalt = base64ToUint8Array(config.kdfSalt);

			// Get PRF output
			const assertion = (await navigator.credentials.get({
				publicKey: {
					challenge: crypto.getRandomValues(new Uint8Array(32)),
					rpId: window.location.hostname,
					allowCredentials: [{ id: credentialId, type: 'public-key' }],
					extensions: {
						prf: { eval: { first: prfSalt } },
					},
				},
			})) as PublicKeyCredential;

			const prfResults = assertion.getClientExtensionResults().prf;
			if (!prfResults?.results?.first) {
				throw new Error('PRF not supported');
			}

			// Derive VMK (PRF spec guarantees ArrayBuffer output)
			const vmk = await deriveVMKFromPRF(prfResults.results.first as ArrayBuffer, hkdfSalt);

			// Verify VMK
			const verificationBlob = base64ToUint8Array(config.verificationBlob);
			const verificationNonce = base64ToUint8Array(config.verificationNonce);
			const isValid = await verifyVMK(vmk, verificationBlob, verificationNonce);

			if (!isValid) {
				const errorMessage = 'Passkey verification failed';
				setError(errorMessage);
				setLoading(false);
				return { success: false, error: errorMessage };
			}

			await unlockWithDerivedKey(vmk);

			setState((s) => ({
				...s,
				status: 'unlocked',
				isLoading: false,
			}));

			return { success: true };

		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unlock failed';
			setError(message);
			setLoading(false);
			return { success: false, error: message };
		}
	}, [setLoading, setError, unlockWithDerivedKey]);

	// Unlock with recovery code
	const unlockWithRecoveryCode = useCallback(
		async (code: string): Promise<{ success: boolean; error?: string }> => {
			try {
				setLoading(true);
				setError(null);

				// Get vault config
				const configResponse = await apiClient.getVaultConfig();
				if (!configResponse.data?.config) {
					throw new Error('Vault not configured');
				}

				const config = configResponse.data.config;
				const kdfSalt = base64ToUint8Array(config.kdfSalt);

				// Derive VMK from recovery code
				const vmk = await deriveVMKFromRecoveryCode(code, kdfSalt);

				// Verify VMK
				const verificationBlob = base64ToUint8Array(config.verificationBlob);
				const verificationNonce = base64ToUint8Array(config.verificationNonce);
				const isValid = await verifyVMK(vmk, verificationBlob, verificationNonce);

				if (!isValid) {
					const errorMessage = 'Invalid recovery code';
					setError(errorMessage);
					setLoading(false);
					return { success: false, error: errorMessage };
				}

				await unlockWithDerivedKey(vmk);

				setState((s) => ({
					...s,
					status: 'unlocked',
					isLoading: false,
				}));

				return { success: true };
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unlock failed';
				setError(message);
				setLoading(false);
				return { success: false, error: message };
			}
		},
		[setLoading, setError, unlockWithDerivedKey]
	);

	const lockVault = useCallback(async (): Promise<void> => {
		if (vaultWsRef.current) {
			vaultWsRef.current.send(JSON.stringify({ type: 'vault_session_close' }));
			vaultWsRef.current.close();
			vaultWsRef.current = null;
		}

		clearSession();
		vmkRef.current = null;

		setState((s) => ({
			...s,
			status: 'locked',
			error: null,
		}));
	}, []);

	const resetVault = useCallback(async (): Promise<boolean> => {
		try {
			setLoading(true);
			setError(null);

			if (vaultWsRef.current) {
				vaultWsRef.current.send(JSON.stringify({ type: 'vault_session_close' }));
				vaultWsRef.current.close();
				vaultWsRef.current = null;
			}

			clearSession();
			vmkRef.current = null;

			const response = await apiClient.resetVault();
			await refreshStatus();
			return !!response.data?.success;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to reset vault';
			setError(message);
			return false;
		} finally {
			setLoading(false);
		}
	}, [refreshStatus, setError, setLoading]);

	// Helper to send WebSocket request and wait for response
	const sendVaultRequest = useCallback(
		<T,>(message: Record<string, unknown>): Promise<T> => {
			return new Promise((resolve, reject) => {
				if (!vaultWsRef.current || vaultWsRef.current.readyState !== WebSocket.OPEN) {
					reject(new Error('Vault WebSocket not connected'));
					return;
				}

				const requestId = crypto.randomUUID();
				const timeout = setTimeout(() => {
					pendingRequestsRef.current.delete(requestId);
					reject(new Error('Request timeout'));
				}, 30000);

				pendingRequestsRef.current.set(requestId, {
					resolve: (data) => {
						clearTimeout(timeout);
						resolve(data as T);
					},
					reject: (error) => {
						clearTimeout(timeout);
						reject(error);
					},
				});

				vaultWsRef.current.send(JSON.stringify({ ...message, requestId }));
			});
		},
		[]
	);

	// Encrypt and store a secret
	const encryptAndStoreSecret = useCallback(
		async (name: string, value: string, metadata?: SecretMetadata): Promise<string | null> => {
			if (!vmkRef.current) {
				setError('Vault is locked');
				return null;
			}

			try {
				// Encrypt value with VMK
				const encryptedValue = await encryptWithKey(vmkRef.current, value);
				const encryptedName = await encryptWithKey(vmkRef.current, name);

				// Format: base64Ciphertext:base64Nonce
				const encryptedValueStr =
					uint8ArrayToBase64(encryptedValue.ciphertext) + ':' + uint8ArrayToBase64(encryptedValue.nonce);
				const encryptedNameStr =
					uint8ArrayToBase64(encryptedName.ciphertext) + ':' + uint8ArrayToBase64(encryptedName.nonce);

				const response = await sendVaultRequest<{
					type: string;
					success: boolean;
					secretId?: string;
					error?: string;
				}>({
					type: 'vault_store_secret',
					name,
					encryptedValue: encryptedValueStr,
					encryptedNameForStorage: encryptedNameStr,
					secretType: 'secret',
					metadata, // Plaintext metadata
				});

				if (response.success && response.secretId) {
					return response.secretId;
				}

				setError(response.error || 'Failed to store secret');
				return null;
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to store secret';
				setError(message);
				return null;
			}
		},
		[setError, sendVaultRequest]
	);

	// List secrets (decrypts names client-side)
	const listSecrets = useCallback(async (): Promise<SecretListItem[]> => {
		if (!vmkRef.current) {
			return [];
		}

		try {
			const response = await sendVaultRequest<{
				type: string;
				secrets: Array<{
					id: string;
					encryptedName: string;
					secretType: 'secret';
					metadata?: Record<string, unknown>;
					createdAt: string;
					updatedAt: string;
				}>;
			}>({
				type: 'vault_list_secrets',
			});

			// Decrypt names client-side
			const decryptedSecrets: SecretListItem[] = [];
			for (const secret of response.secrets) {
				const [ciphertext, nonce] = secret.encryptedName.split(':');
				const decryptedName = await decryptWithKey(
					vmkRef.current,
					base64ToUint8Array(ciphertext),
					base64ToUint8Array(nonce)
				);
				decryptedSecrets.push({
					id: secret.id,
					name: decryptedName,
					secretType: 'secret',
					metadata: secret.metadata as SecretMetadata | undefined,
					createdAt: secret.createdAt,
					updatedAt: secret.updatedAt,
				});
			}

			return decryptedSecrets;
		} catch (error) {
			console.error('Failed to list secrets:', error);
			return [];
		}
	}, [sendVaultRequest]);

	// Delete a secret
	const deleteSecret = useCallback(
		async (secretId: string): Promise<boolean> => {
			try {
				const response = await sendVaultRequest<{
					type: string;
					success: boolean;
					error?: string;
				}>({
					type: 'vault_delete_secret',
					secretId,
				});

				if (!response.success) {
					setError(response.error || 'Failed to delete secret');
				}

				return response.success;
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to delete secret';
				setError(message);
				return false;
			}
		},
		[setError, sendVaultRequest]
	);

	// Get and decrypt a secret value by ID
	const getSecretValue = useCallback(
		async (secretId: string): Promise<{ value: string; metadata?: SecretMetadata } | null> => {
			if (!vmkRef.current) {
				console.error('getSecretValue: Vault is locked');
				return null;
			}

			try {
				const response = await sendVaultRequest<{
					type: string;
					success: boolean;
					encryptedValue?: string;
					metadata?: Record<string, unknown>;
					error?: string;
				}>({
					type: 'vault_get_secret',
					secretId,
				});

				if (!response.success || !response.encryptedValue) {
					console.error('getSecretValue: Failed:', response.error);
					return null;
				}

				const [ciphertext, nonce] = response.encryptedValue.split(':');
				const value = await decryptWithKey(
					vmkRef.current,
					base64ToUint8Array(ciphertext),
					base64ToUint8Array(nonce)
				);
				return {
					value,
					metadata: response.metadata as SecretMetadata | undefined,
				};
			} catch (error) {
				console.error('getSecretValue: Error:', error);
				return null;
			}
		},
		[sendVaultRequest]
	);

	// Decrypt a secret value
	const decryptSecret = useCallback(
		async (encryptedValue: Uint8Array<ArrayBuffer>, nonce: Uint8Array<ArrayBuffer>): Promise<string | null> => {
			if (!vmkRef.current) {
				return null;
			}

			try {
				return await decryptWithKey(vmkRef.current, encryptedValue, nonce);
			} catch {
				return null;
			}
		},
		[]
	);

	// Decrypt a secret name
	const decryptSecretName = useCallback(
		async (encryptedName: Uint8Array<ArrayBuffer>, nonce: Uint8Array<ArrayBuffer>): Promise<string | null> => {
			if (!vmkRef.current) {
				return null;
			}

			try {
				return await decryptWithKey(vmkRef.current, encryptedName, nonce);
			} catch {
				return null;
			}
		},
		[]
	);

	// Request unlock (called when agent needs vault access)
	const requestUnlock = useCallback((reason: string) => {
		setState((s) => ({
			...s,
			unlockRequested: true,
			unlockReason: reason,
		}));
	}, []);

	// Clear unlock request (called when unlock modal closes)
	const clearUnlockRequest = useCallback(() => {
		setState((s) => ({
			...s,
			unlockRequested: false,
			unlockReason: null,
		}));
	}, []);

	// Check status on mount and auth change
	useEffect(() => {
		refreshStatus();
	}, [refreshStatus, isAuthenticated]);

	useEffect(() => {
		if (!isAuthenticated) {
			if (vaultWsRef.current) {
				vaultWsRef.current.close();
				vaultWsRef.current = null;
			}
			clearSession();
			vmkRef.current = null;
		}
	}, [isAuthenticated]);

	const value: VaultContextValue = {
		state,
		isUnlocked: state.status === 'unlocked',
		setupVaultWithPassword,
		setupVaultWithPasskey,
		unlockWithPassword,
		unlockWithPasskey,
		unlockWithRecoveryCode,
		lockVault,
		resetVault,
		encryptAndStoreSecret,
		listSecrets,
		getSecretValue,
		deleteSecret,
		decryptSecret,
		decryptSecretName,
		requestUnlock,
		clearUnlockRequest,
		refreshStatus,
	};

	return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
	const context = useContext(VaultContext);
	if (!context) {
		throw new Error('useVault must be used within a VaultProvider');
	}
	return context;
}
