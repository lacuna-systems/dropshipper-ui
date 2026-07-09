(function () {
  'use strict';

  const els = {
    appHeader: document.querySelector('.app-header'),
    menuToggle: document.getElementById('menuToggle'),
    headerControls: document.getElementById('headerControls'),
    baseUrlInput: document.getElementById('baseUrlInput'),
    useProxyChk: document.getElementById('useProxyChk'),
    mergeNodesChk: document.getElementById('mergeNodesChk'),
    saveBtn: document.getElementById('saveBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    resyncBtn: document.getElementById('resyncBtn'),
    shutdownBtn: document.getElementById('shutdownBtn'),
    autoRefreshChk: document.getElementById('autoRefreshChk'),
    intervalSelect: document.getElementById('intervalSelect'),
    cards: document.getElementById('cards'),
    lastUpdated: document.getElementById('lastUpdated'),
    apiLink: document.getElementById('apiLink'),
    year: document.getElementById('year'),
    version: document.getElementById('version'),
    outputModal: document.getElementById('outputModal'),
    modalOutput: document.getElementById('modalOutput'),
    modalClose: document.getElementById('modalClose'),
  };

  const store = {
    get baseUrl() { return localStorage.getItem('ds.baseUrl') || ''; },
    set baseUrl(value) { localStorage.setItem('ds.baseUrl', value || ''); },
    get useProxy() { return (localStorage.getItem('ds.useProxy') || 'true') === 'true'; },
    set useProxy(value) { localStorage.setItem('ds.useProxy', value ? 'true' : 'false'); },
    get mergeNodes() { return (localStorage.getItem('ds.mergeNodes') || 'false') === 'true'; },
    set mergeNodes(value) { localStorage.setItem('ds.mergeNodes', value ? 'true' : 'false'); },
    get autoRefresh() { return (localStorage.getItem('ds.autoRefresh') || 'false') === 'true'; },
    set autoRefresh(value) { localStorage.setItem('ds.autoRefresh', value ? 'true' : 'false'); },
    get interval() { return Number(localStorage.getItem('ds.interval') || 10); },
    set interval(value) { localStorage.setItem('ds.interval', String(value || 10)); },
  };

  let refreshTimer = null;

  function createEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function metaEl(items) {
    const wrap = createEl('dl', 'meta');
    items.filter(item => item && item.value).forEach(item => {
      const row = createEl('div', 'meta-row');
      row.appendChild(createEl('dt', null, item.label));
      row.appendChild(createEl('dd', null, item.value));
      wrap.appendChild(row);
    });
    return wrap;
  }

  function normalizeBaseUrl(value) {
    const base = String(value || '').trim();
    if (!base) return '';
    const url = new URL(base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Base API URL must start with http:// or https://');
    }
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  }

  async function loadServerConfig() {
    try {
      const res = await fetch('/config', { cache: 'no-store' });
      if (!res.ok) return '';

      const config = await res.json();
      if (config.version && els.version) {
        els.version.textContent = `v${config.version}`;
      }
      return config.baseApiUrl || '';
    } catch (_) {
      return '';
    }
  }

  async function init() {
    els.year.textContent = new Date().getFullYear();

    const serverBaseUrl = await loadServerConfig();
    const baseUrl = store.baseUrl || serverBaseUrl;
    store.baseUrl = baseUrl;

    els.baseUrlInput.value = baseUrl;
    els.useProxyChk.checked = store.useProxy;
    els.mergeNodesChk.checked = store.mergeNodes;
    els.autoRefreshChk.checked = store.autoRefresh;
    els.intervalSelect.value = String(store.interval || 10);

    bindControls();
    updateApiLink();
    setupAutoRefresh();
    refresh();
  }

  function bindControls() {
    els.menuToggle.addEventListener('click', () => {
      const open = !els.appHeader.classList.contains('menu-open');
      els.appHeader.classList.toggle('menu-open', open);
      els.menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', event => {
      if (!els.appHeader.classList.contains('menu-open')) return;
      if (event.target === els.menuToggle || els.headerControls.contains(event.target)) return;
      closeMenu();
    });

    els.baseUrlInput.addEventListener('input', updateApiLink);
    els.saveBtn.addEventListener('click', saveSettings);
    els.refreshBtn.addEventListener('click', refresh);
    els.resyncBtn.addEventListener('click', resyncAll);
    els.shutdownBtn.addEventListener('click', shutdownDropshipper);
    els.mergeNodesChk.addEventListener('change', () => {
      store.mergeNodes = els.mergeNodesChk.checked;
      refresh();
    });
    els.autoRefreshChk.addEventListener('change', () => {
      store.autoRefresh = els.autoRefreshChk.checked;
      setupAutoRefresh();
    });
    els.intervalSelect.addEventListener('change', () => {
      store.interval = Number(els.intervalSelect.value) || 10;
      setupAutoRefresh();
    });

    if (els.modalClose) els.modalClose.addEventListener('click', closeOutputModal);
    if (els.outputModal) {
      els.outputModal.addEventListener('click', event => {
        if (event.target === els.outputModal) closeOutputModal();
      });
    }
    els.cards.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : event.target.parentElement;
      const output = target ? target.closest('.task-output') : null;
      if (output) openOutputModal(output.textContent || '');
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeOutputModal();
    });
  }

  function closeMenu() {
    els.appHeader.classList.remove('menu-open');
    els.menuToggle.setAttribute('aria-expanded', 'false');
  }

  function saveSettings() {
    try {
      const baseUrl = normalizeBaseUrl(els.baseUrlInput.value);
      els.baseUrlInput.value = baseUrl;
      store.baseUrl = baseUrl;
      store.useProxy = els.useProxyChk.checked;
      store.mergeNodes = els.mergeNodesChk.checked;
      store.autoRefresh = els.autoRefreshChk.checked;
      store.interval = Number(els.intervalSelect.value) || 10;
      updateApiLink();
      setupAutoRefresh();
      closeMenu();
      refresh();
    } catch (error) {
      setStatus(error.message, false);
    }
  }

  function updateApiLink() {
    let baseUrl = '';
    try {
      baseUrl = normalizeBaseUrl(els.baseUrlInput.value);
    } catch (_) {
      // Keep the current validation message for Save/Refresh.
    }
    els.apiLink.href = baseUrl ? `${baseUrl}/gossip` : '#';
  }

  function setupAutoRefresh() {
    if (refreshTimer) window.clearInterval(refreshTimer);
    refreshTimer = null;

    if (store.autoRefresh) {
      refreshTimer = window.setInterval(refresh, Math.max(5, store.interval) * 1000);
    }
  }

  function gossipUrl() {
    const baseUrl = normalizeBaseUrl(els.baseUrlInput.value || store.baseUrl);
    if (!baseUrl) return '';
    return els.useProxyChk.checked ? `/proxy/gossip?base=${encodeURIComponent(baseUrl)}` : `${baseUrl}/gossip`;
  }

  function resyncUrl() {
    const baseUrl = normalizeBaseUrl(els.baseUrlInput.value || store.baseUrl);
    if (!baseUrl) return '';
    return els.useProxyChk.checked ? `/proxy/resync?base=${encodeURIComponent(baseUrl)}` : `${baseUrl}/resync`;
  }

  function shutdownUrl() {
    const baseUrl = normalizeBaseUrl(els.baseUrlInput.value || store.baseUrl);
    if (!baseUrl) return '';
    return els.useProxyChk.checked ? `/proxy/shutdown?base=${encodeURIComponent(baseUrl)}` : `${baseUrl}/shutdown`;
  }

  async function refresh() {
    let url = '';
    try {
      url = gossipUrl();
    } catch (error) {
      setStatus(error.message, false);
      return;
    }
    if (!url) {
      setStatus('Please set the Base API URL.', false);
      return;
    }

    setStatus('Loading...');
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
      window.clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      render(data);
      setStatus(`Updated at ${new Date().toLocaleTimeString()}`);
    } catch (error) {
      setStatus(`Failed to load gossip: ${error.message || error}`, false);
    }
  }

  async function resyncAll() {
    let url = '';
    try {
      url = resyncUrl();
    } catch (error) {
      setStatus(error.message, false);
      return;
    }
    if (!url) {
      setStatus('Please set the Base API URL.', false);
      return;
    }
    if (!window.confirm('Delete all configured local repos and re-sync them now?')) return;

    els.resyncBtn.disabled = true;
    setStatus('Deleting local repos and re-syncing...');
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10 * 60 * 1000);
      let text = '';
      try {
        const res = await fetch(url, { method: 'POST', cache: 'no-store', signal: controller.signal });
        text = await res.text();
        if (!res.ok) throw new Error(text.trim() || `HTTP ${res.status}`);
      } finally {
        window.clearTimeout(timeout);
      }

      let countText = '';
      if (text) {
        try {
          const payload = JSON.parse(text);
          const statuses = Array.isArray(payload.Statuses) ? payload.Statuses : payload.statuses;
          if (Array.isArray(statuses)) countText = ` (${statuses.length} repos)`;
        } catch (_) {
          // The action succeeded; ignore an unexpected response shape.
        }
      }
      setStatus(`Re-sync completed${countText}. Refreshing...`);
      await refresh();
    } catch (error) {
      setStatus(`Failed to re-sync: ${error.message || error}`, false);
    } finally {
      els.resyncBtn.disabled = false;
    }
  }

  async function shutdownDropshipper() {
    let url = '';
    try {
      url = shutdownUrl();
    } catch (error) {
      setStatus(error.message, false);
      return;
    }
    if (!url) {
      setStatus('Please set the Base API URL.', false);
      return;
    }
    if (!window.confirm('Request a graceful shutdown of Dropshipper now?')) return;

    els.shutdownBtn.disabled = true;
    setStatus('Requesting Dropshipper shutdown...');
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(url, { method: 'POST', cache: 'no-store', signal: controller.signal });
        const text = await res.text();
        if (!res.ok) throw new Error(text.trim() || `HTTP ${res.status}`);
      } finally {
        window.clearTimeout(timeout);
      }

      setStatus('Shutdown requested. Dropshipper API should stop shortly.');
    } catch (error) {
      setStatus(`Failed to request shutdown: ${error.message || error}`, false);
      els.shutdownBtn.disabled = false;
    }
  }

  function setStatus(text, ok = true) {
    els.lastUpdated.textContent = text;
    els.lastUpdated.classList.toggle('error-text', !ok);
  }

  function render(data) {
    els.cards.replaceChildren();

    const nodes = store.mergeNodes ? mergeMatchingNodes(data) : (Array.isArray(data) ? data.slice() : []);
    if (nodes.length === 0) {
      els.cards.appendChild(createEl('div', 'empty', 'No nodes found.'));
      return;
    }

    nodes.sort((a, b) => Number(Boolean(b.is_local)) - Number(Boolean(a.is_local)) || nodeTitle(a).localeCompare(nodeTitle(b)));
    nodes.forEach(node => els.cards.appendChild(renderNode(node)));
  }

  function renderNode(node) {
    const card = createEl('article', 'card');
    const header = createEl('div', 'card-header');
    const titleWrap = createEl('div');

    titleWrap.appendChild(createEl('h2', 'card-title', nodeTitle(node)));
    titleWrap.appendChild(metaEl(nodeMeta(node)));
    header.appendChild(titleWrap);
    header.appendChild(nodeBadges(node));
    card.appendChild(header);

    const body = createEl('div', 'card-body');
    if (node.fetch_error) body.appendChild(errorBlock(node.fetch_error));

    const repositories = latestRepositoryStatuses(node.repositories);
    if (repositories.length === 0) {
      body.appendChild(createEl('div', 'empty small', 'No repository statuses yet.'));
    } else {
      const list = createEl('div', 'repo-list');
      repositories.forEach(status => list.appendChild(renderRepository(status)));
      body.appendChild(list);
    }

    card.appendChild(body);
    return card;
  }

  function nodeTitle(node) {
    return node.hostname || displayUrl(node.node_url) || node.node_id || 'Unknown node';
  }

  function nodeMeta(node) {
    const lastUpdated = node.last_updated || node.LastUpdated;
    return [
      { label: 'URL', value: node.node_url },
      { label: 'Node', value: node.node_id ? shortId(node.node_id) : '' },
      { label: 'Updated', value: lastUpdated ? fmtDate(lastUpdated) : '' },
      { label: 'Version', value: node.version && node.version !== 'unknown' ? `v${node.version}` : '' },
    ];
  }

  function nodeBadges(node) {
    const badges = createEl('div', 'badges');
    if (node.is_local) badges.appendChild(createEl('span', 'badge local', 'local'));
    if (node._mergedCount > 1) badges.appendChild(createEl('span', 'badge merged', `merged ${node._mergedCount}`));
    if (node.fetch_error) badges.appendChild(createEl('span', 'badge error', 'fetch error'));
    return badges;
  }

  function mergeMatchingNodes(data) {
    const nodes = Array.isArray(data) ? data.filter(Boolean) : [];
    const parents = nodes.map((_, index) => index);
    const keyOwners = new Map();

    function find(index) {
      while (parents[index] !== index) {
        parents[index] = parents[parents[index]];
        index = parents[index];
      }
      return index;
    }

    function union(left, right) {
      const leftRoot = find(left);
      const rightRoot = find(right);
      if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
    }

    nodes.forEach((node, index) => {
      nodeMergeKeys(node).forEach(key => {
        if (keyOwners.has(key)) {
          union(index, keyOwners.get(key));
        } else {
          keyOwners.set(key, index);
        }
      });
    });

    const groups = new Map();
    nodes.forEach((node, index) => {
      const root = find(index);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(node);
    });

    return Array.from(groups.values()).map(mergeNodeGroup);
  }

  function nodeMergeKeys(node) {
    const keys = new Set();
    const nodeId = normalizedText(node.node_id);
    const hostname = normalizedText(node.hostname);
    const url = normalizedNodeUrl(node.node_url);
    const urlHost = normalizedUrlHost(node.node_url);

    if (nodeId && nodeId !== 'unknown') keys.add(`id:${nodeId}`);
    if (hostname && hostname !== 'unknown') keys.add(`name:${hostname}`);
    if (url) keys.add(`url:${url}`);
    if (urlHost && urlHost !== 'unknown') keys.add(`name:${urlHost}`);
    return Array.from(keys);
  }

  function mergeNodeGroup(nodes) {
    if (nodes.length === 1) return nodes[0];

    const primary = primaryNode(nodes);
    const latest = nodes.reduce((current, node) => timeValue(nodeUpdatedAt(node)) > timeValue(nodeUpdatedAt(current)) ? node : current, nodes[0]);
    const merged = {
      ...primary,
      is_local: nodes.some(node => node.is_local),
      last_updated: nodeUpdatedAt(latest),
      repositories: nodes.flatMap(node => Array.isArray(node.repositories) ? node.repositories : []),
      _mergedCount: nodes.length,
    };

    const latestHasFetchError = Boolean(latest && latest.fetch_error);
    merged.fetch_error = latestHasFetchError ? latest.fetch_error : '';
    merged.version = firstKnownValue([primary.version, latest.version, ...nodes.map(node => node.version)]);
    merged.node_id = firstKnownValue([primary.node_id, ...nodes.map(node => node.node_id)]);
    merged.hostname = firstKnownValue([primary.hostname, ...nodes.map(node => node.hostname), displayUrl(primary.node_url)]);
    merged.node_url = firstKnownValue([primary.node_url, ...nodes.map(node => node.node_url)]);
    return merged;
  }

  function primaryNode(nodes) {
    const local = nodes.find(node => node.is_local && !node.fetch_error);
    if (local) return local;
    const healthy = nodes.find(node => !node.fetch_error);
    if (healthy) return healthy;
    return nodes.reduce((current, node) => timeValue(nodeUpdatedAt(node)) > timeValue(nodeUpdatedAt(current)) ? node : current, nodes[0]);
  }

  function firstKnownValue(values) {
    return values.find(value => {
      const normalized = normalizedText(value);
      return normalized && normalized !== 'unknown';
    }) || '';
  }

  function renderRepository(status) {
    const repo = status.Repository || {};
    const item = createEl('section', 'repo');
    const header = createEl('div', 'repo-header');

    header.appendChild(createEl('h3', 'repo-title', repo.Name || 'repository'));
    header.appendChild(repoBadges(status));
    item.appendChild(header);
    item.appendChild(metaEl(repoMeta(status)));

    if (status.ErrorMessage) item.appendChild(errorBlock(status.ErrorMessage));

    const tasks = taskStatuses(status);
    if (tasks.length > 0) item.appendChild(renderTasks(tasks));
    return item;
  }

  function repoBadges(status) {
    const badges = createEl('div', 'badges');
    const execution = String(status.ExecutionStatus || 'unknown').toLowerCase();
    const hasResult = status.Success || status.ErrorMessage || ['pulled', 'ran', 'back-off'].includes(execution);

    badges.appendChild(createEl('span', `badge ${status.Changed ? 'changed' : 'unchanged'}`, status.Changed ? 'changed' : 'unchanged'));
    if (hasResult) badges.appendChild(createEl('span', `badge ${status.Success ? 'success' : 'error'}`, status.Success ? 'success' : 'error'));
    badges.appendChild(createEl('span', `badge status status-${safeClass(execution)}`, execution));
    return badges;
  }

  function repoMeta(status) {
    const repo = status.Repository || {};
    return [
      { label: 'Version', value: status.Version || '' },
      { label: 'Commit', value: status.Sha1 ? shortSha(status.Sha1) : '' },
      { label: 'Time', value: status.Time ? fmtDate(status.Time) : '' },
      { label: 'Attempt', value: status.Attempts ? String(status.Attempts) : '' },
      { label: 'Ref', value: repo.Reference || '' },
      { label: 'Config', value: repo.ConfigPath || '' },
    ];
  }

  function renderTasks(tasks) {
    const wrap = createEl('div', 'tasks');
    const details = document.createElement('details');
    details.appendChild(createEl('summary', null, `Tasks (${tasks.length})`));

    tasks.forEach(taskStatus => {
      const task = taskStatus.Task || {};
      const row = createEl('div', 'task');
      const title = createEl('div', 'task-title');
      title.appendChild(createEl('span', null, task.Name || 'task'));
      title.appendChild(createEl('span', `badge ${taskStatus.Success ? 'success' : 'error'}`, taskStatus.Success ? 'ok' : 'fail'));
      row.appendChild(title);

      const command = Array.isArray(task.Command) ? task.Command.join(' ') : '';
      if (command) row.appendChild(createEl('code', 'command', command));
      if (taskStatus.Output) row.appendChild(createEl('pre', 'task-output', String(taskStatus.Output)));
      details.appendChild(row);
    });

    wrap.appendChild(details);
    return wrap;
  }

  function latestRepositoryStatuses(statuses) {
    // Dropshipper returns history; the UI only needs the newest row per repo/status/commit.
    const latest = new Map();
    const items = Array.isArray(statuses) ? statuses : [];

    items.forEach(status => {
      const key = JSON.stringify([
        status.Repository && status.Repository.Name ? status.Repository.Name : 'repository',
        status.ExecutionStatus || 'unknown',
        status.Sha1 || 'NO_SHA',
      ]);
      const current = latest.get(key);
      if (!current || timeValue(status.Time) >= timeValue(current.Time)) {
        latest.set(key, status);
      }
    });

    return Array.from(latest.values()).sort((a, b) => timeValue(b.Time) - timeValue(a.Time));
  }

  function taskStatuses(status) {
    if (Array.isArray(status.TaskStatues)) return status.TaskStatues;
    if (Array.isArray(status.TaskStatuses)) return status.TaskStatuses;
    return [];
  }

  function errorBlock(message) {
    return createEl('div', 'error-block', String(message));
  }

  function fmtDate(value) {
    const time = timeValue(value);
    return time ? new Date(time).toLocaleString() : String(value || '');
  }

  function timeValue(value) {
    const time = Date.parse(value || '');
    return Number.isNaN(time) ? 0 : time;
  }

  function nodeUpdatedAt(node) {
    return (node && (node.last_updated || node.LastUpdated)) || '';
  }

  function normalizedText(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizedNodeUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value);
      url.hash = '';
      url.search = '';
      url.hostname = url.hostname.toLowerCase();
      url.pathname = url.pathname.replace(/\/+$/, '');
      return url.toString().replace(/\/$/, '');
    } catch (_) {
      return String(value).trim().toLowerCase().replace(/\/+$/, '');
    }
  }

  function normalizedUrlHost(value) {
    if (!value) return '';
    try {
      return new URL(value).hostname.toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function shortSha(value) {
    const sha = String(value || '');
    if (!sha || sha === 'NO_SHA') return sha;
    return sha.slice(0, 7);
  }

  function shortId(value) {
    return String(value || '').slice(0, 8);
  }

  function displayUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value);
      return url.host;
    } catch (_) {
      return String(value).replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
  }

  function safeClass(value) {
    return String(value || 'unknown').replace(/[^a-z0-9-]/g, '-');
  }

  function openOutputModal(text) {
    if (!els.outputModal) return;
    els.modalOutput.textContent = text || '';
    els.outputModal.removeAttribute('hidden');
    document.body.classList.add('modal-open');
  }

  function closeOutputModal() {
    if (!els.outputModal) return;
    els.outputModal.setAttribute('hidden', '');
    document.body.classList.remove('modal-open');
  }

  init();
})();
