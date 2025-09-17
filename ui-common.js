/* =====================================
   SJIT UI Common v0.1 (ESM)
   - Sidebar builder
   - Tabs binding (hash sync)
   - Rotator/Ticker with fade
   ===================================== */

export const SJUI = (() => {
  /* ---------- Utils ---------- */
  const $ = (sel, el=document) => el.querySelector(sel);
  const $$ = (sel, el=document) => Array.from(el.querySelectorAll(sel));

  function h(tag, attrs={}, children=[]) {
    const el = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (v !== undefined && v !== null) el.setAttribute(k, v);
    }
    for (const c of (children || [])) el.append(c?.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }

  function setActiveByHref(links, current=location.pathname + location.search + location.hash) {
    links.forEach(a => {
      const match = a.dataset.activeMatch || a.getAttribute('href');
      if (!match) return;
      if (current.includes(match)) {
        a.classList.add('is-active', 'active');
        a.setAttribute('aria-current', 'page');
      }
    });
  }

  /* ---------- Sidebar ---------- */
  function buildSidebar(root, opts) {
    const {
      logo = { text: 'Tag Monitor', href: '#', iconSrc: '', version: '', subtext: 'SJIT · Dashboard' },
      search = false,
      sections = [],
      initiallyOpen = false
    } = opts || {};

    root.classList.add('sj-sidebar');

    // ===== 브랜드 블록 =====
    const brandEl = h('div', { class: 'sj-sidebar__brand' });

    // 타이틀(파랑) + 서브타이틀(회색)
    const titleEl = h('div', { class: 'sj-brand-title', style:'color:#1E88E5;font-weight:800;font-size:20px;line-height:1.2;' }, [
      logo.text || 'Tag Monitor'
    ]);
    const subEl = h('div', { class: 'sj-brand-sub', style:'margin-top:2px;font-size:12px;color:#64748b;' }, [
      logo.subtext || 'SJIT · Dashboard'
    ]);

    // 인사말
    const greetEl = h('div', { id:'sidebar-greet', class:'sj-sidebar__greet hidden',
      style:'padding-top:6px;font-size:12px;color:#1f2937;' }, [
      h('span', { id:'sidebar-greet-name', class:'name', style:'font-weight:600;color:#1f2937;' }),
      '님 안녕하세요!'
    ]);

    // ==== 액션 버튼들(인사말 아래): 계정 설정 + 로그아웃 ====
    // 컨테이너는 좌측 정렬, 상단 여백만 주고 가로로 배치
    const actionsEl = h('div', {
      class:'sj-brand-actions',
      style:'margin-left:0;display:flex;align-items:center;gap:8px;margin-top:8px;'
    });

    // 계정 설정(톱니)
    const settingsBtn = h('button', {
      type:'button',
      class:'sj-btn-logout sj-btn-settings', // 공용 버튼 스타일 재사용
      'aria-label':'계정 설정',
      style:'display:flex;align-items:center;gap:6px;'
    }, [
      h('i', { class:'ri-settings-3-line sj-icon' }),
      document.createTextNode('계정 설정')
    ]);
    settingsBtn.addEventListener('click', () => {
      const u = new URL('account.html', location.href);
      location.href = u.toString();
    });

    // 로그아웃
    const logoutBtn = h('button', {
      type:'button',
      class:'sj-btn-logout',
      style:'display:flex;align-items:center;gap:6px;'
    }, [
      h('i', { class:'ri-logout-box-r-line sj-icon' }),
      document.createTextNode('로그아웃')
    ]);
    function doLogout(){
      try{
        sessionStorage.removeItem('app_session');
        sessionStorage.removeItem('app_user_email');
        sessionStorage.removeItem('app_is_admin');
      }catch{}
      try{
        if (window.AmazonCognitoIdentity && window.__POOL__) {
          const pool = new AmazonCognitoIdentity.CognitoUserPool(window.__POOL__);
          const u = pool.getCurrentUser();
          if (u) u.signOut();
        }
      }catch{}
      const login = window.__LOGIN_PAGE__ || 'login.html';
      const u = new URL(login, location.href);
      u.searchParams.delete('redirect');
      location.replace(u.toString());
    }
    logoutBtn.addEventListener('click', doLogout);
    window.__logout = doLogout;

    actionsEl.append(settingsBtn, logoutBtn);

    // 이메일 있으면 인사말 노출
    try {
      const email = sessionStorage.getItem('app_user_email') || '';
      if (email) {
        greetEl.classList.remove('hidden');
        $('#sidebar-greet-name', greetEl).textContent = email;
      }
    } catch {}

    // 브랜드 블록 순서: 타이틀 → 서브타이틀 → 인사말 → 버튼들
    brandEl.append(titleEl, subEl, greetEl, actionsEl);
    root.append(brandEl);
    // ===== 브랜드 블록 끝 =====

    // Search (optional)
    if (search) {
      const searchEl = h('div', { class: 'sj-sidebar__search' }, [
        h('input', { type: 'search', placeholder: 'Search…', 'aria-label': 'Search navigation' })
      ]);
      root.append(searchEl);
    }

    // Sections
    sections.forEach(sec => {
      const secEl = h('div', { class: 'sj-sidebar__section' });
      const nav = h('nav', { class: 'sj-nav' });
      (sec.items || []).forEach(it => {
        const a = h('a', {
          href: it.href || '#',
          'data-active-match': it.activeMatch || '',
          class: 'sidebar-item flex items-center gap-2 px-3 py-2 rounded-md text-gray-700'
        }, [
          it.icon ? h('i', { class: it.icon + ' sj-icon' }) : h('span', { class: 'sj-icon' }, ['•']),
          h('span', {}, [it.label || 'Untitled'])
        ]);
        nav.append(a);
      });
      secEl.append(nav);
      root.append(secEl);
      setActiveByHref($$('a', nav));
    });

    if (initiallyOpen) root.classList.add('is-open');

    return {
      open: () => root.classList.add('is-open'),
      close: () => root.classList.remove('is-open'),
      toggle: () => root.classList.toggle('is-open')
    };
  }

  /* ---------- Tabs ---------- */
  function bindTabs(root, { syncHash=true } = {}) {
    const tablist = $('[role="tablist"]', root) || h('div', { class: 'sj-tabs', role: 'tablist' });
    const tabs = $$('[role="tab"]', tablist);
    const panels = $$('[role="tabpanel"]', root);

    function activate(id) {
      tabs.forEach(t => {
        const selected = t.getAttribute('aria-controls') === id || t.dataset.tab === id;
        t.setAttribute('aria-selected', selected ? 'true' : 'false');
        t.classList.toggle('is-active', selected);
        t.tabIndex = selected ? 0 : -1;
      });
      panels.forEach(p => {
        const on = p.id === id || p.dataset.tab === id;
        p.classList.toggle('is-active', on);
        p.hidden = !on;
      });
      if (syncHash) {
        try { history.replaceState(null, '', `#${id}`); } catch {}
      }
    }

    tabs.forEach(t => t.addEventListener('click', e => {
      e.preventDefault();
      const id = t.getAttribute('aria-controls') || t.dataset.tab;
      if (id) activate(id);
    }));

    const initial = (location.hash || '').replace('#','') || (tabs[0] && (tabs[0].getAttribute('aria-controls') || tabs[0].dataset.tab));
    if (initial) activate(initial);

    return { activate };
  }

  /* ---------- Rotator / Ticker ---------- */
  function Rotator(el, items=[], { interval=3500, badge=false } = {}) {
    el.classList.add('sj-rotator');
    let idx = 0, cur = null, timer = null;

    function clear() {
      clearTimeout(timer);
      timer = null;
      cur = null;
      while (el.firstChild) el.removeChild(el.firstChild);
    }

    function mount(i) {
      if (!items.length) return null;
      const data = items[i % items.length] ?? {};
      const text = (typeof data === 'string') ? data : (data.text ?? '');
      if (!text) return null;

      const node = h('div', { class: 'sj-rotator__item sj-fade-enter' }, [
        badge ? h('span', { class: 'sj-rotator__badge' }, [typeof badge === 'string' ? badge : 'INFO']) : null,
        h('div', { class: 'sj-rotator__text' }, [text])
      ].filter(Boolean));
      el.append(node);
      requestAnimationFrame(() => node.classList.add('sj-fade-enter-active'));
      return node;
    }

    function unmount(node) {
      node.classList.remove('sj-fade-enter', 'sj-fade-enter-active');
      node.classList.add('sj-fade-exit');
      requestAnimationFrame(() => {
        node.classList.add('sj-fade-exit-active');
        setTimeout(() => node.remove(), 350);
      });
    }

    function schedule() {
      clearTimeout(timer);
      if (!items.length) return;
      timer = setTimeout(tick, interval);
    }

    function tick() {
      if (!items.length) { clear(); return; }
      const next = mount(++idx);
      if (!next) { schedule(); return; }
      if (cur) unmount(cur);
      cur = next;
      schedule();
    }

    // init
    if (items.length) { cur = mount(idx); schedule(); }
    schedule();

    return {
      stop: clear,
      start: () => { if (items.length && !timer) schedule(); },
      go: (i) => { idx = i; tick(); },
      update: (list = []) => {
        const filtered = (Array.isArray(list) ? list : []).filter(x => {
          const t = (typeof x === 'string') ? x : (x && x.text);
          return t && String(t).trim();
        });
        items = filtered;
        clear();
        if (items.length) {
          idx = 0;
          cur = mount(idx);
          schedule();
        }
      }
    };
  }

  /* ---------- Auto-init hooks ---------- */
  function autoInit(options={}) {
    // Sidebar via [data-sj-sidebar]
    $$('[data-sj-sidebar]').forEach(sidebar => {
      const cfg = options.sidebar || window.__SJ_SIDEBAR__ || {};
      buildSidebar(sidebar, cfg);
    });

    // Tabs via [data-sj-tabs]
    $$('[data-sj-tabs]').forEach(root => bindTabs(root, options.tabs));

    // Rotator via [data-sj-rotator]
    $$('[data-sj-rotator]').forEach(el => {
      const items = (options.rotator && options.rotator.items) || window.__SJ_ROTATOR__ || [];
      const interval = (options.rotator && options.rotator.interval) || 3500;
      const badge = (options.rotator && options.rotator.badge) || false;
      Rotator(el, items, { interval, badge });
    });
  }

  return { buildSidebar, bindTabs, Rotator, autoInit };
})();

// Auto-run if loaded as module and DOM ready (robust)
if (typeof window !== 'undefined') {
  const run = () => { try { SJUI.autoInit(); } catch(e) { console.error(e); } };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once:true });
  } else {
    run();
  }
}

function _macHex12FromAny(s=''){
  const text = String(s || '');
  // 콜론 MAC (AA:BB:...:FF) 우선 추출
  const m1 = text.match(/([0-9a-f]{2}:){5}[0-9a-f]{2}/i);
  if (m1) return m1[0].replace(/:/g,'').toUpperCase();
  // 구분자 없는 12hex도 시도
  const m2 = text.match(/[0-9a-f]{12}/i);
  if (m2) return m2[0].toUpperCase();
  return null;
}
function _normalizeAlert(item){
  if (typeof item === 'string') {
    const idHex = _macHex12FromAny(item);
    return { text: item, idHex, kind: idHex ? 'device' : 'unknown', level: 'info' };
  }
  const text  = String(item?.text ?? '');
  const idHex = (item?.idHex) || (item?.id ? String(item.id).replace(/[:\-\.]/g,'').toUpperCase() : _macHex12FromAny(text));
  const kind  = item?.kind || (text.includes('게이트웨이') ? 'gateway' : (idHex ? 'device' : 'unknown'));
  const level = item?.level || 'info';
  return { text, idHex, kind, level };
}
function _isAdmin(){
  try { return sessionStorage.getItem('app_is_admin') === '1'; } catch { return false; }
}
function _allowedSet(){
  try { return new Set(window.__ALLOWED_TAG_IDS || []); } catch { return new Set(); }
}
function _isAllowedTickerItem(alert){
  // 허용목록이 아직 준비 안 됐으면 표시하지 않음(초기 오염 방지)
  if (!window.__ALLOWED_READY) return false;
  const allow = _allowedSet();
  if (alert.kind === 'device') return !!alert.idHex && allow.has(alert.idHex);
  if (alert.kind === 'gateway') return _isAdmin(); // 필요시 조정
  return false;
}

const TickerHub = (() => {
  let rotators = new Set();
  let rawItems = [];
  let msgs = [];
  let _lastMsgsKey = '';

  function _dedupText(arr){ return [...new Set(arr.map(s=>String(s).trim()).filter(Boolean))]; }
  
  function _rebuild(){
    // 허용목록 기준으로 필터 후 텍스트만 추출
    const filtered = rawItems.filter(_isAllowedTickerItem);
    const nextMsgs = _dedupText(filtered.map(a => a.text));
    const key = nextMsgs.join('\n'); // 배열 동등성 체크 키
    if (key === _lastMsgsKey) return; // 내용 동일 → 아무 것도 하지 않음(깜빡임 방지)
    _lastMsgsKey = key;
    msgs = nextMsgs;
    rotators.forEach(r => r.update(msgs));
  }

  function setAlerts(alerts){
    const next = Array.isArray(alerts) ? alerts : [];
    rawItems = next.map(_normalizeAlert);
    _rebuild(); // 허용 필터 적용
  }
  
  function pushAlerts(alerts){
    const next = Array.isArray(alerts) ? alerts : [];
    rawItems = [...rawItems, ...next.map(_normalizeAlert)];
    _rebuild();
  }

  function register(rotator){ rotators.add(rotator); rotator.update(msgs); return () => rotators.delete(rotator); }
  function getMsgs(){ return msgs.slice(); }
  function refreshFilter(){ _rebuild(); }

  window.addEventListener('sjui:alert-set',  e => setAlerts(e.detail?.alerts ?? e.detail?.msgs ?? []));
  window.addEventListener('sjui:alert-push', e => pushAlerts(e.detail?.alerts ?? e.detail?.msgs ?? []));
  window.addEventListener('sjui:ticker-set', e => setAlerts((e.detail?.msgs ?? []).map(t => ({text:t}))));

  return { setAlerts, pushAlerts, register, getMsgs, refreshFilter };
})();

function mountRotators(){
  document.querySelectorAll('[data-sj-rotator]').forEach(el => {
    const r = SJUI.Rotator(el, TickerHub.getMsgs(), { interval: 2500, badge: 'ALERT' });
    TickerHub.register(r);
  });
}

window.SJUI = window.SJUI || {};
window.SJUI.TickerHub = TickerHub;
window.SJUI.mountRotators = mountRotators;

if (document.readyState !== 'loading') mountRotators();
else document.addEventListener('DOMContentLoaded', mountRotators, { once:true });
