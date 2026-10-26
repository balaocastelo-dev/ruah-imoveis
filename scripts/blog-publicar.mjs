#!/usr/bin/env node
/**
 * Blog RUAH · a ÚNICA porta de entrada de um artigo no blog.
 *
 *   node scripts/blog-publicar.mjs preparar [--amanha]
 *   node scripts/blog-publicar.mjs listar
 *   node scripts/blog-publicar.mjs conferir artigo.json
 *   node scripts/blog-publicar.mjs publicar artigo.json [--amanha]
 *   node scripts/blog-publicar.mjs pendentes
 *   node scripts/blog-publicar.mjs capa <endereço> foto.jpg [--alt "…"] [--trocar]
 *   node scripts/blog-publicar.mjs capa <endereço> --pedir --alt "…" --pedido "…" [--trocar]
 *   node scripts/blog-publicar.mjs capa <endereço> --desistir
 *   node scripts/blog-publicar.mjs retirar <endereço>
 *
 * Antes de publicar, o artigo passa pelas MESMAS conferências que o site
 * aplica antes de mostrar: o formato (src/blog/validar.js) e a régua editorial
 * (src/blog/regua.js). Se não passa aqui, não passaria lá.
 *
 * Publicar = gravar arquivos no ramo `claude/blog-conteudo` deste repositório
 * e enviar. O sistema não é reinstalado; o ramo main não é tocado.
 *
 * Regra que não muda: NENHUM artigo aparece sem foto de capa. Quem escreve
 * (na nuvem) só descreve a foto ("capa": { "alt", "pedido" }); o pedido entra
 * na fila capas/pendentes.json; o PC da RTX 4090 gera a foto de noite, um
 * modelo de visão confere e ela é presa ao artigo com o subcomando `capa`.
 * Por isso a rotina escreve na véspera (--amanha): 6h, 12h ou 18h do dia
 * seguinte, conforme o tipo.
 *
 * Adaptado do comando do blog da Balão (balao2026/scripts/blog-publicar.mjs).
 * Precisa só do Node 22+ e do git.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { lerArtigo } = require('../src/blog/validar.js');
const { avaliarArtigo, tipoDe } = require('../src/blog/regua.js');
const { minutosDeLeitura, semAcento, diaEmCampinas, FUSO } = require('../src/blog/texto.js');
const { RAMO_DE_CONTEUDO: RAMO, arquivoDaCapa, enderecoDaCapa } = require('../src/blog/categorias.js');

const SITE = (process.env.BLOG_URL || '').replace(/\/+$/, '');

// ---------------------------------------------------------------- utilidades

function git(args, opcoes = {}) {
  return execFileSync('git', args, { cwd: opcoes.cwd ?? RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function sair(mensagem, codigo = 1) {
  console.error(`\n✗ ${mensagem}`);
  process.exit(codigo);
}
const endereco = (slug) => `${SITE}/blog/${slug}`;

const TIPOS = { principal: 'artigo principal (manhã)', noticia: 'notícia (meio-dia)', dica: 'dica (fim da tarde)' };
/** Campinas não tem horário de verão desde 2019: o fuso é sempre -03:00. */
const HORARIOS = { principal: '06:00', noticia: '12:00', dica: '18:00' };
const amanhaEmCampinas = () => diaEmCampinas(new Date(Date.now() + 24 * 3600 * 1000).toISOString());
const agendadoParaAmanha = (tipo) => new Date(`${amanhaEmCampinas()}T${HORARIOS[tipo]}:00-03:00`).toISOString();
const quando = (iso) => new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/** Abre o ramo de conteúdo numa pasta à parte, sem mexer na pasta de trabalho. */
function abrirRamo() {
  try {
    git(['fetch', '--quiet', 'origin', `+refs/heads/${RAMO}:refs/remotes/origin/${RAMO}`]);
  } catch (erro) {
    sair(`Não consegui buscar o ramo ${RAMO}: ${String(erro.stderr || erro.message).trim()}`);
  }
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-ruah-'));
  git(['worktree', 'add', '--quiet', '--detach', pasta, `origin/${RAMO}`]);
  return pasta;
}
function fecharRamo(pasta) {
  try { git(['worktree', 'remove', '--force', pasta]); } catch { fs.rmSync(pasta, { recursive: true, force: true }); }
}
function lerIndice(pasta) {
  const arq = path.join(pasta, 'indice.json');
  if (!fs.existsSync(arq)) return { versao: 1, artigos: [] };
  const i = JSON.parse(fs.readFileSync(arq, 'utf8'));
  return { versao: 1, artigos: Array.isArray(i.artigos) ? i.artigos : [] };
}
function gravarIndice(pasta, indice) {
  indice.artigos.sort((a, b) => Date.parse(b.publicadoEm) - Date.parse(a.publicadoEm));
  indice.atualizadoEm = new Date().toISOString();
  fs.writeFileSync(path.join(pasta, 'indice.json'), `${JSON.stringify(indice, null, 2)}\n`);
}
function enviar(pasta, mensagem) {
  git(['add', '-A'], { cwd: pasta });
  const identidade = [];
  try { git(['config', 'user.email'], { cwd: pasta }); } catch { identidade.push('-c', 'user.name=Blog RUAH', '-c', 'user.email=imoveisruah@gmail.com'); }
  const rodape = process.env.BLOG_RODAPE_DO_COMMIT ? `\n\n${process.env.BLOG_RODAPE_DO_COMMIT}` : '';
  git([...identidade, 'commit', '--quiet', '-m', `${mensagem}${rodape}`], { cwd: pasta });
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      git(['push', '--quiet', 'origin', `HEAD:refs/heads/${RAMO}`], { cwd: pasta });
      return;
    } catch (erro) {
      // Outro envio chegou antes (a foto do PC, outra tarefa): refaz em cima e tenta de novo.
      if (tentativa >= 3) sair(`O envio ao GitHub falhou. Nada foi publicado.\n${String(erro.stderr || erro.message).trim()}`);
      try {
        git(['fetch', '--quiet', 'origin', `+refs/heads/${RAMO}:refs/remotes/origin/${RAMO}`], { cwd: pasta });
        git(['rebase', '--quiet', `origin/${RAMO}`], { cwd: pasta });
      } catch (e2) {
        sair(`O envio ao GitHub falhou e não deu para juntar com o que chegou antes. Nada foi publicado.\n${String(e2.stderr || e2.message).trim()}`);
      }
    }
  }
}

// --------------------------------------------------------------- foto de capa

const CAPA_PESO_MAXIMO = 900 * 1024;
const CAPA_LARGURA_MINIMA = 1200;

function medirImagem(bytes) {
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47 && bytes.readUInt32BE(4) === 0x0d0a1a0a) {
    return { extensao: 'png', largura: bytes.readUInt32BE(16), altura: bytes.readUInt32BE(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marcador = bytes[i + 1];
      if (marcador === 0xff) { i += 1; continue; }
      const tamanho = bytes.readUInt16BE(i + 2);
      const quadro = marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);
      if (quadro) return { extensao: 'jpg', largura: bytes.readUInt16BE(i + 7), altura: bytes.readUInt16BE(i + 5) };
      i += 2 + tamanho;
    }
  }
  return null;
}

function lerCapa(arquivo, slug) {
  if (!fs.existsSync(arquivo)) sair(`Foto de capa não encontrada: ${arquivo}`);
  const bytes = fs.readFileSync(arquivo);
  const medida = medirImagem(bytes);
  if (!medida) sair('A foto de capa precisa ser um arquivo JPEG ou PNG.');
  const erros = [];
  if (bytes.length > CAPA_PESO_MAXIMO) erros.push(`A foto tem ${Math.round(bytes.length / 1024)} KB; o máximo é ${CAPA_PESO_MAXIMO / 1024} KB.`);
  if (medida.largura < CAPA_LARGURA_MINIMA) erros.push(`A foto tem ${medida.largura} px de largura; o mínimo é ${CAPA_LARGURA_MINIMA}.`);
  const p = medida.largura / medida.altura;
  if (p < 1.5 || p > 2) erros.push(`A foto é ${medida.largura} × ${medida.altura}; precisa ser deitada, perto de 16:9.`);
  if (erros.length) sair(`Capa reprovada:\n- ${erros.join('\n- ')}`);
  const marca = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  return { bytes, noRamo: arquivoDaCapa(slug, marca, medida.extensao), src: enderecoDaCapa(slug, marca, medida.extensao), largura: medida.largura, altura: medida.altura };
}

function capasNoRamo(pasta, slug) {
  const dir = path.join(pasta, 'capas');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => n.startsWith(`${slug}-`) && /^[0-9a-f]{8}\.(?:jpg|png)$/.test(n.slice(slug.length + 1)))
    .map((n) => path.join(dir, n));
}

const PEDIDO_MINIMO = 60;
const PEDIDO_MAXIMO = 900;

function lerPendentes(pasta) {
  const arq = path.join(pasta, 'capas', 'pendentes.json');
  if (!fs.existsSync(arq)) return [];
  try {
    const l = JSON.parse(fs.readFileSync(arq, 'utf8'));
    return Array.isArray(l.pendentes) ? l.pendentes.filter((p) => p && typeof p.slug === 'string') : [];
  } catch { return []; }
}
function gravarPendentes(pasta, pendentes) {
  fs.mkdirSync(path.join(pasta, 'capas'), { recursive: true });
  const ord = [...pendentes].sort((a, b) => Date.parse(a.pedidoEm) - Date.parse(b.pedidoEm));
  fs.writeFileSync(path.join(pasta, 'capas', 'pendentes.json'), `${JSON.stringify({ versao: 1, pendentes: ord }, null, 2)}\n`);
}
function conferirPedidoDeCapa(capa) {
  const erros = [];
  const alt = typeof capa.alt === 'string' ? capa.alt.trim() : '';
  const pedido = typeof capa.pedido === 'string' ? capa.pedido.replace(/\s+/g, ' ').trim() : '';
  if (alt.length < 12) erros.push('A capa precisa dizer o que a foto mostra: "capa": { "alt": "…" }.');
  if (pedido.length < PEDIDO_MINIMO || pedido.length > PEDIDO_MAXIMO) {
    erros.push(`A capa precisa do pedido da foto ("capa": { "pedido": "…" }), em inglês, de ${PEDIDO_MINIMO} a ${PEDIDO_MAXIMO} caracteres. Tem ${pedido.length}.`);
  }
  if (/https?:|www\./i.test(pedido)) erros.push('O pedido da foto não leva endereço de site.');
  if (/\b(person|people|woman|man|girl|boy|family|couple|child|realtor|agent)\b/i.test(pedido)) erros.push('O pedido da foto não leva pessoas (rosto reprova a foto).');
  return { erros, alt, pedido };
}

// ------------------------------------------------------------------ comandos

const [comando, alvo, ...resto] = process.argv.slice(2);
const argumentos = [alvo, ...resto].filter((a) => typeof a === 'string');
const opcoes = new Set(argumentos.filter((a) => a.startsWith('--')).map((a) => a.split('=')[0]));
const atualizar = opcoes.has('--atualizar');
const forcar = opcoes.has('--forcar');
const amanha = opcoes.has('--amanha');

function valorDaOpcao(nome) {
  const i = argumentos.findIndex((a) => a === nome || a.startsWith(`${nome}=`));
  if (i < 0) return null;
  const v = argumentos[i].includes('=') ? argumentos[i].slice(nome.length + 1) : argumentos[i + 1];
  if (!v || v.startsWith('--')) sair(`Diga o valor: ${nome} …`);
  return v;
}
const arquivoDaFoto = comando === 'capa' ? null : valorDaOpcao('--capa');

function conferir(arquivo) {
  if (!arquivo || !fs.existsSync(arquivo)) sair(`Arquivo não encontrado: ${arquivo ?? '(nenhum)'}`);
  let bruto;
  try { bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch (e) { sair(`O arquivo não é um JSON válido: ${e.message}`); }
  if (bruto && typeof bruto === 'object' && !bruto.publicadoEm) bruto.publicadoEm = new Date().toISOString();

  let foto = null;
  let pendente = null;
  if (arquivoDaFoto) {
    if (!bruto || typeof bruto.slug !== 'string') sair('O artigo precisa do campo slug.');
    const alt = typeof bruto.capa?.alt === 'string' ? bruto.capa.alt.trim() : '';
    if (alt.length < 12) sair('Com --capa, o artigo precisa dizer o que a foto mostra: "capa": { "alt": "…" }.');
    foto = lerCapa(arquivoDaFoto, bruto.slug);
    bruto.capa = { src: foto.src, alt, largura: foto.largura, altura: foto.altura };
  } else if (bruto?.capa && typeof bruto.capa === 'object' && !bruto.capa.src) {
    const p = conferirPedidoDeCapa(bruto.capa);
    if (p.erros.length) sair(`Capa reprovada:\n- ${p.erros.join('\n- ')}`);
    pendente = { alt: p.alt, pedido: p.pedido };
    delete bruto.capa;
  }

  const lido = lerArtigo(bruto);
  if (!lido.ok) sair(`Formato reprovado:\n- ${lido.erros.join('\n- ')}`);
  const artigo = lido.valor;
  const av = avaliarArtigo(artigo);
  const m = av.medidas;
  console.log(`\n${artigo.titulo}`);
  console.log(`/blog/${artigo.slug} · ${artigo.categoria} · ${m.palavras} palavras · ${m.secoes} seções · ${minutosDeLeitura(artigo)} min de leitura`);
  console.log(`${m.tabelas} tabela(s) · ${m.perguntas} pergunta(s) · ${m.linksInternos} link(s) internos · ${m.chamadas} chamada(s) · ${m.fontes} fonte(s)`);
  console.log(`Tipo: ${TIPOS[tipoDe(artigo)]}`);
  if (foto) console.log(`Capa: ${foto.largura} × ${foto.altura}, ${Math.round(foto.bytes.length / 1024)} KB`);
  if (pendente) console.log('Capa: a foto será gerada no PC da RTX 4090; o artigo só aparece no blog depois que ela chegar.');
  if (av.avisos.length) console.log(`\nAvisos (não impedem):\n- ${av.avisos.join('\n- ')}`);
  if (!av.aprovado) sair(`Reprovado na régua editorial:\n- ${av.erros.join('\n- ')}`);
  return { artigo, foto, pendente };
}

function conferirContraOPublicado(artigo, indice, lote = []) {
  const erros = [];
  const noIndice = indice.artigos.find((a) => a.slug === artigo.slug);
  if (noIndice && !atualizar) erros.push(`/blog/${artigo.slug} já está publicado. Para trocar o texto, use --atualizar.`);

  const palavras = (t) => new Set(semAcento(t).split(/[^a-z0-9]+/).filter((p) => p.length > 3));
  const minhas = palavras(artigo.titulo);
  for (const outro of indice.artigos) {
    if (outro.slug === artigo.slug || !outro.titulo) continue;
    const dele = palavras(outro.titulo);
    const comuns = [...minhas].filter((p) => dele.has(p)).length;
    if (comuns >= 3 && comuns / Math.min(minhas.size, dele.size) >= 0.75 && !forcar) {
      erros.push(`O título repete o assunto de "${outro.titulo}" (/blog/${outro.slug}). Escolha outro tema.`);
    }
  }
  const existentes = new Set([...indice.artigos.map((a) => a.slug), ...lote]);
  for (const [, slug] of JSON.stringify(artigo.blocos).matchAll(/\]\(\/blog\/([a-z0-9-]+)[)#?]/g)) {
    if (slug !== 'categoria' && !existentes.has(slug)) erros.push(`O texto aponta para /blog/${slug}, que não existe.`);
  }
  if (!atualizar && !forcar) {
    const dia = diaEmCampinas(artigo.publicadoEm);
    const tipo = tipoDe(artigo);
    const doDia = indice.artigos.find((a) => diaEmCampinas(a.publicadoEm) === dia && tipoDe(a) === tipo);
    if (doDia) erros.push(`O dia ${dia} já tem ${TIPOS[tipo]}: "${doDia.titulo}".`);
  }
  if (erros.length) sair(`Não publicado:\n- ${[...new Set(erros)].join('\n- ')}`);
}

function mostrarPublicados(indice) {
  console.log(`Publicados (${indice.artigos.length}), do mais novo para o mais antigo:`);
  const agora = Date.now();
  for (const a of indice.artigos) {
    const marcas = [Date.parse(a.publicadoEm) > agora ? `agendado para ${quando(a.publicadoEm)}` : '', a.capa ? '' : 'esperando a foto, fora do blog'].filter(Boolean);
    console.log(`- ${diaEmCampinas(a.publicadoEm)} · ${a.categoria}${a.formato === 'dica' ? ' (dica)' : ''} · ${a.titulo} · /blog/${a.slug}${marcas.length ? ` (${marcas.join('; ')})` : ''}`);
  }
  const hoje = diaEmCampinas(new Date().toISOString());
  for (const [rotulo, dia, ja] of [['Hoje', hoje, 'JÁ PUBLICADO'], ['Amanhã', amanhaEmCampinas(), 'JÁ AGENDADO']]) {
    if (rotulo === 'Amanhã' && !amanha) continue;
    console.log(`\n${rotulo} (${dia}):`);
    for (const [tipo, nome] of Object.entries(TIPOS)) {
      const d = indice.artigos.find((a) => diaEmCampinas(a.publicadoEm) === dia && tipoDe(a) === tipo);
      console.log(`- ${nome}: ${d ? `${ja} — ${d.titulo}` : 'ainda não tem'}`);
    }
  }
}

if (comando === 'listar') {
  const pasta = abrirRamo();
  try { mostrarPublicados(lerIndice(pasta)); } finally { fecharRamo(pasta); }
} else if (comando === 'preparar') {
  const pasta = abrirRamo();
  try {
    const indice = lerIndice(pasta);
    for (const arq of ['ROTINA.md', 'pauta.md']) {
      const c = path.join(pasta, arq);
      console.log(`\n${'='.repeat(24)} ${arq} ${'='.repeat(24)}\n`);
      console.log(fs.existsSync(c) ? fs.readFileSync(c, 'utf8') : `(o ramo de conteúdo não tem ${arq})`);
    }
    console.log(`\n${'='.repeat(24)} O que já foi publicado ${'='.repeat(24)}\n`);
    mostrarPublicados(indice);
    console.log('\nModelos (copie a estrutura, não o texto):');
    for (const [tipo, nome] of Object.entries(TIPOS)) {
      const modelos = indice.artigos.filter((a) => tipoDe(a) === tipo)
        .map((a) => path.join(pasta, 'artigos', `${a.slug}.json`)).filter((f) => fs.existsSync(f))
        .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
      if (!modelos[0]) { console.log(`- ${nome}: ainda não há; siga o formato do ROTINA.md`); continue; }
      const destino = path.join(os.tmpdir(), `blog-modelo-${tipo}.json`);
      fs.copyFileSync(modelos[0], destino);
      console.log(`- ${nome}: ${destino}`);
    }
  } finally { fecharRamo(pasta); }
} else if (comando === 'conferir') {
  const { artigo, pendente } = conferir(alvo);
  if (!artigo.capa && !pendente) console.log('\nAtenção: o artigo não descreve a foto de capa. O publicar exige "capa": { "alt": "…", "pedido": "…" }.');
  if (amanha) console.log(`Com --amanha, aparece em ${quando(agendadoParaAmanha(tipoDe(artigo)))}, já com a foto.`);
  console.log('\n✓ Aprovado. (Nada foi publicado: use o comando publicar.)');
} else if (comando === 'publicar') {
  // Vários arquivos no mesmo comando = um lote (o lançamento do blog): todos conferidos
  // como sempre, gravados juntos num só envio; podem apontar uns para os outros.
  const arquivos = [alvo, ...resto].filter((a) => a && !a.startsWith('--') && a.endsWith('.json') && a !== arquivoDaFoto);
  if (arquivos.length > 1 && arquivoDaFoto) sair('--capa só vale com um artigo por vez.');
  const lidos = arquivos.map((arq) => conferir(arq));
  const lote = lidos.map((l) => l.artigo.slug);
  for (const { artigo, pendente } of lidos) {
    if (amanha) artigo.publicadoEm = agendadoParaAmanha(tipoDe(artigo));
    else if (Date.parse(artigo.publicadoEm) > Date.now() + 60_000) sair('A data de publicação está no futuro. Para agendar, use --amanha.');
    if (!artigo.capa && !pendente) sair(`Falta a foto de capa em ${artigo.slug}: descreva-a ("capa": { "alt", "pedido" }) ou passe --capa foto.jpg.`);
  }
  // No lote, a ordem dos arquivos é a ordem de publicação: o último fica no topo do blog.
  if (lidos.length > 1 && !amanha) lidos.forEach((l, i) => { l.artigo.publicadoEm = new Date(Date.now() - (lidos.length - 1 - i) * 60_000).toISOString(); });

  const pasta = abrirRamo();
  try {
    const indice = lerIndice(pasta);
    const fila = lerPendentes(pasta);
    const titulos = [];
    for (const { artigo, foto, pendente } of lidos) {
      conferirContraOPublicado(artigo, indice, lote.filter((s) => s !== artigo.slug));
      const paraGravar = { ...artigo };
      delete paraGravar.autor;
      delete paraGravar.origem;
      const anterior = indice.artigos.find((a) => a.slug === artigo.slug);
      if (anterior) { paraGravar.publicadoEm = anterior.publicadoEm; paraGravar.atualizadoEm = new Date().toISOString(); }

      const capaEmUso = artigo.capa ? path.join(pasta, 'capas', path.basename(artigo.capa.src)) : null;
      if (foto) {
        fs.mkdirSync(path.join(pasta, 'capas'), { recursive: true });
        fs.writeFileSync(path.join(pasta, foto.noRamo), foto.bytes);
      } else if (capaEmUso && !fs.existsSync(capaEmUso)) sair('O artigo aponta para uma foto que não está no ramo de conteúdo: passe --capa foto.jpg.');
      for (const antiga of capasNoRamo(pasta, artigo.slug)) if (antiga !== capaEmUso) fs.rmSync(antiga, { force: true });

      fs.mkdirSync(path.join(pasta, 'artigos'), { recursive: true });
      fs.writeFileSync(path.join(pasta, 'artigos', `${artigo.slug}.json`), `${JSON.stringify(paraGravar, null, 2)}\n`);
      indice.artigos = indice.artigos.filter((a) => a.slug !== artigo.slug);
      indice.artigos.push({
        slug: artigo.slug, titulo: artigo.titulo, resumo: artigo.resumo, categoria: artigo.categoria, etiquetas: artigo.etiquetas,
        capa: artigo.capa, publicadoEm: paraGravar.publicadoEm, minutos: minutosDeLeitura(artigo), ...(artigo.formato ? { formato: artigo.formato } : {}),
      });
      const i = fila.findIndex((p) => p.slug === artigo.slug);
      if (i >= 0) fila.splice(i, 1);
      if (pendente && !artigo.capa) fila.push({ slug: artigo.slug, titulo: artigo.titulo, categoria: artigo.categoria, alt: pendente.alt, pedido: pendente.pedido, pedidoEm: new Date().toISOString() });
      const futuro = Date.parse(paraGravar.publicadoEm) > Date.now();
      titulos.push(artigo.titulo);
      console.log(`\n✓ ${anterior ? 'Atualizado' : futuro ? `Agendado para ${quando(paraGravar.publicadoEm)}` : 'Publicado'}: ${endereco(artigo.slug)}`);
      if (pendente && !artigo.capa) console.log('  O blog só mostra o texto depois que a foto chegar (fila do PC da RTX 4090, capas/pendentes.json).');
    }
    gravarIndice(pasta, indice);
    gravarPendentes(pasta, fila);
    const verbo = amanha ? 'Agenda' : 'Publica';
    enviar(pasta, titulos.length === 1 ? `${verbo}: ${titulos[0]}` : `${verbo} ${titulos.length} textos: ${titulos.join(' | ')}`);
  } finally { fecharRamo(pasta); }
} else if (comando === 'pendentes') {
  const pasta = abrirRamo();
  try { console.log(JSON.stringify(lerPendentes(pasta))); } finally { fecharRamo(pasta); }
} else if (comando === 'capa') {
  if (!alvo || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(alvo)) sair('Diga o endereço do artigo: capa <endereço> foto.jpg');
  const desistir = opcoes.has('--desistir');
  const trocar = opcoes.has('--trocar');
  const pedir = opcoes.has('--pedir');
  const altPedido = valorDaOpcao('--alt');
  const textoPedido = pedir ? valorDaOpcao('--pedido') : null;
  const valores = new Set([altPedido, textoPedido].filter(Boolean));
  const arquivo = resto.find((a) => !a.startsWith('--') && !valores.has(a));
  if (!desistir && !pedir && !arquivo) sair('Diga o arquivo da foto: capa <endereço> foto.jpg (ou --pedir, ou --desistir).');

  const pasta = abrirRamo();
  try {
    const indice = lerIndice(pasta);
    const noIndice = indice.artigos.find((a) => a.slug === alvo);
    if (!noIndice) sair(`/blog/${alvo} não está publicado.`);
    const fila = lerPendentes(pasta);
    const pedido = fila.find((p) => p.slug === alvo);
    if (pedir) {
      if (noIndice.capa && !trocar) sair(`/blog/${alvo} já tem foto. Para pedir outra, use --trocar.`);
      const novo = conferirPedidoDeCapa({ alt: altPedido, pedido: textoPedido });
      if (novo.erros.length) sair(`Pedido reprovado:\n- ${novo.erros.join('\n- ')}`);
      gravarPendentes(pasta, [...fila.filter((p) => p.slug !== alvo), { slug: alvo, titulo: noIndice.titulo, categoria: noIndice.categoria, alt: novo.alt, pedido: novo.pedido, pedidoEm: new Date().toISOString() }]);
      enviar(pasta, `Capa: pede a foto de ${noIndice.titulo}`);
      console.log(`\n✓ Foto de /blog/${alvo} na fila do PC da RTX 4090.`);
    } else if (desistir) {
      if (!pedido) sair(`/blog/${alvo} não tem foto na fila.`);
      gravarPendentes(pasta, fila.filter((p) => p.slug !== alvo));
      enviar(pasta, `Capa: tira da fila ${noIndice.titulo}`);
      console.log(`\n✓ Pedido retirado da fila. Sem foto, /blog/${alvo} continua fora do blog.`);
    } else {
      const arqArtigo = path.join(pasta, 'artigos', `${alvo}.json`);
      const bruto = JSON.parse(fs.readFileSync(arqArtigo, 'utf8'));
      if (bruto.capa && !trocar) sair(`/blog/${alvo} já tem foto de capa. Para trocar, use --trocar.`);
      const alt = (altPedido ?? pedido?.alt ?? bruto.capa?.alt ?? '').trim();
      if (alt.length < 12) sair(`/blog/${alvo} não tem a descrição da foto (nem na fila, nem no artigo).`);
      const foto = lerCapa(arquivo, alvo);
      bruto.capa = { src: foto.src, alt, largura: foto.largura, altura: foto.altura };
      const lido = lerArtigo(bruto);
      if (!lido.ok) sair(`Formato reprovado:\n- ${lido.erros.join('\n- ')}`);
      const av = avaliarArtigo(lido.valor);
      if (!av.aprovado) sair(`Reprovado na régua editorial:\n- ${av.erros.join('\n- ')}`);
      fs.mkdirSync(path.join(pasta, 'capas'), { recursive: true });
      const novo = path.join(pasta, foto.noRamo);
      fs.writeFileSync(novo, foto.bytes);
      for (const antiga of capasNoRamo(pasta, alvo)) if (antiga !== novo) fs.rmSync(antiga, { force: true });
      fs.writeFileSync(arqArtigo, `${JSON.stringify(bruto, null, 2)}\n`);
      noIndice.capa = lido.valor.capa;
      gravarIndice(pasta, indice);
      if (pedido) gravarPendentes(pasta, fila.filter((p) => p.slug !== alvo));
      enviar(pasta, `Capa: ${noIndice.titulo}`);
      console.log(`\n✓ Foto de capa publicada (${foto.largura} × ${foto.altura}, ${Math.round(foto.bytes.length / 1024)} KB). Em até 10 minutos aparece em:\n  ${endereco(alvo)}`);
    }
  } finally { fecharRamo(pasta); }
} else if (comando === 'retirar') {
  if (!alvo || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(alvo)) sair('Diga o endereço do artigo: retirar <endereço>');
  const pasta = abrirRamo();
  try {
    const indice = lerIndice(pasta);
    const a = indice.artigos.find((x) => x.slug === alvo);
    if (!a) sair(`/blog/${alvo} não está publicado.`);
    indice.artigos = indice.artigos.filter((x) => x.slug !== alvo);
    fs.rmSync(path.join(pasta, 'artigos', `${alvo}.json`), { force: true });
    for (const c of capasNoRamo(pasta, alvo)) fs.rmSync(c, { force: true });
    gravarIndice(pasta, indice);
    const fila = lerPendentes(pasta);
    if (fila.some((p) => p.slug === alvo)) gravarPendentes(pasta, fila.filter((p) => p.slug !== alvo));
    enviar(pasta, `Retira: ${a.titulo}`);
    console.log(`\n✓ Retirado. Em até 10 minutos /blog/${alvo} sai do ar.`);
  } finally { fecharRamo(pasta); }
} else {
  console.log(`Uso:
  node scripts/blog-publicar.mjs preparar [--amanha]       regras, pauta e o que já foi publicado
  node scripts/blog-publicar.mjs listar                    o que já foi publicado
  node scripts/blog-publicar.mjs conferir artigo.json      confere formato e régua, sem publicar
  node scripts/blog-publicar.mjs publicar artigo.json      confere e publica   [--amanha] [--capa foto.jpg] [--atualizar] [--forcar]
  node scripts/blog-publicar.mjs pendentes                 fotos de capa que faltam gerar (JSON)
  node scripts/blog-publicar.mjs capa <endereço> foto.jpg  prende a foto a um artigo   [--trocar] [--alt "…"]
  node scripts/blog-publicar.mjs capa <endereço> --pedir --alt "…" --pedido "…"
  node scripts/blog-publicar.mjs capa <endereço> --desistir
  node scripts/blog-publicar.mjs retirar <endereço>        tira um artigo do ar`);
  process.exit(comando ? 2 : 0);
}
