const RULE_STORAGE_KEY = 'headerRules';
const TOKEN_STORAGE_KEY = 'transformerAuthToken';
const TOKEN_LIBRARY_STORAGE_KEY = 'transformerTokenLibrary';

const EYE_ICON_SVG = '<svg class="eye-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Zm6.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0-1.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>';
const EYE_OFF_ICON_SVG = '<svg class="eye-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Zm6.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0-1.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/><rect fill="currentColor" x="7.3" y="1.5" width="1.4" height="13" rx="0.7" transform="rotate(40 8 8)"/></svg>';

const RESOURCE_SCOPE_MAP = {
  all: [
    'main_frame',
    'sub_frame',
    'stylesheet',
    'script',
    'image',
    'font',
    'object',
    'xmlhttprequest',
    'ping',
    'csp_report',
    'media',
    'websocket',
    'other'
  ],
  pages: ['main_frame', 'sub_frame'],
  api: ['xmlhttprequest', 'script', 'stylesheet', 'image', 'font', 'media', 'websocket', 'ping', 'other']
};

const SCOPE_LABELS = {
  all: 'All requests',
  pages: 'Pages only',
  api: 'API and assets'
};

let transformerResult = null;
let tokenLibrary = [];

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  setActiveTab('transformer');
  initialize().catch((error) => {
    console.error(error);
    showStatus('headerStatus', 'Could not load header rules.', 'error');
    showStatus('transformerStatus', 'Could not load transformer state.', 'error');
  });
});

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => {
      setActiveTab(button.dataset.tab);
    });
  });

  document.getElementById('addHeaderBtn').addEventListener('click', addRule);
  document.getElementById('useCurrentDomainBtn').addEventListener('click', () => fillCurrentDomain(true));
  document.getElementById('transformUrlBtn').addEventListener('click', transformUrl);
  document.getElementById('copyUrlBtn').addEventListener('click', copyTransformedUrl);
  document.getElementById('openUrlBtn').addEventListener('click', openTransformedUrl);
  document.getElementById('saveTokenBtn').addEventListener('click', saveCurrentToken);
  document.getElementById('toggleTokenVisibility').addEventListener('click', toggleTokenVisibility);

  document.getElementById('headerValue').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      addRule();
    }
  });

  document.getElementById('sourceUrl').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      transformUrl();
    }
  });

  document.getElementById('authToken').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      saveCurrentToken();
    }
  });

  document.getElementById('authToken').addEventListener('input', (event) => {
    const tokenValue = event.target.value;
    renderTokenLibrary(tokenLibrary, tokenValue);
    storageLocalSet({ [TOKEN_STORAGE_KEY]: tokenValue }).catch((error) => {
      console.error(error);
      showStatus('transformerStatus', 'Could not save auth token.', 'error');
    });
  });
}

function setActiveTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    const isActive = panel.dataset.panel === tabName;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });
}

async function initialize() {
  const rules = await getStoredRules();
  renderRules(rules);

  try {
    await syncDynamicRules(rules);
  } catch (error) {
    console.error(error);
    showStatus('headerStatus', 'Saved rules loaded, but Chrome rejected one of them.', 'error');
  }

  const { [TOKEN_STORAGE_KEY]: authToken = '' } = await storageLocalGet({ [TOKEN_STORAGE_KEY]: '' });
  const { [TOKEN_LIBRARY_STORAGE_KEY]: libraryData = [] } = await storageLocalGet({ [TOKEN_LIBRARY_STORAGE_KEY]: [] });
  tokenLibrary = normalizeTokenLibrary(libraryData);
  document.getElementById('authToken').value = authToken;
  renderTokenLibrary(tokenLibrary, authToken);

  await fillCurrentUrl(false, false);
}

function normalizeTokenLibrary(records) {
  const seenTokens = new Set();

  return (Array.isArray(records) ? records : [])
    .map((record) => normalizeTokenRecord(record))
    .filter((record) => {
      if (!record || seenTokens.has(record.token)) {
        return false;
      }

      seenTokens.add(record.token);
      return true;
    });
}

function normalizeTokenRecord(record) {
  const token = String(record?.token || '').trim();
  if (!token) {
    return null;
  }

  return {
    id: String(record?.id || createTokenId()),
    token,
    createdAt: Number(record?.createdAt) || Date.now()
  };
}

function createTokenRecord(token) {
  return {
    id: createTokenId(),
    token: String(token || '').trim(),
    createdAt: Date.now()
  };
}

function createTokenId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `token-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function getStoredRules() {
  const data = await storageLocalGet([RULE_STORAGE_KEY]);
  if (Object.prototype.hasOwnProperty.call(data, RULE_STORAGE_KEY)) {
    return normalizeRules(data[RULE_STORAGE_KEY] || []);
  }

  const legacyData = await storageSyncGet([RULE_STORAGE_KEY]);
  const migratedRules = normalizeRules(legacyData[RULE_STORAGE_KEY] || []);

  if (migratedRules.length) {
    await storageLocalSet({ [RULE_STORAGE_KEY]: migratedRules });
  }

  return migratedRules;
}

function normalizeRules(rules) {
  const usedIds = new Set();
  let nextId = 1;

  return (Array.isArray(rules) ? rules : [])
    .map((rule) => normalizeRule(rule, usedIds, () => nextId++))
    .filter(Boolean);
}

function normalizeRule(rule, usedIds, getNextId) {
  if (!rule) {
    return null;
  }

  const domain = normalizeDomain(rule.domain || '');
  const headerName = String(rule.headerName || '').trim();
  const headerValue = String(rule.headerValue || '').trim();

  if (!domain || !headerName || !headerValue) {
    return null;
  }

  let id = Number(rule.id);
  if (!Number.isInteger(id) || id < 1 || usedIds.has(id)) {
    id = getNextId();
  }

  while (usedIds.has(id)) {
    id = getNextId();
  }
  usedIds.add(id);

  return {
    id,
    domain,
    headerName,
    headerValue,
    requestScope: RESOURCE_SCOPE_MAP[rule.requestScope] ? rule.requestScope : 'all',
    enabled: rule.enabled !== false
  };
}

function renderRules(rules) {
  const container = document.getElementById('ruleListContainer');
  container.innerHTML = '';

  if (!rules.length) {
    container.innerHTML = '<div class="empty-state">No header rules yet. Add one above to start injecting domain-bound headers.</div>';
    return;
  }

  const groupedRules = groupRulesByDomain(rules);

  container.innerHTML = groupedRules.map(({ domain, rules: domainRules }) => {
    const allPaused = domainRules.every((rule) => !rule.enabled);

    return `
      <article class="rule-card${allPaused ? ' paused' : ''}">
        <div class="rule-topline">
          <p class="rule-domain">${escapeHtml(domain)}</p>
          <span class="chip rule-domain-count">${domainRules.length} ${domainRules.length === 1 ? 'rule' : 'rules'}</span>
        </div>
        <div class="domain-rule-list">
          ${domainRules.map((rule) => renderGroupedRuleRow(rule)).join('')}
        </div>
      </article>
    `;
  }).join('');

  container.querySelectorAll('.toggle-rule-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      const id = Number(event.currentTarget.dataset.id);
      await toggleRule(id);
    });
  });

  container.querySelectorAll('.delete-rule-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      const id = Number(event.currentTarget.dataset.id);
      await deleteRule(id);
    });
  });
}

function groupRulesByDomain(rules) {
  const grouped = new Map();

  rules.forEach((rule) => {
    const domainRules = grouped.get(rule.domain) || [];
    domainRules.push(rule);
    grouped.set(rule.domain, domainRules);
  });

  return Array.from(grouped, ([domain, groupedDomainRules]) => ({
    domain,
    rules: groupedDomainRules
  }));
}

function renderGroupedRuleRow(rule) {
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
            <button class="small-btn rule-icon-btn toggle-rule-btn" type="button" data-id="${rule.id}" aria-label="${toggleTitle}" title="${toggleTitle}">${toggleIcon}</button>
            <button class="small-btn rule-icon-btn danger delete-rule-btn" type="button" data-id="${rule.id}" aria-label="Delete rule" title="Delete rule"><svg class="rule-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.25 2.5h3.5l.5 1H13a.75.75 0 0 1 0 1.5h-.6l-.55 7.14A1.5 1.5 0 0 1 10.35 13.5h-4.7a1.5 1.5 0 0 1-1.5-1.36L3.6 5H3a.75.75 0 0 1 0-1.5h2.75l.5-1Zm-.46 2.5.5 6.5h3.42l.5-6.5H5.79Z" fill="currentColor"></path></svg></button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function addRule() {
  const domain = normalizeDomain(document.getElementById('domain').value);
  const headerName = document.getElementById('headerName').value.trim();
  const headerValue = document.getElementById('headerValue').value.trim();
  const requestScope = document.getElementById('requestScope').value;

  if (!domain || !headerName || !headerValue) {
    showStatus('headerStatus', 'Domain, header name, and header value are required.', 'error');
    return;
  }

  if (!isValidHeaderName(headerName)) {
    showStatus('headerStatus', 'Header names must be valid HTTP token values.', 'error');
    return;
  }

  if (/[\r\n]/.test(headerValue)) {
    showStatus('headerStatus', 'Header values cannot contain line breaks.', 'error');
    return;
  }

  const rules = await getStoredRules();
  const duplicateRule = rules.some((rule) => (
    rule.domain === domain
    && rule.headerName.toLowerCase() === headerName.toLowerCase()
    && rule.headerValue === headerValue
    && rule.requestScope === requestScope
  ));

  if (duplicateRule) {
    showStatus('headerStatus', 'That rule already exists.', 'error');
    return;
  }

  const nextId = rules.length ? Math.max(...rules.map((rule) => rule.id)) + 1 : 1;
  const updatedRules = [
    ...rules,
    {
      id: nextId,
      domain,
      headerName,
      headerValue,
      requestScope,
      enabled: true
    }
  ];

  try {
    await syncDynamicRules(updatedRules);
    await storageLocalSet({ [RULE_STORAGE_KEY]: updatedRules });
    renderRules(updatedRules);
    clearHeaderForm();
    showStatus('headerStatus', 'Header rule added.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('headerStatus', error.message || 'Chrome rejected the new rule.', 'error');
  }
}

async function toggleRule(id) {
  const rules = await getStoredRules();
  const updatedRules = rules.map((rule) => (
    rule.id === id
      ? { ...rule, enabled: !rule.enabled }
      : rule
  ));

  try {
    await syncDynamicRules(updatedRules);
    await storageLocalSet({ [RULE_STORAGE_KEY]: updatedRules });
    renderRules(updatedRules);

    const toggledRule = updatedRules.find((rule) => rule.id === id);
    showStatus('headerStatus', toggledRule?.enabled ? 'Rule enabled.' : 'Rule paused.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('headerStatus', error.message || 'Could not toggle that rule.', 'error');
  }
}

async function deleteRule(id) {
  const rules = await getStoredRules();
  const updatedRules = rules.filter((rule) => rule.id !== id);

  try {
    await syncDynamicRules(updatedRules);
    await storageLocalSet({ [RULE_STORAGE_KEY]: updatedRules });
    renderRules(updatedRules);
    showStatus('headerStatus', 'Rule removed.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('headerStatus', error.message || 'Could not remove that rule.', 'error');
  }
}

async function syncDynamicRules(rules) {
  const currentRules = await getDynamicRules();
  const addRules = rules.filter((rule) => rule.enabled).map(buildDynamicRule);

  await updateDynamicRules({
    removeRuleIds: currentRules.map((rule) => rule.id),
    addRules
  });
}

function buildDynamicRule(rule) {
  const condition = {
    resourceTypes: RESOURCE_SCOPE_MAP[rule.requestScope] || RESOURCE_SCOPE_MAP.all,
    regexFilter: String.raw`^https?:\/\/${escapeRegex(rule.domain)}(?::\d+)?(?:[/?#]|$)`
  };

  return {
    id: rule.id,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        {
          header: rule.headerName,
          operation: 'set',
          value: rule.headerValue
        }
      ]
    },
    condition
  };
}

async function fillCurrentDomain(showSuccess = true) {
  try {
    const tab = await getCurrentTab();
    const parsed = parseUserUrl(tab?.url || '');
    document.getElementById('domain').value = parsed.url.hostname;
    if (showSuccess) {
      showStatus('headerStatus', 'Current tab host loaded.', 'success');
    }
  } catch (error) {
    console.error(error);
    showStatus('headerStatus', 'Could not read the current tab host.', 'error');
  }
}

async function fillCurrentUrl(overwriteExisting = true, showSuccess = true) {
  const sourceInput = document.getElementById('sourceUrl');
  if (!overwriteExisting && sourceInput.value.trim()) {
    return;
  }

  try {
    const tab = await getCurrentTab();
    const sourceUrl = tab?.url && isHttpUrl(tab.url) ? tab.url : '';
    if (!sourceUrl) {
      throw new Error('No supported active tab URL');
    }
    sourceInput.value = sourceUrl;
    if (showSuccess) {
      showStatus('transformerStatus', 'Current tab URL loaded.', 'success');
    }
  } catch (error) {
    if (showSuccess) {
      console.error(error);
      showStatus('transformerStatus', 'Could not read the current tab URL.', 'error');
    }
  }
}

function transformUrl() {
  const sourceValue = document.getElementById('sourceUrl').value.trim();
  const authToken = document.getElementById('authToken').value.trim();

  if (!sourceValue || !authToken) {
    showStatus('transformerStatus', 'Source URL and auth token are required.', 'error');
    return;
  }

  try {
    const parsed = parseUserUrl(sourceValue);
    const redirectPath = `${parsed.url.pathname || '/'}${parsed.url.search}${parsed.url.hash}` || '/';
    const authParam = `auth_token=${encodeURIComponent(authToken)}`;
    const redirectParam = `redirect=${encodeRedirectPath(redirectPath || '/')}`;
    const browserUrl = `${parsed.url.origin}/?${authParam}&${redirectParam}`;
    const displayUrl = parsed.hadProtocol ? browserUrl : browserUrl.replace(/^https?:\/\//i, '');

    transformerResult = { browserUrl, displayUrl };
    setTransformerOutput(displayUrl);
    toggleTransformerActions(true);
    showStatus('transformerStatus', 'URL transformed.', 'success');
  } catch (error) {
    console.error(error);
    transformerResult = null;
    setTransformerOutput('');
    toggleTransformerActions(false);
    showStatus('transformerStatus', 'Enter a valid URL or hostname/path combination.', 'error');
  }
}

async function copyTransformedUrl() {
  if (!transformerResult) {
    return;
  }

  try {
    await copyToClipboard(transformerResult.browserUrl);
    showStatus('transformerStatus', 'Transformed URL copied.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('transformerStatus', 'Clipboard access failed.', 'error');
  }
}

async function openTransformedUrl() {
  if (!transformerResult) {
    return;
  }

  try {
    const hasIncognitoAccess = await isAllowedIncognitoAccess();
    if (!hasIncognitoAccess) {
      showStatus('transformerStatus', 'Enable Allow in Incognito for this extension to open URLs there.', 'error');
      return;
    }

    const existingIncognitoWindow = await getExistingIncognitoWindow();
    if (existingIncognitoWindow?.id) {
      await createTab({
        windowId: existingIncognitoWindow.id,
        url: transformerResult.browserUrl,
        active: true
      });
    } else {
      await createWindow({
        url: transformerResult.browserUrl,
        incognito: true,
        focused: true
      });
    }

    showStatus('transformerStatus', 'Opened transformed URL in incognito.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('transformerStatus', 'Could not open the transformed URL in incognito.', 'error');
  }
}

function renderTokenLibrary(tokens, activeToken) {
  const container = document.getElementById('tokenListContainer');
  const count = document.getElementById('tokenLibraryCount');

  if (!container || !count) {
    return;
  }

  const normalizedActiveToken = String(activeToken || '').trim();
  const savedCount = tokens.length;
  const tokenById = new Map(tokens.map((entry) => [entry.id, entry.token]));
  count.textContent = `${savedCount} saved`;

  if (!savedCount) {
    container.innerHTML = '<div class="token-empty">No saved tokens yet. Save one to reuse it quickly.</div>';
    return;
  }

  container.innerHTML = tokens.map((entry, index) => {
    const decoded = decodeJwtToken(entry.token);
    const isActive = entry.token === normalizedActiveToken;
    const datePills = buildTokenDatePills(entry, decoded?.payload);
    const statePill = buildTokenStatePill(decoded?.payload);

    return `
      <div class="token-item${isActive ? ' is-active' : ''}">
        <label class="token-choice">
          <input class="token-radio select-token-radio" type="radio" name="selectedToken" data-id="${escapeHtml(entry.id)}"${isActive ? ' checked' : ''}>
          <span class="token-radio-mark" aria-hidden="true"></span>
          <span class="token-choice-copy">
            <span class="token-choice-title">${escapeHtml(getTokenDisplayTitle(entry.token, decoded?.payload, index))}</span>
            <span class="token-pill-row">
              ${statePill}
              ${datePills}
            </span>
          </span>
        </label>
        <div class="token-actions">
          <button class="small-btn token-copy-btn copy-token-btn" type="button" data-token-id="${escapeHtml(entry.id)}" aria-label="Copy token" title="Copy token">
            <svg class="token-delete-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5.5 2A1.5 1.5 0 0 0 4 3.5v7A1.5 1.5 0 0 0 5.5 12h5A1.5 1.5 0 0 0 12 10.5v-7A1.5 1.5 0 0 0 10.5 2h-5ZM3 3.5A2.5 2.5 0 0 1 5.5 1h5A2.5 2.5 0 0 1 13 3.5v7a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 3 10.5v-7Z"/><path fill="currentColor" d="M1 5.5A2.5 2.5 0 0 1 3.5 3H4v1h-.5A1.5 1.5 0 0 0 2 5.5v7A1.5 1.5 0 0 0 3.5 14h5A1.5 1.5 0 0 0 10 12.5V12h1v.5A2.5 2.5 0 0 1 8.5 15h-5A2.5 2.5 0 0 1 1 12.5v-7Z"/></svg>
          </button>
          <button class="small-btn token-delete-btn delete-token-btn" type="button" data-id="${escapeHtml(entry.id)}" aria-label="Delete saved token" title="Delete saved token">
            <svg class="token-delete-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.25 2.5h3.5l.5 1H13a.75.75 0 0 1 0 1.5h-.6l-.55 7.14A1.5 1.5 0 0 1 10.35 13.5h-4.7a1.5 1.5 0 0 1-1.5-1.36L3.6 5H3a.75.75 0 0 1 0-1.5h2.75l.5-1Zm-.46 2.5.5 6.5h3.42l.5-6.5H5.79Z" fill="currentColor"></path></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.copy-token-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      const tokenId = event.currentTarget.dataset.tokenId;
      const tokenValue = tokenById.get(tokenId);
      if (!tokenValue) {
        console.error('Could not find saved token for copy.', {
          tokenId,
          knownTokenIds: Array.from(tokenById.keys())
        });
        showStatus('transformerStatus', 'Could not find the saved token to copy.', 'error');
        return;
      }

      try {
        await copyToClipboard(tokenValue);
        const btn = event.target;
        btn.classList.add('is-copied');
        globalThis.setTimeout(() => btn.classList.remove('is-copied'), 1800);
        showStatus('transformerStatus', 'Token copied to clipboard.', 'success');
      } catch (error) {
        console.error(`Copy token failed for ${tokenId} ${error.message}`);
        showStatus('transformerStatus', 'Clipboard access failed.', 'error');
      }
    });
  });

  container.querySelectorAll('.select-token-radio').forEach((input) => {
    input.addEventListener('change', async (event) => {
      const selectedId = event.currentTarget.dataset.id;
      await selectStoredToken(selectedId);
    });
  });

  container.querySelectorAll('.delete-token-btn').forEach((button) => {
    button.addEventListener('click', async (event) => {
      const tokenId = event.currentTarget.dataset.id;
      await deleteStoredToken(tokenId);
    });
  });
}

async function saveCurrentToken() {
  const tokenInput = document.getElementById('authToken');
  const tokenValue = String(tokenInput?.value || '').trim();

  if (!tokenValue) {
    showStatus('transformerStatus', 'Enter a token before saving it.', 'error');
    return;
  }

  const existingRecord = tokenLibrary.find((entry) => entry.token === tokenValue);
  if (existingRecord) {
    await selectStoredToken(existingRecord.id, 'Token already saved. Selected it.');
    return;
  }

  tokenLibrary = [createTokenRecord(tokenValue), ...tokenLibrary];
  renderTokenLibrary(tokenLibrary, tokenValue);

  try {
    await storageLocalSet({
      [TOKEN_STORAGE_KEY]: tokenValue,
      [TOKEN_LIBRARY_STORAGE_KEY]: tokenLibrary
    });
    showStatus('transformerStatus', 'Token saved and selected.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('transformerStatus', 'Could not save the token library.', 'error');
  }
}

async function selectStoredToken(tokenId, successMessage = 'Saved token selected.') {
  const selectedRecord = tokenLibrary.find((entry) => entry.id === tokenId);
  if (!selectedRecord) {
    return;
  }

  document.getElementById('authToken').value = selectedRecord.token;
  renderTokenLibrary(tokenLibrary, selectedRecord.token);

  try {
    await storageLocalSet({ [TOKEN_STORAGE_KEY]: selectedRecord.token });
    showStatus('transformerStatus', successMessage, 'success');
  } catch (error) {
    console.error(error);
    showStatus('transformerStatus', 'Could not select the saved token.', 'error');
  }
}

async function deleteStoredToken(tokenId) {
  const recordToDelete = tokenLibrary.find((entry) => entry.id === tokenId);
  if (!recordToDelete) {
    return;
  }

  tokenLibrary = tokenLibrary.filter((entry) => entry.id !== tokenId);

  const tokenInput = document.getElementById('authToken');
  const currentToken = String(tokenInput?.value || '').trim();
  const nextToken = recordToDelete.token === currentToken ? (tokenLibrary[0]?.token || '') : currentToken;

  if (tokenInput) {
    tokenInput.value = nextToken;
  }

  renderTokenLibrary(tokenLibrary, nextToken);

  try {
    await storageLocalSet({
      [TOKEN_STORAGE_KEY]: nextToken,
      [TOKEN_LIBRARY_STORAGE_KEY]: tokenLibrary
    });
    showStatus('transformerStatus', 'Saved token removed.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('transformerStatus', 'Could not remove the saved token.', 'error');
  }
}

function buildTokenDatePills(entry, payload) {
  const pills = [];

  if (payload) {
    const issuedLabel = formatJwtTimeShort(payload.iat) || 'Unknown';
    pills.push(`
      <span class="token-date-pill">
        <strong>Issued</strong>${escapeHtml(issuedLabel)}
      </span>
    `);

    const expiryLabel = formatJwtTimeShort(payload.exp) || 'None';
    pills.push(`
      <span class="token-date-pill${isJwtExpired(payload) ? ' expired' : ''}">
        <strong>Expires</strong>${escapeHtml(expiryLabel)}
      </span>
    `);
  }

  return pills.join('');
}

function buildTokenStatePill(payload) {
  if (!payload) {
    return '<span class="token-meta-pill invalid">Not a JWT</span>';
  }

  if (isJwtExpired(payload)) {
    return '<span class="token-meta-pill invalid">Expired JWT</span>';
  }

  const warning = getJwtExpiryWarning(payload);
  if (warning) {
    return `<span class="token-meta-pill warning">${escapeHtml(warning)}</span>`;
  }

  return '';
}

function getJwtExpiryWarning(payload) {
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp)) return null;

  const deltaMs = exp * 1000 - Date.now();
  if (deltaMs <= 0) return null;

  const hourMs = 60 * 60 * 1000;
  if (deltaMs > 24 * hourMs) return null;

  if (deltaMs < hourMs) {
    return `Expires in ${Math.max(1, Math.floor(deltaMs / 60000))}m`;
  }

  return `Expires in ${Math.floor(deltaMs / hourMs)}h`;
}

function decodeJwtToken(tokenValue) {
  const parts = String(tokenValue || '').split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));

    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') {
      return null;
    }

    return { header, payload };
  } catch {
    return null;
  }
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = globalThis.atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.codePointAt(0) || 0);
  return typeof TextDecoder === 'function' ? new TextDecoder().decode(bytes) : binary;
}

function getJwtEmail(payload) {
  const candidates = [payload?.email, payload?.upn, payload?.preferred_username, payload?.unique_name];
  return candidates.find((value) => typeof value === 'string' && value.trim()) || '';
}

function getTokenDisplayTitle(tokenValue, payload, index) {
  const email = getJwtEmail(payload);
  if (email) {
    return email;
  }

  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  if (name) {
    return name;
  }

  return `Token ${index + 1} • ${getTokenFingerprint(tokenValue)}`;
}

function getTokenFingerprint(tokenValue) {
  const normalized = String(tokenValue || '').trim();
  if (!normalized) {
    return 'empty';
  }

  return normalized.length <= 8 ? normalized : `...${normalized.slice(-8)}`;
}

function formatJwtTimeShort(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) {
    return '';
  }

  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function isJwtExpired(payload) {
  const exp = Number(payload?.exp);
  return Number.isFinite(exp) ? exp * 1000 <= Date.now() : false;
}

function setTransformerOutput(value) {
  document.getElementById('transformedUrl').value = value;
}

function toggleTransformerActions(enabled) {
  document.getElementById('copyUrlBtn').disabled = !enabled;
  document.getElementById('openUrlBtn').disabled = !enabled;
}

function clearHeaderForm() {
  document.getElementById('domain').value = '';
  document.getElementById('headerName').value = '';
  document.getElementById('headerValue').value = '';
  document.getElementById('requestScope').value = 'all';
}

function normalizeDomain(value) {
  if (!value) {
    return '';
  }

  const cleanedValue = String(value).trim();
  if (!cleanedValue) {
    return '';
  }

  const hadProtocol = /^https?:\/\//i.test(cleanedValue);
  const candidate = hadProtocol ? cleanedValue : `https://${cleanedValue.replace(/^\/+/, '')}`;

  if (!URL.canParse(candidate)) {
    return '';
  }

  const parsed = new URL(candidate);
  return parsed.hostname && isHttpUrl(parsed.href) ? parsed.hostname.toLowerCase() : '';
}

function parseUserUrl(value) {
  const input = String(value || '').trim();
  if (!input) {
    throw new Error('Missing URL');
  }

  const hadProtocol = /^https?:\/\//i.test(input);
  const candidate = hadProtocol ? input : `https://${input.replace(/^\/+/, '')}`;
  if (!URL.canParse(candidate)) {
    throw new Error('Unsupported URL');
  }

  const parsed = new URL(candidate);

  if (!parsed.hostname || !isHttpUrl(parsed.href)) {
    throw new Error('Unsupported URL');
  }

  return { url: parsed, hadProtocol };
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function isValidHeaderName(value) {
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value);
}

function encodeRedirectPath(value) {
  return encodeURIComponent(value).replace(/%2F/g, '/');
}

function escapeRegex(value) {
  return String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function showStatus(elementId, message, type) {
  const element = document.getElementById(elementId);
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className = `status-msg visible ${type}`;
  globalThis.clearTimeout(element._statusTimer);
  element._statusTimer = globalThis.setTimeout(() => {
    element.className = 'status-msg';
  }, 2800);
}

function toggleTokenVisibility() {
  const input = document.getElementById('authToken');
  const btn = document.getElementById('toggleTokenVisibility');
  if (!input || !btn) return;

  const willReveal = input.type === 'password';
  input.type = willReveal ? 'text' : 'password';
  btn.setAttribute('aria-label', willReveal ? 'Hide token' : 'Show token');
  btn.setAttribute('title', willReveal ? 'Hide token' : 'Show token');
  btn.innerHTML = willReveal ? EYE_OFF_ICON_SVG : EYE_ICON_SVG;
}

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      console.error('navigator.clipboard.writeText failed. Falling back to execCommand.', error);
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();

    const didCopy = document.execCommand('copy');
    if (!didCopy) {
      throw new Error('document.execCommand("copy") returned false.');
    }
  } finally {
    textarea.remove();
  }
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function storageLocalGet(query) {
  return new Promise((resolve) => {
    chrome.storage.local.get(query, (result) => {
      resolve(result || {});
    });
  });
}

function storageSyncGet(query) {
  return new Promise((resolve) => {
    chrome.storage.sync.get(query, (result) => {
      resolve(result || {});
    });
  });
}

function storageLocalSet(value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(value, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function getDynamicRules() {
  return new Promise((resolve, reject) => {
    chrome.declarativeNetRequest.getDynamicRules((rules) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(rules || []);
    });
  });
}

function updateDynamicRules(details) {
  return new Promise((resolve, reject) => {
    chrome.declarativeNetRequest.updateDynamicRules(details, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

function getCurrentTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tabs?.[0] || null);
    });
  });
}

function isAllowedIncognitoAccess() {
  return new Promise((resolve, reject) => {
    chrome.extension.isAllowedIncognitoAccess((isAllowed) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(Boolean(isAllowed));
    });
  });
}

function getAllWindows(query) {
  const resolvedQuery = query || { populate: false };

  return new Promise((resolve, reject) => {
    chrome.windows.getAll(resolvedQuery, (windows) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(Array.isArray(windows) ? windows : []);
    });
  });
}

async function getExistingIncognitoWindow() {
  const windows = await getAllWindows({ populate: false, windowTypes: ['normal'] });
  return windows.find((windowInfo) => windowInfo?.incognito) || null;
}

function createTab(details) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(details, (tab) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tab || null);
    });
  });
}

function createWindow(details) {
  return new Promise((resolve, reject) => {
    chrome.windows.create(details, (windowInfo) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(windowInfo || null);
    });
  });
}
