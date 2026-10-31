// Before a build: replace the committed curriculum with the database's current
// release, so the deployed site shows exactly what admins last published.
// Without a configured project (local work, tests) the committed snapshot
// stays. Reads only public data, with the publishable key.
import { writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.PUBLIC_SUPABASE_URL;
const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
	console.log('curriculum: no Supabase project configured, building with the committed snapshot');
	process.exit(0);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const out = (name) => new URL(`../src/lib/data/${name}`, import.meta.url);

const { data: release, error } = await db.from('curriculum_releases').select('id, snapshot').eq('is_current', true).maybeSingle();
if (error) throw new Error(`Could not read the current curriculum release: ${error.message}`);
if (!release) {
	console.log('curriculum: the database has no release yet, building with the committed snapshot');
	process.exit(0);
}

const descriptions = {};
for (let from = 0; ; from += 1000) {
	const { data, error } = await db.from('courses').select('code, description').not('description', 'is', null)
		.order('code').range(from, from + 999);
	if (error) throw new Error(`Could not read course descriptions: ${error.message}`);
	for (const { code, description } of data) descriptions[code] = description;
	if (data.length < 1000) break;
}

await writeFile(out('curriculum.json'), JSON.stringify(release.snapshot, null, '\t') + '\n');
await writeFile(out('course-descriptions.json'), JSON.stringify(descriptions, null, '\t') + '\n');
console.log(`curriculum: building with release ${release.id}`);
