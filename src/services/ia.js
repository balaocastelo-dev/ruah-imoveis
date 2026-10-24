// IA local (Ollama): sugere respostas de atendimento. Nada é inventado: só usa os imóveis cadastrados.
const cfg = require('../config');
const { all, one } = require('../db');

async function disponivel() {
  try {
    const r = await fetch(`${cfg.OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return { ok: false };
    const j = await r.json();
    const modelos = (j.models || []).map((m) => m.name);
    return { ok: true, modelo: cfg.OLLAMA_MODEL, instalado: modelos.includes(cfg.OLLAMA_MODEL), modelos };
  } catch { return { ok: false }; }
}

const brl = (v) => (v ? 'R$ ' + Math.round(v).toLocaleString('pt-BR') : 'valor sob consulta');

function catalogo(texto) {
  const ims = all(`SELECT i.codigo,i.tipo,i.bairro,i.quartos,i.suites,i.vagas,i.area_util,i.valor,i.valor_condominio,c.nome cond
                   FROM imoveis i LEFT JOIN condominios c ON c.id=i.condominio_id WHERE i.status='publicado' ORDER BY i.atualizado_em DESC LIMIT 40`);
  const t = String(texto || '').toLowerCase();
  const citados = ims.filter((i) => (i.cond && t.includes(i.cond.toLowerCase())) || t.includes(i.codigo.toLowerCase()));
  const lista = (citados.length ? citados : ims.slice(0, 12));
  return lista.map((i) => `- ${i.codigo}: ${i.tipo}${i.cond ? ' no ' + i.cond : ''}, ${i.bairro || ''}; ${i.quartos || '?'} quartos (${i.suites || 0} suítes), ${i.vagas || '?'} vagas, ${i.area_util || '?'} m²; ${brl(i.valor)}${i.valor_condominio ? '; condomínio ' + brl(i.valor_condominio) : ''}`).join('\n');
}

async function sugerirResposta(leadId) {
  const lead = one('SELECT * FROM leads WHERE id=?', leadId);
  const hist = all(`SELECT direcao,texto FROM mensagens WHERE lead_id=? AND direcao!='sugestao' ORDER BY id DESC LIMIT 12`, leadId).reverse();
  const ultimo = hist.filter((h) => h.direcao === 'entrada').pop();
  const sistema = `Você é a atendente virtual da ${cfg.EMPRESA}, imobiliária de Campinas-SP que trabalha só com VENDA de imóveis (não faz locação).
Regras:
- Responda em português do Brasil, em no máximo 3 frases curtas, tom cordial e profissional, como no WhatsApp.
- Use SOMENTE os dados do catálogo abaixo. Se a informação não estiver no catálogo (aceita permuta, IPTU, andar, documentação, financiamento específico), diga que o corretor confirma.
- Nunca invente preço, endereço, disponibilidade ou condição de pagamento. Nunca dê endereço exato.
- Objetivo: entender o que o cliente procura (região, quartos, faixa de valor, forma de pagamento, prazo) e propor uma visita com o corretor.
- Faça no máximo uma pergunta por mensagem.
- Não use emojis em excesso (no máximo um).
Catálogo de imóveis à venda:
${catalogo(ultimo && ultimo.texto) || '(sem imóveis publicados)'}
Cliente: ${lead ? lead.nome : 'desconhecido'}${lead && lead.busca ? '. Já disse que procura: ' + lead.busca : ''}`;
  const msgs = [{ role: 'system', content: sistema }, ...hist.map((h) => ({ role: h.direcao === 'entrada' ? 'user' : 'assistant', content: h.texto }))];
  const r = await fetch(`${cfg.OLLAMA_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: cfg.OLLAMA_MODEL, messages: msgs, stream: false, think: false, options: { temperature: 0.3, num_predict: 220 } }),
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw new Error(`IA local respondeu ${r.status}. Confira se o Ollama está aberto e se o modelo ${cfg.OLLAMA_MODEL} está instalado.`);
  const j = await r.json();
  return String(j.message && j.message.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

module.exports = { disponivel, sugerirResposta };
