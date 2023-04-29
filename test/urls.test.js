import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAuthRedirectUrl, buildTransformedUrl } from '../shared/transformer.js';
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

test('buildTransformedUrl applies query presets without requiring auth', () => {
  assert.deepEqual(buildTransformedUrl('https://example.com/page?x=1#section', {
    queryPresets: ['disableCustomCode']
  }), {
    browserUrl: 'https://example.com/page?x=1&disableCustomJs=true&disableCustomCss=true#section',
    displayUrl: 'https://example.com/page?x=1&disableCustomJs=true&disableCustomCss=true#section'
  });
});

test('buildTransformedUrl applies query presets before wrapping with auth', () => {
  assert.deepEqual(buildTransformedUrl('https://example.com/page?x=1#section', {
    authRedirect: true,
    authToken: 'abc 123',
    queryPresets: ['disableCustomCode']
  }), {
    browserUrl: 'https://example.com/?auth_token=abc%20123&redirect=/page%3Fx%3D1%26disableCustomJs%3Dtrue%26disableCustomCss%3Dtrue%23section',
    displayUrl: 'https://example.com/?auth_token=abc%20123&redirect=/page%3Fx%3D1%26disableCustomJs%3Dtrue%26disableCustomCss%3Dtrue%23section'
  });
});

test('query presets overwrite existing flags and retain protocol display behavior', () => {
  const result = buildTransformedUrl('example.com/page?disableCustomJs=false', {
    queryPresets: ['disableCustomCode', 'disableCustomCode']
  });

  assert.equal(
    result.browserUrl,
    'https://example.com/page?disableCustomJs=true&disableCustomCss=true'
  );
  assert.equal(
    result.displayUrl,
    'example.com/page?disableCustomJs=true&disableCustomCss=true'
  );
});

test('buildTransformedUrl rejects missing or unknown transform options', () => {
  assert.throws(() => buildTransformedUrl('example.com/page'), /Missing transformation option/);
  assert.throws(() => buildTransformedUrl('example.com/page', {
    queryPresets: ['unknown']
  }), /Unknown query preset/);
  assert.throws(() => buildTransformedUrl('example.com/page', {
    authRedirect: true
  }), /Missing auth token/);
});
