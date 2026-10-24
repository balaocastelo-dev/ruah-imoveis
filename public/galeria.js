/* Galeria de fotos em tela cheia (sem sair da página): X para fechar, setas, teclado e deslizar no celular.
   Uso: abrirGaleria(['url1','url2',...], indiceInicial, 'legenda opcional') */
(function () {
  let el, img, cont, leg, fotos = [], atual = 0, voltarFoco = null, toque = null;

  function monta() {
    el = document.createElement('div');
    el.className = 'gal';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Fotos do imóvel');
    el.innerHTML = `<div class="gal-topo"><span class="gal-cont" aria-live="polite"></span><span class="gal-leg"></span>
        <button type="button" class="gal-x" aria-label="Fechar (Esc)" title="Fechar (Esc)">✕</button></div>
      <button type="button" class="gal-seta gal-ant" aria-label="Foto anterior" title="Anterior (←)">‹</button>
      <div class="gal-palco"><img alt=""></div>
      <button type="button" class="gal-seta gal-prox" aria-label="Próxima foto" title="Próxima (→)">›</button>`;
    document.body.appendChild(el);
    img = el.querySelector('img'); cont = el.querySelector('.gal-cont'); leg = el.querySelector('.gal-leg');
    el.querySelector('.gal-x').addEventListener('click', fechar);
    el.querySelector('.gal-ant').addEventListener('click', () => vai(-1));
    el.querySelector('.gal-prox').addEventListener('click', () => vai(1));
    // clicar no fundo escuro (fora da foto) também fecha
    el.querySelector('.gal-palco').addEventListener('click', (e) => { if (e.target !== img) fechar(); });
    el.addEventListener('touchstart', (e) => { if (e.touches.length === 1) toque = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (!toque) return;
      const dx = e.changedTouches[0].clientX - toque.x, dy = e.changedTouches[0].clientY - toque.y;
      toque = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) vai(dx < 0 ? 1 : -1);
      else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) fechar(); // puxar para baixo fecha
    });
  }

  function mostra() {
    img.classList.add('carregando');
    img.onload = () => img.classList.remove('carregando');
    img.src = fotos[atual];
    img.alt = `Foto ${atual + 1} de ${fotos.length}`;
    cont.textContent = `${atual + 1} / ${fotos.length}`;
    const varias = fotos.length > 1;
    el.querySelectorAll('.gal-seta').forEach((b) => { b.hidden = !varias; });
    // já carrega a anterior e a próxima para a troca ser instantânea
    if (varias) [1, -1].forEach((d) => { new Image().src = fotos[(atual + d + fotos.length) % fotos.length]; });
  }

  function vai(d) { if (fotos.length < 2) return; atual = (atual + d + fotos.length) % fotos.length; mostra(); }

  function tecla(e) {
    if (el.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); vai(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); vai(-1); }
    else if (e.key === 'Tab') { // mantém o foco dentro da galeria
      const bts = [...el.querySelectorAll('button:not([hidden])')];
      const i = bts.indexOf(document.activeElement);
      e.preventDefault();
      bts[(i + (e.shiftKey ? -1 : 1) + bts.length) % bts.length].focus();
    }
  }

  function fechar() {
    if (!el || el.hidden) return;
    el.hidden = true;
    img.removeAttribute('src');
    document.documentElement.classList.remove('gal-aberta');
    document.removeEventListener('keydown', tecla, true);
    if (voltarFoco && voltarFoco.focus) voltarFoco.focus();
  }

  window.abrirGaleria = function (lista, inicio = 0, legenda = '') {
    if (!lista || !lista.length) return;
    if (!el) monta();
    fotos = lista.slice(); atual = Math.min(Math.max(0, inicio | 0), fotos.length - 1);
    leg.textContent = legenda || '';
    voltarFoco = document.activeElement;
    el.hidden = false;
    document.documentElement.classList.add('gal-aberta');
    document.addEventListener('keydown', tecla, true);
    mostra();
    el.querySelector('.gal-x').focus();
  };
  window.fecharGaleria = fechar;
})();
