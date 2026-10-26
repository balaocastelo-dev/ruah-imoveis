// Portal RUAH · ambientes, chamadas e o endereço do ramo de conteúdo.
//
// O portal mostra os imóveis à venda (status "publicado") com uma PÁGINA ÚNICA
// para cada um, escrita a partir das fotos e da ficha do imóvel. Segue o mesmo
// esquema do blog Sopro:
//   - a página é um JSON de blocos tipados (nunca HTML), num ramo do GitHub;
//   - quem escreve é uma tarefa agendada do Claude, que olha as fotos;
//   - uma régua em código confere no comando de publicar E de novo no site;
//   - nenhum imóvel aparece no portal sem a página aprovada.
// Os NÚMEROS (valor, áreas, quartos) nunca vêm do texto: vêm do banco, ao vivo.

/** Onde está cada foto. A galeria do imóvel é filtrada por estes ambientes. */
const AMBIENTES = {
  fachada: 'Fachada',
  sala: 'Salas',
  cozinha: 'Cozinha',
  quarto: 'Quartos',
  suite: 'Suítes',
  banheiro: 'Banheiros',
  varanda: 'Varanda',
  gourmet: 'Área gourmet',
  piscina: 'Piscina',
  lazer: 'Lazer',
  jardim: 'Jardim e área externa',
  garagem: 'Garagem',
  escritorio: 'Escritório',
  servico: 'Área de serviço',
  vista: 'Vista',
  condominio: 'Condomínio',
  terreno: 'Terreno',
  planta: 'Planta',
  outro: 'Outros',
};

/**
 * Chamadas: o texto é escrito AQUI, não pela rotina. A página só escolhe o
 * tema; o botão leva ao formulário da própria página (vira lead no CRM) ou ao
 * WhatsApp do corretor.
 */
const CHAMADAS = {
  visita: {
    titulo: 'Quer conhecer pessoalmente?',
    texto: 'Escolha o melhor período e a equipe da RUAH confirma a visita com você.',
    rotulo: 'Agendar visita',
  },
  interesse: {
    titulo: 'Gostou deste imóvel?',
    texto: 'Deixe seu contato e um corretor da RUAH responde com as informações que você precisar.',
    rotulo: 'Tenho interesse',
  },
  corretor: {
    titulo: 'Ficou alguma dúvida?',
    texto: 'Fale com o corretor responsável. O atendimento é feito por pessoas.',
    rotulo: 'Falar com o corretor',
  },
};
const TEMAS = new Set(Object.keys(CHAMADAS));

/** O ramo do GitHub onde ficam as páginas. O repositório é público: leitura sem senha. */
const RAMO_DE_CONTEUDO = 'claude/portal-conteudo';
const DONO_REPO = 'balaocastelo-dev/ruahimoveis';
const ENDERECO_DO_RAMO = `https://raw.githubusercontent.com/${DONO_REPO}/refs/heads/${RAMO_DE_CONTEUDO}`;

/** O endereço da página: palavras da busca + o código do imóvel no fim (único e estável). */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CODIGO = /^[A-Z]{1,4}-?[A-Z]{0,4}\d{2,6}$/;
const slugTerminaNoCodigo = (slug, codigo) => SLUG.test(slug) && slug.endsWith(`-${String(codigo).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);

module.exports = { AMBIENTES, CHAMADAS, TEMAS, RAMO_DE_CONTEUDO, DONO_REPO, ENDERECO_DO_RAMO, SLUG, CODIGO, slugTerminaNoCodigo };
