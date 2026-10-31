import { building } from '$app/environment';
import { env } from '$env/dynamic/public';

export type SupabaseConfig = { url: string; key: string };

/**
 * The project's URL and publishable key, read at runtime so one build serves
 * any environment. Null when this deployment has no backend (local work,
 * tests): the planner then runs entirely in the browser. Never a secret key.
 */
export function supabaseConfig(): SupabaseConfig | null {
	// prerendering bakes pages for every visitor, nothing account-shaped there
	if (building) return null;
	const url = env.PUBLIC_SUPABASE_URL;
	const key = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
	return url && key ? { url, key } : null;
}

export const supabaseConfigured = () => supabaseConfig() !== null;
