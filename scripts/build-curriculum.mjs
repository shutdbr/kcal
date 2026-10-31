// Compiles the curriculum snapshot from the source data (see
// src/lib/curriculum/compiler.ts) and writes src/lib/data/curriculum.json —
// what `curriculum:push` sends to Postgres, and the app's offline fallback.
// Runs the compiler through Vite so `$lib` imports and globs resolve exactly
// as they do in the app.
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

const OUT = new URL('../src/lib/data/curriculum.json', import.meta.url);
const DESCRIPTIONS = new URL('../src/lib/data/course-descriptions.json', import.meta.url);

const vite = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom',
	logLevel: 'warn',
	optimizeDeps: { noDiscovery: true, include: [] }
});
try {
	const { compileCurriculum, compileDescriptions } = await vite.ssrLoadModule('/src/lib/curriculum/compiler.ts');
	const snapshot = compileCurriculum();
	const release = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex').slice(0, 12);
	await writeFile(OUT, JSON.stringify({ ...snapshot, release }, null, '\t') + '\n');
	await writeFile(DESCRIPTIONS, JSON.stringify(compileDescriptions(), null, '\t') + '\n');
	const programmes = snapshot.requirementSets.reduce((n, set) => n + set.programmes.length, 0);
	console.log(
		`curriculum ${release}: ${snapshot.courses.length} courses, ${snapshot.lecturers.length} lecturers, ` +
			`${snapshot.requirementSets.length} requirement sets (${programmes} programmes)`
	);
} finally {
	await vite.close();
}
