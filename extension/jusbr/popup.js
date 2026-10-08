chrome.storage.local.get('message').then(state => { document.getElementById('status').textContent = state.message || 'Instale, abra Intimações no WnevesBox e clique em Vincular extensão.'; });
