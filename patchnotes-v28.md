# v28 — Escala corporal por reino, coerência de parâmetros e versão instalável offline (PWA)

Dois pedidos: corrigir o peso e as proporções irreais (bactéria em primeiro lugar, mas verificando todos os
reinos) e transformar o app numa PWA instalável, que funcione offline mesmo hospedado no GitHub Pages.

Bateria: **103 checagens, 0 falhas** (eram 74 na v27). Quatro suítes novas — escala por reino, coerência de
parâmetros, formatação de unidades e PWA. A bateria também passou a rodar **dentro do app**.

---

## Parte 1 — Escala corporal

### O tamanho do problema

Uma única tabela de altura por porte e uma única tabela de densidade eram aplicadas igualmente a animal,
planta, fungo e bactéria. Medido na v27, em 20.000 espécies:

| | v27 | referência real |
|---|---|---|
| Bactéria, mediana | **175 kg** | ~1 picograma |
| Bactéria, máximo | **31.894 t · 45 m de altura** | 0,75 mm (a maior conhecida) |
| Animal, máximo | **44.651 t** | baleia-azul: 190 t |
| Densidade, topo | **7.000 kg/m³** | ferro |
| Densidade, piso | **50 kg/m³** | mais leve que cortiça |

O erro de fundo não era um número mal calibrado: era tratar uma bactéria como "um bicho pequeno". Ela não é
— é outra ordem de grandeza inteira, e medir as duas coisas com a mesma régua produz absurdo por construção.

### Régua por reino

Cada reino ganhou sua própria escala de altura, ancorada em referências reais com folga para o exagero de
fantasia no topo:

- **Animal** — 2 cm (inseto) · 25 cm (rato) · 1,7 m (humano) · 4,5 m (elefante) · 10 m (sauropode) · 24 m
- **Planta** — 2 cm (musgo) · 40 cm (herbácea) · 3 m (arbusto) · 20 m (árvore) · 90 m (sequoia, o limite
  hidráulico real) · 150 m
- **Fungo** — 2 mm (bolor) · 6 cm (cogumelo) · 30 cm (políporo) · 1,5 m · 4 m
- **Bactéria** — 0,2 µm (*Mycoplasma*, a menor conhecida) · 5 µm (bacilo típico). Os degraus acima existem na
  tabela, mas o motor trava a bactéria nos dois menores.

**Densidade** passou de 50–7.000 para **160–2.200 kg/m³**: de madeira balsa a concha mineralizada, passando
pelo valor da água e da carne. Nada vivo existe fora dessa faixa, e o motor ainda restringe a sub-faixa por
reino.

**Fator de forma** recalibrado, porque o erro compunha com o cubo da altura:

- Plantas e fungos não têm "torso". O fator genérico tratava uma árvore de 20 m como um bloco maciço de
  400 m³, contra os ~20 m³ de um carvalho adulto. Agora a fração é por forma de crescimento (arbórea,
  arbustiva, colunar, tapete, trepadeira, rosácea), com **teto geométrico por altura**: acima de 10 m,
  qualquer coisa que se sustente é tronco mais copa vazada, independente do gene — senão uma "rosácea" de
  90 m daria 30.909 t, dez vezes a árvore mais pesada já medida.
- O lado **animal** também estava alto demais: com o fator antigo, um humano de 1,7 m saía com 246 kg. A
  fração do cubo da altura que um corpo animal ocupa é da ordem de 1,5%, não 5% — conferido contra humano
  (1,7 m / ~80 kg), elefante (4,5 m / ~6 t) e sauropode (10 m / ~30 t). As proporções relativas entre as
  silhuetas foram mantidas.
- O **piso de 1 grama** (`Math.max(0.001, …)`) era o que impedia qualquer coisa microscópica de existir, por
  mais correta que a escala ficasse. Removido.

### Resultado medido

| reino | massa (mín · mediana · máx) | altura |
|---|---|---|
| Bactéria | 0,0024 pg · 37,5 pg · 39,75 pg | 200 nm – 5 µm |
| Fungo | 14,4 µg · 97,2 g · 614,4 kg | 2 mm – 4 m |
| Planta | 3,6 mg · 40,5 kg · 4.636 t | 2 cm – 90 m |
| Animal | 7,7 mg · 31,2 kg · 790 t | 2 cm – 24 m |

### Unidades

A exibição só sabia dizer "kg" e "toneladas", o que com a régua nova mostraria `0,0000000000375 kg`. Massa
agora vai de **picograma a tonelada** e comprimento de **nanômetro a metro**, escolhendo a unidade pela
ordem de grandeza.

---

## Parte 2 — Coerência de parâmetros em todos os reinos

Auditando o resto dos genes, o mesmo padrão apareceu: travas de reino existiam para as estruturas óbvias
(crânio, membros, olhos) mas não para os genes de comportamento e fisiologia. Cinco correções:

- **Reprodução.** 54% das *plantas* saíam **ovíparas** e 13% por gemação-de-animal — uma árvore botando ovo.
  Ovíparo, vivíparo e ovovivíparo descrevem exclusivamente o reino animal. Planta, fungo e bactéria agora se
  reproduzem por esporo, gemação, fissão ou assexuadamente.
- **Sentidos.** Planta, fungo e bactéria vinham com audição e olfato sorteados de 0 a 9 igual a um mamífero
  — saía planta com audição 7 e bactéria com olfato 6. Nenhum dos três tem órgão auditivo, então audição vai
  a zero. Quimiorrecepção e mecanorrecepção, essas sim, existem nos três (uma raiz sente nutriente, uma
  bactéria faz quimiotaxia, um micélio segue gradiente químico) — sobrevivem numa faixa baixa em vez de
  virarem zero, o que seria igualmente errado.
- **Simetria.** Bilateral saía em 78% de *tudo*. Um cocobacilo bilateral e uma árvore bilateral são leituras
  erradas do próprio conceito: bactéria é radial ou amorfa, planta e fungo crescem em torno de um eixo.
  Bilateral ficou com o reino animal, que é onde ela descreve alguma coisa.
- **Estrutura social.** Saía bactéria em "matilha" e planta em "par vitalício" — categorias que descrevem
  coordenação comportamental entre indivíduos móveis. O que os três formam é indivíduo isolado ou colônia
  (biofilme, micélio, bosque clonal); enxame cabe na bactéria, que se move em massa.
- **Defesa e locomoção.** Bactéria saía com "luta", "fuga" e "defesa em grupo", e uma bactéria natante ganhava
  velocidade até 9 — o mesmo escalar de um guepardo. Uma célula esporula, produz toxina ou se esconde
  quimicamente; e nada nessa escala, a nado, faz mais que deslizar.

Todas as travas saem da **mesma tabela que a deriva consulta**. Sem isso, a deriva reintroduziria cada
problema no primeiro ciclo — e a bateria confirma: as travas por reino sobrevivem a 30 ciclos de deriva.

---

## Parte 3 — PWA instalável e offline

O app agora instala na tela inicial e funciona sem internet.

**Manifesto** (`manifest.webmanifest`) com nome, ícones de 192 e 512, ícone *maskable* (senão o Android
recorta o ícone num círculo), tema escuro e `display: standalone`. `start_url` e `scope` são **relativos**,
porque no GitHub Pages o app vive em `usuario.github.io/repositorio/` e não pode reivindicar a raiz do
domínio.

**Service worker** (`sw.js`) com duas estratégias:

- **Casca do app** (index, os 11 scripts, patchnotes, manifesto, ícones) — rede primeiro, cache como rede de
  segurança. Uma versão nova publicada aparece na próxima abertura com internet, e o app abre sem internet
  nenhuma.
- **Bibliotecas de CDN** (React, ReactDOM, Babel, Tailwind, marked) — cache primeiro, para sempre. São
  arquivos versionados e imutáveis. É também o que torna o offline **real**: sem eles em cache o app não
  renderiza nada, por mais que os `.js` locais estejam guardados.

Os `.md` dos patchnotes entram na lista explicitamente. O fetch deles é rede-primeiro, então só ficariam
guardados depois de o usuário abrir o painel de versões com internet — quem instalasse e ficasse offline
abriria um painel vazio.

**Na interface:** uma barra oferece "Instalar" quando o navegador sinaliza que é possível, e "Atualizar
agora" quando há versão nova esperando. O registro é silencioso quando dá certo e silencioso quando falha
(navegador antigo, http sem TLS, modo anônimo) — o app segue funcionando, só não fica offline. Service
worker é melhoria, nunca requisito.

**Limitação honesta, que a UI informa:** a primeira abertura precisa de internet, para baixar as bibliotecas
de CDN. Depois disso o app roda offline indefinidamente.

Não vendorizei React/Babel/Tailwind para dentro do repositório — seriam vários MB no repo e o Babel
Standalone sozinho passa de 3 MB, o que atrapalharia o upload pelo celular, que é como você publica. O cache
do worker resolve o mesmo problema sem esse custo.

---

## Parte 4 — A bateria de testes agora roda dentro do app

A carteira existia só fora, num runner Node. Isso deixava um buraco: os números eram medidos numa máquina
que não é a que você usa, e performance no celular é 5 a 10× diferente.

O ícone de frasco no cabeçalho abre a bateria, que roda contra o motor de fato carregado na página. Mesmo
conteúdo do runner externo, com três adaptações: cada suíte cede o controle periodicamente (senão a aba
trava por um minuto sem pintar nada), as suítes estão em ordem crescente de custo e o painel deixa escolher
até onde ir, e os limiares de **performance viraram medições informativas** em vez de aprovação/reprovação —
um limite calibrado em desktop reprovaria qualquer celular sem que nada estivesse errado.

O runner externo continua existindo e ganhou as mesmas suítes novas, incluindo uma que valida o pacote PWA:
manifesto bem formado, ícones declarados que existem de fato, caminhos relativos, e **todo arquivo listado
no cache do worker existindo no pacote** — foi essa checagem que pegou um `.md` faltando nesta própria
entrega.
