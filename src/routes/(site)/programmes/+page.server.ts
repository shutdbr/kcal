import { currentBatches, programmeIndex } from '$lib/server/site';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ subjects: programmeIndex(), batches: currentBatches() });
