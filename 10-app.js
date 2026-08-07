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
  const [testesAberto, setTestesAberto] = useState(false); // v28 — bateria embutida
  // v33 — salvamento automático, configurações e reset
  const [configAberto, setConfigAberto] = useState(false);
  const [ultimoSalvamento, setUltimoSalvamento] = useState(null);
  const [restaurando, setRestaurando] = useState(true); // trava a gravação até a restauração terminar
  const [escalaTempo, setEscalaTempoState] = useState(getEscalaTempo());
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

  /* v32 — edição da geografia depois de confirmada. As três funções abaixo
     mutam a massa NO LUGAR (o motor preserva o `id`, do qual dependem todas
     as espécies e populações daquela massa) e depois trocam as referências
     de `eras` para o React enxergar a mudança — mesmo padrão já usado quando
     a seleção natural muta genomas. */
  const aoEditarMassa = (massaId, mudancas) => {
    const massa = massaIdx.get(massaId);
    if (!massa) return;
    editarMassa(massa, mudancas);
    setEras((prev) => prev.map((e) => ({ ...e, massas: e.massas.map((m) => ({ ...m })) })));
  };
  const aoResortearBiomas = (massaId) => {
    const massa = massaIdx.get(massaId);
    if (!massa) return;
    resortearBiomasDaMassa(massa);
    setEras((prev) => prev.map((e) => ({ ...e, massas: e.massas.map((m) => ({ ...m })) })));
    showToast(`Biomas de "${massa.nome}" resorteados.`);
  };
  const aoDefinirBiomaDivisao = (massaId, indice, biomaNome) => {
    const massa = massaIdx.get(massaId);
    if (!massa) return;
    if (!definirBiomaDaDivisao(massa, indice, biomaNome)) {
      showToast("Esse bioma não existe nos domínios climáticos desta massa.");
      return;
    }
    setEras((prev) => prev.map((e) => ({ ...e, massas: e.massas.map((m) => ({ ...m })) })));
  };

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
      tipo: "era", tipoLabel: "NOVA ERA", speciesId: null, linhagemId: novaEra.nome,
      primordialId: null, primordialLinhagem: novaEra.nome,
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
    showToast(`Primordial ${node.linhagemId} criado, com ${populacao.length} indivíduo(s) espalhados pelo território.`);
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
    showToast(`${filho.linhagemId} especiada manualmente a partir de ${alvo.linhagemId} (${alvo.linhagemId} preservada intacta), com ${populacao.length} indivíduo(s).`);
  };
  const deletarEspecie = (node) => {
    if (node.filhos.length > 0) { showToast("Remova (ou reatribua) os descendentes antes de deletar esta espécie."); return; }
    if (!window.confirm(`Deletar ${node.linhagemId} definitivamente?`)) return;
    setNodes((prev) => prev.filter((n) => n.id !== node.id).map((n) => (n.pais.includes(node.id) ? { ...n, pais: [] } : n)));
    if (node.pais[0]) setNodes((prev) => prev.map((n) => (n.id === node.pais[0] ? { ...n, filhos: n.filhos.filter((f) => f !== node.id) } : n)));
    setIndividuals((prev) => prev.filter((i) => i.especieId !== node.id));
    setSelectedSpeciesId(null);
    setLogVersion((v) => v + 1);
    showToast(`${node.linhagemId} deletada.`);
  };
  const clonarEspecie = (node) => {
    const gClone = JSON.parse(JSON.stringify(node.g));
    /* Duas incoerências no clone original: (1) o nó era marcado como
       isPrimordial:true mas o GENOMA continuava com isPrimordial:false
       quando a origem era derivada — e esse flag governa travas reais
       (magia A0-A3, sem crânio humanoide, sem mente coletiva) e a
       reconstrução por seed; (2) o clado era copiado igual, criando duas
       espécies com o mesmo nome, o que colidia os [[wikilinks]] da ficha
       Obsidian. O clone agora é um primordial de verdade, com identidade
       própria e genoma renormalizado sob as travas de primordial.
       v34 — a identidade não é mais sorteada: `commitPrimordialFromGenome`
       atribui o próximo endereço de linhagem raiz, então o clone vira uma
       linhagem nova e numerada, não um nome novo. */
    gClone.isPrimordial = true;
    const gNormalizado = normalizarGenoma(gClone, true);
    const novo = commitPrimordialFromGenome(gNormalizado, node.auSurgimento, node.massaId);
    const populacao = gerarPopulacaoParaEspecie(novo, TAMANHO_POPULACAO_INICIAL, DIVISOES_POR_MASSA, massaIdx.get(novo.massaId)); // Fase 2, item 5.5
    setNodes((prev) => [...prev, novo]);
    setIndividuals((prev) => [...prev, ...populacao]);
    setLogVersion((v) => v + 1);
    showToast(`${node.linhagemId} clonada como ${novo.linhagemId} (nova espécie primordial independente, mesmo genoma base), com ${populacao.length} indivíduo(s) próprios.`);
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
      `${novos.length} nova(s) espécie(s) derivada(s) de ${node.linhagemId}, ${novaPopulacao.length} indivíduo(s) espalhados.` +
      /* v32 — não existe mais extinção por saturação de linhagens; o que
         pode acontecer agora é o orçamento global de ciclos acabar antes de
         todas as linhagens terminarem, e isso é informação útil (dá pra
         rodar mais ciclos), não uma perda. */
      (filhas.orcamentoEsgotado && filhas.linhagensComCiclosSobrando > 0
        ? ` ${filhas.linhagensComCiclosSobrando} linhagem(ns) ficaram estáveis por falta de orçamento de ciclos — rode a deriva de novo pra continuar de onde parou.`
        : "")
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
    showToast(`Indivíduo ${individuo.nome} criado (${node.linhagemId}).`);
  };

  /* ---------- v33: salvamento automático, restauração e reset ---------- */
  const estadoPersistivel = useMemo(
    () => ({ eras, nodes, individuals, anoAtual, faseGeoConfirmada, faseErasConfirmada }),
    [eras, nodes, individuals, anoAtual, faseGeoConfirmada, faseErasConfirmada]
  );
  const salvarAgora = useAutoSalvamento(estadoPersistivel, {
    ativo: !restaurando,
    aoSalvar: (envelope) => setUltimoSalvamento(envelope),
  });

  /* Restauração na abertura. Roda uma vez, antes de liberar a gravação — se
     rodasse depois, o debounce do estado vazio inicial gravaria por cima da
     sessão que estamos tentando ler. */
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const prefs = await lerPreferencias();
      if (prefs && setEscalaTempo(prefs.escalaTempo)) setEscalaTempoState(getEscalaTempo());
      const salvo = await lerSessaoSalva();
      if (!cancelado && salvo) {
        restaurarEventLog(salvo.dados.eventLog, salvo.dados.contadores?.idCounter, salvo.dados.contadores?.logCounter);
        restaurarDominiosCustom(salvo.dados.dominiosCustom);
        if (typeof salvo.dados.contadores?.idRegiaoCounter === "number") __idRegiaoCounter = Math.max(__idRegiaoCounter, salvo.dados.contadores.idRegiaoCounter);
        if (typeof salvo.dados.contadores?.idEraCounter === "number") __idEraCounter = Math.max(__idEraCounter, salvo.dados.contadores.idEraCounter);
        onImportarProjeto(salvo.dados);
        setUltimoSalvamento(salvo.envelope);
        showToast(`Sessão restaurada: ${salvo.dados.nodes.length} espécie(s).`);
      }
      if (!cancelado) setRestaurando(false);
    })();
    return () => { cancelado = true; };
  }, []);

  const mudarEscalaTempo = (v) => {
    if (!setEscalaTempo(v)) return;
    setEscalaTempoState(getEscalaTempo());
    salvarPreferencias();
    showToast(`Escala de tempo: ${(ESCALAS_TEMPO.find((e) => Number(e.id) === Number(v)) || {}).label || v}.`);
  };

  const apagarCopiaSalva = async () => {
    await apagarSessaoSalva();
    setUltimoSalvamento(null);
    showToast("Cópia salva apagada. O mundo aberto continua aqui.");
  };

  /* Reset total. A ordem importa: primeiro trava a gravação (senão o
     debounce do estado ainda cheio regrava logo depois de apagar), depois
     apaga o disco, depois o motor, depois o React — e só então destrava. */
  const resetarTudo = async () => {
    setRestaurando(true);
    await apagarSessaoSalva();
    resetarMotor();
    setEras([]); setNodes([]); setIndividuals([]); setAnoAtual(0);
    setFaseGeoConfirmada(false); setFaseErasConfirmada(false);
    setSelectedSpeciesId(null); setEditor(null); setModalDerivarNode(null);
    setIndividualViewer(null); setSeedSearchAberto(false); setSeedSearchTexto("");
    setUltimoSalvamento(null);
    setLogVersion((v) => v + 1);
    setDominiosVersion((v) => v + 1);
    setConfigAberto(false);
    setTimeout(() => setRestaurando(false), 0);
    showToast("Tudo apagado. Recomeçando da Fase 1.");
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
    showToast(`${node.linhagemId} adicionada ao mundo a partir da seed, com ${populacao.length} indivíduo(s).`);
  };

  /* ---------- v29: materializar uma trilha de deriva na árvore ----------
     A busca de trilha (adiante ou para trás) já devolvia a linhagem inteira,
     mas o app só sabia COPIAR isso como texto pro usuário colar à mão na
     criação de um primordial — os passos intermediários, que são justamente
     a árvore descoberta, eram jogados fora. Aqui a trilha vira nós de
     verdade, com populações, igual a qualquer outra espécie do mundo.

     `origemNode` = trilha adiante (a linhagem pendura na espécie atual).
     `alvoNode`   = trilha para trás a partir de uma espécie que já existe:
     em vez de criar uma gêmea de DNA idêntico, a espécie existente é
     REPARENTADA sob o último nó reconstruído. Isso só é possível se ela for
     raiz (primordial sem ancestral); se já tiver ancestral, a linhagem entra
     como ramo paralelo terminando numa espécie de mesmo DNA. */
  const materializarLinhagem = (resultado, { origemNode = null, alvoNode = null } = {}) => {
    if (!resultado?.sucesso || !resultado.trilha?.length) { showToast("Não há trilha para gerar — rode a busca primeiro."); return null; }
    const podeReparentar = !!alvoNode && !origemNode && (!alvoNode.pais || alvoNode.pais.length === 0);
    const massaId = origemNode?.massaId || alvoNode?.massaId || eraAtual?.massas[0]?.id || null;
    const auInicial = origemNode ? origemNode.auSurgimento : Math.max(0, (alvoNode?.auSurgimento ?? eraAtual?.auInicio ?? 0) - 1);
    const { novos, anexarA } = materializarTrilha(resultado, {
      origem: origemNode || null,
      massaId,
      auInicial,
      finalExistente: podeReparentar ? alvoNode : null,
    });
    if (!novos.length) { showToast("A trilha não produziu nenhuma espécie nova."); return null; }

    let populacao = [];
    for (const n of novos) populacao = populacao.concat(gerarPopulacaoParaEspecie(n, TAMANHO_POPULACAO_INICIAL, DIVISOES_POR_MASSA, massaIdx.get(n.massaId)));

    setNodes((prev) => {
      let base = prev.map((n) => (origemNode && n.id === origemNode.id ? { ...n, filhos: [...n.filhos] } : n));
      if (podeReparentar && anexarA) {
        /* reparentagem: a espécie existente deixa de ser raiz e passa a
           descender do último nó reconstruído — junto com toda a subárvore
           dela, que precisa herdar o primordialId novo, senão a árvore
           mostraria dois primordiais para a mesma linhagem. */
        const novoPrimordialId = novos[0].primordialId;
        const filhosPorPai = new Map();
        for (const n of base) for (const pai of (n.pais || [])) {
          if (!filhosPorPai.has(pai)) filhosPorPai.set(pai, []);
          filhosPorPai.get(pai).push(n.id);
        }
        const subarvore = new Set([alvoNode.id]);
        const fila = [alvoNode.id];
        let guard = 0;
        while (fila.length && guard++ < 10000) {
          const atual = fila.shift();
          for (const f of (filhosPorPai.get(atual) || [])) if (!subarvore.has(f)) { subarvore.add(f); fila.push(f); }
        }
        base = base.map((n) => {
          if (!subarvore.has(n.id)) return n;
          if (n.id === alvoNode.id) return { ...n, pais: [anexarA], isPrimordial: false, primordialId: novoPrimordialId, g: { ...n.g, isPrimordial: false } };
          return { ...n, primordialId: novoPrimordialId };
        });
        const ultimo = novos.find((n) => n.id === anexarA);
        if (ultimo && !ultimo.filhos.includes(alvoNode.id)) ultimo.filhos.push(alvoNode.id);
        /* v34 — reparentar muda o ENDEREÇO de toda a subárvore: o que era o
           primordial 3 vira, digamos, o neto 112, e todos os descendentes
           dele passam a pender de 112. Como o id existe justamente para
           descrever a linhagem, deixá-lo desatualizado seria pior que não
           tê-lo. Recalculado sobre a árvore inteira, que é barato e não
           depende de adivinhar quais nós foram afetados. */
        return recalcularTodasAsLinhagens([...base, ...novos]);
      }
      return [...base, ...novos];
    });
    setIndividuals((prev) => [...prev, ...populacao]);
    setAnoAtual((a) => novos.reduce((m, n) => Math.max(m, n.auSurgimento), a));
    setLogVersion((v) => v + 1);
    showToast(
      `Linhagem gerada na árvore: ${novos.length} espécie(s), ${populacao.length} indivíduo(s).` +
      (podeReparentar ? ` ${alvoNode.linhagemId} deixou de ser primordial e passou a descender de ${novos[0].linhagemId}.` : "")
    );
    return novos;
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
            <p className="font-data text-[10px] text-stone-500 tracking-wider truncate">v35 · edição precisa de DNA, dezenas de genes, travas sempre ativas</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* v34 — no celular ficam só busca e configurações. Os outros quatro
              (testes, patchnotes, importar, exportar) mudaram para dentro do
              painel de configurações: seis ícones nesta barra espremiam o
              título e nenhum deles é de uso frequente. Em telas grandes, onde
              sobra espaço, continuam à mão. */}
          <button onClick={() => abrirBusca()} title="Buscar por seed, DNA ou texto" className="p-2 rounded border border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-600"><Search size={14} /></button>
          <div className="hidden sm:flex items-center gap-2">
            <button onClick={() => setTestesAberto(true)} title="Bateria de testes" className="p-2 rounded border border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-600"><FlaskConical size={14} /></button>
            <button onClick={() => setPatchnotesAberto(true)} title="Patchnotes" className="p-2 rounded border border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-600"><FileText size={14} /></button>
            <PersistenceBar eras={eras} nodes={nodes} individuals={individuals} anoAtual={anoAtual} faseGeoConfirmada={faseGeoConfirmada} faseErasConfirmada={faseErasConfirmada} onImportar={onImportarProjeto} showToast={showToast} />
          </div>
          <IndicadorSalvamento ultimoSalvamento={ultimoSalvamento} onAbrir={() => setConfigAberto(true)} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <BarraPWA />
        <BarraFases faseAtual={faseAtual} geoOk={faseGeoConfirmada} erasOk={faseErasConfirmada} />

        {/* Antes: renderizada só na fase 1 e sempre com jaConfirmada={false},
            o que tornava o resumo da geografia código morto — depois de
            confirmar, o usuário perdia a visão das massas de terra do mundo. */}
        {(faseAtual === 1 || eras.length > 0) && (
          <FaseGeografia onConfirmar={confirmarGeografia} jaConfirmada={faseGeoConfirmada} eras={eras} dominiosDisponiveis={dominiosDisponiveis} dominiosCustom={DOMINIOS_CUSTOM} onAdicionarDominio={onAdicionarDominio} onRemoverDominio={onRemoverDominio} onEditarMassa={aoEditarMassa} onResortearBiomas={aoResortearBiomas} onDefinirBiomaDivisao={aoDefinirBiomaDivisao} />
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
          onMaterializarTrilha={materializarLinhagem}
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

      {testesAberto && <PainelTestes onFechar={() => setTestesAberto(false)} showToast={showToast} />}
      {configAberto && (
        <PainelConfiguracoes
          onFechar={() => setConfigAberto(false)}
          ultimoSalvamento={ultimoSalvamento}
          onSalvarAgora={salvarAgora}
          onApagarSalvamento={apagarCopiaSalva}
          onResetarTudo={resetarTudo}
          escalaTempo={escalaTempo}
          onMudarEscala={mudarEscalaTempo}
          totais={{ especies: nodes.length, individuos: individuals.length, eras: eras.length }}
          showToast={showToast}
          onAbrirPatchnotes={() => { setConfigAberto(false); setPatchnotesAberto(true); }}
          onAbrirTestes={() => { setConfigAberto(false); setTestesAberto(true); }}
          barraProjeto={<PersistenceBar eras={eras} nodes={nodes} individuals={individuals} anoAtual={anoAtual} faseGeoConfirmada={faseGeoConfirmada} faseErasConfirmada={faseErasConfirmada} onImportar={onImportarProjeto} showToast={showToast} rotulos />}
        />
      )}

      {seedSearchAberto && (
        <SeedSearchModal
          textoInicial={seedSearchTexto}
          onFechar={() => setSeedSearchAberto(false)}
          onAdicionarComoPrimordial={adicionarSeedComoPrimordial}
          onMaterializarTrilha={materializarLinhagem}
          eraAtual={eraAtual}
          showToast={showToast}
        />
      )}

      {toast && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-stone-900 border border-emerald-800 text-emerald-300 text-xs font-mono px-4 py-2 rounded shadow-lg z-50">{toast}</div>}

      {patchnotesAberto && <PainelPatchnotes onFechar={() => setPatchnotesAberto(false)} />}

      <footer className="max-w-4xl mx-auto px-4 sm:px-6 pb-10 pt-4 text-[10px] text-stone-700 font-data">DRN2 v35 · Droerni — campos editáveis expandidos, travas sempre ativas</footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
