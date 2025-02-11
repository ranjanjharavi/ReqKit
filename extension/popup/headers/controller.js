import {
  RULE_STORAGE_KEY,
  filterRulesByHost,
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
  onStorageChanged,
  openOptionsPage,
  removeOriginPermission,
  requestOriginPermission,
  storageLocalGet
} from '../../shared/chrome-api.js';
import {
  ACTIVATION_STORAGE_KEY,
  createDefaultActivation,
  getTargetProfileId,
  normalizeActivation
} from '../../shared/activation.js';
import {
  PROFILE_STORAGE_KEY,
  createDefaultProfiles,
  getProfileIds,
  normalizeProfiles
} from '../../shared/profiles.js';
import { createConflictMap, renderRuleRow, sortRulesForDisplay } from '../../shared/rule-render.js';
import { parseUserUrl } from '../../shared/urls.js';
import { commitRules, getStoredRules } from '../../shared/rule-api.js';
import { state } from '../state.js';
import { escapeHtml, showStatus } from '../../shared/ui.js';

const OPTIONS_PAGE = 'options/index.html';

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

  document.getElementById('ruleListContainer').addEventListener('click', handleRuleListClick);

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
}

function getActivation() {
  return state.headers.activation || createDefaultActivation();
}

function openManager() {
  openOptionsPage().catch((error) => {
    console.error('Could not open the ReqKit manager.', error);
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
  createTab({ url: getExtensionUrl(`${OPTIONS_PAGE}?edit=${id}`) }).catch((error) => {
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
  const body = document.getElementById('headerComposerBody');

  state.headers.composerOpen = expanded;
  composer.classList.toggle('is-open', expanded);
  toggle.setAttribute('aria-expanded', String(expanded));
  body.hidden = !expanded;

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
  updateCurrentSiteControls();

  const currentSiteRules = currentHostname ? filterRulesByHost(rules, currentHostname) : [];
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
    editOpensManager: true
  })).join('')}
    </div>
  `;
}

function updateCurrentSiteControls() {
  const { rules, currentHostname } = state.headers;
  const currentSiteHost = document.getElementById('currentSiteHost');
  const currentSiteToolbar = document.querySelector('.current-site-toolbar');
  const currentSiteCount = currentHostname ? filterRulesByHost(rules, currentHostname).length : 0;
  const countLabel = document.getElementById('currentSiteRuleCount');

  currentSiteHost.textContent = currentHostname || 'Unavailable on this page';
  currentSiteHost.classList.toggle('is-unavailable', !currentHostname);
  currentSiteToolbar.classList.toggle('is-unavailable', !currentHostname);

  countLabel.textContent = `${currentSiteCount} ${currentSiteCount === 1 ? 'rule' : 'rules'}`;
  countLabel.hidden = !currentHostname;

  document.getElementById('headerComposerHint').textContent = currentHostname
    ? `For ${currentHostname}`
    : 'Choose an exact host';

  document.getElementById('manageRulesLink').textContent = rules.length
    ? `Manage all ${rules.length} ${rules.length === 1 ? 'rule' : 'rules'} →`
    : 'Manage all rules →';
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
