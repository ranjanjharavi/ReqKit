import { normalizeRules } from './rules.js';

export async function commitRuleSet(nextRules, {
  getCurrentRules,
  applyRules,
  storeRules
}) {
  if (!Array.isArray(nextRules)) {
    throw new Error('Header rules must be an array.');
  }

  const normalizedRules = normalizeRules(nextRules);
  if (normalizedRules.length !== nextRules.length) {
    throw new Error('One or more header rules are invalid.');
  }

  const previousRules = await getCurrentRules();
  await applyRules(normalizedRules);

  try {
    await storeRules(normalizedRules);
  } catch (error) {
    try {
      await applyRules(previousRules);
    } catch (rollbackError) {
      console.error('Could not restore the previous dynamic rules.', rollbackError);
    }
    throw error;
  }

  return normalizedRules;
}
