import { commitRuleSet } from './shared/rule-commit.js';
import {
  getDynamicRules,
  queryTabs,
  storageAreaGet,
  storageAreaSet,
  updateDynamicRules
} from './shared/chrome-api.js';
import {
  ACTIVATION_MESSAGE_GET,
  ACTIVATION_MESSAGE_SET,
  RULE_MESSAGE_COMMIT,
  RULE_MESSAGE_GET
} from './shared/messages.js';
import {
  RULE_STORAGE_KEY,
  buildDynamicRule,
  normalizeRules
} from './shared/rules.js';
import {
  ACTIVATION_STORAGE_KEY,
  getLiveRules,
  normalizeActivation,
  resolveActivation,
  setMasterEnabled,
  startBrowserSession
} from './shared/activation.js';
import { PROFILE_STORAGE_KEY, getProfileIds, normalizeProfiles } from './shared/profiles.js';
import { MIGRATED_KEYS, ensureMigrated } from './shared/migrate.js';
import { resolveBadge } from './shared/badge.js';

const RULE_MESSAGES = new Set([RULE_MESSAGE_GET, RULE_MESSAGE_COMMIT]);
const ACTIVATION_MESSAGES = new Set([ACTIVATION_MESSAGE_GET, ACTIVATION_MESSAGE_SET]);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (RULE_MESSAGES.has(message?.type)) {
    handleRuleMessage(message)
      .then((rules) => sendResponse({ ok: true, rules }))
      .catch((error) => {
        console.error('Could not process the header rule request.', error);
        sendResponse({ ok: false, error: error.message || 'Could not update header rules.' });
      });
    return true;
  }

  if (ACTIVATION_MESSAGES.has(message?.type)) {
    handleActivationMessage(message)
      .then((activation) => sendResponse({ ok: true, activation }))
      .catch((error) => {
        console.error('Could not process the activation request.', error);
        sendResponse({ ok: false, error: error.message || 'Could not update the ReqKit switch.' });
      });
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  initialize().catch((error) => {
    console.error('Could not restore saved header rules after install/update.', error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  initialize({ newBrowserSession: true }).catch((error) => {
    console.error('Could not restore saved header rules on browser startup.', error);
  });
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-master') {
    return;
  }

  toggleMasterSwitch().catch((error) => {
    console.error('Could not toggle the ReqKit master switch.', error);
  });
});

// A navigation changes which rules apply to the tab, so its badge is recomputed.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== 'complete') {
    return;
  }

  refreshTabBadge(tabId, tab).catch((error) => {
    console.error('Could not update the badge for that tab.', error);
  });
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  refreshTabBadge(tabId).catch((error) => {
    console.error('Could not update the badge for the active tab.', error);
  });
});

/**
 * Deliberately does not open the popup: flip off, reload the page, confirm the
 * bug is real, flip back. The badge is the only feedback needed.
 */
async function toggleMasterSwitch() {
  const { rules, activation } = await loadState();
  await commitActivation(setMasterEnabled(activation, !activation.masterEnabled), rules);
}

async function initialize({ newBrowserSession = false } = {}) {
  await ensureMigrated({
    get: (keys) => storageAreaGet(chrome.storage.local, keys),
    set: (value) => storageAreaSet(chrome.storage.local, value)
  });

  const state = await loadState({ newBrowserSession });
  await applyDynamicRules(state.rules, state.activation);
  await refreshBadgesSafely(state.rules, state.activation);
}

async function handleRuleMessage(message) {
  const state = await loadState();

  if (message.type === RULE_MESSAGE_GET) {
    return state.rules;
  }

  const rules = await commitRuleSet(message.rules, {
    activation: state.activation,
    profileIds: state.profileIds,
    getCurrentRules: async () => state.rules,
    applyRules: (nextRules) => applyDynamicRules(nextRules, state.activation),
    storeRules
  });

  await refreshBadgesSafely(rules, state.activation);
  return rules;
}

async function handleActivationMessage(message) {
  const state = await loadState();

  if (message.type === ACTIVATION_MESSAGE_GET) {
    return state.activation;
  }

  const nextActivation = normalizeActivation(message.activation, { profileIds: state.profileIds });
  return commitActivation(nextActivation, state.rules);
}

/**
 * The worker owns the dynamic rule set and the badges, so every activation
 * change lands here rather than being written to storage by a page.
 */
async function commitActivation(activation, rules) {
  await storeActivation(activation);
  await applyDynamicRules(rules, activation);
  await refreshBadgesSafely(rules, activation);
  return activation;
}

/**
 * Single read path for everything the worker needs. Expiry is resolved here so
 * a timer that elapsed while the worker was asleep takes effect on the next
 * wake, and the resolved activation is written back before it is used.
 */
async function loadState({ newBrowserSession = false } = {}) {
  const stored = await storageAreaGet(chrome.storage.local, MIGRATED_KEYS);
  const profiles = normalizeProfiles(stored[PROFILE_STORAGE_KEY]);
  const profileIds = getProfileIds(profiles);
  const rules = normalizeRules(stored[RULE_STORAGE_KEY] || [], { profileIds });

  const storedActivation = normalizeActivation(stored[ACTIVATION_STORAGE_KEY], { profileIds });
  const sessionResult = newBrowserSession
    ? startBrowserSession(storedActivation)
    : { activation: storedActivation, changed: false };
  const expiryResult = resolveActivation(sessionResult.activation);

  if (sessionResult.changed || expiryResult.changed) {
    await storeActivation(expiryResult.activation);
  }

  return { profiles, profileIds, rules, activation: expiryResult.activation };
}

async function applyDynamicRules(rules, activation) {
  const currentRules = await getDynamicRules();
  const addRules = getLiveRules(rules, activation).map(buildDynamicRule);

  await updateDynamicRules({
    removeRuleIds: currentRules.map((rule) => rule.id),
    addRules
  });
}

async function refreshBadgesSafely(rules, activation) {
  try {
    await refreshBadges(rules, activation);
  } catch (error) {
    console.error('Could not update the extension badge.', error);
  }
}

/**
 * The default badge covers tabs whose address ReqKit cannot read; every tab it
 * can read gets an exact per-host count on top.
 */
async function refreshBadges(rules, activation) {
  await paintBadge(resolveBadge(rules, activation));

  const tabs = await queryTabs({});
  await Promise.all(tabs.map((tab) => (
    paintBadge(resolveBadge(rules, activation, { url: tab.url }), tab.id)
  )));
}

async function refreshTabBadge(tabId, knownTab = null) {
  const { rules, activation } = await loadState();
  const tab = knownTab || await getTabSafely(tabId);

  await paintBadge(resolveBadge(rules, activation, { url: tab?.url }), tabId);
}

async function getTabSafely(tabId) {
  try {
    const tabs = await queryTabs({});
    return tabs.find((tab) => tab.id === tabId) || null;
  } catch (error) {
    console.error('Could not read that tab.', error);
    return null;
  }
}

async function paintBadge({ text, color }, tabId = null) {
  const target = tabId === null ? {} : { tabId };

  if (color) {
    await chrome.action.setBadgeBackgroundColor({ ...target, color });
  }
  await chrome.action.setBadgeText({ ...target, text });
}

function storeRules(rules) {
  return storageAreaSet(chrome.storage.local, { [RULE_STORAGE_KEY]: rules });
}

function storeActivation(activation) {
  return storageAreaSet(chrome.storage.local, { [ACTIVATION_STORAGE_KEY]: activation });
}
