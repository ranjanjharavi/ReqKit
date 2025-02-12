import { filterRulesByProfile, getRuleOriginPattern } from './rules.js';

const BROAD_ORIGIN_PATTERNS = ['https://*/*', '<all_urls>'];

/**
 * Every origin a profile needs in order to apply all of its rules.
 */
export function getProfileOrigins(rules, profileId) {
  return [...new Set(
    filterRulesByProfile(rules, profileId).map((rule) => getRuleOriginPattern(rule))
  )].sort();
}

export function isOriginGranted(origin, grantedOrigins) {
  const granted = grantedOrigins instanceof Set ? grantedOrigins : new Set(grantedOrigins || []);
  return BROAD_ORIGIN_PATTERNS.some((pattern) => granted.has(pattern)) || granted.has(origin);
}

export function isRuleGranted(rule, grantedOrigins) {
  return isOriginGranted(getRuleOriginPattern(rule), grantedOrigins);
}

/**
 * Computed from a cached grant list so the caller can go straight from a click
 * into permissions.request without an await in between.
 */
export function getMissingProfileOrigins(rules, profileId, grantedOrigins) {
  return getProfileOrigins(rules, profileId)
    .filter((origin) => !isOriginGranted(origin, grantedOrigins));
}

/**
 * Rules ReqKit can actually apply. Chrome already refuses to act on a host
 * without access, so filtering here keeps the badge and the rule set honest
 * rather than counting rules that silently do nothing.
 */
export function filterGrantedRules(rules, grantedOrigins) {
  if (grantedOrigins === undefined || grantedOrigins === null) {
    return Array.isArray(rules) ? rules : [];
  }

  return (Array.isArray(rules) ? rules : []).filter((rule) => isRuleGranted(rule, grantedOrigins));
}
