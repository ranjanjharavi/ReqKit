import {
  SCOPE_LABELS,
  filterRulesByHost,
  getNextRuleId,
  groupRulesByDomain,
  validateRuleDraft
} from '../shared/rules.js';
import { isHttpUrl, parseUserUrl } from '../shared/urls.js';
import { commitRules, getStoredRules } from './rules-api.js';
import { state } from './state.js';
import { escapeHtml, showStatus } from './ui.js';

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
}

export async function initializeHeaders(activeTab) {
  initializeCurrentSite(activeTab);
  state.headers.rules = await getStoredRules();
  renderRules();
}

function handleRuleListClick(event) {
  const button = event.target.closest('[data-rule-action]');
  if (!button) {
    return;
  }

  const id = Number(button.dataset.id);
  switch (button.dataset.ruleAction) {
    case 'edit':
      state.headers.editingId = id;
      renderRules();
      focusEditDomain(id);
      break;
    case 'toggle':
      toggleRule(id);
      break;
    case 'delete':
      deleteRule(id);
      break;
    case 'cancel-edit':
      state.headers.editingId = null;
      renderRules();
      break;
    default:
      break;
  }
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
  if (!isHttpUrl(tabUrl)) {
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
  updateCurrentSiteControls();

  const visibleRules = view === 'current' && currentHostname
    ? filterRulesByHost(rules, currentHostname)
    : rules;

  if (!visibleRules.length) {
    container.innerHTML = getEmptyRulesMessage();
    return;
  }

  container.innerHTML = groupRulesByDomain(visibleRules).map(({ domain, rules: domainRules }) => {
    const allPaused = domainRules.every((rule) => !rule.enabled);
    const hasEditingRule = domainRules.some((rule) => rule.id === editingId);

    return `
      <article class="rule-card${allPaused && !hasEditingRule ? ' paused' : ''}">
        <div class="rule-topline">
          <div class="rule-domain-heading">
            <p class="rule-domain">${escapeHtml(domain)}</p>
            ${view === 'all' && domain === currentHostname ? '<span class="current-site-badge">Current site</span>' : ''}
          </div>
          <span class="chip rule-domain-count">${domainRules.length} ${domainRules.length === 1 ? 'rule' : 'rules'}</span>
        </div>
        <div class="domain-rule-list">
          ${domainRules.map(renderRuleRow).join('')}
        </div>
      </article>
    `;
  }).join('');
}

function renderRuleRow(rule) {
  if (rule.id === state.headers.editingId) {
    return renderRuleEditForm(rule);
  }

  const toggleTitle = rule.enabled ? 'Pause rule' : 'Enable rule';
  const toggleIcon = rule.enabled
    ? '<svg class="rule-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2.5" width="3.25" height="11" rx="1"></rect><rect x="9.75" y="2.5" width="3.25" height="11" rx="1"></rect></svg>'
    : '<svg class="rule-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.75v10.5c0 .6.65.98 1.18.69l7.88-5.25a.79.79 0 0 0 0-1.38L5.18 2.06A.79.79 0 0 0 4 2.75Z" fill="currentColor"></path></svg>';

  return `
    <div class="domain-rule-row${rule.enabled ? '' : ' is-paused'}">
      <div class="domain-rule-content">
        <div class="rule-header-line">
          <span class="rule-header-name">${escapeHtml(rule.headerName)}</span>
          <span class="rule-header-value">${escapeHtml(rule.headerValue)}</span>
        </div>
        <div class="rule-meta-row">
          <div class="chip-row">
            <span class="chip">${escapeHtml(SCOPE_LABELS[rule.requestScope] || SCOPE_LABELS.all)}</span>
            <span class="status-pill${rule.enabled ? '' : ' is-off'}">${rule.enabled ? 'Active' : 'Paused'}</span>
          </div>
          <div class="rule-actions">
            <button class="small-btn rule-icon-btn" type="button" data-rule-action="edit" data-id="${rule.id}" aria-label="Edit rule" title="Edit rule"><svg class="rule-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="m11.85 1.65 2.5 2.5a1.2 1.2 0 0 1 0 1.7l-7.8 7.8-4.05.85.85-4.05 7.8-7.8a1.2 1.2 0 0 1 1.7 0ZM4.7 11.2l-.35 1.45 1.45-.35 7.45-7.45-2.5-2.5L4.7 11.2Z"/></svg></button>
            <button class="small-btn rule-icon-btn" type="button" data-rule-action="toggle" data-id="${rule.id}" aria-label="${toggleTitle}" title="${toggleTitle}">${toggleIcon}</button>
            <button class="small-btn rule-icon-btn danger" type="button" data-rule-action="delete" data-id="${rule.id}" aria-label="Delete rule" title="Delete rule"><svg class="rule-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.25 2.5h3.5l.5 1H13a.75.75 0 0 1 0 1.5h-.6l-.55 7.14A1.5 1.5 0 0 1 10.35 13.5h-4.7a1.5 1.5 0 0 1-1.5-1.36L3.6 5H3a.75.75 0 0 1 0-1.5h2.75l.5-1Zm-.46 2.5.5 6.5h3.42l.5-6.5H5.79Z" fill="currentColor"></path></svg></button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderRuleEditForm(rule) {
  return `
    <div class="domain-rule-row is-editing">
      <form class="rule-edit-form" data-id="${rule.id}">
        <div class="rule-edit-grid">
          <div class="rule-edit-field rule-edit-domain">
            <label for="editDomain-${rule.id}">Exact host</label>
            <input id="editDomain-${rule.id}" type="text" value="${escapeHtml(rule.domain)}" autocapitalize="off" autocorrect="off" spellcheck="false">
          </div>
          <div class="rule-edit-field">
            <label for="editHeaderName-${rule.id}">Header name</label>
            <input id="editHeaderName-${rule.id}" type="text" value="${escapeHtml(rule.headerName)}" autocapitalize="off" autocorrect="off" spellcheck="false">
          </div>
          <div class="rule-edit-field">
            <label for="editRequestScope-${rule.id}">Request scope</label>
            <select id="editRequestScope-${rule.id}">
              <option value="all"${rule.requestScope === 'all' ? ' selected' : ''}>All requests</option>
              <option value="pages"${rule.requestScope === 'pages' ? ' selected' : ''}>Page navigations only</option>
              <option value="api"${rule.requestScope === 'api' ? ' selected' : ''}>API and asset calls</option>
            </select>
          </div>
          <div class="rule-edit-field rule-edit-value">
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
    : 'Choose an exact host and request scope';
}

function getEmptyRulesMessage() {
  const { rules, currentHostname, view } = state.headers;
  if (view === 'current' && currentHostname) {
    const otherRulesMessage = rules.length
      ? ' Your rules for other hosts are available under All hosts.'
      : '';
    return `<div class="empty-state">No rules for <strong>${escapeHtml(currentHostname)}</strong> yet. Add one above to start injecting headers on this site.${otherRulesMessage}</div>`;
  }

  return '<div class="empty-state">No header rules yet. Add one above to start injecting domain-bound headers.</div>';
}

async function addRule() {
  const validation = validateRuleDraft(readCreateDraft(), state.headers.rules);
  if (!validation.ok) {
    showStatus('headerStatus', validation.error, 'error');
    return false;
  }

  const updatedRules = [
    ...state.headers.rules,
    {
      id: getNextRuleId(state.headers.rules),
      ...validation.rule,
      enabled: true
    }
  ];

  try {
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
  try {
    await persistRules(state.headers.rules.filter((rule) => rule.id !== id));
    showStatus('headerStatus', 'Rule removed.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('headerStatus', error.message || 'Could not remove that rule.', 'error');
  }
}

async function saveEditedRule(id) {
  const statusId = `ruleEditStatus-${id}`;
  const validation = validateRuleDraft(readEditDraft(id), state.headers.rules, { excludeId: id });
  if (!validation.ok) {
    showStatus(statusId, validation.error, 'error');
    return;
  }

  if (!state.headers.rules.some((rule) => rule.id === id)) {
    state.headers.editingId = null;
    renderRules();
    showStatus('headerStatus', 'That rule no longer exists.', 'error');
    return;
  }

  const updatedRules = state.headers.rules.map((rule) => (
    rule.id === id ? { ...rule, ...validation.rule } : rule
  ));

  try {
    state.headers.editingId = null;
    await persistRules(updatedRules);
    showStatus('headerStatus', 'Header rule updated.', 'success');
  } catch (error) {
    state.headers.editingId = id;
    console.error(error);
    showStatus(statusId, error.message || 'Could not update that rule.', 'error');
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
    headerValue: document.getElementById('headerValue').value,
    requestScope: document.getElementById('requestScope').value
  };
}

function readEditDraft(id) {
  return {
    domain: document.getElementById(`editDomain-${id}`).value,
    headerName: document.getElementById(`editHeaderName-${id}`).value,
    headerValue: document.getElementById(`editHeaderValue-${id}`).value,
    requestScope: document.getElementById(`editRequestScope-${id}`).value
  };
}

function clearHeaderForm() {
  document.getElementById('domain').value = state.headers.view === 'current'
    ? state.headers.currentHostname
    : '';
  document.getElementById('headerName').value = '';
  document.getElementById('headerValue').value = '';
  document.getElementById('requestScope').value = 'all';
}

function focusEditDomain(id) {
  const domainInput = document.getElementById(`editDomain-${id}`);
  domainInput?.focus();
  domainInput?.select();
}
