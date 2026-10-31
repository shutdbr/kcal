/** Who is signed in, as the app needs it. Built from verified JWT claims (server)
 *  or the session's user (browser), never from anything the client can edit:
 *  `app_metadata` is writable only with the service role. */
export type AuthUser = {
	id: string;
	email: string | null;
	name: string | null;
	avatarUrl: string | null;
	isAdmin: boolean;
};

type Identity = {
	sub?: string;
	id?: string;
	email?: string | null;
	app_metadata?: Record<string, unknown> | null;
	user_metadata?: Record<string, unknown> | null;
};

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function toAuthUser(identity: Identity): AuthUser | null {
	const id = identity.sub ?? identity.id;
	if (!id) return null;
	const meta = identity.user_metadata ?? {};
	return {
		id,
		email: text(identity.email),
		name: text(meta.full_name) ?? text(meta.name),
		avatarUrl: text(meta.avatar_url) ?? text(meta.picture),
		isAdmin: identity.app_metadata?.role === 'admin'
	};
}

/** Where to go after signing in: a path on this site, never another origin. */
export function safeRedirectPath(next: string | null | undefined, fallback = '/'): string {
	if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
	try {
		const url = new URL(next, 'http://kcal.invalid');
		return url.origin === 'http://kcal.invalid' ? url.pathname + url.search + url.hash : fallback;
	} catch {
		return fallback;
	}
}
