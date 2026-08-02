# v17 — 2026-08-01

Reescrita da UI sobre o motor DRN2 inteiro (portado do v16), com fluxo linear travado e coerência bloqueadora.

## Novo

- **Fluxo em 3 fases travadas**: Geografia → Eras Geológicas → Biologia. Cada fase bloqueia a próxima até ser confirmada.
- **Peso e calorias derivados**: altura de referência por porte × densidade real (kg/m³) → peso; calorias/dia por escala alométrica (lei de Kleiber, `70 × peso^0.75`), não linear — evita absurdos como um dragão titânico "comendo" centenas de milhões de kcal/dia.
- **Validação de coerência bloqueadora**: crânio ausente ↔ dentição/focinho, herbívoro ↔ presas, aquático obrigatório ↔ asas/voo. Erros bloqueiam a confirmação; avisos (ex.: porte colossal com densidade muito baixa) não bloqueiam mas ficam visíveis, com botão de correção automática em ambos os casos.
- **Editor de espécie unificado**: mesmo componente pra criar primordial e editar espécie existente. Cada campo alterado roda o motor inteiro de novo (`buildSpecies`) sobre o genoma anterior + a mudança — as travas de classe resolvem sozinhas o que ficou incompatível.
- **SpeciesViewer**: modal com DNA, descrição em prosa, peso/calorias, habitat derivado, ancestral/descendentes, indivíduos, e ações (copiar DNA, exportar .md, derivar, novo indivíduo, clonar, editar, deletar).
- **Exports robustos**:
  - Histórico de eventos (.txt)
  - História evolutiva global (.txt) — árvore por primordial + estatísticas
  - Fichas Obsidian — **.zip real** (writer de ZIP puro em JS, método STORED, testado com `unzip`/`zipfile`), uma nota .md por espécie
  - Projeto completo (.json) — export/import, com fix de serialização de `BigInt` (seeds) pra string
- **Geração de ecossistema**: N primordiais em massas aleatórias da era atual, cada um derivado por um número aleatório de ciclos (15–35 por padrão — abaixo disso a especiação praticamente não acontece, medido em teste).

## Estrutura

App deixou de ser um único arquivo HTML: agora são `index.html` + `01..09-*.js` + `patchnotes-*` — tudo solto na raiz (sem subpastas), pra permitir upload direto pelo GitHub no celular. Ver `README.md` pra rodar localmente e publicar no GitHub Pages.

## Achados durante o desenvolvimento

- O motor original (v16) permitia combinações "aquático obrigatório + asas funcionais" em ~0,27% das gerações — a nova validação pega isso antes de a espécie existir.
- `densidade` (0–9) sempre foi independente de `porte` no motor — por isso dava pra ter criaturas colossais "leves". Isso não foi alterado no motor (manteria a seed incompatível com versões anteriores); em vez disso a validação avisa quando a combinação produz um peso implausível.
