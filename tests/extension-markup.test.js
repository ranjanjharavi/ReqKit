import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const popupMarkup = readFileSync(new URL('../extension/popup/index.html', import.meta.url), 'utf8');
const optionsMarkup = readFileSync(new URL('../extension/options/index.html', import.meta.url), 'utf8');
const popupStyles = readFileSync(new URL('../extension/popup/popup.css', import.meta.url), 'utf8');
const optionsStyles = readFileSync(new URL('../extension/options/options.css', import.meta.url), 'utf8');
const popupRulesSource = readFileSync(new URL('../extension/popup/headers/controller.js', import.meta.url), 'utf8');
const optionsRulesSource = readFileSync(new URL('../extension/options/rules/controller.js', import.meta.url), 'utf8');
const optionsProfilesSource = readFileSync(new URL('../extension/options/profiles/controller.js', import.meta.url), 'utf8');
const siteAccessControllerSource = readFileSync(new URL('../extension/options/site-access/controller.js', import.meta.url), 'utf8');
const sharedRuleRenderSource = readFileSync(new URL('../extension/shared/rule-render.js', import.meta.url), 'utf8');
const backgroundSource = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
const optionsStateSource = readFileSync(new URL('../extension/options/state.js', import.meta.url), 'utf8');
const sharedUiSource = readFileSync(new URL('../extension/shared/ui.js', import.meta.url), 'utf8');

test('popup keeps profile context in the header and scopes rules with tabs', () => {
  assert.match(popupMarkup, /<main id="headers-panel" class="popup-shell">/);
  assert.match(popupMarkup, /class="product-kicker">ReqKit</);
  assert.match(popupMarkup, /id="activeProfileName"/);
  assert.match(popupMarkup, /id="activeUntilLabel"/);
  assert.match(popupMarkup, /id="changeActiveSetupBtn"/);
  assert.match(popupMarkup, /id="ruleScopeTabs"[^>]*role="tablist"/);
  assert.match(popupMarkup, /id="currentSiteTab"[^>]*role="tab"/);
  assert.match(popupMarkup, /id="allRulesTab"[^>]*role="tab"/);
  assert.match(popupMarkup, /id="headerComposerToggle"[\s\S]*?Add rule for this site/);
  assert.doesNotMatch(popupMarkup, /id="profileSelect"/);
  assert.doesNotMatch(popupMarkup, /id="durationSelect"/);
  assert.doesNotMatch(popupMarkup, /header-composer-heading|headerComposerTitle|headerComposerProfile/);
  assert.match(popupMarkup, /id="siteAccessPreflight"[\s\S]*?Chrome will ask you to approve this exact HTTPS host/);
  assert.match(popupMarkup, /id="requestScopeDetails"[\s\S]*?id="pathPrefix"[\s\S]*?id="resourceType"/);
  assert.match(popupMarkup, /id="confirmationDialog"[^>]*aria-labelledby="confirmationTitle"/);
});

test('popup keeps optional scope secondary and aligns its paired controls', () => {
  const form = popupMarkup.match(/<form id="headerComposerForm"[\s\S]*?<\/form>/)?.[0];
  assert.ok(form);

  const landmarks = [
    'for="domain"',
    'for="headerName"',
    'for="headerValue"',
    'id="requestScopeDetails"',
    'id="siteAccessPreflight"',
    'id="addHeaderBtn"'
  ];
  const positions = landmarks.map((landmark) => form.indexOf(landmark));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right));

  assert.match(form, /id="resourceType"[\s\S]*?class="helper-text request-scope-hint"/);
  assert.match(popupStyles, /\.request-scope-fields\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(popupStyles, /\.request-scope-fields \.field > input,[\s\S]*?height:\s*var\(--control-height\)/);
});

test('rule manager separates active setup, rules, and profile administration', () => {
  assert.match(optionsMarkup, /id="active-setup"/);
  assert.match(optionsMarkup, /id="profileTabs"[^>]*role="tablist"/);
  assert.doesNotMatch(optionsMarkup, /activeProfileSelect|profileFilterSelect/);
  assert.match(optionsMarkup, /id="durationPills"[^>]*role="radiogroup"/);
  assert.equal((optionsMarkup.match(/class="duration-pill"/g) || []).length, 4);
  assert.doesNotMatch(optionsMarkup, /id="durationSelect"/);
  assert.match(optionsMarkup, /id="headerComposerToggle"[^>]*>\s*<svg[\s\S]*?New rule/);
  assert.match(optionsMarkup, /class="header-fields-row"[\s\S]*?for="headerName"[\s\S]*?for="headerValue"/);
  assert.match(optionsMarkup, /class="helper-text disclosure-text composer-disclosure"/);
  assert.match(optionsMarkup, /id="siteAccessPreflight"[\s\S]*?ReqKit will not request access to other sites/);
  assert.match(optionsMarkup, /id="requestScopeDetails"[\s\S]*?id="pathPrefix"[\s\S]*?id="resourceType"/);
  assert.match(sharedRuleRenderSource, /editPathPrefix/);
  assert.match(sharedRuleRenderSource, /editResourceType/);
  assert.match(optionsMarkup, /<dialog id="profileManagerDialog"/);
  assert.match(optionsMarkup, /id="manageProfilesBtn"/);
  assert.match(optionsMarkup, /<form id="profileEditorForm"[^>]*novalidate[^>]*hidden>/);
  assert.match(optionsMarkup, /id="profileNameInput"[^>]*maxlength="40"[^>]*required/);
  assert.match(optionsMarkup, /id="profileEditorError"[^>]*role="alert"/);
  assert.match(optionsMarkup, /id="cancelProfileEditorBtn"/);
  assert.doesNotMatch(optionsProfilesSource, /globalThis\.prompt/);
  assert.match(optionsProfilesSource, /validateProfileDraft/);
  assert.match(optionsProfilesSource, /Copied rules start paused/);
  assert.match(optionsMarkup, /class="product-kicker">ReqKit</);
  assert.match(optionsMarkup, /id="confirmationDialog"[^>]*aria-labelledby="confirmationTitle"/);
});

test('obsolete profile filter and clipboard code are removed', () => {
  assert.doesNotMatch(optionsStateSource, /profileFilter/);
  assert.doesNotMatch(optionsRulesSource, /renderProfileFilter|resolveFilterValue/);
  assert.doesNotMatch(optionsStyles, /profile-filter/);
  assert.doesNotMatch(popupStyles, /profile-select/);
  assert.doesNotMatch(sharedUiSource, /copyToClipboard/);
});

test('site access overview audits grants and revokes without deleting rules', () => {
  assert.match(optionsMarkup, /id="siteAccessBtn"[^>]*aria-controls="siteAccessDialog"/);
  assert.match(optionsMarkup, /<dialog id="siteAccessDialog"[^>]*aria-labelledby="siteAccessTitle"/);
  assert.match(optionsMarkup, /id="siteAccessList"[^>]*aria-busy="false"/);
  assert.match(siteAccessControllerSource, /getRulesForOriginGrant/);
  assert.match(siteAccessControllerSource, /removeOriginPermission\(origin\)/);
  assert.match(siteAccessControllerSource, /confirmDestructiveAction/);
  assert.match(siteAccessControllerSource, /Saved rules were kept/);
  assert.doesNotMatch(siteAccessControllerSource, /headerValue/);
});

test('site permission changes immediately rebuild the applied rule set', () => {
  assert.match(backgroundSource, /chrome\.permissions\.onAdded\.addListener/);
  assert.match(backgroundSource, /chrome\.permissions\.onRemoved\.addListener/);
  assert.match(backgroundSource, /refreshAfterPermissionChange/);
});

test('background state changes and reads share a serial queue', () => {
  assert.match(backgroundSource, /const enqueueBackgroundTask = createSerialQueue\(\)/);
  assert.match(backgroundSource, /enqueueBackgroundTask\(\(\) => handleRuleMessage\(message\)\)/);
  assert.match(backgroundSource, /enqueueBackgroundTask\(\(\) => handleActivationMessage\(message\)\)/);
  assert.match(backgroundSource, /enqueueBackgroundTask\(\(\) => initialize\(\{ newBrowserSession: true \}\)\)/);
  assert.match(backgroundSource, /enqueueBackgroundTask\(\(\) => applyExpiry\(\)\)/);
  assert.match(backgroundSource, /enqueueBackgroundTask\(\(\) => toggleMasterSwitch\(\)\)/);
  assert.match(backgroundSource, /enqueueBackgroundTask\(\(\) => refreshAfterPermissionChange\(\)\)/);
  assert.match(backgroundSource, /enqueueBackgroundTask\(\(\) => refreshTabBadge\(tabId/);
});

test('empty popup state relies on the footer add action', () => {
  assert.match(popupRulesSource, /container\.classList\.toggle\('is-empty', !visibleRules\.length\)/);
  assert.doesNotMatch(popupRulesSource, /empty-state-action[^\n]*data-rule-action="open-composer"/);
});

test('rule editor keeps header inputs together and the disclosure on its own row', () => {
  assert.match(sharedRuleRenderSource, /rule-edit-field-name[\s\S]*?rule-edit-field-value/);
  assert.match(sharedRuleRenderSource, /rule-edit-disclosure/);
});

test('destructive actions use the ReqKit confirmation dialog', () => {
  [popupRulesSource, optionsRulesSource, optionsProfilesSource].forEach((source) => {
    assert.match(source, /confirmDestructiveAction/);
    assert.doesNotMatch(source, /globalThis\.confirm/);
  });
});

test('text inputs share the ten pixel padding token', () => {
  assert.match(popupStyles, /--input-padding:\s*10px/);
  assert.match(popupStyles, /input\s*\{[\s\S]*?padding:\s*var\(--input-padding\)/);
  assert.doesNotMatch(optionsStyles, /rules-composer input/);
});

test('rule-manager privacy links stay in the same extension tab', () => {
  const privacyLinks = optionsMarkup.match(/<a\b[^>]*href="\.\.\/privacy\/index\.html"[^>]*>/g) || [];

  assert.equal(privacyLinks.length, 2);
  privacyLinks.forEach((link) => {
    assert.doesNotMatch(link, /\btarget=/);
  });
});
