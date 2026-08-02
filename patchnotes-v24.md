# v24 — Seed autossuficiente: primordial/derivada deixa de precisar ser informado

## O problema

Na v23, a busca por seed pedia pra você dizer se a seed era de uma espécie
primordial ou derivada antes de decodificar. Isso existia porque
`isPrimordial` nunca é um gene "rolado" — é um parâmetro que o motor recebe
de fora, usado só pra decidir algumas travas durante a geração (nível
máximo de magia, se pode ter crânio humanoide, se pode ter mente coletiva).
Como ele não fica guardado nos dígitos de dados, não tinha como recuperá-lo
só a partir da seed — a mesma sequência de dígitos podia, em casos raros,
decodificar diferente dependendo dessa escolha.

## A correção

O 1º dígito de toda seed gerada pelo app agora É a resposta: `1` = espécie
primordial, `0` = derivada. `gluedSeedText` (usada em "Copiar Seed", tanto
na espécie quanto no indivíduo, e na ficha Obsidian exportada) passou a
receber `isPrimordial` e embutir essa flag na frente dos dígitos de dados.
`splitGluedSeed`/`decodificarSeedColada` leem esse dígito primeiro — quem
decodifica não precisa mais informar nada, nem adivinhar.

Como consequência:
- O toggle "Primordial / Derivada" saiu da tela de Buscar por Seed — não
  existe mais escolha manual, só o resultado decodificado (mostrado como
  badge "primordial" ou "derivada").
- O botão "Adicionar ao mundo como primordial" agora aparece com base no
  que a seed *de fato* diz, não numa escolha que podia estar errada.
- Novo botão "Copiar Seed" no visor de espécie (antes só existia a seed
  colada espécie+indivíduo, dentro do visor de indivíduo) — agora dá pra
  copiar a seed de uma espécie sozinha, e ela já é autossuficiente pra
  decodificar de volta sem contexto nenhum.

Sem compatibilidade retroativa com o formato antigo (v23 e anteriores) — o
projeto ainda não tem seeds em uso real, então o formato mudou direto, sem
dígito de versão nem migração.
