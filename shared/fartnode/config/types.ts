export type SolanaCluster = 'localnet' | 'devnet' | 'testnet' | 'mainnet-beta';

export interface ProgramAddresses {
	points: string;
	quests: string;
	escrow: string;
	registry: string;
}

export interface ModuleToggleConfig {
	enabled?: boolean;
	authority?: string;
	options?: Record<string, unknown>;
}

export interface TreasuryDistribution {
	creator?: number;
	community?: number;
	treasury?: number;
}

export interface SolanaConfig {
	cluster: SolanaCluster;
	rpcUrl?: string;
	priorityFeeMicroLamports?: number;
	programs: ProgramAddresses;
	mints?: {
		points?: string;
		rewards?: string;
	};
}

export interface ProjectConfig {
	name: string;
	slug: string;
	description?: string;
	thumbnail?: string;
}

export interface FartConfig {
	project: ProjectConfig;
	solana: SolanaConfig;
	modules?: {
		points?: ModuleToggleConfig;
		quests?: ModuleToggleConfig;
		escrow?: ModuleToggleConfig;
		badges?: ModuleToggleConfig;
	};
	templates?: {
		default?: 'arcade' | 'rpg-lite';
		available?: string[];
	};
	attestation?: {
		authority?: string;
		dnsTxtRecord?: string;
		siwsDomain?: string;
	};
	treasury?: {
		vault?: string;
		distribution?: TreasuryDistribution;
	};
}
