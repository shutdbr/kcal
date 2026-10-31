import { redirect } from '@sveltejs/kit';
import { safeRedirectPath } from '$lib/features/auth/user';
import type { RequestHandler } from './$types';

/** Google returns here with a one-time code: trade it for the session cookies
 *  and carry on where the student started signing in. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const code = url.searchParams.get('code');
	if (code && locals.supabase) {
		const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (!error) redirect(303, safeRedirectPath(url.searchParams.get('next')));
	}
	redirect(303, '/?signin=failed');
};
