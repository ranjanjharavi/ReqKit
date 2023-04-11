import { storageLocalGet, storageLocalSet } from '../shared/chrome-api.js';
import { state } from './state.js';
import { copyToClipboard, escapeHtml, showStatus } from './ui.js';

const TOKEN_STORAGE_KEY = 'transformerAuthToken';
const TOKEN_LIBRARY_STORAGE_KEY = 'transformerTokenLibrary';

const EYE_ICON_SVG = '<svg class="eye-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Zm6.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0-1.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>';
const EYE_OFF_ICON_SVG = '<svg class="eye-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Zm6.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0-1.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/><rect fill="currentColor" x="7.3" y="1.5" width="1.4" height="13" rx="0.7" transform="rotate(40 8 8)"/></svg>';

export function bindTokenEvents() {
  document.getElementById('saveTokenBtn').addEventListener('click', saveCurrentToken);
  document.getElementById('toggleTokenVisibility').addEventListener('click', toggleTokenVisibility);

  const tokenInput = document.getElementById('authToken');
  tokenInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      saveCurrentToken();
    }
  });
  tokenInput.addEventListener('input', handleTokenInput);

  const tokenList = document.getElementById('tokenListContainer');
  tokenList.addEventListener('click', handleTokenListClick);
  tokenList.addEventListener('change', handleTokenListChange);
}

export async function initializeTokens() {
  const stored = await storageLocalGet({
    [TOKEN_STORAGE_KEY]: '',
    [TOKEN_LIBRARY_STORAGE_KEY]: []
  });

  state.tokens.items = normalizeTokenLibrary(stored[TOKEN_LIBRARY_STORAGE_KEY]);
  state.tokens.activeToken = String(stored[TOKEN_STORAGE_KEY] || '');
  document.getElementById('authToken').value = state.tokens.activeToken;
  renderTokenLibrary();
}

async function handleTokenInput(event) {
  state.tokens.activeToken = event.target.value;
  renderTokenLibrary();

  try {
    await storageLocalSet({ [TOKEN_STORAGE_KEY]: state.tokens.activeToken });
  } catch (error) {
    console.error(error);
    showStatus('transformerStatus', 'Could not save auth token.', 'error');
  }
}

async function handleTokenListClick(event) {
  const button = event.target.closest('[data-token-action]');
  if (!button) {
    return;
  }

  const tokenId = button.dataset.id;
  if (button.dataset.tokenAction === 'copy') {
    await copyStoredToken(tokenId, button);
  } else if (button.dataset.tokenAction === 'delete') {
    await deleteStoredToken(tokenId);
  }
}

async function handleTokenListChange(event) {
  const input = event.target.closest('[data-token-action="select"]');
  if (input?.checked) {
    await selectStoredToken(input.dataset.id);
  }
}

function renderTokenLibrary() {
  const container = document.getElementById('tokenListContainer');
  const count = document.getElementById('tokenLibraryCount');
  const normalizedActiveToken = state.tokens.activeToken.trim();

  count.textContent = `${state.tokens.items.length} saved`;
  if (!state.tokens.items.length) {
    container.innerHTML = '<div class="token-empty">No saved tokens yet. Save one to reuse it quickly.</div>';
    return;
  }

  container.innerHTML = state.tokens.items.map((entry, index) => {
    const decoded = decodeJwtToken(entry.token);
    const isActive = entry.token === normalizedActiveToken;

    return `
      <div class="token-item${isActive ? ' is-active' : ''}">
        <label class="token-choice">
          <input class="token-radio select-token-radio" type="radio" name="selectedToken" data-token-action="select" data-id="${escapeHtml(entry.id)}"${isActive ? ' checked' : ''}>
          <span class="token-radio-mark" aria-hidden="true"></span>
          <span class="token-choice-copy">
            <span class="token-choice-title">${escapeHtml(getTokenDisplayTitle(entry.token, decoded?.payload, index))}</span>
            <span class="token-pill-row">
              ${buildTokenStatePill(decoded?.payload)}
              ${buildTokenDatePills(decoded?.payload)}
            </span>
          </span>
        </label>
        <div class="token-actions">
          <button class="small-btn token-copy-btn" type="button" data-token-action="copy" data-id="${escapeHtml(entry.id)}" aria-label="Copy token" title="Copy token">
            <svg class="token-delete-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5.5 2A1.5 1.5 0 0 0 4 3.5v7A1.5 1.5 0 0 0 5.5 12h5A1.5 1.5 0 0 0 12 10.5v-7A1.5 1.5 0 0 0 10.5 2h-5ZM3 3.5A2.5 2.5 0 0 1 5.5 1h5A2.5 2.5 0 0 1 13 3.5v7a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 3 10.5v-7Z"/><path fill="currentColor" d="M1 5.5A2.5 2.5 0 0 1 3.5 3H4v1h-.5A1.5 1.5 0 0 0 2 5.5v7A1.5 1.5 0 0 0 3.5 14h5A1.5 1.5 0 0 0 10 12.5V12h1v.5A2.5 2.5 0 0 1 8.5 15h-5A2.5 2.5 0 0 1 1 12.5v-7Z"/></svg>
          </button>
          <button class="small-btn token-delete-btn" type="button" data-token-action="delete" data-id="${escapeHtml(entry.id)}" aria-label="Delete saved token" title="Delete saved token">
            <svg class="token-delete-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.25 2.5h3.5l.5 1H13a.75.75 0 0 1 0 1.5h-.6l-.55 7.14A1.5 1.5 0 0 1 10.35 13.5h-4.7a1.5 1.5 0 0 1-1.5-1.36L3.6 5H3a.75.75 0 0 1 0-1.5h2.75l.5-1Zm-.46 2.5.5 6.5h3.42l.5-6.5H5.79Z" fill="currentColor"></path></svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

async function saveCurrentToken() {
  const tokenValue = document.getElementById('authToken').value.trim();
  if (!tokenValue) {
    showStatus('transformerStatus', 'Enter a token before saving it.', 'error');
    return;
  }

  const existingRecord = state.tokens.items.find((entry) => entry.token === tokenValue);
  if (existingRecord) {
    await selectStoredToken(existingRecord.id, 'Token already saved. Selected it.');
    return;
  }

  const nextItems = [createTokenRecord(tokenValue), ...state.tokens.items];
  try {
    await storageLocalSet({
      [TOKEN_STORAGE_KEY]: tokenValue,
      [TOKEN_LIBRARY_STORAGE_KEY]: nextItems
    });
    state.tokens.items = nextItems;
    setActiveToken(tokenValue);
    showStatus('transformerStatus', 'Token saved and selected.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('transformerStatus', 'Could not save the token library.', 'error');
  }
}

async function selectStoredToken(tokenId, successMessage = 'Saved token selected.') {
  const selectedRecord = state.tokens.items.find((entry) => entry.id === tokenId);
  if (!selectedRecord) {
    return;
  }

  try {
    await storageLocalSet({ [TOKEN_STORAGE_KEY]: selectedRecord.token });
    setActiveToken(selectedRecord.token);
    showStatus('transformerStatus', successMessage, 'success');
  } catch (error) {
    console.error(error);
    showStatus('transformerStatus', 'Could not select the saved token.', 'error');
  }
}

async function deleteStoredToken(tokenId) {
  const recordToDelete = state.tokens.items.find((entry) => entry.id === tokenId);
  if (!recordToDelete) {
    return;
  }

  const nextItems = state.tokens.items.filter((entry) => entry.id !== tokenId);
  const nextToken = recordToDelete.token === state.tokens.activeToken.trim()
    ? (nextItems[0]?.token || '')
    : state.tokens.activeToken;

  try {
    await storageLocalSet({
      [TOKEN_STORAGE_KEY]: nextToken,
      [TOKEN_LIBRARY_STORAGE_KEY]: nextItems
    });
    state.tokens.items = nextItems;
    setActiveToken(nextToken);
    showStatus('transformerStatus', 'Saved token removed.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('transformerStatus', 'Could not remove the saved token.', 'error');
  }
}

async function copyStoredToken(tokenId, button) {
  const record = state.tokens.items.find((entry) => entry.id === tokenId);
  if (!record) {
    showStatus('transformerStatus', 'Could not find the saved token to copy.', 'error');
    return;
  }

  try {
    await copyToClipboard(record.token);
    button.classList.add('is-copied');
    globalThis.setTimeout(() => button.classList.remove('is-copied'), 1800);
    showStatus('transformerStatus', 'Token copied to clipboard.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('transformerStatus', 'Clipboard access failed.', 'error');
  }
}

function setActiveToken(token) {
  state.tokens.activeToken = token;
  document.getElementById('authToken').value = token;
  renderTokenLibrary();
}

function normalizeTokenLibrary(records) {
  const seenTokens = new Set();
  return (Array.isArray(records) ? records : [])
    .map(normalizeTokenRecord)
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

function buildTokenDatePills(payload) {
  if (!payload) {
    return '';
  }

  const issuedLabel = formatJwtTimeShort(payload.iat) || 'Unknown';
  const expiryLabel = formatJwtTimeShort(payload.exp) || 'None';
  return `
    <span class="token-date-pill">
      <strong>Issued</strong>${escapeHtml(issuedLabel)}
    </span>
    <span class="token-date-pill${isJwtExpired(payload) ? ' expired' : ''}">
      <strong>Expires</strong>${escapeHtml(expiryLabel)}
    </span>
  `;
}

function buildTokenStatePill(payload) {
  if (!payload) {
    return '<span class="token-meta-pill invalid">Not a JWT</span>';
  }
  if (isJwtExpired(payload)) {
    return '<span class="token-meta-pill invalid">Expired JWT</span>';
  }

  const warning = getJwtExpiryWarning(payload);
  return warning
    ? `<span class="token-meta-pill warning">${escapeHtml(warning)}</span>`
    : '';
}

function getJwtExpiryWarning(payload) {
  const exp = Number(payload?.exp);
  if (!Number.isFinite(exp)) {
    return null;
  }

  const deltaMs = exp * 1000 - Date.now();
  const hourMs = 60 * 60 * 1000;
  if (deltaMs <= 0 || deltaMs > 24 * hourMs) {
    return null;
  }

  return deltaMs < hourMs
    ? `Expires in ${Math.max(1, Math.floor(deltaMs / 60000))}m`
    : `Expires in ${Math.floor(deltaMs / hourMs)}h`;
}

function decodeJwtToken(tokenValue) {
  const parts = String(tokenValue || '').split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecode(parts[0]));
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    return header && typeof header === 'object' && payload && typeof payload === 'object'
      ? { header, payload }
      : null;
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

function getTokenDisplayTitle(tokenValue, payload, index) {
  const candidates = [payload?.email, payload?.upn, payload?.preferred_username, payload?.unique_name];
  const email = candidates.find((value) => typeof value === 'string' && value.trim());
  if (email) {
    return email;
  }

  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  return name || `Token ${index + 1} • ${getTokenFingerprint(tokenValue)}`;
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

  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function isJwtExpired(payload) {
  const exp = Number(payload?.exp);
  return Number.isFinite(exp) ? exp * 1000 <= Date.now() : false;
}

function toggleTokenVisibility() {
  const tokenInput = document.getElementById('authToken');
  const button = document.getElementById('toggleTokenVisibility');
  const isHidden = tokenInput.type === 'password';
  tokenInput.type = isHidden ? 'text' : 'password';
  button.innerHTML = isHidden ? EYE_OFF_ICON_SVG : EYE_ICON_SVG;
  button.setAttribute('aria-label', isHidden ? 'Hide token' : 'Show token');
  button.title = isHidden ? 'Hide token' : 'Show token';
}
