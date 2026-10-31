import { error } from '@sveltejs/kit';
import { hasCode } from '$lib/data';
import { courseCodes, coursePage } from '$lib/server/site';
import type { EntryGenerator, PageServerLoad } from './$types';

/** a page for every code a course goes by, HIST235 shows ARTS229 */
export const entries: EntryGenerator = () => courseCodes().map((code) => ({ code }));

export const load: PageServerLoad = ({ params }) => {
	if (!hasCode(params.code)) error(404, 'There is no course with that code.');
	return coursePage(params.code);
};
