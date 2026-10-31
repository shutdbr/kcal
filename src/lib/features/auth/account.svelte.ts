import type { User } from '@supabase/supabase-js';
import { getSupabase, supabaseConfigured } from '$lib/infrastructure/supabase/client';

class Account {
	user = $state<User | null>(null);
	ready = $state(false);
	error = $state('');
	busy = $state(false);
	#initializing: Promise<void> | undefined;

	init() {
		return (this.#initializing ??= this.#start());
	}

	async #start() {
		if (!supabaseConfigured) { this.ready = true; return; }
		try {
			const client = await getSupabase();
			// This singleton lives for the browser session. Feature components do not subscribe independently.
			client.auth.onAuthStateChange((_event, session) => {
				this.user = session?.user ?? null;
				this.ready = true;
			});
			const { data, error } = await client.auth.getSession();
			if (error) throw error;
			this.user = data.session?.user ?? null;
		} catch { this.error = 'Sign-in could not be restored. Refresh the page and try again.'; }
		finally { this.ready = true; }
	}

	async signIn(courseCode?: string) {
		if (this.busy) return;
		this.busy = true;
		this.error = '';
		try {
			const client = await getSupabase();
			const redirect = new URL('/', location.origin);
			if (courseCode) redirect.searchParams.set('review', courseCode);
			const { error } = await client.auth.signInWithOAuth({
				provider: 'google', options: { redirectTo: redirect.href, queryParams: { prompt: 'select_account' } }
			});
			if (error) throw error;
		} catch { this.error = 'Google sign-in could not start. Please try again.'; }
		finally { this.busy = false; }
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
		} catch { this.error = 'Sign-out failed. Please try again.'; }
		finally { this.busy = false; }
	}
}

export const account = new Account();
