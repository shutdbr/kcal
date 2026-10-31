import { browser } from '$app/environment';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const supabaseConfigured = Boolean(url && key);
let clientPromise: Promise<SupabaseClient<Database>> | undefined;

/** One browser client owns the session for every feature. Never use a service key here. */
export function getSupabase() {
	if (!browser || !supabaseConfigured) throw new Error('Cloud storage is not configured.');
	return (clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
		createClient<Database>(url!, key!, {
			auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
		})
	));
}
