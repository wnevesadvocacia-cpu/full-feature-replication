chrome.storage.local.get(['message','queue']).then(state => {
  document.getElementById('status').textContent = `${state.message || 'Vincule uma vez em Intimações.'} Lotes locais pendentes: ${state.queue?.length || 0}.`;
});
