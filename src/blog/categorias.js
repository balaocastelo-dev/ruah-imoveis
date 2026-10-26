// Blog RUAH · categorias, chamadas e o endereço do ramo de conteúdo.
//
// As chamadas (o convite para falar com a RUAH) têm o texto escrito AQUI, e não
// pela rotina: o artigo automático só escolhe o tema. Assim nenhum texto que
// ninguém revisou fala em nome da imobiliária. Para mudar um convite, mude aqui.

const CATEGORIAS = [
  { slug: 'alto-padrao', nome: 'Alto padrão', descricao: 'Como avaliar, comprar e viver bem num imóvel de alto padrão.' },
  { slug: 'construcao', nome: 'Construção e casas novas', descricao: 'Obra, projeto, materiais e o que conferir num imóvel novo.' },
  { slug: 'interiores', nome: 'Interiores e mobiliário', descricao: 'Mobiliário de luxo, decoração e materiais que atravessam décadas.' },
  { slug: 'bem-estar', nome: 'Bem-estar em casa', descricao: 'Luz, silêncio, verde e conforto: a casa que faz bem.' },
  { slug: 'campinas', nome: 'Campinas e região', descricao: 'Bairros, condomínios e a vida em Campinas e arredores.' },
  { slug: 'noticias', nome: 'Mercado imobiliário', descricao: 'O que mudou no mercado e o que isso muda para você.' },
];
const SLUGS = new Set(CATEGORIAS.map((c) => c.slug));
const nomeDaCategoria = (slug) => (CATEGORIAS.find((c) => c.slug === slug) || {}).nome || slug;

const SITE_RUAH = 'https://www.ruahimobiliaria.com.br';

/**
 * Temas de chamada. O leitor nunca sai do site da RUAH (decisão do Thiago, 26/10/2026):
 *   'contato' abre o formulário do próprio blog (vira lead no CRM, com o motivo);
 *   'portal'  leva à vitrine de imóveis à venda (/imoveis);
 *   'blog'    fica no blog.
 */
const CHAMADAS = {
  comprar: {
    titulo: 'Procurando um imóvel em Campinas?',
    texto: 'Conte o que você procura e um corretor da RUAH responde. O atendimento é feito por pessoas, do primeiro contato à assinatura.',
    rotulo: 'Falar com um corretor',
    acao: 'contato',
    motivo: 'comprar',
  },
  vender: {
    titulo: 'Vai vender o seu imóvel?',
    texto: 'A RUAH trabalha com a venda de imóveis em Campinas e região. Deixe seu contato e conte o que você tem.',
    rotulo: 'Quero vender',
    acao: 'contato',
    motivo: 'vender',
  },
  'alto-padrao': {
    titulo: 'Veja os imóveis à venda pela RUAH',
    texto: 'Casas e apartamentos à venda em Campinas, com fotos, ficha completa e contato direto com o corretor.',
    rotulo: 'Ver imóveis',
    acao: 'portal',
  },
  visita: {
    titulo: 'Quer ver um imóvel de perto?',
    texto: 'Escolha o imóvel na vitrine da RUAH e peça a visita na página dele: um corretor confirma o dia com você.',
    rotulo: 'Ver imóveis à venda',
    acao: 'portal',
  },
  blog: {
    titulo: 'Mais ideias para a sua casa',
    texto: 'Textos novos todos os dias, às 6h, 12h e 18h: arquitetura, interiores, bem-estar e Campinas.',
    rotulo: 'Ver mais textos',
    acao: 'blog',
  },
  geral: {
    titulo: 'Fale com a RUAH',
    texto: 'Imobiliária de venda em Campinas. Deixe sua dúvida e um corretor responde.',
    rotulo: 'Enviar minha dúvida',
    acao: 'contato',
    motivo: 'duvida',
  },
};
// 'instagram' levava o leitor para fora do site; os textos que já usam esse tema mostram a chamada do blog.
CHAMADAS.instagram = CHAMADAS.blog;
const TEMAS = new Set(Object.keys(CHAMADAS));

/** O ramo do GitHub onde a rotina publica. O repositório é público: leitura sem senha. */
const RAMO_DE_CONTEUDO = 'claude/blog-conteudo';
const DONO_REPO = 'balaocastelo-dev/ruah-imoveis';
const ENDERECO_DO_RAMO = `https://raw.githubusercontent.com/${DONO_REPO}/refs/heads/${RAMO_DE_CONTEUDO}`;

const arquivoDaCapa = (slug, marca, ext) => `capas/${slug}-${marca}.${ext}`;
const enderecoDaCapa = (slug, marca, ext) => `${ENDERECO_DO_RAMO}/${arquivoDaCapa(slug, marca, ext)}`;
/** A capa de artigo da rotina só pode ser o arquivo que o comando gravou para ele. */
function capaDaRotina(src, slug) {
  const prefixo = `${ENDERECO_DO_RAMO}/capas/${slug}-`;
  return typeof src === 'string' && src.startsWith(prefixo) && /^[0-9a-f]{8}\.(?:jpg|png)$/.test(src.slice(prefixo.length));
}

module.exports = {
  CATEGORIAS, SLUGS, nomeDaCategoria, CHAMADAS, TEMAS, SITE_RUAH,
  RAMO_DE_CONTEUDO, DONO_REPO, ENDERECO_DO_RAMO, arquivoDaCapa, enderecoDaCapa, capaDaRotina,
};
