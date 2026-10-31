import { error } from '@sveltejs/kit';
import { lecturerIds, lecturerPage } from '$lib/server/site';
import type { EntryGenerator, PageServerLoad } from './$types';

export const entries: EntryGenerator = () => lecturerIds().map((id) => ({ id }));

export const load: PageServerLoad = ({ params }) => lecturerPage(params.id) ?? error(404, 'There is no lecturer with that name.');
