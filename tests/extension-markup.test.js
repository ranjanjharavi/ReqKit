import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const popupMarkup = readFileSync(new URL('../extension/popup/index.html', import.meta.url), 'utf8');
const optionsMarkup = readFileSync(new URL('../extension/options/index.html', import.meta.url), 'utf8');

test('popup activation state is display-only', () => {
  assert.match(popupMarkup, /<main id="headers-panel" class="popup-shell">/);
  assert.match(popupMarkup, /id="activeProfileName"/);
  assert.match(popupMarkup, /id="activeUntilLabel"/);
  assert.match(popupMarkup, /id="changeActiveSetupBtn"[^>]*>Change</);
  assert.doesNotMatch(popupMarkup, /id="profileSelect"/);
  assert.doesNotMatch(popupMarkup, /id="durationSelect"/);
  assert.doesNotMatch(popupMarkup, /role="tab"|URL transform|transformer-panel/);
});

test('rule manager separates active setup, rules, and profile administration', () => {
  assert.match(optionsMarkup, /id="active-setup"/);
  assert.match(optionsMarkup, /id="profileTabs"[^>]*role="tablist"/);
  assert.match(optionsMarkup, /id="activeProfileSelect"/);
  assert.match(optionsMarkup, /id="durationSelect"/);
  assert.match(optionsMarkup, /id="headerComposerToggle"[^>]*>\s*<svg[\s\S]*?New rule/);
  assert.match(optionsMarkup, /<dialog id="profileManagerDialog"/);
  assert.match(optionsMarkup, /id="manageProfilesBtn"/);
});

test('rule-manager privacy links stay in the same extension tab', () => {
  const privacyLinks = optionsMarkup.match(/<a\b[^>]*href="\.\.\/privacy\/index\.html"[^>]*>/g) || [];

  assert.equal(privacyLinks.length, 2);
  privacyLinks.forEach((link) => {
    assert.doesNotMatch(link, /\btarget=/);
  });
});
