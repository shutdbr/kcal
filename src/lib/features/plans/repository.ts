import { getSupabase } from '$lib/infrastructure/supabase/browser';
import type { PlanRow } from '$lib/infrastructure/supabase/database.types';
import { planDocument, planName } from './document';

export type CloudPlan = Omit<PlanRow, 'snapshot' | 'user_id'>;
const fields = 'id,name,revision,created_at,updated_at';
const changed = 'This plan changed on another device or was deleted. Refresh the list before trying again.';

export async function listPlans(userId: string): Promise<CloudPlan[]> {
	const client = await getSupabase();
	const plans: CloudPlan[] = [];
	for (let offset = 0; ; offset += 100) {
		const { data, error } = await client.from('plans').select(fields).eq('user_id', userId)
			.order('created_at', { ascending: false }).order('id').range(offset, offset + 99);
		if (error) throw error;
		plans.push(...data);
		if (data.length < 100) return plans;
	}
}

export async function readPlan(userId: string, id: string) {
	const client = await getSupabase();
	const { data, error } = await client.from('plans').select('snapshot')
		.eq('user_id', userId).eq('id', id).single();
	if (error) throw error;
	return planDocument(data.snapshot);
}

export async function createPlan(userId: string, name: string, snapshot: unknown) {
	const input = { user_id: userId, name: planName(name), snapshot: planDocument(snapshot) };
	const client = await getSupabase();
	const { data, error } = await client.from('plans').insert(input).select(fields).single();
	if (error) throw error;
	return data;
}

export async function updatePlan(userId: string, plan: CloudPlan, snapshot: unknown) {
	const document = planDocument(snapshot);
	const client = await getSupabase();
	const { data, error } = await client.from('plans').update({ snapshot: document })
		.eq('user_id', userId).eq('id', plan.id).eq('revision', plan.revision).select(fields).maybeSingle();
	if (error) throw error;
	if (!data) throw new Error(changed);
	return data;
}

export async function deletePlan(userId: string, plan: CloudPlan) {
	const client = await getSupabase();
	const { data, error } = await client.from('plans').delete()
		.eq('user_id', userId).eq('id', plan.id).eq('revision', plan.revision).select('id').maybeSingle();
	if (error) throw error;
	if (!data) throw new Error(changed);
}
