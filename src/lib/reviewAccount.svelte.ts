import { browser } from '$app/environment';
import type { SupabaseClient, User } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const reviewsConfigured = !!url && !!key;
let clientPromise: Promise<SupabaseClient> | undefined;

export function reviewClient() {
	if (!browser || !reviewsConfigured) throw new Error('Course reviews are not connected yet.');
	return clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(url!, key!, {
		auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true }
	}));
}

class ReviewAccount {
	user = $state<User | null>(null);
	ready = $state(false);
	eligible = $state(false);
	error = $state('');
	#initializing: Promise<void> | undefined;
	#revision = 0;

	init() {
		return this.#initializing ??= this.#start();
	}

	async #start() {
		if (!reviewsConfigured) { this.ready = true; return; }
		try {
			const client = await reviewClient();
			client.auth.onAuthStateChange((_event, session) => {
				this.user = session?.user ?? null;
				this.eligible = false;
				const revision = ++this.#revision;
				// Supabase auth callbacks must not await another client operation.
				setTimeout(() => void this.#eligibility(revision), 0);
			});
			const { data, error } = await client.auth.getSession();
			if (error) throw error;
			this.user = data.session?.user ?? null;
			await this.#eligibility(++this.#revision);
		} catch { this.error = 'Sign-in could not be restored. Refresh the page and try again.'; }
		finally { this.ready = true; }
	}

	async #eligibility(revision: number) {
		if (!this.user) return;
		try {
			const client = await reviewClient();
			const { data, error } = await client.rpc('can_review');
			if (revision !== this.#revision) return;
			if (error) throw error;
			this.eligible = data === true;
			this.error = '';
		} catch {
			if (revision === this.#revision) this.error = 'Could not verify review access. Refresh the page to retry.';
		}
	}

	async signIn(courseCode: string) {
		this.error = '';
		try {
			const client = await reviewClient();
			const redirect = new URL(location.pathname, location.origin);
			redirect.searchParams.set('review', courseCode);
			const { error } = await client.auth.signInWithOAuth({
				provider: 'google', options: { redirectTo: redirect.href, queryParams: { prompt: 'select_account' } }
			});
			if (error) throw error;
		} catch { this.error = 'Google sign-in could not start. Please try again.'; }
	}

	async signOut() {
		try {
			const client = await reviewClient();
			const { error } = await client.auth.signOut({ scope: 'local' });
			if (error) throw error;
			this.user = null;
			this.eligible = false;
			this.error = '';
		} catch { this.error = 'Sign-out failed. Please try again.'; }
	}
}

export const reviewAccount = new ReviewAccount();
