import assert from 'node:assert/strict';
import test from 'node:test';

import { isSensitiveHeaderName, sortRulesForDisplay } from '../popup/headers.js';

test('rule display sorting prioritizes conflicts, then active rules', () => {
  const rules = [
    { id: 1, enabled: false },
    { id: 2, enabled: true },
    { id: 3, enabled: true },
    { id: 4, enabled: false }
  ];

  const sortedRules = sortRulesForDisplay(rules, new Set([3, 4]));

  assert.deepEqual(sortedRules.map((rule) => rule.id), [3, 4, 2, 1]);
  assert.deepEqual(rules.map((rule) => rule.id), [1, 2, 3, 4]);
});

test('sensitive header detection covers common credential headers', () => {
  ['Authorization', 'X-Authorization', 'Cookie', 'X-Auth-Token', 'X-API-Key', 'client-secret'].forEach((headerName) => {
    assert.equal(isSensitiveHeaderName(headerName), true, headerName);
  });

  ['Accept-Language', 'X-Debug-Mode', 'Content-Type'].forEach((headerName) => {
    assert.equal(isSensitiveHeaderName(headerName), false, headerName);
  });
});
