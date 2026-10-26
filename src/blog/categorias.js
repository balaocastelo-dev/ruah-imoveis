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
const INSTAGRAM_RUAH = 'https://www.instagram.com/ruahimobiliaria/';

/**
 * Temas de chamada. `acao`: 'whatsapp' abre o WhatsApp da RUAH (WHATSAPP_RUAH no
 * .env) com a mensagem pronta; sem número, cai no site. 'site' e 'instagram'
 * levam aos endereços oficiais.
 */
const CHAMADAS = {
  comprar: {
    titulo: 'Procurando um imóvel em Campinas?',
    texto: 'Converse com a equipe da RUAH. O atendimento é feito por pessoas, do primeiro contato à assinatura.',
    rotulo: 'Falar com a RUAH',
    acao: 'whatsapp',
    mensagem: 'Olá! Li o blog da RUAH e quero ajuda para encontrar um imóvel.',
  },
  vender: {
    titulo: 'Vai vender o seu imóvel?',
    texto: 'A RUAH trabalha com a venda de imóveis em Campinas e região. Conte o que você tem e converse com a equipe.',
    rotulo: 'Quero vender',
    acao: 'whatsapp',
    mensagem: 'Olá! Li o blog da RUAH e quero conversar sobre a venda do meu imóvel.',
  },
  'alto-padrao': {
    titulo: 'Veja os imóveis à venda pela RUAH',
    texto: 'Casas e apartamentos à venda em Campinas, com fotos, ficha completa e contato direto com o corretor.',
    rotulo: 'Ver imóveis',
    acao: 'portal',
  },
  visita: {
    titulo: 'Gostou de algum imóvel?',
    texto: 'Marque uma visita com a equipe da RUAH e veja de perto o que leu aqui.',
    rotulo: 'Marcar visita',
    acao: 'whatsapp',
    mensagem: 'Olá! Li o blog da RUAH e quero marcar uma visita.',
  },
  instagram: {
    titulo: 'Acompanhe a RUAH no Instagram',
    texto: 'Imóveis novos, bastidores e as dicas do blog em formato curto.',
    rotulo: 'Seguir @ruahimobiliaria',
    acao: 'instagram',
  },
  geral: {
    titulo: 'Fale com a RUAH',
    texto: 'Imobiliária de venda em Campinas. Tire suas dúvidas com a equipe.',
    rotulo: 'Conversar',
    acao: 'whatsapp',
    mensagem: 'Olá! Li o blog da RUAH e tenho uma dúvida.',
  },
};
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
  CATEGORIAS, SLUGS, nomeDaCategoria, CHAMADAS, TEMAS, SITE_RUAH, INSTAGRAM_RUAH,
  RAMO_DE_CONTEUDO, DONO_REPO, ENDERECO_DO_RAMO, arquivoDaCapa, enderecoDaCapa, capaDaRotina,
};
