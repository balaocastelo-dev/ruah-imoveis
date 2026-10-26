// Portal RUAH · favoritos, filtros, galeria em tela cheia, fotos por ambiente,
// formulário de interesse e "compartilhar". Tudo funciona sem este arquivo
// (a página vem pronta do servidor); ele só deixa a navegação mais confortável.
(function () {
  'use strict';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  // ------------------------------------------------------------ favoritos
  var CHAVE = 'ruah-favoritos';
  function lerFavs() { try { var v = JSON.parse(localStorage.getItem(CHAVE) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function gravarFavs(l) { try { localStorage.setItem(CHAVE, JSON.stringify(l)); } catch (e) { /* aparelho sem armazenamento */ } }
  function pintarFavs() {
    var favs = lerFavs();
    $$('[data-fav]').forEach(function (b) {
      var on = favs.indexOf(b.getAttribute('data-fav')) !== -1;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (b.classList.contains('p-link')) b.textContent = on ? 'Nos seus favoritos' : 'Guardar nos favoritos';
    });
    $$('[data-fav-n]').forEach(function (n) { n.textContent = favs.length; n.hidden = !favs.length; });
    var area = $('[data-favoritos]');
    if (area) {
      var vistos = 0;
      $$('.p-cartao', area).forEach(function (c) { var on = favs.indexOf(c.getAttribute('data-codigo')) !== -1; c.hidden = !on; if (on) vistos += 1; });
      var vazio = $('[data-favoritos-vazio]', area);
      if (vazio) vazio.hidden = vistos > 0;
    }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-fav]');
    if (!b) return;
    e.preventDefault();
    var cod = b.getAttribute('data-fav'), favs = lerFavs(), i = favs.indexOf(cod);
    if (i === -1) favs.unshift(cod); else favs.splice(i, 1);
    gravarFavs(favs.slice(0, 100));
    pintarFavs();
  });
  pintarFavs();

  // ------------------------------------------------------------ filtros: trocar a opção já busca
  var filtros = $('[data-filtros]');
  if (filtros) $$('select', filtros).forEach(function (s) { s.addEventListener('change', function () { filtros.submit(); }); });

  // ------------------------------------------------------------ galeria em tela cheia
  var mos = $('[data-galeria]');
  var fotos = [];
  try { fotos = mos ? JSON.parse(mos.getAttribute('data-galeria')) : []; } catch (e) { fotos = []; }
  var luz, img, cont, leg, tiras, atual = 0, voltar = null, toque = null;
  function idDe(src) { var m = /(\d+)$/.exec(src); return m ? m[1] : ''; }
  function montar() {
    luz = document.createElement('div');
    luz.className = 'p-luz'; luz.hidden = true;
    luz.setAttribute('role', 'dialog'); luz.setAttribute('aria-modal', 'true'); luz.setAttribute('aria-label', 'Fotos do imóvel');
    luz.innerHTML = '<div class="p-luz-topo"><span class="p-luz-cont" aria-live="polite"></span><span class="p-luz-leg"></span><button type="button" class="p-luz-x" aria-label="Fechar (Esc)">✕</button></div>' +
      '<div class="p-luz-palco"><button type="button" class="p-luz-seta p-luz-ant" aria-label="Foto anterior">‹</button><img alt=""><button type="button" class="p-luz-seta p-luz-prox" aria-label="Próxima foto">›</button></div>' +
      '<div class="p-luz-tiras" role="group" aria-label="Miniaturas"></div>';
    document.body.appendChild(luz);
    img = $('img', luz); cont = $('.p-luz-cont', luz); leg = $('.p-luz-leg', luz); tiras = $('.p-luz-tiras', luz);
    tiras.innerHTML = fotos.map(function (f, i) { return '<button type="button" data-i="' + i + '" aria-label="Foto ' + (i + 1) + '"><img src="' + f.src + '" alt="" loading="lazy"></button>'; }).join('');
    $('.p-luz-x', luz).addEventListener('click', fechar);
    $('.p-luz-ant', luz).addEventListener('click', function () { vai(-1); });
    $('.p-luz-prox', luz).addEventListener('click', function () { vai(1); });
    tiras.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { atual = +b.getAttribute('data-i'); mostrar(); } });
    $('.p-luz-palco', luz).addEventListener('click', function (e) { if (e.target === e.currentTarget) fechar(); });
    luz.addEventListener('touchstart', function (e) { if (e.touches.length === 1) toque = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
    luz.addEventListener('touchend', function (e) {
      if (!toque) return;
      var dx = e.changedTouches[0].clientX - toque.x, dy = e.changedTouches[0].clientY - toque.y; toque = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) vai(dx < 0 ? 1 : -1);
      else if (dy > 90) fechar();
    });
    document.addEventListener('keydown', function (e) {
      if (luz.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); fechar(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); vai(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); vai(-1); }
    });
  }
  function mostrar() {
    var f = fotos[atual];
    img.classList.add('carregando');
    img.onload = function () { img.classList.remove('carregando'); };
    img.src = f.src; img.alt = f.legenda || ('Foto ' + (atual + 1));
    cont.textContent = (atual + 1) + ' / ' + fotos.length;
    leg.textContent = f.legenda || '';
    $$('button', tiras).forEach(function (b, i) { b.setAttribute('aria-current', i === atual ? 'true' : 'false'); });
    var t = tiras.children[atual]; if (t && t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'center' });
    [1, -1].forEach(function (d) { new Image().src = fotos[(atual + d + fotos.length) % fotos.length].src; });
  }
  function vai(d) { atual = (atual + d + fotos.length) % fotos.length; mostrar(); }
  function abrir(id) {
    if (!fotos.length) return;
    if (!luz) montar();
    var i = fotos.findIndex(function (f) { return idDe(f.src) === String(id); });
    atual = i < 0 ? 0 : i;
    voltar = document.activeElement;
    luz.hidden = false; document.body.classList.add('p-luz-aberta');
    mostrar();
    $('.p-luz-x', luz).focus();
  }
  function fechar() { luz.hidden = true; document.body.classList.remove('p-luz-aberta'); if (voltar && voltar.focus) voltar.focus(); }
  document.addEventListener('click', function (e) { var b = e.target.closest('[data-ver]'); if (b && fotos.length) { e.preventDefault(); abrir(b.getAttribute('data-ver')); } });

  // ------------------------------------------------------------ fotos por ambiente
  var amb = $('.p-amb');
  if (amb) amb.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var a = b.getAttribute('data-amb');
    $$('button', amb).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    $$('.p-galeria figure').forEach(function (f) { f.hidden = !!a && f.getAttribute('data-amb') !== a; });
  });

  // ------------------------------------------------------------ contato
  var form = $('[data-interesse]');
  var caixaVisita = form && $('[data-visita]', form);
  var camposVisita = form && $('[data-visita-campos]', form);
  function syncVisita() { if (camposVisita) camposVisita.hidden = !caixaVisita.checked; }
  if (caixaVisita) caixaVisita.addEventListener('change', syncVisita);
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-contato]');
    if (!b || !form) return;
    e.preventDefault();
    if (caixaVisita) { caixaVisita.checked = b.getAttribute('data-contato') === 'visita'; syncVisita(); }
    var sec = $('#contato');
    sec.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    sec.classList.remove('p-contato-pisca'); void sec.offsetWidth; sec.classList.add('p-contato-pisca');
    setTimeout(function () { var n = $('[name=nome]', form); if (n) n.focus({ preventScroll: true }); }, 450);
  });
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = $('.p-form-msg', form), botao = $('button[type=submit]', form);
    var d = {};
    $$('input,select,textarea', form).forEach(function (c) { if (!c.name) return; d[c.name] = c.type === 'checkbox' ? c.checked : c.value; });
    var aviso = function (t, erro) { msg.hidden = false; msg.textContent = t; msg.classList.toggle('erro', !!erro); };
    if (!d.nome.trim()) return aviso('Diga seu nome.', true);
    if (d.telefone.replace(/\D/g, '').length < 10) return aviso('Confira o telefone, com DDD.', true);
    if (!d.aceite) return aviso('Marque que concorda com o uso dos dados para o contato.', true);
    botao.disabled = true; botao.textContent = 'Enviando…';
    fetch('/api/publico/portal/interesse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.j && r.j.erro || 'Não foi possível enviar.');
        form.closest('.p-contato').classList.add('enviado');
        aviso(d.visita ? 'Pedido de visita enviado. Um corretor da RUAH vai confirmar o dia e o horário com você.' : 'Recebemos seu contato. Um corretor da RUAH responde em breve, em horário comercial.');
      })
      .catch(function (err) { aviso(err.message || 'Não foi possível enviar. Tente de novo ou fale pelo WhatsApp.', true); botao.disabled = false; botao.textContent = 'Enviar para o corretor'; });
  });

  // ------------------------------------------------------------ compartilhar
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-compartilhar]'); if (!b) return;
    var url = b.getAttribute('data-compartilhar'), titulo = b.getAttribute('data-titulo') || document.title;
    if (navigator.share) { navigator.share({ title: titulo, url: url }).catch(function () {}); return; }
    var feito = function () { var t = b.textContent; b.textContent = 'Link copiado'; setTimeout(function () { b.textContent = t; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(feito, function () {});
  });
})();
