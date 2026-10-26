# Rotina diária do blog da RUAH

O blog da RUAH Investimentos Imobiliários (imobiliária de venda em Campinas,
SP) fica em `/blog` do Sistema RUAH e publica **três vezes por dia**. Cada
execução da rotina faz **uma** publicação — a tarefa que chamou você diz qual:

| Hora | Tipo | O que é |
|---|---|---|
| 6h | **Artigo principal** | O texto longo: alto padrão, construção e casas novas, interiores e mobiliário, bem-estar em casa, Campinas e região |
| 12h | **Notícia** | Um fato recente do mercado imobiliário e o que ele muda para quem compra ou vende |
| 18h | **Dica** | Uma pergunta, uma resposta direta. Curta, feita para virar post nas redes |

**Para que o blog existe:** trazer o curioso das redes sociais (Instagram,
Facebook) e da busca do Google para o blog — gente que gosta de casa bonita,
de arquitetura, de morar bem — e, com o tempo, fazer dele um cliente da RUAH.
Por isso o texto precisa ser **gostoso de ler e útil de verdade**, e não um
anúncio. Todo artigo leva uma legenda pronta para as redes (campo `redes`).

**Você escreve na véspera.** As três execuções rodam à noite (por volta das
19h) e agendam com `publicar --amanha`: o principal aparece às 6h, a notícia
às 12h e a dica às 18h. De madrugada o PC da RUAH (placa RTX 4090) faz a foto
de capa. **Nenhum artigo aparece sem a foto**: se ela atrasar, o artigo espera.

Ninguém lê o artigo antes de ele ir ao ar. Por isso a regra que vale mais do
que todas: **na dúvida, não afirme**. Um artigo simples e correto ajuda a
RUAH; um artigo vistoso com um dado errado prejudica — e no mercado imobiliário
um dado errado pode virar problema com cliente.

## O que a rotina pode e o que não pode

**Pode:** pesquisar na internet, escrever um arquivo JSON (que descreve a foto
de capa) e publicar com `node scripts/blog-publicar.mjs publicar --amanha`.

**Não pode, em nenhuma hipótese:**

- mexer no código do sistema, abrir ou juntar pull request, enviar qualquer
  coisa para outro ramo que não `claude/blog-conteudo`;
- editar à mão `indice.json`, `artigos/` ou `capas/` — tudo passa pelo comando;
- contornar a conferência: se o comando reprova, corrija o artigo; nunca mude
  a régua nem publique por outro caminho; nunca use `--forcar` nem `--atualizar`;
- mandar mensagem, e-mail ou WhatsApp para alguém, publicar em rede social ou
  mexer em qualquer outro sistema da RUAH (imóveis, clientes, radar);
- falar de um imóvel específico à venda, de cliente, de proprietário ou de
  valor de imóvel da carteira da RUAH.

Se algo impedir a publicação (GitHub fora do ar, erro do comando que não é do
artigo), **pare e relate**. Não improvise outro caminho.

## Passo a passo

1. `node scripts/blog-publicar.mjs preparar --amanha` — mostra este arquivo, a
   pauta, o que já foi publicado e o que já há para amanhã. Se a linha
   **"Amanhã"** do seu tipo disser JÁ AGENDADO, encerre.
2. Escolha o assunto (seção "Como escolher o assunto").
3. Pesquise: abra de três a seis páginas boas e leia de verdade; anote o
   endereço de cada uma que usar.
4. Escreva o artigo em `/tmp/artigo.json` (fora do repositório).
5. `node scripts/blog-publicar.mjs conferir /tmp/artigo.json` — corrija o que
   ele reprovar e leve os avisos a sério. Repita até passar.
6. Releia o texto inteiro uma vez, como leitor. Confira cada número, norma,
   lei e nome contra a página de onde saiu.
7. Descreva a foto de capa (seção "A foto de capa"). **Você não gera imagem.**
8. `node scripts/blog-publicar.mjs publicar /tmp/artigo.json --amanha`.
9. Relate em poucas linhas: título, endereço, de onde vieram os dados, a foto
   pedida e qualquer dúvida que tenha ficado.

## Os três tipos

### Artigo principal (6h)

1.200 palavras ou mais, quatro seções ou mais, "Em resumo", ao menos dois
elementos entre tabela e prós e contras, de 3 a 6 perguntas frequentes.
Categorias: `alto-padrao`, `construcao`, `interiores`, `bem-estar` ou
`campinas`. **Alterne**: não repita a categoria do dia anterior.

### Notícia (12h)

`"categoria": "noticias"`. De 350 a 750 palavras, duas seções ou mais.

- **O fato é dos últimos sete dias** e confirmado por ao menos duas fontes
  abertas nesta sessão, uma delas a origem (Banco Central, Caixa, IBGE,
  FipeZap, Secovi-SP, Abrainc, CBIC, Prefeitura de Campinas, Diário Oficial,
  Câmara/Senado, a própria pesquisa ou comunicado). Rumor e "segundo fontes"
  não são notícia para este blog.
- Assuntos: juros (Selic) e o crédito imobiliário, regras de financiamento
  (Caixa, SBPE, FGTS, Minha Casa Minha Vida quando afetar o mercado de
  Campinas), índices de preço de imóveis, lançamentos e vendas (pesquisas
  setoriais), mudanças em lei, imposto ou cartório que afetam quem compra ou
  vende, obras e planos da Prefeitura de Campinas que mudam bairros.
  Nada de política partidária, crime, fofoca de empresa ou bolsa.
- Estrutura: abre contando o fato em um parágrafo, com a data. Uma seção com o
  que foi anunciado — o que a fonte diz e nada além. Outra seção, obrigatória,
  com o título **"O que isso muda para você"** — para quem vai comprar, para
  quem vai vender, para quem pode esperar.
- Na notícia, valor em reais pode aparecer quando é o próprio fato (teto de
  financiamento, preço médio do metro quadrado num índice), sempre com fonte.
- Diga o que ainda não se sabe em vez de supor. Tom neutro.
- **Se não houver notícia que cumpra tudo isso, não publique.** Encerre com
  `NÃO PUBLICADO: sem notícia confirmada por duas fontes`.

### Dica (18h)

`"formato": "dica"`, em `alto-padrao`, `construcao`, `interiores`,
`bem-estar` ou `campinas`. De 450 a 950 palavras, duas seções ou mais.

- Uma pergunta só, daquelas que o curioso faz: "porcelanato ou madeira na
  sala?", "como deixar a casa mais silenciosa", "quanto de pé-direito faz
  diferença", "como escolher um sofá que dure". O título é a pergunta ou a
  resposta dela.
- Abre respondendo. Depois: "Em resumo", o passo a passo ou a comparação
  (lista, tabela ou prós e contras — ao menos um), e quando a dica não vale.
- 2 ou 3 perguntas frequentes.
- É a publicação que mais vai para as redes: capriche na legenda (`redes`).

## Como escolher o assunto

A fila está em `pauta.md`, separada por tipo. Pegue o primeiro assunto do seu
tipo ainda não publicado que não repita o tema dos últimos artigos.

Um bom assunto é **algo que a pessoa curiosa pesquisa ou salva no Instagram**:
uma ideia para a casa, uma dúvida antes de comprar, um jeito de viver melhor.
Quem chega por ele gosta de casa — e um dia vai comprar ou vender uma.

Não serve: assunto de locação (a RUAH só trabalha com venda), dica jurídica
ou tributária para um caso concreto (o texto explica a regra geral e manda
procurar advogado ou contador), "os X imóveis mais caros", listas de produtos
com preço, ranking de bairros por "melhor" ou "pior" (nenhum bairro é
rebaixado neste blog), e assunto já coberto (o comando recusa título repetido).

## Pesquisa e honestidade

1. **Fato só de página aberta nesta sessão.** Norma, lei, taxa, índice, data,
   nome de programa: tudo sai de uma página que você abriu agora, e ela vai em
   `fontes`. Sua memória serve para explicar como as coisas funcionam; não
   serve para número, data, norma nem regra vigente.
2. **Prefira a origem.** Lei no Planalto, norma na ABNT, regra no Banco
   Central ou na Caixa, dado no IBGE, pesquisa no próprio instituto, plano na
   Prefeitura. Depois, jornais e revistas conhecidas (de arquitetura, de
   economia). Fórum, blog de corretor e vídeo não são fonte.
3. **Nada de frase atribuída a alguém** entre aspas.
4. **A rotina não visitou nem testou nada.** Não escreva "visitamos",
   "testamos", "nossos clientes", "nossa equipe avaliou".
5. **Faixa e contexto, não número solto.**
6. **Texto próprio.** Nunca copie nem parafraseie de perto. Leia, entenda,
   feche a página e escreva.
7. **Nada de preço de imóvel, parcela, desconto ou promessa.** Nada de
   "valorização garantida", "investimento seguro", "não tem como perder". Fora
   da notícia, nada de valor em reais. A régua reprova.
8. **Lei e imposto:** explique a regra geral com a fonte e diga que cada caso
   pede um advogado, contador ou o cartório. Nunca "você não precisa pagar".
9. **Saúde e bem-estar:** fale de conforto, luz, silêncio, ventilação e verde
   com base em fonte séria; não prometa efeito em doença.

## A foto de capa

Todo artigo sai com uma foto de capa: uma fotografia simulada do assunto.
**Quem faz a foto é o PC da RUAH**, na placa de vídeo, de madrugada. Você
escreve o pedido; o `publicar --amanha` agenda o artigo e deixa o pedido numa
fila; o PC gera a foto, um modelo de visão confere (texto, marca, rosto,
deformação, cena errada) e a foto entra no artigo sozinha. Se a sua cena for
reprovada três vezes, o PC usa uma cena de reserva (uma sala clara e vazia ou
um detalhe de arquitetura). Não use ferramenta de imagem nenhuma e não baixe
foto de lugar nenhum. O blog avisa ao leitor que a capa é imagem ilustrativa.

```json
"capa": {
  "alt": "Sala de estar ampla com pé-direito duplo, sofá claro e grandes janelas para um jardim",
  "pedido": "A spacious modern living room with a double-height ceiling and floor-to-ceiling windows opening onto a lush tropical garden. A low light-gray linen sofa, a solid wood coffee table and a large wool rug. Warm afternoon sunlight, wide-angle architectural photography, eye level."
}
```

- `alt`: em português, 12 caracteres ou mais — o que a foto mostra.
- `pedido`: **em inglês**, de 60 a 900 caracteres. Uma cena só, concreta: o
  ambiente, os objetos, os materiais, o ângulo, a luz. De três a cinco frases.

**Como escrever um bom pedido:**

- Ambientes, fachadas, materiais e jardins saem muito bem: "architectural
  photography", "interior design photography", luz natural.
- **Sem pessoas.** Rosto reprova; mão sai deformada. Nem de costas.
- **Sem texto:** nada de placa "vende-se", número de casa, quadro com
  escrita, livro com título visível, tela de TV ligada (peça a TV desligada).
- **Sem marca nem peça de design famosa pelo nome.** Não escreva o nome de
  designer, de fábrica ou de modelo de móvel ("Eames", "Barcelona chair"):
  descreva o material e a forma ("a lounge chair in walnut and black leather").
- Nada que passe por foto de um imóvel real da RUAH, de condomínio conhecido
  de Campinas ou de um lugar identificável. Ambiente genérico e bonito.
- Construção: canteiro limpo, estrutura, materiais, plantas de arquitetura
  enroladas sobre uma mesa (sem texto legível), sem operários.
- Bem-estar: luz, plantas, água, madeira, tecidos; nada de remédio.

O "sem texto, sem logotipo, sem rosto" o PC acrescenta sozinho.

## O que se pode dizer da RUAH

Só o que está aqui:

- A RUAH Investimentos Imobiliários é uma imobiliária em Campinas (SP).
- Trabalha com a **venda** de imóveis (não faz locação).
- Atende quem quer comprar e quem quer vender.
- O atendimento é feito por pessoas da equipe.
- Está no Instagram como @ruahimobiliaria e tem site em ruahimobiliaria.com.br.

Não invente bairros atendidos, número de imóveis, anos de mercado, prêmio,
certificação, parceria, prazo de venda nem "garantia". Não fale de
concorrente nem de outra imobiliária.

A RUAH aparece **só no fim do artigo** (último parágrafo ou última seção) e
nas chamadas. Antes disso o texto ensina e inspira, sem vender.

## Links

Ao menos dois links para dentro do blog, no meio do texto, só destes:

| Endereço | O que é |
|---|---|
| `/blog` | A página inicial do blog |
| `/blog/categoria/alto-padrao` | Alto padrão |
| `/blog/categoria/construcao` | Construção e casas novas |
| `/blog/categoria/interiores` | Interiores e mobiliário |
| `/blog/categoria/bem-estar` | Bem-estar em casa |
| `/blog/categoria/campinas` | Campinas e região |
| `/blog/categoria/noticias` | Mercado imobiliário |
| `/blog/<endereço>` | Outro artigo do blog (precisa existir: veja a lista do `preparar`) |

Ligue para outros artigos sempre que o assunto encostar em um deles.

**O leitor não sai do site da RUAH.** Nenhum link para fora no texto: nada
de `https://` em parágrafo, lista, tabela ou destaque (a régua reprova). As
fontes vão só no campo `fontes`; o blog as mostra no fim, citadas pelo nome e
pelo site, sem link. No texto, cite a origem pelo nome ("segundo a CBIC").

## Formato do artigo

```json
{
  "slug": "como-avaliar-imovel-de-alto-padrao",
  "titulo": "Como avaliar um imóvel de alto padrão antes de comprar",
  "resumo": "De 110 a 165 caracteres, respondendo à busca.",
  "categoria": "alto-padrao",
  "etiquetas": ["compra", "alto padrão", "vistoria"],
  "capa": { "alt": "…", "pedido": "…" },
  "seo": { "titulo": "Só se o título passar de 60 caracteres" },
  "redes": {
    "legenda": "O texto do post no Instagram e no Facebook, de 80 a 600 caracteres, sem link. Termina convidando a ler o artigo completo no blog (link na bio).",
    "hashtags": ["altopadrao", "campinas", "arquitetura", "casanova"]
  },
  "blocos": [],
  "perguntas": [{ "pergunta": "…?", "resposta": "Duas ou três frases." }],
  "fontes": [{ "nome": "Nome da página — site", "url": "https://…", "data": "outubro de 2026" }]
}
```

- `slug`: minúsculas, números e hífens; as palavras da busca; até 75 caracteres.
- `categoria`: `alto-padrao`, `construcao`, `interiores`, `bem-estar`,
  `campinas` ou `noticias`.
- `formato`: `"dica"` **só na dica**.
- `publicadoEm` e `autor`: **não preencha** (a assinatura é "Equipe RUAH").
- `etiquetas`: de duas a seis, em minúsculas; repita as de artigos parecidos.
- `redes`: a legenda que leva o curioso ao blog. Abre com um gancho (uma
  pergunta, um dado curioso), entrega uma ideia útil, e convida a ler o resto
  no blog. Sem link (vai na bio), sem preço, sem promessa. Hashtags só com
  letras e números, sem `#`, de 4 a 10, misturando tema (arquitetura,
  decoracao, casanova…) e lugar (campinas).

### Os blocos

Texto aceita só `**negrito**`, `*itálico*` e `[texto](endereço)`. Nada de HTML.

| Bloco | Campos | Uso |
|---|---|---|
| `paragrafo` | `texto` | Uma ideia por parágrafo, de 40 a 65 palavras; nunca mais de 110 |
| `titulo` | `nivel` (2 ou 3), `texto` | Seção (2) e subseção (3) |
| `resumo` | `itens` | "Em resumo": 3 ou 4 pontos logo depois da abertura (menos na notícia) |
| `lista` | `itens`, `ordenada` | Passos (ordenada) ou itens |
| `tabela` | `titulo`, `colunas`, `linhas`, `colunaDestaque`, `fonte`, `nota` | Opções lado a lado; toda linha com o mesmo número de células |
| `pros-contras` | `titulo`, `pros`, `contras` | O que pesa a favor e contra |
| `destaque` | `tom` (`dica`, `atencao`, `nota`), `titulo`, `texto` | Um alerta ou dica fora do fluxo |
| `chamada` | `tema` | O convite para falar com a RUAH. Só o tema: o texto já está escrito |

Temas de chamada: `comprar` (procura imóvel: abre o contato do blog),
`vender` (vai vender: abre o contato do blog), `alto-padrao` (ver os imóveis
à venda na vitrine da RUAH), `visita` (escolher um imóvel na vitrine e pedir
a visita), `blog` (mais textos do blog) e `geral` (dúvida: abre o contato). Não existe chamada para
Instagram ou outra rede: o leitor não sai do site da RUAH. Escolha o que continua o
assunto do artigo; o comum é uma no meio e outra no fim.

## O que a régua cobra

- Principal: 1.200 palavras ou mais, 4 seções, "Em resumo", 2 entre tabela e
  prós e contras, 3 a 6 perguntas. Notícia: 350 a 750 palavras, 2 seções, a
  seção "O que isso muda para você". Dica: 450 a 950 palavras, 2 seções,
  "Em resumo", uma lista/tabela/prós e contras, 2 ou 3 perguntas.
- Título de 30 a 80 caracteres, com a palavra da busca no começo. Resumo de
  110 a 165.
- Abre com parágrafo (antes de qualquer título) que já responde à busca.
- 1 a 3 chamadas, nenhuma no primeiro quarto, nunca duas seguidas.
- Ao menos 2 links para dentro do blog, da lista acima, e nenhum link para fora.
- Ao menos 2 fontes. Campo `redes` com legenda (80 a 600) e 4 a 10 hashtags.
- Sem parcela, desconto, promessa de ganho; sem reais fora da notícia; sem
  "testamos"/"visitamos".
- Foto de capa descrita (`alt` e `pedido`), sem pessoas no pedido.

## Como o texto soa

- Segunda pessoa ("você"), elegante e acolhedor, frases diretas. Sem gíria e
  sem entusiasmo de anúncio: nada de "incrível", "imperdível", "dos sonhos",
  "sem dúvida".
- Inspira e ensina ao mesmo tempo: a pessoa termina o texto com uma ideia
  clara do que fazer na casa dela ou do que olhar antes de comprar.
- Explique o termo técnico na primeira vez (pé-direito, laje, NBR, ITBI).
- Não prometa: "costuma", "normalmente", "depende de".
- Abertura em dois parágrafos: o primeiro descreve a situação ou o desejo do
  leitor com a palavra da busca; o segundo adianta a resposta.
- Títulos de seção dizem o que o leitor decide ali, não "Introdução".
- Quase toda seção tem um "mas": quando a ideia não vale.
- Em obra e reforma: diga o que exige engenheiro ou arquiteto responsável
  (ART/RRT) e **onde parar** — nunca oriente mexer em estrutura, gás ou
  elétrica por conta própria.
- Última frase: a decisão em uma linha.
- Português do Brasil. Unidades com espaço: 3 m, 120 m², 25 °C.
