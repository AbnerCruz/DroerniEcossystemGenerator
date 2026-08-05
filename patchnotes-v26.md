# v26 — Correções da carteira de testes (bugs, coerência, ecossistema, performance)

Versão inteiramente reativa: nasceu de uma bateria automatizada de 70 checagens rodada sobre o motor da v25.
A v25 passava em 36 e falhava em 15. **A v26 passa em 54 e falha em 0.**

Cada item abaixo cita a medição que motivou a mudança.

---

## Coerência

### #1 · Plantas, fungos e bactérias descritos como animais (bug 4.4, adiado desde a Fase 1)

`describeCreatureProse` emitia as frases de anatomia animal **incondicionalmente**, mesmo com os genes zerados.
Medido: **100% das plantas, 100% dos fungos e 100% das bactérias** recebiam a frase do crânio e a contagem de membros
("Tem 0 superiores e 0 membro(s) inferior(es)… O crânio é indefinido, sem estrutura craniana fixa").
Os *genes* sempre estiveram corretos — nenhuma planta tinha crânio, asa, cauda, olhos, dentes ou membros no genoma.
O problema era só a prosa, e como `gerarPromptImagem` a usa como "fonte autoritativa", era exatamente daí que
saía a planta com cara de bicho na IA de imagem.

- Pl/Fu/Ba ganharam frase de locomoção própria (crescimento/expansão pelo substrato), sem menção a membros.
- O bloco do crânio e o do rosto simplesmente não são emitidos para esses reinos. Um **animal** sem crânio continua
  recebendo a menção — nele é uma característica marcante, não um ruído.
- "Cognição" e "agressividade" viraram "resposta a estímulos" e "competitividade" nesses reinos.
- O prompt de imagem ganhou âncora de assunto por reino (`Fantasy BOTANICAL illustration… NOT an animal, NOT a
  creature with a face or limbs`), estilo de prancha naturalista em vez de concept art de criatura, e negative
  prompt específico (`no face, no eyes, no skull, no limbs, no fur, no scales`).

### #7 · A segunda anomalia era código morto

O gatilho era `extremos >= 8`. Em 20.000 espécies o máximo observado foi **5**; após 40 ciclos de deriva, **6**.
A primeira anomalia saía em 0,03% das espécies e a segunda, nunca. Limiares recalibrados contra a distribuição
real (`{0:8742, 1:8082, 2:2639, 3:479, 4:52, 5:6}`) para **3 e 5** — agora ~2,7% das espécies ganham uma anomalia
e ~0,03% ganham a segunda.

---

## Ecossistema

### #3 · Extinção só existia por saturação de linhagem

`node.extinta = true` aparecia em **um único ponto de todo o código**: o descarte pelo teto de `MAX_LINHAGENS_ATIVAS`.
Medido: após 60 ciclos de seleção populacional, **47 espécies ficaram com zero indivíduos vivos e todas as 47
continuavam marcadas como vivas** na árvore, na lista e nos exports.

Espécie sem nenhum indivíduo vivo agora recebe `extinta`, `auExtincao` e `motivoExtincao: "populacional"`, com evento
de log dedicado. `extincao` entrou em `TIPOS_ESTRUTURAIS`, então nunca é descartada pela poda do log.

### #4 · A seleção natural resolvia 1 interação por divisão por ciclo

Os dois loops aninhados paravam no primeiro par viável (`&& !vencedoraNode`). Medido: **exatamente 8,0 interações
por ciclo — o número de divisões — com 183 espécies vivas** e 27 a 65 espécies coexistindo por divisão. Dobrar o
número de espécies não aumentava a pressão em nada.

Agora todos os pares da divisão são avaliados (teto de 40 por divisão), guardando por perdedora só a pior interação
recebida — predação prevalece sobre competição, mesmo critério que a versão por AU já usava. Medido depois: **~62
interações por ciclo**, 61% do ecossistema alcançado em 60 ciclos.

### #4b · Populações só encolhiam (descoberto ao corrigir #4)

Com a cobertura baixa, isso ficava escondido. O único nascimento existente era o `+1` da espécie vencedora de uma
colisão; toda espécie derrotada perdia metade dos indivíduos a cada ciclo, sem nunca repor. Assim que a cobertura
foi corrigida, o ecossistema colapsava em monocultura por divisão em ~50 ciclos e depois zerava as colisões
(medido: 92% de extinção em 60 ciclos).

- **Reprodução:** toda espécie com população viva numa divisão pode gerar prole, com chance proporcional a `repProle`
  (10% em repProle 0, 55% em repProle 9).
- **Refúgio:** `Math.ceil(n/2)` virou `Math.floor(n/2)`. Com `ceil`, uma população de 1 perdia sempre esse 1 — a
  extinção era consequência automática de uma única derrota. Agora uma população reduzida a 1 só some se perder um
  sorteio de 20%, o que exige derrotas repetidas.
- **Capacidade de suporte:** o teto que existia era *por espécie*, então a população total de uma divisão crescia
  junto com o número de espécies — medido: 872 espécies levavam a 14.814 indivíduos e a 953ms por ciclo (contra
  108ms no começo). Novo teto de 90 indivíduos por divisão, **somando todas as espécies**: é o que transforma
  espaço em recurso disputado, que é justamente o que a seleção natural deveria estar simulando.

Resultado: ~49% de extinção em 60 ciclos, com nascimentos e mortes na mesma ordem de grandeza, e custo por ciclo
estável (62,8ms → 14,5ms ao longo de 175 ciclos).

### #5 · Cadáveres e cópias de array

Cada colisão fazia `individualsOut.map(...)` sobre o array inteiro (uma cópia completa **por colisão**) e os mortos
ficavam no array para sempre — medido: **543 de 1293 entradas eram cadáveres percorridos a cada ciclo**.
Agora as mutações são in-place sobre uma cópia rasa única feita no início do ciclo, e os mortos antigos são podados
mantendo só os 300 mais recentes (o suficiente para o badge "morto" da UI continuar tendo o que mostrar).

---

## Árvore reversa

### #2 · A busca por DNA-alvo não batia 100% — nem perto

A decisão da Fase 4 era *bater 100% no alvo, mesmo que exija muitas tentativas*. Medido na v25:

- `calcularDL` comparava **10 genes**. "DL = 0" significava acertar menos de 10% do DNA.
- Mesmo nesse alvo reduzido, **1 de 25** buscas atingia DL = 0; **24 de 25** encerravam como "inatingível".
- **0 de 25** terminavam com o código DRN2 igual ao alvo colado.

Três mudanças:

1. **DL completo.** Passa a cobrir **os 59 campos que `serialize()` escreve no código DRN2** — que é o artefato que
   o usuário cola, e portanto a única definição honesta de "100%". Os pesos seguem o custo de mutação por estrato
   (I = 12, II = 4, III = 1), então a busca continua priorizando o que é estruturalmente mais caro.
   Chaves que o alvo não declara não são penalizadas (um código sem bloco `ASA` não exige asa; a ausência do bloco
   *é* a exigência "sem asa", e vira `asaQtd: 0` explícito).
2. **Parser completo do código DRN2.** Os quatro campos concatenados sem separador (`CRN` qtd+forma, `TEG`
   cor+intensidade, `FAC` olhosQtd+tipo, `SEN` especial+intensidade) são desambiguados casando com os valores reais
   das tabelas de `T`, e não por posição de caractere — que era a ambiguidade citada no código antigo como motivo
   para não fazer o parser completo. Verificado: 300 códigos serializados e reparseados sem uma única divergência.
3. **Busca em duas fases.** O que havia era hill-climbing puro que só aceitava melhora *estrita* e desistia após 500
   tentativas — trava em qualquer platô, e um ciclo de deriva mexe em vários genes de uma vez, então quase nunca
   melhora tudo ao mesmo tempo. Agora: fase estocástica com movimento lateral (atravessa platô, mantém o "sabor
   evolutivo" da trilha) seguida de **convergência dirigida gene a gene**, com renormalização entre rodadas.
   Anomalias — que são derivadas e por isso ficam fora do DL — são copiadas do alvo na fase dirigida; eram a última
   fonte de divergência residual (1 caso em 25).

Medido depois: **25/25 atingem DL = 0 e 25/25 terminam com o código DRN2 idêntico ao alvo colado.**

Alvo genuinamente impossível (outro reino, com origem que não é bactéria) agora é **diagnosticado antes de rodar**,
com o motivo em texto — em vez de gastar 4000 tentativas e devolver um "inatingível" genérico.

---

## Geografia

### #6 · Configurações impossíveis aceitas em silêncio

Três casos produziam uma massa de terra morta (8 divisões com `biomaNome: null`), sem erro nem aviso:
domínio climático inexistente; todos os biomas do domínio excluídos; lista de domínios vazia após filtrar inválidos.

`criarMassaDeTerra` agora devolve `massa.avisos` — uma lista de problemas legíveis que a UI pode exibir — e, quando
não sobra nenhum bioma, cai no conjunto completo em vez de deixar a massa vazia. Uma massa sem bioma nenhum não é
uma configuração; é um estado inválido.

`divisoesVizinhas(0, 1)` devolvia `[0, 0]`: a divisão era vizinha de si mesma e "migrar" significava ficar parado.
Passa a devolver lista vazia, e quem migraria sem destino morre em vez de sumir em silêncio. Importa agora que o
número de divisões deixou de ser necessariamente 8.

---

## Arquitetura e logs

### #9 · O motor dependia da camada de UI

`01-core-motor.js` chamava `sortNomeIndividuo()`, definida em `04-ui-fases.js`. Funcionava só porque os scripts
compartilham o escopo global e carregam nessa ordem; quebrava ao reordenar os `<script>`, ao migrar para módulos
ESM ou ao testar o motor isolado — foi a primeira coisa a estourar na bateria. A função mudou para o motor,
verbatim. Continua global, então nada muda para a UI. **Era a única violação de camada; não há nenhuma colisão de
nome global entre os 10 arquivos.**

### #8 · Teto de log estourava em runs modestos

Modo detalhado, 400 ciclos, 919 espécies: **4000/4000 eventos, poda ativada** — qualquer simulação real perdia
histórico. O teto existia por causa da renderização, não do armazenamento, e a UI já fatiava em 300 eventos por
conta própria. Teto elevado para 30.000.

### #10 · Detalhes

- `AU ${au}${massaId ? "" : ""}` — ternário que não fazia nada, sobra de edição. Removido, e o AU passou por
  `auTextoLog` como o resto dos eventos.

---

## Performance

Duas otimizações, nenhuma delas mexendo em regra do sistema:

- **`categoricalStep`** resolvia "este valor é permitido aqui?" com `nums.some((n) => pick(table, n).value === v)`:
  varredura de até 100 números, cada uma com um `pick` que é varredura linear da tabela — O(|nums| × |tabela|) por
  gene, ~90 genes por chamada. Agora há um índice valor→posição cacheado no mesmo recorte que `validNumbers` já
  cacheia. `normalizarGenoma`, a chamada mais cara do motor inteiro, caiu de **0,72ms para 0,39ms**.
- **`clonarGenoma`** substitui `JSON.parse(JSON.stringify(g))` no caminho quente. O genoma é um objeto plano; só
  `anomalias` é array.

Deriva de linhagem, 600 ciclos: **6,2s → 3,4s**. 1500 ciclos: **10,1s → 6,2s**.

### Limitação assumida

Deriva longa continua cara **por volume, não por algoritmo** — o crescimento é linear (200 → 1500 ciclos multiplica
o tempo por 6,6× para 7,5× mais ciclos). Num celular, 600 ciclos ainda são ~20s.

Em vez de impor um teto artificial de ciclos — que empobreceria justamente a bifurcação da árvore — o motor passou a
expor `estimarTempoDeriva(ciclos, primordiais)`, **calibrado em tempo de execução no próprio aparelho** com um
micro-benchmark de 60 ciclos. O modal de gerar ecossistema mostra a estimativa antes de rodar e destaca em âmbar
quando passa de 20s. A decisão fica com quem está usando.

---

## Regressões corrigidas dentro da própria v26

Registradas porque foram introduzidas por outras correções desta versão e pegas pela bateria:

- Baixar o limiar de anomalia expôs que `ano1`/`ano2` dependem de um contador **derivado** (`extremos`), recalculado
  do zero na reconstrução por seed. Depois de deriva, um escalar que virava 0 ou 9 mudava `extremos` sem disparar
  normalização, e a presença da anomalia divergia entre o genoma corrente e o reconstruído — 0,13% dos genomas
  derivados. `ano1`/`ano2` entraram em `GENES_SEMPRE_DERIVADOS`, e `dieFrequencia`/`socAgressividade` (dois escalares
  com intervalo dependente de outro gene) entraram em `GENES_CONDICIONANTES`. **0 infiéis em 3.000 genomas derivados.**
- A cascata #4 → #4b já descrita: corrigir a cobertura da seleção causou colapso do ecossistema, corrigir isso com
  reprodução causou explosão populacional, e só a capacidade de suporte fechou o ciclo.
