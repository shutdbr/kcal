import type { Json } from '../../infrastructure/supabase/database.types';

export const PLAN_NAME_LIMIT = 100;
export const PLAN_BYTES_LIMIT = 256_000;

export function planName(value: string): string {
	const name = value.trim();
	if (!name || name.length > PLAN_NAME_LIMIT) throw new Error('Use a plan name between 1 and 100 characters.');
	return name;
}

function object(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Check the document boundary; Plan.restore validates courses against the current curriculum. */
export function planDocument(value: unknown): Json {
	if (!object(value) || value.version !== 1 || !object(value.placements) || !object(value.picks)) {
		throw new Error('This plan format is not supported by this version of kcal.');
	}
	if (!Object.values(value.placements).every((codes) =>
		Array.isArray(codes) && codes.every((code) => typeof code === 'string')
	)) throw new Error('This plan contains invalid course placements.');
	const json = JSON.stringify(value);
	if (new TextEncoder().encode(json).length > PLAN_BYTES_LIMIT) {
		throw new Error('This plan is too large to save.');
	}
	return JSON.parse(json) as Json;
}
