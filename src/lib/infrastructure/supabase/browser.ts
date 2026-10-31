import { browser } from '$app/environment';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from './config';
import type { Database } from './database.types';

let client: Promise<SupabaseClient<Database>> | undefined;

/**
 * The browser's one Supabase client, shared by every feature. Its session
 * lives in cookies (via @supabase/ssr), so server routes see the same
 * sign-in. Loaded on first use to keep supabase-js out of the initial bundle.
 */
export function getSupabase(): Promise<SupabaseClient<Database>> {
	const config = supabaseConfig();
	if (!browser || !config) return Promise.reject(new Error('Cloud storage is not configured.'));
	return (client ??= import('@supabase/ssr').then(({ createBrowserClient }) =>
		createBrowserClient<Database>(config.url, config.key)
	));
}
