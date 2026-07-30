import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export interface ProfileUpdateInput {
	displayName?: string;
	username?: string;
	bio?: string;
	timezone?: string;
	theme?: 'light' | 'dark' | 'system';
}

export function useUpdateProfile() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (input: ProfileUpdateInput) => {
			const response = await apiClient.updateProfile(input);
			if (!response.success) {
				throw new Error(
					response.error?.message || 'Failed to update profile',
				);
			}
			return response.data;
		},
		onSuccess: () => {
			// The endpoint returns only {success, message}, so refetch the
			// session to pick up the new user fields. Invalidation refetches
			// active observers regardless of staleTime, and AuthProvider is
			// always mounted — this is what updates the header/sidebar too.
			void queryClient.invalidateQueries({
				queryKey: queryKeys.auth.session(),
			});
		},
	});
}
