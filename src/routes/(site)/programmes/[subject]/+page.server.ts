import { error } from '@sveltejs/kit';
import { programmeIndex, programmePage, subjectFromSlug } from '$lib/server/site';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => programmeIndex().map(({ slug }) => ({ subject: slug }));

export const load: PageServerLoad = ({ params }) => {
	const subject = subjectFromSlug(params.subject);
	if (!subject) error(404, 'There is no programme in that subject.');
	return programmePage(subject);
};
