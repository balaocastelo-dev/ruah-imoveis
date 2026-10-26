// Traduz o SQL escrito para o SQLite para o dialeto do Postgres.
// Cobre exatamente o que o sistema usa: placeholders "?", datetime/date('now',...), date(coluna),
// LIKE sem diferenciar maiúsculas, e "RETURNING id" para devolver o id inserido.
const TZ = "(now() AT TIME ZONE 'America/Sao_Paulo')";
const SEM_ID = new Set(['sessoes', 'tentativas_login', 'config', 'arquivos_dados']);
const cache = new Map();

function agoraComModificadores(func, mods) {
  let expr = TZ;
  for (const m of mods) {
    const s = m.trim().toLowerCase();
    if (s === 'localtime' || s === 'utc') continue;
    if (s === 'start of day') { expr = `date_trunc('day', ${expr})`; continue; }
    const r = s.match(/^([+-])\s*(\d+(?:\.\d+)?)\s*(second|minute|hour|day|month|year)s?$/);
    if (!r) throw new Error(`Modificador de data não suportado: ${m}`);
    expr = `(${expr} ${r[1]} interval '${r[2]} ${r[3]}')`;
  }
  return `to_char(${expr}, '${func === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH24:MI:SS'}')`;
}

function traduzir(sql) {
  let s = sql;
  // datetime('now', 'localtime', '+7 day', ...) / date('now', ...)
  s = s.replace(/\b(datetime|date)\(\s*'now'((?:\s*,\s*'[^']*')*)\s*\)/gi, (_, f, resto) => {
    const mods = [...resto.matchAll(/'([^']*)'/g)].map((x) => x[1]);
    return agoraComModificadores(f.toLowerCase(), mods);
  });
  // date(coluna) → primeiros 10 caracteres (datas guardadas como texto)
  s = s.replace(/\bdate\(\s*([a-z_][\w.]*)\s*\)/gi, 'substr($1,1,10)');
  // número do código do imóvel (AP0012 → 12) sem quebrar com códigos fora do padrão
  s = s.replace(/CAST\(substr\(codigo,\s*3\)\s+AS\s+INTEGER\)/gi, "CAST(NULLIF(regexp_replace(substr(codigo,3),'[^0-9]','','g'),'') AS INTEGER)");

  // percorre o texto fora das aspas: troca ? por $n e LIKE por ILIKE
  let out = '', n = 0, i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'") {
      const fim = s.indexOf("'", i + 1);
      let j = fim;
      while (j !== -1 && s[j + 1] === "'") j = s.indexOf("'", j + 2);
      const ate = j === -1 ? s.length : j + 1;
      out += s.slice(i, ate); i = ate; continue;
    }
    if (ch === '?') { out += '$' + (++n); i++; continue; }
    const m = /^\bLIKE\b/i.exec(s.slice(i, i + 5)) && (i === 0 || !/[\w]/.test(s[i - 1])) && !/[\w]/.test(s[i + 4] || '');
    if (m) { out += 'ILIKE'; i += 4; continue; }
    out += ch; i++;
  }

  const ins = out.match(/^\s*INSERT\s+INTO\s+([a-z_]+)/i);
  if (ins && !/\bRETURNING\b/i.test(out) && !SEM_ID.has(ins[1].toLowerCase())) out += ' RETURNING id';
  return { text: out };
}

module.exports = function traduz(sql) {
  let r = cache.get(sql);
  if (!r) { r = traduzir(sql); if (cache.size < 2000) cache.set(sql, r); }
  return r;
};
module.exports.traduzir = traduzir;
