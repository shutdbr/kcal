import { createServerClient } from '@supabase/ssr';
import type { RequestEvent } from '@sveltejs/kit';
import { supabaseConfig } from '$lib/infrastructure/supabase/config';
import type { Database } from '$lib/infrastructure/supabase/database.types';

/** A request-scoped client that reads and refreshes the session cookies. */
export function createSupabaseServerClient(event: Pick<RequestEvent, 'cookies' | 'fetch'>) {
	const config = supabaseConfig();
	if (!config) return null;
	return createServerClient<Database>(config.url, config.key, {
		global: { fetch: event.fetch },
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookies) => {
				for (const { name, value, options } of cookies) event.cookies.set(name, value, { ...options, path: '/' });
			}
		}
	});
}
