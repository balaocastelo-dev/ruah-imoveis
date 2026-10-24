'use strict';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => (v ? 'R$ ' + Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—');
const token = location.pathname.split('/').pop();
const app = document.getElementById('app');
const topo = `<div class="row"><b style="font-family:var(--f-display);font-size:30px;letter-spacing:.08em;color:var(--gold)">RUAH</b><span class="sp"></span><span class="pill info">Apresentação exclusiva</span></div>`;

(async () => {
  const r = await fetch(`/api/publico/imovel/${encodeURIComponent(token)}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { app.innerHTML = topo + `<div class="card"><h2>Link indisponível</h2><p>${esc(d.erro || 'Peça um novo link ao corretor.')}</p></div>`; return; }
  document.title = `${d.tipo} · ${d.bairro || ''} · RUAH`;
  const foto = (id) => `/api/publico/imovel/${encodeURIComponent(token)}/foto/${id}`;
  const tels = String(d.corretor_tel || '').replace(/\D/g, '');
  app.innerHTML = topo + `
  ${d.fotos.length ? `<img class="hero" id="hero" src="${foto(d.fotos[0])}" alt="Foto do imóvel"><div class="thumbs">${d.fotos.map((f, i) => `<img src="${foto(f)}" data-f="${f}" class="${i ? '' : 'on'}" alt="Foto ${i + 1}" loading="lazy">`).join('')}</div>` : '<div class="noimg">Fotos em breve</div>'}
  <div><div class="eyebrow">${esc(d.codigo)} · ${esc(d.bairro || '')}, ${esc(d.cidade || '')}</div><h1>${esc(d.tipo)}${d.condominio ? ' no ' + esc(d.condominio) : ''}</h1>
    <p class="lead" style="margin:0">${d.endereco ? esc(d.endereco) + ' · ' : ''}<b style="font-size:20px;color:var(--ink)">${brl(d.valor)}</b></p></div>
  <div class="grid g4">${[['Quartos', d.quartos], ['Suítes', d.suites], ['Vagas', d.vagas], ['Área útil', d.area_util ? d.area_util + ' m²' : null]].map(([a, b]) => `<div class="card kpi"><div class="n" style="font-size:26px">${esc(b ?? '—')}</div><div class="l">${a}</div></div>`).join('')}</div>
  <div class="grid g21"><div class="card"><h3>Sobre o imóvel</h3><p style="white-space:pre-wrap;margin:0">${esc(d.descricao || 'Fale com o corretor para mais detalhes.')}</p>${d.lazer ? `<h3 style="margin-top:14px">Lazer do condomínio</h3><p style="margin:0">${esc(d.lazer)}</p>` : ''}</div>
    <div class="card dark"><h3 style="color:var(--gold)">Fale com ${esc(d.corretor || 'a RUAH')}</h3>${tels ? `<p style="margin:0 0 10px">${esc(d.corretor_tel)}</p><a class="btn pri" href="https://wa.me/${tels.startsWith('55') ? tels : '55' + tels}?text=${encodeURIComponent('Olá! Vi o imóvel ' + d.codigo + ' e gostaria de agendar uma visita.')}" target="_blank" rel="noopener">Chamar no WhatsApp</a>` : '<p>Responda a mensagem do corretor para agendar.</p>'}
      <dl class="dl" style="margin-top:14px"><dt style="color:inherit;opacity:.7">Condomínio</dt><dd>${brl(d.valor_condominio)}</dd><dt style="color:inherit;opacity:.7">IPTU</dt><dd>${brl(d.iptu)}</dd></dl>
      <p class="small" style="opacity:.7;margin-bottom:0">Link válido até ${esc(new Date(d.expira_em.replace(' ', 'T')).toLocaleDateString('pt-BR'))}.</p></div></div>`;
  let atual = 0;
  const lista = d.fotos.map(foto);
  app.querySelectorAll('.thumbs img').forEach((t, n) => t.addEventListener('click', () => { atual = n; document.getElementById('hero').src = foto(t.dataset.f); app.querySelectorAll('.thumbs img').forEach((x) => x.classList.toggle('on', x === t)); }));
  const hero = document.getElementById('hero');
  if (hero) hero.addEventListener('click', () => abrirGaleria(lista, atual, `${d.tipo} · ${d.bairro || ''}`));
})();
