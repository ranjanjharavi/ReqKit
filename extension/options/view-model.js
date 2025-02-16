export function getRuleWorkspaceSummary(rules) {
  const safeRules = Array.isArray(rules) ? rules : [];
  const totalRules = safeRules.length;
  const activeRules = safeRules.filter((rule) => rule.enabled).length;
  const hostCount = new Set(safeRules.map((rule) => rule.domain)).size;

  if (!totalRules) {
    return {
      totalRules,
      activeRules,
      hostCount,
      detail: 'No rules in this view.'
    };
  }

  return {
    totalRules,
    activeRules,
    hostCount,
    detail: `${activeRules} enabled · ${hostCount} ${hostCount === 1 ? 'host' : 'hosts'}`
  };
}
