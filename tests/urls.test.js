import assert from 'node:assert/strict';
import test from 'node:test';

import { createDefaultRecipe } from '../extension/shared/recipes.js';
import { buildTransformedUrl } from '../extension/shared/transformer.js';
import { parseUserUrl } from '../extension/shared/urls.js';

test('parseUserUrl defaults to HTTPS and preserves the URL port', () => {
  assert.equal(parseUserUrl('https://example.com:8443/path').url.hostname, 'example.com');
  assert.equal(parseUserUrl('example.com/path').url.href, 'https://example.com/path');
  assert.equal(parseUserUrl('https://example.com:8443/path').url.origin, 'https://example.com:8443');
});

test('parseUserUrl permits HTTP only for local development', () => {
  assert.equal(parseUserUrl('http://localhost:3000/path').url.origin, 'http://localhost:3000');
  assert.equal(parseUserUrl('http://127.0.0.1:8080').url.origin, 'http://127.0.0.1:8080');
  assert.equal(parseUserUrl('http://[::1]:9000').url.origin, 'http://[::1]:9000');
  assert.throws(() => parseUserUrl('http://example.com/path'), /local development/);
});

test('parseUserUrl rejects unsupported protocols and embedded credentials', () => {
  assert.throws(() => parseUserUrl('chrome://extensions'), /Unsupported/);
  assert.throws(() => parseUserUrl('file:///tmp/example'), /Unsupported/);
  assert.throws(() => parseUserUrl('https://user:pass@example.com'), /Credentials/);
});

test('default recipe merges enabled parameters and preserves path and fragment', () => {
  assert.equal(buildTransformedUrl(
    'https://example.com/page?x=1&disableCustomJs=false#section',
    createDefaultRecipe()
  ), 'https://example.com/page?x=1&disableCustomJs=true&disableCustomCss=true#section');
});

test('path capture moves the original path, query, and fragment into the configured key', () => {
  const recipe = {
    id: 'qa',
    name: 'QA mode',
    builtIn: false,
    capturePath: { enabled: true, key: 'redirect' },
    parameters: [
      { id: 'mode', key: 'mode', value: 'qa', enabled: true },
      { id: 'off', key: 'ignored', value: 'no', enabled: false }
    ]
  };

  assert.equal(
    buildTransformedUrl('https://example.com/app?q=1#details', recipe),
    'https://example.com/?redirect=/app%3Fq%3D1%23details&mode=qa'
  );
});

test('transform rejects recipes with no active operation', () => {
  const recipe = createDefaultRecipe();
  recipe.parameters.forEach((parameter) => {
    parameter.enabled = false;
  });
  assert.throws(() => buildTransformedUrl('https://example.com/path', recipe), /Enable path capture/);
});
