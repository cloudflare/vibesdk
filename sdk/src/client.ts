import type {
	ApiResponse,
	AppDetails,
	AppListItem,
	AppVisibility,
	AppWithFavoriteStatus,
	BuildOptions,
	BuildStartEvent,
	Credentials,
	DeleteResult,
	PublicAppsQuery,
	ToggleResult,
	VibeClientOptions,
	VisibilityUpdateResult,
} from './types';
import { HttpClient } from './http';
import { parseNdjsonStream } from './ndjson';
import { BuildSession } from './session';

function toQueryString(query: Record<string, string | number | undefined>): string {
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(query)) {
		if (v === undefined) continue;
		params.set(k, String(v));
	}
	const s = params.toString();
	return s ? `?${s}` : '';
}

export class VibeClient {
	private http: HttpClient;

	constructor(options: VibeClientOptions) {
		this.http = new HttpClient(options);
	}

	get baseUrl(): string {
		return this.http.baseUrl;
	}

	/**
	 * Creates a new agent/app from a prompt and returns a BuildSession.
	 */
	async build(prompt: string, options: BuildOptions = {}): Promise<BuildSession> {
		const body = {
			query: prompt,
			language: options.language,
			frameworks: options.frameworks,
			selectedTemplate: options.selectedTemplate,
			behaviorType: options.behaviorType,
			projectType: options.projectType,
			images: options.images,
			credentials: options.credentials,
		};

		const resp = await this.http.fetchRaw('/api/agent', {
			method: 'POST',
			headers: await this.http.headers({ 'Content-Type': 'application/json' }),
			body: JSON.stringify(body),
		});

		if (!resp.body) {
			throw new Error('Missing response body from /api/agent');
		}

		let start: BuildStartEvent | null = null;

		for await (const obj of parseNdjsonStream(resp.body)) {
			if (!start) {
				start = obj as BuildStartEvent;
				continue;
			}
			const o = obj as { chunk?: unknown };
			if (typeof o.chunk === 'string') {
				options.onBlueprintChunk?.(o.chunk);
			}
		}

		if (!start) {
			throw new Error('No start event received from /api/agent');
		}

		const session = new BuildSession(start, {
			httpClient: this.http,
			...(options.credentials ? { defaultCredentials: options.credentials } : {}),
		});

		if (options.autoConnect ?? true) {
			await session.connect();
			if (options.autoGenerate ?? true) {
				session.startGeneration();
			}
		}

		return session;
	}

	/** Connect to an existing agent/app by id. */
	async connect(agentId: string, options: { credentials?: Credentials } = {}): Promise<BuildSession> {
		const data = await this.http.fetchJson<ApiResponse<{ websocketUrl: string; agentId: string }>>(
			`/api/agent/${agentId}/connect`,
			{ method: 'GET', headers: await this.http.headers() }
		);

		if (!data.success || !data.data) {
			throw new Error(data.error?.message ?? 'Failed to connect to agent');
		}

		const start: BuildStartEvent = {
			agentId: data.data.agentId,
			websocketUrl: data.data.websocketUrl,
		};

		return new BuildSession(start, {
			httpClient: this.http,
			...(options.credentials ? { defaultCredentials: options.credentials } : {}),
		});
	}

	apps = {
		/** List public apps with optional filtering and pagination. */
		listPublic: async (query: PublicAppsQuery = {}) => {
			const qs = toQueryString({
				limit: query.limit,
				offset: query.offset,
				sort: query.sort,
				order: query.order,
				period: query.period,
				framework: query.framework,
				search: query.search,
			});
			return this.http.fetchJson<ApiResponse<{ apps: AppListItem[]; pagination?: unknown }>>(
				`/api/apps/public${qs}`,
				{ method: 'GET', headers: await this.http.headers() }
			);
		},

		/** List all apps owned by the authenticated user. */
		listMine: async () => {
			return this.http.fetchJson<ApiResponse<{ apps: AppWithFavoriteStatus[] }>>('/api/apps', {
				method: 'GET',
				headers: await this.http.headers(),
			});
		},

		/** List recent apps (last 10) for the authenticated user. */
		listRecent: async () => {
			return this.http.fetchJson<ApiResponse<{ apps: AppWithFavoriteStatus[] }>>('/api/apps/recent', {
				method: 'GET',
				headers: await this.http.headers(),
			});
		},

		/** List favorite apps for the authenticated user. */
		listFavorites: async () => {
			return this.http.fetchJson<ApiResponse<{ apps: AppWithFavoriteStatus[] }>>('/api/apps/favorites', {
				method: 'GET',
				headers: await this.http.headers(),
			});
		},

		/** Get detailed information about a specific app. */
		get: async (appId: string) => {
			return this.http.fetchJson<ApiResponse<AppDetails>>(`/api/apps/${appId}`, {
				method: 'GET',
				headers: await this.http.headers(),
			});
		},

		/** Delete an app (owner only). */
		delete: async (appId: string) => {
			return this.http.fetchJson<ApiResponse<DeleteResult>>(`/api/apps/${appId}`, {
				method: 'DELETE',
				headers: await this.http.headers(),
			});
		},

		/** Update app visibility (owner only). */
		setVisibility: async (appId: string, visibility: AppVisibility) => {
			return this.http.fetchJson<ApiResponse<VisibilityUpdateResult>>(`/api/apps/${appId}/visibility`, {
				method: 'PUT',
				headers: await this.http.headers({ 'Content-Type': 'application/json' }),
				body: JSON.stringify({ visibility }),
			});
		},

		/** Toggle star/bookmark status on an app. */
		toggleStar: async (appId: string) => {
			return this.http.fetchJson<ApiResponse<ToggleResult>>(`/api/apps/${appId}/star`, {
				method: 'POST',
				headers: await this.http.headers(),
			});
		},

		/** Toggle favorite status on an app. */
		toggleFavorite: async (appId: string) => {
			return this.http.fetchJson<ApiResponse<ToggleResult>>(`/api/apps/${appId}/favorite`, {
				method: 'POST',
				headers: await this.http.headers(),
			});
		},

		/** Generate a git clone token for an app (owner only). */
		getGitCloneToken: async (appId: string) => {
			return this.http.fetchJson<
				ApiResponse<{ token: string; expiresIn: number; expiresAt: string; cloneUrl: string }>
			>(`/api/apps/${appId}/git/token`, {
				method: 'POST',
				headers: await this.http.headers({ 'Content-Type': 'application/json' }),
			});
		},
	};
}
