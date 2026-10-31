import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const admin = '00000000-0000-4000-8000-0000000000a1';
const student = '00000000-0000-4000-8000-0000000000b2';
const read = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const { release: _compiledRelease, ...compiled } = await read('../src/lib/data/curriculum.json');
const descriptions = await read('../src/lib/data/course-descriptions.json');

before(async () => {
  // the slice of Supabase's auth schema the migrations rely on
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
  `);
  await db.query('insert into auth.users values ($1), ($2)', [admin, student]);
  await db.exec(await readFile(new URL('../supabase/migrations/202611010001_curriculum.sql', import.meta.url), 'utf8'));
});
after(() => db.close());

/** run as a database role, with the JWT a request would carry */
async function as(role, claims, run) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [claims?.sub ?? '']);
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims ?? {})]);
    return await run();
  } finally {
    await db.exec('rollback');
  }
}
const asAdmin = { sub: admin, role: 'authenticated', app_metadata: { role: 'admin' } };
// a student who wrote role: admin into their own editable metadata
const asStudent = { sub: student, role: 'authenticated', user_metadata: { role: 'admin' }, app_metadata: {} };

test('a compiled curriculum imports and assembles back exactly, ready to serve', async () => {
  const { rows: [{ release }] } = await db.query('select public.import_curriculum($1, $2) as release', [compiled, descriptions]);
  const { rows: [row] } = await db.query('select id, snapshot, is_current from curriculum_releases where is_current');
  assert.equal(row.id, release);
  const { release: stored, ...assembled } = row.snapshot;
  assert.equal(stored, release);
  assert.deepEqual(assembled, compiled);
  // descriptions live on the course rows, not in the snapshot
  const { rows: [course] } = await db.query("select description from courses where code = 'COMP201'");
  assert.equal(course.description, descriptions.COMP201);
  // publishing unchanged tables is idempotent: same release, still one current
  const { rows: [{ again }] } = await db.query('select public.publish_curriculum() as again');
  assert.equal(again, release);
  assert.equal((await db.query('select count(*)::int as n from curriculum_releases where is_current')).rows[0].n, 1);
});

test('anyone can read the curriculum; only an admin claim in app_metadata can change it', async () => {
  for (const claims of [null, asStudent]) {
    const role = claims ? 'authenticated' : 'anon';
    await as(role, claims, async () => {
      assert.ok((await db.query('select count(*)::int as n from courses')).rows[0].n > 400);
      assert.equal((await db.query('select count(*)::int as n from curriculum_releases where is_current')).rows[0].n, 1);
      // anonymous visitors hold no write grant; signed-in students do, and RLS filters every row
      const write = (sql) => (claims ? db.query(sql).then((r) => assert.equal(r.rows.length, 0, sql)) : assert.rejects(db.query(sql), sql));
      await write("update courses set title = 'Hacked' where code = 'COMP201' returning code");
      await write('delete from programmes where true returning id');
      await assert.rejects(db.query("insert into subjects (id, label, short, majorable, position) values ('alchemy', 'alchemy', 'alch', true, 99)"));
      await assert.rejects(db.query('select public.publish_curriculum()'));
    });
  }
  await as('authenticated', asStudent, () => assert.rejects(db.query('select public.import_curriculum($1)', [compiled])));
});

test('admin edits publish as a new release; the old one stays readable', async () => {
  const { rows: [{ id: before }] } = await db.query('select id from curriculum_releases where is_current');
  await as('authenticated', asAdmin, async () => {
    const { rows } = await db.query("update courses set title = 'Discrete Mathematics I' where code = 'COMP201' returning code");
    assert.equal(rows.length, 1);
    const { rows: [{ release }] } = await db.query('select public.publish_curriculum() as release');
    assert.notEqual(release, before);
    const { rows: [current] } = await db.query('select id, published_by, snapshot from curriculum_releases where is_current');
    assert.equal(current.id, release);
    assert.equal(current.published_by, admin);
    assert.equal(current.snapshot.courses.find((c) => c.code === 'COMP201').title, 'Discrete Mathematics I');
    assert.equal((await db.query('select count(*)::int as n from curriculum_releases where id = $1', [before])).rows[0].n, 1);
  });
});

test('the schema rejects malformed curriculum data', async () => {
  await as('authenticated', asAdmin, async () => {
    for (const sql of [
      "update courses set code = 'not-a-code' where code = 'COMP201'",
      "update courses set offered = '{4}' where code = 'COMP201'",
      "update courses set credits = -1 where code = 'COMP201'",
      "update courses set terms = '{2025-T1}' where code = 'COMP201'",
      "insert into course_prerequisites (course_code, prerequisite_code, position) values ('COMP201', 'COMP201', 1)",
      "insert into programme_pathway (programme_id, position, year, trimester, course_code) select id, 99, 1, 4, 'COMP201' from programmes limit 1",
      "insert into requirement_sets (id, position, name, batches) values ('second-default', 99, 'x', null)"
    ]) {
      await assert.rejects(db.query(sql), sql);
    }
  });
});
