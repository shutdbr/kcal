import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const snapshot = { version: 1, placements: { '2-1': ['MATH201'] }, picks: { major1: 'mathematics' } };
let plan;

before(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.query('insert into auth.users values ($1), ($2)', [owner, other]);
  await db.exec(await readFile(new URL('../supabase/migrations/202610310001_private_plans.sql', import.meta.url), 'utf8'));
  plan = (await db.query('insert into plans (user_id,name,snapshot) values ($1,$2,$3) returning *', [owner, 'My degree', snapshot])).rows[0];
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

test('plans are private: anonymous requests denied; other users cannot read, update or delete', async () => {
  await assert.rejects(as('anon', null, () => db.query('select * from plans')));
  await as('authenticated', other, async () => {
    assert.equal((await db.query('select * from plans')).rows.length, 0);
    assert.equal((await db.query("update plans set name='Stolen' where id=$1 returning id", [plan.id])).rows.length, 0);
    assert.equal((await db.query('delete from plans where id=$1 returning id', [plan.id])).rows.length, 0);
  });
  await assert.rejects(as('authenticated', other, () => db.query('insert into plans (user_id,name,snapshot) values ($1,$2,$3)', [owner, 'Forged', snapshot])));
});

test('owners can create, read, update and delete; database owns identity, revisions and timestamps', async () => {
  await as('authenticated', owner, async () => {
    const { rows: [created] } = await db.query('insert into plans (user_id,name,snapshot) values ($1,$2,$3) returning *', [owner, '  Alternate  ', snapshot]);
    assert.equal(created.name, 'Alternate');
    assert.equal(created.revision, 1);
    assert.ok(created.id && created.created_at && created.updated_at);
    const { rows: [updated] } = await db.query("update plans set name='Revised' where id=$1 and revision=1 returning *", [created.id]);
    assert.equal(updated.revision, 2);
    assert.equal(updated.created_at.toISOString(), created.created_at.toISOString());
    assert.equal((await db.query('delete from plans where id=$1 and revision=2 returning id', [created.id])).rows.length, 1);
  });
  for (const field of ['user_id', 'id', 'revision', 'created_at', 'updated_at']) {
    await assert.rejects(as('authenticated', owner, () => db.query(`update plans set ${field}=${field} where id=$1`, [plan.id])));
  }
});

test('stale updates and deletes do not overwrite newer versions', async () => {
  await as('authenticated', owner, async () => {
    await db.query("update plans set name='Newer copy' where id=$1 and revision=1", [plan.id]);
    assert.equal((await db.query("update plans set name='Stale copy' where id=$1 and revision=1 returning id", [plan.id])).rows.length, 0);
    assert.equal((await db.query('delete from plans where id=$1 and revision=1 returning id', [plan.id])).rows.length, 0);
    assert.equal((await db.query('select name from plans where id=$1', [plan.id])).rows[0].name, 'Newer copy');
  });
});

test('database rejects invalid names, unsupported documents, malformed placements and oversized payloads', async () => {
  for (const [name, document] of [
    ['', snapshot], [' '.repeat(5), snapshot], ['x'.repeat(101), snapshot],
    ['Plan', {}], ['Plan', []], ['Plan', { ...snapshot, version: 2 }],
    ['Plan', { ...snapshot, picks: null }], ['Plan', { ...snapshot, placements: [] }],
    ['Plan', { ...snapshot, placements: { '2-1': 'MATH201' } }],
    ['Plan', { ...snapshot, placements: { '2-1': [42] } }],
    ['Plan', { ...snapshot, extra: 'x'.repeat(256000) }]
  ]) {
    await assert.rejects(as('authenticated', owner, () => db.query('insert into plans (user_id,name,snapshot) values ($1,$2,$3)', [owner, name, document])));
  }
});

test('deleting an account cascades to its private plans', async () => {
  await db.exec('begin');
  try {
    await db.query('delete from auth.users where id=$1', [owner]);
    assert.equal((await db.query('select * from plans')).rows.length, 0);
  } finally { await db.exec('rollback'); }
});
