/**
 * Response types for the Artifacts "Repo" viewer controller.
 */

export interface ListAppBranchesResponse {
	/** Branch HEAD currently points at, or null if unknown. */
	current: string | null;
	/** All local branch names in the app's workspace repo. */
	branches: string[];
}
