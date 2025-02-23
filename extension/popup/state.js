export const state = {
  headers: {
    rules: [],
    profiles: [],
    activation: null,
    grantedOrigins: null,
    composerOpen: false,
    editingId: null,
    scope: 'site',
    collapsedDomains: new Set(),
    currentHostname: '',
    revealedRuleIds: new Set(),
    syncPaused: false
  }
};
