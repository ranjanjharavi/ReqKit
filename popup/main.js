import { getCurrentTab } from '../shared/chrome-api.js';
import { bindHeaderEvents, initializeHeaders } from './headers.js';
import { state } from './state.js';
import { bindTabEvents, setActiveTab } from './tabs.js';
import { bindTokenEvents, initializeTokens } from './tokens.js';
import { bindTransformerEvents, initializeTransformer } from './transformer.js';
import { showStatus } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  bindTabEvents();
  bindHeaderEvents();
  bindTokenEvents();
  bindTransformerEvents();
  setActiveTab('transformer');

  initialize().catch((error) => {
    console.error('Could not initialize the popup.', error);
    showStatus('headerStatus', 'Could not load header rules.', 'error');
    showStatus('transformerStatus', 'Could not load transformer state.', 'error');
  });
});

async function initialize() {
  try {
    state.currentTab = await getCurrentTab();
  } catch (error) {
    console.error('Could not read the current tab.', error);
  }

  initializeTransformer(state.currentTab);

  const [headersResult, tokensResult] = await Promise.allSettled([
    initializeHeaders(state.currentTab),
    initializeTokens()
  ]);

  if (headersResult.status === 'rejected') {
    console.error('Could not initialize header rules.', headersResult.reason);
    showStatus('headerStatus', 'Could not load header rules.', 'error');
  }

  if (tokensResult.status === 'rejected') {
    console.error('Could not initialize saved tokens.', tokensResult.reason);
    showStatus('transformerStatus', 'Could not load saved tokens.', 'error');
  }
}
