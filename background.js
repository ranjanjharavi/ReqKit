const RULE_STORAGE_KEY = 'headerRules';

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

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(() => {
  chrome.storage.local.get(['interceptionCount'], (result) => {
    chrome.storage.local.set({ interceptionCount: (result.interceptionCount || 0) + 1 });
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if ('extensionPaused' in changes || RULE_STORAGE_KEY in changes) {
    restorePersistedRules().catch((error) => {
      console.error('Could not update rules after state change.', error);
    });
  }
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

async function restorePersistedRules() {
  const rules = await getStoredRules();
  const [currentRules, { extensionPaused }] = await Promise.all([
    getDynamicRules(),
    storageAreaGet(chrome.storage.local, ['extensionPaused'])
  ]);
  const addRules = extensionPaused ? [] : rules.filter((rule) => rule.enabled).map(buildDynamicRule);

  await updateDynamicRules({
    removeRuleIds: currentRules.map((rule) => rule.id),
    addRules
  });

  await updateBadge(rules, extensionPaused);
}

async function updateBadge(rules, isPaused) {
  if (isPaused) {
    await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
    await chrome.action.setBadgeText({ text: '||' });
    return;
  }

  const activeCount = (rules || []).filter((rule) => rule.enabled).length;
  if (activeCount === 0) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
  await chrome.action.setBadgeText({ text: String(activeCount) });
}

async function getStoredRules() {
  const localData = await storageAreaGet(chrome.storage.local, [RULE_STORAGE_KEY]);
  if (Object.prototype.hasOwnProperty.call(localData, RULE_STORAGE_KEY)) {
    return normalizeRules(localData[RULE_STORAGE_KEY] || []);
  }

  const legacyData = await storageAreaGet(chrome.storage.sync, [RULE_STORAGE_KEY]);
  const migratedRules = normalizeRules(legacyData[RULE_STORAGE_KEY] || []);

  if (migratedRules.length) {
    await storageAreaSet(chrome.storage.local, { [RULE_STORAGE_KEY]: migratedRules });
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

function normalizeDomain(value) {
  const cleanedValue = String(value || '').trim();
  if (!cleanedValue) {
    return '';
  }

  const hadProtocol = /^https?:\/\//i.test(cleanedValue);
  const candidate = hadProtocol ? cleanedValue : `https://${cleanedValue.replace(/^\/+/, '')}`;

  if (!URL.canParse(candidate)) {
    return '';
  }

  const parsed = new URL(candidate);
  return parsed.hostname && /^https?:\/\//i.test(parsed.href) ? parsed.hostname.toLowerCase() : '';
}

function buildDynamicRule(rule) {
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
    condition: {
      resourceTypes: RESOURCE_SCOPE_MAP[rule.requestScope] || RESOURCE_SCOPE_MAP.all,
      regexFilter: String.raw`^https?:\/\/${escapeRegex(rule.domain)}(?::\d+)?(?:[/?#]|$)`
    }
  };
}

function escapeRegex(value) {
  return String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function storageAreaGet(storageArea, query) {
  return new Promise((resolve, reject) => {
    storageArea.get(query, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result || {});
    });
  });
}

function storageAreaSet(storageArea, value) {
  return new Promise((resolve, reject) => {
    storageArea.set(value, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}
