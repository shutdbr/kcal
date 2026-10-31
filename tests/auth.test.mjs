import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeRedirectPath, toAuthUser } from '../src/lib/features/auth/user.ts';

test('sign-in only ever returns to a path on this site', () => {
  for (const ok of ['/', '/courses/COMP201', '/?course=MATH201#top']) assert.equal(safeRedirectPath(ok), ok);
  for (const bad of [null, '', 'https://evil.example', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)', 'courses']) {
    assert.equal(safeRedirectPath(bad), '/', String(bad));
  }
});

test('the account comes from verified claims; only app_metadata can make an admin', () => {
  const user = toAuthUser({ sub: 'u1', email: 'a@krea.edu.in', user_metadata: { full_name: ' Ada ', avatar_url: 'https://x/y.png', role: 'admin' }, app_metadata: {} });
  assert.deepEqual(user, { id: 'u1', email: 'a@krea.edu.in', name: 'Ada', avatarUrl: 'https://x/y.png', isAdmin: false });
  assert.equal(toAuthUser({ id: 'u2', app_metadata: { role: 'admin' } })?.isAdmin, true);
  assert.equal(toAuthUser({ email: 'no-id@example.com' }), null);
});
