import assert from 'node:assert/strict';
import test from 'node:test';

import { commitRuleSet } from '../shared/rule-commit.js';

const previousRules = [{
  id: 1,
  domain: 'old.example.com',
  headerName: 'X-Old',
  headerValue: 'old',
  requestScope: 'all',
  enabled: true
}];

const nextRules = [{
  id: 2,
  domain: 'new.example.com',
  headerName: 'X-New',
  headerValue: 'new',
  requestScope: 'api',
  enabled: true
}];

const normalizedNextRules = [{
  ...nextRules[0],
  requestScope: 'all'
}];

test('commitRuleSet applies and stores normalized rules', async () => {
  const applied = [];
  const stored = [];

  const result = await commitRuleSet(nextRules, {
    getCurrentRules: async () => previousRules,
    applyRules: async (rules) => applied.push(rules),
    storeRules: async (rules) => stored.push(rules)
  });

  assert.deepEqual(result, normalizedNextRules);
  assert.deepEqual(applied, [normalizedNextRules]);
  assert.deepEqual(stored, [normalizedNextRules]);
});

test('commitRuleSet restores dynamic rules when storage fails', async () => {
  const applied = [];
  const storageError = new Error('Storage failed');

  await assert.rejects(commitRuleSet(nextRules, {
    getCurrentRules: async () => previousRules,
    applyRules: async (rules) => applied.push(rules),
    storeRules: async () => {
      throw storageError;
    }
  }), storageError);

  assert.deepEqual(applied, [normalizedNextRules, previousRules]);
});

test('commitRuleSet rejects malformed rule collections before applying them', async () => {
  let applied = false;

  await assert.rejects(commitRuleSet([{ id: 1, domain: '', headerName: '', headerValue: '' }], {
    getCurrentRules: async () => previousRules,
    applyRules: async () => {
      applied = true;
    },
    storeRules: async () => {}
  }), /invalid/);

  await assert.rejects(commitRuleSet([{
    id: 1,
    domain: 'example.com',
    headerName: 'Bad Header',
    headerValue: 'value'
  }], {
    getCurrentRules: async () => previousRules,
    applyRules: async () => {
      applied = true;
    },
    storeRules: async () => {}
  }), /invalid/);

  assert.equal(applied, false);
});

test('commitRuleSet rejects conflicting active rules before applying them', async () => {
  let applied = false;
  const conflictingRules = [
    nextRules[0],
    {
      ...nextRules[0],
      id: 3,
      headerValue: 'different',
      requestScope: 'all'
    }
  ];

  await assert.rejects(commitRuleSet(conflictingRules, {
    getCurrentRules: async () => previousRules,
    applyRules: async () => {
      applied = true;
    },
    storeRules: async () => {}
  }), /Active X-New rules.*conflict/);

  assert.equal(applied, false);
});
