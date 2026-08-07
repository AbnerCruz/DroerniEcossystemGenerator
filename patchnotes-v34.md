# v34 — Asas coerentes, ID de linhagem, mobile e performance

Seis frentes. Em duas delas o diagnóstico veio diferente do sintoma: o que
estava quebrado não era o que parecia estar.

---

## 1. O réptil voador "sem membros superiores, com duas asas"

**Diagnóstico: o genoma estava certo, a redação é que mentia.**

`0S / 2I` com duas asas é exatamente o plano do pterossauro e do wyvern. O
par superior não desapareceu — ele *virou* a asa. Só que a prosa somava
apenas superiores e inferiores no total de membros e anunciava as asas
numa frase separada, páginas depois, sem dizer de onde vinham. Lido em
sequência, virava um bicho de duas pernas com asas penduradas em lugar
nenhum.

Agora a asa entra na conta e a procedência é declarada:

> Tem 4 membros locomotores ao todo — 2 inferiores e o par superior
> inteiramente convertido em 2 asas, sem braço livre.

A ambiguidade só existe em réptil (única classe de asa independente desde a
v31), e o desempate é o número de pernas: até 2, a asa é o braço
modificado (wyvern, 4 membros); com 4, é um par próprio (dragão ocidental,
6 membros).

**Três bugs reais apareceram ao testar isso, e foram junto:**

- **Réptil com oito membros.** `2S` + `4I` + asa passava batido: a trava de
  orçamento de membros da v29 não cobria a classe de asa independente. Era
  o mesmo defeito que a v29 corrigiu, voltando por outra porta. Réptil
  alado agora exige par superior livre, o que é verdade nos dois planos.
- **Voador sem asa nenhuma — 19% dos répteis voadores.** A trava de asa
  exigia par superior livre, mas voo primário nunca zerava os braços em
  réptil: o bicho ganhava braços e perdia as asas. Voo ou planeio primário
  agora zera o par superior sem mexer nas pernas, que é o que mantém wyvern
  e dragão vivos.
- **Asa que não sustenta voo — 23% dos voadores.** O teto de
  funcionalidade por densidade valia inclusive para quem voa como modo
  principal. Para o voador primário o piso vence o teto: a incoerência ali
  não é a asa forte, é a densidade alta.
- **Inseto com 6 patas e 8 asas.** Artrópode era a única classe sem teto de
  asas. Agora, dois pares — o limite do que a anatomia de inseto comporta,
  e ainda a classe mais alada do sistema.

Voar sem asa continua possível, mas só por magia (nível 4+), e agora a
prosa diz isso: *"a sustentação no ar é arcana, não anatômica"*.

---

## 2. Performance — três gargalos, zero mudança de comportamento

Medido antes de mexer, e o resultado não estava onde eu esperava.

- **`BigInt` construído à toa.** `categoricalStep`, `scalarStep` e
  `rawStep` construíam um `BigInt` em toda chamada, inclusive nos modos que
  nunca o usam (sorteio e codificação). Construir `BigInt` é caro e o valor
  era descartado. Movido para dentro do ramo que consome.
  `normalizarGenoma` −35%, ciclo de deriva −30%.
- **`calcularDL` — a função mais chamada do sistema.** A busca de trilha a
  invoca uma vez por tentativa, e o guard permite 4.000 tentativas.
  Ela alocava 59 pares novos por chamada (`Object.entries` numa tabela
  estática) e convertia os dois lados para texto mesmo quando já eram
  idênticos. Virou dois arrays montados uma vez, com comparação estrita
  como caminho rápido: **2.527 ms → 109 ms** em 50 mil chamadas, 23× mais
  rápido. Verificado gene a gene contra a implementação antiga: 0
  divergências em 4.000 comparações.
- **A árvore genealógica sendo repintada inteira.** `NodeArvore` é
  recursivo e não tinha memo: qualquer re-render do App repintava todos os
  nós — e o App re-renderiza por muito mais coisa que evolução (um toast
  aparecendo e sumindo já dava dois). Agora tem `React.memo`, e todas as
  props já eram estáveis. Junto: `seedParaGenoma` (0,65 ms, chamada por
  card) ganhou memo, e a contagem por linhagem deixou de varrer a lista
  inteira uma vez por primordial.

Nada disso altera um resultado. As otimizações são todas de trabalho
repetido ou descartado.

---

## 3. Mobile

- **Cabeçalho.** Seis botões de ícone não cabem numa tela de celular —
  espremiam o título. Sobraram busca e configurações; testes, patchnotes,
  importar e exportar mudaram para dentro do painel de configurações, com
  rótulo de texto (ícone sem rótulo é ilegível fora de uma barra de
  ferramentas). Em telas largas os quatro continuam à mão.
- **Recuo da árvore saía da tela** *(relatado na v34)*. O recuo era
  `profundidade × 14`, linear e sem teto: uma linhagem de 20 níveis — que a
  trilha gradual da v33 passou a produzir com facilidade — empurrava o nó
  280px para dentro. Em celular isso estoura por volta do 12º nível.
  Diminuir o passo deixa a árvore ilegível e rolagem horizontal some com o
  contexto; então o recuo passa a **saturar**: cresce normal até o 8º
  nível, onde de fato comunica hierarquia, e depois cresce 3px por nível
  até parar em 96px. A margem das bordas aninhadas, que empilhava mais 2px
  por nível, para junto.
- Três modais que ainda centralizavam viraram folha inferior rolável, e as
  grades de três colunas caem para duas no estreito.

---

## 4. Montador manual de DNA

O pedido veio com a solução certa embutida: *"o motor de gerar primordial
só permite bactéria — está excelente! Mas essa construção é necessária,
então podemos colocar ela no motor de busca por seeds."*

Foi exatamente isso. **O motor de primordial não mudou uma linha** — toda
forma primordial continua sendo bactéria, e isso é decisão de mundo: o
humanoide tem que ser alcançado por especiação, não decretado na raiz.
Afrouxar ali destruiria a única regra que faz a árvore genealógica
significar alguma coisa.

O montador não cria espécie nenhuma. Ele produz um genoma arbitrário — sem
trava de primordial, sob as mesmas travas de coerência de qualquer espécie
derivada — e entrega esse genoma à busca no formato exato de um DNA colado.
Dali em diante o caminho que já existia assume: **Reconstruir linhagem**
acha a trilha de deriva desde uma bactéria, e **Gerar linhagem no mundo**
materializa tudo na árvore, com o humano na ponta e a bactéria na raiz.

Em uma frase: a busca ganhou um teclado.

Presets de partida (humanoide, quadrúpede, réptil alado, aquático, planta)
são só atalhos — todo gene continua editável, e o preset humanoide fixa a
tolerância hídrica porque sem isso 15% dos sorteios caíam em "aquático
obrigatório" e a trava de coerência trocava o bipedalismo por natação,
entregando um humanoide que nadava.

---

## 5. O clado deu lugar ao ID de linhagem

Pedido: *"que todo o sistema de clado fosse removido e substituído por um
sistema de id que descreva exatamente a linhagem. Por exemplo 1121
(primordial 1, filho 1, neto 2, bisneto 1)"*.

Feito, e o clado saiu **inteiro** — do genoma, da seed e do código DRN2.
Ele nunca foi um gene: o próprio sistema já o ignorava em toda comparação
genômica (`semClado` nos testes, `codigoIdentico` na busca de trilha,
`GENES_SEMPRE_DERIVADOS` na checagem de fidelidade da seed). Eram três
dígitos de endereço combinatório gastos com um nome próprio aleatório.

O id novo é a lista de posições do nó em cada nível, atribuída no
nascimento e nunca sorteada: o segmento novo é a posição do filho entre os
irmãos no momento em que ele é pendurado. Guardamos os **segmentos**, não a
string — `1121` deixa de ser legível assim que um nível passa de nove
irmãos (1-12-1 e 11-2-1 dariam ambos "1121"). O formato é compacto enquanto
todos os segmentos couberem num dígito e passa a separado por ponto no
instante em que um deles não couber. O caso comum sai exatamente como
pedido; o extenso continua não-ambíguo.

O id **não** vive no genoma nem na seed, e isso é deliberado: ele é
propriedade da árvore, não do organismo. Dois espécimes de genoma idêntico
em galhos diferentes têm ids diferentes, e é assim que deve ser.

Reparentar uma linhagem (o que acontece ao materializar uma trilha para
trás) muda o endereço da subárvore inteira — o que era o primordial 3 vira,
digamos, o neto 112. Como o id existe justamente para descrever a linhagem,
deixá-lo desatualizado seria pior que não tê-lo, então a árvore inteira é
recalculada.

**O que isso custa, dito claramente:**

- **Códigos DRN2 antigos continuam válidos.** O `TAX` passou de três campos
  para dois, e o parser aceita e descarta o terceiro. Nada do que você
  anotou se perde.
- **Projetos `.json` salvos em v33 ou antes são migrados no import**: os
  endereços são reconstruídos a partir da topologia salva, que é a única
  fonte verdadeira deles.
- **Seeds anotadas em v33 ou antes decodificam para outra espécie.** A seed
  encurtou três dígitos. Não há como evitar isso e remover o clado do
  endereço combinatório ao mesmo tempo — se preferir manter as seeds
  antigas válidas, dá para reverter só essa parte, mas aí o clado
  continuaria ocupando espaço na seed sem aparecer em lugar nenhum.

---

## Bateria de testes

**168 checagens, 0 falhas**, rodada 3 vezes seguidas. Duas suítes novas e
uma recalibrada:

- **Z · Asas, plano corporal e montador** — origem da asa por plano
  corporal, prosa declarando procedência, orçamento de membros com asa
  incluída, voador sempre com asa funcional, e o montador produzindo genoma
  coerente, não-primordial e endereçável por seed.
- **AA · ID de linhagem** — formato compacto e separado, numeração de
  primordiais, e as três propriedades que fazem o id valer mais que um
  nome: o endereço do filho é o da mãe mais um segmento, o último segmento
  é a posição real entre os irmãos, e a profundidade do endereço é a
  profundidade na árvore. Mais o recálculo global (caminho de migração) e a
  leitura de códigos com TAX de três campos.
- **F · Ecossistema — recalibrada.** F2, F3 e F5 falhavam de forma
  intermitente (medido: 3 de 6 execuções seguidas), e não era regressão do
  motor: os limiares vinham de quando o mundo era ~83% bactéria e toda
  espécie na mesma divisão interagia com todas. Depois que a v29 abriu a
  diversidade de reinos, a densidade de interações caiu por construção —
  uma planta e um inseto podem dividir a divisão e não terem nicho em
  comum. Cobrar "8 interações por ciclo" passou a medir a distribuição
  espacial do sorteio, não o laço de seleção, e um teste que falha por
  sorteio não informa nada. As três passam a medir o que pretendiam: o laço
  alcança espécies colidíveis, não fica ocioso, e o mecanismo de migração
  está ativo. Verificado: 8 execuções seguidas sem falha.

---

## Arquivos

Um arquivo novo, `14-montador.js`. O `sw.js` foi para `drn2-v34` e ganhou o
arquivo novo no pré-cache.
