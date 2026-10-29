export const DIFFICULTY_LABELS = ['Very easy', 'Easy', 'Moderate', 'Hard', 'Very hard'] as const;

export type CourseReview = {
	course_code: string;
	user_id: string;
	display_name: string;
	difficulty: number;
	comment: string;
	updated_at: string;
};

export function validateReview(displayName: string, difficulty: number, comment: string) {
	if (!displayName.trim() || displayName.trim().length > 60) return 'Choose a public name between 1 and 60 characters.';
	if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) return 'Choose a difficulty from 1 to 5.';
	if (comment.trim().length > 1000) return 'Keep your comment to 1,000 characters.';
	return null;
}

export function summarizeReviews(reviews: Pick<CourseReview, 'difficulty'>[]) {
	return { count: reviews.length, average: reviews.length ? reviews.reduce((sum, review) => sum + review.difficulty, 0) / reviews.length : null };
}
