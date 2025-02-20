import { createDefaultActivation, isRuleLive } from './activation.js';
import { DEFAULT_PROFILE_ID, resolveProfileId } from './profiles.js';

export const RULE_STORAGE_KEY = 'headerRules';

const REQUEST_RESOURCE_TYPES = [
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
  'other'
];

export function normalizeRules(rules, { profileIds = null } = {}) {
  const usedIds = new Set();
  let nextId = 1;

  return (Array.isArray(rules) ? rules : [])
    .map((rule) => normalizeRule(rule, usedIds, () => nextId++, profileIds))
    .filter(Boolean);
}

function normalizeRule(
  rule,
  usedIds = new Set(),
  getNextId = createSequentialIdFactory(),
  profileIds = null
) {
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
    enabled: rule.enabled !== false,
    profileId: normalizeRuleProfileId(rule.profileId, profileIds)
  };
}

/**
 * An unrecognized profile is repaired rather than dropped. `commitRuleSet`
 * rejects a set whose normalized length shrank, so dropping here would turn one
 * stale reference into a permanent commit failure.
 */
function normalizeRuleProfileId(value, profileIds) {
  const resolvedId = resolveProfileId(value);
  return !profileIds || profileIds.has(resolvedId) ? resolvedId : DEFAULT_PROFILE_ID;
}

export function normalizeDomain(value) {
  const cleanedValue = String(value || '').trim();
  if (!cleanedValue) {
    return '';
  }

  const hadHttpsProtocol = /^https:\/\//i.test(cleanedValue);
  const hadOtherProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(cleanedValue) && !hadHttpsProtocol;
  if (hadOtherProtocol) {
    return '';
  }

  const candidate = hadHttpsProtocol ? cleanedValue : `https://${cleanedValue.replace(/^\/+/, '')}`;
  if (!URL.canParse(candidate)) {
    return '';
  }

  const parsed = new URL(candidate);
  return parsed.hostname && parsed.protocol === 'https:' ? parsed.hostname.toLowerCase() : '';
}

export function validateRuleDraft(draft, existingRules, {
  excludeId = null,
  enabled = true,
  activation = createDefaultActivation(),
  profileId = undefined
} = {}) {
  const rule = {
    domain: normalizeDomain(draft?.domain),
    headerName: String(draft?.headerName || '').trim(),
    headerValue: String(draft?.headerValue || '').trim()
  };
  const draftProfileId = resolveProfileId(
    profileId ?? draft?.profileId ?? activation?.profileId ?? DEFAULT_PROFILE_ID
  );

  if (!rule.domain || !rule.headerName || !rule.headerValue) {
    return { ok: false, error: 'A valid HTTPS host, header name, and header value are required.' };
  }

  if (!isValidHeaderName(rule.headerName)) {
    return { ok: false, error: 'Enter a valid HTTP header name.' };
  }

  if (!isValidHeaderValue(rule.headerValue)) {
    return { ok: false, error: 'Header values cannot contain line breaks.' };
  }

  // An identical rule in another profile is deliberate, not a duplicate.
  const duplicateRule = (Array.isArray(existingRules) ? existingRules : []).some((existingRule) => (
    existingRule.id !== excludeId
    && resolveProfileId(existingRule.profileId) === draftProfileId
    && existingRule.domain === rule.domain
    && existingRule.headerName.toLowerCase() === rule.headerName.toLowerCase()
    && existingRule.headerValue === rule.headerValue
  ));

  if (duplicateRule) {
    return { ok: false, error: 'That rule already exists.' };
  }

  const conflictingRule = findActiveRuleConflict(
    { ...rule, enabled, profileId: draftProfileId },
    existingRules,
    { excludeId, activation }
  );
  if (conflictingRule) {
    return {
      ok: false,
      error: getRuleConflictMessage(conflictingRule),
      conflictId: conflictingRule.id
    };
  }

  return { ok: true, rule };
}

function isValidHeaderName(value) {
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(String(value || ''));
}

function isValidHeaderValue(value) {
  const normalizedValue = String(value || '');
  return Boolean(normalizedValue) && !/[\r\n]/.test(normalizedValue);
}

export function getNextRuleId(rules) {
  const ids = (Array.isArray(rules) ? rules : [])
    .map((rule) => Number(rule?.id))
    .filter((id) => Number.isInteger(id) && id > 0);

  return ids.length ? Math.max(...ids) + 1 : 1;
}

export function findActiveRuleConflict(candidate, rules, {
  excludeId = candidate?.id ?? null,
  activation = createDefaultActivation()
} = {}) {
  if (!isRuleLive(candidate, activation)) {
    return null;
  }

  return (Array.isArray(rules) ? rules : []).find((existingRule) => (
    existingRule?.id !== excludeId && areRulesConflicting(candidate, existingRule, activation)
  )) || null;
}

export function getActiveRuleConflicts(rules, activation = createDefaultActivation()) {
  const normalizedRules = Array.isArray(rules) ? rules : [];
  const conflicts = [];

  for (let leftIndex = 0; leftIndex < normalizedRules.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < normalizedRules.length; rightIndex += 1) {
      const leftRule = normalizedRules[leftIndex];
      const rightRule = normalizedRules[rightIndex];
      if (areRulesConflicting(leftRule, rightRule, activation)) {
        conflicts.push({ leftRule, rightRule });
      }
    }
  }

  return conflicts;
}

/**
 * Only rules that reach the network at the same time can conflict, so two rules
 * in different profiles never do — that is exactly what profiles are for.
 */
export function areRulesConflicting(leftRule, rightRule, activation = createDefaultActivation()) {
  if (!isRuleLive(leftRule, activation) || !isRuleLive(rightRule, activation)) {
    return false;
  }

  const sameTarget = leftRule.domain === rightRule.domain
    && String(leftRule.headerName).toLowerCase() === String(rightRule.headerName).toLowerCase();
  if (!sameTarget || leftRule.headerValue === rightRule.headerValue) {
    return false;
  }

  return true;
}

export function getRuleConflictMessage(conflictingRule) {
  return `Conflicts with the active ${conflictingRule.headerName} rule for ${conflictingRule.domain} because they use different values.`;
}

export function filterRulesByHost(rules, hostname) {
  const normalizedHostname = normalizeDomain(hostname);
  if (!normalizedHostname) {
    return Array.isArray(rules) ? rules : [];
  }

  return (Array.isArray(rules) ? rules : []).filter((rule) => rule.domain === normalizedHostname);
}

export function filterRulesByProfile(rules, profileId) {
  const resolvedId = resolveProfileId(profileId);
  return (Array.isArray(rules) ? rules : []).filter((rule) => (
    resolveProfileId(rule?.profileId) === resolvedId
  ));
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
      resourceTypes: REQUEST_RESOURCE_TYPES,
      regexFilter: String.raw`^https:\/\/${escapeRegex(rule.domain)}(?::\d+)?(?:[/?#]|$)`
    }
  };
}

export function getRuleOriginPattern(rule) {
  return `https://${rule.domain}/*`;
}

function escapeRegex(value) {
  return String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createSequentialIdFactory() {
  let nextId = 1;
  return () => nextId++;
}
