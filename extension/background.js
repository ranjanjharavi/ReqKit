import { commitRuleSet } from './shared/rule-commit.js';
import {
  getDynamicRules,
  storageAreaGet,
  storageAreaSet,
  updateDynamicRules
} from './shared/chrome-api.js';
import { RULE_MESSAGE_COMMIT, RULE_MESSAGE_GET } from './shared/messages.js';
import {
  RULE_STORAGE_KEY,
  buildDynamicRule,
  normalizeRules
} from './shared/rules.js';
import {
  ACTIVATION_STORAGE_KEY,
  countLiveRules,
  getLiveRules,
  getTargetProfileId,
  normalizeActivation,
  resolveActivation,
  setMasterEnabled,
  startBrowserSession
} from './shared/activation.js';
import { PROFILE_STORAGE_KEY, getProfileIds, normalizeProfiles } from './shared/profiles.js';
import { MIGRATED_KEYS, ensureMigrated } from './shared/migrate.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== RULE_MESSAGE_GET && message?.type !== RULE_MESSAGE_COMMIT) {
    return false;
  }

  handleRuleMessage(message)
    .then((rules) => sendResponse({ ok: true, rules }))
    .catch((error) => {
      console.error('Could not process the header rule request.', error);
      sendResponse({ ok: false, error: error.message || 'Could not update header rules.' });
    });

  return true;
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

/**
 * Deliberately does not open the popup: flip off, reload the page, confirm the
 * bug is real, flip back. The badge is the only feedback needed.
 */
async function toggleMasterSwitch() {
  const { rules, activation } = await loadState();
  const nextActivation = setMasterEnabled(activation, !activation.masterEnabled);

  await storeActivation(nextActivation);
  await applyDynamicRules(rules, nextActivation);
  await updateBadgeSafely(rules, nextActivation);
}

async function initialize({ newBrowserSession = false } = {}) {
  await ensureMigrated({
    get: (keys) => storageAreaGet(chrome.storage.local, keys),
    set: (value) => storageAreaSet(chrome.storage.local, value)
  });

  const state = await loadState({ newBrowserSession });
  await applyDynamicRules(state.rules, state.activation);
  await updateBadgeSafely(state.rules, state.activation);
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

  await updateBadgeSafely(rules, state.activation);
  return rules;
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

async function updateBadgeSafely(rules, activation) {
  try {
    await updateBadge(rules, activation);
  } catch (error) {
    console.error('Could not update the extension badge.', error);
  }
}

async function updateBadge(rules, activation) {
  const activeCount = countLiveRules(rules, activation);
  if (activeCount > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
    await chrome.action.setBadgeText({ text: String(activeCount) });
    return;
  }

  // Only say "off" when something is actually being held back — by the master
  // switch or by an elapsed timer — so a profile with no rules stays quiet.
  const heldBack = countLiveRules(rules, {
    masterEnabled: true,
    profileId: getTargetProfileId(activation)
  });

  if (heldBack > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: '#64748b' });
    await chrome.action.setBadgeText({ text: 'off' });
    return;
  }

  await chrome.action.setBadgeText({ text: '' });
}

function storeRules(rules) {
  return storageAreaSet(chrome.storage.local, { [RULE_STORAGE_KEY]: rules });
}

function storeActivation(activation) {
  return storageAreaSet(chrome.storage.local, { [ACTIVATION_STORAGE_KEY]: activation });
}
