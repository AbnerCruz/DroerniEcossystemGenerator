# v19 — Árvore genealógica navegável

## Painel de espécies (Fase 3)

A grade plana de cards agrupada por primordial virou uma **árvore genealógica de
verdade**: cada primordial é a raiz, e os filhos aparecem recuados abaixo dela,
recursivamente, até a ponta viva de cada linhagem. Clicar em qualquer nó — em
qualquer geração — abre o painel daquela espécie.

- Profundidade 0 e 1 vêm sempre abertas; a partir da 2ª geração a árvore nasce
  recolhida, e o usuário expande sob demanda. Sem isso, uma linhagem de centenas de
  nós (a deriva permite até 3.000) renderizaria tudo de uma vez e travaria a aba.
- Um alternador **Árvore / Lista** foi adicionado — a grade de cards antiga continua
  disponível para quem quer varrer rapidamente todas as espécies sem navegar a
  hierarquia.

## Painel do indivíduo (SpeciesViewer)

Duas seções novas, usando funções que já existiam prontas no motor
(`caminhoAtePrimordial`) e uma nova (`irmaos`), nenhuma delas chamada até agora:

- **Linhagem até a primordial** — a cadeia completa de ancestrais, da raiz até a
  espécie aberta, como uma trilha clicável. Clicar em qualquer ancestral da cadeia
  abre o painel dele, sem fechar o modal.
- **Parentesco de primeiro grau** — irmãos (outras espécies com o mesmo ancestral
  direto), também clicáveis. Só aparece quando existem — uma primordial nunca tem
  irmãos, por definição.

O link "Ancestral" já existente também passou a ser clicável, navegando para o pai
sem fechar o painel.

## Nota técnica

`irmaos(nodeId, idx)` deriva o parentesco lateral na hora, a partir de `pais[0]` do
nó e dos `filhos` do pai — a árvore nunca guardou um campo "irmãos" separado, então
não há dado novo para manter sincronizado.
