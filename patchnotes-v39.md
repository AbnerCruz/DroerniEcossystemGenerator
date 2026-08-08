# v39 — Genes diagnósticos, âncora de gestalt e um bug de deriva de longa data

## A pergunta que originou a versão

"Quanto mais genes, mais preciso, certo?"

Não. Mais genes aumentam **resolução**; o que faltava era **poder
discriminante**. O DRN2 descrevia bem "primata bípede" e parava ali —
nenhum dos seus ~107 genes separava *Homo sapiens* de um australopiteco,
porque todos descreviam traços que os dois compartilham.

Esta versão acrescenta **16 genes**, não 100. O critério de admissão foi
duplo e estreito: o gene tem de (a) separar sapiens de símio e (b) ter
representação visual direta. Genes sem as duas propriedades ficaram de
fora de propósito — cada gene custa espaço de seed, ciclo de deriva e uma
exigência a mais na busca por DNA-alvo.

## Os 12 diagnósticos de mamífero

| Gene | Eixo |
|---|---|
| `facPrognatismo` | face vertical ↔ projetada |
| `crnMento` | queixo ausente ↔ projetado |
| `crnToro` | arcada superciliar ausente ↔ maciça |
| `crnAbobada` | crânio baixo e recuado ↔ alto e globular |
| `facNariz` | narinas rasas ↔ nariz externo |
| `facEsclera` | olho uniformemente escuro ↔ branco visível |
| `memRazao` | braço > perna ↔ perna > braço |
| `memPreensao` | nenhuma ↔ de força ↔ de precisão |
| `locPostura` | quadrúpede ↔ bípede facultativa ↔ ereta obrigatória |
| `vocAparato` | chamados ↔ modulado ↔ articulado |
| `pelSudorese` | escalar 0–9 (glândulas écrinas) |
| `dimorfismo` | escalar 0–9 |

### Decisão de escopo: toda a classe MAM, não só crânio humanoide

Travar os genes em `crnFormato === "hu"` pareceria mais limpo e economizaria
campos. Mas quebraria a evolução: os genes não existiriam até o crânio já
ser humanoide, e **nenhuma linhagem poderia derivar em direção a um rosto
humano** — só teria os genes depois de já ter chegado lá.

O crânio humanoide portanto **enviesa**, não trava. Medido: crânio
humanoide dá média 2,8 de 6 traços sapiens contra 1,6 dos demais, e
167 de 400 crânios humanoides ainda saem arcaicos. A evolução tem de
trabalhar pelo resultado — que é o comportamento correto.

## Um gene de alto sinal por reino não-animal

- **`modoTrofico`** (fungo) — saprófita / micorrízico / parasita /
  liquenizado. Era a lacuna mais grave do sistema: três ecologias
  inteiramente distintas tratadas como o mesmo organismo.
- **`arquiteturaCresc`** (planta) — herbácea / arbustiva / arbórea /
  trepadeira / suculenta / rastejante. Havia `porte` (tamanho), não havia
  forma de ocupar o espaço.
- **`motilidade`** e **`respiracaoO2`** (bactéria) — flagelada, ciliada,
  deslizante ou imóvel; aeróbia, anaeróbia estrita ou facultativa.

## A camada que nenhum gene resolveria

Metade do problema não era genética, era **vocabulário**:

- **"focinho"** — a palavra, sozinha, faz um gerador de imagem desenhar
  focinho, mesmo qualificada como "plano". Crânio humanoide passa a usar
  "perfil facial". O resto do bestiário continua com focinho, que ali é a
  palavra certa.
- **"revestido por couro nu"** era uma contradição literal, e "revestido
  por pelo" com densidade 0 era outra. O verbo agora acompanha o
  tegumento, e a frase de mamífero para de citar pelagem quando não há.
- **Âncora de gestalt** — a descrição era uma lista de traços e nunca
  dizia o que a criatura *é*. Um gerador que recebe só traços monta o
  bicho a partir do protótipo mais próximo que conhece, e "mamífero bípede
  de mão preênsil" tem como protótipo um símio. O prompt agora abre
  nomeando o conjunto, com negação explícita de símio e hominídeo.

  A âncora é **derivada, não um gene**: conta quantos diagnósticos
  convergem e nomeia o resultado (≥9 sapiens pleno, ≥6 humano arcaico,
  ≥3 hominídeo). Ela nunca contradiz o genoma — um genoma com arcada
  maciça e face prognata simplesmente não recebe a âncora de humano
  moderno, e a suíte testa exatamente isso.

## Bug antigo descoberto: metade dos genes nunca sofria deriva

A suíte nova mediu **0 de 12 diagnósticos alcançados em 720 ciclos**. A
causa não eram os genes novos.

`sortGeneAlvo()` tinha os limites de sorteio **fixos em código** — 11, 26 e
18 — que eram os tamanhos das listas de estrato na versão em que a função
foi escrita, e nunca foram atualizados quando as listas cresceram. Os
tamanhos reais hoje são **12, 66 e 29**.

Consequência: os genes das posições 27–66 do Estrato II e 19–29 do
Estrato III **nunca eram sorteados pela deriva**. Na prática, os 36 genes
por táxon da Fase 3 (v25) jamais sofreram deriva em versão nenhuma — eram
gerados na criação da espécie e congelavam para sempre. O último gene do
Estrato I também estava fora.

Corrigido: o limite agora sai de `.length`, então nenhuma adição futura
volta a cair nesse buraco em silêncio. Depois da correção: **12/12
diagnósticos alcançados**.

## Travas condicionais centralizadas

Na primeira tentativa as travas novas (preensão exige braço, postura
concorda com locomoção, fala exige cognição, sudorese cai sob pelo denso)
viviam só no passo de construção. A suíte D7 pegou de imediato: 1 a 3
genomas infiéis em 300 — a deriva rerrolava na tabela inteira e produzia
mamífero sem braços com "preensão de precisão".

É a regra que o próprio código já enunciava na v28: *uma trava só é
confiável quando os dois caminhos que escrevem o gene a respeitam*. Criada
`opcoesCondicionais()` / `opcoesGene()`, consultada tanto por
`runSpeciesSteps` quanto por `rerollGeneCategorico`, e o teto condicional
de `pelSudorese` mudou-se para `limitesEscalar()`, que a deriva já lia.

## Compatibilidade

Os 12 diagnósticos entram no **fim** da lista `MAM` do bloco `TXN`, nunca
no meio: a posição é o que identifica o gene, então inserir no meio
invalidaria todo código DRN2 já anotado. Códigos v38 continuam decodificando
— simplesmente não trazem os campos novos.

## Testes

Nova suíte **II · Genes diagnósticos e gestalt**, 14 checagens:

| Checagem | Resultado |
|---|---|
| Todo mamífero carrega os 12 | 95 mamíferos, 0 incompletos |
| Nenhum não-mamífero os carrega | 305 amostras, 0 vazamentos |
| Preensão e postura coerentes | 0 incoerências |
| Crânio humanoide enviesa | 2,81 vs 1,61 de 6 |
| O viés não é trava | 167/400 ainda saem arcaicos |
| Round-trip pelo código | 200 mamíferos, 0 divergências |
| Sem "focinho" em crânio humanoide | 200 amostras, 0 ocorrências |
| Tegumento nu sem pelagem | 0 contradições |
| Âncora dispara e nega símio | OK |
| Genoma arcaico NÃO recebe âncora humana | OK |
| Genes novos nos 3 reinos | 0 faltando |
| Deriva alcança os diagnósticos | **12/12** |

Bateria completa: **185 checagens, 0 falhas reais**, estável em 4 rodadas.
(As 3 falhas visíveis no runner Node são dos arquivos JSX que o Node não
carrega — presentes de forma idêntica no baseline sem modificação.)

## Novo preset: "Humano (Homo sapiens)"

O preset "Humanoide" antigo chega a hominídeo e para: não fixa nenhum
diagnóstico, então o resultado oscila entre sapiens e australopiteco. O
preset novo fixa os doze mais o tegumento nu.

```
DRN2-TAX:An.MAM-MOR:md.5.bi.0.pr-LOC:B.0.5-MEM:2S.2I.0X.mo.pr-TEG:Cr.Mrr4.ls.6-CRN:0.0.hu.pr-FAC:rd.pl.2rd.mx-DIE:on.7.0-MAG:A0-SEN:6.2.5.6.0-REP:vv.1.7.7-TOL:ms.tp.di-SOC:ba.3.9-DEF:0.3.fu-TXN:fa.0.hc.el.pl.or.pj.au.gl.pj.vi.pn.pc.er.ar.8.2
```

## Limitação remanescente

`tegCor` continua sendo uma paleta zoológica: não há tom de pele humano, e
"marrom" segue sendo a opção menos artificial. Resolver bem exigiria separar
cor de tegumento de cor de pelagem — mudança que atinge todos os reinos e
merece versão própria.
