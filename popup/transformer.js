import {
  createTab,
  createWindow,
  getAllWindows,
  isAllowedIncognitoAccess
} from '../shared/chrome-api.js';
import { buildAuthRedirectUrl } from '../shared/transformer.js';
import { isHttpUrl } from '../shared/urls.js';
import { state } from './state.js';
import { copyToClipboard, showStatus } from './ui.js';

export function bindTransformerEvents() {
  document.getElementById('transformUrlBtn').addEventListener('click', transformUrl);
  document.getElementById('copyUrlBtn').addEventListener('click', copyTransformedUrl);
  document.getElementById('openUrlBtn').addEventListener('click', openTransformedUrl);
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
}

function transformUrl() {
  const sourceValue = document.getElementById('sourceUrl').value.trim();
  const authToken = document.getElementById('authToken').value.trim();

  if (!sourceValue || !authToken) {
    clearTransformerResult();
    showStatus('transformerStatus', 'Source URL and auth token are required.', 'error');
    return;
  }

  try {
    state.transformer.result = buildAuthRedirectUrl(sourceValue, authToken);
    setTransformerOutput(state.transformer.result.displayUrl);
    toggleTransformerActions(true);
    showStatus('transformerStatus', 'URL transformed.', 'success');
  } catch (error) {
    console.error(error);
    clearTransformerResult();
    showStatus('transformerStatus', 'Enter a valid URL or hostname/path combination.', 'error');
  }
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
