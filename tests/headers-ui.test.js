import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSensitiveHeaderName,
  sortDomainGroups,
  sortRulesForDisplay
} from '../extension/shared/rule-render.js';

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

test('domain groups lead with conflicts, then the current site, then alphabetically', () => {
  const groups = [
    { domain: 'zeta.example.com', rules: [{ id: 1, enabled: true }] },
    { domain: 'alpha.example.com', rules: [{ id: 2, enabled: true }] },
    { domain: 'current.example.com', rules: [{ id: 3, enabled: true }] },
    { domain: 'clash.example.com', rules: [{ id: 4, enabled: true }] }
  ];

  const sorted = sortDomainGroups(groups, new Set([4]), 'current.example.com');

  assert.deepEqual(sorted.map((group) => group.domain), [
    'clash.example.com',
    'current.example.com',
    'alpha.example.com',
    'zeta.example.com'
  ]);
});
