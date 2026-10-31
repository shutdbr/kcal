// A plan shared as a link: the planning state, deflated and base64url-encoded
// into the URL fragment, so it never reaches a server. Grades stay out — they
// are the student's own record, not part of the plan they're showing someone.
import type { Json } from '../../infrastructure/supabase/database.types';
import { planDocument } from './document';

const PREFIX = '#plan=';
/** the fields that make up a plan, as Plan.snapshot names them */
const SHARED = ['version', 'placements', 'picks', 'structure', 'fourYear', 'yearCount', 'batchStartYear', 'audited', 'waived', 'targetLoad'];
/** a link this long is already far past any real plan */
const MAX_ENCODED = 12_000;

async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
	const piped = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
	return new Uint8Array(await new Response(piped).arrayBuffer());
}

const toBase64Url = (bytes: Uint8Array) =>
	btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');

const fromBase64Url = (text: string) =>
	Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** a link to `origin` that opens a copy of this plan */
export async function shareLink(snapshot: Record<string, unknown>, origin: string): Promise<string> {
	const plan = Object.fromEntries(SHARED.filter((key) => key in snapshot).map((key) => [key, snapshot[key]]));
	const packed = await through(new TextEncoder().encode(JSON.stringify(plan)), new CompressionStream('deflate-raw'));
	return `${origin}/${PREFIX}${toBase64Url(packed)}`;
}

/** the encoded plan in a URL fragment, if it carries one */
export const sharedPlanIn = (hash: string): string | null => (hash.startsWith(PREFIX) ? hash.slice(PREFIX.length) : null);

/** Unpack and validate a shared plan. Courses are checked against the
 *  current curriculum when the plan is opened (Plan.restore). */
export async function readSharedPlan(encoded: string): Promise<Json> {
	if (!encoded || encoded.length > MAX_ENCODED || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
		throw new Error('This share link is incomplete or damaged.');
	}
	let text: string;
	try {
		text = new TextDecoder().decode(await through(fromBase64Url(encoded), new DecompressionStream('deflate-raw')));
	} catch {
		throw new Error('This share link is incomplete or damaged.');
	}
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error('This share link is incomplete or damaged.');
	}
	return planDocument(value && typeof value === 'object' ? { picks: {}, ...value } : value);
}
