// Blog RUAH · as páginas públicas, montadas no servidor (o Google lê o texto
// direto do HTML, sem depender de JavaScript).

const cfg = require('../config');
const { CATEGORIAS, CHAMADAS, nomeDaCategoria, SITE_RUAH } = require('./categorias');
const { lerTextoRico, montarSumario, dataPorExtenso, minutosDeLeitura, cortar } = require('./texto');

const NOME = process.env.BLOG_NOME || 'Sopro';
const LEGENDA = process.env.BLOG_LEGENDA || 'Casa, arquitetura e bem-estar, pela RUAH';

/** Só ficam clicáveis os endereços do próprio blog. */
const linkDaRuah = (href) => (href.startsWith('/') && !href.startsWith('//')) || href.startsWith('#');

/** "cbic.org.br" a partir do endereço da fonte, para citar sem link. */
const siteDe = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function rico(texto) {
  const desenhar = (trechos) => trechos.map((t) => {
    if (t.tipo === 'texto') return esc(t.valor);
    if (t.tipo === 'negrito') return `<strong>${desenhar(t.filhos)}</strong>`;
    if (t.tipo === 'italico') return `<em>${desenhar(t.filhos)}</em>`;
    // O leitor não sai do site da RUAH: link para fora vira texto comum (a fonte fica listada no fim, sem link).
    if (!linkDaRuah(t.href)) return desenhar(t.filhos);
    return `<a href="${esc(t.href)}">${desenhar(t.filhos)}</a>`;
  }).join('');
  return desenhar(lerTextoRico(texto));
}

function linkDaChamada(c) {
  // Tudo fica dentro do site da RUAH: a vitrine do portal, o próprio blog ou o contato do blog.
  if (c.acao === 'portal') return '/imoveis';
  if (c.acao === 'blog') return '/blog';
  return '#contato';
}

function chamada(tema) {
  const c = CHAMADAS[tema] || CHAMADAS.geral;
  return `<aside class="chamada"><div><p class="chamada-t">${esc(c.titulo)}</p><p>${esc(c.texto)}</p></div>
<a class="botao" href="${esc(linkDaChamada(c))}"${c.acao === 'contato' ? ` data-motivo="${esc(c.motivo || 'duvida')}"` : ''}>${esc(c.rotulo)}</a></aside>`;
}

function bloco(b, ids) {
  switch (b.tipo) {
    case 'paragrafo': return `<p>${rico(b.texto)}</p>`;
    case 'titulo': return `<h${b.nivel} id="${esc(ids.get(b))}">${esc(b.texto)}</h${b.nivel}>`;
    case 'resumo': return `<section class="resumo" aria-label="Em resumo"><p class="resumo-t">${esc(b.titulo || 'Em resumo')}</p><ul>${b.itens.map((i) => `<li>${rico(i)}</li>`).join('')}</ul></section>`;
    case 'lista': {
      const tag = b.ordenada ? 'ol' : 'ul';
      return `<${tag} class="lista">${b.itens.map((i) => `<li>${rico(i)}</li>`).join('')}</${tag}>`;
    }
    case 'destaque': return `<div class="destaque ${esc(b.tom)}">${b.titulo ? `<p class="destaque-t">${esc(b.titulo)}</p>` : ''}<p>${rico(b.texto)}</p></div>`;
    case 'tabela': return `<figure class="tabela">${b.titulo ? `<figcaption>${esc(b.titulo)}</figcaption>` : ''}<div class="rolar"><table>
<thead><tr>${b.colunas.map((c, i) => `<th scope="col"${i === b.colunaDestaque ? ' class="destacada"' : ''}>${esc(c)}</th>`).join('')}</tr></thead>
<tbody>${b.linhas.map((l) => `<tr>${l.map((c, i) => (i === 0 ? `<th scope="row">${rico(c)}</th>` : `<td${i === b.colunaDestaque ? ' class="destacada"' : ''}>${rico(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>
${b.nota || b.fonte ? `<p class="nota">${b.nota ? rico(b.nota) : ''}${b.fonte ? ` Fonte: ${esc(b.fonte.nome)}${siteDe(b.fonte.url) && !b.fonte.nome.includes(siteDe(b.fonte.url)) ? ` (${esc(siteDe(b.fonte.url))})` : ''}.` : ''}</p>` : ''}</figure>`;
    case 'pros-contras': return `<div class="pros-contras">${b.titulo ? `<p class="pc-t">${esc(b.titulo)}</p>` : ''}<div class="pc-g">
<div><p class="pc-l">A favor</p><ul>${b.pros.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
<div><p class="pc-l">Contra</p><ul>${b.contras.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div></div></div>`;
    case 'chamada': return chamada(b.tema);
    default: return '';
  }
}

/** O contato do blog: o leitor fala com a RUAH sem sair do site (vira lead no CRM). */
function formularioDeContato(req) {
  const pagina = (/^\/blog\/([a-z0-9-]+)$/.exec(req.path) || [])[1] || '';
  return `<section class="contato" id="contato" aria-labelledby="contato-t">
<div class="contato-txt"><h2 id="contato-t">Fale com a RUAH</h2>
<p>Quer comprar, vender ou tirar uma dúvida? Deixe seu contato e um corretor responde em horário comercial. Para ver os imóveis à venda, abra a <a href="/imoveis">vitrine da RUAH</a>.</p></div>
<form class="contato-form" data-contato-blog novalidate>
  <input type="hidden" name="pagina" value="${esc(pagina === 'categoria' ? '' : pagina)}">
  <label class="armadilha" aria-hidden="true">Empresa<input name="empresa" tabindex="-1" autocomplete="off"></label>
  <fieldset class="motivos"><legend>Você quer</legend>
    <label><input type="radio" name="motivo" value="comprar" checked> Comprar</label>
    <label><input type="radio" name="motivo" value="vender"> Vender</label>
    <label><input type="radio" name="motivo" value="duvida"> Tirar uma dúvida</label>
  </fieldset>
  <label class="campo"><span>Nome</span><input name="nome" required autocomplete="name" maxlength="120"></label>
  <label class="campo"><span>WhatsApp ou telefone</span><input name="telefone" required inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(19) 99999-9999"></label>
  <label class="campo largo"><span>E-mail <i>(opcional)</i></span><input name="email" type="email" autocomplete="email" maxlength="120"></label>
  <label class="campo largo"><span>Mensagem <i>(opcional)</i></span><textarea name="mensagem" rows="3" maxlength="1000" placeholder="O que você procura: bairro, tipo de imóvel, quartos…"></textarea></label>
  <label class="aceite largo"><input type="checkbox" name="aceite" value="1" required> Concordo que a RUAH use estes dados só para falar comigo sobre imóveis. Posso pedir para sair a qualquer momento.</label>
  <button class="botao largo" type="submit">Enviar para a RUAH</button>
  <p class="contato-msg largo" role="status" aria-live="polite" hidden></p>
</form></section>`;
}

function urlBase(req) {
  const fixo = (process.env.BLOG_URL || cfg.PUBLIC_URL || '').replace(/\/+$/, '');
  return fixo || `${req.protocol}://${req.get('host')}`;
}

const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

function casca(req, { titulo, descricao, caminho, imagem, tipoOg = 'website', ld = [], corpo, classe = '' }) {
  const base = urlBase(req);
  const canonico = base + caminho;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<link rel="canonical" href="${esc(canonico)}">
<link rel="alternate" type="application/rss+xml" title="${esc(NOME)}" href="${esc(base)}/blog/rss.xml">
<meta property="og:site_name" content="${esc(NOME)} · RUAH">
<meta property="og:locale" content="pt_BR">
<meta property="og:type" content="${tipoOg}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${esc(canonico)}">
${imagem ? `<meta property="og:image" content="${esc(imagem)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<meta name="theme-color" content="#FBFAF8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap">
<link rel="stylesheet" href="/blog-assets/blog.css">
${ld.map((o) => `<script type="application/ld+json">${json(o)}</script>`).join('\n')}
</head>
<body class="${classe}">
<a class="pular" href="#conteudo">Ir para o conteúdo</a>
<header class="topo">
  <a class="marca" href="/blog"><span class="marca-n">${esc(NOME)}</span><span class="marca-l">${esc(LEGENDA)}</span></a>
  <nav class="cats" aria-label="Categorias">${CATEGORIAS.map((c) => `<a href="/blog/categoria/${c.slug}"${req.path === `/blog/categoria/${c.slug}` ? ' aria-current="page"' : ''}>${esc(c.nome)}</a>`).join('')}</nav>
</header>
<main id="conteudo">${corpo}</main>
${formularioDeContato(req)}
<footer class="rodape">
  <div><p class="rodape-n">RUAH Investimentos Imobiliários</p><p>Imobiliária de venda em Campinas, SP.${process.env.BLOG_CRECI ? ` CRECI ${esc(process.env.BLOG_CRECI)}.` : ''}</p></div>
  <nav aria-label="RUAH"><a href="/imoveis">Imóveis à venda</a><a href="#contato" data-motivo="duvida">Fale com a RUAH</a><a href="/blog/rss.xml">RSS</a></nav>
  <p class="rodape-p">Os textos deste blog são informativos e não substituem a orientação de arquiteto, engenheiro, advogado ou contador. As capas são imagens ilustrativas geradas por IA.</p>
</footer>
<script src="/blog-assets/blog.js" defer></script>
</body></html>`;
}

function cartao(a, grande = false) {
  const img = a.capa ? `<img src="${esc(a.capa.src)}" alt="${esc(a.capa.alt)}" width="1600" height="900" loading="${grande ? 'eager' : 'lazy'}"${grande ? ' fetchpriority="high"' : ''}>` : '';
  const tag = grande ? 'h2' : 'h3';
  return `<article class="cartao${grande ? ' cartao-g' : ''}" data-busca="${esc(`${a.titulo} ${a.resumo} ${a.etiquetas.join(' ')} ${nomeDaCategoria(a.categoria)}`.toLowerCase())}">
<a href="/blog/${a.slug}" class="cartao-img">${img}</a>
<div class="cartao-t"><a class="cat" href="/blog/categoria/${a.categoria}">${esc(nomeDaCategoria(a.categoria))}${a.formato === 'dica' ? ', dica' : ''}</a>
<${tag}><a href="/blog/${a.slug}">${esc(a.titulo)}</a></${tag}>
<p>${esc(grande ? a.resumo : cortar(a.resumo, 130))}</p>
<p class="meta"><time datetime="${a.publicadoEm}">${dataPorExtenso(a.publicadoEm)}</time>, ${a.minutos} min de leitura</p></div></article>`;
}

function paginaInicial(req, artigos, categoria = null) {
  const cat = categoria && CATEGORIAS.find((c) => c.slug === categoria);
  const [primeiro, ...resto] = artigos;
  const titulo = cat ? `${cat.nome} · ${NOME}, o blog da RUAH` : `${NOME}: ${LEGENDA}`;
  const descricao = cat ? cat.descricao : 'Arquitetura, casas novas, mobiliário, bem-estar e o mercado de imóveis em Campinas, num blog da RUAH Investimentos Imobiliários.';
  const vazio = `<div class="vazio"><p>${cat ? 'Ainda não há textos nesta categoria.' : 'Os primeiros textos chegam em breve.'}</p><a href="/blog">Ver todos os textos</a></div>`;
  const corpo = `
${cat ? `<header class="cab-cat"><h1>${esc(cat.nome)}</h1><p>${esc(cat.descricao)}</p></header>` : '<h1 class="oculto">' + esc(`${NOME}, o blog da RUAH`) + '</h1>'}
${primeiro ? cartao(primeiro, true) : vazio}
${resto.length ? `<section class="lista-art" aria-label="Mais textos">
<div class="busca"><label for="busca">Procurar no blog</label><input id="busca" type="search" placeholder="Piscina, mármore, Sousas…" autocomplete="off"></div>
<div class="grade">${resto.map((a) => cartao(a)).join('')}</div><p class="sem-resultado" hidden>Nada encontrado. Tente outra palavra.</p></section>` : ''}`;
  const base = urlBase(req);
  const ld = [{ '@context': 'https://schema.org', '@type': 'Blog', name: NOME, description: descricao, url: `${base}/blog`, publisher: { '@type': 'RealEstateAgent', name: 'RUAH Investimentos Imobiliários', url: SITE_RUAH, address: { '@type': 'PostalAddress', addressLocality: 'Campinas', addressRegion: 'SP', addressCountry: 'BR' } } }];
  return casca(req, { titulo, descricao, caminho: cat ? `/blog/categoria/${cat.slug}` : '/blog', imagem: primeiro && primeiro.capa && primeiro.capa.src, ld, corpo, classe: 'inicio' });
}

function paginaArtigo(req, a, relacionados) {
  const { sumario, ids } = montarSumario(a.blocos);
  const base = urlBase(req);
  const url = `${base}/blog/${a.slug}`;
  const minutos = minutosDeLeitura(a);
  const noticia = a.categoria === 'noticias';
  const ld = [
    {
      '@context': 'https://schema.org', '@type': noticia ? 'NewsArticle' : 'BlogPosting',
      headline: a.titulo, description: a.resumo, image: a.capa ? [a.capa.src] : undefined,
      datePublished: a.publicadoEm, dateModified: a.atualizadoEm || a.publicadoEm,
      author: { '@type': 'Organization', name: 'Equipe RUAH', url: SITE_RUAH },
      publisher: { '@type': 'Organization', name: 'RUAH Investimentos Imobiliários', url: SITE_RUAH },
      mainEntityOfPage: url, keywords: a.etiquetas.join(', '), inLanguage: 'pt-BR',
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: NOME, item: `${base}/blog` },
        { '@type': 'ListItem', position: 2, name: nomeDaCategoria(a.categoria), item: `${base}/blog/categoria/${a.categoria}` },
        { '@type': 'ListItem', position: 3, name: a.titulo, item: url },
      ],
    },
  ];
  if (a.perguntas) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: a.perguntas.map((p) => ({ '@type': 'Question', name: p.pergunta, acceptedAnswer: { '@type': 'Answer', text: p.resposta } })) });

  const corpo = `<div class="leitura" aria-hidden="true"><span></span></div>
<article class="artigo">
<header class="art-cab">
  <a class="cat" href="/blog/categoria/${a.categoria}">${esc(nomeDaCategoria(a.categoria))}${a.formato === 'dica' ? ', dica' : ''}</a>
  <h1>${esc(a.titulo)}</h1>
  <p class="linha-fina">${esc(a.resumo)}</p>
  <p class="meta">Por Equipe RUAH. <time datetime="${a.publicadoEm}">${dataPorExtenso(a.publicadoEm)}</time>${a.atualizadoEm ? `, atualizado em ${dataPorExtenso(a.atualizadoEm)}` : ''}. Leitura de ${minutos} min.</p>
</header>
${a.capa ? `<figure class="capa"><img src="${esc(a.capa.src)}" alt="${esc(a.capa.alt)}" width="${a.capa.largura || 1600}" height="${a.capa.altura || 900}" fetchpriority="high"><figcaption>Imagem ilustrativa gerada por IA.</figcaption></figure>` : ''}
<div class="art-corpo">
${sumario.filter((s) => s.nivel === 2).length >= 3 ? `<details class="sumario" open><summary>Neste texto</summary><ol>${sumario.filter((s) => s.nivel === 2).map((s) => `<li><a href="#${esc(s.id)}">${esc(s.texto)}</a></li>`).join('')}</ol></details>` : ''}
<div class="texto">
${a.blocos.map((b) => bloco(b, ids)).join('\n')}
${a.perguntas ? `<section class="faq" aria-labelledby="faq"><h2 id="faq">Perguntas frequentes</h2>${a.perguntas.map((p) => `<details><summary>${esc(p.pergunta)}</summary><p>${esc(p.resposta)}</p></details>`).join('')}</section>` : ''}
${a.fontes ? `<section class="fontes"><h2>Fontes consultadas</h2><ul>${a.fontes.map((f) => `<li>${esc(f.nome)}${siteDe(f.url) && !f.nome.includes(siteDe(f.url)) ? `, ${esc(siteDe(f.url))}` : ''}${f.data ? `, ${esc(f.data)}` : ''}</li>`).join('')}</ul></section>` : ''}
<div class="partilha"><span>Gostou? Copie o link e mande para quem está pensando em casa.</span><button class="botao sec" type="button" data-copiar="${esc(url)}">Copiar link</button></div>
</div></div>
</article>
${relacionados.length ? `<section class="relacionados" aria-labelledby="leia"><h2 id="leia">Leia também</h2><div class="grade">${relacionados.map((r) => cartao(r)).join('')}</div></section>` : ''}`;
  return casca(req, { titulo: `${(a.seo && a.seo.titulo) || a.titulo} · ${NOME}`, descricao: a.resumo, caminho: `/blog/${a.slug}`, imagem: a.capa && a.capa.src, tipoOg: 'article', ld, corpo, classe: 'pagina-artigo' });
}

function paginaNaoAchada(req) {
  return casca(req, { titulo: `Página não encontrada · ${NOME}`, descricao: 'Este texto não existe ou saiu do ar.', caminho: req.path, corpo: '<div class="vazio"><h1>Este texto não está aqui</h1><p>Ele pode ter mudado de endereço ou saído do ar.</p><a href="/blog">Ver todos os textos</a></div>' });
}

function rss(req, artigos) {
  const base = urlBase(req);
  const x = (s) => esc(s);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${x(NOME)}, o blog da RUAH</title><link>${x(base)}/blog</link><description>${x(LEGENDA)}</description><language>pt-BR</language>
<atom:link href="${x(base)}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${artigos.slice(0, 30).map((a) => `<item><title>${x(a.titulo)}</title><link>${x(base)}/blog/${a.slug}</link><guid>${x(base)}/blog/${a.slug}</guid><pubDate>${new Date(a.publicadoEm).toUTCString()}</pubDate><description>${x(a.resumo)}</description><category>${x(nomeDaCategoria(a.categoria))}</category></item>`).join('\n')}
</channel></rss>`;
}

function sitemap(req, artigos, imoveis = []) {
  const base = urlBase(req);
  const urls = [
    `<url><loc>${esc(base)}/imoveis</loc></url>`,
    ...imoveis.map((x) => `<url><loc>${esc(base)}/imoveis/${x.pagina.slug}</loc>${x.pagina.atualizadoEm || x.pagina.publicadoEm ? `<lastmod>${x.pagina.atualizadoEm || x.pagina.publicadoEm}</lastmod>` : ''}</url>`),
    `<url><loc>${esc(base)}/blog</loc>${artigos[0] ? `<lastmod>${artigos[0].publicadoEm}</lastmod>` : ''}</url>`,
    ...CATEGORIAS.map((c) => `<url><loc>${esc(base)}/blog/categoria/${c.slug}</loc></url>`),
    ...artigos.map((a) => `<url><loc>${esc(base)}/blog/${a.slug}</loc><lastmod>${a.publicadoEm}</lastmod></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
}

function robots(req) {
  const base = urlBase(req);
  // Só o blog e o portal são públicos. O sistema (login, cadastro, links off-market) fica fora da busca.
  return `User-agent: *\nAllow: /blog\nAllow: /blog-assets/\nAllow: /imoveis\nAllow: /portal-assets/\nDisallow: /imoveis/favoritos\nDisallow: /imoveis/dados.json\nDisallow: /\n\nSitemap: ${base}/sitemap.xml\n`;
}

module.exports = { paginaInicial, paginaArtigo, paginaNaoAchada, rss, sitemap, robots, NOME };
