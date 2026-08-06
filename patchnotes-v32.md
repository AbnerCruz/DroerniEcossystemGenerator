# v32 — Bifurcação, geografia editável, filtros e o fim do teto de linhagens

Nove pedidos, todos nesta versão. Onde o diagnóstico veio diferente do
sintoma relatado, está anotado — o que foi corrigido nem sempre foi o que
parecia estar quebrado.

---

## 1. A trilha não estava bifurcando

**Diagnóstico:** não era falha, era construção. `materializarTrilha` percorria
os ciclos em ordem e fazia `pai = filho` no fim de cada corte de espécie. O
resultado só podia ser uma escada: uma espécie por degrau, um filho por nó,
nunca duas irmãs.

**O que mudou:**

- **Ramos laterais.** A cada corte, a população ancestral pode gerar também
  uma linhagem-irmã (35%), que recebe um ciclo de deriva próprio e para ali.
  Uma linhagem real não deixa de se ramificar só porque estamos contando a
  história de um dos ramos — as espécies-primas existem, elas é que não levam
  ao alvo. O último nó devolvido continua sendo sempre o alvo: o ramo lateral
  é suprimido no corte final, senão tomaria esse lugar.
- **Instantâneos de gene por ciclo.** A trilha guardava só os *nomes* dos
  genes alterados; os valores eram lidos depois, do genoma final. Isso já era
  admitido como aproximação, e funcionava enquanto a trilha era uma linha
  reta com um destino só. Para pendurar um ramo no meio do caminho é preciso
  reconstruir o genoma exato daquele ponto — e o valor final de um gene que
  mudou três vezes não diz nada sobre o que ele valia no ciclo 2. Agora o
  valor é fotografado no momento em que o ciclo é aceito, o replay é exato e
  `serializarTrilha` deixou de ser aproximada.

**Medido:** trilha de alvo único, 36 nós, 11 pontos de bifurcação, 4/4 alvos
ainda batendo 100%.

---

## 2. Motor de trilha multi-alvo

`gerarLinhagemMultiAlvo` — "adicionar DNA alvo" quantas vezes se quiser, e
sai disso uma linhagem só.

O primeiro alvo define o **tronco**. Cada alvo seguinte mede a distância
genômica até todos os nós já criados e ancora no mais próximo, com desempate
pelo ancestral **mais antigo** dentro de uma margem de 15%. Sem esse
desempate a âncora caía sempre na ponta do ramo anterior — o nó mais evoluído
disponível — e o resultado era outra escada, cada alvo virando continuação do
anterior em vez de irmão dele.

O critério por distância é o que dá sentido filogenético ao desenho: dois
dragões pedidos junto com um peixe compartilham quase todo o tronco, e o
peixe sai lá de baixo. Ninguém precisa dizer isso ao sistema.

**Dois caminhos de uso**, como pedido:

- **Isolado:** botão "Motor de Trilha (multi-DNA)" na Fase 3. Lista de alvos,
  origem escolhível (nó existente ou ancestral primordial novo), massa e AU.
- **Junto com os primordiais:** campo de DNAs-alvo dentro do modal "Gerar
  ecossistema", um por linha. As linhagens dirigidas nascem na mesma leva dos
  primordiais e entram no mesmo lote de população e de seleção natural.

**Medido:** 4 alvos → 35 nós, 2+ bifurcações, 4/4 exatos.

---

## 3. O teto de linhagens virou um escalonador

**O que era:** `MAX_LINHAGENS_ATIVAS = 40` era um teto **populacional**.
Passou de 40 linhagens numa rodada, o excedente era sorteado e **extinto**
("extinção por saturação"). Existia por razão puramente computacional — o
custo da deriva é O(ciclos × linhagens paralelas) — mas o preço aparecia na
árvore: ramos inteiros morriam por uma regra que não é biologia nem
geografia, é orçamento de CPU disfarçado de evento evolutivo.

**O que é:** um teto de **concorrência**, como o tamanho de um pool de
threads. Quantas linhagens avançam por rodada. As demais não morrem — ficam
na fila e avançam nas rodadas seguintes, em rodízio. O trabalho total
continua limitado por um orçamento global de `ciclos × concorrência` passos,
que é **exatamente o mesmo pior caso** que o teto antigo já impunha. A
performance não muda; muda para onde vai o trabalho: antes o excedente era
jogado fora junto com a linhagem, agora é redistribuído.

- Some a categoria "extinta por saturação" (o campo continua, zerado).
- Uma linhagem sem ciclos suficientes não morre: fica **estável**, que é um
  estado legítimo, e continua viva na árvore.
- O número de linhagens simultâneas deixa de ter limite.
- Concorrência ajustável na UI (8–256, padrão 64).
- A estimativa de tempo virou **exata** — é o orçamento, não uma média
  empírica. Medido: 33 s previstos contra 36 s reais.

Extinção continua existindo, e vem de onde deveria: a seleção natural
populacional, por competição, predação e capacidade de suporte.

**Medido:** com concorrência forçada a 8, o pool chega a 117 linhagens, 0
extintas.

---

## 4. Bactérias dominando o fim da simulação

**Diagnóstico:** não era a barreira de reino — a travessia acontecia. Era a
taxa de **corte**. Quase todo o Estrato I de uma bactéria está travado
(membros, crânio, focinho, reprodução são fixos), então ela raramente cortava
por via estrutural, mas continuava cortando pelo acúmulo de 6 genes de
Estrato II, igual a qualquer outro reino. O mundo enchia de bactérias
ligeiramente diferentes umas das outras, gastando o orçamento de espécies que
deveria ir para os outros reinos.

**O que mudou:**

- **Limiar de especiação por reino** (`Ba: 8, Fu: 8, Pl: 7, An: 6`). Uma
  bactéria precisa acumular mais deriva para valer uma espécie nova. Ela
  continua existindo do começo ao fim — só para de ocupar a maior parte da
  árvore.
- **Salto de reino de 1/3 para 0,85.** Para uma bactéria, a mudança
  estrutural que de fato existe é deixar de ser bactéria. E isso fecha a
  variância: medido em 8 rodadas de 4 primordiais × 150 ciclos —

  | peso | mínimo | mediana | máximo |
  |------|--------|---------|--------|
  | 0,45 | 11% | 27% | **65%** |
  | 0,70 | 8% | 20% | 43% |
  | 0,85 | 13% | **21%** | **24%** |

  Com peso baixo, se a travessia calhava de demorar, o problema original
  reaparecia por azar. Com 0,85 o resultado deixa de depender de sorte.
- **"Bactéria" sai da mesa no salto de reino.** Cair de volta em Ba gastava o
  sorteio mais caro do sistema para não mudar nada.

**Medido: de 92% para ~21% de bactérias**, com fungo e planta aparecendo de
verdade. Bactéria segue presente no fim, como deve.

---

## 5. Quanto mais elementos, melhor

- Teto de espécies por derivação: **3.000 → 12.000**.
- Padrões do gerador de ecossistema: **15–35 → 120–200 ciclos**. Medido: com
  35 ciclos a árvore para com ~11 nós, todos bactéria, porque a linhagem não
  teve tempo de atravessar a barreira de reino; com 150 ciclos saem ~1.100
  espécies. O que tornava esse padrão inviável antes era não saber quanto ia
  demorar — e agora a estimativa é exata.
- **Otimização do motor:** `normalizarGenoma` ficou **51% mais rápido** na
  mesma carga (2.376 ms contra 4.801 ms da v31, medidos na mesma máquina).
  Duas varreduras lineares saíram do caminho quente: a validação de domínio
  escalar, que testava até 64 entradas por gene escalar por normalização
  (era a linha mais quente do motor inteiro no profiler), e os conjuntos de
  locomoção, que eram realocados a cada chamada.

---

## 6. Bactéria sem tipo de alimentação

**Diagnóstico:** a dieta saía preenchida. O que estava errado era o
`metabolismoTipo`, sorteado **independentemente** da dieta — a mesma
bactéria saía "detritívoro" no bloco DIE e "fotossíntese" na prosa.

**O que mudou:** o metabolismo virou leitura direta da dieta, e a bactéria
ganhou **fotossíntese** entre as dietas permitidas (cianobactéria é bactéria
fotossintética de verdade, e a ausência dessa opção era justamente o que
criava a contradição). A trava de dieta também passou a valer na deriva, não
só na construção. A prosa agora declara que os dois são a mesma coisa.

**Medido:** 0 incoerências em 1.500 bactérias; 0 dietas impossíveis em
bactérias derivadas por 60 ciclos.

---

## 7. Pesos mais realistas

**Diagnóstico:** quantização. O porte mapeava para **um** número — todo
animal "médio" tinha exatos 1,70 m, todo "grande" exatos 4,50 m. Com k e
densidade também discretos, o sistema inteiro produzia umas poucas dezenas de
pesos possíveis: um lobo, um humano e um cervo saíam idênticos.

**O que mudou:**

- **Cada porte virou uma faixa**, com posição derivada do genoma: metade viés
  biológico legível (tronco alongado e membros longos puxam para o topo,
  corpo compacto e prole numerosa para o fundo), metade hash estável do
  clado. Determinístico, sem campo novo no genoma e sem consumir dígito de
  seed. Interpolação geométrica, não linear — tamanho de organismo se
  distribui em escala logarítmica.
- **Densidade efetiva.** Voo −28% (osso pneumático, sacos aéreos); vida
  aquática puxada para a flutuabilidade neutra da água; tegumento
  mineralizado +18%; teto de densidade por porte, porque nada de porte grande
  é mineralizado por inteiro.
- **Teto do quadrado-cubo do lado animal** (a planta já tinha o seu desde a
  v28). Corpo grande não é corpo pequeno em escala: fica proporcionalmente
  mais esguio e mais oco, senão o próprio peso esmaga a estrutura. Ancorado
  na baleia-azul (30 m / 190 t) e em sauropodes (30 m / ~70 t).

**Medido:** 499 pesos distintos em 500 animais de porte médio (era um
punhado). Máximo animal caiu de 686 t para ~130–160 t — abaixo da
baleia-azul, que é o teto real da vida conhecida.

---

## 8. Configuração e edição geográfica plena

- **Sortear geografia.** O sorteio é da **faixa latitudinal** da massa
  (polar, subpolar, temperada, subtropical, equatorial, oceânica), e os
  domínios são derivados dela. Sortear domínios soltos produziria uma massa
  polar oferecendo deserto quente — as combinações incoerentes simplesmente
  não estão na tabela. Sortear e confirmar continuam separados: o resultado
  entra como rascunho editável.
- **Geografia editável depois de confirmada.** Antes, confirmar era
  irreversível. Agora a visão confirmada é também um editor: nome, domínios,
  biomas excluídos e o bioma de cada divisão, um a um. A edição é **no
  lugar** — o `id` da massa é preservado, porque as espécies e as populações
  guardam o `massaId`; recriar a massa seria excluí-la e deixar tudo que vive
  nela órfão. Biomas por divisão que continuam válidos são preservados; só os
  que deixaram de existir são resorteados.
- O seletor de bioma por divisão só oferece o que a massa realmente tem — é
  a trava que impede um vulcão de aparecer onde só há domínio polar.

**Medido:** 0 combinações incoerentes em 1.200 massas sorteadas.

---

## 9. Slider de eras e sistema de filtros

**Slider de eras.** Corte temporal sobre o mundo inteiro: mostra só as
espécies já surgidas e ainda não extintas no AU escolhido, com a era vigente
e a contagem de vivas.

**Mudança de semântica que vale conferir:** a regra antiga era "a espécie
morre no instante em que nasce o primeiro filho" — anagênese pura, que fazia
sentido enquanto a mãe raramente sobrevivia à especiação. Deixou de fazer
nesta versão: com o escalonador, a mãe entra no pool como linhagem irmã em
~60% das especiações e continua derivando, ou seja, demonstravelmente
continua existindo depois de ter filhos. Mantida a regra antiga, o slider
mostraria como morta uma espécie que a própria simulação continuou a fazer
evoluir. Agora só encerra a existência o que de fato encerra: extinção
registrada pela seleção natural.

**Filtros — 33 filtros em 5 grupos.** Declarados numa tabela no motor
(`FILTROS_ESPECIE`); a UI se desenha a partir dela. Não há uma linha de
interface por gene — acrescentar um filtro é acrescentar uma linha, e a lista
não envelhece toda vez que um gene novo entra no sistema.

| Grupo | Cobre |
|---|---|
| Taxonomia | reino, classe |
| Corpo | porte, simetria, locomoção, tegumento, cor, crânio, dentição, asas, cauda, chifres, peso, dimensão linear |
| Ecologia | dieta, tolerâncias hídrica/térmica, ciclo, estrutura social, reprodução, arma, sentido especial, magia, senciência, anomalia |
| Geografia | massa de terra, domínio climático, bioma viável |
| Tempo e estado | AU de surgimento, extinta, primordial, tem descendência, veio de trilha |

Três tipos de controle: escolha múltipla (OU dentro do campo), faixa numérica
e booleano de **três** estados — sim / não / tanto faz. Um checkbox comum
teria só dois, e "desmarcado" acabaria significando "só as que não têm",
filtrando sem o usuário ter pedido. Os filtros combinam por E entre si, e a
busca por DNA colado (v29) virou um campo dentro deste sistema, agora
combinável com todo o resto.

Na árvore, o filtro mostra quem casa **mais os ancestrais** que ligam esses
nós à raiz — sem eles o galho some e o resultado some junto. Mesma regra do
filtro "só vivas" da v29, agora generalizada.

---

## Bateria de testes

**36 checagens novas** em 6 suítes (R–W): bactéria, escala contínua,
escalonador, bifurcação, geografia sorteada e filtros. Somadas às anteriores,
a bateria embutida (ícone de frasco no cabeçalho) roda 118 checagens. Rodadas
8 vezes seguidas sem falha.

Um teste foi reescrito no caminho: a checagem de que o pool ultrapassa o teto
antigo de 40 falhava ~1 vez em 2 por variância estatística legítima (depende
de a linhagem calhar de ramificar bastante em 150 ciclos), não por bug.
Virou uma checagem do **mecanismo**: com a concorrência forçada a 8, o pool
tem que passar de 8 — se o teto ainda fosse populacional, pararia ali.

---

## Pendência que segue aberta desde a v26

`simularSelecaoNatural` e `rodarCicloSelecaoIndividual` ainda fazem
`Object.assign` no genoma de espécie viva, alterando o DNA sem gerar nó
filho — a mesma incoerência que a Fase 2 corrigiu só para a edição manual.
Não foi tocada nesta versão.
