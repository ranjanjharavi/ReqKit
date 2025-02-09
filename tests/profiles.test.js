import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PROFILE_ID,
  createDefaultProfiles,
  findProfile,
  getProfileIds,
  getProfileName,
  hasProfile,
  normalizeProfiles,
  resolveProfileId,
  validateProfileDraft
} from '../extension/shared/profiles.js';

test('an empty or invalid profile list always yields the default profile', () => {
  assert.deepEqual(normalizeProfiles([]), createDefaultProfiles());
  assert.deepEqual(normalizeProfiles(null), createDefaultProfiles());
  assert.deepEqual(normalizeProfiles('nonsense'), createDefaultProfiles());
});

test('the default profile is restored when a stored list omits it', () => {
  const profiles = normalizeProfiles([{ id: 'staging', name: 'Staging' }]);

  assert.deepEqual(profiles.map((profile) => profile.id), [DEFAULT_PROFILE_ID, 'staging']);
});

test('normalizeProfiles drops duplicates and repairs fields', () => {
  const profiles = normalizeProfiles([
    { id: 'staging', name: '  Staging  ' },
    { id: 'staging', name: 'Duplicate' },
    { id: 'prod', name: '', defaultDurationMs: -1 },
    { id: 'qa', name: 'QA', defaultDurationMs: 3600000 }
  ]);

  assert.deepEqual(profiles.map((profile) => profile.id), [DEFAULT_PROFILE_ID, 'staging', 'prod', 'qa']);
  assert.equal(findProfile(profiles, 'staging').name, 'Staging');
  assert.equal(findProfile(profiles, 'prod').name, 'prod');
  assert.equal(findProfile(profiles, 'prod').defaultDurationMs, null);
  assert.equal(findProfile(profiles, 'qa').defaultDurationMs, 3600000);
});

test('an empty profile reference resolves to the default profile', () => {
  assert.equal(resolveProfileId(''), DEFAULT_PROFILE_ID);
  assert.equal(resolveProfileId(undefined), DEFAULT_PROFILE_ID);
  assert.equal(resolveProfileId('  staging  '), 'staging');
});

test('profile lookup helpers agree with each other', () => {
  const profiles = normalizeProfiles([{ id: 'staging', name: 'Staging' }]);

  assert.equal(hasProfile(profiles, 'staging'), true);
  assert.equal(hasProfile(profiles, 'missing'), false);
  assert.equal(getProfileName(profiles, 'staging'), 'Staging');
  assert.equal(getProfileName(profiles, 'missing'), 'Default');
  assert.deepEqual([...getProfileIds(profiles)].sort(), ['default', 'staging']);
});

test('profile names must be present and unique', () => {
  const profiles = normalizeProfiles([{ id: 'staging', name: 'Staging' }]);

  assert.equal(validateProfileDraft({ name: 'Prod' }, profiles).ok, true);
  assert.equal(validateProfileDraft({ name: '  ' }, profiles).ok, false);
  assert.match(validateProfileDraft({ name: 'staging' }, profiles).error, /already exists/);
  assert.equal(validateProfileDraft({ name: 'Staging' }, profiles, { excludeId: 'staging' }).ok, true);
  assert.match(validateProfileDraft({ name: 'x'.repeat(41) }, profiles).error, /40 characters/);
});
