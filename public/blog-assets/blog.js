// Sopro · o blog da RUAH. Busca na lista, barra de leitura, sumário e "copiar link".
(function () {
  'use strict';

  // Busca: filtra os cartões já na página, sem ir ao servidor.
  var busca = document.getElementById('busca');
  if (busca) {
    var cartoes = Array.prototype.slice.call(document.querySelectorAll('.lista-art .cartao'));
    var nada = document.querySelector('.sem-resultado');
    var tirar = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
    busca.addEventListener('input', function () {
      var termos = tirar(busca.value.trim()).split(/\s+/).filter(Boolean);
      var vistos = 0;
      cartoes.forEach(function (c) {
        var texto = tirar(c.getAttribute('data-busca') || '');
        var ok = termos.every(function (t) { return texto.indexOf(t) !== -1; });
        c.hidden = !ok;
        if (ok) vistos += 1;
      });
      if (nada) nada.hidden = vistos > 0;
    });
  }

  // Barra de leitura e sumário que acompanha a seção.
  var barra = document.querySelector('.leitura span');
  var texto = document.querySelector('.texto');
  var links = Array.prototype.slice.call(document.querySelectorAll('.sumario a'));
  var titulos = links.map(function (a) { return document.getElementById(decodeURIComponent(a.hash.slice(1))); });
  if (barra && texto) {
    var pedido = false;
    var atualizar = function () {
      pedido = false;
      var r = texto.getBoundingClientRect();
      var total = r.height - window.innerHeight * 0.6;
      var p = Math.min(1, Math.max(0, -r.top / (total > 0 ? total : 1)));
      barra.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      var atual = -1;
      titulos.forEach(function (t, i) { if (t && t.getBoundingClientRect().top < 120) atual = i; });
      links.forEach(function (a, i) { a.classList.toggle('aqui', i === atual); });
    };
    window.addEventListener('scroll', function () { if (!pedido) { pedido = true; requestAnimationFrame(atualizar); } }, { passive: true });
    atualizar();
  }
  // No celular o sumário começa fechado.
  var sumario = document.querySelector('.sumario');
  if (sumario && window.matchMedia('(max-width: 1100px)').matches) sumario.open = false;

  // Copiar link.
  Array.prototype.forEach.call(document.querySelectorAll('[data-copiar]'), function (b) {
    b.addEventListener('click', function () {
      var url = b.getAttribute('data-copiar');
      var feito = function () { var t = b.textContent; b.textContent = 'Link copiado'; setTimeout(function () { b.textContent = t; }, 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(feito, function () { window.prompt('Copie o link:', url); });
      else window.prompt('Copie o link:', url);
    });
  });

  // Contato: as chamadas levam ao formulário já com o motivo marcado; o envio vira lead no CRM.
  var form = document.querySelector('[data-contato-blog]');
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-motivo]');
    if (!b || !form) return;
    e.preventDefault();
    var r = form.querySelector('input[name=motivo][value="' + b.getAttribute('data-motivo') + '"]');
    if (r) r.checked = true;
    var sec = document.getElementById('contato');
    sec.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    setTimeout(function () { var n = form.querySelector('[name=nome]'); if (n) n.focus({ preventScroll: true }); }, 450);
  });
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var msg = form.querySelector('.contato-msg'), botao = form.querySelector('button[type=submit]');
    var d = {};
    Array.prototype.forEach.call(form.querySelectorAll('input,textarea'), function (c) {
      if (!c.name) return;
      if (c.type === 'radio') { if (c.checked) d[c.name] = c.value; return; }
      d[c.name] = c.type === 'checkbox' ? c.checked : c.value;
    });
    var aviso = function (t, erro) { msg.hidden = false; msg.textContent = t; msg.classList.toggle('erro', !!erro); };
    if (!d.nome.trim()) return aviso('Diga seu nome.', true);
    if (d.telefone.replace(/\D/g, '').length < 10) return aviso('Confira o telefone, com DDD.', true);
    if (!d.aceite) return aviso('Marque que concorda com o uso dos dados para o contato.', true);
    botao.disabled = true; botao.textContent = 'Enviando…';
    fetch('/api/publico/blog/contato', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (r) {
        if (!r.ok) throw new Error(r.j && r.j.erro || 'Não foi possível enviar.');
        form.classList.add('enviado');
        aviso('Recebemos seu contato. Um corretor da RUAH responde em breve, em horário comercial.');
        botao.textContent = 'Enviado';
      })
      .catch(function (err) { aviso(err.message || 'Não foi possível enviar. Tente de novo.', true); botao.disabled = false; botao.textContent = 'Enviar para a RUAH'; });
  });
})();
