/* Sistema RUAH — Movimento (estilo "Dashboard V18")
   Só animação: as cores continuam as do style.css. Nada aqui muda dados ou regras do sistema.
   - entrada em cascata dos cards, listas, tabelas e kanban a cada tela;
   - números dos indicadores contando do zero;
   - barra dourada que desliza no menu lateral;
   - onda ao clicar nos botões, brilho do mouse nos indicadores;
   - mensagens novas do WhatsApp entrando sozinhas.
   Respeita "reduzir movimento" do Windows/celular. */
(function () {
  'use strict';
  if (!window.Element || !Element.prototype.animate) return;
  const reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  const parado = () => reduz && reduz.matches;

  const SUAVE = 'cubic-bezier(.22,1,.36,1)';
  const ALVOS = '.eyebrow,h1,.lead,.banner,.card,.imcardw,.item,.col,.lc,fieldset,.tabs,.seg,.empty,.timeline>div,tbody>tr,.sug,.alertas,' +
    '.side,.brand,.who,#nav a,#nav .grp,.wrap>*';
  const IGNORA = '.gal,#toast,#modal,#chat';

  // Só anima o que aparece por ação da pessoa (abrir tela, buscar, clicar, arrastar).
  // Atualizações automáticas em segundo plano não piscam a tela.
  let armadoAte = performance.now() + 3000;
  const arma = () => { armadoAte = performance.now() + 2500; };
  ['click', 'submit', 'drop', 'hashchange', 'popstate'].forEach((ev) => window.addEventListener(ev, arma, true));
  ['input', 'change'].forEach((ev) => window.addEventListener(ev, (e) => {
    const t = e.target;
    if (t && (t.tagName === 'SELECT' || /^busca|^filtro/.test(t.id || ''))) arma();
  }, true));
  const armado = () => performance.now() < armadoAte;

  // ---------- entrada em cascata ----------
  function entra(el, atraso, de) {
    el.animate([de || { opacity: 0, transform: 'translateY(14px) scale(.985)' }, { opacity: 1, transform: 'none' }],
      { duration: 560, delay: atraso, easing: SUAVE, fill: 'backwards' });
  }
  const DE_LADO = { opacity: 0, transform: 'translateX(-18px)' };
  const SO_OPACO = { opacity: 0 };

  function cascata(lista) {
    let i = 0;
    for (const el of lista) {
      if (i >= 70) break;
      const atraso = Math.min(i * 38, 650);
      const de = el.matches('tbody>tr') ? SO_OPACO : el.matches('.side,#nav a,#nav .grp') ? DE_LADO : null;
      entra(el, atraso, de);
      if (el.matches('.kpi')) { const n = el.querySelector('.n'); if (n) conta(n, atraso + 120); }
      i++;
    }
  }

  // ---------- números contando ----------
  const contando = new WeakSet();
  function conta(el, atraso) {
    if (contando.has(el)) return;
    const txt = el.textContent.trim();
    const m = txt.match(/^(\D*?)(\d{1,3}(?:\.\d{3})+|\d+)(\D*)$/);
    if (!m) return;
    const alvo = Number(m[2].replace(/\./g, ''));
    if (!alvo || alvo > 1e10) return;
    contando.add(el);
    const fmt = (v) => m[1] + Math.round(v).toLocaleString('pt-BR') + m[3];
    el.textContent = fmt(0);
    setTimeout(() => {
      const ini = performance.now(), dur = alvo < 10 ? 500 : 1100;
      const passo = (agora) => {
        if (!el.isConnected) return;
        const p = Math.min(1, (agora - ini) / dur);
        el.textContent = fmt(alvo * (1 - Math.pow(1 - p, 4)));
        if (p < 1) requestAnimationFrame(passo); else { el.textContent = txt; contando.delete(el); }
      };
      requestAnimationFrame(passo);
    }, atraso);
  }

  // ---------- conversa do WhatsApp: só as mensagens novas entram ----------
  function conversa(box) {
    const chat = box.querySelector('#chat');
    const msgs = chat ? [...chat.querySelectorAll('.msg')] : [];
    const chave = (box.querySelector('b') || {}).textContent || '';
    const antes = box._mov;
    box._mov = { chave, n: msgs.length };
    if (!antes || antes.chave !== chave) {
      cascata([...box.children].filter((c) => c.id !== 'chat'));
      msgs.slice(-12).forEach((m, i) => entra(m, 120 + i * 45, { opacity: 0, transform: 'translateY(10px) scale(.96)' }));
      return;
    }
    msgs.slice(antes.n).forEach((m, i) => entra(m, i * 80, {
      opacity: 0, transform: `translateX(${m.classList.contains('saida') ? 24 : -24}px) scale(.94)`,
    }));
  }

  // ---------- observa tudo que entra na tela ----------
  const obs = new MutationObserver((recs) => {
    if (parado()) return;
    const novos = new Set(), boxes = new Set();
    for (const r of recs) {
      if (r.target.id === 'conversa') { boxes.add(r.target); continue; }
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1 || !n.isConnected || n.closest(IGNORA)) continue;
        if (n.closest('#conversa')) continue;
        if (n.matches(ALVOS)) novos.add(n);
        n.querySelectorAll(ALVOS).forEach((x) => { if (!x.closest(IGNORA) && !x.closest('#conversa')) novos.add(x); });
        const box = n.querySelector && n.querySelector('#conversa');
        if (box && box.children.length) boxes.add(box);
      }
    }
    boxes.forEach(conversa);
    if (novos.size && armado()) cascata([...novos].sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1)));
    montaIndicador();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // ---------- barra dourada que desliza no menu ----------
  let navObs = null;
  function montaIndicador() {
    const nav = document.getElementById('nav');
    if (!nav || nav.querySelector('.nav-ind')) return;
    const ind = document.createElement('span');
    ind.className = 'nav-ind';
    ind.setAttribute('aria-hidden', 'true');
    nav.prepend(ind);
    nav.classList.add('ind');
    let primeira = true;
    const move = () => {
      const a = nav.querySelector('a.on');
      if (!a) { ind.style.opacity = '0'; return; }
      if (primeira) { ind.style.transition = 'none'; }
      ind.style.opacity = '1';
      ind.style.width = a.offsetWidth + 'px';
      ind.style.height = a.offsetHeight + 'px';
      ind.style.transform = `translate(${a.offsetLeft}px,${a.offsetTop}px)`;
      if (primeira) { void ind.offsetWidth; ind.style.transition = ''; primeira = false; }
    };
    if (navObs) navObs.disconnect();
    navObs = new MutationObserver((recs) => {
      let mexe = false;
      for (const r of recs) {
        if (r.type === 'attributes') { if (r.target.tagName === 'A') mexe = true; continue; }
        const ct = r.target.nodeType === 1 ? r.target.closest('.ct') : r.target.parentElement && r.target.parentElement.closest('.ct');
        if (ct && !ct.hidden && !parado()) { ct.classList.remove('pulsa'); void ct.offsetWidth; ct.classList.add('pulsa'); }
      }
      if (mexe) move();
    });
    navObs.observe(nav, { attributes: true, attributeFilter: ['class', 'hidden'], subtree: true, childList: true, characterData: true });
    window.addEventListener('resize', move);
    requestAnimationFrame(move);
    setTimeout(move, 700); // depois da entrada do menu
  }

  // ---------- onda ao clicar nos botões ----------
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.btn,.seg button');
    if (!b || b.disabled || parado()) return;
    const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
    const o = document.createElement('span');
    o.className = 'onda';
    o.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(o);
    setTimeout(() => o.remove(), 650);
  });

  // ---------- brilho que segue o mouse nos indicadores e cards ----------
  document.addEventListener('pointermove', (e) => {
    const c = e.target.closest && e.target.closest('.kpi,.imcardw');
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  // primeira tela (login ou sistema já aberto)
  if (document.readyState !== 'loading') montaIndicador();
})();
