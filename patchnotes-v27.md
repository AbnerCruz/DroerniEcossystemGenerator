# v27 — Busca por DNA, trilha reversa, lupa no painel do indivíduo e histórico em PDF

Quatro pedidos, mais os testes que garantem que nenhum deles quebrou o resto.
Bateria: **74 checagens, 0 falhas** (era 54 na v26; as 20 novas cobrem o que esta versão adiciona).

---

## 1 · A busca aceita o DNA, não só a seed

A caixa de busca entendia dois formatos: seed numérica e texto livre. Faltava justamente o terceiro — o
próprio **código DRN2**, que é o que o app mostra em todo lugar (visor de espécie, visor de indivíduo, log,
card da árvore, ficha do Obsidian) e portanto o que mais se tem à mão pra colar de volta.

Pior: um código DRN2 tem letras, então caía na rota de "texto livre" e virava uma criatura **aleatória sem
nenhuma relação** com o DNA colado — falhava em silêncio, parecendo funcionar.

Agora os três formatos são reconhecidos automaticamente. Colando um DNA, o app:

- reconstrói o genoma inteiro (`decodificarDNAColado`);
- **calcula a seed correspondente**, que aparece num campo próprio pra copiar — ou seja, dá pra converter
  DNA → seed sem passar por lugar nenhum;
- avisa quando o código descreve uma combinação que as travas do sistema não sustentam (código editado à
  mão, ou vindo de versão antiga), listando exatamente quais genes divergiram.

O código DRN2 não carrega o marcador de primordial — isso vive no primeiro dígito da seed — então o
espécime reconstruído é tratado como derivado, que é o caso de qualquer DNA copiado da árvore.

**Medido: 600 de 600 códigos reconstruídos sem uma única divergência**, com ou sem o prefixo `DRN2-`,
com ou sem espaços em volta. E a seed devolvida reconstrói o mesmo espécime em 200/200.

Chegar nesse número exigiu duas correções no motor que valem por si:

- **Genes derivados.** `socSenciencia` aparece no código DRN2 mas é *calculado* a partir de
  `socSencienciaBruta`. Escrevê-lo direto não adianta: a normalização seguinte o recalcula da fonte e
  desfaz. Divergia em 168 de 300 reconstruções. Agora o ajuste é feito na fonte, pelo delta.
- **Campos-espelho.** `memInf` é gravado por `rawStep` sob outra chave (`memInfRaw`), que não é
  serializada. Escrever só o campo visível deixava o espelho vazio e a normalização ressorteava — 5% de
  divergência, exatamente a chance de o sorteio não repetir o valor. Agora os dois são fixados juntos.

---

## 2 · A trilha agora anda para trás

A busca de trilha só ia num sentido: partia de uma espécie e andava **para frente** até um DNA-alvo colado.
Faltava a pergunta inversa — *de onde este espécime pode ter vindo*.

O painel de espécie ganhou um seletor de sentido:

- **Adiante (até um DNA-alvo)** — o comportamento de sempre.
- **Para trás (de onde veio)** — sorteia um ancestral primordial (bactéria, como manda a Fase 2) e devolve
  uma trilha de deriva que realmente chega neste espécime, com o DNA do ancestral proposto exibido e
  copiável.

**Não existe "a" trilha certa, e o app diz isso na cara.** A deriva descarta informação: caminhos diferentes
chegam ao mesmo genoma, então o passado não é recuperável a partir do presente. O que dá pra garantir — e é
o que a função garante — é que a trilha devolvida é **válida** e chega exatamente no alvo. Por isso o botão
vira "Sortear outra" depois da primeira busca: rodar de novo dá outra linhagem, igualmente legítima.

A trilha reversa reaproveita a busca dirigida da v26, então herda o "bate 100%". Ela testa 3 ancestrais e
devolve o que produziu a linhagem mais curta — uma história mais econômica é mais plausível. A trilha
resultante é copiável e colável no campo de importação ao criar um primordial novo, igual à trilha adiante.

**Medido: 12 de 12 linhagens reconstruídas chegam ao código exato do espécime**, em 28 a 78 ciclos
(mediana 54), ~760ms cada.

Dois bugs de motor só apareceram aqui, porque só a trilha reversa parte de uma bactéria primordial:

- **A trava do primordial revertia o reino.** O genoma de trabalho carregava `isPrimordial: true`, e toda
  normalização reaplicava "primordial nasce bactéria", devolvendo `reino` para `Ba`. Resultado: `reino`
  residual em 12 de 12 buscas. Uma trilha produz um *descendente*, não a origem de novo — agora o genoma de
  trabalho deixa de ser primordial no primeiro passo.
- **A barreira de reino era estrita demais na fase dirigida.** A regra é "só bactéria pode ressortear
  reino", o que vale por ciclo — mas uma linhagem que *começou* bactéria pode legitimamente chegar a
  qualquer reino. A busca agora guarda se a origem era bacteriana e permite a correção nesse caso.

---

## 3 · A lupa também dentro do painel do indivíduo

Adicionada, não movida — o botão do topo continua onde estava, já que aquele lugar também é útil.

Estando com um espécime aberto é justamente quando dá vontade de colar a seed ou o DNA de outro pra
comparar, e antes era preciso fechar o painel e voltar ao topo. O painel do indivíduo ganhou:

- a **lupa no cabeçalho**, que abre a busca vazia;
- o botão **"Abrir na busca"** no rodapé, que abre a busca já preenchida com o DNA daquele indivíduo.

---

## 4 · Registros históricos em PDF

`Histórico (.txt)` e `História Global (.txt)` viraram `.pdf`.

O gerador de PDF é **próprio** (`criarPdfTexto`, em `03-zip.js`, ao lado do gerador de ZIP que já era feito
à mão). Poderia ter entrado uma biblioteca via CDN, mas isso contraria dois compromissos do projeto: não há
build step, e cada dependência nova é mais uma coisa que pode sumir da rede no meio de uma sessão. E o que
se precisa aqui é modesto: texto monoespaçado paginado, sem imagens.

Especificação: PDF 1.4, A4, Courier base-14 (não precisa embutir fonte — todo leitor já tem), uma stream de
conteúdo por página, xref clássico, cabeçalho repetido e rodapé com "página N de M" e data de geração.
Quebra de linha preserva a indentação original e corta palavras gigantes (códigos DNA, seeds) sem estourar
a margem.

**Limitação conhecida e tratada:** as fontes base-14 usam WinAnsiEncoding, que cobre o português inteiro
(á, ç, ã, õ, ê) mas não cobre os caracteres de desenho de caixa que os relatórios usavam (`═ │ ├ └ ─`).
Eles são transliterados para ASCII na entrada; numa fonte monoespaçada o resultado visual é praticamente o
mesmo. Qualquer caractere acima de U+00FF vira `?` em vez de corromper o arquivo.

A bateria valida a estrutura do arquivo, não só que ele foi gerado: `%PDF` e `%%EOF` no lugar, paginação
real (32 páginas para 300 eventos), `startxref` apontando para a tabela, **todos os 67 offsets do xref
caindo no início de um objeto de verdade**, acentuação preservada em latin-1 e nenhum caractere cru fora da
codificação.

---

## Testes novos

Três suítes acrescentadas (`suites/07-busca-dna.js`), 20 checagens:

- **L · Busca por DNA** — reconstrução em três formatos de entrada, seed correspondente, reconhecimento de
  formato (e o inverso: seed e texto livre *não* podem ser confundidos com DNA), e resistência a códigos
  truncados.
- **M · Trilha reversa** — chega no código exato, o ancestral é sempre primordial bactéria, rodar de novo
  devolve outra trilha (senão a promessa de "uma das possíveis" seria falsa) e entrada inválida é rejeitada.
- **N · Export em PDF** — estrutura, paginação, integridade do xref, encoding e casos de borda (texto vazio,
  palavra de 4000 caracteres).
