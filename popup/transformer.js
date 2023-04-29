import {
  createTab,
  createWindow,
  getAllWindows,
  isAllowedIncognitoAccess
} from '../shared/chrome-api.js';
import { buildTransformedUrl } from '../shared/transformer.js';
import { isHttpUrl } from '../shared/urls.js';
import { state } from './state.js';
import { copyToClipboard, showStatus } from './ui.js';

export function bindTransformerEvents() {
  document.getElementById('transformUrlBtn').addEventListener('click', transformUrl);
  document.getElementById('copyUrlBtn').addEventListener('click', copyTransformedUrl);
  document.getElementById('openUrlBtn').addEventListener('click', openTransformedUrl);
  document.querySelector('.transformer-option-list').addEventListener('click', handleTransformOptionClick);
  document.getElementById('sourceUrl').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      transformUrl();
    }
  });
}

export function initializeTransformer(activeTab) {
  const sourceUrl = activeTab?.url && isHttpUrl(activeTab.url) ? activeTab.url : '';
  if (sourceUrl && !document.getElementById('sourceUrl').value.trim()) {
    document.getElementById('sourceUrl').value = sourceUrl;
  }
  renderTransformerOptions();
}

function transformUrl() {
  const sourceValue = document.getElementById('sourceUrl').value.trim();
  const authToken = document.getElementById('authToken').value.trim();
  const { authRedirect, disableCustomCode } = state.transformer.options;

  if (!sourceValue) {
    clearTransformerResult();
    showStatus('transformerStatus', 'Source URL is required.', 'error');
    return;
  }

  if (!authRedirect && !disableCustomCode) {
    clearTransformerResult();
    showStatus('transformerStatus', 'Select at least one transform option.', 'error');
    return;
  }

  if (authRedirect && !authToken) {
    clearTransformerResult();
    showStatus('transformerStatus', 'Auth token is required for an auth redirect.', 'error');
    return;
  }

  try {
    state.transformer.result = buildTransformedUrl(sourceValue, {
      authRedirect,
      authToken,
      queryPresets: disableCustomCode ? ['disableCustomCode'] : []
    });
    setTransformerOutput(state.transformer.result.displayUrl);
    toggleTransformerActions(true);
    showStatus('transformerStatus', getTransformSuccessMessage(), 'success');
  } catch (error) {
    console.error(error);
    clearTransformerResult();
    showStatus('transformerStatus', 'Enter a valid URL or hostname/path combination.', 'error');
  }
}

function handleTransformOptionClick(event) {
  const button = event.target.closest('[data-transform-option]');
  if (!button) {
    return;
  }

  const optionName = button.dataset.transformOption;
  if (!Object.prototype.hasOwnProperty.call(state.transformer.options, optionName)) {
    return;
  }

  state.transformer.options[optionName] = !state.transformer.options[optionName];
  clearTransformerResult();
  clearTransformerStatus();
  renderTransformerOptions();
}

function renderTransformerOptions() {
  document.querySelectorAll('[data-transform-option]').forEach((button) => {
    const isActive = Boolean(state.transformer.options[button.dataset.transformOption]);
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-checked', String(isActive));
  });

  const authEnabled = state.transformer.options.authRedirect;
  document.getElementById('authTokenSection').hidden = !authEnabled;
  document.getElementById('tokenLibrarySection').hidden = !authEnabled;
  document.getElementById('transformUrlBtn').disabled = !authEnabled
    && !state.transformer.options.disableCustomCode;
}

function getTransformSuccessMessage() {
  const { authRedirect, disableCustomCode } = state.transformer.options;
  if (authRedirect && disableCustomCode) {
    return 'Auth redirect created with custom code disabled.';
  }

  return authRedirect ? 'Auth redirect URL created.' : 'Custom code disabled in URL.';
}

function clearTransformerStatus() {
  const status = document.getElementById('transformerStatus');
  globalThis.clearTimeout(status._statusTimer);
  status.textContent = '';
  status.className = 'status-msg';
}

function clearTransformerResult() {
  state.transformer.result = null;
  setTransformerOutput('');
  toggleTransformerActions(false);
}

async function copyTransformedUrl() {
  if (!state.transformer.result) {
    return;
  }

  try {
    await copyToClipboard(state.transformer.result.browserUrl);
    showStatus('transformerStatus', 'Transformed URL copied.', 'success');
  } catch (error) {
    console.error(error);
    showStatus('transformerStatus', 'Clipboard access failed.', 'error');
  }
}

async function openTransformedUrl() {
  if (!state.transformer.result) {
    return;
  }

  try {
    if (!await isAllowedIncognitoAccess()) {
      showStatus('transformerStatus', 'Enable Allow in Incognito for this extension to open URLs there.', 'error');
      return;
    }

    const existingIncognitoWindow = await getExistingIncognitoWindow();
    if (existingIncognitoWindow?.id) {
      await createTab({
        windowId: existingIncognitoWindow.id,
        url: state.transformer.result.browserUrl,
        active: true
      });
    } else {
      await createWindow({
        url: state.transformer.result.browserUrl,
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

async function getExistingIncognitoWindow() {
  const windows = await getAllWindows({ populate: false, windowTypes: ['normal'] });
  return windows.find((windowInfo) => windowInfo?.incognito) || null;
}

function setTransformerOutput(value) {
  const outputValue = String(value || '');
  document.getElementById('transformedUrl').value = outputValue;
  document.getElementById('transformedUrlField').hidden = !outputValue;
}

function toggleTransformerActions(enabled) {
  document.getElementById('copyUrlBtn').disabled = !enabled;
  document.getElementById('openUrlBtn').disabled = !enabled;
}
