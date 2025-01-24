export const state = {
  headers: {
    rules: [],
    editingId: null,
    composerOpen: false,
    currentHostname: '',
    view: 'current',
    collapsedDomains: new Set(),
    revealedRuleIds: new Set(),
    searchQuery: ''
  },
  transformer: {
    result: null,
    recipe: null,
    editor: { open: false, draft: null }
  }
};
