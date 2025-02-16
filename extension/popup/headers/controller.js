import {
  RULE_STORAGE_KEY,
  filterRulesByHost,
  filterRulesByProfile,
  findActiveRuleConflict,
  getActiveRuleConflicts,
  getNextRuleId,
  getRuleConflictMessage,
  getRuleOriginPattern,
  validateRuleDraft
} from '../../shared/rules.js';
import {
  createTab,
  getExtensionUrl,
  getGrantedOrigins,
  onStorageChanged,
  openOptionsPage,
  removeOriginPermission,
  requestOriginPermission,
  storageLocalGet
} from '../../shared/chrome-api.js';
import {
  ACTIVATION_STORAGE_KEY,
  createDefaultActivation,
  getActivationStatus,
  getTargetProfileId,
  normalizeActivation,
  setMasterEnabled
} from '../../shared/activation.js';
import { setActivationState } from '../../shared/activation-api.js';
import {
  PROFILE_STORAGE_KEY,
  createDefaultProfiles,
  getProfileIds,
  getProfileName,
  normalizeProfiles
} from '../../shared/profiles.js';
import { isRuleGranted } from '../../shared/site-access.js';
import { createConflictMap, renderRuleRow, sortRulesForDisplay } from '../../shared/rule-render.js';
import { parseUserUrl } from '../../shared/urls.js';
import { commitRules, getStoredRules } from '../../shared/rule-api.js';
import { state } from '../state.js';
import { escapeHtml, showStatus } from '../../shared/ui.js';
import {
  formatRuleCount,
  getActivationDisplay,
  getManagerLinkLabel,
  getManagerPath
} from './view-model.js';

export function bindHeaderEvents() {
  document.getElementById('headerComposerToggle').addEventListener('click', toggleHeaderComposer);
  document.getElementById('cancelHeaderComposerBtn').addEventListener('click', cancelHeaderComposer);

  const composerForm = document.getElementById('headerComposerForm');
  composerForm.addEventListener('submit', handleComposerSubmit);
  composerForm.addEventListener('keydown', handleComposerKeydown);

  document.getElementById('manageRulesLink').addEventListener('click', (event) => {
    event.preventDefault();
    openManager();
  });
  document.getElementById('changeActiveSetupBtn').addEventListener('click', openActiveSetup);

  document.getElementById('ruleListContainer').addEventListener('click', handleRuleListClick);
  document.getElementById('masterSwitch').addEventListener('click', () => toggleMaster());
  document.getElementById('resumeMasterBtn').addEventListener('click', resumeFromBanner);

  onStorageChanged((changes) => {
    const touchesRules = RULE_STORAGE_KEY in changes
      || ACTIVATION_STORAGE_KEY in changes
      || PROFILE_STORAGE_KEY in changes;

    if (touchesRules && !state.headers.syncPaused) {
      refreshFromStorage().catch((error) => {
        console.error('Could not refresh header rules.', error);
      });
    }
  });
}

export async function initializeHeaders(activeTab) {
  initializeCurrentSite(activeTab);
  await refreshFromStorage();
}

async function refreshFromStorage() {
  await loadActivation();
  state.headers.rules = await getStoredRules();
  renderRules();
}

async function loadActivation() {
  try {
    const stored = await storageLocalGet([PROFILE_STORAGE_KEY, ACTIVATION_STORAGE_KEY]);
    const profiles = normalizeProfiles(stored[PROFILE_STORAGE_KEY]);
    state.headers.profiles = profiles;
    state.headers.activation = normalizeActivation(stored[ACTIVATION_STORAGE_KEY], {
      profileIds: getProfileIds(profiles)
    });
  } catch (error) {
    console.error('Could not read the activation state.', error);
    state.headers.profiles = createDefaultProfiles();
    state.headers.activation = createDefaultActivation();
  }

  state.headers.grantedOrigins = await readGrantedOrigins();
}

async function readGrantedOrigins() {
  try {
    return await getGrantedOrigins();
  } catch (error) {
    console.error('Could not read granted site access.', error);
    return null;
  }
}

function getActivation() {
  return state.headers.activation || createDefaultActivation();
}

/**
 * The popup only ever shows the profile in play. Rules parked in another
 * profile are not applied here, so listing them would misrepresent the site.
 */
function getScopedRules() {
  return filterRulesByProfile(state.headers.rules, getTargetProfileId(getActivation()));
}

async function toggleMaster(forceOn = false) {
  const activation = getActivation();
  const nextEnabled = forceOn || !activation.masterEnabled;

  await commitActivation(
    setMasterEnabled(activation, nextEnabled),
    nextEnabled ? 'Header rules resumed.' : 'All header rules paused.'
  );
}

async function resumeFromBanner() {
  await toggleMaster(true);
}

async function commitActivation(nextActivation, message) {
  const controls = [
    document.getElementById('masterSwitch'),
    document.getElementById('resumeMasterBtn')
  ];

  controls.forEach((control) => {
    control.disabled = true;
  });

  state.headers.syncPaused = true;
  try {
    state.headers.activation = await setActivationState(nextActivation);
    renderRules();
    showStatus('headerStatus', message, 'success');
  } catch (error) {
    console.error(error);
    renderRules();
    showStatus('headerStatus', error.message || 'Could not change the ReqKit switch.', 'error');
  } finally {
    state.headers.syncPaused = false;
    controls.forEach((control) => {
      control.disabled = false;
    });
  }
}

function renderMasterSwitch() {
  const activation = getActivation();
  const status = getActivationStatus(activation);
  const masterSwitch = document.getElementById('masterSwitch');

  masterSwitch.setAttribute('aria-checked', String(activation.masterEnabled));
  masterSwitch.setAttribute(
    'aria-label',
    activation.masterEnabled ? 'Pause all header rules' : 'Resume all header rules'
  );
  document.getElementById('masterSwitchLabel').textContent = activation.masterEnabled ? 'On' : 'Paused';

  const banner = document.getElementById('masterPausedBanner');
  banner.hidden = status === 'live';
  if (status !== 'live') {
    const parked = status === 'parked';
    document.getElementById('masterPausedTitle').textContent = parked
      ? 'No profile is active'
      : 'All header rules are paused';
    document.getElementById('masterPausedDetail').textContent = parked
      ? `Resume to switch back to ${getProfileName(state.headers.profiles, getTargetProfileId(activation))}.`
      : 'No headers are being applied to any site.';
  }

  document.querySelector('#headers-panel .content-stack')
    .classList.toggle('is-master-paused', status !== 'live');
}

function renderActivationSummary() {
  const display = getActivationDisplay(
    state.headers.profiles,
    getActivation()
  );
  document.getElementById('activeProfileName').textContent = display.profileName;
  document.getElementById('activeUntilLabel').textContent = display.appliedUntil;
}

/**
 * When the grant list could not be read, say nothing rather than flagging every
 * rule as broken.
 */
function describeRule(rule) {
  const grantedOrigins = state.headers.grantedOrigins;
  return {
    needsAccess: Boolean(grantedOrigins) && !isRuleGranted(rule, grantedOrigins)
  };
}

function openManager() {
  openOptionsPage().catch((error) => {
    console.error('Could not open the ReqKit manager.', error);
  });
}

function openActiveSetup() {
  createTab({ url: getExtensionUrl(getManagerPath({ section: 'active-setup' })) }).catch((error) => {
    console.error('Could not open the active setup.', error);
  });
}

function handleRuleListClick(event) {
  const button = event.target.closest('[data-rule-action]');
  if (!button) {
    return;
  }

  switch (button.dataset.ruleAction) {
    case 'open-composer':
      setHeaderComposerExpanded(true, { focusFirstField: true });
      break;
    case 'open-manager':
      openManager();
      break;
    case 'edit':
      openRuleInManager(Number(button.dataset.id));
      break;
    case 'toggle':
      toggleRule(Number(button.dataset.id));
      break;
    case 'reveal':
      toggleRuleValueVisibility(Number(button.dataset.id));
      break;
    case 'grant':
      grantRuleAccess(Number(button.dataset.id));
      break;
    case 'delete':
      confirmDeleteRule(Number(button.dataset.id));
      break;
    default:
      break;
  }
}

/**
 * Editing lives in the manager, so the popup hands the rule over rather than
 * growing a form that a permission prompt could dismiss mid-edit.
 */
function openRuleInManager(id) {
  createTab({ url: getExtensionUrl(getManagerPath({ editRuleId: id })) }).catch((error) => {
    console.error('Could not open that rule in the manager.', error);
  });
}

async function handleComposerSubmit(event) {
  event.preventDefault();
  const addButton = document.getElementById('addHeaderBtn');
  if (addButton.disabled) {
    return;
  }

  addButton.disabled = true;
  addButton.textContent = 'Adding…';

  try {
    if (await addRule()) {
      setHeaderComposerExpanded(false, { reset: true, returnFocus: true });
    }
  } finally {
    addButton.disabled = false;
    addButton.textContent = 'Add rule';
  }
}

function handleComposerKeydown(event) {
  if (event.key !== 'Escape') {
    return;
  }

  event.preventDefault();
  setHeaderComposerExpanded(false, { reset: true, returnFocus: true });
}

function toggleHeaderComposer() {
  setHeaderComposerExpanded(!state.headers.composerOpen, {
    focusFirstField: !state.headers.composerOpen
  });
}

function cancelHeaderComposer() {
  setHeaderComposerExpanded(false, { reset: true, returnFocus: true });
}

function setHeaderComposerExpanded(expanded, {
  focusFirstField = false,
  reset = false,
  returnFocus = false
} = {}) {
  const composer = document.getElementById('headerComposer');
  const toggle = document.getElementById('headerComposerToggle');

  state.headers.composerOpen = expanded;
  composer.hidden = !expanded;
  toggle.setAttribute('aria-expanded', String(expanded));

  if (reset) {
    clearHeaderForm();
  }

  if (focusFirstField && expanded) {
    const domainInput = document.getElementById('domain');
    const firstField = domainInput.value.trim()
      ? document.getElementById('headerName')
      : domainInput;
    firstField.focus();
  } else if (returnFocus && !expanded) {
    toggle.focus();
  }
}

function initializeCurrentSite(activeTab) {
  const tabUrl = activeTab?.url || '';
  if (!/^https:\/\//i.test(tabUrl)) {
    state.headers.currentHostname = '';
    return;
  }

  const parsed = parseUserUrl(tabUrl);
  state.headers.currentHostname = parsed.url.hostname.toLowerCase();
  document.getElementById('domain').value = state.headers.currentHostname;
}

function renderRules() {
  const { rules, currentHostname } = state.headers;
  const container = document.getElementById('ruleListContainer');
  const conflictMap = createConflictMap(getActiveRuleConflicts(rules, getActivation()));
  const conflictingIds = new Set(conflictMap.keys());
  renderMasterSwitch();
  renderActivationSummary();
  updateCurrentSiteControls();

  const currentSiteRules = currentHostname ? filterRulesByHost(getScopedRules(), currentHostname) : [];
  if (!currentSiteRules.length) {
    container.innerHTML = getEmptyRulesMessage();
    return;
  }

  const sortedRules = sortRulesForDisplay(currentSiteRules, conflictingIds);
  container.innerHTML = `
    <div class="current-rule-list" aria-label="Rules for ${escapeHtml(currentHostname)}">
      ${sortedRules.map((rule) => renderRuleRow(rule, {
    conflictingRules: conflictMap.get(rule.id) || [],
    revealed: state.headers.revealedRuleIds.has(rule.id),
    editOpensManager: true,
    ...describeRule(rule)
  })).join('')}
    </div>
  `;
}

function updateCurrentSiteControls() {
  const { rules, currentHostname } = state.headers;
  const currentSiteHost = document.getElementById('currentSiteHost');
  const currentSiteWorkbench = document.querySelector('.current-site-workbench');
  const currentSiteCount = currentHostname
    ? filterRulesByHost(getScopedRules(), currentHostname).length
    : 0;
  const countLabel = document.getElementById('currentSiteRuleCount');

  currentSiteHost.textContent = currentHostname || 'Unavailable on this page';
  currentSiteHost.classList.toggle('is-unavailable', !currentHostname);
  currentSiteWorkbench.classList.toggle('is-unavailable', !currentHostname);

  countLabel.textContent = currentHostname ? formatRuleCount(currentSiteCount) : 'Site rules';

  document.getElementById('manageRulesLink').textContent = getManagerLinkLabel(rules.length);
}

function getEmptyRulesMessage() {
  const { currentHostname, rules } = state.headers;

  if (currentHostname) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path fill="currentColor" d="M7.25 2.5h1.5v4.75h4.75v1.5H8.75v4.75h-1.5V8.75H2.5v-1.5h4.75V2.5Z"/></svg></div>
        <p class="empty-state-title">No rules for <code>${escapeHtml(currentHostname)}</code></p>
        <p>Add a rule to modify requests sent to this HTTPS host.</p>
        <button class="primary-btn empty-state-action" type="button" data-rule-action="open-composer">Add rule for this site</button>
      </div>
    `;
  }

  return `
    <div class="empty-state">
      <div class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path fill="currentColor" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm7.25-3.5h1.5V6h-1.5V4.5Zm0 3h1.5v4h-1.5v-4Z"/></svg></div>
      <p class="empty-state-title">No site to work with</p>
      <p>Open an HTTPS page to add or review its header rules.</p>
      ${rules.length ? '<button class="secondary-btn empty-state-action" type="button" data-rule-action="open-manager">Open the rule manager</button>' : ''}
    </div>
  `;
}

async function addRule() {
  const activation = getActivation();
  const profileId = getTargetProfileId(activation);
  const validation = validateRuleDraft(readCreateDraft(), state.headers.rules, {
    activation,
    profileId
  });
  if (!validation.ok) {
    showStatus('headerStatus', validation.error, 'error');
    return false;
  }

  const newRule = {
    id: getNextRuleId(state.headers.rules),
    ...validation.rule,
    enabled: true,
    profileId
  };
  const updatedRules = [
    ...state.headers.rules,
    newRule
  ];

  try {
    await ensureRulePermission(newRule);
    await persistRules(updatedRules);
    showStatus('headerStatus', 'Header rule added.', 'success');
    return true;
  } catch (error) {
    console.error(error);
    showStatus('headerStatus', error.message || 'Chrome rejected the new rule.', 'error');
    return false;
  }
}

async function toggleRule(id) {
  const currentRule = state.headers.rules.find((rule) => rule.id === id);
  if (!currentRule) {
    return;
  }

  if (!currentRule.enabled) {
    const conflictingRule = findActiveRuleConflict(
      { ...currentRule, enabled: true },
      state.headers.rules,
      { excludeId: id, activation: getActivation() }
    );
    if (conflictingRule) {
      showStatus('headerStatus', getRuleConflictMessage(conflictingRule), 'error');
      return;
    }

    try {
      await ensureRulePermission(currentRule);
    } catch (error) {
      console.error(error);
      showStatus('headerStatus', error.message, 'error');
      return;
    }
  }

  const updatedRules = state.headers.rules.map((rule) => (
    rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
  ));

  try {
    await persistRules(updatedRules);
    const toggledRule = state.headers.rules.find((rule) => rule.id === id);
    showStatus('headerStatus', toggledRule?.enabled ? 'Rule enabled.' : 'Rule paused.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('headerStatus', error.message || 'Could not toggle that rule.', 'error');
  }
}

function confirmDeleteRule(id) {
  const rule = state.headers.rules.find((candidate) => candidate.id === id);
  if (!rule) {
    return;
  }

  if (globalThis.confirm(`Delete ${rule.headerName} for ${rule.domain}?`)) {
    deleteRule(id);
  }
}

async function deleteRule(id) {
  const ruleToDelete = state.headers.rules.find((rule) => rule.id === id);
  if (!ruleToDelete) {
    return;
  }

  try {
    const updatedRules = state.headers.rules.filter((rule) => rule.id !== id);
    await persistRules(updatedRules);
    await releaseUnusedPermission(ruleToDelete, updatedRules);
    state.headers.revealedRuleIds.delete(id);
    showStatus('headerStatus', 'Rule removed.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('headerStatus', error.message || 'Could not remove that rule.', 'error');
  }
}

function toggleRuleValueVisibility(id) {
  if (state.headers.revealedRuleIds.has(id)) {
    state.headers.revealedRuleIds.delete(id);
  } else {
    state.headers.revealedRuleIds.add(id);
  }
  renderRules();
}

async function grantRuleAccess(id) {
  const rule = state.headers.rules.find((candidate) => candidate.id === id);
  if (!rule) {
    return;
  }

  try {
    await ensureRulePermission(rule);
    state.headers.grantedOrigins = await readGrantedOrigins();
    // Re-commit so the worker rebuilds the rule set now that access exists.
    await persistRules(state.headers.rules);
    showStatus('headerStatus', `Site access granted for ${rule.domain}.`, 'success');
  } catch (error) {
    console.error(error);
    showStatus('headerStatus', error.message || 'Chrome denied site access.', 'error');
  }
}

async function ensureRulePermission(rule) {
  const granted = await requestOriginPermission(getRuleOriginPattern(rule));
  if (!granted) {
    throw new Error(`Site access to https://${rule.domain} is required to enable this rule.`);
  }
}

async function releaseUnusedPermission(rule, remainingRules) {
  if (remainingRules.some((candidate) => candidate.domain === rule.domain)) {
    return;
  }

  try {
    await removeOriginPermission(getRuleOriginPattern(rule));
  } catch (error) {
    console.error(`Could not release site access for ${rule.domain}.`, error);
  }
}

/**
 * The storage listener would otherwise fire on this page's own write and reset
 * transient UI such as revealed values.
 */
async function persistRules(rules) {
  state.headers.syncPaused = true;
  try {
    state.headers.rules = await commitRules(rules);
    renderRules();
  } finally {
    state.headers.syncPaused = false;
  }
}

function readCreateDraft() {
  return {
    domain: document.getElementById('domain').value,
    headerName: document.getElementById('headerName').value,
    headerValue: document.getElementById('headerValue').value
  };
}

function clearHeaderForm() {
  document.getElementById('domain').value = state.headers.currentHostname;
  document.getElementById('headerName').value = '';
  document.getElementById('headerValue').value = '';
}
