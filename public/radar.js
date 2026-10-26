/* Sistema RUAH — Radar de captação (carregado depois do app.js; usa os mesmos utilitários) */
'use strict';
const OP_ST = { nova: ['Nova', 'info'], em_contato: ['Em contato', 'warn'], carta_enviada: ['Carta enviada', 'gold'], aguardando_aprovacao: ['Aguardando aprovação', 'bad'], captada: ['Captada', 'ok'], descartada: ['Descartada', 'bad'] };
const PRIO = { alta: ['alta', 'bad'], media: ['média', 'warn'], baixa: ['baixa', 'info'], nao_abordar: ['não abordar', 'gold'] };
const opPill = (s) => `<span class="pill ${(OP_ST[s] || ['', 'info'])[1]}">${esc((OP_ST[s] || [s])[0])}</span>`;
const prioPill = (p) => `<span class="pill ${PRIO[p.nivel][1]}" title="${esc(p.motivos.join(' · '))}">${PRIO[p.nivel][0]}</span>`;
const endOp = (o) => [o.logradouro, o.numero].filter(Boolean).join(', ') + (o.unidade ? ' · ' + o.unidade : '');
const PORTAIS = ['ZAP Imóveis', 'Viva Real', 'Imovelweb', 'Chaves na Mão', 'Casa Mineira', 'OLX', 'Facebook Marketplace', 'Placa na rua', 'Indicação', 'Outro'];

async function telaRadar(qs) {
  const st = qs.get('status') || '';
  const [l, r, al] = await Promise.all([api('GET', '/api/radar?' + new URLSearchParams({ status: st })), api('GET', '/api/radar/resumo'), api('GET', '/api/radar/alertas').catch(() => null)]);
  const n = (k) => r.porStatus[k] || 0;
  $('#main').innerHTML = `<div class="eyebrow">Captação</div><h1>Radar de captação</h1>
  <p class="lead">Imóveis à venda por particulares que podem virar exclusividade da RUAH. A ordem é sempre do grátis para o pago: contato do anúncio, carta com QR code, placa/portaria e, só com aprovação, matrícula e birô.</p>
  ${avisoSaude(al, true)}${painelAlertas(al)}
  ${veTudo() && r.aprovacoesPendentes ? `<div class="banner warn"><b>${r.aprovacoesPendentes}</b> pedido(s) de consulta paga esperando aprovação. <a href="#/radar/aprovacoes">Revisar agora</a></div>` : ''}
  <div class="grid g4">
    <div class="card kpi"><div class="n">${n('nova') + n('em_contato') + n('carta_enviada') + n('aguardando_aprovacao')}</div><div class="l">Em andamento</div></div>
    <div class="card kpi"><div class="n">${n('captada')}</div><div class="l">Captadas</div></div>
    <div class="card kpi"><div class="n">${brl(r.gasto)}</div><div class="l">Gasto com consultas pagas</div></div>
    <div class="card kpi"><div class="n">${r.custoPorCaptacao === null ? '—' : brl(r.custoPorCaptacao)}</div><div class="l">Custo por captação</div></div>
  </div>
  <div class="row" style="margin:16px 0 12px">
    <div class="tabs" style="margin:0;flex:1;border:0">${[['', 'Em andamento'], ['nova', 'Novas'], ['carta_enviada', 'Carta enviada'], ['aguardando_aprovacao', 'Aguardando aprovação'], ['captada', 'Captadas'], ['descartada', 'Descartadas']].map(([k, t]) => `<a href="#/radar${k ? '?status=' + k : ''}" class="${st === k ? 'on' : ''}">${t}</a>`).join('')}</div></div>
  ${l.length ? `<div class="card tbl"><table><thead><tr><th><input type="checkbox" id="sel-todas" aria-label="Selecionar todas"></th><th>Prioridade</th><th>Anúncio</th><th>Endereço</th><th class="num">Valor</th><th>Status</th><th>Corretor</th></tr></thead><tbody>
    ${l.map((o) => `<tr><td><input type="checkbox" class="sel-op" value="${o.id}" ${o.bloqueio || o.anunciante_tipo === 'imobiliaria' || !o.logradouro ? 'disabled title="Sem endereço, de imobiliária ou na lista não contatar"' : ''} aria-label="Selecionar ${esc(o.ref)}"></td>
      <td>${prioPill(o.prioridade)}</td>
      <td class="click" data-act="ir" data-href="#/radar/${o.id}" style="cursor:pointer"><span class="mono" style="color:var(--gold)">${esc(o.ref)}</span> <b>${esc(o.titulo || o.condominio_nome || o.tipo || 'Sem título')}</b><br><span class="muted small">${esc(o.portal || '')}${o.anunciante_tipo === 'particular' ? ' · particular' : o.anunciante_tipo === 'imobiliaria' ? ' · imobiliária' : ''}${o.prioridade.motivos.length ? ' · ' + esc(o.prioridade.motivos.join(', ')) : ''}</span>${o.bloqueio ? '<br><span class="pill bad">não contatar</span>' : ''}</td>
      <td>${esc(endOp(o) || '—')}<br><span class="muted small">${esc(o.bairro || '')}</span></td><td class="num">${brl(o.valor)}</td><td>${opPill(o.status)}</td><td>${esc(o.corretor_nome || 'livre')}</td></tr>`).join('')}</tbody></table></div>
    <div class="row" style="margin-top:12px"><span class="muted small" id="sel-n">Nenhuma selecionada</span><button class="btn" data-act="cartas-lote">Gerar cartas das selecionadas (PDF)</button><button class="btn" data-act="cartas-enviadas">Marcar selecionadas como enviadas</button></div>`
    : `<div class="empty">Nada aqui. As oportunidades chegam pelo radar automático.</div>`}`;
  const atualiza = () => { const n0 = $$('.sel-op:checked').length; const el = $('#sel-n'); if (el) el.textContent = n0 ? `${n0} selecionada(s)` : 'Nenhuma selecionada'; };
  $$('.sel-op').forEach((c) => c.addEventListener('change', atualiza));
  const t = $('#sel-todas'); if (t) t.addEventListener('change', () => { $$('.sel-op:not(:disabled)').forEach((c) => (c.checked = t.checked)); atualiza(); });
}
const selecionadas = () => $$('.sel-op:checked').map((c) => c.value);
// Quando cada portal mandou o último alerta: mostra na hora se algum parou.
function portaisLinha(al) {
  const pp = (al.saude && al.saude.porPortal) || {};
  const nomes = ['ZAP Imóveis', 'Viva Real', 'OLX', ...Object.keys(pp).filter((n) => !['ZAP Imóveis', 'Viva Real', 'OLX'].includes(n))];
  const lim = (al.saude && al.saude.maxHoras) || 24;
  return `<div class="row small" style="gap:6px;margin-top:6px">${nomes.map((n) => {
    const p = pp[n]; const h = p && p.ultimo ? (Date.now() - new Date(p.ultimo).getTime()) / 36e5 : null;
    const cls = h === null ? 'warn' : h >= lim ? 'bad' : 'ok';
    const txt = h === null ? 'nenhum alerta ainda' : h < 1 ? 'alerta há menos de 1 h' : h < 48 ? `último alerta há ${Math.floor(h)} h` : `último alerta há ${Math.floor(h / 24)} dias`;
    return `<span class="pill ${cls}" title="${esc(n)}">${esc(n)} · ${esc(txt)}</span>`;
  }).join('')}</div>`;
}
// Monitor direto: lê o mapa de anúncios novos dos portais que permitem (hoje, Chaves na Mão).
function monitorLinha(al) {
  const p = al.portais; if (!p) return '';
  if (!p.ligado) return '<div class="small muted" style="margin-top:6px">Monitor direto dos portais desligado (RADAR_PORTAIS=0).</div>';
  const u = p.ultima;
  const quando = u ? new Date(u.em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  return `<div class="small" style="margin-top:8px"><b>Monitor direto</b> · ${esc(p.fontes.join(', '))} a cada ${p.intervalo_min} min${p.rodando ? ' · buscando agora…' : ''}
    ${u ? ` · última busca ${esc(quando)}: ${u.erro ? `<span class="pill bad">${esc(u.erro)}</span>` : `${u.novas} nova(s) de ${u.alvo} anúncio(s) nos bairros${u.fila ? `, ${u.fila} na fila` : ''}`}` : ' · primeira busca em instantes'}
    <br><span class="muted">ZAP, Viva Real, OLX e Imovelweb bloqueiam leitura automática.</span></div>`;
}
function avisoSaude(al, ondeRadar) {
  if (!al || !al.saude || al.saude.ok) return '';
  return `<div class="banner warn" style="border-style:solid;border-color:var(--bad);background:var(--bad-bg)"><b>⚠ Radar de captação precisa de atenção.</b><ul style="margin:6px 0 0;padding-left:18px">${al.saude.problemas.map((p) => `<li>${esc(p.texto)}</li>`).join('')}</ul>${ondeRadar ? '' : ' <a href="#/radar">Abrir o Radar</a>'}</div>`;
}
function painelAlertas(al) {
  if (!al) return '';
  if (!al.configurado) return `<div class="banner info"><b>Radar automático desligado.</b> Para o sistema buscar sozinho os anúncios novos da OLX, ZAP, Viva Real e Imovelweb, coloque o e-mail dos alertas e a senha de app no arquivo .env (veja "Radar automático" no COMO-CONFIGURAR.txt).</div>`;
  const u = al.ultima;
  const quando = u ? (() => { const m = Math.round((Date.now() - new Date(u.em).getTime()) / 60000); return m < 1 ? 'agora há pouco' : m < 60 ? `há ${m} min` : `às ${new Date(u.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} de ${new Date(u.em).toLocaleDateString('pt-BR')}`; })() : null;
  const res = u && u.ok ? `${u.novas} nova(s)${u.precos ? `, ${u.precos} queda(s) de preço` : ''}${u.emails ? ` em ${u.emails} alerta(s)` : ''}` : '';
  return `<div class="card alertas ${u && u.erro ? 'erro' : ''}" style="margin-bottom:14px"><div class="row" style="gap:10px;align-items:center">
    <span class="ponto ${al.rodando ? 'lendo' : u && u.erro ? 'bad' : 'ok'}" aria-hidden="true"></span>
    <div style="flex:1;min-width:220px"><b>Radar automático ligado</b> <span class="muted small">· lendo ${esc(al.email)} a cada ${al.intervalo_min} min</span><br>
      <span class="small">${al.rodando ? 'Lendo os alertas agora…' : quando ? `Última leitura ${esc(quando)}${res ? ': ' + esc(res) : ''}.` : 'Primeira leitura em instantes.'} <b>${al.hoje}</b> encontrada(s) hoje.</span>
      ${u && u.erro ? `<br><span class="pill bad">${esc(u.erro)}</span>` : ''}
      ${portaisLinha(al)}${monitorLinha(al)}</div>
    ${veTudo() ? `<button class="btn sm" data-act="portais-ler" title="Lê agora os anúncios novos do Chaves na Mão">Buscar nos portais</button><button class="btn sm" data-act="alertas-ler">Ler e-mail</button><button class="btn sm" data-act="alertas-ler" data-dias="7" title="Relê os alertas dos últimos 7 dias (não duplica)">Reler 7 dias</button>` : ''}</div></div>`;
}
ACT['portais-ler'] = (el) => comBotao(el, async () => {
  const r = await api('POST', '/api/radar/portais/ler');
  if (r.erro) { rota(); throw new Error(r.erro); }
  toast(`${r.novas} oportunidade(s) nova(s) no Chaves na Mão${r.fila ? ` · ${r.fila} na fila para a próxima busca` : ''}`);
  rota();
});
ACT['alertas-ler'] = (el) => comBotao(el, async () => {
  const r = await api('POST', '/api/radar/alertas/ler', el.dataset.dias ? { dias: +el.dataset.dias } : {});
  if (r.erro) { rota(); throw new Error(r.erro); }
  toast(`${r.novas} oportunidade(s) nova(s)${r.precos ? `, ${r.precos} queda(s) de preço` : ''} · ${r.emails} alerta(s) lido(s)`);
  rota();
});
ACT['cartas-lote'] = () => { const ids = selecionadas(); if (!ids.length) return toast('Selecione as oportunidades na lista.', true); window.open('/api/radar/cartas.pdf?ids=' + ids.join(','), '_blank', 'noopener'); };
ACT['cartas-enviadas'] = (el) => comBotao(el, async () => { const ids = selecionadas(); if (!ids.length) throw new Error('Selecione as oportunidades na lista.'); const r = await api('POST', '/api/radar/cartas-enviadas', { ids }); toast(`${r.marcadas} carta(s) marcada(s) como enviada(s)`); rota(); });

async function telaOpForm(id) {
  const o = id ? await api('GET', `/api/radar/${id}`) : { anunciante_tipo: 'particular', cidade: 'Campinas' };
  const v = (k) => esc(o[k] ?? '');
  $('#main').innerHTML = `<a class="btn sm" href="${id ? '#/radar/' + id : '#/radar'}">← Voltar</a>
  <div class="eyebrow" style="margin-top:12px">${id ? esc(o.ref) : 'Radar de captação'}</div><h1>${id ? 'Editar oportunidade' : 'Nova oportunidade'}</h1>
  <p class="lead">Copie os dados do alerta do portal. O sistema avisa se o mesmo imóvel já foi cadastrado (mesmo link, telefone ou endereço) e calcula a prioridade.</p>
  <form class="grid" style="gap:16px" data-form="op" data-id="${id || ''}"><div class="grid g2">
    <fieldset><legend>Anúncio</legend>
      <div class="grid g2"><label class="f">Portal<select name="portal">${PORTAIS.map((p) => `<option ${p === o.portal ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <label class="f">Publicado em<input type="date" name="publicado_em" value="${v('publicado_em')}"></label></div>
      <label class="f">Link do anúncio<input name="link" value="${v('link')}" placeholder="https://…"></label>
      <label class="f">Título<input name="titulo" value="${v('titulo')}" placeholder="Apto 4 quartos 175 m² Mansões Santo Antônio"></label>
      <div class="grid g2"><label class="f">Quem anuncia<select name="anunciante_tipo"><option value="particular" ${o.anunciante_tipo === 'particular' ? 'selected' : ''}>Particular (o próprio dono)</option><option value="imobiliaria" ${o.anunciante_tipo === 'imobiliaria' ? 'selected' : ''}>Imobiliária / corretor</option><option value="desconhecido" ${o.anunciante_tipo === 'desconhecido' ? 'selected' : ''}>Não sei</option></select></label>
        <label class="f">Nome no anúncio<input name="anunciante_nome" value="${v('anunciante_nome')}"></label></div>
      <label class="f">Telefone do anúncio<input name="telefone_anuncio" value="${esc(tel(o.telefone_anuncio))}" inputmode="tel"></label>
      <div class="grid g2"><label class="f">Valor pedido<input name="valor" inputmode="numeric" value="${o.valor ? Number(o.valor).toLocaleString('pt-BR') : ''}"></label>
        <label class="f">Valor anterior (se baixou)<input name="valor_anterior" inputmode="numeric" value="${o.valor_anterior ? Number(o.valor_anterior).toLocaleString('pt-BR') : ''}"></label></div>
    </fieldset>
    <fieldset><legend>Imóvel</legend>
      <div class="grid g2"><label class="f">Tipo<select name="tipo"><option value="">—</option>${TIPOS.map((t) => `<option ${t === o.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
        <label class="f">Condomínio<input name="condominio_nome" value="${v('condominio_nome')}"></label></div>
      <label class="f">Rua (endereço provável)<input name="logradouro" value="${v('logradouro')}"></label>
      <div class="grid g3"><label class="f">Número<input name="numero" value="${v('numero')}"></label><label class="f">Unidade<input name="unidade" value="${v('unidade')}" placeholder="142 Torre B"></label><label class="f">Bairro<input name="bairro" value="${v('bairro')}"></label></div>
      <div class="grid g3"><label class="f">Quartos<input type="number" min="0" name="quartos" value="${v('quartos')}"></label><label class="f">Vagas<input type="number" min="0" name="vagas" value="${v('vagas')}"></label><label class="f">Área (m²)<input name="area" value="${v('area')}" inputmode="decimal"></label></div>
      ${veTudo() ? `<label class="f">Corretor responsável<select name="corretor_id">${opcoesUsuarios(o.corretor_id, 'Livre (qualquer corretor assume)')}</select></label>` : ''}
      <label class="f">Observações<textarea name="observacoes">${v('observacoes')}</textarea></label>
      <p class="muted small" style="margin:0">Sem número e unidade não dá para mandar carta. Se o anúncio não mostra, descubra pelas fotos (fachada, vista) ou deixe para depois.</p>
    </fieldset></div>
    <div><button class="btn pri" type="submit">${id ? 'Salvar' : 'Cadastrar no radar'}</button></div></form>`;
}
FORM.op = async (f) => {
  const d = formJSON(f), id = f.dataset.id;
  const envia = async (forcar) => {
    try { return id ? await api('PUT', `/api/radar/${id}`, { ...d, forcar }) : await api('POST', '/api/radar', { ...d, forcar }); }
    catch (e) {
      if (/Parece a mesma|Ficou igual/.test(e.message) && !forcar) {
        if (confirm(e.message + '\n\nCadastrar mesmo assim? (Cancelar abre a existente)')) return envia(true);
        const m = e.message.match(/OP-(\d+)/); if (m) location.hash = `#/radar/${parseInt(m[1], 10)}`;
        return null;
      }
      throw e;
    }
  };
  const r = await envia(false);
  if (!r) return;
  toast('Salvo'); location.hash = `#/radar/${id || r.id}`;
};

async function telaOp(id) {
  const o = await api('GET', `/api/radar/${id}`);
  const fez = (etapa) => o.eventos.some((e) => e.etapa === etapa && !/aprova|Pedido/.test(e.texto));
  const ap = (tipo) => o.aprovacoes.find((a) => a.tipo === tipo);
  const fechado = ['captada', 'descartada'].includes(o.status);
  const tentouGratis = o.eventos.some((e) => ['anuncio', 'carta', 'local'].includes(e.etapa));
  const passo = (n, titulo, estado, corpo) => `<div class="card" style="${estado === 'off' ? 'opacity:.6' : ''}"><div class="row"><span class="pill ${estado === 'ok' ? 'ok' : estado === 'pago' ? 'gold' : estado === 'off' ? '' : 'info'}" style="${estado === 'off' ? 'background:var(--line)' : ''}">${estado === 'ok' ? '✓' : n}</span><h3 style="margin:0">${titulo}</h3></div><div style="margin-top:10px" class="grid" >${corpo}</div></div>`;
  const pedido = (tipo, nome) => {
    const a = ap(tipo);
    if (a && a.status === 'pendente') return `<p class="small" style="margin:0"><span class="pill warn">aguardando gestor</span> Pedido feito${a.custo_estimado ? ' · custo estimado ' + brl(a.custo_estimado) : ''}.</p>`;
    if (a && a.status === 'negada') return `<p class="small" style="margin:0"><span class="pill bad">negado</span> ${esc(a.motivo || '')}</p>` + formPedido(tipo, nome);
    if (a && a.status === 'aprovada') return null;
    return formPedido(tipo, nome);
  };
  const formPedido = (tipo, nome) => `<form class="grid" style="gap:8px" data-form="pedido" data-id="${o.id}" data-tipo="${tipo}"><div class="grid g2"><label class="f">Custo estimado (R$)<input name="custo_estimado" inputmode="decimal" value="${o.custos_padrao[tipo] || ''}"></label><label class="f">Por que vale a pena?<input name="justificativa" placeholder="Alto padrão, carta sem resposta há 15 dias"></label></div><div><button class="btn sm" type="submit">Pedir aprovação para ${nome}</button></div></form>`;

  $('#main').innerHTML = `<a class="btn sm" href="#/radar">← Radar</a>
  <div class="row" style="margin-top:12px;align-items:flex-end"><div style="flex:1;min-width:240px"><div class="eyebrow mono">${esc(o.ref)} · ${esc(o.portal || 'sem portal')}</div><h1>${esc(o.titulo || o.condominio_nome || o.tipo || 'Oportunidade')}</h1></div>
    ${prioPill(o.prioridade)} ${opPill(o.status)} <a class="btn" href="#/radar/${o.id}/editar">Editar</a>${!o.corretor_id ? ` <button class="btn pri" data-act="op-assumir" data-id="${o.id}">Assumir</button>` : ''}</div>
  <p class="lead">${esc(endOp(o) || 'Endereço não informado')}${o.bairro ? ' · ' + esc(o.bairro) : ''} · <b>${brl(o.valor)}</b>${o.valor_anterior && o.valor < o.valor_anterior ? ` <span class="pill ok">era ${brl(o.valor_anterior)}</span>` : ''} · corretor ${esc(o.corretor_nome || 'livre')}${o.link ? ` · <a href="${esc(o.link)}" target="_blank" rel="noopener">ver anúncio</a>` : ''}</p>
  ${o.bloqueio ? `<div class="banner warn"><b>Não contatar:</b> ${esc(o.bloqueio)}</div>` : ''}
  ${o.anunciante_tipo === 'imobiliaria' ? '<div class="banner warn">Anunciado por imobiliária ou corretor: provável exclusividade de outra empresa. Não abordamos o dono nem gastamos com consulta.</div>' : ''}
  ${o.status === 'captada' ? `<div class="banner" style="background:var(--ok-bg)">Captada. <a href="#/imoveis/${o.imovel_id}">Abrir o imóvel</a></div>` : ''}
  <div class="grid g21"><div class="grid" style="gap:12px;align-content:start">
    ${passo(1, 'Contato do anúncio · grátis', fez('anuncio') ? 'ok' : o.telefone_anuncio ? 'atual' : 'off', o.telefone_anuncio ? `
      <div class="row"><span class="mono">${esc(tel(o.telefone_anuncio))}</span>${o.anunciante_nome ? `<span class="muted small">${esc(o.anunciante_nome)}</span>` : ''}${!o.bloqueio && o.anunciante_tipo !== 'imobiliaria' ? `<a class="btn sm pri" href="${esc(o.whatsapp_anuncio)}" target="_blank" rel="noopener">Abrir WhatsApp</a>` : ''}</div>
      ${!fechado ? `<form class="grid" style="gap:8px" data-form="op-evento" data-id="${o.id}" data-etapa="anuncio"><div class="grid g2"><label class="f">Resultado<select name="resultado"><option value="atendeu_interessado">Falou com o dono: tem interesse</option><option value="nao_atendeu">Não atendeu / sem resposta</option><option value="atendeu_sem_interesse">Falou com o dono: sem interesse</option><option value="nao_e_dono">Não é o dono (corretor ou terceiro)</option><option value="outro">Outro</option></select></label><label class="f">Detalhe<input name="texto"></label></div><div><button class="btn sm" type="submit">Registrar</button></div></form>` : ''}`
      : '<p class="muted small" style="margin:0">O anúncio não tem telefone. Siga para a carta.</p>')}
    ${passo(2, 'Carta ao proprietário · grátis', o.carta_enviada_em ? 'ok' : o.logradouro && o.numero ? 'atual' : 'off', o.logradouro && o.numero ? `
      <p class="small" style="margin:0">Carta endereçada ao "proprietário(a)" da unidade, com QR code para o WhatsApp${o.carta_sem_telefone ? '. <b style="color:var(--bad)">Falta o número de WhatsApp: preencha WHATSAPP_RUAH no .env ou o telefone do corretor em Configurações.</b>' : ' da RUAH. Quando o dono responde, a mensagem cai aqui sozinha (pela referência ' + esc(o.ref) + ').'}</p>
      ${o.carta_enviada_em ? `<p class="small" style="margin:0"><span class="pill ok">enviada em ${new Date(o.carta_enviada_em + 'T12:00').toLocaleDateString('pt-BR')}</span></p>` : ''}
      ${!fechado && !o.bloqueio && o.anunciante_tipo !== 'imobiliaria' ? `<div class="row"><a class="btn sm pri" href="/api/radar/${o.id}/carta.pdf" target="_blank" rel="noopener">Gerar carta (PDF)</a>
        <form class="row" data-form="carta-enviada" data-id="${o.id}" style="gap:6px"><select class="inp" name="como" style="width:auto"><option>Correio</option><option>Entregue em mãos</option><option>Deixada na portaria</option></select><input class="inp" name="custo" placeholder="Custo R$" style="width:100px" inputmode="decimal"><button class="btn sm" type="submit">Marcar como enviada</button></form></div>` : ''}`
      : '<p class="muted small" style="margin:0">Precisa de rua, número e (em prédio) unidade. <a href="#/radar/' + o.id + '/editar">Completar endereço</a></p>')}
    ${passo(3, 'Placa, portaria e vizinhança · grátis', fez('local') ? 'ok' : 'atual', `
      <p class="muted small" style="margin:0">Ligou para a placa? Deixou recado com o zelador ou o síndico? Não peça dados do morador: peça que entreguem o seu contato.</p>
      ${!fechado ? `<form class="copybox" data-form="op-evento" data-id="${o.id}" data-etapa="local"><input class="inp" name="texto" placeholder="Ex.: deixei cartão com o zelador Sr. João" required><button class="btn sm" type="submit">Registrar</button></form>` : ''}`)}
    ${passo(4, 'Matrícula · paga, com aprovação', o.titular_nome ? 'ok' : tentouGratis ? 'pago' : 'off', o.titular_nome ? `<p class="small" style="margin:0">Titular: <b>${esc(o.titular_nome)}</b>${o.matricula_numero ? ' · matrícula ' + esc(o.matricula_numero) : ''}${o.cartorio ? ' · ' + esc(o.cartorio) : ''}</p>`
      : !tentouGratis ? '<p class="muted small" style="margin:0">Liberada depois de tentar um caminho grátis (anúncio, carta ou portaria).</p>'
      : fechado ? '' : (pedido('matricula', 'a matrícula') ?? `<p class="small" style="margin:0"><span class="pill ok">aprovada</span> Consulte em <a href="https://www.registrodeimoveis.org.br/servicos/matricula" target="_blank" rel="noopener">registrodeimoveis.org.br</a> e registre:</p>
        <form class="grid" style="gap:8px" data-form="matricula" data-id="${o.id}"><div class="grid g2"><label class="f">Nome do titular<input name="titular_nome" required></label><label class="f">Nº da matrícula<input name="matricula_numero"></label></div><div class="grid g2"><label class="f">Cartório<input name="cartorio" placeholder="2º RI de Campinas"></label><label class="f">Custo pago (R$)<input name="custo" inputmode="decimal"></label></div><div><button class="btn sm" type="submit">Salvar</button></div></form>`))}
    ${passo(5, 'Birô de dados · pago, com aprovação', o.titular_telefone && /Bir/.test(o.titular_origem || '') ? 'ok' : o.titular_nome ? 'pago' : 'off', !o.titular_nome ? '<p class="muted small" style="margin:0">Só depois da matrícula: o birô procura o telefone de um titular já confirmado.</p>'
      : o.titular_telefone ? `<p class="small" style="margin:0">Telefone do titular: <b class="mono">${esc(tel(o.titular_telefone))}</b> · origem: ${esc(o.titular_origem || '')}</p>`
      : fechado ? '' : (pedido('biro', 'o birô') ?? `<p class="small" style="margin:0"><span class="pill ok">aprovado</span> Consulte e registre o telefone:</p>
        <form class="grid" style="gap:8px" data-form="biro" data-id="${o.id}"><div class="grid g3"><label class="f">Telefone<input name="titular_telefone" required inputmode="tel"></label><label class="f">Fonte<input name="fonte" value="Lemit"></label><label class="f">Custo (R$)<input name="custo" inputmode="decimal"></label></div><div><button class="btn sm" type="submit">Salvar</button></div></form>`))}
  </div>
  <div class="grid" style="gap:12px;align-content:start">
    ${!fechado ? `<form class="card grid" style="gap:10px" data-form="captar" data-id="${o.id}"><h3 style="margin:0">Dono quer vender?</h3><p class="muted small" style="margin:0">Vira imóvel "Em captação" com o proprietário e a origem do contato já preenchidos. Depois é gerar a autorização de venda.</p>
      <label class="f">Tipo<select name="tipo">${TIPOS.map((t) => `<option ${t === o.tipo ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label><button class="btn pri" type="submit">Captar imóvel</button></form>
    <form class="card grid" style="gap:10px" data-form="descartar" data-id="${o.id}"><h3 style="margin:0">Descartar</h3><label class="f">Motivo<select name="motivo">${Object.entries(o.motivos_descarte).map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></label><input class="inp" name="texto" placeholder="Detalhe (opcional)"><div><button class="btn sm danger" type="submit">Descartar</button></div></form>`
      : o.status === 'descartada' ? `<div class="card"><p class="small" style="margin-top:0">Descartada: ${esc(o.motivos_descarte[o.motivo_descarte] || '')}</p><button class="btn sm" data-act="op-reabrir" data-id="${o.id}">Reabrir</button></div>` : ''}
    <div class="card"><div class="row"><h3 style="margin:0">Histórico</h3><span class="sp"></span><span class="muted small">gasto ${brl(o.gasto)}</span></div>
      ${!fechado ? `<form class="copybox" data-form="op-evento" data-id="${o.id}" data-etapa="nota" style="margin:10px 0"><input class="inp" name="texto" placeholder="Anotação" required><button class="btn sm" type="submit">Anotar</button></form>` : ''}
      <div class="timeline">${o.eventos.map((e) => `<div><span class="when">${dataBR(e.em)} · ${esc(e.autor || 'Sistema')} · ${esc(e.etapa)}${e.custo ? ' · ' + brl(e.custo) : ''}</span><br>${esc(e.texto)}</div>`).join('')}</div></div>
  </div></div>`;
}
FORM['op-evento'] = async (f) => {
  const r = await api('POST', `/api/radar/${f.dataset.id}/evento`, { ...formJSON(f), etapa: f.dataset.etapa });
  toast('Registrado'); await rota();
  if (r.converter) { toast('Dono interessado! Capte o imóvel no quadro ao lado.'); const b = $('form[data-form=captar] button'); if (b) b.focus(); }
};
FORM['carta-enviada'] = async (f) => { await api('POST', `/api/radar/${f.dataset.id}/carta-enviada`, formJSON(f)); toast('Carta marcada como enviada'); rota(); };
FORM.pedido = async (f) => { await api('POST', `/api/radar/${f.dataset.id}/aprovacao`, { ...formJSON(f), tipo: f.dataset.tipo }); toast('Pedido enviado ao gestor'); rota(); };
FORM.matricula = async (f) => { await api('POST', `/api/radar/${f.dataset.id}/matricula`, formJSON(f)); toast('Matrícula registrada'); rota(); };
FORM.biro = async (f) => { const r = await api('POST', `/api/radar/${f.dataset.id}/biro`, formJSON(f)); toast(r.aviso || 'Telefone registrado', !!r.aviso); rota(); };
FORM.descartar = async (f) => { if (!confirm('Descartar esta oportunidade?')) return; await api('POST', `/api/radar/${f.dataset.id}/descartar`, formJSON(f)); toast('Descartada'); rota(); };
FORM.captar = async (f) => { const r = await api('POST', `/api/radar/${f.dataset.id}/converter`, formJSON(f)); toast(`Imóvel ${r.codigo} criado em captação`); location.hash = `#/imoveis/${r.imovel_id}/autorizacao`; };
ACT['op-assumir'] = (el) => comBotao(el, async () => { await api('POST', `/api/radar/${el.dataset.id}/assumir`); rota(); });
ACT['op-reabrir'] = (el) => comBotao(el, async () => { await api('POST', `/api/radar/${el.dataset.id}/reabrir`); rota(); });

async function telaAprovacoes() {
  if (!veTudo()) { $('#main').innerHTML = '<div class="empty">Só o gestor e o administrativo aprovam consultas pagas.</div>'; return; }
  const l = await api('GET', '/api/radar/aprovacoes');
  $('#main').innerHTML = `<a class="btn sm" href="#/radar">← Radar</a><div class="eyebrow" style="margin-top:12px">Captação</div><h1>Aprovar consultas pagas</h1>
  <p class="lead">Matrícula e birô custam dinheiro e envolvem dados pessoais. Aprove só quando os caminhos grátis já foram tentados e o imóvel justifica.</p>
  ${l.length ? `<div class="list">${l.map((a) => `<div class="item" style="flex-wrap:wrap"><div style="flex:1;min-width:240px"><div class="t"><span class="mono" style="color:var(--gold)">${esc(a.ref)}</span> ${a.tipo === 'matricula' ? 'Matrícula' : 'Birô de dados'} · ${esc(a.titulo || a.condominio_nome || '')}</div>
    <div class="muted small">${esc([a.logradouro, a.numero, a.unidade].filter(Boolean).join(', '))} · ${brl(a.valor)} · pedido por ${esc(a.solicitante || '')}${a.custo_estimado ? ' · custo ' + brl(a.custo_estimado) : ''}</div>${a.justificativa ? `<div class="small">“${esc(a.justificativa)}”</div>` : ''}</div>
    <a class="btn sm" href="#/radar/${a.oportunidade_id}">Ver histórico</a><button class="btn sm pri" data-act="decidir" data-id="${a.id}" data-v="1">Aprovar</button><button class="btn sm danger" data-act="decidir" data-id="${a.id}" data-v="0">Negar</button></div>`).join('')}</div>`
    : '<div class="empty">Nenhum pedido esperando. 👍</div>'}`;
}
ACT.decidir = (el) => comBotao(el, async () => {
  const aprovar = el.dataset.v === '1';
  const motivo = aprovar ? '' : (prompt('Motivo (opcional):') || '');
  await api('POST', `/api/radar/aprovacoes/${el.dataset.id}/decidir`, { aprovar, motivo });
  toast(aprovar ? 'Aprovado' : 'Negado'); atualizaBadge(); rota();
});
