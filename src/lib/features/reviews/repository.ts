import { getSupabase } from '$lib/infrastructure/supabase/client';
import { validateReview, type CourseReview } from './model';

export async function canReview() {
	const client = await getSupabase();
	const { data, error } = await client.rpc('can_review');
	if (error) throw error;
	return data === true;
}

export async function listReviews(code: string): Promise<CourseReview[]> {
	const client = await getSupabase();
	const reviews: CourseReview[] = [];
	for (let offset = 0; ; offset += 500) {
		const { data, error } = await client.from('course_reviews')
			.select('course_code,user_id,display_name,difficulty,comment,updated_at')
			.eq('course_code', code).order('user_id').range(offset, offset + 499);
		if (error) throw error;
		reviews.push(...data);
		if (data.length < 500) break;
	}
	return reviews.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function saveReview(review: Omit<CourseReview, 'updated_at'>) {
	const problem = validateReview(review.display_name, review.difficulty, review.comment);
	if (problem) throw new Error(problem);
	const client = await getSupabase();
	const { error } = await client.from('course_reviews').upsert({
		...review, display_name: review.display_name.trim(), comment: review.comment.trim()
	}, { onConflict: 'course_code,user_id' });
	if (error) throw error;
}

export async function deleteReview(code: string, userId: string) {
	const client = await getSupabase();
	const { error } = await client.from('course_reviews').delete().eq('course_code', code).eq('user_id', userId);
	if (error) throw error;
}
