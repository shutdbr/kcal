import { test } from 'node:test';
import assert from 'node:assert/strict';
import { restoreBoard, saveBoard } from '../src/lib/features/plans/autosave.ts';
import { planDocument, planName } from '../src/lib/features/plans/document.ts';

function storage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('a corrupt primary restores from backup and does not destroy that backup on the next write', () => {
  const backup = JSON.stringify({ version: 1, placements: {} });
  for (const corrupt of ['{broken', 'null', '[]', '42']) {
    const store = storage({ 'kcal-plan': corrupt, 'kcal-plan-backup': backup });
    let restored;
    restoreBoard(store, (value) => { restored = value; });
    assert.deepEqual(restored, JSON.parse(backup));
    assert.equal(saveBoard(store, JSON.stringify({ ...restored, touched: true })), true);
    assert.equal(store.getItem('kcal-plan-backup'), backup);
  }
});

test('failed writes report failure without removing existing saves', () => {
  const store = storage({ 'kcal-plan': '{"version":1}' });
  store.setItem = () => { throw new Error('Quota exceeded'); };
  assert.equal(saveBoard(store, '{"version":1,"touched":true}'), false);
  assert.equal(store.getItem('kcal-plan'), '{"version":1}');
});

test('document boundary rejects unsupported versions and malformed data; copies do not retain live references', () => {
  const original = { version: 1, placements: { '2-1': ['MATH201'] }, picks: {} };
  const saved = planDocument(original);
  original.placements['2-1'].push('MATH202');
  assert.deepEqual(saved.placements['2-1'], ['MATH201']);
  for (const value of [null, [], {}, { ...original, version: 2 }, { ...original, placements: { '2-1': [null] } }, { ...original, extra: 'x'.repeat(256001) }]) {
    assert.throws(() => planDocument(value));
  }
  assert.equal(planName('  My degree  '), 'My degree');
  assert.throws(() => planName('   '));
  assert.throws(() => planName('x'.repeat(101)));
});
