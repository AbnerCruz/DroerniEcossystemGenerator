/* ============================================================
   APP PRINCIPAL — v24
   ============================================================ */
function App() {
  const [eras, setEras] = useState([]);
  const [faseGeoConfirmada, setFaseGeoConfirmada] = useState(false);
  const [faseErasConfirmada, setFaseErasConfirmada] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [individuals, setIndividuals] = useState([]);
  const [anoAtual, setAnoAtual] = useState(0); // v23 — "ano atual" do mundo, em AU (1 AU = 1 milhão de anos)
  const [selectedSpeciesId, setSelectedSpeciesId] = useState(null);
  const [editor, setEditor] = useState(null); // null | {modo:'criar'} | {modo:'editar', node}
  const [modalDerivarNode, setModalDerivarNode] = useState(null);
  const [derivando, setDerivando] = useState(false);
  const [progressoDerivar, setProgressoDerivar] = useState(0);
  const [toast, setToast] = useState("");
  const [logVersion, setLogVersion] = useState(0);
  const [patchnotesAberto, setPatchnotesAberto] = useState(false);
  const [individualViewer, setIndividualViewer] = useState(null); // { individual, especieNode|null } | null
  const [seedSearchAberto, setSeedSearchAberto] = useState(false);
  // v27 — a busca pode ser aberta já preenchida (ex.: pelo botão "Abrir na
  // busca" dentro do painel do indivíduo, que joga o DNA dele no campo)
  const [seedSearchTexto, setSeedSearchTexto] = useState("");
  const abrirBusca = (textoInicial) => {
    setSeedSearchTexto(typeof textoInicial === "string" ? textoInicial : "");
    setSeedSearchAberto(true);
  };
  // Fase 5, item 9.5 — domínios climáticos customizados vivem em estado
  // mutável do motor (DOMINIOS_CUSTOM); dominiosVersion força re-render
  // aqui quando eles mudam, mesmo padrão já usado pro eventLog (logVersion).
  const [dominiosVersion, setDominiosVersion] = useState(0);
  const dominiosDisponiveis = useMemo(() => listarDominiosDisponiveis(), [dominiosVersion]);
  const onAdicionarDominio = (nome, biomas) => {
    const ok = adicionarDominioCustom(nome, biomas);
    if (ok) { setDominiosVersion((v) => v + 1); showToast(`Domínio "${nome}" criado com ${biomas.length} bioma(s).`); }
    else showToast("Nome de domínio inválido ou já existente.");
  };
  const onRemoverDominio = (nome) => { removerDominioCustom(nome); setDominiosVersion((v) => v + 1); showToast(`Domínio "${nome}" removido.`); };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2600); };
  const eventLog = useMemo(() => __eventLog, [logVersion]);
  const idx = useMemo(() => buildIndex(nodes), [nodes]);
  const massaIdx = useMemo(() => { const m = new Map(); for (const era of eras) for (const massa of era.massas) m.set(massa.id, massa); return m; }, [eras]);
  const eraAtual = eras.length ? eras[eras.length - 1] : null;

  const faseAtual = !faseGeoConfirmada ? 1 : !faseErasConfirmada ? 2 : 3;

  /* ---------- FASE 1 ---------- */
  const confirmarGeografia = (massasRascunho) => {
    const massas = massasRascunho.map((m) => criarMassaDeTerra(m.nome, m.dominios, m.biomasExcluidos)); // Fase 5, item 9.3
    const eraInicial = { id: novaIdEra(), nome: "Era 1", auInicio: 0, massas, eraAnteriorId: null };
    setEras([eraInicial]);
    setFaseGeoConfirmada(true);
    showToast(`Geografia confirmada: ${massas.length} massa(s) de terra.`);
  };

  /* ---------- FASE 2 ---------- */
  const confirmarEras = () => { setFaseErasConfirmada(true); showToast(`Eras confirmadas: ${eras.length} era(s). Biologia desbloqueada.`); };

  /* Fase 5, item 9.2 — excluir massa de terra mal configurada/indesejada,
     mesmo depois de confirmada. Mesmo padrão de segurança de deletarEspecie
     (bloqueia/pede reatribuição em vez de deixar massaId órfão): se havia
     espécies vinculadas, elas são reatribuídas pra novaMassaId (obrigatória
     nesse caso) antes de remover a massa da era atual. */
  const excluirMassa = (massaId, novaMassaId) => {
    const eraAtual = eras[eras.length - 1];
    const vinculadas = nodes.filter((n) => n.massaId === massaId);
    if (vinculadas.length > 0 && !novaMassaId) {
      showToast("Essa massa tem espécies vinculadas — escolha uma massa de destino antes de excluir.");
      return;
    }
    if (vinculadas.length > 0) {
      const idsVinculados = new Set(vinculadas.map((n) => n.id));
      setNodes((prev) => prev.map((n) => (idsVinculados.has(n.id) ? { ...n, massaId: novaMassaId } : n)));
      setIndividuals((prev) => prev.map((i) => (i.massaId === massaId ? { ...i, massaId: novaMassaId } : i)));
    }
    setEras((prev) => prev.map((e, i) => (i === prev.length - 1 ? { ...e, massas: e.massas.filter((m) => m.id !== massaId) } : e)));
    setLogVersion((v) => v + 1);
    showToast(vinculadas.length > 0 ? `Massa excluída — ${vinculadas.length} espécie(s) reatribuída(s).` : "Massa excluída.");
  };

  /* Divisão de era: além de criar as massas novas, migra as espécies das
     massas antigas para as herdeiras (aplicarDivisaoEra estava escrito e
     nunca era chamado). Sem isso, uma espécie continuava presa à massa da
     era anterior e seu habitat era lido contra uma geografia que já não
     existia. Os nós são mutados em lugar pelo motor, então recriamos o
     array para o React enxergar a mudança. */
  const aoCriarNovaEra = (novaEra, mapaAntigaParaNovas) => {
    const migradas = aplicarDivisaoEra(nodes, mapaAntigaParaNovas);
    if (migradas > 0) setNodes((prev) => prev.map((n) => ({ ...n })));
    emitirEvento({
      tipo: "era", tipoLabel: "NOVA ERA", speciesId: null, clado: novaEra.nome,
      primordialId: null, primordialClado: novaEra.nome,
      texto: `${novaEra.nome} começa em ${fmtAU(novaEra.auInicio)} com ${novaEra.massas.length} massa(s) de terra. ${migradas} espécie(s) migrada(s) para as massas herdeiras.`,
    });
    setLogVersion((v) => v + 1);
    showToast(`${novaEra.nome} criada — ${migradas} espécie(s) remapeada(s).`);
  };

  /* ---------- FASE 3 — criar / editar / deletar / clonar ---------- */
  /* v23: toda espécie nova (primordial manual, edição não conta, clone
     ou derivação) ganha automaticamente uma população de indivíduos
     espalhada pelas divisões simuladas da massa em que nasceu — "a
     geração das espécies gera populações de indivíduos" deixou de ser
     um passo manual separado. */
  const salvarNovoPrimordial = ({ g, auInicial, massaId }) => {
    const node = commitPrimordialFromGenome(g, auInicial, massaId);
    const populacao = gerarPopulacaoParaEspecie(node, TAMANHO_POPULACAO_INICIAL, DIVISOES_POR_MASSA, massaIdx.get(node.massaId)); // Fase 2, item 5.5
    setNodes((prev) => [...prev, node]);
    setIndividuals((prev) => [...prev, ...populacao]);
    setAnoAtual((a) => Math.max(a, auInicial));
    setEditor(null); setLogVersion((v) => v + 1);
    showToast(`Primordial ${node.clado} criado, com ${populacao.length} indivíduo(s) espalhados pelo território.`);
  };
  const salvarEdicao = ({ g, auInicial, massaId }) => {
    // Fase 2, item 5.4 — edição de espécie já viva vira especiação manual:
    // gera um nó FILHO novo a partir do genoma editado; o nó-mãe original
    // permanece intacto e consultável (não sobrescrevemos mais `alvo`).
    const alvo = editor.node;
    const filho = commitEspeciacaoManualFromGenome(alvo, g, auInicial, massaId);
    const populacao = gerarPopulacaoParaEspecie(filho, TAMANHO_POPULACAO_INICIAL, DIVISOES_POR_MASSA, massaIdx.get(filho.massaId)); // Fase 2, item 5.5
    setNodes((prev) => [...prev.map((n) => (n.id === alvo.id ? { ...n, filhos: [...n.filhos] } : n)), filho]);
    setIndividuals((prev) => [...prev, ...populacao]);
    setEditor(null); setLogVersion((v) => v + 1);
    showToast(`${filho.clado} especiada manualmente a partir de ${alvo.clado} (${alvo.clado} preservada intacta), com ${populacao.length} indivíduo(s).`);
  };
  const deletarEspecie = (node) => {
    if (node.filhos.length > 0) { showToast("Remova (ou reatribua) os descendentes antes de deletar esta espécie."); return; }
    if (!window.confirm(`Deletar ${node.clado} definitivamente?`)) return;
    setNodes((prev) => prev.filter((n) => n.id !== node.id).map((n) => (n.pais.includes(node.id) ? { ...n, pais: [] } : n)));
    if (node.pais[0]) setNodes((prev) => prev.map((n) => (n.id === node.pais[0] ? { ...n, filhos: n.filhos.filter((f) => f !== node.id) } : n)));
    setIndividuals((prev) => prev.filter((i) => i.especieId !== node.id));
    setSelectedSpeciesId(null);
    setLogVersion((v) => v + 1);
    showToast(`${node.clado} deletada.`);
  };
  const clonarEspecie = (node) => {
    const gClone = JSON.parse(JSON.stringify(node.g));
    /* Duas incoerências no clone original: (1) o nó era marcado como
       isPrimordial:true mas o GENOMA continuava com isPrimordial:false
       quando a origem era derivada — e esse flag governa travas reais
       (magia A0-A3, sem crânio humanoide, sem mente coletiva) e a
       reconstrução por seed; (2) o clado era copiado igual, criando duas
       espécies com o mesmo nome, o que colide os [[wikilinks]] da ficha
       Obsidian. O clone agora é um primordial de verdade, com identidade
       própria e genoma renormalizado sob as travas de primordial. */
    gClone.isPrimordial = true;
    gClone.clado = sortClado();
    const gNormalizado = normalizarGenoma(gClone, true);
    const novo = commitPrimordialFromGenome(gNormalizado, node.auSurgimento, node.massaId);
    const populacao = gerarPopulacaoParaEspecie(novo, TAMANHO_POPULACAO_INICIAL, DIVISOES_POR_MASSA, massaIdx.get(novo.massaId)); // Fase 2, item 5.5
    setNodes((prev) => [...prev, novo]);
    setIndividuals((prev) => [...prev, ...populacao]);
    setLogVersion((v) => v + 1);
    showToast(`${node.clado} clonada como ${novo.clado} (nova espécie primordial independente, mesmo genoma base), com ${populacao.length} indivíduo(s) próprios.`);
  };
  const derivarEspecie = async (node, ciclos) => {
    setDerivando(true); setProgressoDerivar(0);
    const novos = [];
    const filhas = await derivarLinhagem(node, ciclos, (filha) => novos.push(filha), (fracao) => setProgressoDerivar(fracao));
    let novaPopulacao = [];
    for (const filha of novos) novaPopulacao = novaPopulacao.concat(gerarPopulacaoParaEspecie(filha, TAMANHO_POPULACAO_INICIAL, DIVISOES_POR_MASSA, massaIdx.get(filha.massaId))); // Fase 2, item 5.5
    setNodes((prev) => [...prev, ...novos]);
    setIndividuals((prev) => [...prev, ...novaPopulacao]);
    if (novos.length) setAnoAtual((a) => novos.reduce((m, n) => Math.max(m, n.auSurgimento), a));
    setModalDerivarNode(null); setLogVersion((v) => v + 1);
    setDerivando(false);
    showToast(
      `${novos.length} nova(s) espécie(s) derivada(s) de ${node.clado}, ${novaPopulacao.length} indivíduo(s) espalhados.` +
      (filhas.extintasPorSaturacao > 0 ? ` ${filhas.extintasPorSaturacao} linhagem(ns) perdida(s) por concorrência (teto de ${MAX_LINHAGENS_ATIVAS} ramificações simultâneas).` : "")
    );
  };
  /* v23 — gerar um indivíduo abre imediatamente o painel dedicado dele
     (antes só entrava, silencioso, numa lista dentro do visor de
     espécie — dava pra perder o indivíduo novo de vista e não tinha
     como ver os atributos completos). */
  const novoIndividuo = (node) => {
    const individuo = gerarPopulacaoParaEspecie(node, 1, DIVISOES_POR_MASSA, massaIdx.get(node.massaId))[0]; // Fase 2, item 5.5
    setIndividuals((prev) => [...prev, individuo]);
    setLogVersion((v) => v + 1);
    setIndividualViewer({ individual: individuo, especieNode: node });
    showToast(`Indivíduo ${individuo.nome} criado (${node.clado}).`);
  };

  /* ---------- import de projeto ---------- */
  const onImportarProjeto = (dados) => {
    setEras(dados.eras.length ? dados.eras : []);
    setNodes(dados.nodes);
    setIndividuals(dados.individuals);
    setAnoAtual(dados.anoAtual || 0);
    setFaseGeoConfirmada(dados.faseGeoConfirmada || dados.eras.length > 0);
    setFaseErasConfirmada(dados.faseErasConfirmada || dados.eras.length > 0);
    setSelectedSpeciesId(null); setEditor(null);
    setLogVersion((v) => v + 1);
    setDominiosVersion((v) => v + 1); // Fase 5, item 9.5 — DOMINIOS_CUSTOM foi restaurado no import
  };

  /* ---------- v23: busca por seed — adicionar resultado ao mundo ---------- */
  const adicionarSeedComoPrimordial = (g) => {
    if (!eraAtual) return;
    const node = commitPrimordialFromGenome(g, eraAtual.auInicio, eraAtual.massas[0]?.id || null);
    const populacao = gerarPopulacaoParaEspecie(node, TAMANHO_POPULACAO_INICIAL, DIVISOES_POR_MASSA, massaIdx.get(node.massaId)); // Fase 2, item 5.5
    setNodes((prev) => [...prev, node]);
    setIndividuals((prev) => [...prev, ...populacao]);
    setSeedSearchAberto(false);
    setLogVersion((v) => v + 1);
    showToast(`${node.clado} adicionada ao mundo a partir da seed, com ${populacao.length} indivíduo(s).`);
  };

  const selectedNode = selectedSpeciesId ? idx.get(selectedSpeciesId) : null;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200" style={{ fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
        .font-display { font-family: 'Fraunces', serif; font-optical-sizing: auto; }
        .font-data { font-family: 'IBM Plex Mono', monospace; }
        .prose-patchnotes h1 { font-size: 1.05rem; font-weight: 600; color: #f5f5f4; margin: 0 0 .75rem; }
        .prose-patchnotes h2 { font-size: .85rem; text-transform: uppercase; letter-spacing: .08em; color: #34d399; margin: 1.25rem 0 .5rem; font-family: 'IBM Plex Mono', monospace; }
        .prose-patchnotes h3 { font-size: .8rem; font-weight: 600; color: #d6d3d1; margin: 1rem 0 .4rem; }
        .prose-patchnotes p { margin: 0 0 .75rem; }
        .prose-patchnotes ul { list-style: disc; padding-left: 1.25rem; margin: 0 0 .75rem; }
        .prose-patchnotes li { margin-bottom: .35rem; }
        .prose-patchnotes code { background: #1c1917; border: 1px solid #292524; border-radius: 3px; padding: 0 .3em; font-family: 'IBM Plex Mono', monospace; font-size: .85em; color: #a8a29e; }
        .prose-patchnotes strong { color: #e7e5e4; }
        .prose-patchnotes a { color: #34d399; text-decoration: underline; }
      `}</style>

      <header className="border-b border-stone-800 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3 sticky top-0 bg-stone-950/95 backdrop-blur z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-full border border-emerald-700 flex items-center justify-center text-emerald-500"><GitBranch size={18} /></div>
          <div className="min-w-0">
            <h1 className="font-display text-lg sm:text-xl font-semibold tracking-tight text-stone-100 leading-none">Droerni · Ecossistema DRN2</h1>
            <p className="font-data text-[10px] text-stone-500 tracking-wider truncate">v24 · seed autossuficiente (primordial/derivada embutido)</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => abrirBusca()} title="Buscar por seed, DNA ou texto" className="p-2 rounded border border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-600"><Search size={14} /></button>
          <button onClick={() => setPatchnotesAberto(true)} title="Patchnotes" className="p-2 rounded border border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-600"><FileText size={14} /></button>
          <PersistenceBar eras={eras} nodes={nodes} individuals={individuals} anoAtual={anoAtual} faseGeoConfirmada={faseGeoConfirmada} faseErasConfirmada={faseErasConfirmada} onImportar={onImportarProjeto} showToast={showToast} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <BarraFases faseAtual={faseAtual} geoOk={faseGeoConfirmada} erasOk={faseErasConfirmada} />

        {/* Antes: renderizada só na fase 1 e sempre com jaConfirmada={false},
            o que tornava o resumo da geografia código morto — depois de
            confirmar, o usuário perdia a visão das massas de terra do mundo. */}
        {(faseAtual === 1 || eras.length > 0) && (
          <FaseGeografia onConfirmar={confirmarGeografia} jaConfirmada={faseGeoConfirmada} eras={eras} dominiosDisponiveis={dominiosDisponiveis} dominiosCustom={DOMINIOS_CUSTOM} onAdicionarDominio={onAdicionarDominio} onRemoverDominio={onRemoverDominio} />
        )}

        {faseGeoConfirmada && (
          <FaseEras eras={eras} setEras={setEras} onConfirmar={confirmarEras} jaConfirmada={faseErasConfirmada} bloqueada={false} onNovaEra={aoCriarNovaEra} nodes={nodes} onExcluirMassa={excluirMassa} dominiosDisponiveis={dominiosDisponiveis} />
        )}

        {faseAtual === 3 && (
          <>
            <PainelBiologia
              eras={eras} nodes={nodes} setNodes={setNodes}
              individuals={individuals} setIndividuals={setIndividuals}
              anoAtual={anoAtual} setAnoAtual={setAnoAtual}
              onAbrirViewer={setSelectedSpeciesId}
              onCriarPrimordial={() => setEditor({ modo: "criar" })}
              showToast={showToast}
              onLog={() => setLogVersion((v) => v + 1)}
              idx={idx}
            />
            {nodes.length > 0 && (
              <Section title="Exportar" accent="text-stone-500">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => exportarHistoricoPdf(eventLog)} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Download size={12} className="inline -mt-0.5 mr-1" />Histórico (.pdf)</button>
                  <button onClick={() => exportarHistoriaGlobalPdf(nodes, idx, massaIdx)} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Download size={12} className="inline -mt-0.5 mr-1" />História Global (.pdf)</button>
                  <button onClick={() => exportarFichasObsidianZip(nodes, idx, massaIdx)} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Download size={12} className="inline -mt-0.5 mr-1" />Fichas Obsidian (.zip)</button>
                </div>
              </Section>
            )}
            <PainelLog eventLog={eventLog} />
          </>
        )}
      </main>

      {editor?.modo === "criar" && eraAtual && (
        <SpeciesEditor modo="criar" eraAtual={eraAtual} onSalvar={salvarNovoPrimordial} onCancelar={() => setEditor(null)} />
      )}
      {editor?.modo === "editar" && eraAtual && (
        <SpeciesEditor modo="editar" node={editor.node} eraAtual={eraAtual} onSalvar={salvarEdicao} onCancelar={() => setEditor(null)} />
      )}

      {selectedNode && (
        <SpeciesViewer
          node={selectedNode} idx={idx} eras={eras} massaIdx={massaIdx}
          individuosDaEspecie={individuals.filter((i) => i.especieId === selectedNode.id)}
          onFechar={() => setSelectedSpeciesId(null)}
          onEditar={() => { setEditor({ modo: "editar", node: selectedNode }); setSelectedSpeciesId(null); }}
          onDeletar={() => deletarEspecie(selectedNode)}
          onClonar={() => clonarEspecie(selectedNode)}
          onExportarMd={() => exportarFichaUnicaMd(selectedNode, idx, massaIdx)}
          onDerivar={() => { setModalDerivarNode(selectedNode); setSelectedSpeciesId(null); }}
          onNovoIndividuo={() => novoIndividuo(selectedNode)}
          onNavegar={(id) => setSelectedSpeciesId(id)}
          onAbrirIndividuo={(ind) => setIndividualViewer({ individual: ind, especieNode: selectedNode })}
          showToast={showToast}
        />
      )}

      {modalDerivarNode && (
        <ModalDerivar node={modalDerivarNode} onDerivar={(ciclos) => derivarEspecie(modalDerivarNode, ciclos)} onFechar={() => setModalDerivarNode(null)} derivando={derivando} progresso={progressoDerivar} />
      )}

      {individualViewer && (
        <IndividualViewer
          individual={individualViewer.individual}
          especieNode={individualViewer.especieNode}
          onFechar={() => setIndividualViewer(null)}
          onNavegarEspecie={(id) => { setIndividualViewer(null); setSelectedSpeciesId(id); }}
          onBuscar={abrirBusca}
          showToast={showToast}
        />
      )}

      {seedSearchAberto && (
        <SeedSearchModal
          textoInicial={seedSearchTexto}
          onFechar={() => setSeedSearchAberto(false)}
          onAdicionarComoPrimordial={adicionarSeedComoPrimordial}
          eraAtual={eraAtual}
          showToast={showToast}
        />
      )}

      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-stone-900 border border-emerald-800 text-emerald-300 text-xs font-mono px-4 py-2 rounded shadow-lg z-50">{toast}</div>}

      {patchnotesAberto && <PainelPatchnotes onFechar={() => setPatchnotesAberto(false)} />}

      <footer className="max-w-4xl mx-auto px-4 sm:px-6 pb-10 pt-4 text-[10px] text-stone-700 font-data">DRN2 v24 · Droerni — populações de indivíduos, seleção natural populacional, seed autossuficiente</footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
