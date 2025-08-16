(function(){
  const els = {
    logo: document.getElementById('brandLogo'),
    appHeader: document.querySelector('header.app-header'),
    menuToggle: document.getElementById('menuToggle'),
    headerControls: document.getElementById('headerControls'),
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
    modalClose: document.getElementById('modalClose'),
    version: document.getElementById('version'),
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
        // Set version if present
        if(cfg.version && els.version) {
          els.version.textContent = `v${cfg.version}`;
          console.log(`Gossip UI v${cfg.version}`);
        } else {
          console.warn('Server config does not contain version info');
        }
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
    let serverConfig = await loadServerConfig();
    if(!base) {
      base = serverConfig; store.baseUrl = base;
    }
    els.baseUrlInput.value = base;
    els.useProxyChk.checked = store.useProxy;
    els.autoRefreshChk.checked = store.autoRefresh;
    els.intervalSelect.value = String(store.interval || 10);
    updateApiLink();

    // Hamburger menu toggle for mobile
    if(els.menuToggle && els.appHeader && els.headerControls){
      els.menuToggle.addEventListener('click', function(e){
        const open = !els.appHeader.classList.contains('menu-open');
        els.appHeader.classList.toggle('menu-open', open);
        els.menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if(open){
          // Focus first input in menu for accessibility
          setTimeout(()=>{
            const inp = els.headerControls.querySelector('input,select,button');
            if(inp) inp.focus();
          }, 100);
        }
      });
      // Close menu when clicking outside controls (on mobile)
      document.addEventListener('click', function(e){
        if(window.innerWidth > 720) return; // Only on mobile
        if(!els.appHeader.classList.contains('menu-open')) return;
        if(e.target === els.menuToggle || els.headerControls.contains(e.target)) return;
        els.appHeader.classList.remove('menu-open');
        els.menuToggle.setAttribute('aria-expanded', 'false');
      });
    }

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
      // Close menu on mobile after save
      if(window.innerWidth <= 720 && els.appHeader.classList.contains('menu-open')){
        els.appHeader.classList.remove('menu-open');
        els.menuToggle.setAttribute('aria-expanded', 'false');
      }
    });
    els.refreshBtn.addEventListener('click', ()=> {
      refresh();
      // Close menu on mobile after refresh
      if(window.innerWidth <= 720 && els.appHeader.classList.contains('menu-open')){
        els.appHeader.classList.remove('menu-open');
        els.menuToggle.setAttribute('aria-expanded', 'false');
      }
    });
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

  function formatNodeName(url) {
    if (!url) return 'Unknown node';
    try {
      // Remove protocol
      let u = url.replace(/^https?:\/\//, '');
      // Remove port
      u = u.replace(/:[0-9]+/, '');
      // Remove trailing slash
      u = u.replace(/\/$/, '');
      return u;
    } catch(e) {
      return url;
    }
  }

  // Track how many repos to show per node (by node index)
  let nodeRepoShowCount = {};

  function render(data){
    els.cards.innerHTML = '';
    if(!Array.isArray(data) || data.length === 0){
      els.cards.appendChild(el('div', 'repo-meta', 'No nodes found.'));
      return;
    }
    nodeRepoShowCount = {}; // reset on each render
    data.forEach((node, nodeIdx) => {
      const card = el('div', 'card');
      const header = el('div', 'card-header');
      const left = el('div');
      left.appendChild(el('div', 'repo-title', formatNodeName(node.node_url)));
      left.appendChild(el('div', 'repo-meta', fmtDate(node.last_updated)));
      left.lastChild.title = node.node_url || 'Unknown node';
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
      let repos = Array.isArray(node.repositories) ? node.repositories.slice() : [];
      // Sort by Time descending
      repos.sort((a, b) => {
        let ta = a.Time ? new Date(a.Time).getTime() : 0;
        let tb = b.Time ? new Date(b.Time).getTime() : 0;
        return tb - ta;
      });
      // How many to show for this node?
      let showCount = nodeRepoShowCount[nodeIdx] || 25;
      nodeRepoShowCount[nodeIdx] = showCount;
      let hasMore = repos.length > showCount;
      let visibleRepos = repos.slice(0, showCount);
      visibleRepos.forEach(repoItem => {
        const r = el('div', 'repo');
        const h = el('div', 'repo-header');
        const title = el('div', 'repo-title', (repoItem.Repository && repoItem.Repository.Name) || 'repo');
        h.appendChild(title);
        const rb = el('div', 'badges');
        if(repoItem.Changed) {
            rb.appendChild(el('span', 'badge changed', 'changed'));
            rb.appendChild(el('span', `badge ${repoItem.Success ? 'success' : 'error'}`, repoItem.Success ? 'success' : 'error'));
        } else {
            rb.appendChild(el('span', 'badge unchanged', 'unchanged'));
        }
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
        // Only show tasks if there were changes
        const statuses = Array.isArray(repoItem.TaskStatues) ? repoItem.TaskStatues : (Array.isArray(repoItem.TaskStatuses) ? repoItem.TaskStatuses : []);
        if (statuses.length > 0 && repoItem.Changed) {
          const tasksWrap = el('div', 'tasks');
          const details = document.createElement('details');
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
              // Remove scrollable style in main view
              pre.style.maxHeight = '';
              pre.style.overflow = '';
              row.appendChild(pre);
            }
            details.appendChild(row);
          });
          tasksWrap.appendChild(details);
          r.appendChild(tasksWrap);
        }
        content.appendChild(r);
      });
      // Add show more button if needed
      if(hasMore){
        const moreBtn = el('button', 'btn btn-outline', `Show older statuses (${repos.length - showCount} more)`);
        moreBtn.style.margin = '12px auto 0';
        moreBtn.onclick = function(){
          nodeRepoShowCount[nodeIdx] += 25;
          render(data); // re-render with more
        };
        content.appendChild(moreBtn);
      }
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
