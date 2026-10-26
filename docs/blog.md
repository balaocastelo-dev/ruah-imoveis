# Blog "Sopro" — publicação automática

O blog público da RUAH fica em `/blog` do Sistema RUAH (no PC: http://localhost:3333/blog).
Publica sozinho **três vezes por dia**, sempre com foto de capa, sem ninguém revisar antes.
Recriado em 26/10/2026 a partir do blog da Balão (`balaocastelo-dev/balao2026`, guia
`BLOG-AUTONOMO-COMO-RECRIAR.md`).

Objetivo: trazer o curioso das redes (Instagram, Facebook) e do Google para o blog — assuntos de
alto padrão, construção e casas novas, interiores e mobiliário de luxo, bem-estar em casa,
Campinas e mercado imobiliário. Todo texto leva uma legenda pronta para as redes.

## As peças

| Peça | Onde | O que faz |
|---|---|---|
| Páginas do blog | `src/routes/blog.js`, `src/blog/paginas.js`, `public/blog-assets/` | `/blog`, `/blog/<artigo>`, `/blog/categoria/<c>`, `/blog/rss.xml`, `/sitemap.xml`, `/robots.txt`. HTML montado no servidor, JSON-LD, Open Graph. Sem login. |
| Leitura do conteúdo | `src/blog/diario.js` | Lê o ramo `claude/blog-conteudo` pelo raw.githubusercontent.com a cada 10 min; guarda a última cópia em `data/blog-cache`. Só mostra artigo **com foto** e **com a hora já chegada**. |
| Formato e régua | `src/blog/validar.js`, `src/blog/regua.js` | O mesmo código confere no comando de publicar e de novo antes de mostrar. |
| Categorias e chamadas | `src/blog/categorias.js` | As 6 categorias e o texto dos convites (WhatsApp, site, Instagram). A rotina só escolhe o tema. |
| Comando de publicar | `scripts/blog-publicar.mjs` | Única porta de entrada: `preparar`, `conferir`, `publicar [--amanha]`, `capa`, `pendentes`, `retirar`. |
| Ramo de conteúdo | `claude/blog-conteudo` | `indice.json`, `artigos/`, `capas/`, `capas/pendentes.json`, `ROTINA.md` (as regras da rotina) e `pauta.md`. |
| Foto de capa | `scripts/capa_blog_ruah.py` | Usa o gerador do Balão (`balao-content-factory\publisher\capa_blog.py`): Flux no ComfyUI da RTX 4090 + conferência do Ollama. Tarefa do Windows `\RUAH\Capa do blog RUAH`, às 22h40 e 4h40. |
| Rotina na nuvem | 3 tarefas agendadas do Claude | 20h14 artigo, 20h34 notícia, 20h54 dica. Escrevem, conferem e agendam para 6h / 12h / 18h do dia seguinte. |
| Tela no sistema | menu Conteúdo › Blog Sopro | O que está no ar, agendado ou esperando foto, e "Copiar legenda". |

## O leitor não sai do site da RUAH (decisão do Thiago, 26/10/2026)

Nenhuma página do blog tem link para fora. Link para fora no texto aparece como texto comum,
as fontes são citadas pelo nome e pelo site sem link, não há chamada nem rodapé de Instagram e o
compartilhar só copia o link. Os convites levam à vitrine do portal (/imoveis), a mais textos do
blog ou ao formulário "Fale com a RUAH", que fica no fim de toda página do blog e vira lead no CRM
(origem "Blog RUAH", com o motivo: comprar, vender ou dúvida). Não há link para
ruahimobiliaria.com.br nem para o WhatsApp. A régua reprova texto novo com link para fora, e o
teste `node test/blog.js` confere que nenhuma página tem link para fora.

## Configuração (.env)

```
BLOG_DIARIO=true            # false tira todos os textos do ar sem apagar nada
BLOG_URL=                   # endereço público (domínio ou túnel). Vazio = o de quem acessa
BLOG_NOME=Sopro
BLOG_LEGENDA=Casa, arquitetura e bem-estar, pela RUAH
BLOG_CRECI=                 # aparece no rodapé
```

## Para o blog trazer gente da internet

Hoje o sistema só abre no PC e na rede do escritório. Para o Google e as redes chegarem ao blog,
ele precisa de um endereço público: túnel Cloudflare com domínio da RUAH (ex.: blog.ruahimobiliaria.com.br
apontando para o PC) e `BLOG_URL` preenchido. O `robots.txt` deixa só `/blog` aberto à busca.

## Parar, pausar, tirar do ar

- Pausar: desligar as três tarefas agendadas (os textos publicados continuam).
- Tirar um texto: `node scripts/blog-publicar.mjs retirar <endereço>` (sai em até 10 min).
- Tirar todos: `BLOG_DIARIO=false` no .env e reiniciar o sistema.
- Desligar as fotos: `Disable-ScheduledTask -TaskPath '\RUAH\' -TaskName 'Capa do blog RUAH'` (sem foto, nada novo aparece).

## Teste

`node test/blog.js` — sobe um ramo falso e confere páginas, régua, "sem foto não aparece", agendado, RSS, sitemap e robots.
