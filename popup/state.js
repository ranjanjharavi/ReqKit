export const state = {
  currentTab: null,
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
  tokens: {
    items: [],
    activeToken: ''
  },
  transformer: {
    result: null
  }
};
