import { lecturerIndex } from '$lib/server/site';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ lecturers: lecturerIndex() });
