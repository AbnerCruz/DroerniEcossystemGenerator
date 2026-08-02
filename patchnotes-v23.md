# v23 — Populações de indivíduos, seleção natural por indivíduo, busca por seed e prompt de imagem

## 1. Busca por seed + painel do espécime/indivíduo

Faltava completamente: não havia como colar uma seed (de espécie, ou a seed
colada espécie+indivíduo) e ver o que ela endereça. Agora o botão de lupa no
cabeçalho abre **Buscar por Seed**: cola o texto, decodifica (o motor já
tinha `gluedSeedText`/`splitGluedSeed`/`buildIndividual` prontos — só nunca
tinham sido ligados a uma tela) e mostra descrição, peso/calorias, atributos
do indivíduo (se a seed colada incluía um) e o DNA completo — sem precisar
que aquele espécime já exista na árvore atual. Se a seed foi decodificada
como "Primordial", dá pra confirmar e adicionar de verdade ao mundo.

## 2. Painel dedicado de indivíduo (antes: indivíduo gerado "sumia")

Gerar um indivíduo só entrava, silencioso, numa lista dentro do visor de
espécie — não abria nada, e a lista não mostrava o genoma completo nem
anomalias. Agora "Novo Indivíduo" abre imediatamente um painel dedicado
(**IndividualViewer**) com todos os 6 atributos (base + variado), genoma
completo do indivíduo, anomalias e o prompt de imagem. Os indivíduos
listados dentro do visor de espécie também viraram clicáveis, abrindo o
mesmo painel.

## 3. Prompt de geração de imagem

Botão **Gerar Prompt de Imagem**, disponível tanto no visor de espécie
quanto no de indivíduo. Reaproveita a descrição em prosa já existente
(fiel ao genoma) e monta um prompt pronto pra colar em qualquer IA de
imagem: diretivas de estilo/composição/negative prompt em inglês (é o que
a maioria dos geradores interpreta melhor), descrição da criatura em
português, e — quando há um indivíduo — os traços que tornam ESSE
espécime diferente da média da espécie (cor própria, anomalias, atributo
que mais se destaca).

## 4. Populações de indivíduos espalhadas pelo mundo

Toda espécie nova — primordial manual, clone, ou nascida por deriva/
ecossistema — agora ganha automaticamente uma população de indivíduos
(`gerarPopulacaoParaEspecie`), espalhados por um espaço simulado de 8
"divisões" da massa de terra em que ela nasceu. Não é geografia real: é
só um índice que decide quais indivíduos estão perto o bastante pra
colidir entre si na seleção natural (item 5).

## 5. Seleção natural agora é por indivíduo, não por "quem existe agora"

**Causa raiz do botão "Recalcular Interações" parecer não fazer nada na
árvore:** ele de fato só mudava genoma (nunca a estrutura da árvore — só
existem novos nós por deriva/ecossistema), então clicar nele nunca deveria
mexer nos galhos mesmo. O problema real era mais profundo: a leitura de
"quem interage com quem" olhava só o AU mais recente de cada massa,
ignorando completamente onde os indivíduos de cada espécie realmente
estavam.

O botão virou **Rodar Seleção Natural** e passa a perguntar quantos ciclos
rodar (igual ao "Derivar"). Cada ciclo agrupa os indivíduos VIVOS por massa
de terra + divisão simulada; toda divisão onde indivíduos de espécies
diferentes coexistem é uma colisão de população. Em cada colisão: a espécie
perdedora sofre a mesma pressão genética de sempre (2 minirrodadas de
`aplicarCicloDeriva`, mecanismo intocado desde a v22) e perde metade dos
indivíduos daquela divisão; a vencedora ganha um indivíduo novo ali, até um
teto de 10 por divisão. O "ano atual" do mundo avança 0.1 AU (100 mil anos)
por ciclo rodado.

**Automático na geração de ecossistema:** depois de gerar as espécies, o
app agora espalha as populações e roda 20 ciclos de seleção natural
sozinho, terminando com a árvore e o "ano atual" já atualizados — "gerar
espécies" deixou de ser um passo isolado de "ter indivíduos" e "rodar
seleção natural".

## 6. Ano atual do mundo

Novo indicador **Ano atual** no painel de Biologia, em AU. Sobe quando uma
espécie nasce numa data mais recente e quando ciclos de seleção natural
populacional avançam a linha do tempo. Persiste no export/import do
projeto (.json).

## Reorganização de arquivos

Novo arquivo `09-populacao-seed.js` (visor de indivíduo, prompt de imagem,
busca por seed). `09-app.js` virou `10-app.js` pra manter a ordem de
carregamento visível nos nomes dos arquivos — sem mudança de conteúdo além
do wiring das features acima.
