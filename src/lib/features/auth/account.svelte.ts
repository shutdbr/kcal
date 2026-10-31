import { getSupabase } from '$lib/infrastructure/supabase/browser';
import { supabaseConfigured } from '$lib/infrastructure/supabase/config';
import { toAuthUser, type AuthUser } from './user';

/** The browser's view of who is signed in. One instance for the whole app;
 *  features read `user` and never subscribe to auth events themselves. */
class Account {
	user = $state<AuthUser | null>(null);
	ready = $state(false);
	error = $state('');
	busy = $state(false);
	#starting: Promise<void> | undefined;

	init() {
		return (this.#starting ??= this.#start());
	}

	async #start() {
		const url = new URL(location.href);
		if (url.searchParams.get('signin') === 'failed') {
			this.error = 'Google sign-in did not finish. Please try again.';
			url.searchParams.delete('signin');
			history.replaceState(history.state, '', url);
		}
		if (!supabaseConfigured()) {
			this.ready = true;
			return;
		}
		try {
			const client = await getSupabase();
			client.auth.onAuthStateChange((_event, session) => {
				this.user = session ? toAuthUser(session.user) : null;
				this.ready = true;
			});
			// the session cookie is readable here, so no network round trip
			const { data, error } = await client.auth.getSession();
			if (error) throw error;
			this.user = data.session ? toAuthUser(data.session.user) : null;
		} catch {
			this.error = 'Sign-in could not be restored. Refresh the page and try again.';
		} finally {
			this.ready = true;
		}
	}

	/** Off to Google, back through /auth/callback to the page we were on. */
	async signIn(next = location.pathname + location.search) {
		if (this.busy) return;
		this.busy = true;
		this.error = '';
		try {
			const client = await getSupabase();
			const callback = new URL('/auth/callback', location.origin);
			callback.searchParams.set('next', next);
			const { error } = await client.auth.signInWithOAuth({
				provider: 'google',
				options: { redirectTo: callback.href, queryParams: { prompt: 'select_account' } }
			});
			if (error) throw error;
		} catch {
			this.error = 'Google sign-in could not start. Please try again.';
			this.busy = false;
		}
	}

	async signOut() {
		if (this.busy) return;
		this.busy = true;
		try {
			const client = await getSupabase();
			const { error } = await client.auth.signOut({ scope: 'local' });
			if (error) throw error;
			this.user = null;
			this.error = '';
		} catch {
			this.error = 'Sign-out failed. Please try again.';
		} finally {
			this.busy = false;
		}
	}
}

export const account = new Account();
