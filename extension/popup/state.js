export const state = {
  headers: {
    rules: [],
    profiles: [],
    activation: null,
    grantedOrigins: null,
    composerOpen: false,
    currentHostname: '',
    revealedRuleIds: new Set(),
    syncPaused: false
  },
  transformer: {
    result: null,
    recipe: null,
    editor: { open: false, draft: null }
  }
};
