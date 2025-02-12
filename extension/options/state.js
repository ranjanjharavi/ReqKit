export const state = {
  rules: [],
  profiles: [],
  activation: null,
  grantedOrigins: null,
  editingId: null,
  composerOpen: false,
  collapsedDomains: new Set(),
  revealedRuleIds: new Set(),
  searchQuery: '',
  profileFilter: 'active',
  syncPaused: false
};
