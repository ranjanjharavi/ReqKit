import assert from 'node:assert/strict';
import test from 'node:test';

import {
  areRulesConflicting,
  buildDynamicRule,
  filterRulesByHost,
  filterRulesByProfile,
  findActiveRuleConflict,
  getActiveRuleConflicts,
  getNextRuleId,
  groupRulesByDomain,
  getRuleOriginPattern,
  normalizeDomain,
  normalizeRules,
  validateRuleDraft
} from '../extension/shared/rules.js';

const sampleRules = [
  {
    id: 1,
    domain: 'api.example.com',
    headerName: 'X-Auth',
    headerValue: 'one',
    enabled: true
  },
  {
    id: 2,
    domain: 'other.example.com',
    headerName: 'X-Debug',
    headerValue: 'two',
    enabled: false
  }
];

test('normalizeDomain accepts HTTPS hosts and rejects HTTP', () => {
  assert.equal(normalizeDomain('API.Example.com/path'), 'api.example.com');
  assert.equal(normalizeDomain('https://api.example.com:8443/path'), 'api.example.com');
  assert.equal(normalizeDomain('http://localhost:3000'), '');
});

test('normalizeDomain rejects unsupported protocols and empty values', () => {
  assert.equal(normalizeDomain('chrome://extensions'), '');
  assert.equal(normalizeDomain('file:///tmp/example'), '');
  assert.equal(normalizeDomain(''), '');
});

test('normalizeRules repairs identifiers and normalizes fields', () => {
  const normalized = normalizeRules([
    { ...sampleRules[0], domain: 'HTTPS://API.EXAMPLE.COM/path' },
    { ...sampleRules[1], id: 1 },
    { id: 3, domain: '', headerName: 'X-Missing', headerValue: 'value' },
    { id: 4, domain: 'example.com', headerName: 'Bad Header', headerValue: 'value' }
  ]);

  assert.equal(normalized.length, 2);
  assert.deepEqual(normalized.map((rule) => rule.id), [1, 2]);
  assert.equal(normalized[0].domain, 'api.example.com');
  assert.equal(normalized[1].enabled, false);
});

test('validateRuleDraft normalizes valid input', () => {
  const result = validateRuleDraft({
    domain: 'https://API.example.com/path',
    headerName: ' X-Test ',
    headerValue: ' value '
  }, []);

  assert.deepEqual(result, {
    ok: true,
    rule: {
      domain: 'api.example.com',
      headerName: 'X-Test',
      headerValue: 'value'
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
  assert.equal(
    validateRuleDraft(sampleRules[0], sampleRules).error,
    'That header already exists for this host in this profile.'
  );
  assert.equal(validateRuleDraft({
    ...sampleRules[0],
    headerName: 'x-auth',
    headerValue: 'different',
    enabled: false
  }, sampleRules, { enabled: false }).ok, false);
  assert.equal(validateRuleDraft(sampleRules[0], sampleRules, { excludeId: 1 }).ok, true);
});

test('conflict detection finds different active values for the same header and host', () => {
  const conflictingRule = {
    id: 3,
    domain: 'api.example.com',
    headerName: 'x-auth',
    headerValue: 'different',
    enabled: true
  };
  const matchingRule = { ...sampleRules[0], id: 4 };
  const sameValueRule = { ...conflictingRule, id: 5, headerValue: 'one' };
  const pausedRule = { ...conflictingRule, id: 6, enabled: false };

  assert.equal(areRulesConflicting(sampleRules[0], conflictingRule), true);
  assert.equal(areRulesConflicting(matchingRule, conflictingRule), true);
  assert.equal(areRulesConflicting(sampleRules[0], sameValueRule), false);
  assert.equal(areRulesConflicting(sampleRules[0], pausedRule), false);
  assert.equal(findActiveRuleConflict(conflictingRule, sampleRules)?.id, 1);
  assert.deepEqual(getActiveRuleConflicts([sampleRules[0], conflictingRule]), [{
    leftRule: sampleRules[0],
    rightRule: conflictingRule
  }]);
});

test('validateRuleDraft rejects duplicate headers even for paused drafts', () => {
  const draft = {
    domain: 'api.example.com',
    headerName: 'x-auth',
    headerValue: 'different'
  };

  const activeResult = validateRuleDraft(draft, sampleRules);
  assert.equal(activeResult.ok, false);
  assert.match(activeResult.error, /already exists for this host/);
  assert.equal(validateRuleDraft(draft, sampleRules, { enabled: false }).ok, false);
});

test('rule collection helpers preserve exact-host behavior', () => {
  assert.equal(getNextRuleId(sampleRules), 3);
  assert.deepEqual(filterRulesByHost(sampleRules, 'https://api.example.com/path'), [sampleRules[0]]);
  assert.deepEqual(groupRulesByDomain(sampleRules), [
    { domain: 'api.example.com', rules: [sampleRules[0]] },
    { domain: 'other.example.com', rules: [sampleRules[1]] }
  ]);
});

test('normalizeRules assigns the default profile and repairs unknown ones', () => {
  const normalized = normalizeRules([
    sampleRules[0],
    { ...sampleRules[1], profileId: 'staging' },
    { ...sampleRules[0], id: 7, profileId: 'deleted-profile' }
  ], { profileIds: new Set(['default', 'staging']) });

  assert.deepEqual(normalized.map((rule) => rule.profileId), ['default', 'staging', 'default']);
});

test('the same header with different values is allowed across profiles', () => {
  const stagingRule = { ...sampleRules[0], profileId: 'staging' };
  const prodRule = { ...sampleRules[0], id: 9, headerValue: 'different', profileId: 'prod' };
  const activation = { masterEnabled: true, profileId: 'staging' };

  assert.equal(areRulesConflicting(stagingRule, prodRule, activation), false);
  assert.deepEqual(getActiveRuleConflicts([stagingRule, prodRule], activation), []);
  assert.equal(findActiveRuleConflict(prodRule, [stagingRule], { activation }), null);
});

test('conflicts inside the active profile are still caught', () => {
  const stagingRule = { ...sampleRules[0], profileId: 'staging' };
  const clashingRule = { ...sampleRules[0], id: 9, headerValue: 'different', profileId: 'staging' };
  const activation = { masterEnabled: true, profileId: 'staging' };

  assert.equal(areRulesConflicting(stagingRule, clashingRule, activation), true);
  assert.equal(findActiveRuleConflict(clashingRule, [stagingRule], { activation })?.id, 1);
});

test('a paused master switch means nothing conflicts', () => {
  const clashingRule = { ...sampleRules[0], id: 9, headerValue: 'different' };
  const activation = { masterEnabled: false, profileId: 'default' };

  assert.deepEqual(getActiveRuleConflicts([sampleRules[0], clashingRule], activation), []);
});

test('an identical rule in another profile is not a duplicate', () => {
  const stagingRules = [{ ...sampleRules[0], profileId: 'staging' }];

  assert.equal(validateRuleDraft(sampleRules[0], stagingRules, {
    activation: { masterEnabled: true, profileId: 'prod' },
    profileId: 'prod'
  }).ok, true);

  assert.equal(validateRuleDraft(sampleRules[0], stagingRules, {
    activation: { masterEnabled: true, profileId: 'staging' },
    profileId: 'staging'
  }).error, 'That header already exists for this host in this profile.');
});

test('profile helpers filter rules', () => {
  const stagingRule = { ...sampleRules[0], profileId: 'staging' };
  const rules = [stagingRule, sampleRules[1]];

  assert.deepEqual(filterRulesByProfile(rules, 'staging'), [stagingRule]);
  assert.deepEqual(filterRulesByProfile([sampleRules[1]], 'default'), [sampleRules[1]]);
});

test('buildDynamicRule produces an exact-host DNR rule', () => {
  const dynamicRule = buildDynamicRule(sampleRules[0]);

  assert.equal(dynamicRule.id, 1);
  assert.equal(dynamicRule.action.requestHeaders[0].header, 'X-Auth');
  assert.match('https://api.example.com/path', new RegExp(dynamicRule.condition.regexFilter));
  assert.doesNotMatch('http://api.example.com/path', new RegExp(dynamicRule.condition.regexFilter));
  assert.doesNotMatch('https://sub.api.example.com/path', new RegExp(dynamicRule.condition.regexFilter));
  assert.equal(getRuleOriginPattern(sampleRules[0]), 'https://api.example.com/*');
});
