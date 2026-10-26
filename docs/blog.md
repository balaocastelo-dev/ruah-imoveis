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
| Rotina na nuvem | 3 tarefas agendadas do Claude | 19h06 artigo, 19h26 notícia, 19h46 dica. Escrevem, conferem e agendam para 6h / 12h / 18h do dia seguinte. |
| Tela no sistema | menu Conteúdo › Blog Sopro | O que está no ar, agendado ou esperando foto, e "Copiar legenda". |

## Configuração (.env)

```
BLOG_DIARIO=true            # false tira todos os textos do ar sem apagar nada
BLOG_URL=                   # endereço público (domínio ou túnel). Vazio = o de quem acessa
BLOG_NOME=Sopro
BLOG_LEGENDA=Casa, arquitetura e bem-estar, pela RUAH
BLOG_CRECI=                 # aparece no rodapé
WHATSAPP_RUAH=              # as chamadas abrem o WhatsApp com mensagem pronta; vazio = site da RUAH
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
