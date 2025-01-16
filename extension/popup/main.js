import { getCurrentTab } from '../shared/chrome-api.js';
import { bindHeaderEvents, initializeHeaders } from './headers/controller.js';
import { requirePrivacyConsent } from './privacy.js';
import { bindTabEvents, setActiveTab } from './tabs.js';
import { bindTransformerEvents, initializeTransformer } from './transformer/controller.js';
import { showStatus } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  start().catch((error) => {
    console.error('Could not start the popup.', error);
    const status = document.getElementById('privacyConsentStatus');
    status.textContent = 'ReqKit could not start. Close the popup and try again.';
  });
});

async function start() {
  await requirePrivacyConsent();
  bindTabEvents();
  bindHeaderEvents();
  bindTransformerEvents();
  setActiveTab('transformer');

  await initialize().catch((error) => {
    console.error('Could not initialize the popup.', error);
    showStatus('headerStatus', 'Could not load header rules.', 'error');
    showStatus('transformerStatus', 'Could not load transformer state.', 'error');
  });
}

async function initialize() {
  let activeTab = null;
  try {
    activeTab = await getCurrentTab();
  } catch (error) {
    console.error('Could not read the current tab.', error);
  }

  const [headersResult, transformerResult] = await Promise.allSettled([
    initializeHeaders(activeTab),
    initializeTransformer(activeTab)
  ]);

  if (headersResult.status === 'rejected') {
    console.error('Could not initialize header rules.', headersResult.reason);
    showStatus('headerStatus', 'Could not load header rules.', 'error');
  }

  if (transformerResult.status === 'rejected') {
    console.error('Could not initialize the URL recipe.', transformerResult.reason);
    showStatus('transformerStatus', 'Could not load the URL recipe.', 'error');
  }
}
