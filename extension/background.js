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
  restorePersistedRules().catch((error) => {
    console.error('Could not restore saved header rules after install/update.', error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  restorePersistedRules().catch((error) => {
    console.error('Could not restore saved header rules on browser startup.', error);
  });
});

async function handleRuleMessage(message) {
  if (message.type === RULE_MESSAGE_GET) {
    return getStoredRules();
  }

  const rules = await commitRuleSet(message.rules, {
    getCurrentRules: getStoredRules,
    applyRules: applyDynamicRules,
    storeRules
  });

  await updateBadgeSafely(rules);
  return rules;
}

async function restorePersistedRules() {
  const rules = await getStoredRules();
  await applyDynamicRules(rules);
  await updateBadgeSafely(rules);
}

async function applyDynamicRules(rules) {
  const currentRules = await getDynamicRules();
  const addRules = rules.filter((rule) => rule.enabled).map(buildDynamicRule);

  await updateDynamicRules({
    removeRuleIds: currentRules.map((rule) => rule.id),
    addRules
  });
}

async function updateBadgeSafely(rules) {
  try {
    await updateBadge(rules);
  } catch (error) {
    console.error('Could not update the extension badge.', error);
  }
}

async function updateBadge(rules) {
  const activeCount = rules.filter((rule) => rule.enabled).length;
  if (activeCount === 0) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  await chrome.action.setBadgeText({ text: String(activeCount) });
}

async function getStoredRules() {
  const localData = await storageAreaGet(chrome.storage.local, [RULE_STORAGE_KEY]);
  return normalizeRules(localData[RULE_STORAGE_KEY] || []);
}

function storeRules(rules) {
  return storageAreaSet(chrome.storage.local, { [RULE_STORAGE_KEY]: rules });
}
