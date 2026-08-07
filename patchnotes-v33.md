# v33 — Tempo geológico, trilha gradual e salvamento automático

Quatro relatos, quatro correções. Dois eram bugs de modelo no motor — o
sintoma que você viu não era o que estava quebrado —, e dois eram
funcionalidades que faltavam.

---

## 1. "Tudo está acontecendo muito rápido, na primeira dezena de milhão"

**Diagnóstico.** Confirmado e medido. Um ciclo de deriva custava
`anos_de_geração × 1000`. Para uma bactéria de maturação 0 (0,01 ano por
geração) isso dá **10 anos por ciclo**. Uma linhagem inteira, de bactéria
primordial até mamífero-alvo, fechava em **1,85 AU** — 1,85 milhão de anos.
Todo o seu mundo cabia na primeira dezena de milhão de anos, exatamente
como relatado.

O erro não era aritmético, era de modelo. A fórmula tratava velocidade
evolutiva como proporcional à velocidade reprodutiva, e a biologia real não
funciona assim: procariontes se dividem em minutos e mesmo assim levaram
cerca de 3 bilhões de anos para produzir eucariontes complexos. Tempo de
geração acelera a **adaptação fina**; mudança morfológica profunda depende
de oportunidade ecológica, que é contada em escala geológica.

**O que mudou.** Três peças:

- **Compressão sublinear.** A duração do ciclo passou a ser a *raiz
  quadrada* do tempo de geração, não o produto. Linear produzia os dois
  extremos errados ao mesmo tempo: bactéria evoluindo em décadas e sequoia
  (3000 anos por geração) gastando bilhões de anos por ciclo, mais que a
  idade do Sol. A raiz achata os dois extremos e preserva a ordem entre
  eles.
- **Piso por reino.** É a peça que mais pesa no resultado: bactéria custa no
  mínimo **12 AU por ciclo** mesmo se dividindo a cada minuto. Fungo e
  planta, 3–4 AU. Animal, 0,5 AU. É isso que reproduz a longa estase
  procariótica em vez de fazer a bactéria correr.
- **Teto de 40 AU por ciclo**, para que uma espécie de maturação 9 não
  estoure sozinha a idade do mundo.

A calibração persegue as referências da Terra: vida por volta de 3.800 AU
atrás, eucarionte 2.100, animais 600, mamíferos modernos 66.

**Medido:** a mesma trilha que fechava em 1,85 AU agora se estende por
**1.024 AU** — cerca de um bilhão de anos.

**Escala ajustável.** Se o ritmo padrão ainda não for o que você quer, o
painel de Configurações traz três opções: comprimida (¼×), padrão (1×) e
dilatada (4×). Vale para o que for gerado daqui em diante; espécies já
datadas mantêm o AU delas. A escolha é gravada e sobrevive ao fechamento do
app — e não é apagada por um reset, porque é preferência sua, não conteúdo
do mundo.

O ciclo de seleção natural acompanha a escala em vez de ser um número fixo
(era 0,1 AU cravado no código).

---

## 2. A trilha pulando de bactéria simples para mamífero mega desenvolvido

**Diagnóstico.** Bug real, e o mais grave desta leva. A busca por DNA-alvo
tem duas fases: deriva estocástica, depois convergência dirigida. A fase
dirigida convergia **todos os genes divergentes de uma vez**. Medido numa
trilha bactéria → mamífero: 82 blocos de deriva seguidos de **um único
bloco dirigido com 17 genes**.

Como `materializarTrilha` corta uma espécie nova por bloco, esse bloco
único virava um nó único. E como `reino` e `classe` são os dois genes mais
pesados — logo os dois primeiros da fila —, eles caíam na mesma rodada e a
normalização reconstruía o corpo inteiro de uma vez. Era literalmente a
bactéria virando o mamífero num nó só.

**O que mudou.** A fase dirigida virou gradual:

- no máximo **2 genes categóricos por rodada**;
- no máximo **um gene de Estrato I por rodada** — é a trava que separa
  `reino` de `classe` e força a linhagem a atravessar o reino primeiro, com
  morfologia intermediária, antes de convergir a classe;
- genes **escalares** (visão, olfato, agressividade, blindagem,
  longevidade — os 19 campos numéricos de verdade) andam **um ponto por
  rodada** em direção ao alvo, em vez de saltarem de 1 para 8. Genes
  categóricos continuam sendo fixados de uma vez: não existe meio caminho
  entre escama e pelo. Mas espalhados por rodadas diferentes.
- **Teto de 10 ciclos sem corte** ao materializar, para que uma sequência
  longa de mudanças de Estrato III (que não dispara especiação) não
  desague num nó só.

**A exatidão está preservada por construção.** Se o caminho gradual esgotar
as rodadas com o alvo ainda não alcançado, uma fase de acabamento em bloco
— exatamente o comportamento antigo — fecha a diferença. O gradualismo só
pode adiar a chegada, nunca impedi-la. A bateria confirma: 100% dos alvos
continuam batendo com DL 0.

**Medido, na mesma trilha:**

| | v32 | v33 |
|---|---|---|
| nós materializados | 8 | 19 |
| blocos dirigidos | 1 | 17 |
| maior bloco dirigido | 17 genes | 2 genes |
| caminho | `Ba/MIC → An/AMP → An/MAM` | `Ba/MIC` (3 nós) → `An/REP` (8 nós) → `An/MAM` (8 nós) |
| duração | 1,85 AU | 1.024 AU |

**Limitação assumida.** A passagem de reino (`Ba → An`) continua sendo um
salto de um nó, porque reino é um gene só no DRN2 — não há estado
intermediário entre bactéria e animal para o sistema representar. O que a
correção garante é que tudo o que vem *depois* do reino seja gradual.

---

## 3. Perder a árvore ao sair do app para gerar imagens

**Diagnóstico.** Não é falta de memória do aparelho: é o Android/iOS
descartando a aba em segundo plano quando outro app pede RAM. É
comportamento normal do sistema e nenhum ajuste de código impede o descarte.
O que dá para fazer é o estado **sobreviver** a ele — por isso a solução é
gravação em disco, não "cache".

**Onde grava.** IndexedDB, com localStorage apenas como reserva. A escolha
importa justamente pelo seu caso: localStorage é síncrono e tem cota de
~5 MB por origem, e um ecossistema grande passa disso com folga. Daria erro
de cota exatamente na hora errada — no instante em que você sai do app. O
IndexedDB é assíncrono e a cota é uma fração do disco livre. A reserva em
localStorage cobre navegador em modo anônimo, onde o IndexedDB às vezes não
abre.

**Quando grava.** Três gatilhos, e o terceiro é o que resolve o problema:

1. debounce de 1,2 s depois de qualquer mudança de estado;
2. `visibilitychange` para *hidden* — dispara no instante em que o app vai
   para segundo plano, que é o momento de sair para gerar a imagem;
3. `pagehide` — última chance antes de a aba ser descarregada.

Os dois últimos gravam na hora, sem debounce: se esperassem 1,2 s o sistema
já teria congelado a aba.

Ao voltar, o mundo é restaurado sozinho, com um aviso de quantas espécies
vieram de volta. O formato gravado é **o mesmo do export manual**, então um
projeto exportado e um auto-salvo são intercambiáveis.

**Isto não substitui o export.** É local a este navegador e some se você
limpar os dados do site. Para levar o mundo a outro aparelho, continue
usando exportar/importar `.json`.

---

## 4. Botão de resetar tudo

Engrenagem nova no cabeçalho abre o painel de **Configurações**, que reúne:

- **Estado do salvamento** — hora do último, tamanho, quantas espécies e
  indivíduos existem, botão "Salvar agora" e "Apagar cópia salva" (que
  limpa o disco sem tocar no mundo aberto).
- **Escala de tempo evolutivo** — as três opções do item 1.
- **Zona de perigo** — "Resetar tudo e recomeçar do zero", com confirmação
  em dois passos e um lembrete de exportar antes.

O reset zera geografia, eras, espécies, indivíduos, o log inteiro, os
contadores de id, os domínios climáticos customizados e a cópia salva no
navegador. O app volta à Fase 1.

A ordem da operação importa e está documentada no código: primeiro trava a
gravação automática (senão o debounce do estado ainda cheio regravaria logo
depois de apagar o disco), depois apaga o disco, depois o motor, depois o
React, e só então destrava.

Do lado do motor, existe agora um `resetarMotor()` único que zera todo o
estado mutável — log, contadores de id, domínios customizados. Estava
espalhado por quatro pontos do arquivo; centralizado, o próximo estado
mutável que alguém adicionar tem um lugar óbvio para ser lembrado no reset.

---

## Bateria de testes

**140 checagens, 0 falhas**, rodada 3 vezes seguidas. Duas suítes novas:

- **X · Tempo geológico e trilha gradual** (12 checagens) — piso por reino,
  teto, compressão sublinear, multiplicador de escala, recusa de escala
  inválida, e as quatro medições de granularidade da trilha: nenhum bloco
  gradual com mais de um gene de Estrato I, a fase dirigida espalhada por
  vários blocos, densidade mínima de nós por linhagem, e o alvo continuando
  a bater 100%.
- **Y · Round-trip do projeto salvo** (10 checagens) — o que o
  auto-salvamento grava tem que voltar igual. Cobre os dois pontos onde o
  JSON perde informação e que já morderam antes: `acumEstratoII` precisa
  voltar como `Set` (senão `checarEspeciacao` quebra no primeiro ciclo
  depois de restaurar) e as seeds de indivíduo precisam voltar como
  `BigInt`. Mais a verificação de que `resetarMotor` zera de fato o log e os
  domínios customizados.

O IndexedDB em si não é testável fora do navegador; o painel de testes
embutido (ícone de frasco) cobre isso quando roda no aparelho.

---

## Arquivos

Um arquivo novo, `13-persistencia.js`, carregado **antes** de `10-app.js` —
o `App()` chama `useAutoSalvamento` e `PainelConfiguracoes` já na primeira
renderização, e a renderização é disparada no fim de `10-app.js`.

`sw.js` foi para `drn2-v33` e ganhou o arquivo novo no pré-cache. De quebra,
`patchnotes-v32.md` entrou na lista — tinha ficado de fora na entrega
anterior, o que fazia o service worker não ter os patchnotes da v32
disponíveis offline.
