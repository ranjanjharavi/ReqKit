export function bindTabEvents() {
  document.querySelector('.tabs-list').addEventListener('click', (event) => {
    const button = event.target.closest('.tab-btn');
    if (button) {
      setActiveTab(button.dataset.tab);
    }
  });
}

export function setActiveTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    const isActive = button.dataset.tab === tabName;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    const isActive = panel.dataset.panel === tabName;
    panel.classList.toggle('active', isActive);
    panel.hidden = !isActive;
  });
}
