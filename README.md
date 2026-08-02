# Droerni · Ecossistema DRN2 v24

## Estrutura (tudo na raiz — de propósito)

Tudo fica solto na raiz do projeto, sem subpastas, porque assim dá pra
fazer upload direto pelo app do GitHub no celular (que aceita selecionar
vários arquivos de uma vez, mas não upload de pasta).

```
index.html               shell — carrega tudo via <script src>, em ordem
01-core-motor.js         motor DRN2 (seed Feistel, genes, travas, deriva/especiação, habitat, geografia/eras, populações e seleção natural populacional, prompt de imagem, decodificação de seed)
02-coerencia.js          peso/calorias derivados + REGRAS_COERENCIA
03-zip.js                writer de .zip puro em JS (sem libs externas)
04-ui-fases.js           ícones, helpers de UI, Fase 1 (Geografia) e Fase 2 (Eras)
05-ui-especie.js         SpeciesEditor (criar/editar) e SpeciesViewer (modal)
06-ui-biologia.js        Fase 3 (Biologia), geração de ecossistema, seleção natural populacional, log
07-exports.js            os 4 exporters + barra de persistência (projeto .json)
08-patchnotes.js         painel de patchnotes (lê patchnotes-manifest.json)
09-populacao-seed.js     IndividualViewer, prompt de imagem, busca por seed
10-app.js                App() principal — junta tudo
patchnotes-manifest.json lista de versões — [0] é sempre a aberta por padrão
patchnotes-v17.md        changelog da v17
```

Nenhum build step: os arquivos `.js` são JSX puro, transformados no navegador pelo Babel Standalone (carregado via CDN no `index.html`). Editar qualquer arquivo e dar refresh já reflete a mudança.

## Subir pelo celular (GitHub mobile / app)

1. No repositório, "Add file" → "Upload files".
2. Selecione TODOS os arquivos de uma vez (o seletor de arquivos do celular deixa marcar múltiplos) — `index.html`, todos os `.js`, o `.json` e o `.md`.
3. Commit. Como está tudo na raiz, não tem problema de "upload de pasta" — são só arquivos soltos.
4. Ative GitHub Pages (Settings → Pages → Branch: main → pasta `/root`).

## Rodar localmente (desktop)

`fetch()` (usado pelo Babel pra buscar cada `src`, e pelos patchnotes pra buscar `patchnotes-manifest.json`/`.md`) é bloqueado por CORS se você abrir o `index.html` direto do disco (`file://`). Sirva por http:

```
cd droerni-app
python3 -m http.server 8000
```

e abra `http://localhost:8000`.

## Publicar no GitHub Pages

Já serve por https, funciona sem configuração extra depois do upload.

## Adicionar um patchnote novo

1. Crie `patchnotes-vXX.md` na raiz com o changelog em Markdown.
2. Abra `patchnotes-manifest.json` e adicione uma entrada **no topo** da lista:

```json
{ "id": "v18", "titulo": "v18", "data": "2026-09-01", "arquivo": "patchnotes-v18.md" }
```

O item `[0]` do array é sempre o que abre por padrão — não precisa mexer em nenhum código, só no manifest.
