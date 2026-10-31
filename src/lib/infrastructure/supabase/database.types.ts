/** Schema contract for the checked-in migrations. Regenerate after schema changes; see docs/backend.md. */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PlanRow = {
	id: string;
	user_id: string;
	name: string;
	snapshot: Json;
	revision: number;
	created_at: string;
	updated_at: string;
};

type ReviewRow = {
	course_code: string;
	user_id: string;
	display_name: string;
	difficulty: number;
	comment: string;
	created_at: string;
	updated_at: string;
};

export type Database = {
	public: {
		Tables: {
			plans: {
				Row: PlanRow;
				Insert: Pick<PlanRow, 'user_id' | 'name' | 'snapshot'>;
				Update: Partial<Pick<PlanRow, 'name' | 'snapshot'>>;
				Relationships: [];
			};
			course_reviews: {
				Row: ReviewRow;
				Insert: Pick<ReviewRow, 'course_code' | 'user_id' | 'display_name' | 'difficulty'> & { comment?: string };
				Update: Partial<Pick<ReviewRow, 'display_name' | 'difficulty' | 'comment'>>;
				Relationships: [];
			};
		};
		Views: { [_ in never]: never };
		Functions: { can_review: { Args: Record<string, never>; Returns: boolean } };
		Enums: { [_ in never]: never };
		CompositeTypes: { [_ in never]: never };
	};
};
