import {
  RULE_STORAGE_KEY,
  findActiveRuleConflict,
  getActiveRuleConflicts,
  getNextRuleId,
  getRuleConflictMessage,
  getRuleOriginPattern,
  groupRulesByDomain,
  validateRuleDraft
} from '../../shared/rules.js';
import {
  onStorageChanged,
  removeOriginPermission,
  requestOriginPermission,
  storageLocalGet
} from '../../shared/chrome-api.js';
import {
  ACTIVATION_STORAGE_KEY,
  createDefaultActivation,
  getTargetProfileId,
  normalizeActivation,
  setMasterEnabled
} from '../../shared/activation.js';
import { setActivationState } from '../../shared/activation-api.js';
import {
  PROFILE_STORAGE_KEY,
  createDefaultProfiles,
  getProfileIds,
  normalizeProfiles
} from '../../shared/profiles.js';
import {
  createConflictMap,
  renderDomainGroup,
  sortDomainGroups
} from '../../shared/rule-render.js';
import { commitRules, getStoredRules } from '../../shared/rule-api.js';
import { state } from '../state.js';
import { showStatus } from '../../shared/ui.js';

const SEARCH_VISIBLE_FROM = 5;

export function bindRuleEvents() {
  document.getElementById('headerComposerToggle').addEventListener('click', toggleHeaderComposer);
  document.getElementById('cancelHeaderComposerBtn').addEventListener('click', cancelHeaderComposer);

  const composerForm = document.getElementById('headerComposerForm');
  composerForm.addEventListener('submit', handleComposerSubmit);
  composerForm.addEventListener('keydown', handleComposerKeydown);

  const ruleList = document.getElementById('ruleListContainer');
  ruleList.addEventListener('click', handleRuleListClick);
  ruleList.addEventListener('submit', handleRuleFormSubmit);
  ruleList.addEventListener('keydown', handleRuleFormKeydown);
  document.getElementById('ruleSearchInput').addEventListener('input', handleRuleSearchInput);
  document.getElementById('masterSwitch').addEventListener('click', () => toggleMaster());
  document.getElementById('resumeMasterBtn').addEventListener('click', () => toggleMaster(true));

  onStorageChanged((changes) => {
    const touchesRules = RULE_STORAGE_KEY in changes
      || ACTIVATION_STORAGE_KEY in changes
      || PROFILE_STORAGE_KEY in changes;

    if (touchesRules && !state.syncPaused) {
      refreshFromStorage().catch((error) => {
        console.error('Could not refresh header rules.', error);
      });
    }
  });
}

export async function initializeRules({ editRuleId = null } = {}) {
  await refreshFromStorage();

  if (editRuleId && state.rules.some((rule) => rule.id === editRuleId)) {
    startEditingRule(editRuleId);
    document.querySelector('.rule-edit-form')?.scrollIntoView({ block: 'center' });
  }
}

async function refreshFromStorage() {
  await loadActivation();
  state.rules = await getStoredRules();
  renderRules();
}

async function loadActivation() {
  try {
    const stored = await storageLocalGet([PROFILE_STORAGE_KEY, ACTIVATION_STORAGE_KEY]);
    const profiles = normalizeProfiles(stored[PROFILE_STORAGE_KEY]);
    state.profiles = profiles;
    state.activation = normalizeActivation(stored[ACTIVATION_STORAGE_KEY], {
      profileIds: getProfileIds(profiles)
    });
  } catch (error) {
    console.error('Could not read the activation state.', error);
    state.profiles = createDefaultProfiles();
    state.activation = createDefaultActivation();
  }
}

function getActivation() {
  return state.activation || createDefaultActivation();
}

async function toggleMaster(forceOn = false) {
  const activation = getActivation();
  const nextEnabled = forceOn || !activation.masterEnabled;
  const controls = [
    document.getElementById('masterSwitch'),
    document.getElementById('resumeMasterBtn')
  ];

  controls.forEach((control) => {
    control.disabled = true;
  });

  state.syncPaused = true;
  try {
    state.activation = await setActivationState(setMasterEnabled(activation, nextEnabled));
    renderRules();
    showStatus(
      'headerStatus',
      nextEnabled ? 'Header rules resumed.' : 'All header rules paused.',
      'success'
    );
  } catch (error) {
    console.error(error);
    showStatus('headerStatus', error.message || 'Could not change the ReqKit switch.', 'error');
  } finally {
    state.syncPaused = false;
    controls.forEach((control) => {
      control.disabled = false;
    });
  }
}

function renderMasterSwitch() {
  const { masterEnabled } = getActivation();
  const masterSwitch = document.getElementById('masterSwitch');

  masterSwitch.setAttribute('aria-checked', String(masterEnabled));
  masterSwitch.setAttribute(
    'aria-label',
    masterEnabled ? 'Pause all header rules' : 'Resume all header rules'
  );
  document.getElementById('masterSwitchLabel').textContent = masterEnabled ? 'On' : 'Paused';

  document.getElementById('masterPausedBanner').hidden = masterEnabled;
  document.querySelector('.options-panel .content-stack')
    .classList.toggle('is-master-paused', !masterEnabled);
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
    case 'clear-search':
      clearRuleSearch();
      break;
    case 'toggle-domain':
      toggleDomainGroup(button.dataset.domain);
      break;
    case 'edit':
      startEditingRule(Number(button.dataset.id));
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
    case 'cancel-edit':
      state.editingId = null;
      renderRules();
      break;
    default:
      break;
  }
}

function handleRuleSearchInput(event) {
  state.searchQuery = event.target.value;
  renderRules();
}

async function handleRuleFormSubmit(event) {
  const form = event.target.closest('.rule-edit-form');
  if (!form) {
    return;
  }

  event.preventDefault();
  const id = Number(form.dataset.id);
  const buttons = form.querySelectorAll('button');
  const saveButton = form.querySelector('.save-edit-rule-btn');

  buttons.forEach((button) => {
    button.disabled = true;
  });
  saveButton.textContent = 'Saving…';

  try {
    await saveEditedRule(id);
  } finally {
    if (saveButton.isConnected) {
      buttons.forEach((button) => {
        button.disabled = false;
      });
      saveButton.textContent = 'Save changes';
    }
  }
}

function handleRuleFormKeydown(event) {
  if (event.key !== 'Escape' || !event.target.closest('.rule-edit-form')) {
    return;
  }

  event.preventDefault();
  state.editingId = null;
  renderRules();
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
  setHeaderComposerExpanded(!state.composerOpen, { focusFirstField: !state.composerOpen });
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

  state.composerOpen = expanded;
  composer.classList.toggle('is-open', expanded);
  toggle.setAttribute('aria-expanded', String(expanded));
  body.hidden = !expanded;

  if (reset) {
    clearHeaderForm();
  }

  if (focusFirstField && expanded) {
    document.getElementById('domain').focus();
  } else if (returnFocus && !expanded) {
    toggle.focus();
  }
}

function renderRules() {
  const container = document.getElementById('ruleListContainer');
  const conflictMap = createConflictMap(getActiveRuleConflicts(state.rules, getActivation()));
  const conflictingIds = new Set(conflictMap.keys());
  renderMasterSwitch();
  updateSummary();

  const visibleRules = filterRulesBySearch(state.rules, state.searchQuery);
  if (!visibleRules.length) {
    container.innerHTML = getEmptyRulesMessage();
    return;
  }

  const groups = sortDomainGroups(groupRulesByDomain(visibleRules), conflictingIds, '');
  container.innerHTML = groups.map(({ domain, rules: domainRules }, index) => renderDomainGroup(
    domain,
    domainRules,
    {
      index,
      conflictMap,
      collapsed: state.collapsedDomains.has(domain),
      editingId: state.editingId,
      revealedRuleIds: state.revealedRuleIds
    }
  )).join('');
}

function updateSummary() {
  const totalRules = state.rules.length;
  const activeRules = state.rules.filter((rule) => rule.enabled).length;
  const hostCount = new Set(state.rules.map((rule) => rule.domain)).size;

  document.getElementById('optionsSummary').textContent = totalRules
    ? `${totalRules} ${totalRules === 1 ? 'rule' : 'rules'} · ${activeRules} enabled · ${hostCount} ${hostCount === 1 ? 'host' : 'hosts'}`
    : 'Every request-header rule in this Chrome profile.';

  const searchContainer = document.getElementById('ruleSearchContainer');
  const searchInput = document.getElementById('ruleSearchInput');
  const searchEnabled = totalRules >= SEARCH_VISIBLE_FROM;

  searchContainer.hidden = !searchEnabled;
  if (!searchEnabled) {
    state.searchQuery = '';
  }
  if (searchInput.value !== state.searchQuery) {
    searchInput.value = state.searchQuery;
  }
}

function filterRulesBySearch(rules, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) {
    return rules;
  }

  return rules.filter((rule) => [rule.domain, rule.headerName].some((value) => (
    String(value).toLowerCase().includes(normalizedQuery)
  )));
}

function getEmptyRulesMessage() {
  if (state.searchQuery.trim()) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path fill="currentColor" d="M7 2a5 5 0 1 0 3.16 8.87l2.98 2.98 1.06-1.06-2.98-2.98A5 5 0 0 0 7 2Zm-3.5 5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z"/></svg></div>
        <p class="empty-state-title">No matching rules</p>
        <p>Try a different host or header.</p>
        <button class="secondary-btn empty-state-action" type="button" data-rule-action="clear-search">Clear search</button>
      </div>
    `;
  }

  return `
    <div class="empty-state">
      <div class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path fill="currentColor" d="M7.25 2.5h1.5v4.75h4.75v1.5H8.75v4.75h-1.5V8.75H2.5v-1.5h4.75V2.5Z"/></svg></div>
      <p class="empty-state-title">No header rules yet</p>
      <p>Add your first exact-host rule.</p>
      <button class="primary-btn empty-state-action" type="button" data-rule-action="open-composer">Add header rule</button>
    </div>
  `;
}

function toggleDomainGroup(domain) {
  if (!domain) {
    return;
  }

  if (state.collapsedDomains.has(domain)) {
    state.collapsedDomains.delete(domain);
  } else {
    state.collapsedDomains.add(domain);
  }
  renderRules();
}

function startEditingRule(id) {
  const rule = state.rules.find((candidate) => candidate.id === id);
  if (!rule) {
    return;
  }

  state.editingId = id;
  state.collapsedDomains.delete(rule.domain);
  renderRules();
  const domainInput = document.getElementById(`editDomain-${id}`);
  domainInput?.focus();
  domainInput?.select();
}

function toggleRuleValueVisibility(id) {
  if (state.revealedRuleIds.has(id)) {
    state.revealedRuleIds.delete(id);
  } else {
    state.revealedRuleIds.add(id);
  }
  renderRules();
}

async function addRule() {
  const activation = getActivation();
  const profileId = getTargetProfileId(activation);
  const validation = validateRuleDraft(readCreateDraft(), state.rules, { activation, profileId });
  if (!validation.ok) {
    showStatus('headerStatus', validation.error, 'error');
    return false;
  }

  const newRule = {
    id: getNextRuleId(state.rules),
    ...validation.rule,
    enabled: true,
    profileId
  };

  try {
    await ensureRulePermission(newRule);
    await persistRules([...state.rules, newRule]);
    showStatus('headerStatus', 'Header rule added.', 'success');
    return true;
  } catch (error) {
    console.error(error);
    showStatus('headerStatus', error.message || 'Chrome rejected the new rule.', 'error');
    return false;
  }
}

async function toggleRule(id) {
  const currentRule = state.rules.find((rule) => rule.id === id);
  if (!currentRule) {
    return;
  }

  if (!currentRule.enabled) {
    const conflictingRule = findActiveRuleConflict(
      { ...currentRule, enabled: true },
      state.rules,
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

  const updatedRules = state.rules.map((rule) => (
    rule.id === id ? { ...rule, enabled: !rule.enabled } : rule
  ));

  try {
    await persistRules(updatedRules);
    const toggledRule = state.rules.find((rule) => rule.id === id);
    showStatus('headerStatus', toggledRule?.enabled ? 'Rule enabled.' : 'Rule paused.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('headerStatus', error.message || 'Could not toggle that rule.', 'error');
  }
}

async function saveEditedRule(id) {
  const statusId = `ruleEditStatus-${id}`;
  const currentRule = state.rules.find((rule) => rule.id === id);
  if (!currentRule) {
    state.editingId = null;
    renderRules();
    showStatus('headerStatus', 'That rule no longer exists.', 'error');
    return;
  }

  const validation = validateRuleDraft(readEditDraft(id), state.rules, {
    excludeId: id,
    enabled: currentRule.enabled,
    activation: getActivation(),
    profileId: currentRule.profileId
  });
  if (!validation.ok) {
    showStatus(statusId, validation.error, 'error');
    return;
  }

  const updatedRules = state.rules.map((rule) => (
    rule.id === id ? { ...rule, ...validation.rule } : rule
  ));
  const updatedRule = updatedRules.find((rule) => rule.id === id);

  try {
    if (updatedRule.enabled) {
      await ensureRulePermission(updatedRule);
    }
    state.editingId = null;
    state.revealedRuleIds.delete(id);
    await persistRules(updatedRules);
    if (currentRule.domain !== updatedRule.domain) {
      await releaseUnusedPermission(currentRule, updatedRules);
    }
    showStatus('headerStatus', 'Header rule updated.', 'success');
  } catch (error) {
    state.editingId = id;
    console.error(error);
    showStatus(statusId, error.message || 'Could not update that rule.', 'error');
  }
}

function confirmDeleteRule(id) {
  const rule = state.rules.find((candidate) => candidate.id === id);
  if (!rule) {
    return;
  }

  if (globalThis.confirm(`Delete ${rule.headerName} for ${rule.domain}?`)) {
    deleteRule(id);
  }
}

async function deleteRule(id) {
  const ruleToDelete = state.rules.find((rule) => rule.id === id);
  if (!ruleToDelete) {
    return;
  }

  try {
    const updatedRules = state.rules.filter((rule) => rule.id !== id);
    await persistRules(updatedRules);
    await releaseUnusedPermission(ruleToDelete, updatedRules);
    state.revealedRuleIds.delete(id);
    showStatus('headerStatus', 'Rule removed.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('headerStatus', error.message || 'Could not remove that rule.', 'error');
  }
}

function clearRuleSearch() {
  state.searchQuery = '';
  const searchInput = document.getElementById('ruleSearchInput');
  searchInput.value = '';
  renderRules();
  searchInput.focus();
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
 * The storage listener would otherwise fire on this page's own write and close
 * an open edit form underneath the user.
 */
async function persistRules(rules) {
  state.syncPaused = true;
  try {
    state.rules = await commitRules(rules);
    renderRules();
  } finally {
    state.syncPaused = false;
  }
}

function readCreateDraft() {
  return {
    domain: document.getElementById('domain').value,
    headerName: document.getElementById('headerName').value,
    headerValue: document.getElementById('headerValue').value
  };
}

function readEditDraft(id) {
  return {
    domain: document.getElementById(`editDomain-${id}`).value,
    headerName: document.getElementById(`editHeaderName-${id}`).value,
    headerValue: document.getElementById(`editHeaderValue-${id}`).value
  };
}

function clearHeaderForm() {
  document.getElementById('domain').value = '';
  document.getElementById('headerName').value = '';
  document.getElementById('headerValue').value = '';
}
