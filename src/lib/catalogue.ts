import { COURSES, byCode, facultySearchText } from './data';
import type { Course, CourseType, TrimNum } from './types';

const ranks: Record<CourseType, number> = { core: 0, required: 1, elective: 2, other: 3 };
const searchIndex = new WeakMap<Course, string>();

function searchText(course: Course): string {
	let text = searchIndex.get(course);
	if (text === undefined) {
		text = [...course.codes, course.title, facultySearchText(course)].join(' ').toLowerCase();
		searchIndex.set(course, text);
	}
	return text;
}

type CatalogueOptions = {
	search: string;
	filters: string[];
	selectedSubjects: string[];
	subject?: string;
	trim?: TrimNum;
	reveal?: string;
	courseType: (code: string) => CourseType;
};

/** Filter in one pass; resolve each course's programme rank once, before sorting. */
export function selectCatalogue({
	search,
	filters,
	selectedSubjects,
	subject,
	trim,
	reveal,
	courseType
}: CatalogueOptions): Course[] {
	const checked = subject
		? [subject]
		: filters.filter((id) => id === 'core' || selectedSubjects.includes(id));
	const query = search.trim().toLowerCase();
	const list = COURSES.filter((course) => {
		if (trim && !course.offered.includes(trim)) return false;
		if (!checked.includes('core') && course.subject === 'core') return false;
		if (checked.length && !course.subjects.some((id) => checked.includes(id))) return false;
		return !query || searchText(course).includes(query);
	});
	// Linked prerequisites remain reachable without discarding someone's filters.
	if (reveal && !list.some((course) => course.code === reveal)) list.push(byCode(reveal));
	return list
		.map((course) => ({ course, rank: ranks[courseType(course.code)] }))
		.sort((a, b) => a.rank - b.rank || a.course.code.localeCompare(b.course.code))
		.map(({ course }) => course);
}
