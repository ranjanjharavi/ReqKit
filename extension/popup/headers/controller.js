import {
  filterRulesByHost,
  findActiveRuleConflict,
  getActiveRuleConflicts,
  getNextRuleId,
  getRuleConflictMessage,
  getRuleOriginPattern,
  groupRulesByDomain,
  validateRuleDraft
} from '../../shared/rules.js';
import {
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
import { parseUserUrl } from '../../shared/urls.js';
import { commitRules, getStoredRules } from './api.js';
import { state } from '../state.js';
import { escapeHtml, showStatus } from '../ui.js';

export function bindHeaderEvents() {
  document.getElementById('headerComposerToggle').addEventListener('click', toggleHeaderComposer);
  document.getElementById('cancelHeaderComposerBtn').addEventListener('click', cancelHeaderComposer);

  const composerForm = document.getElementById('headerComposerForm');
  composerForm.addEventListener('submit', handleComposerSubmit);
  composerForm.addEventListener('keydown', handleComposerKeydown);

  document.querySelector('.rule-view-toggle').addEventListener('click', (event) => {
    const button = event.target.closest('.rule-view-btn');
    if (button) {
      setRuleView(button.dataset.ruleView);
    }
  });

  const ruleList = document.getElementById('ruleListContainer');
  ruleList.addEventListener('click', handleRuleListClick);
  ruleList.addEventListener('submit', handleRuleFormSubmit);
  ruleList.addEventListener('keydown', handleRuleFormKeydown);
  document.getElementById('ruleSearchInput').addEventListener('input', handleRuleSearchInput);
}

export async function initializeHeaders(activeTab) {
  initializeCurrentSite(activeTab);
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
      state.headers.editingId = null;
      renderRules();
      break;
    default:
      break;
  }
}

function handleRuleSearchInput(event) {
  state.headers.searchQuery = event.target.value;
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
  state.headers.editingId = null;
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
    state.headers.view = 'all';
    return;
  }

  const parsed = parseUserUrl(tabUrl);
  state.headers.currentHostname = parsed.url.hostname.toLowerCase();
  document.getElementById('domain').value = state.headers.currentHostname;
}

function renderRules() {
  const { rules, currentHostname, view, editingId } = state.headers;
  const container = document.getElementById('ruleListContainer');
  const conflictMap = createConflictMap(getActiveRuleConflicts(rules, getActivation()));
  const conflictingIds = new Set(conflictMap.keys());
  updateCurrentSiteControls();

  const rulesForView = view === 'current' && currentHostname
    ? filterRulesByHost(rules, currentHostname)
    : rules;
  const visibleRules = filterRulesBySearch(rulesForView, state.headers.searchQuery, view);

  if (!visibleRules.length) {
    container.innerHTML = getEmptyRulesMessage();
    return;
  }

  if (view === 'current') {
    const sortedRules = sortRulesForDisplay(visibleRules, conflictingIds);
    container.innerHTML = `
      <div class="current-rule-list" aria-label="Rules for ${escapeHtml(currentHostname)}">
        ${sortedRules.map((rule) => renderRuleRow(rule, conflictMap.get(rule.id) || [])).join('')}
      </div>
    `;
    return;
  }

  const groups = sortDomainGroups(groupRulesByDomain(visibleRules), conflictingIds, currentHostname);
  container.innerHTML = groups.map(({ domain, rules: domainRules }, index) => (
    renderDomainGroup(domain, domainRules, index, conflictMap, editingId, currentHostname)
  )).join('');
}

function renderDomainGroup(domain, domainRules, index, conflictMap, editingId, currentHostname) {
  const conflictingIds = new Set(conflictMap.keys());
  const sortedRules = sortRulesForDisplay(domainRules, conflictingIds);
  const hasEditingRule = domainRules.some((rule) => rule.id === editingId);
  const isCollapsed = state.headers.collapsedDomains.has(domain) && !hasEditingRule;
  const activeCount = domainRules.filter((rule) => rule.enabled).length;
  const pausedCount = domainRules.length - activeCount;
  const conflictCount = domainRules.reduce((count, rule) => (
    count + (conflictMap.get(rule.id)?.length || 0)
  ), 0) / 2;
  const groupId = `domainRuleGroup-${index}`;
  const summary = [
    activeCount ? `${activeCount} active` : '',
    pausedCount ? `${pausedCount} paused` : ''
  ].filter(Boolean).join(' · ');

  return `
    <section class="rule-group${conflictCount ? ' has-conflict' : ''}">
      <button class="rule-group-toggle" type="button" data-rule-action="toggle-domain" data-domain="${escapeHtml(domain)}" aria-expanded="${String(!isCollapsed)}" aria-controls="${groupId}">
        <span class="rule-group-heading">
          <span class="rule-domain">${escapeHtml(domain)}</span>
          ${domain === currentHostname ? '<span class="current-site-badge">Current site</span>' : ''}
        </span>
        <span class="rule-group-meta">
          <span class="rule-group-summary">${summary}</span>
          ${conflictCount ? `<span class="rule-group-conflict">${conflictCount} ${conflictCount === 1 ? 'conflict' : 'conflicts'}</span>` : ''}
          <svg class="rule-group-chevron" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="m4.2 6.1 3.8 3.8 3.8-3.8 1.05 1.05L8 12 3.15 7.15 4.2 6.1Z"/></svg>
        </span>
      </button>
      <div id="${groupId}" class="domain-rule-list"${isCollapsed ? ' hidden' : ''}>
        ${sortedRules.map((rule) => renderRuleRow(rule, conflictMap.get(rule.id) || [])).join('')}
      </div>
    </section>
  `;
}

function renderRuleRow(rule, conflictingRules) {
  if (rule.id === state.headers.editingId) {
    return renderRuleEditForm(rule);
  }

  const toggleTitle = `${rule.enabled ? 'Pause' : 'Enable'} ${rule.headerName} rule`;
  const isSensitive = isSensitiveHeaderName(rule.headerName);
  const isRevealed = state.headers.revealedRuleIds.has(rule.id);
  const displayValue = isSensitive && !isRevealed ? '••••••••••••••••' : rule.headerValue;
  const hasConflict = conflictingRules.length > 0;

  return `
    <article class="domain-rule-row${rule.enabled ? '' : ' is-paused'}${hasConflict ? ' has-conflict' : ''}">
      <div class="domain-rule-content">
        <div class="rule-row-head">
          <div class="rule-identification">
            <code class="rule-header-name">${escapeHtml(rule.headerName)}</code>
          </div>
          <div class="rule-row-controls">
            <button class="rule-enable-control" type="button" role="switch" aria-checked="${String(rule.enabled)}" data-rule-action="toggle" data-id="${rule.id}" aria-label="${toggleTitle}" title="${toggleTitle}">
              <span class="rule-switch-track" aria-hidden="true"><span class="rule-switch-thumb"></span></span>
              <span class="rule-enable-label">${rule.enabled ? 'On' : 'Off'}</span>
            </button>
            <button class="rule-action-btn" type="button" data-rule-action="edit" data-id="${rule.id}" aria-label="Edit ${escapeHtml(rule.headerName)} rule" title="Edit rule"><svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="m11.85 1.65 2.5 2.5a1.2 1.2 0 0 1 0 1.7l-7.8 7.8-4.05.85.85-4.05 7.8-7.8a1.2 1.2 0 0 1 1.7 0ZM4.7 11.2l-.35 1.45 1.45-.35 7.45-7.45-2.5-2.5L4.7 11.2Z"/></svg></button>
            <button class="rule-action-btn danger" type="button" data-rule-action="delete" data-id="${rule.id}" aria-label="Delete ${escapeHtml(rule.headerName)} rule" title="Delete rule"><svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.25 2.5h3.5l.5 1H13a.75.75 0 0 1 0 1.5h-.6l-.55 7.14A1.5 1.5 0 0 1 10.35 13.5h-4.7a1.5 1.5 0 0 1-1.5-1.36L3.6 5H3a.75.75 0 0 1 0-1.5h2.75l.5-1Zm-.46 2.5.5 6.5h3.42l.5-6.5H5.79Z"/></svg></button>
          </div>
        </div>
        <div class="rule-value-row">
          <code class="rule-header-value${isSensitive && !isRevealed ? ' is-masked' : ''}">${escapeHtml(displayValue)}</code>
          ${isSensitive ? `<button class="rule-value-btn" type="button" data-rule-action="reveal" data-id="${rule.id}" aria-label="${isRevealed ? 'Hide' : 'Reveal'} ${escapeHtml(rule.headerName)} value" title="${isRevealed ? 'Hide value' : 'Reveal value'}"><svg viewBox="0 0 16 16" aria-hidden="true">${isRevealed ? '<path fill="currentColor" d="m2.3 1.25 12.45 12.46-1.06 1.06-2.2-2.2A7.94 7.94 0 0 1 8 13.4c-3.65 0-6.25-2.7-7.2-4.14a2.28 2.28 0 0 1 0-2.52A10.4 10.4 0 0 1 3.2 4.1L1.24 2.31 2.3 1.25Zm1.99 3.94A8.8 8.8 0 0 0 2.05 7.5a.78.78 0 0 0 0 .98C2.85 9.67 4.89 11.9 8 11.9c.83 0 1.58-.16 2.25-.42l-1.2-1.2A2.5 2.5 0 0 1 5.72 6.95L4.29 5.19ZM8 2.6c3.65 0 6.25 2.7 7.2 4.14.5.76.5 1.76 0 2.52a10.7 10.7 0 0 1-1.53 1.85l-1.06-1.06a9.1 9.1 0 0 0 1.34-1.57.78.78 0 0 0 0-.98C13.15 6.33 11.11 4.1 8 4.1c-.36 0-.7.03-1.03.08L5.7 2.91A8.2 8.2 0 0 1 8 2.6Z"/>' : '<path fill="currentColor" d="M8 2.6c3.65 0 6.25 2.7 7.2 4.14.5.76.5 1.76 0 2.52C14.25 10.7 11.65 13.4 8 13.4S1.75 10.7.8 9.26a2.28 2.28 0 0 1 0-2.52C1.75 5.3 4.35 2.6 8 2.6Zm0 1.5c-3.11 0-5.15 2.23-5.95 3.4a.78.78 0 0 0 0 .98C2.85 9.67 4.89 11.9 8 11.9s5.15-2.23 5.95-3.42a.78.78 0 0 0 0-.98C13.15 6.33 11.11 4.1 8 4.1Zm0 1.4a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm0 1.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/>'}</svg></button>` : ''}
        </div>
        ${hasConflict ? renderConflictNotice(conflictingRules) : ''}
      </div>
    </article>
  `;
}

function renderConflictNotice(conflictingRules) {
  const detail = conflictingRules.length === 1
    ? 'Overlaps with another active rule using a different value.'
    : `Overlaps with ${conflictingRules.length} active rules using different values.`;

  return `
    <div class="rule-conflict-notice" role="note">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7.14 2.1a1 1 0 0 1 1.72 0l5.72 9.9a1 1 0 0 1-.86 1.5H2.28a1 1 0 0 1-.86-1.5l5.72-9.9ZM8 5a.75.75 0 0 0-.75.75v3a.75.75 0 0 0 1.5 0v-3A.75.75 0 0 0 8 5Zm0 6a.88.88 0 1 0 0 1.75A.88.88 0 0 0 8 11Z"/></svg>
      <span><strong>Conflict.</strong> ${escapeHtml(detail)}</span>
    </div>
  `;
}

function createConflictMap(conflicts) {
  const conflictMap = new Map();

  conflicts.forEach(({ leftRule, rightRule }) => {
    conflictMap.set(leftRule.id, [...(conflictMap.get(leftRule.id) || []), rightRule]);
    conflictMap.set(rightRule.id, [...(conflictMap.get(rightRule.id) || []), leftRule]);
  });

  return conflictMap;
}

function filterRulesBySearch(rules, query, view) {
  const normalizedQuery = view === 'all' ? String(query || '').trim().toLowerCase() : '';
  if (!normalizedQuery) {
    return rules;
  }

  return rules.filter((rule) => [
    rule.domain,
    rule.headerName
  ].some((value) => String(value).toLowerCase().includes(normalizedQuery)));
}

export function sortRulesForDisplay(rules, conflictingIds = new Set()) {
  return [...rules].sort((leftRule, rightRule) => {
    const conflictDifference = Number(conflictingIds.has(rightRule.id)) - Number(conflictingIds.has(leftRule.id));
    if (conflictDifference) {
      return conflictDifference;
    }

    return Number(rightRule.enabled) - Number(leftRule.enabled);
  });
}

function sortDomainGroups(groups, conflictingIds, currentHostname) {
  return [...groups].sort((leftGroup, rightGroup) => {
    const leftHasConflict = leftGroup.rules.some((rule) => conflictingIds.has(rule.id));
    const rightHasConflict = rightGroup.rules.some((rule) => conflictingIds.has(rule.id));
    const conflictDifference = Number(rightHasConflict) - Number(leftHasConflict);
    if (conflictDifference) {
      return conflictDifference;
    }

    const currentSiteDifference = Number(rightGroup.domain === currentHostname) - Number(leftGroup.domain === currentHostname);
    if (currentSiteDifference) {
      return currentSiteDifference;
    }

    return leftGroup.domain.localeCompare(rightGroup.domain);
  });
}

export function isSensitiveHeaderName(headerName) {
  return /(authorization|cookie|token|secret|api[-_]?key)/i.test(String(headerName || ''));
}

function renderRuleEditForm(rule) {
  return `
    <div class="domain-rule-row">
      <form class="rule-edit-form" data-id="${rule.id}">
        <div class="rule-edit-grid">
          <div class="rule-edit-field">
            <label for="editDomain-${rule.id}">Exact HTTPS host</label>
            <input id="editDomain-${rule.id}" type="text" value="${escapeHtml(rule.domain)}" autocapitalize="off" autocorrect="off" spellcheck="false">
          </div>
          <div class="rule-edit-field">
            <label for="editHeaderName-${rule.id}">Header name</label>
            <input id="editHeaderName-${rule.id}" type="text" value="${escapeHtml(rule.headerName)}" autocapitalize="off" autocorrect="off" spellcheck="false">
          </div>
          <div class="rule-edit-field">
            <label for="editHeaderValue-${rule.id}">Header value</label>
            <input id="editHeaderValue-${rule.id}" type="text" value="${escapeHtml(rule.headerValue)}" autocapitalize="off" autocorrect="off" spellcheck="false">
          </div>
        </div>
        <div id="ruleEditStatus-${rule.id}" class="status-msg rule-edit-status" aria-live="polite"></div>
        <div class="action-row rule-edit-actions">
          <button class="primary-btn save-edit-rule-btn" type="submit">Save changes</button>
          <button class="secondary-btn" type="button" data-rule-action="cancel-edit" data-id="${rule.id}">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

function startEditingRule(id) {
  const rule = state.headers.rules.find((candidate) => candidate.id === id);
  if (!rule) {
    return;
  }

  state.headers.editingId = id;
  state.headers.collapsedDomains.delete(rule.domain);
  renderRules();
  focusEditDomain(id);
}

function toggleDomainGroup(domain) {
  if (!domain) {
    return;
  }

  if (state.headers.collapsedDomains.has(domain)) {
    state.headers.collapsedDomains.delete(domain);
  } else {
    state.headers.collapsedDomains.add(domain);
  }
  renderRules();
}

function toggleRuleValueVisibility(id) {
  if (state.headers.revealedRuleIds.has(id)) {
    state.headers.revealedRuleIds.delete(id);
  } else {
    state.headers.revealedRuleIds.add(id);
  }
  renderRules();
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

function clearRuleSearch() {
  state.headers.searchQuery = '';
  const searchInput = document.getElementById('ruleSearchInput');
  searchInput.value = '';
  renderRules();
  searchInput.focus();
}

function setRuleView(nextView) {
  if (!['all', 'current'].includes(nextView)) {
    return;
  }

  if (nextView === 'current' && !state.headers.currentHostname) {
    return;
  }

  state.headers.view = nextView;
  state.headers.editingId = null;

  const domainInput = document.getElementById('domain');
  if (nextView === 'current' && !domainInput.value.trim()) {
    domainInput.value = state.headers.currentHostname;
  }

  renderRules();
}

function updateCurrentSiteControls() {
  const { rules, currentHostname, view } = state.headers;
  const currentSiteButton = document.getElementById('currentSiteViewBtn');
  const allHostsButton = document.getElementById('allHostsViewBtn');
  const currentSiteHost = document.getElementById('currentSiteHost');
  const currentSiteToolbar = document.querySelector('.current-site-toolbar');
  const currentSiteCount = rules.filter((rule) => rule.domain === currentHostname).length;

  currentSiteHost.textContent = currentHostname || 'Unavailable on this page';
  currentSiteHost.classList.toggle('is-unavailable', !currentHostname);
  currentSiteToolbar.classList.toggle('is-unavailable', !currentHostname);

  currentSiteButton.disabled = !currentHostname;
  currentSiteButton.classList.toggle('active', view === 'current');
  currentSiteButton.setAttribute('aria-pressed', String(view === 'current'));
  currentSiteButton.setAttribute('aria-label', currentHostname
    ? `Show ${currentSiteCount} rules for ${currentHostname}`
    : 'Current site is unavailable');
  document.getElementById('currentSiteViewCount').textContent = String(currentSiteCount);

  allHostsButton.classList.toggle('active', view === 'all');
  allHostsButton.setAttribute('aria-pressed', String(view === 'all'));
  allHostsButton.setAttribute('aria-label', `Show all ${rules.length} rules`);
  document.getElementById('allHostsViewCount').textContent = String(rules.length);

  document.getElementById('headerComposerHint').textContent = view === 'current' && currentHostname
    ? `For ${currentHostname}`
    : 'Choose an exact host';

  const searchContainer = document.getElementById('ruleSearchContainer');
  const searchInput = document.getElementById('ruleSearchInput');
  const searchEnabled = view === 'all' && rules.length >= 8;
  searchContainer.hidden = !searchEnabled;
  if (!searchEnabled) {
    state.headers.searchQuery = '';
  }
  if (searchInput.value !== state.headers.searchQuery) {
    searchInput.value = state.headers.searchQuery;
  }
}

function getEmptyRulesMessage() {
  const { currentHostname, searchQuery, view } = state.headers;
  if (view === 'all' && searchQuery.trim()) {
    return `
      <div class="empty-state">
        <div class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path fill="currentColor" d="M7 2a5 5 0 1 0 3.16 8.87l2.98 2.98 1.06-1.06-2.98-2.98A5 5 0 0 0 7 2Zm-3.5 5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0Z"/></svg></div>
        <p class="empty-state-title">No matching rules</p>
        <p>Try a different host or header.</p>
        <button class="secondary-btn empty-state-action" type="button" data-rule-action="clear-search">Clear search</button>
      </div>
    `;
  }

  if (view === 'current' && currentHostname) {
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
      <div class="empty-state-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path fill="currentColor" d="M7.25 2.5h1.5v4.75h4.75v1.5H8.75v4.75h-1.5V8.75H2.5v-1.5h4.75V2.5Z"/></svg></div>
      <p class="empty-state-title">No header rules yet</p>
      <p>Add your first exact-host rule.</p>
      <button class="primary-btn empty-state-action" type="button" data-rule-action="open-composer">Add header rule</button>
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

async function saveEditedRule(id) {
  const statusId = `ruleEditStatus-${id}`;
  const currentRule = state.headers.rules.find((rule) => rule.id === id);
  if (!currentRule) {
    state.headers.editingId = null;
    renderRules();
    showStatus('headerStatus', 'That rule no longer exists.', 'error');
    return;
  }

  const validation = validateRuleDraft(readEditDraft(id), state.headers.rules, {
    excludeId: id,
    enabled: currentRule.enabled,
    activation: getActivation(),
    profileId: currentRule.profileId
  });
  if (!validation.ok) {
    showStatus(statusId, validation.error, 'error');
    return;
  }

  const updatedRules = state.headers.rules.map((rule) => (
    rule.id === id ? { ...rule, ...validation.rule } : rule
  ));
  const updatedRule = updatedRules.find((rule) => rule.id === id);

  try {
    if (updatedRule.enabled) {
      await ensureRulePermission(updatedRule);
    }
    state.headers.editingId = null;
    state.headers.revealedRuleIds.delete(id);
    await persistRules(updatedRules);
    if (currentRule.domain !== updatedRule.domain) {
      await releaseUnusedPermission(currentRule, updatedRules);
    }
    showStatus('headerStatus', 'Header rule updated.', 'success');
  } catch (error) {
    state.headers.editingId = id;
    console.error(error);
    showStatus(statusId, error.message || 'Could not update that rule.', 'error');
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

async function persistRules(rules) {
  state.headers.rules = await commitRules(rules);
  renderRules();
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
  document.getElementById('domain').value = state.headers.view === 'current'
    ? state.headers.currentHostname
    : '';
  document.getElementById('headerName').value = '';
  document.getElementById('headerValue').value = '';
}

function focusEditDomain(id) {
  const domainInput = document.getElementById(`editDomain-${id}`);
  domainInput?.focus();
  domainInput?.select();
}
