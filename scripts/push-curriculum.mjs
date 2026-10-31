// Replaces the database curriculum with the compiled one
// (src/lib/data/curriculum.json, from `curriculum:build`) and publishes it as
// a release — one transaction (public.import_curriculum). Needs the project's
// secret key: run it from a trusted machine, never ship the key.
//
//   SUPABASE_URL=… SUPABASE_SECRET_KEY=… npm run curriculum:push
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
	console.error('Set SUPABASE_URL (or PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY.');
	process.exit(1);
}
const read = async (name) => JSON.parse(await readFile(new URL(`../src/lib/data/${name}`, import.meta.url), 'utf8'));
const { release: _compiled, ...snapshot } = await read('curriculum.json');
const descriptions = await read('course-descriptions.json');

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: release, error } = await db.rpc('import_curriculum', { snapshot, descriptions });
if (error) {
	console.error(`Import failed: ${error.message}`);
	process.exit(1);
}
console.log(`Published curriculum release ${release}.`);
