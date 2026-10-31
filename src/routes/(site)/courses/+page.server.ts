import { courseIndex } from '$lib/server/site';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ subjects: courseIndex() });
