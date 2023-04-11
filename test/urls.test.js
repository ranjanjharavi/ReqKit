import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAuthRedirectUrl } from '../shared/transformer.js';
import { parseUserUrl } from '../shared/urls.js';

test('parseUserUrl accepts HTTP URLs and hostname/path input', () => {
  assert.equal(parseUserUrl('https://example.com/path').url.hostname, 'example.com');
  assert.equal(parseUserUrl('example.com/path').url.href, 'https://example.com/path');
});

test('parseUserUrl rejects unsupported browser protocols', () => {
  assert.throws(() => parseUserUrl('chrome://extensions'), /Unsupported/);
  assert.throws(() => parseUserUrl('file:///tmp/example'), /Unsupported/);
});

test('buildAuthRedirectUrl preserves the redirect path and display protocol choice', () => {
  assert.deepEqual(buildAuthRedirectUrl('https://example.com/path?q=1#hash', 'abc 123'), {
    browserUrl: 'https://example.com/?auth_token=abc%20123&redirect=/path%3Fq%3D1%23hash',
    displayUrl: 'https://example.com/?auth_token=abc%20123&redirect=/path%3Fq%3D1%23hash'
  });

  assert.equal(
    buildAuthRedirectUrl('example.com/path', 'token').displayUrl,
    'example.com/?auth_token=token&redirect=/path'
  );
});
