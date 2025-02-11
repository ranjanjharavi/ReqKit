export const state = {
  headers: {
    rules: [],
    profiles: [],
    activation: null,
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
