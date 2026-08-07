/* ============================================================
   DOWNLOAD HELPERS
   ============================================================ */
function downloadBlob(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
/* v27 — os registros históricos passaram de .txt para .pdf. O gerador de PDF
   é próprio (criarPdfTexto, em 03-zip.js), sem dependência de CDN. */
function downloadPdf(filename, titulo, texto) {
  const bytes = criarPdfTexto(titulo, texto);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function downloadZip(filename, files) {
  const bytes = criarZipStored(files);
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================
   1) HISTÓRICO (.pdf) — cronológico, um bloco por evento
   ============================================================ */
/* v37 — ESCOPO E ESTIMATIVA DE PÁGINAS.

   Relato: "os logs estão muito grandes, o arquivo pdf de história está
   chegando a milhares de páginas". Medido numa geração modesta (4
   primordiais x 150 ciclos, modo detalhado): 14.435 eventos, 8,0 MB de
   texto, ~2.070 páginas. Um PDF assim não é um documento, é um despejo.

   Duas correções, e as duas são necessárias:

   (a) O log em si encolheu — a verbosidade padrão passou a ser "resumido"
       no motor (ver 01-core-motor.js), o que corta 94% dos eventos, que
       eram `ciclo_deriva`.
   (b) O export ganhou ESCOPO. O usuário escolhe o que vai no arquivo, e vê
       a estimativa de páginas ANTES de baixar, em vez de descobrir depois.

   Os escopos não são cortes arbitrários por tamanho: são recortes por
   sentido. "Marcos" responde "o que aconteceu neste mundo"; "estrutural"
   acrescenta as pressões que moveram a evolução; "completo" é o ciclo a
   ciclo, para quem quer auditar a deriva gene a gene. Cortar pelo fim
   (últimos N eventos) seria pior: entregaria o fim da história sem o
   começo. */
const ESCOPOS_HISTORICO = [
  {
    id: "marcos", label: "Marcos",
    desc: "primordiais, especiações e extinções — o que muda a árvore",
    tipos: new Set(["primordial", "especiacao", "especiacao-manual", "extincao"]),
  },
  {
    id: "estrutural", label: "Estrutural",
    desc: "marcos + seleção natural, migração e edições manuais",
    tipos: new Set(["primordial", "especiacao", "especiacao-manual", "extincao",
      "selecao_natural", "selecao_natural_populacao", "migracao", "edicao"]),
  },
  { id: "completo", label: "Completo", desc: "tudo, inclusive o ciclo a ciclo da deriva", tipos: null },
];

function filtrarHistorico(eventLog, escopoId) {
  const escopo = ESCOPOS_HISTORICO.find((e) => e.id === escopoId) || ESCOPOS_HISTORICO[0];
  if (!escopo.tipos) return eventLog;
  return eventLog.filter((e) => escopo.tipos.has(e.tipo));
}

/* Estimativa de páginas do gerador de PDF interno (criarPdfTexto usa
   Courier 9pt: ~92 caracteres por linha, ~58 linhas por página A4). Serve
   para avisar antes, não precisa ser exata. */
const CHARS_POR_LINHA_PDF = 92;
const LINHAS_POR_PAGINA_PDF = 58;
function estimarPaginasHistorico(eventos) {
  let linhas = 4;
  for (const e of eventos) {
    const bruto = `${e.tipoLabel || ""} ${e.linhagemId || ""}\n${e.texto || ""}\n${e.code || ""}`;
    linhas += Math.ceil(bruto.length / CHARS_POR_LINHA_PDF) + 2;
  }
  return Math.max(1, Math.ceil(linhas / LINHAS_POR_PAGINA_PDF));
}

function exportarHistoricoPdf(eventLog, escopoId = "estrutural") {
  const escopo = ESCOPOS_HISTORICO.find((e) => e.id === escopoId) || ESCOPOS_HISTORICO[1];
  const eventos = filtrarHistorico(eventLog, escopo.id);
  const cab = [
    `${eventos.length} evento(s) neste recorte, de ${eventLog.length} registrado(s).`,
    `Escopo: ${escopo.label} — ${escopo.desc}.`,
    "",
  ];
  const corpo = eventos.map((e) => {
    const hora = new Date(e.ts).toLocaleTimeString("pt-BR");
    return `[${hora}] #${e.seq} ${e.tipoLabel}\n  ${e.linhagemId}${e.primordialLinhagem && e.primordialLinhagem !== e.linhagemId ? ` (linhagem de ${e.primordialLinhagem})` : ""}\n  ${e.texto}${e.code ? `\n  DNA: ${e.code}` : ""}`;
  });
  downloadPdf(
    `historico-droerni-${escopo.id}-${new Date().toISOString().slice(0, 10)}.pdf`,
    "HISTORICO DE ACOES - DROERNI ECOSSISTEMA",
    [...cab, ...corpo].join("\n\n")
  );
  return { eventos: eventos.length, paginas: estimarPaginasHistorico(eventos) };
}

/* ============================================================
   2) HISTÓRIA EVOLUTIVA GLOBAL (.pdf) — árvore por primordial
   ============================================================ */
/* Habitat de um nó respeitando a massa de terra em que ele vive. Os
   exports usavam readHabitat (códice inteiro, sem geografia) enquanto a
   interface usava readHabitatNaMassa — a mesma espécie aparecia com
   habitats diferentes na tela e no arquivo exportado. Agora as duas
   leituras vêm da mesma fonte. */
function habitatDoNo(node, massaIdx) {
  const massa = massaIdx ? massaIdx.get(node.massaId) : null;
  return massa ? readHabitatNaMassa(node.g, massa) : readHabitat(node.g);
}

/* v37 — `opts` novo: profundidade máxima e "só vivas". Sem eles, a
   descendência é impressa inteira, uma linha por espécie — com um mundo de
   12.000 espécies (o teto atual) isso sozinho são 12.000 linhas antes de
   qualquer outra coisa. O corte por profundidade é o que mantém o documento
   legível como panorama; quem quer a árvore inteira escolhe "sem limite". */
function arvoreTextoNode(node, idx, prefixo, ehUltimo, opts = {}, profundidade = 1) {
  const linhas = [];
  const ramo = ehUltimo ? "└─ " : "├─ ";
  const marcaExtincao = node.extinta ? ` [EXTINTA em ${fmtAU(node.auExtincao)}]` : ""; // Fase 1, item 4.2
  linhas.push(`${prefixo}${ramo}[${fmtAU(node.auSurgimento)}] ${node.linhagemId}${marcaExtincao}`);
  const limite = opts.profundidadeMax || Infinity;
  let filhos = node.filhos.map((id) => idx.get(id)).filter(Boolean);
  if (opts.soVivas) filhos = filhos.filter((f) => !f.extinta || (opts.vivasComDescendencia && opts.vivasComDescendencia.has(f.id)));
  const novoPrefixo = prefixo + (ehUltimo ? "   " : "│  ");
  if (profundidade >= limite) {
    if (filhos.length) linhas.push(`${novoPrefixo}└─ (+${contarSubarvore(node, idx)} descendente(s) — aumente a profundidade para ver)`);
    return linhas;
  }
  filhos.forEach((f, i) => linhas.push(...arvoreTextoNode(f, idx, novoPrefixo, i === filhos.length - 1, opts, profundidade + 1)));
  return linhas;
}
function contarSubarvore(node, idx) {
  let total = 0;
  const pilha = [...node.filhos];
  let guard = 0;
  while (pilha.length && guard++ < 50000) {
    const f = idx.get(pilha.pop());
    if (!f) continue;
    total++;
    for (const id of f.filhos) pilha.push(id);
  }
  return total;
}
function exportarHistoriaGlobalPdf(nodes, idx, massaIdx, opts = {}) {
  const trav = "-".repeat(11);
  const primordiais = nodes.filter((n) => n.isPrimordial);
  const blocos = primordiais.map((prim) => {
    const pc = calcularPesoCalorias(prim.g);
    const filhos = prim.filhos.map((id) => idx.get(id)).filter(Boolean);
    const descendencia = filhos.flatMap((f, i) => arvoreTextoNode(f, idx, "   ", i === filhos.length - 1, opts));
    return [
      `>> ${prim.linhagemId.toUpperCase()}`,
      `   DNA: ${prim.code}`,
      `   Reino: ${REINO_LABEL[prim.g.reino] || prim.g.reino} | Porte: ${prim.g.porte} | Peso: ${fmtKg(pc.pesoKg)}`,
      `   Habitat: ${habitatDoNo(prim, massaIdx).primary.join(", ") || "—"}`,
      `   Surgimento: ${fmtAU(prim.auSurgimento)}`,
      `   Dieta: ${prim.g.dieBase} | Tol. térmica: ${prim.g.tolTermica}`,
      descendencia.length ? `\n   DESCENDÊNCIA:\n${descendencia.join("\n")}` : "",
    ].join("\n");
  });
  const contagemReino = {};
  for (const n of nodes) contagemReino[n.g.reino] = (contagemReino[n.g.reino] || 0) + 1;
  const estat = [
    "ESTATÍSTICAS", trav, "",
    `Primordiais: ${primordiais.length} | Derivadas: ${nodes.length - primordiais.length} | Total: ${nodes.length}`,
    `Reinos: ${Object.entries(contagemReino).map(([k, v]) => `${REINO_LABEL[k] || k} (${v})`).join(", ")}`,
  ].join("\n");
  const nota = opts.profundidadeMax
    ? [`Recorte: descendência até ${opts.profundidadeMax} nível(is) por primordial${opts.soVivas ? ", só linhagens vivas" : ""}.`, ""]
    : [];
  const texto = ["PRIMORDIAIS", trav, "", ...nota, blocos.join("\n\n"), "", estat].join("\n");
  downloadPdf(
    `historia-global-droerni-${new Date().toISOString().slice(0, 10)}.pdf`,
    "HISTORIA EVOLUTIVA - DROERNI",
    texto
  );
  return { linhas: texto.split("\n").length, paginas: Math.max(1, Math.ceil(texto.split("\n").length / LINHAS_POR_PAGINA_PDF)) };
}

/* ============================================================
   3) FICHA OBSIDIAN — uma espécie -> .md com frontmatter
   ============================================================ */
function fichaObsidianMd(node, idx, massaIdx) {
  const pc = calcularPesoCalorias(node.g);
  const ancestral = node.pais[0] ? idx.get(node.pais[0]) : null;
  const descendentes = node.filhos.map((id) => idx.get(id)).filter(Boolean);
  const fm = [
    "---",
    `title: ${node.linhagemId}`,
    `seed: ${gluedSeedText(node.speciesSeed ?? seedParaGenoma(node.g, node.g.isPrimordial).seed, null, node.isPrimordial)}`,
    `peso_kg: ${pc.pesoKg.toFixed(1)}`,
    `calorias_diarias: ${pc.caloriasDia.toFixed(0)}`,
    `ano_surgimento_au: ${node.auSurgimento}`,
    `ano_surgimento_anos: ${Math.round(node.auSurgimento * AU_EM_ANOS)}`,
    `primordial: ${node.isPrimordial}`,
    "---",
  ].join("\n");
  const corpo = [
    "", `## DNA (DRN2)`, "", "```", node.code, "```", "",
    `## Descrição`, "", describeCreatureProse(node.g), "",
    `## Genoma Completo`, "", "```", describeIndividual(node.g), "```", "",
    `## Habitat`, "",
    `- Primário: ${habitatDoNo(node, massaIdx).primary.join(", ") || "—"}`,
    `- Marginal: ${habitatDoNo(node, massaIdx).marginal.join(", ") || "—"}`, "",
    `## Genealogia`, "",
    `- Ancestral: ${ancestral ? `[[${ancestral.linhagemId}]]` : "nenhum (primordial)"}`,
    `- Descendentes: ${descendentes.length ? descendentes.map((d) => `[[${d.linhagemId}]]`).join(", ") : "nenhum"}`,
  ].join("\n");
  return fm + corpo;
}
function nomeArquivoSeguro(nome) { return (nome || "especie").replace(/[\\/:*?"<>|]/g, "-"); }
function exportarFichaUnicaMd(node, idx, massaIdx) {
  downloadBlob(`${nomeArquivoSeguro(node.linhagemId)}.md`, fichaObsidianMd(node, idx, massaIdx), "text/markdown;charset=utf-8");
}
function exportarFichasObsidianZip(nodes, idx, massaIdx) {
  const files = nodes.map((n) => ({ name: `${nomeArquivoSeguro(n.linhagemId)}-${n.id}.md`, content: fichaObsidianMd(n, idx, massaIdx) }));
  downloadZip(`fichas-obsidian-droerni-${new Date().toISOString().slice(0, 10)}.zip`, files);
}



/* ============================================================
   v37 — PAINEL DE EXPORTAÇÃO COM ESCOPO E ESTIMATIVA
   ============================================================
   Os três botões viraram um painel porque o problema relatado não era o
   formato do arquivo, era o TAMANHO dele: "o arquivo pdf de história está
   chegando a milhares de páginas". Um botão que só baixa não dá ao usuário
   como evitar isso — ele descobre depois de esperar a geração inteira.

   O painel mostra a estimativa de páginas ANTES, e ela reage à escolha do
   escopo, então dá para ver o custo de cada recorte sem baixar nada. */
function PainelExportar({ eventLog, nodes, idx, massaIdx, showToast }) {
  const [escopo, setEscopo] = useState("estrutural");
  const [profundidade, setProfundidade] = useState("4");
  const [soVivas, setSoVivas] = useState(false);

  const previa = useMemo(() => {
    const eventos = filtrarHistorico(eventLog, escopo);
    return { eventos: eventos.length, paginas: estimarPaginasHistorico(eventos) };
  }, [eventLog, escopo]);

  const profNum = profundidade === "0" ? 0 : Math.max(1, Number(profundidade) || 4);

  const baixarHistorico = () => {
    const r = exportarHistoricoPdf(eventLog, escopo);
    showToast(`Histórico exportado: ${r.eventos} evento(s), ~${r.paginas} página(s).`);
  };
  const baixarHistoria = () => {
    const r = exportarHistoriaGlobalPdf(nodes, idx, massaIdx, {
      profundidadeMax: profNum || undefined,
      soVivas,
      vivasComDescendencia: soVivas ? idsVisiveisSoVivas(nodes, idx) : null,
    });
    showToast(`História global exportada: ~${r.paginas} página(s).`);
  };

  return (
    <Section title="Exportar" accent="text-stone-500">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] uppercase text-stone-500 font-mono">Escopo do histórico</label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {ESCOPOS_HISTORICO.map((e) => (
              <button key={e.id} onClick={() => setEscopo(e.id)}
                className={`px-2.5 py-1.5 rounded border text-[11px] ${escopo === e.id
                  ? "border-emerald-700 bg-emerald-950/30 text-emerald-200"
                  : "border-stone-800 text-stone-400 hover:border-stone-600"}`}>
                {e.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-stone-600 mt-1">
            {(ESCOPOS_HISTORICO.find((e) => e.id === escopo) || {}).desc}.
          </p>
          <p className={`text-[10px] mt-0.5 ${previa.paginas > 300 ? "text-amber-500" : "text-stone-500"}`}>
            {previa.eventos} evento(s) · ~{previa.paginas} página(s)
            {previa.paginas > 300 ? " — arquivo muito longo; considere um escopo menor." : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 items-end">
          <div>
            <label className="text-[10px] uppercase text-stone-500 font-mono">Profundidade da árvore</label>
            <select value={profundidade} onChange={(e) => setProfundidade(e.target.value)}
              className="bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-xs text-stone-200 w-full">
              <option value="2">2 níveis</option>
              <option value="4">4 níveis</option>
              <option value="8">8 níveis</option>
              <option value="0">Sem limite</option>
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-stone-400 pb-1.5">
            <input type="checkbox" checked={soVivas} onChange={(e) => setSoVivas(e.target.checked)} className="accent-emerald-600" />
            só linhagens vivas
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={baixarHistorico} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Download size={12} className="inline -mt-0.5 mr-1" />Histórico (.pdf)</button>
          <button onClick={baixarHistoria} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Download size={12} className="inline -mt-0.5 mr-1" />História Global (.pdf)</button>
          <button onClick={() => exportarFichasObsidianZip(nodes, idx, massaIdx)} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Download size={12} className="inline -mt-0.5 mr-1" />Fichas Obsidian (.zip)</button>
        </div>
      </div>
    </Section>
  );
}

/* ============================================================
   4) ESTADO COMPLETO (.json) — export/import do projeto inteiro
   ============================================================ */
function serializeProjetoV17(state) {
  // BigInt não é serializável por JSON.stringify — individualSeed (e speciesSeed,
  // se algum dia um nó carregar) precisam virar string pro export e voltar a
  // BigInt na importação. Todo o resto do genoma é string/number puro.
  const nodesOut = state.nodes.map((n) => ({
    ...n,
    acumEstratoII: Array.from(n.acumEstratoII || []),
    speciesSeed: n.speciesSeed !== undefined ? String(n.speciesSeed) : undefined,
  }));
  const individualsOut = state.individuals.map((i) => ({ ...i, individualSeed: i.individualSeed !== undefined ? String(i.individualSeed) : undefined }));
  return JSON.stringify({
    versao: "droerni-v23",
    exportadoEm: new Date().toISOString(),
    eras: state.eras,
    nodes: nodesOut,
    individuals: individualsOut,
    anoAtual: state.anoAtual || 0,
    eventLog: __eventLog,
    faseGeoConfirmada: state.faseGeoConfirmada,
    faseErasConfirmada: state.faseErasConfirmada,
    contadores: { idCounter: __idCounter, logCounter: __logCounter, idRegiaoCounter: __idRegiaoCounter, idEraCounter: __idEraCounter },
    dominiosCustom: DOMINIOS_CUSTOM, // Fase 5, item 9.5
  });
}
function deserializarProjetoV17(text) {
  const parsed = JSON.parse(text);
  // Fase 2, item 5.3 (pré-requisito 8) — reinos Ar/Sp não existem mais no
  // schema atual; ecossistemas salvos antes desta fase podem trazê-los.
  // Decisão adotada (não havia decisão travada no plano): converte
  // automaticamente para "An" (fallback neutro), preserva o reino original
  // em `g.reinoOriginalMigrado` para rastreabilidade, e avisa a contagem
  // ao usuário — não bloqueia o import nem tenta advinhar uma classe
  // taxonômica specific, já que o genoma de Ar/Sp não mapeia de forma
  // confiável pra nenhuma classeAn existente.
  let migrados = 0;
  const nodes = (parsed.nodes || []).map((n) => {
    if (n.g && (n.g.reino === "Ar" || n.g.reino === "Sp")) {
      migrados++;
      n = { ...n, g: { ...n.g, reino: "An", reinoOriginalMigrado: n.g.reino } };
    }
    return {
      ...n,
      acumEstratoII: new Set(n.acumEstratoII || []),
      speciesSeed: n.speciesSeed !== undefined ? BigInt(n.speciesSeed) : undefined,
    };
  });
  const individuals = (parsed.individuals || []).map((i) => ({ ...i, individualSeed: i.individualSeed !== undefined ? BigInt(i.individualSeed) : undefined }));
  recalcularTodasAsLinhagens(nodes);
  return {
    eras: parsed.eras || [],
    nodes,
    individuals,
    anoAtual: parsed.anoAtual || 0,
    eventLog: parsed.eventLog || [],
    faseGeoConfirmada: !!parsed.faseGeoConfirmada,
    faseErasConfirmada: !!parsed.faseErasConfirmada,
    contadores: parsed.contadores || {},
    especiesMigradasDeReinoRemovido: migrados, // Fase 2, item 5.3
    /* v34 — projetos salvos até a v33 trazem `clado` (nome próprio sorteado)
       e nenhum `linhagemSegs`. `recalcularTodasAsLinhagens` reconstrói os
       endereços a partir da topologia salva, que é a única fonte verdadeira
       deles — o nome antigo simplesmente deixa de ser usado. */
    dominiosCustom: parsed.dominiosCustom || [], // Fase 5, item 9.5
  };
}

/* ============================================================
   BARRA DE PERSISTÊNCIA
   ============================================================ */
/* `rotulos` — v34. A mesma barra aparece em dois contextos: como dois ícones
   no cabeçalho (telas grandes) e como dois botões com texto dentro do painel
   de configurações (o caminho do celular). Ícone sem rótulo é ilegível fora
   de uma barra de ferramentas, então o modo com rótulo existe para lá. */
function PersistenceBar({ eras, nodes, individuals, anoAtual, faseGeoConfirmada, faseErasConfirmada, onImportar, showToast, rotulos = false }) {
  const fileInputRef = useRef(null);
  const exportar = () => {
    const text = serializeProjetoV17({ eras, nodes, individuals, anoAtual, faseGeoConfirmada, faseErasConfirmada });
    downloadBlob(`droerni-projeto-${new Date().toISOString().slice(0, 10)}.json`, text, "application/json;charset=utf-8");
    showToast(`Projeto exportado (${(text.length / 1024).toFixed(0)} KB).`);
  };
  const importar = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dados = deserializarProjetoV17(reader.result);
        resetEventLog();
        restaurarEventLog(dados.eventLog, dados.contadores.idCounter, dados.contadores.logCounter);
        restaurarDominiosCustom(dados.dominiosCustom); // Fase 5, item 9.5
        if (typeof dados.contadores.idRegiaoCounter === "number") __idRegiaoCounter = Math.max(__idRegiaoCounter, dados.contadores.idRegiaoCounter);
        if (typeof dados.contadores.idEraCounter === "number") __idEraCounter = Math.max(__idEraCounter, dados.contadores.idEraCounter);
        onImportar(dados);
        const avisoMigracao = dados.especiesMigradasDeReinoRemovido > 0
          ? ` (${dados.especiesMigradasDeReinoRemovido} espécie(s) de reino removido Ar/Sp migradas para An — revise manualmente)`
          : ""; // Fase 2, item 5.3
        showToast(`Projeto importado: ${dados.nodes.length} espécie(s), ${dados.eras.length} era(s).${avisoMigracao}`);
      } catch (err) {
        showToast("Erro ao importar: arquivo inválido.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };
  if (rotulos) {
    return (
      <>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={importar} />
        <button onClick={() => fileInputRef.current?.click()} className="flex-1 min-w-[45%] px-3 py-2 rounded border border-stone-800 text-xs text-stone-300 hover:border-stone-600 flex items-center justify-center gap-1.5"><Upload size={13} /> Importar .json</button>
        <button onClick={exportar} className="flex-1 min-w-[45%] px-3 py-2 rounded border border-stone-800 text-xs text-stone-300 hover:border-stone-600 flex items-center justify-center gap-1.5"><Download size={13} /> Exportar .json</button>
      </>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={importar} />
      <button onClick={() => fileInputRef.current?.click()} title="Importar Projeto" className="p-2 rounded border border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-600"><Upload size={14} /></button>
      <button onClick={exportar} title="Exportar Projeto (.json)" className="p-2 rounded border border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-600"><Download size={14} /></button>
    </div>
  );
}
