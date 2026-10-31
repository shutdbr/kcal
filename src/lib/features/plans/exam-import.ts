import { isGradeMark, type GradeMark } from "../../grades.ts";

export const EXAM_ORIGIN = "https://oe.krea.edu.in";
export type ExamCourse = {
  code: string;
  title: string;
  term: number;
  grade: GradeMark;
  credits: number;
};
export type ExamImport = {
  version: 3;
  source: typeof EXAM_ORIGIN;
  courses: ExamCourse[];
};

/** Only academic fields cross the boundary: profile details and page scripts are discarded. */
export function parseExamImport(value: unknown): ExamImport {
  if (!value || typeof value !== "object")
    throw new Error("This is not a Krea Exam mark list.");
  const input = value as Record<string, unknown>;
  if (
    input.version !== 3 ||
    input.source !== EXAM_ORIGIN ||
    !Array.isArray(input.courses) ||
    !input.courses.length ||
    input.courses.length > 200
  )
    throw new Error("This is not a supported Krea Exam export.");
  const courses: ExamCourse[] = [];
  const seen = new Map<string, string>();
  for (const raw of input.courses) {
    if (!raw || typeof raw !== "object")
      throw new Error("The mark list contains an invalid course.");
    const row = raw as Record<string, unknown>;
    if (
      typeof row.code !== "string" ||
      !/^[A-Z]{2,8}\d{3}[A-Z]?$/.test(row.code) ||
      typeof row.title !== "string" ||
      !row.title.trim() ||
      row.title.length > 500 ||
      typeof row.term !== "number" ||
      !Number.isInteger(row.term) ||
      row.term < 1 ||
      row.term > 99 ||
      !isGradeMark(row.grade) ||
      typeof row.credits !== "number" ||
      !Number.isFinite(row.credits) ||
      row.credits <= 0 ||
      row.credits > 30
    ) {
      throw new Error(
        "The mark list contains an invalid course, term, grade or credit value.",
      );
    }
    const item: ExamCourse = {
      code: row.code,
      title: row.title.trim(),
      term: row.term,
      grade: row.grade,
      credits: row.credits,
    };
    const key = `${item.term}:${item.code}`;
    const serialized = JSON.stringify(item);
    if (seen.has(key) && seen.get(key) !== serialized)
      throw new Error(
        `Conflicting results for ${item.code} in Term ${item.term}.`,
      );
    if (!seen.has(key)) courses.push(item);
    seen.set(key, serialized);
  }
  return {
    version: 3,
    source: EXAM_ORIGIN,
    courses: courses.sort((a, b) => a.term - b.term),
  };
}

export function examSlot(term: number): { year: number; trim: 1 | 2 | 3 } {
  return {
    year: Math.ceil(term / 3),
    trim: (((term - 1) % 3) + 1) as 1 | 2 | 3,
  };
}

const titleKey = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Historical codes have been reused. A code alone is not a safe exam-to-catalogue match. */
export function matchExamCourse(
  row: ExamCourse,
  catalogue: readonly { code: string; title: string; credits: number }[],
): string[] {
  return catalogue
    .filter(
      (course) =>
        course.credits === row.credits &&
        titleKey(course.title) === titleKey(row.title),
    )
    .map((course) => course.code);
}

/** The planner supports one placement per course; retain all attempts in the local mark list. */
export function latestExamChoices(
  courses: readonly ExamCourse[],
  choices: readonly string[],
): Map<string, number> {
  const result = new Map<string, number>();
  courses.forEach((row, index) => {
    const code = choices[index];
    const previous = result.get(code);
    if (code && (previous === undefined || row.term > courses[previous].term))
      result.set(code, index);
  });
  return result;
}
