# v40 — Cladograma de classes, gradualismo e o fim dos saltos evolutivos

## O relato

> "A evolução não está nada realista, mamífero virando ave, ave virando
> mamífero, etc. Não é como se os genes fossem construídos de maneira a
> respeitar sua origem. Claro que mutação varia a espécie, mas os saltos
> evolutivos estão muito bruscos."

Está certo, e não era ruído de sorteio — eram quatro causas somadas.

## Diagnóstico medido na v39

**1. `classe` nunca teve barreira.** Ela é gene de Estrato I, e a deriva a
tratava como qualquer outro categórico: `rerollGeneCategorico` sorteava na
tabela d100 **inteira**. A barreira da Fase 2 (item 5.1) protegia só
`reino`.

Em 1.744 especiações medidas: 14,9% trocavam classe ou reino. Dentro do
reino Animal, 33 das 118 trocas eram saltos impossíveis (PSC→MAM, MOL→AVE,
AMP→INS), mais 2 reversões. E as 55 travessias Bactéria→Animal caíam em
classe aleatória — **10 delas direto em mamífero, 4 em ave**.

No log estrutural do próprio usuário, evento #5: a espécie `1111`
(Bactéria) especiou em `11111` com `TAX:An.MAM` depois de **3 ciclos de
deriva**.

**2. A `ESCADA_CLASSE` da v37 não era cladística.** Ela existia, mas só o
evento de colonização a usava — a deriva normal a ignorava. E tinha
`MOL → INS → AMP`: molusco virava inseto que virava anfíbio, fundindo a
linha invertebrada com a vertebrada sem nó comum.

**3. A tolerância hídrica trocava a classe pelas costas.** Esta é a mais
invisível das quatro. A hídrica *restringia* a classe (`aq` só admitia
PSC/MOL/MAM/REP), e a normalização roda esse mesmo passo a cada ciclo de
deriva. Bastava a hídrica derivar para a classe da linhagem ser
**ressorteada** dentro da nova lista: uma ave que voltava para a água
renascia peixe, sem nenhuma mutação de classe ter acontecido e sem aparecer
em log nenhum.

**4. Nenhum gene categórico tinha noção de distância.** Escalares já andavam
de 1 em 1; categóricos pulavam para qualquer lugar da tabela. Medido:
tegumento saltou de mucosa para quitina 29 vezes e de mucosa para
cristalino 20 vezes — corpo mole ganhando exoesqueleto numa mutação só.
Dentição saiu de "ausente" direto para "mista" 29 vezes.

E, na travessia de classe, os genes de táxon da classe nova eram sorteados
**do zero**: uma linhagem que acabava de virar mamífero podia nascer com
endotermia plena e gestação placentária longa no mesmo instante em que
deixou de ser réptil. Era exatamente o "não respeita a origem" do relato.

---

## O cladograma

`classe` saiu do reroll genérico. Agora ela anda por uma árvore, **um
degrau por vez, só para frente**:

```
                  BAS  (invertebrado basal, aquático)
                 /   \
              MOL     PSC
               |       |
              INS     AMP
                       |
                      REP
                     /   \
                  MAM     AVE
```

Três decisões de projeto vieram do usuário:

- **As duas linhas se encontram só no nó basal comum.** Molusco e inseto
  nunca desembocam na linha vertebrada; elas compartilham ancestral com ela
  em BAS e divergem ali.
- **A bactéria entra só pela classe basal aquática.** Toda travessia
  Ba→Animal chega em BAS. Não existe mais bactéria virando mamífero.
- **Não há reversão de classe.** O retorno à água é readaptação de
  `tolHidrica` (baleia, pinguim), sem trocar de classe — que é justamente o
  que a correção da causa 3 tornou possível.

### A classe BAS (nova)

Invertebrado basal: corpo mole aquático, sem crânio, sem esqueleto rígido,
sem membro verdadeiro, sem face. É deliberadamente o plano corporal mais
pobre do sistema — tudo o que as outras classes têm, elas têm que
**conquistar** saindo dele. Três genes próprios: `organizacaoTecidual`
(difusa / epitelial / celomada), `alimentacaoBasal` (filtração / pastoreio /
captura) e `esqueletoHidrostatico` (escalar).

Ele também ganhou âncora própria no prompt de imagem, pelo mesmo motivo que
planta e fungo ganharam na v26: sem ela, "creature" faz o gerador desenhar
um bicho com cara e patas, e este é o plano corporal que não tem nem uma
coisa nem outra.

### Pré-requisitos: a travessia é conquistada, não sorteada

Estar no cladograma dá a permissão. O pré-requisito é o que faz a travessia
ser um evento. A linhagem precisa já ter derivado, por conta própria, a
apomorfia que aquela transição pressupõe — senão a mutação é recusada e o
orçamento do ciclo é gasto do mesmo jeito (mesmo padrão dos guards de
`tolHidrica` e `reino`, que já existiam).

| Travessia | Exige |
|---|---|
| BAS → MOL | celoma, corpo hidrostático firme (≥6) e tegumento capaz de secretar concha |
| BAS → PSC | celoma, enrijecimento axial (≤3) e natação como locomoção primária |
| MOL → INS | exoesqueleto endurecido ou apêndices articulados |
| PSC → AMP | saída da água obrigatória e nadadeiras lobadas |
| AMP → REP | pele impermeável (couro) e independência da água |
| REP → MAM | dependência de ectotermia reduzida a 4 ou menos |
| REP → AVE | um par de asas ocupando o par de membros superiores |

As duas saídas do nó basal divergem no **mesmo escalar, em sentidos
opostos**: corpo mole sustentado por pressão vai para o ramo invertebrado,
enrijecimento axial vai para o vertebrado. Escalar é de Estrato II e anda de
1 em 1 — a linhagem leva ciclos se comprometendo com um lado antes de poder
atravessar.

Para virar mamífero, uma linhagem de réptil precisa baixar a dependência de
ectotermia de 7 para 4, um passo por vez. Isso é o que estica a evolução no
tempo.

### Estado ancestral: quem atravessa nasce primitivo

Os genes de táxon da classe nova deixaram de ser sorteados. Quem atravessa
entra no estado mais próximo do ancestral e deriva dali:

- mamífero recém-formado: ectotérmico residual, marsupial, glândula
  vestigial, dentição homodonte, prognata, arcada maciça, abóbada baixa,
  quadrúpede, sem preensão, vocalização simples — ou seja, ainda quase um
  réptil;
- ave recém-formada: bico fino, pena só de voo, sedentária;
- réptil recém-formado: escama lisa, ectotermia 7, sem veneno.

Isso encaixa com os 12 diagnósticos da v39: **o rosto humano deixa de ser
sorteio e passa a ser trajetória**.

---

## Gradualismo nos genes categóricos

22 genes morfológicos ganharam vizinhança declarada (`VIZINHOS_GENE`): a
deriva só pode andar para um valor adjacente. Mucosa continua chegando a
cristalino — via casca —, mas custa três especiações em vez de uma.

Cobertos: tegumento, dentição, terminação de membro, formato de crânio,
focinho, orelha, locomoção primária, dieta, modo reprodutivo, cauda (tipo e
comprimento), estrutura social, simetria, tolerância térmica e hídrica,
porte, pescoço, proporção de membros, tronco, tipo de asa, membros
superiores, apêndices, quantidade de asas, olhos e chifres.

Genes fora do mapa (cor, padrão, anomalia) continuam com reroll livre **de
propósito**: entre "marrom" e "azul" não existe distância morfológica a
respeitar.

## Simetria por classe

Um mamífero de simetria amorfa não é uma criatura estranha, é um erro de
leitura do conceito de classe. Medido na primeira rodada com o cladograma:
só 5 de 562 invertebrados basais eram bilaterais, o que fechava a saída para
a linha vertebrada. Bilateralidade passou a ser a apomorfia que o nó basal
transmite para tudo que vem depois dele.

## A deriva passou a respeitar as travas de CLASSE

Até aqui `rerollGeneCategorico` só consultava travas de reino e
condicionais. Podia mover o tegumento de uma ave para "escama", e a
normalização seguinte desfazia — gastando ciclo à toa e, pior, tornando o
gradualismo mentiroso: o passo adjacente era dado e depois revertido para um
valor não-adjacente.

---

## Três bugs antigos encontrados no caminho

**1. `memApendices` e `morForma` nunca derivaram — em versão nenhuma.**
As duas tabelas não estavam em `GENE_TABLE_MAP` (a de apêndices vivia inline
dentro do Passo 6; a de forma de crescimento é diferente por reino).
`rerollGeneCategorico` devolvia `false` silenciosamente. Consequências: a
nadadeira lobada nunca aparecia, e por isso **peixe → anfíbio era
impossível**; e a forma de crescimento de toda planta, fungo e bactéria do
sistema congelava na criação. Mesma família do bug de `sortGeneAlvo` achado
na v39.

**2. Metade das tentativas de deriva era desperdiçada.** `sortGeneAlvo`
sorteava entre os 66 genes do Estrato II, dos quais ~36 são genes de táxon
de *outras* classes: a tentativa caía no guard de `GENE_TAXON_APLICAVEL`,
gastava orçamento e não mudava nada. Agora o sorteio olha só os genes que a
espécie de fato tem. Isso mais que dobrou a quantidade de mutações efetivas
por ciclo — e era o motivo de os pré-requisitos de travessia quase nunca
serem alcançados.

**3. Limiares de especiação dobrados**, como consequência direta do item
anterior: com os limiares antigos, 600 ciclos passaram de ~4 mil para ~9,5
mil espécies. `{Ba:16, Fu:16, Pl:14, An:12}`, BAS em 22, e DL acumulada de 3
para 6. A árvore voltou ao tamanho anterior e cada linhagem acumula mais
deriva antes de cortar — que é o que permite alcançar as travessias
profundas.

---

## Números

**1.000 ciclos, 4 primordiais:**

| | v39 | v40 |
|---|---|---|
| trocas de classe fora do cladograma | 33 saltos + 2 reversões | **0** |
| Ba → classe animal | aleatória (10 direto em MAM, 4 em AVE) | **100% em BAS** |
| cadeia completa | — | BAS→PSC 64 · PSC→AMP 68 · AMP→REP 31 · REP→MAM 2 · REP→AVE 7 |

**Bateria:** 245 checagens, 0 falhas reais, estável em 3 rodadas. Suíte nova
`JJ · Cladograma de classes e gradualismo`, com 21 checagens — entre elas:
o cladograma é uma árvore sem ciclo com raiz única; `rerollGeneCategorico`
recusa mexer em `classe`; nenhum salto e nenhuma reversão em ~3 mil
espécies; toda travessia Ba→Animal chega em BAS; quem atravessa para
mamífero nasce no estado ancestral; sem a apomorfia a travessia é recusada;
e a deriva não move nenhum gene morfológico para fora da vizinhança
(medido: 0 de 4.805 passos).

---

## Compatibilidade

- **Seeds anotadas antes da v40 decodificam para outra espécie.** A tabela
  `classeAn` passou de 7 para 8 valores, então o índice combinatório mudou.
  Mesma situação assumida na v34 (remoção do clado).
- **Códigos DRN2 continuam válidos.** `TAX:An.BAS` é novo, mas o parser lê
  qualquer classe; códigos antigos decodificam normalmente.
- **Árvores salvas continuam abrindo.** Espécies existentes mantêm a classe
  que têm; a partir daí elas passam a andar pelo cladograma.

## Limitação assumida

Mamífero e ave são raros em rodadas curtas — a cadeia BAS→PSC→AMP→REP→MAM
tem quatro travessias, cada uma com apomorfia própria. Em 1.000 ciclos com 4
primordiais saem poucas unidades. Isso é o comportamento pedido (nada de
salto brusco), mas quem quiser um mamífero rápido deve usar o montador ou a
busca por DNA-alvo, não esperar a deriva.

---

# v40.1 — Correção de escala: o mamífero que nunca chegava

## O relato

> "Testei várias vezes, 1, 2, 3 primordiais, 1000 ciclos de deriva. Na
> prática, na mediana, nenhum mamífero está sendo gerado. Acredito que o
> sistema esteja certo, então é uma questão de escala."

Metade certo. A cadeia estava correta, mas a escala necessária era maior do
que precisava ser — por uma incoerência que ficou na v40.

## O gargalo real

Medido em 4.475 invertebrados basais: **1.767 deles tinham
`esqueletoHidrostatico` exatamente no valor ancestral (4)**. O gene mal
derivava. E ele é pré-requisito das **duas** saídas do nó basal.

Causa: eu o havia colocado no Estrato II (custo 4), sozinho entre os
escalares de táxon — `ectotermiaDependencia`, `respiracaoCutanea`,
`pelagemDensidade`, `ovoCasca`, `fotossinteseIntensidade` e
`redeMicelialAlcance` sempre estiveram no Estrato III (custo 1). Com custo 4
dentro de um sorteio de ~30 genes aplicáveis, ele praticamente congelava —
e represava 64% da árvore inteira em BAS.

Corrigido: `esqueletoHidrostatico` foi para o Estrato III, onde os outros
escalares de táxon sempre estiveram.

## O portão do mamífero era assimétrico

Medido em 71 répteis: 9 já satisfaziam o portão da ave (asa + par superior
livre) e só 3 satisfaziam o do mamífero, que exigia uma caminhada aleatória
de **três** degraus para baixo num escalar que parte de 7. Resultado
prático: ave saía, mamífero nunca.

O portão passou a ser as duas apomorfias que de fato definem o grupo — pele
nua (de onde sai o pelo) e endotermia parcial:

`REP → MAM` agora exige `tegTipo = "Cr"` **e** `ectotermiaDependencia ≤ 5`.

## Uma travessia por tique

A conquista de ambiente roda **antes** do ciclo de deriva, no mesmo tique.
Quando as duas atravessavam a classe, saíam dois degraus antes de a
especiação cortar — legal no cladograma, mas o usuário via `BAS→AMP` num
salto só, que é justamente o que a v40 existe para eliminar. Agora vale uma
travessia por tique, venha da deriva ou da conquista. Medido depois da
correção: 0 saltos de dois degraus.

## Números

**3 primordiais, 1.000 ciclos, 10 rodadas:**

| | v40 | v40.1 |
|---|---|---|
| rodadas com ao menos 1 mamífero | 0/6 | **7/10** |
| mamíferos (mediana) | 0 | **5** |
| profundidade máxima do clado | 3 | 4 |

**3 primordiais, 2.000 ciclos:** mediana de 11 mamíferos e 46 aves,
profundidade 4 em todas as rodadas.

**1 primordial, 1.000 ciclos:** 3/8 rodadas com mamífero. Uma linhagem só é
volátil por natureza — quem quiser mamífero com confiança usa 2-3
primordiais, ou 2.000 ciclos.

**Bateria:** 245 checagens, 0 falhas reais. Suíte JJ estável em 5 rodadas.

## O que continua valendo

Mamífero e ave seguem sendo o fim de uma cadeia de quatro travessias, cada
uma com apomorfia própria. Eles chegam **tarde** de propósito — é o preço de
não haver salto brusco. O que a v40.1 corrige é a cadeia estar mais lenta do
que o projeto pedia, não a lentidão em si.
