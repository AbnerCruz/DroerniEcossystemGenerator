# v37 — a vida começa na água

Oito relatos desta leva. Cinco tinham causa medível no código; três eram
implementação nova. Cada número abaixo saiu de uma medição real sobre a v36,
não de estimativa.

---

## 1 · Sliders resorteavam a criatura no meio do arrasto

> "percebi um bug nos sliders na construção manual do dna, ao mexer os
> sliders às vezes resorteia uma configuração"

Duas causas somadas. Corrigir só uma deixaria o sintoma vivo.

**Causa A — o ressorteio era aleatório.** `normalizarGenoma` mantém todo gene
que continua válido e RESSORTEIA os que a edição invalidou. O comportamento
está certo; a implementação usava `Math.random()`, então a mesma edição,
repetida, dava resultados diferentes.

**Causa B — um arrasto disparava uma edição por pixel.** `<input type="range">`
emite `onChange` em todo valor intermediário. Ir de 3 a 7 disparava cinco
normalizações, cada uma partindo do resultado da anterior. Mesmo com sorteio
determinístico, o CAMINHO importava: chegar em 7 arrastando dava um genoma
diferente de chegar em 7 direto, e voltar para 3 não devolvia o ponto de
partida.

**Correções.** No motor, `normalizarGenomaEstavel` roda a normalização sob um
gerador semeado por hash do genoma candidato — medido: 0 campos divergentes
entre chamadas idênticas. Na interface, o slider passou a ter valor local
durante o arrasto (a tela responde na hora) e só confirmar ao soltar, com o
número em âmbar e "solte para aplicar" enquanto não confirmou. Uma edição por
gesto em vez de uma por pixel.

**Achado de brinde.** O botão "corrigir" dos avisos de coerência chamava
`recalcular`, função que a v36 removeu: lançava `ReferenceError` e não
corrigia nada. Estava quebrado nos dois editores (espécie e montador).

Também mudou: a edição aplica só o campo tocado, em vez do mapa inteiro de
overrides por cima do genoma atual. Reaplicar overrides antigos ressuscitava
valores que uma trava já tinha revertido.

---

## 2 · Colar um DNA no montador para editar

Campo de colagem no topo do montador, com "Carregar DNA" e "usar o atual".

Escrevi uma leitura própria primeiro e ela errava **66% dos round-trips** —
genes derivados (`socSenciencia` vem de `socSencienciaBruta`), campos-espelho
(`memInf` guarda estado em `memInfRaw`) e anomalias (a quantidade é derivada
de `extremos`; só QUAIS são pode ser fixado).

Descobri que `genomaDeCodigoDRN2` já existe desde a v27 e resolve os três
casos. Trocado por ela: **500 de 500 códigos voltam idênticos**, e usar a
mesma função da busca por DNA garante por construção que colar aqui e colar lá
entendem o mesmo código do mesmo jeito.

Todo gene que vem no código fica **fixado**, senão "resortear os não-fixados"
descartaria o DNA recém-colado.

---

## 3 · Réptil não serpentiforme sem pescoço

Era o único gene craniano sem trava de classe: a tabela dava 15% a "ausente"
para qualquer animal com crânio.

Medido na v36: **526 de 4.000 répteis (13,2%)** saíam sem pescoço sendo
não-serpentiformes.

A regra nova é por plano corporal, e é assimétrica de propósito:

- **Tetrápode** (MAM/AVE/REP/AMP) não-serpentiforme: "ausente" proibido —
  cabeça articulada sobre o tronco, sempre.
- **Peixe, molusco, artrópode**: restrito a ausente/curto — cabeça fundida ou
  cápsula cefálica, sem pescoço verdadeiro. Aqui "ausente" é o valor CORRETO.
- **Serpentiforme**: o viés antigo virou trava (ausente/curto/proporcional) —
  uma serpente de pescoço elongado também não existe.

Depois: **0 de 4.814 tetrápodes**, e os 171 peixes da amostra seguem
corretamente sem pescoço. A bateria verifica também que a deriva não
reintroduz o caso.

---

## 4 · Plantas eternas

> "a longevidade das plantas está bugada? Ela possui predadores? Verificar
> caso de plantas eternas"

**A longevidade não estava bugada.** `repLongevidade` sai com a distribuição
3d4−3 normal, igual a qualquer outro reino. A eternidade vinha de dois buracos
somados no laço de seleção natural — e cada um sozinho já bastaria.

**Buraco 1 — predação excluía vegetais.** `ehPresaAnimal` restringe presa ao
reino An desde a v29. Correção certa na época (um carnívoro "predava" um
arbusto), mas ela fechou uma porta sem abrir a outra: comer planta é
herbivoria, e herbivoria não existia. Nenhum herbívoro jamais pressionou uma
planta.

**Buraco 2 — competição entre plantas sempre empatava.** O vencedor de nicho
saía de `socSenciencia × 2 + locVelocidade`. Planta é séssil (velocidade
travada em 0 pelo reino) e não tem senciência. Medido: **1.405 de 1.405 pares
planta-vs-planta pontuaram 0 contra 0**. Empate retorna `null` — nenhuma
interação, nenhuma pressão, nenhuma morte.

Somados: planta e fungo não podiam perder nada. Não podiam sofrer deriva por
pressão, perder indivíduos nem se extinguir. Eternas.

**Correção, nas duas metades:**

*Herbivoria e fungivoria* viram interação de primeira classe, entre predação e
competição na ordem de avaliação. Vegetal muito tóxico ou muito rígido escapa
— é isso que faz a herbivoria SELECIONAR em vez de só exterminar. Insetívoro
não conta: come inseto, não folha.

*Escore competitivo por reino.* Senciência e velocidade descrevem o que decide
uma disputa entre animais, e só isso. Planta disputa luz (porte × 3),
eficiência fotossintética, longevidade e prole; fungo disputa alcance micelial
e esporulação; bactéria disputa taxa de divisão e tolerância. **O ramo animal é
byte a byte o mesmo da v36** — nenhuma interação entre animais muda de
resultado por causa desta versão, e a bateria verifica isso em 300 amostras.

Depois: de 0% para **30,1%** de pares planta-planta com interação, e de 1 para
**22 escores distintos** entre plantas.

---

## 5 · Unidade AU

> "vamos mudar a ordem de grandeza da unidade AU de milhões para milhares,
> pois a evolução está atingindo a casa dos bilhões"

`AU_EM_ANOS` passou de 10⁶ para **10⁴ — 1 AU = 10.000 anos**. A mesma
simulação que fechava em 3,65 bi anos fecha em **36,5 mi anos**.

Mudança de UNIDADE, não de modelo: nenhum número interno de AU muda, nenhuma
calibração de ciclo muda, nenhuma espécie muda de idade relativa. Projetos da
v36 reimportados continuam válidos — `auSurgimento` é gravado em AU, não em
anos.

`fmtAU` agora **deriva** da constante em vez de repetir os fatores à mão. Era
assim que o erro de fator 1000 da v33 tinha aparecido; agora trocar a unidade
é uma linha, e a tela acompanha sozinha. A bateria trava essa regressão.

---

## 6 · DNAs-alvo, um de cada vez

> "a implementação desejada é colar um DNA e clicar em um botão de adicionar,
> e fazer isso sucessivamente"

Campo + botão "Adicionar" + lista numerada com X por item. A textarea de uma
linha por alvo era ruim exatamente onde o app é usado: no celular, colar um
código longo no fim de um campo multilinha sem apagar a quebra anterior é
operação de precisão. E não dava retorno — só ao gerar se descobria que um
código era inválido, sem dizer qual.

Validação no momento de adicionar, com o motivo na tela, e duplicata recusada.

---

## 7 · Ordem de especiação: água → terra → ar

> "eu gostaria que a ordem de especiação ocorresse conforme foi na realidade,
> com a vida começando na água, depois peixes, algas (e criaturas marinhas no
> geral) e se expandindo a partir dali para a terra e ar"

Até a v36 nada ordenava isso: `tolHidrica`, `classe` e `locPrimario` eram
sorteados livremente desde o primeiro ciclo. Um mundo podia produzir uma ave
antes de um peixe.

**Portão por ANO ABSOLUTO, não por profundidade de linhagem.** Colonização é
evento do MUNDO: duas linhagens independentes chegam à terra na mesma janela
geológica, como aconteceu de verdade. Por profundidade, um ramo precoce sairia
voando enquanto outro ainda estivesse na água.

- **Estágio 0 · Aquático** — bactéria, alga, peixe, molusco, artrópode
  marinho. Sem voo, sem tolerância seca.
- **Estágio 1 · Colonização** — entram anfíbio e réptil, locomoção terrestre,
  tolerâncias úmida e mesófila. Voo ainda não.
- **Estágio 2 · Pleno** — ave, mamífero, voo, xerofilia.

**Permitir não bastou, e isso foi medido.** A primeira versão só liberava
valores conforme o estágio avança. Resultado em três rodadas seguidas: **0
voadores, 0 aves, 0 xerófilos** — o mundo inteiro preso na água, porque
`tolHidrica` e `classe` são genes de Estrato I e quase nunca voltam a ser
sorteados depois de fixados. A permissão chegava, ninguém a usava.

Precisou de uma **escada de conquista**: quando o mundo entra num estágio novo
e a linhagem ainda está no anterior, ela ganha uma chance por ciclo de subir um
degrau. Um degrau por vez, para que a passagem tenha espécies intermediárias em
vez de virar salto. A classe só sobe depois que a tolerância saiu da água
obrigatória — um anfíbio nasce na margem, não dentro de um peixe estritamente
aquático. É essa ordem que produz peixe → anfíbio → réptil → mamífero/ave.

**E nem toda linhagem sai da água**, senão o oceano esvazia — medido na
primeira tentativa: **5 espécies aquáticas em 1.345**. Só ~35% dos segmentos
de linhagem são conquistadores; dos outros sai a fauna marinha remanescente.

Resultado medido (4 primordiais × 150 ciclos):

| classe | 1ª aparição |
|---|---|
| bactéria | AU 0 |
| peixe | AU 461 |
| alga | AU 336 |
| molusco | AU 1.122 |
| réptil | AU 848 |
| anfíbio | AU 888 |
| mamífero | AU 1.669 |
| ave | AU 1.720 |
| 1º voador | AU 4.240 |
| 1º xerófilo | AU 1.800 |

**0 violações em 10.376 espécies** medidas em duas séries.

Um bug encontrado ao apertar essa medição: o portão calculava o AU do ciclo com
a duração do genoma EM DERIVA, enquanto `especiar` data a filha com a duração
do genoma da MÃE. As duas contas divergiam sempre que o reino mudava no meio do
caminho (um ciclo de bactéria custa ordens de grandeza mais que um de animal),
e 2 espécies em 4.228 nasciam com classe de estágio posterior ao próprio AU.
Unificadas as fontes, a divergência deixa de existir por construção.

**O portão não vale para montador, busca por seed nem trilha por DNA-alvo.**
Essas existem para produzir um alvo escolhido, e um portão ali quebraria a
garantia, mantida desde a v26, de que a trilha bate 100% no alvo. Um dragão
pedido por DNA-alvo continua saindo como pedido; o que o portão organiza é o
que o mundo produz sozinho.

Configurável em **Configurações › Ordem de colonização**: ligar/desligar e três
ritmos (precoce ½×, padrão, tardio 2×).

---

## 8 · Performance, logs e PDFs de milhares de páginas

> "a performance está péssima / os logs estão muito grandes, o arquivo pdf de
> historia está chegando a milhares de paginas"

Medido numa geração modesta (4 primordiais × 150 ciclos, modo detalhado):
**14.435 eventos, 8,0 MB de texto, ~2.070 páginas**. 94% eram eventos
`ciclo_deriva` — e eles não são de graça: o modo detalhado **serializa o DNA
duas vezes por ciclo** só para escrever a linha.

**O padrão passou a ser resumido.** 745 eventos, ~107 páginas, 25% mais rápido.
O ciclo a ciclo continua disponível em Configurações › Detalhe do log. O que
muda a árvore — primordial, especiação, extinção, seleção, migração — é logado
sempre, nos dois modos.

**Clone seletivo depois da seleção natural.** A interface fazia
`prev.map(n => ({...n}))` para o React ver os genomas mutados em lugar — clona
TODOS os nós, troca a referência de cada um e **anula o `React.memo` que a v34
colocou em `NodeArvore`** justamente para não repintar a árvore inteira. A
otimização da v34 estava sendo desfeita a cada rodada, no momento em que há
mais nós na tela. Agora o motor devolve o conjunto exato de espécies alteradas
e só essas trocam de referência.

**Exports com escopo e estimativa.** Os três botões viraram um painel que
mostra o número de páginas ANTES de baixar, e a estimativa reage à escolha:

- **Marcos** — primordiais, especiações e extinções.
- **Estrutural** (padrão) — marcos + seleção natural, migração e edições.
- **Completo** — tudo, inclusive o ciclo a ciclo.

Os recortes são por sentido, não por tamanho: cortar pelos últimos N eventos
entregaria o fim da história sem o começo. A história global ganhou
profundidade de árvore (2/4/8/sem limite) e filtro "só linhagens vivas" — sem
isso, um mundo no teto de 12.000 espécies gera 12.000 linhas antes de qualquer
outra coisa.

**Benchmark contra a v36**, três rodadas idênticas de 4×150:

| | v36 | v37 |
|---|---|---|
| tempo total | 6.469 ms | 5.181 ms |
| ms por espécie | 1,99 | 1,45 |

---

## Bateria de testes

217 checagens, **0 falhas em 5 rodadas seguidas**. Seis suítes novas:

- **DD** ordem de colonização — portão por estágio, portão fechado fora da
  deriva, ordem observada, fauna aquática sobrevivente, desligar volta ao
  comportamento livre
- **EE** vegetais mortais — variância do escore por reino, fim do empate,
  herbivoria, escape por defesa, ramo animal inalterado, pressão sobre
  vegetais ponta a ponta
- **FF** pescoço por plano corporal — incluindo a deriva não reintroduzindo
- **GG** colagem de DNA — round-trip e entrada inválida
- **HH** volume de log e escopo de PDF
- **II** unidade AU e formatação

Duas checagens antigas foram corrigidas porque **a asserção estava errada sobre
o motor**, não o motor sobre a asserção:

- **CC4** afirmava que molusco só aceita `0S` para membros superiores. Medido
  na v37 e na v36, mesmo resultado: 0S em 96,5%, **2S em 3,5% nas duas**. O
  motor sempre permitiu o plano cefalópode; a asserção rígida reprovava ~1
  rodada em 3 sem nada estar errado. Passou a exigir `0S` disponível e nenhum
  plano de vertebrado.
- **EE6** (nova) exigia extinção de vegetal, um desfecho estocástico que falhava
  quando a rodada gerava poucos vegetais. Passou a medir o MECANISMO — vegetal
  aparecendo como perdedor — mantendo a extinção como informação.

### Limitação assumida

O round-trip de colagem é 100% em todos os reinos e classes **exceto ~1 em
4.000 aves**, que volta com a senciência 1 ponto abaixo (`SOC:so.4.5` →
`SOC:so.4.4`). A causa é estrutural: `socSenciencia` é derivada de
`socSencienciaBruta` com penalidade craniana e piso por magia, e o código DRN2
carrega só o valor derivado. Quando o valor cai exatamente sobre um piso ou
teto, o delta não tem para onde ir. É a mesma limitação que fez
`GENES_SEMPRE_DERIVADOS` existir na v27. A asserção é 99,5% e o resíduo fica
medido e visível, não escondido.

### Efeito colateral registrado

A conquista de ambiente força especiação — uma mudança de gene de Estrato I
merece um nó novo. Isso faz o mundo crescer mais rápido que na v36 (de ~1.100
para ~2.000 espécies na mesma carga). É coerente com o pedido, mas é uma
mudança de comportamento e está aqui para não passar despercebida. Se preferir
que a conquista não conte como especiação, é uma linha.
