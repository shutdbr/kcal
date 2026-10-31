import type { Handle } from '@sveltejs/kit';
import { toAuthUser, type AuthUser } from '$lib/features/auth/user';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const handle: Handle = async ({ event, resolve }) => {
	const supabase = createSupabaseServerClient(event);
	event.locals.supabase = supabase;

	// Verified only when a route asks: public pages never read the session, so
	// they carry no per-visitor state and can be cached at the edge.
	let user: Promise<AuthUser | null> | undefined;
	event.locals.getUser = () =>
		(user ??= (async () => {
			if (!supabase) return null;
			const { data, error } = await supabase.auth.getClaims();
			return error || !data ? null : toAuthUser(data.claims);
		})());

	return resolve(event, {
		// supabase-js reads these on responses SvelteKit replays during hydration
		filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version'
	});
};
