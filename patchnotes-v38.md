# v38 — Os genes por táxon entram no código DRN2 (bloco `TXN`)

## O relato

Ao montar um humano, o resultado da IA de imagem saiu com cara de
australopiteco. O DNA visível estava correto — bípede, mão preênsil, crânio
humanoide, focinho plano, dentição mista — e mesmo assim a criatura voltava
com traços de primata arcaico.

## O diagnóstico

Não era a descrição, nem a edição manual do código. Era um buraco no formato.

Os 36 genes por táxon criados na Fase 3 (v25) — `glandulaMamaria`,
`pelagemDensidade`, `dentesTipo`, `termorregulacao`, `gestacao`, `escamaTipo`,
`folhaTipo`, `paredeCelularTipo` e os demais — eram sorteados normalmente em
`runSpeciesSteps`, apareciam na prosa e no prompt de imagem, **mas nunca eram
escritos por `serialize()`**. Só existiam em memória enquanto a espécie estava
aberta na sessão.

Consequência: todo caminho que passa pelo código DRN2 em texto — busca por DNA
colado, trilha reversa, montador manual, importação de alvo — perdia esses
genes e os **ressorteava do zero** na volta.

Medido no código exato do relato: o mamífero voltava com
`termorregulacao = ectotermia residual` e `gestacao = placentária curta`, sem
que nenhuma edição tivesse pedido isso. Um mamífero de sangue frio com gestação
curta é, em prosa, exatamente a descrição de um hominídeo arcaico — e era isso
que chegava ao gerador de imagem.

O pior do bug era ser **invisível e incorrigível pela edição**: o campo não
estava no código, então não havia o que consertar editando.

## A correção

### Bloco `TXN` no código

`serialize()` passa a escrever um bloco final com os genes de táxon da espécie:

```
…-DEF:0.1.fu-TXN:fa.0.hc.el.pl
```

O bloco é **posicional**, sem rótulo por gene: a ordem é derivada de `classe`,
que já vem em `TAX` no início do código e é unívoca (as 7 classes animais mais
`VEG`, `FUN`, `MIC`). Isso mantém a notação enxuta, no mesmo espírito do resto
do DRN2.

O bloco só aparece quando a espécie de fato tem genes daquele grupo — fora do
grupo eles são `undefined`, e a ausência do bloco é a informação correta.

### Coerção por tipo de tabela

Genes categóricos de valor numérico (`tentaculosQtd`: 0/2/8/10/99) voltavam como
string e `fixarEspelhoRaw` não os encontrava no índice da tabela — o gene era
ressorteado de novo, mesmo sintoma que o bloco veio curar. A coerção agora
segue o tipo real da tabela, não uma lista de nomes.

### Os genes de táxon entram no DL

`DL_PESOS` passou a incluir os 36. Sem isso, "bate 100% no alvo" continuaria
significando "bate em tudo **menos** neles" — que é a mesma promessa quebrada
que a v26 corrigiu para os outros campos.

### Retrocompatibilidade

Códigos anteriores à v38 (sem bloco `TXN`) continuam válidos e decodificam
normalmente. Sem o bloco, os genes de táxon seguem sendo sorteados — que é o
comportamento antigo, e o único honesto, já que a informação de fato não está
naquele código.

## Testes

Nova suíte **HH · Genes por táxon no código (TXN)**, `nivel: rapida`:

| Checagem | Resultado |
|---|---|
| Round-trip dos genes de táxon | 500 espécies, **0 divergências** |
| Bloco presente exatamente quando devido | faltando=0, sobrando=0 |
| Código pré-v38 ainda decodifica | OK |
| Genes de táxon contam no DL | 36/36 |
| Categórico numérico volta como número | 25 moluscos, 0 erros |

Cobertura da amostra por grupo: MAM 127, AVE 71, REP 70, VEG 69, MIC 38,
FUN 35, AMP 31, INS 29, MOL 18, PSC 12 — os 10 grupos.

Bateria completa: **166 checagens, 0 falhas** (as 4 falhas visíveis no runner
Node são dos arquivos JSX que o Node não carrega — idênticas na v37 sem
modificação, portanto ambientais e não regressões).

## Limitação conhecida, não corrigida

O sistema continua sem vocabulário para "pele nua": todo Mamífero é descrito
como "revestido por pelo", e a única gradação é a densidade. Para um humano,
`pelagemDensidade: 0` é o mais próximo disponível, e a prosa ainda dirá
"revestido por pelo, densidade muito baixo". Resolver isso exige um valor novo
na tabela de `tegTipo` (ou um gene de "pele glabra"), o que é mudança de
conteúdo do DNA, não de formato — fica para uma versão futura, se você quiser.
