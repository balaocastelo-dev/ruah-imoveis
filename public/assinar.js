'use strict';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const token = location.pathname.split('/').pop();
const app = document.getElementById('app');
const topo = (emp) => `<div class="brand"><b style="font-family:var(--f-display);font-size:34px;letter-spacing:.08em;color:var(--gold)">RUAH</b><span class="muted small">${esc(emp || '')}</span></div>`;

(async () => {
  const r = await fetch(`/api/publico/assinatura/${encodeURIComponent(token)}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { app.innerHTML = topo() + `<div class="card"><h2>Link inválido</h2><p>${esc(d.erro || 'Peça um novo link ao corretor.')}</p></div>`; return; }
  if (d.status === 'assinado') { app.innerHTML = topo(d.empresa) + `<div class="card"><h2>Documento já assinado</h2><p>Assinado em ${esc(d.assinado_em)}. Obrigado!</p></div>`; return; }
  if (d.status === 'cancelado') { app.innerHTML = topo(d.empresa) + `<div class="card"><h2>Link cancelado</h2><p>Este link foi substituído. Peça o novo link ao corretor.</p></div>`; return; }

  app.innerHTML = topo(d.empresa) + `
  <div><div class="eyebrow">Imóvel ${esc(d.codigo)}</div><h1>Autorização de venda</h1><p class="muted" style="margin:0">Leia o documento até o fim, confira seus dados e assine com o dedo ou o mouse.</p></div>
  <div class="doc">${esc(d.conteudo)}</div>
  <form class="card grid" id="f" style="gap:12px">
    <label class="f">Nome completo<input name="nome" required value="${esc(d.nome || '')}" autocomplete="name"></label>
    <label class="f">CPF<input name="cpf" required inputmode="numeric" placeholder="000.000.000-00"></label>
    <div><div class="row"><span class="small muted">Sua assinatura</span><span class="sp"></span><button type="button" class="btn sm" id="limpar">Limpar</button></div><canvas id="cv"></canvas></div>
    <label class="chk"><input type="checkbox" name="aceite"> Li e concordo com todos os termos desta autorização.</label>
    <button class="btn pri" type="submit" style="justify-content:center;padding:12px">Assinar documento</button>
    <p class="muted small" style="margin:0">Ao assinar, registramos data, hora, endereço IP e navegador como prova da assinatura eletrônica. Você recebe o PDF assinado pelo corretor.</p>
    <p class="small" id="erro" style="color:var(--bad);margin:0"></p>
  </form>`;

  const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  let desenhou = false, ativo = false;
  let largura = 0;
  const prepara = () => { const r0 = cv.getBoundingClientRect(); const s = window.devicePixelRatio || 1; largura = r0.width; cv.width = r0.width * s; cv.height = r0.height * s; ctx.setTransform(s, 0, 0, s, 0, 0); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b1c1e'; };
  const ajusta = () => { prepara(); desenhou = false; };
  ajusta();
  // O teclado do celular muda só a altura da tela: nesse caso a assinatura é mantida.
  window.addEventListener('resize', () => {
    if (Math.abs(cv.getBoundingClientRect().width - largura) < 2) return;
    if (!desenhou) return prepara();
    const img = new Image(); img.onload = () => { prepara(); ctx.drawImage(img, 0, 0, cv.getBoundingClientRect().width, cv.getBoundingClientRect().height); };
    img.src = cv.toDataURL('image/png');
  });
  const pos = (e) => { const r0 = cv.getBoundingClientRect(); return [e.clientX - r0.left, e.clientY - r0.top]; };
  cv.addEventListener('pointerdown', (e) => { ativo = true; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); });
  cv.addEventListener('pointermove', (e) => { if (!ativo) return; ctx.lineTo(...pos(e)); ctx.stroke(); desenhou = true; });
  cv.addEventListener('pointerup', () => { ativo = false; });
  document.getElementById('limpar').addEventListener('click', ajusta);

  const f = document.getElementById('f');
  f.cpf.addEventListener('input', () => { const d0 = f.cpf.value.replace(/\D/g, '').slice(0, 11); f.cpf.value = d0.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2'); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const erro = document.getElementById('erro'); erro.textContent = '';
    if (!desenhou) { erro.textContent = 'Desenhe sua assinatura no quadro.'; return; }
    const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Assinando…';
    try {
      const r2 = await fetch(`/api/publico/assinatura/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: f.nome.value, cpf: f.cpf.value, aceite: f.aceite.checked, assinatura_png: cv.toDataURL('image/png') }) });
      const j = await r2.json().catch(() => ({}));
      if (!r2.ok) throw new Error(j.erro || 'Não foi possível assinar.');
      app.innerHTML = topo(d.empresa) + `<div class="card"><h2>Assinado ✓</h2><p>Documento assinado em ${esc(j.assinado_em)}. O corretor da RUAH já recebeu o PDF. Obrigado!</p></div>`;
    } catch (er) { erro.textContent = er.message; b.disabled = false; b.textContent = 'Assinar documento'; }
  });
})();
