import assert from 'node:assert/strict';
import test from 'node:test';

import {
  areRulesConflicting,
  buildDynamicRule,
  filterRulesByHost,
  findActiveRuleConflict,
  getActiveRuleConflicts,
  getNextRuleId,
  groupRulesByDomain,
  normalizeDomain,
  normalizeRules,
  requestScopesOverlap,
  validateRuleDraft
} from '../shared/rules.js';

const sampleRules = [
  {
    id: 1,
    domain: 'api.example.com',
    headerName: 'X-Auth',
    headerValue: 'one',
    requestScope: 'all',
    enabled: true
  },
  {
    id: 2,
    domain: 'other.example.com',
    headerName: 'X-Debug',
    headerValue: 'two',
    requestScope: 'api',
    enabled: false
  }
];

test('normalizeDomain accepts hosts and HTTP URLs', () => {
  assert.equal(normalizeDomain('API.Example.com/path'), 'api.example.com');
  assert.equal(normalizeDomain('https://api.example.com:8443/path'), 'api.example.com');
  assert.equal(normalizeDomain('http://localhost:3000'), 'localhost');
});

test('normalizeDomain rejects unsupported protocols and empty values', () => {
  assert.equal(normalizeDomain('chrome://extensions'), '');
  assert.equal(normalizeDomain('file:///tmp/example'), '');
  assert.equal(normalizeDomain(''), '');
});

test('normalizeRules repairs identifiers and normalizes fields', () => {
  const normalized = normalizeRules([
    { ...sampleRules[0], domain: 'HTTPS://API.EXAMPLE.COM/path' },
    { ...sampleRules[1], id: 1, requestScope: 'unknown' },
    { id: 3, domain: '', headerName: 'X-Missing', headerValue: 'value' },
    { id: 4, domain: 'example.com', headerName: 'Bad Header', headerValue: 'value' }
  ]);

  assert.equal(normalized.length, 2);
  assert.deepEqual(normalized.map((rule) => rule.id), [1, 2]);
  assert.equal(normalized[0].domain, 'api.example.com');
  assert.equal(normalized[1].requestScope, 'all');
  assert.equal(normalized[1].enabled, false);
});

test('validateRuleDraft normalizes valid input', () => {
  const result = validateRuleDraft({
    domain: 'https://API.example.com/path',
    headerName: ' X-Test ',
    headerValue: ' value ',
    requestScope: 'pages'
  }, []);

  assert.deepEqual(result, {
    ok: true,
    rule: {
      domain: 'api.example.com',
      headerName: 'X-Test',
      headerValue: 'value',
      requestScope: 'pages'
    }
  });
});

test('validateRuleDraft rejects invalid and duplicate rules', () => {
  assert.equal(validateRuleDraft({ domain: '', headerName: '', headerValue: '' }, []).ok, false);
  assert.equal(validateRuleDraft({
    domain: 'example.com',
    headerName: 'Bad Header',
    headerValue: 'value'
  }, []).error, 'Enter a valid HTTP header name.');
  assert.equal(validateRuleDraft({
    domain: 'example.com',
    headerName: 'X-Test',
    headerValue: 'bad\nvalue'
  }, []).error, 'Header values cannot contain line breaks.');
  assert.equal(validateRuleDraft(sampleRules[0], sampleRules).error, 'That rule already exists.');
  assert.equal(validateRuleDraft(sampleRules[0], sampleRules, { excludeId: 1 }).ok, true);
});

test('conflict detection finds different values on overlapping active scopes', () => {
  const conflictingRule = {
    id: 3,
    domain: 'api.example.com',
    headerName: 'x-auth',
    headerValue: 'different',
    requestScope: 'api',
    enabled: true
  };
  const pagesRule = { ...sampleRules[0], id: 4, requestScope: 'pages' };
  const sameValueRule = { ...conflictingRule, id: 5, headerValue: 'one' };
  const pausedRule = { ...conflictingRule, id: 6, enabled: false };

  assert.equal(requestScopesOverlap('all', 'pages'), true);
  assert.equal(requestScopesOverlap('pages', 'api'), false);
  assert.equal(areRulesConflicting(sampleRules[0], conflictingRule), true);
  assert.equal(areRulesConflicting(pagesRule, conflictingRule), false);
  assert.equal(areRulesConflicting(sampleRules[0], sameValueRule), false);
  assert.equal(areRulesConflicting(sampleRules[0], pausedRule), false);
  assert.equal(findActiveRuleConflict(conflictingRule, sampleRules)?.id, 1);
  assert.deepEqual(getActiveRuleConflicts([sampleRules[0], conflictingRule]), [{
    leftRule: sampleRules[0],
    rightRule: conflictingRule
  }]);
});

test('validateRuleDraft rejects active conflicts but permits paused drafts', () => {
  const draft = {
    domain: 'api.example.com',
    headerName: 'x-auth',
    headerValue: 'different',
    requestScope: 'pages'
  };

  const activeResult = validateRuleDraft(draft, sampleRules);
  assert.equal(activeResult.conflictId, 1);
  assert.match(activeResult.error, /Conflicts with the active X-Auth rule/);
  assert.equal(validateRuleDraft(draft, sampleRules, { enabled: false }).ok, true);
});

test('rule collection helpers preserve exact-host behavior', () => {
  assert.equal(getNextRuleId(sampleRules), 3);
  assert.deepEqual(filterRulesByHost(sampleRules, 'https://api.example.com/path'), [sampleRules[0]]);
  assert.deepEqual(groupRulesByDomain(sampleRules), [
    { domain: 'api.example.com', rules: [sampleRules[0]] },
    { domain: 'other.example.com', rules: [sampleRules[1]] }
  ]);
});

test('buildDynamicRule produces an exact-host DNR rule', () => {
  const dynamicRule = buildDynamicRule(sampleRules[0]);

  assert.equal(dynamicRule.id, 1);
  assert.equal(dynamicRule.action.requestHeaders[0].header, 'X-Auth');
  assert.match('https://api.example.com/path', new RegExp(dynamicRule.condition.regexFilter));
  assert.doesNotMatch('https://sub.api.example.com/path', new RegExp(dynamicRule.condition.regexFilter));
});
