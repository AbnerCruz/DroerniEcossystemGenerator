# v41 — Força restauradora na deriva e escala do mamífero

Duas coisas foram relatadas: criaturas nascendo com quantidades irreais de
olhos, e mamífero só aparecendo acima de 1000 ciclos (com 5000 para sair de
forma confiável). São problemas independentes e as duas causas foram
medidas no motor antes de qualquer correção.

---

## 1. Olhos irreais — bug do gradualismo da v40

A v40 introduziu o gradualismo: a deriva deixou de ressortear um gene na
tabela d100 inteira e passou a andar só para um valor **adjacente**
(`VIZINHOS_GENE`). O passo adjacente estava certo. O que estava errado é
que o vizinho era sorteado de forma **uniforme**, ignorando o peso da
tabela.

Isso é um passeio aleatório sem nada que puxe de volta ao valor típico. A
consequência é que a deriva **apaga** a raridade definida na criação: a
distribuição converge para algo próximo do uniforme sobre a escada,
independentemente de quanto a tabela d100 diz que cada valor é raro.

Medido em 400 ciclos de deriva, antes da correção:

| gene | na criação | depois de 400 ciclos |
|---|---|---|
| olhos = 2 | 68% | **23%** |
| chifres = 0 | 67% | **12%** (4 chifres virava a moda) |
| apêndices = 0 | 95% | 75% |
| porte, cauda, estrutura social | — | mesmo achatamento |

Ou seja: não era um gene de olho quebrado, era o mecanismo de deriva
inteiro dissolvendo a raridade de 22 genes morfológicos.

### Correção

O passo de vizinhança ganhou um **critério de aceitação** (Metropolis-
Hastings): a deriva propõe um vizinho e aceita com probabilidade
proporcional à razão entre os pesos da tabela, corrigida pelo grau do nó.
Descer para um valor mais comum é sempre aceito; subir para um valor mais
raro custa proporcionalmente à raridade.

O resultado é que a distribuição estacionária da deriva passa a ser a
**própria tabela d100**. O passo continua sendo de um degrau — o
gradualismo da v40 não foi desfeito, ele ganhou a metade que faltava.

Nenhuma trava dura foi criada: 4, 6 e 8 olhos continuam possíveis, apenas
voltam a ser raros, como na criação. Medido depois da correção, com 1500
ciclos de deriva:

| gene | criação | 1500 ciclos |
|---|---|---|
| olhos = 2 | 71% | **71%** |
| chifres = 0 | 62% | **62%** |
| porte, cauda, estrutura social | — | estáveis |

### Bug de dados achado no caminho

`VIZINHOS_GENE.crnChifreQtd` tinha uma aresta de mão única: `0` listava `2`
como vizinho, mas `2` não listava `0` de volta. Grafo assimétrico quebra o
balanço do critério de aceitação — o valor `2` entrava por duas portas e
saía por uma, e continuava acumulando probabilidade que a tabela não lhe
deu. A escada correta (`0 ↔ 1 ↔ 2 ↔ 4 ↔ 6`) foi restaurada.

As demais assimetrias do arquivo foram auditadas e são **deliberadas**:
valores de saída única (`au`, `ni`, `lq`, `vg`, `R`, `Z`, `F`, `P`, `an`),
dos quais a deriva sai mas não volta. Ficam registradas como exceção
explícita na suíte de testes.

### Genes isentos

Os genes que aparecem como pré-requisito em `PRE_REQUISITOS_CLASSE`
(`tolHidrica`, `memApendices`, `asaQtd`, `memSup`, `organizacaoTecidual`)
ficam **fora** da força restauradora. Se a raridade os puxasse de volta ao
valor típico, o portão da classe nunca abriria — medido: com eles
incluídos, o mamífero praticamente sumia de rodadas de 1000 ciclos. A
justificativa não é só mecânica: são genes sob pressão direcional, que é
exatamente o caso em que a distribuição neutra da tabela não deve valer.

---

## 2. Escala — o tempo não era o gargalo

A suspeita era de que faltava tempo geológico. Não era. O estágio 2 de
colonização (terra e ar liberados) já é atingido cedo até em rodadas de 500
ciclos: numa medição de 3 primordiais × 500 ciclos, 1.958 das 2.889
espécies nasceram já no estágio pleno.

O gargalo estava na **elegibilidade dos portões do cladograma**. Medido em
3 primordiais × 1500 ciclos na v40.1:

| aresta | elegíveis (v40.1) |
|---|---|
| BAS>MOL | 1,7% |
| BAS>PSC | 7,7% |
| MOL>INS | 75,0% |
| PSC>AMP | 28,7% |
| AMP>REP | 34,1% |
| REP>AVE | 21,9% |
| REP>MAM | **6,6%** |

Dois estrangulamentos.

### 2.1 O nó basal represava a árvore

`organizacaoTecidual = "ce"` (celomado) é pré-requisito das **duas** saídas
do nó basal, e só 19,3% dos invertebrados basais estavam celomados a
qualquer momento. O gene sorteava livre na tabela (`df` 35 / `ep` 35 / `ce`
30) e, como quem atravessa para BAS nasce difuso, a linhagem ressorteava a
organização a cada ciclo em vez de construí-la.

Grau de organização tecidual é apomorfia: um celomado não volta a ser
difuso. O gene virou uma **escada monotônica** — `df → ep → ce`, um degrau
por vez, sem retorno. A linhagem que persiste no nó basal agora chega ao
celoma em vez de sortear de novo.

Efeito colateral corrigido junto: uma vizinhança declarada mas vazia (o
topo da escada) vazava para o sorteio livre lá embaixo, que é justamente o
que a escada existe para impedir.

### 2.2 O portão do mamífero continuava assimétrico

A v40.1 já tinha baixado esse portão de três degraus para dois, e ainda
assim ele era 3,3× mais estreito que o da ave: `ectotermiaDependencia <= 5`
ocorria em só 11,7% dos répteis, porque o escalar parte de 7 e a caminhada
raramente anda dois degraus dentro da vida de uma linhagem. Era isso que
fazia a ave aparecer sempre antes do mamífero.

Agora o portão é um degrau: pele nua (`tegTipo = "Cr"`) + `ectotermia
Dependencia <= 6`. A apomorfia continua sendo a mesma — endotermia
incipiente sobre pele nua —, só que no primeiro valor em que ela é
descritível.

### Resultado medido

Elegibilidade depois das correções (mesma carga):

| aresta | v40.1 | v41 |
|---|---|---|
| BAS>MOL | 1,7% | **6,4%** |
| BAS>PSC | 7,7% | **13,3%** |
| REP>MAM | 6,6% | **9,9%** |
| REP>AVE | 21,9% | 12,7% |

Mamífero e ave ficaram praticamente simétricos, que era o ponto.

Resultado ponta a ponta, 3 primordiais × 10 rodadas:

| ciclos | v40.1 | v41 |
|---|---|---|
| 500 | ~0/10 rodadas com mamífero | **4/10** |
| 1000 | 7/10, mediana 5 | **9/10, mediana 19** |

A ordem do cladograma continua sendo respeitada integralmente — nenhum
salto, nenhuma reversão. O que mudou é que a cadeia completa cabe numa
rodada de tamanho razoável.

---

## Bateria de testes

254 checagens em 34 suítes, estável em 4 rodadas. Suíte nova:

**KK · Força restauradora e escada basal** — compara a distribuição de
olhos e chifres na criação e depois de 400 ciclos exigindo que o valor
modal continue modal; audita a simetria do grafo de vizinhança; verifica
que os genes-portão estão isentos; verifica que a organização tecidual
nunca regride em 120 ciclos; e verifica o degrau do portão do mamífero.

Pendência conhecida, **anterior a esta versão**: a checagem D7 (fidelidade
da seed em genomas nascidos de deriva) falha de forma intermitente com
1 genoma infiel em 300, num gene de táxon diferente a cada vez. Reproduz
igual na v40.1 sem modificação nenhuma, então não é regressão desta
entrega — mas é um bug real e entra na fila.
