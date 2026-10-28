import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────
// src/lib/data/*.json is generated for the whole kreabot project (misc/
// generate.py, build_requirements.py), so it carries plenty relay never
// reads: faculty emails, the scraper's raw credit tables, and — inside every
// programme track — a full copy of each course's metadata. Left alone that is
// 1.15 MB of JavaScript to download and parse before the planner answers a
// click. This trims the bundle's copy down to the fields data.ts actually
// looks at; the files on disk stay canonical for the rest of the project.
//
// The one big field the planner DOES use is the catalogue description, and
// only in the details panel — those go to their own chunk (virtual:course-
// descriptions), fetched once the app is up. See src/lib/descriptions.svelte.ts.
// ─────────────────────────────────────────────

const dataFile = (name: string) => fileURLToPath(new URL(`./src/lib/data/${name}`, import.meta.url));
const COURSES = dataFile('courses.json');
const REQUIREMENTS = dataFile('requirements.json');
const DESCRIPTIONS = 'virtual:course-descriptions';

type Json = Record<string, any>;

const pick = (obj: Json, keys: string[]): Json =>
	Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

const read = (file: string): Json => JSON.parse(readFileSync(file, 'utf8'));

/** the RawCourse fields in data.ts, minus the description (its own chunk) */
const COURSE_FIELDS = [
	'code',
	'codes',
	'codes_by_subject',
	'title',
	'subject',
	'subjects',
	'credits',
	'type',
	'terms',
	'eligible_years',
	'prereqs',
	'unlocks'
];

function slimCourses(json: Json): Json {
	const courses: Json = {};
	for (const [code, c] of Object.entries<Json>(json.courses)) {
		// only the names are ever shown ("recently taught by …") — the emails
		// and slugs behind them are for kreabot, not the planner
		courses[code] = { ...pick(c, COURSE_FIELDS), faculty: (c.faculty ?? []).map((f: Json) => ({ name: f.name })) };
	}
	// the build date rides along — the footer tells students how current this is
	return { generated_at: json.generated_at, courses };
}

function descriptionsOf(json: Json): Json {
	const out: Json = {};
	for (const [code, c] of Object.entries<Json>(json.courses)) if (c.description) out[code] = c.description;
	return out;
}

/** the ReqSubject / RawTrack shape in data.ts, and nothing else */
function slimRequirements(json: Json): Json {
	const subjects: Json = {};
	for (const [subject, s] of Object.entries<Json>(json.subjects)) {
		const kept = pick(s, ['required_codes', 'pick_codes', 'elective_codes', 'credits']);
		if (s.tracks) {
			const tracks: Json = {};
			for (const [name, t] of Object.entries<Json>(s.tracks)) {
				tracks[name] = {
					groups: (t.groups ?? []).map((g: Json) => ({
						rule: g.rule ?? null,
						pick: g.pick ?? null,
						// a track course is matched by code and labelled by title;
						// the catalogue metadata repeated alongside is dead weight
						courses: (g.courses ?? []).map((c: Json) => ({
							title: c.title,
							code: c.code ?? null,
							...(c.one_of ? { one_of: c.one_of.map((o: Json) => ({ title: o.title, code: o.code ?? null })) } : {})
						}))
					}))
				};
			}
			kept.tracks = tracks;
		}
		subjects[subject] = kept;
	}
	return { subjects };
}

function slimData(): Plugin {
	return {
		name: 'relay-slim-data',
		enforce: 'pre',
		resolveId(id) {
			return id === DESCRIPTIONS ? '\0' + DESCRIPTIONS : null;
		},
		load(id) {
			if (id === '\0' + DESCRIPTIONS) {
				this.addWatchFile(COURSES);
				// JSON.parse of a string literal beats parsing an object literal
				const json = JSON.stringify(descriptionsOf(read(COURSES)));
				return `export default JSON.parse(${JSON.stringify(json)});`;
			}
			// returning JSON text (not JS) leaves vite's own json plugin to turn
			// it into a module, exactly as it would have with the file on disk
			const file = id.split('?')[0];
			if (file === COURSES) return JSON.stringify(slimCourses(read(COURSES)));
			if (file === REQUIREMENTS) return JSON.stringify(slimRequirements(read(REQUIREMENTS)));
			return null;
		}
	};
}

export default defineConfig({
	plugins: [slimData(), sveltekit()]
});
