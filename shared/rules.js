export const RULE_STORAGE_KEY = 'headerRules';

export const RESOURCE_SCOPE_MAP = {
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

export const SCOPE_LABELS = {
  all: 'All requests',
  pages: 'Pages only',
  api: 'API and assets'
};

export function normalizeRules(rules) {
  const usedIds = new Set();
  let nextId = 1;

  return (Array.isArray(rules) ? rules : [])
    .map((rule) => normalizeRule(rule, usedIds, () => nextId++))
    .filter(Boolean);
}

export function normalizeRule(rule, usedIds = new Set(), getNextId = createSequentialIdFactory()) {
  if (!rule) {
    return null;
  }

  const domain = normalizeDomain(rule.domain || '');
  const headerName = String(rule.headerName || '').trim();
  const headerValue = String(rule.headerValue || '').trim();

  if (!domain || !isValidHeaderName(headerName) || !isValidHeaderValue(headerValue)) {
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

export function normalizeDomain(value) {
  const cleanedValue = String(value || '').trim();
  if (!cleanedValue) {
    return '';
  }

  const hadHttpProtocol = /^https?:\/\//i.test(cleanedValue);
  const hadOtherProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(cleanedValue) && !hadHttpProtocol;
  if (hadOtherProtocol) {
    return '';
  }

  const candidate = hadHttpProtocol ? cleanedValue : `https://${cleanedValue.replace(/^\/+/, '')}`;
  if (!URL.canParse(candidate)) {
    return '';
  }

  const parsed = new URL(candidate);
  return parsed.hostname && /^https?:\/\//i.test(parsed.href) ? parsed.hostname.toLowerCase() : '';
}

export function validateRuleDraft(draft, existingRules, { excludeId = null } = {}) {
  const rule = {
    domain: normalizeDomain(draft?.domain),
    headerName: String(draft?.headerName || '').trim(),
    headerValue: String(draft?.headerValue || '').trim(),
    requestScope: RESOURCE_SCOPE_MAP[draft?.requestScope] ? draft.requestScope : 'all'
  };

  if (!rule.domain || !rule.headerName || !rule.headerValue) {
    return { ok: false, error: 'Host, header name, and header value are required.' };
  }

  if (!isValidHeaderName(rule.headerName)) {
    return { ok: false, error: 'Enter a valid HTTP header name.' };
  }

  if (!isValidHeaderValue(rule.headerValue)) {
    return { ok: false, error: 'Header values cannot contain line breaks.' };
  }

  const duplicateRule = (Array.isArray(existingRules) ? existingRules : []).some((existingRule) => (
    existingRule.id !== excludeId
    && existingRule.domain === rule.domain
    && existingRule.headerName.toLowerCase() === rule.headerName.toLowerCase()
    && existingRule.headerValue === rule.headerValue
    && existingRule.requestScope === rule.requestScope
  ));

  if (duplicateRule) {
    return { ok: false, error: 'That rule already exists.' };
  }

  return { ok: true, rule };
}

export function isValidHeaderName(value) {
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(String(value || ''));
}

export function isValidHeaderValue(value) {
  const normalizedValue = String(value || '');
  return Boolean(normalizedValue) && !/[\r\n]/.test(normalizedValue);
}

export function getNextRuleId(rules) {
  const ids = (Array.isArray(rules) ? rules : [])
    .map((rule) => Number(rule?.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  return ids.length ? Math.max(...ids) + 1 : 1;
}

export function filterRulesByHost(rules, hostname) {
  const normalizedHostname = normalizeDomain(hostname);
  if (!normalizedHostname) {
    return Array.isArray(rules) ? rules : [];
  }

  return (Array.isArray(rules) ? rules : []).filter((rule) => rule.domain === normalizedHostname);
}

export function groupRulesByDomain(rules) {
  const grouped = new Map();

  (Array.isArray(rules) ? rules : []).forEach((rule) => {
    const domainRules = grouped.get(rule.domain) || [];
    domainRules.push(rule);
    grouped.set(rule.domain, domainRules);
  });

  return Array.from(grouped, ([domain, groupedDomainRules]) => ({
    domain,
    rules: groupedDomainRules
  }));
}

export function buildDynamicRule(rule) {
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

export function escapeRegex(value) {
  return String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createSequentialIdFactory() {
  let nextId = 1;
  return () => nextId++;
}
