import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
before(async () => {
  // Model Supabase's server-owned auth records and request identity in a real
  // Postgres engine. The application's actual migration runs unmodified below.
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
    create table auth.identities (user_id uuid, provider text, identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  const users = [
    ['one@krea.ac.in', 'google', true], ['two@krea.ac.in', 'google', true],
    ['one@gmail.com', 'google', true], ['one@krea.ac.in.evil.test', 'google', true],
    ['one@krea.ac.in', 'email', true], ['one@krea.ac.in', 'google', false]
  ];
  for (const [index, [email, provider, verified]] of users.entries()) {
    await db.query('insert into auth.users values ($1, $2, $3, $4)', [id(index + 1), email, verified ? new Date().toISOString() : null, { email: 'spoof@krea.ac.in' }]);
    await db.query('insert into auth.identities values ($1, $2, $3)', [id(index + 1), provider, { email }]);
  }
  await db.exec(await readFile(new URL('../supabase/migrations/202610290001_course_reviews.sql', import.meta.url), 'utf8'));
  await db.query(`insert into public.course_reviews (course_code,user_id,display_name,difficulty,comment)
    values ('COMP201',$1,'First student',3,'My experience')`, [id(1)]);
});
after(() => db.close());

async function as(role, user, run) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user || '']);
    return await run();
  } finally { await db.exec('rollback'); }
}

test('public can read reviews but cannot write or read private/auth records', async () => {
  await as('anon', null, async () => assert.equal((await db.query('select * from course_reviews')).rows.length, 1));
  await assert.rejects(as('anon', null, () => db.query("insert into course_reviews values ('MATH201', $1, 'No', 2, '', now(), now())", [id(1)])));
  await assert.rejects(as('authenticated', id(1), () => db.query('select * from private.review_settings')));
  await assert.rejects(as('authenticated', id(1), () => db.query('select * from auth.users')));
});

test('only verified Krea Google identities can post; profile metadata cannot spoof eligibility', async () => {
  for (let user = 1; user <= 6; user++) {
    await as('authenticated', id(user), async () => {
      assert.equal((await db.query('select public.can_review() as allowed')).rows[0].allowed, user <= 2);
    });
    if (user > 2) await assert.rejects(as('authenticated', id(user), () => db.query(
      "insert into course_reviews (course_code,user_id,display_name,difficulty) values ('MATH201',$1,'Test',3)", [id(user)])));
  }
});

test('a student can create, upsert and delete their own review with server timestamps', async () => {
  await as('authenticated', id(2), async () => {
    await db.query("insert into course_reviews (course_code,user_id,display_name,difficulty,comment) values ('MATH201',$1,' Student ',2,' Nice ')", [id(2)]);
    const { rows } = await db.query(`insert into course_reviews (course_code,user_id,display_name,difficulty,comment)
      values ('MATH201',$1,'Student',4,'Revised') on conflict (course_code,user_id)
      do update set difficulty=excluded.difficulty, comment=excluded.comment returning *`, [id(2)]);
    assert.equal(rows[0].difficulty, 4);
    assert.equal(rows[0].display_name, 'Student');
    assert.ok(rows[0].updated_at);
    await db.query("delete from course_reviews where course_code='MATH201' and user_id=$1", [id(2)]);
    assert.equal((await db.query("select * from course_reviews where course_code='MATH201'")).rows.length, 0);
  });
});

test('students cannot forge ownership, edit/delete another author, or move their review', async () => {
  await assert.rejects(as('authenticated', id(2), () => db.query(
    "insert into course_reviews (course_code,user_id,display_name,difficulty) values ('MATH201',$1,'Impersonator',1)", [id(1)])));
  await as('authenticated', id(2), async () => {
    assert.equal((await db.query("update course_reviews set difficulty=1 where user_id=$1 returning *", [id(1)])).rows.length, 0);
    assert.equal((await db.query('delete from course_reviews where user_id=$1 returning *', [id(1)])).rows.length, 0);
  });
  await assert.rejects(as('authenticated', id(1), () => db.query("update course_reviews set course_code='MATH201' where course_code='COMP201'")));
  await assert.rejects(as('authenticated', id(1), () => db.query('update course_reviews set user_id=$1 where course_code=\'COMP201\'', [id(2)])));
  await assert.rejects(as('authenticated', id(1), () => db.query("update course_reviews set updated_at='2000-01-01'")));
});

test('database enforces rating range, comment/name limits and uniqueness independently of UI', async () => {
  for (const [rating, name, comment] of [[0, 'X', ''], [6, 'X', ''], [3, ' ', ''], [3, 'x'.repeat(61), ''], [3, 'X', 'x'.repeat(1001)]]) {
    await assert.rejects(as('authenticated', id(2), () => db.query(
      "insert into course_reviews (course_code,user_id,display_name,difficulty,comment) values ('MATH201',$1,$2,$3,$4)", [id(2), name, rating, comment])));
  }
  await assert.rejects(as('authenticated', id(1), () => db.query(
    "insert into course_reviews (course_code,user_id,display_name,difficulty) values ('COMP201',$1,'Duplicate',3)", [id(1)])));
});
