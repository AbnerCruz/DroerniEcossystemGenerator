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
   1) HISTÓRICO COMPLETO (.pdf) — cronológico, um bloco por evento
   ============================================================ */
function exportarHistoricoPdf(eventLog) {
  const cab = [`${eventLog.length} evento(s) registrado(s).`, ""];
  const corpo = eventLog.map((e) => {
    const hora = new Date(e.ts).toLocaleTimeString("pt-BR");
    return `[${hora}] #${e.seq} ${e.tipoLabel}\n  ${e.clado}${e.primordialClado && e.primordialClado !== e.clado ? ` (linhagem de ${e.primordialClado})` : ""}\n  ${e.texto}${e.code ? `\n  DNA: ${e.code}` : ""}`;
  });
  downloadPdf(
    `historico-droerni-${new Date().toISOString().slice(0, 10)}.pdf`,
    "HISTORICO DE ACOES - DROERNI ECOSSISTEMA",
    [...cab, ...corpo].join("\n\n")
  );
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

function arvoreTextoNode(node, idx, prefixo, ehUltimo) {
  const linhas = [];
  const ramo = ehUltimo ? "└─ " : "├─ ";
  const marcaExtincao = node.extinta ? ` [EXTINTA em ${fmtAU(node.auExtincao)}]` : ""; // Fase 1, item 4.2
  linhas.push(`${prefixo}${ramo}[${fmtAU(node.auSurgimento)}] ${node.clado}${marcaExtincao}`);
  const filhos = node.filhos.map((id) => idx.get(id)).filter(Boolean);
  const novoPrefixo = prefixo + (ehUltimo ? "   " : "│  ");
  filhos.forEach((f, i) => linhas.push(...arvoreTextoNode(f, idx, novoPrefixo, i === filhos.length - 1)));
  return linhas;
}
function exportarHistoriaGlobalPdf(nodes, idx, massaIdx) {
  const trav = "-".repeat(11);
  const primordiais = nodes.filter((n) => n.isPrimordial);
  const blocos = primordiais.map((prim) => {
    const pc = calcularPesoCalorias(prim.g);
    const filhos = prim.filhos.map((id) => idx.get(id)).filter(Boolean);
    const descendencia = filhos.flatMap((f, i) => arvoreTextoNode(f, idx, "   ", i === filhos.length - 1));
    return [
      `>> ${prim.clado.toUpperCase()}`,
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
  const texto = ["PRIMORDIAIS", trav, "", blocos.join("\n\n"), "", estat].join("\n");
  downloadPdf(
    `historia-global-droerni-${new Date().toISOString().slice(0, 10)}.pdf`,
    "HISTORIA EVOLUTIVA - DROERNI",
    texto
  );
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
    `title: ${node.clado}`,
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
    `- Ancestral: ${ancestral ? `[[${ancestral.clado}]]` : "nenhum (primordial)"}`,
    `- Descendentes: ${descendentes.length ? descendentes.map((d) => `[[${d.clado}]]`).join(", ") : "nenhum"}`,
  ].join("\n");
  return fm + corpo;
}
function nomeArquivoSeguro(nome) { return (nome || "especie").replace(/[\\/:*?"<>|]/g, "-"); }
function exportarFichaUnicaMd(node, idx, massaIdx) {
  downloadBlob(`${nomeArquivoSeguro(node.clado)}.md`, fichaObsidianMd(node, idx, massaIdx), "text/markdown;charset=utf-8");
}
function exportarFichasObsidianZip(nodes, idx, massaIdx) {
  const files = nodes.map((n) => ({ name: `${nomeArquivoSeguro(n.clado)}-${n.id}.md`, content: fichaObsidianMd(n, idx, massaIdx) }));
  downloadZip(`fichas-obsidian-droerni-${new Date().toISOString().slice(0, 10)}.zip`, files);
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
    dominiosCustom: parsed.dominiosCustom || [], // Fase 5, item 9.5
  };
}

/* ============================================================
   BARRA DE PERSISTÊNCIA
   ============================================================ */
function PersistenceBar({ eras, nodes, individuals, anoAtual, faseGeoConfirmada, faseErasConfirmada, onImportar, showToast }) {
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
  return (
    <div className="flex items-center gap-2">
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={importar} />
      <button onClick={() => fileInputRef.current?.click()} title="Importar Projeto" className="p-2 rounded border border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-600"><Upload size={14} /></button>
      <button onClick={exportar} title="Exportar Projeto (.json)" className="p-2 rounded border border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-600"><Download size={14} /></button>
    </div>
  );
}
