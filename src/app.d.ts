import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthUser } from '$lib/features/auth/user';
import type { Database } from '$lib/infrastructure/supabase/database.types';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			/** null when this deployment has no Supabase project configured */
			supabase: SupabaseClient<Database> | null;
			/** the signed-in user, verified from the session cookie on first call */
			getUser(): Promise<AuthUser | null>;
		}
	}
}

export {};
