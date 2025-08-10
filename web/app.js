(function(){
  const els = {
    logo: document.getElementById('brandLogo'),
    baseUrlInput: document.getElementById('baseUrlInput'),
    useProxyChk: document.getElementById('useProxyChk'),
    saveBtn: document.getElementById('saveBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    autoRefreshChk: document.getElementById('autoRefreshChk'),
    intervalSelect: document.getElementById('intervalSelect'),
    cards: document.getElementById('cards'),
    lastUpdated: document.getElementById('lastUpdated'),
    apiLink: document.getElementById('apiLink'),
    year: document.getElementById('year'),
    outputModal: document.getElementById('outputModal'),
    modalOutput: document.getElementById('modalOutput'),
    modalClose: document.getElementById('modalClose')
  };

  const store = {
    get baseUrl(){ return localStorage.getItem('ds.baseUrl') || ''; },
    set baseUrl(v){ localStorage.setItem('ds.baseUrl', v || ''); },
    get useProxy(){ return (localStorage.getItem('ds.useProxy') ?? 'true') === 'true'; },
    set useProxy(v){ localStorage.setItem('ds.useProxy', v ? 'true' : 'false'); },
    get autoRefresh(){ return (localStorage.getItem('ds.autoRefresh') ?? 'false') === 'true'; },
    set autoRefresh(v){ localStorage.setItem('ds.autoRefresh', v ? 'true' : 'false'); },
    get interval(){ return parseInt(localStorage.getItem('ds.interval') || '10', 10); },
    set interval(v){ localStorage.setItem('ds.interval', String(v)); },
  };

  // Footer year
  els.year.textContent = new Date().getFullYear();


  // Load config from server for default baseApiUrl
  async function loadServerConfig(){
    try {
      const res = await fetch('/config', { cache: 'no-store' });
      if(res.ok){
        const cfg = await res.json();
        return cfg && cfg.baseApiUrl ? cfg.baseApiUrl : '';
      }
    } catch(_) {}
    return '';
  }

  function setStatus(text, ok=true){
    els.lastUpdated.textContent = text;
    els.lastUpdated.style.color = ok ? 'var(--muted)' : 'var(--error)';
  }

  function updateApiLink(){
    const base = (els.baseUrlInput.value || '').replace(/\/$/, '');
    els.apiLink.href = base ? `${base}/gossip` : '#';
  }

  async function init(){
    // Initialize inputs from storage or server config
    let base = store.baseUrl;
    if(!base){ base = await loadServerConfig(); store.baseUrl = base; }
    els.baseUrlInput.value = base;
    els.useProxyChk.checked = store.useProxy;
    els.autoRefreshChk.checked = store.autoRefresh;
    els.intervalSelect.value = String(store.interval || 10);
    updateApiLink();

    // Bind controls
    els.saveBtn.addEventListener('click', ()=>{
      const val = els.baseUrlInput.value.trim();
      if(val && !/^https?:\/\//i.test(val)){
        setStatus('Please enter a valid http(s) URL for the API.', false);
        return;
      }
      store.baseUrl = val;
      store.useProxy = !!els.useProxyChk.checked;
      store.autoRefresh = !!els.autoRefreshChk.checked;
      store.interval = parseInt(els.intervalSelect.value, 10) || 10;
      updateApiLink();
      setStatus('Saved.');
      refresh();
    });
    els.refreshBtn.addEventListener('click', ()=> refresh());
    els.autoRefreshChk.addEventListener('change', ()=>{
      store.autoRefresh = !!els.autoRefreshChk.checked;
      setupAutoRefresh();
    });
    els.intervalSelect.addEventListener('change', ()=>{
      store.interval = parseInt(els.intervalSelect.value, 10) || 10;
      setupAutoRefresh();
    });

    // First load
    refresh();
    setupAutoRefresh();
  }

  let refreshTimer = null;
  function setupAutoRefresh(){
    if(refreshTimer){ clearInterval(refreshTimer); refreshTimer = null; }
    if(store.autoRefresh){
      refreshTimer = setInterval(refresh, Math.max(3000, store.interval*1000));
    }
  }

  function gossipURL(){
    const base = (els.baseUrlInput.value || '').replace(/\/$/, '');
    if(!base) return '';
    if(els.useProxyChk.checked){
      const q = encodeURIComponent(base);
      return `/proxy/gossip?base=${q}`;
    }
    return `${base}/gossip`;
  }

  async function refresh(){
    const url = gossipURL();
    if(!url){ setStatus('Please set the Base API URL.', false); return; }
    setStatus('Loading…');
    try {
      const controller = new AbortController();
      const t = setTimeout(()=> controller.abort(), 15000);
      const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
      clearTimeout(t);
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      render(data);
      setStatus(`Updated at ${new Date().toLocaleTimeString()}`);
    } catch(err){
      console.error(err);
      setStatus(`Failed to load gossip: ${err.message || err}`, false);
    }
  }

  function fmtDate(iso){
    if(!iso) return '';
    try { return new Date(iso).toLocaleString(); } catch(_) { return String(iso); }
  }

  function shortSha(sha){ return sha ? sha.slice(0, 7) : ''; }

  function el(tag, cls, text){
    const e = document.createElement(tag);
    if(cls) e.className = cls;
    if(text != null) e.textContent = text;
    return e;
  }

  function render(data){
    els.cards.innerHTML = '';
    if(!Array.isArray(data) || data.length === 0){
      els.cards.appendChild(el('div', 'repo-meta', 'No nodes found.'));
      return;
    }

    data.forEach(node => {
      const card = el('div', 'card');
      const header = el('div', 'card-header');
      const left = el('div');
      left.appendChild(el('div', 'repo-title', node.node_url || 'Unknown node'));
      left.appendChild(el('div', 'repo-meta', fmtDate(node.last_updated)));
      const badges = el('div', 'badges');
      if(node.is_local){ badges.appendChild(el('span', 'badge islocal', 'local')); }
      if(node.fetch_error){ badges.appendChild(el('span', 'badge error', 'fetch error')); }
      header.appendChild(left);
      header.appendChild(badges);
      card.appendChild(header);
      const contentOuter = el('div', 'content-outer');
      const content = el('div', 'content');
      if(node.fetch_error){
        const nerr = el('div', 'repo-error');
        nerr.textContent = String(node.fetch_error);
        content.appendChild(nerr);
      }
      const repos = Array.isArray(node.repositories) ? node.repositories : [];
      repos.forEach(repoItem => {
        const r = el('div', 'repo');
        const h = el('div', 'repo-header');
        const title = el('div', 'repo-title', (repoItem.Repository && repoItem.Repository.Name) || 'repo');
        h.appendChild(title);
        const rb = el('div', 'badges');
        if(repoItem.Changed){ rb.appendChild(el('span', 'badge changed', 'changed')); }
        rb.appendChild(el('span', `badge ${repoItem.Success ? 'success' : 'error'}`, repoItem.Success ? 'success' : 'error'));
        h.appendChild(rb);
        r.appendChild(h);
        const meta = el('div', 'repo-meta');
        const parts = [];
        if(repoItem.Sha1) parts.push(`sha ${shortSha(repoItem.Sha1)}`);
        if(repoItem.Time) parts.push(fmtDate(repoItem.Time));
        if(repoItem.Repository && repoItem.Repository.ConfigPath) parts.push(repoItem.Repository.ConfigPath);
        meta.textContent = parts.join(' • ');
        r.appendChild(meta);
        if(repoItem.ErrorMessage){
          const err = el('div', 'repo-error');
          err.textContent = repoItem.ErrorMessage;
          r.appendChild(err);
        }

        const tasksWrap = el('div', 'tasks');
        const details = document.createElement('details');
        const statuses = Array.isArray(repoItem.TaskStatues) ? repoItem.TaskStatues : (Array.isArray(repoItem.TaskStatuses) ? repoItem.TaskStatuses : []);
        const summary = el('summary', null, `Tasks (${statuses.length})`);
        details.appendChild(summary);
        statuses.forEach(ts => {
          const row = el('div', 'task');
          const name = el('div', 'name', (ts.Task && ts.Task.Name) || 'task');
          const meta2 = el('div', 'repo-meta');
          const cmd = ts.Task && Array.isArray(ts.Task.Command) ? ts.Task.Command.join(' ') : '';
          meta2.innerHTML = `${ts.Success ? '<span class="badge success">ok</span>' : '<span class="badge error">fail</span>'} \u00A0 <span class="cmd">${escapeHtml(cmd)}</span>`;
          row.appendChild(name);
          row.appendChild(meta2);
          if(ts.Output){
            const pre = document.createElement('pre');
            pre.textContent = String(ts.Output);
            row.appendChild(pre);
          }
          details.appendChild(row);
        });
        tasksWrap.appendChild(details);
        r.appendChild(tasksWrap);

        content.appendChild(r);
      });

      contentOuter.appendChild(content);
      card.appendChild(contentOuter);
      els.cards.appendChild(card);
    });
  }

  // Modal helpers
  function openOutputModal(text){
    if(!els.outputModal) return;
    els.modalOutput.textContent = text || '';
    els.outputModal.removeAttribute('hidden');
    document.body.classList.add('modal-open');
  }
  function closeOutputModal(){
    if(!els.outputModal) return;
    els.outputModal.setAttribute('hidden', '');
    document.body.classList.remove('modal-open');
  }
  // Modal event listeners
  if(els.modalClose){ els.modalClose.addEventListener('click', closeOutputModal); }
  if(els.outputModal){
    els.outputModal.addEventListener('click', function(e){ if(e.target === els.outputModal){ closeOutputModal(); } });
  }
  if(els.cards){
    els.cards.addEventListener('click', function(e){
      const pre = e.target && e.target.closest ? e.target.closest('.task pre') : null;
      if(pre){ openOutputModal(pre.textContent || ''); }
    });
  }
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && els.outputModal && !els.outputModal.hasAttribute('hidden')){ closeOutputModal(); }
  });

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[s]));
  }

  init();
})();
