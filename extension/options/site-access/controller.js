import { confirmDestructiveAction } from '../../shared/confirmation-dialog.js';
import { removeOriginPermission } from '../../shared/chrome-api.js';
import { getProfileName } from '../../shared/profiles.js';
import { getRulesForOriginGrant } from '../../shared/site-access.js';
import { createSerialQueue } from '../../shared/serial-queue.js';
import { escapeHtml, showStatus } from '../../shared/ui.js';
import { state } from '../state.js';

const enqueueStateRefresh = createSerialQueue();
const revokingOrigins = new Set();
let refreshState = async () => {};
let renderRules = () => {};

export function bindSiteAccessEvents({ onRefreshState, onRenderRules }) {
  refreshState = onRefreshState;
  renderRules = onRenderRules;

  document.getElementById('siteAccessBtn').addEventListener('click', openSiteAccessDialog);
  document.getElementById('closeSiteAccessBtn').addEventListener('click', closeSiteAccessDialog);
  document.getElementById('doneSiteAccessBtn').addEventListener('click', closeSiteAccessDialog);
  document.getElementById('siteAccessDialog').addEventListener('click', (event) => {
    if (event.target === event.currentTarget) {
      closeSiteAccessDialog();
    }
  });
  document.getElementById('siteAccessList').addEventListener('click', handleSiteAccessListClick);

  chrome.permissions.onAdded.addListener(refreshAfterPermissionChange);
  chrome.permissions.onRemoved.addListener(refreshAfterPermissionChange);
}

export function renderSiteAccessOverview() {
  const dialog = document.getElementById('siteAccessDialog');
  if (!dialog?.open) {
    return;
  }

  const list = document.getElementById('siteAccessList');
  const focusedControl = list.contains(document.activeElement)
    ? {
      action: document.activeElement.dataset.siteAccessAction,
      origin: document.activeElement.dataset.origin
    }
    : null;
  if (!(state.grantedOrigins instanceof Set)) {
    renderLoadError();
    return;
  }

  const origins = [...state.grantedOrigins].sort((left, right) => left.localeCompare(right));
  document.getElementById('siteAccessSummary').textContent = origins.length
    ? `${origins.length} ${origins.length === 1 ? 'permission' : 'permissions'} currently granted.`
    : 'No site permissions are currently granted.';
  list.setAttribute('aria-busy', 'false');

  if (!origins.length) {
    list.innerHTML = `
      <div class="site-access-empty">
        <strong>No sites approved</strong>
        <p>ReqKit asks for host access only when you create or enable a rule.</p>
      </div>
    `;
    restoreListFocus(focusedControl);
    return;
  }

  list.innerHTML = origins.map(renderOriginGrant).join('');
  restoreListFocus(focusedControl);
}

async function openSiteAccessDialog() {
  const dialog = document.getElementById('siteAccessDialog');
  if (!dialog.open) {
    dialog.showModal();
  }

  renderLoading();
  clearSiteAccessStatus();
  try {
    await refreshCurrentState();
    renderSiteAccessOverview();
  } catch (error) {
    console.error('Could not load granted site access.', error);
    renderLoadError();
  }
}

function closeSiteAccessDialog() {
  const dialog = document.getElementById('siteAccessDialog');
  if (dialog.open) {
    dialog.close();
  }
}

function handleSiteAccessListClick(event) {
  const button = event.target.closest('[data-site-access-action]');
  if (!button) {
    return;
  }

  if (button.dataset.siteAccessAction === 'retry') {
    openSiteAccessDialog();
  } else if (button.dataset.siteAccessAction === 'revoke') {
    revokeOrigin(button.dataset.origin, button);
  }
}

async function revokeOrigin(origin, button) {
  if (!(state.grantedOrigins instanceof Set) || !state.grantedOrigins.has(origin)) {
    return;
  }

  const rules = getRulesForOriginGrant(state.rules, origin);
  const confirmed = await confirmDestructiveAction({
    title: `Revoke access to ${getOriginLabel(origin)}?`,
    message: getRevokeMessage(origin, rules.length),
    confirmLabel: 'Revoke access'
  });
  if (!confirmed) {
    return;
  }

  const knownOrigins = new Set(state.grantedOrigins);
  knownOrigins.delete(origin);
  button.disabled = true;
  button.textContent = 'Revoking…';
  revokingOrigins.add(origin);

  try {
    const removed = await removeOriginPermission(origin);
    if (!removed) {
      throw new Error('Chrome did not revoke this site permission.');
    }

    try {
      await refreshCurrentState();
    } catch (error) {
      console.error('Could not refresh rules after revoking site access.', error);
    }

    if (state.grantedOrigins instanceof Set) {
      state.grantedOrigins.delete(origin);
    } else {
      state.grantedOrigins = knownOrigins;
    }
    renderRules();
    showStatus(
      'siteAccessStatus',
      `Access revoked for ${getOriginLabel(origin)}. Saved rules were kept.`,
      'success'
    );
  } catch (error) {
    console.error('Could not revoke site access.', error);
    showStatus('siteAccessStatus', error.message || 'Could not revoke this site permission.', 'error');
  } finally {
    revokingOrigins.delete(origin);
    renderSiteAccessOverview();
    focusAfterRevocation(origin);
  }
}

function restoreListFocus(focusedControl) {
  if (!focusedControl) {
    return;
  }

  const controls = [...document.querySelectorAll('#siteAccessList [data-site-access-action]')];
  const target = controls.find((control) => (
    control.dataset.siteAccessAction === focusedControl.action
      && control.dataset.origin === focusedControl.origin
  )) || controls[0] || document.getElementById('closeSiteAccessBtn');
  target.focus({ preventScroll: true });
}

function focusAfterRevocation(origin) {
  if (!document.getElementById('siteAccessDialog').open) {
    return;
  }

  const controls = [...document.querySelectorAll('#siteAccessList [data-site-access-action="revoke"]')];
  const target = controls.find((control) => control.dataset.origin === origin)
    || controls[0]
    || document.getElementById('closeSiteAccessBtn');
  target.focus({ preventScroll: true });
}

function refreshAfterPermissionChange() {
  refreshCurrentState()
    .then(() => renderSiteAccessOverview())
    .catch((error) => {
      console.error('Could not refresh site permissions.', error);
      if (document.getElementById('siteAccessDialog').open) {
        renderLoadError();
      }
    });
}

function refreshCurrentState() {
  return enqueueStateRefresh(() => refreshState());
}

function renderLoading() {
  document.getElementById('siteAccessSummary').textContent = 'Checking approved host access…';
  const list = document.getElementById('siteAccessList');
  list.setAttribute('aria-busy', 'true');
  list.innerHTML = '<p class="site-access-loading">Loading site permissions…</p>';
}

function clearSiteAccessStatus() {
  const status = document.getElementById('siteAccessStatus');
  status.textContent = '';
  status.classList.remove('visible', 'success', 'error');
  globalThis.clearTimeout(status._statusTimer);
}

function renderLoadError() {
  document.getElementById('siteAccessSummary').textContent = 'Site permissions are unavailable.';
  const list = document.getElementById('siteAccessList');
  const focusedControl = list.contains(document.activeElement)
    ? {
      action: document.activeElement.dataset.siteAccessAction,
      origin: document.activeElement.dataset.origin
    }
    : null;
  list.setAttribute('aria-busy', 'false');
  list.innerHTML = `
    <div class="site-access-empty">
      <strong>Could not read site access</strong>
      <p>Reload the permission list to try again.</p>
      <button class="secondary-btn" type="button" data-site-access-action="retry">Try again</button>
    </div>
  `;
  restoreListFocus(focusedControl);
}

function renderOriginGrant(origin) {
  const isBroad = isBroadOrigin(origin);
  const rules = getRulesForOriginGrant(state.rules, origin);
  const revokeLabel = `Revoke access for ${getOriginLabel(origin)}`;
  const revokeText = revokingOrigins.has(origin) ? 'Revoking…' : 'Revoke access';
  const ruleSummary = `${rules.length} saved ${rules.length === 1 ? 'rule' : 'rules'} covered`;

  return `
    <article class="site-access-row">
      <div class="site-access-row-main">
        <div class="site-access-row-heading">
          <div class="site-access-grant-name">
            <h3>${escapeHtml(getOriginLabel(origin))}</h3>
            <code>${escapeHtml(origin)}</code>
          </div>
          <span class="site-access-kind${isBroad ? ' is-broad' : ''}">${isBroad ? 'Broad grant' : 'Host grant'}</span>
        </div>
        <p class="site-access-rule-count">${ruleSummary}</p>
        ${rules.length
    ? `<ul class="site-access-rule-list">${rules.map(renderCoveredRule).join('')}</ul>`
    : '<p class="site-access-unused">No saved rules match this grant.</p>'}
      </div>
      <button class="secondary-btn site-access-revoke-btn" type="button" data-site-access-action="revoke" data-origin="${escapeHtml(origin)}" aria-label="${escapeHtml(revokeLabel)}"${revokingOrigins.has(origin) ? ' disabled' : ''}>${revokeText}</button>
    </article>
  `;
}

function renderCoveredRule(rule) {
  const requestScope = [
    rule.pathPrefix || 'All paths',
    rule.resourceType === 'xmlhttprequest' ? 'Fetch/XHR' : 'All requests'
  ].join(' · ');
  const ruleState = rule.enabled ? 'Enabled' : 'Paused';

  return `
    <li>
      <div class="site-access-rule-heading">
        <strong>${escapeHtml(rule.headerName)}</strong>
        <span>${escapeHtml(rule.domain)}</span>
      </div>
      <p>${escapeHtml(getProfileName(state.profiles, rule.profileId))} · ${ruleState} · ${escapeHtml(requestScope)}</p>
    </li>
  `;
}

function getOriginLabel(origin) {
  if (origin === '<all_urls>') {
    return 'All websites';
  }
  if (origin === 'https://*/*') {
    return 'All HTTPS sites';
  }

  const match = /^https:\/\/(\*\.)?([^/*]+)\/\*$/.exec(origin);
  return match ? `${match[1] || ''}${match[2]}` : origin;
}

function isBroadOrigin(origin) {
  return origin === 'https://*/*' || origin === '<all_urls>';
}

function getRevokeMessage(origin, ruleCount) {
  const label = getOriginLabel(origin);
  const savedRules = `${ruleCount} saved ${ruleCount === 1 ? 'rule' : 'rules'}`;
  if (isBroadOrigin(origin)) {
    const coverage = ruleCount ? ` It currently covers ${savedRules}.` : '';
    return `Revoking this broad permission removes ReqKit's access pattern.${coverage} Rules will remain saved, and another grant may still cover them.`;
  }
  if (!ruleCount) {
    return `No saved rules match ${label}. Revoking removes ReqKit's permission for this host.`;
  }

  return `${savedRules} match ${label}. They will remain saved but cannot apply without another grant that covers this host.`;
}
