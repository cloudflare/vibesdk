export const queryKeys = {
	apps: {
		all: ['apps'] as const,
		user: () => [...queryKeys.apps.all, 'user'] as const,
		favorites: () => [...queryKeys.apps.all, 'favorites'] as const,
	},
};
