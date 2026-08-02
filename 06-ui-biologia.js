/* ============================================================
   GERAÇÃO EM MASSA — tenta até 5x por primordial pra nunca
   commitar um genoma com contradição bloqueante (a validação
   nunca é "avisar depois": aqui ela filtra ANTES de existir).
   ============================================================ */
function gerarPrimordialValido(auInicial, massaId) {
  let g = buildSpecies(null, {}, true, false).g;
  for (let tent = 0; tent < 5 && temErroBloqueante(validarCoerencia(g)); tent++) g = buildSpecies(null, {}, true, false).g;
  /* As 5 tentativas podiam esgotar e commitar um genoma contraditório
     mesmo assim. Agora, se ainda houver erro bloqueante, ele é corrigido
     e renormalizado — o mesmo caminho que o motor de deriva usa —, de
     modo que nenhuma espécie chega a existir com um erro que o app
     recusaria na criação manual. */
  if (temErroBloqueante(validarCoerencia(g))) aplicarCorrecoesAutomaticas(g);
  return commitPrimordialFromGenome(g, auInicial, massaId);
}

function BarraProgresso({ fracao, label }) {
  const pct = Math.round(Math.min(1, Math.max(0, fracao)) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] font-mono text-stone-500">
        <span>{label}</span><span>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-stone-900 border border-stone-800 overflow-hidden">
        <div className="h-full bg-emerald-600 transition-[width] duration-150" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ModalGerarEcossistema({ eraAtual, onGerar, onFechar, gerando, progresso, progressoLabel }) {
  const [qtd, setQtd] = useState("5");
  const [ciclosMin, setCiclosMin] = useState("15");
  const [ciclosMax, setCiclosMax] = useState("35");

  /* Ciclos deixaram de ter um teto artificial. Ele existia só pra evitar
     travar a aba — mas limitar ciclos limita quantas chances de
     especiação (logo, de BIFURCAÇÃO) uma linhagem tem, o que empobrece
     a árvore justamente no ponto que mais importa. A proteção real
     contra explosão é MAX_ESPECIES_POR_DERIVACAO no motor (3000 por
     linhagem); o travamento em si foi resolvido fatiando o trabalho no
     tempo (derivarLinhagem agora é assíncrona) e mostrando progresso
     real em vez de congelar a aba sem feedback nenhum. */
  const n = Math.max(1, Math.min(30, Number(qtd) || 1));
  const cMin = Math.max(0, Number(ciclosMin) || 0);
  const cMax = Math.max(cMin, Number(ciclosMax) || cMin);

  const gerar = () => onGerar(n, cMin, cMax);

  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-lg w-full max-w-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest">Gerar Ecossistema</h2>
          {!gerando && <button onClick={onFechar} className="text-stone-500 hover:text-stone-200"><X size={18} /></button>}
        </div>

        {gerando ? (
          <BarraProgresso fracao={progresso} label={progressoLabel || "Gerando…"} />
        ) : (
          <>
            <div>
              <label className="text-[10px] uppercase text-stone-500 font-mono">Nº de primordiais (1-30)</label>
              <CampoNumero value={qtd} onChange={setQtd} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[10px] uppercase text-stone-500 font-mono">Ciclos de deriva (mín)</label><CampoNumero value={ciclosMin} onChange={setCiclosMin} /></div>
              <div><label className="text-[10px] uppercase text-stone-500 font-mono">Ciclos de deriva (máx)</label><CampoNumero value={ciclosMax} onChange={setCiclosMax} /></div>
            </div>
            <p className="text-[10px] text-stone-600">Cada primordial nasce em uma massa aleatória da era atual e deriva um nº aleatório de ciclos dentro da faixa acima. Contradições de coerência são corrigidas automaticamente, tanto na criação quanto a cada ciclo de deriva. Sem teto de ciclos — a geração roda em segundo plano com barra de progresso.</p>
            <BotaoPrimario onClick={gerar}>Gerar</BotaoPrimario>
          </>
        )}
      </div>
    </div>
  );
}

function ModalDerivar({ node, onDerivar, onFechar, derivando, progresso }) {
  const [ciclos, setCiclos] = useState("5");
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-lg w-full max-w-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest">Derivar · {node.clado}</h2>
          {!derivando && <button onClick={onFechar} className="text-stone-500 hover:text-stone-200"><X size={18} /></button>}
        </div>
        {derivando ? (
          <BarraProgresso fracao={progresso} label="Derivando…" />
        ) : (
          <>
            <div><label className="text-[10px] uppercase text-stone-500 font-mono">Ciclos de deriva</label><CampoNumero value={ciclos} onChange={setCiclos} /></div>
            <BotaoPrimario onClick={() => onDerivar(Math.max(1, Number(ciclos) || 1))}>Derivar</BotaoPrimario>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   LISTA DE ESPÉCIES — agrupada por árvore primordial
   ============================================================ */
function CardEspecie({ node, onClick, individuosCount }) {
  const pesoCal = useMemo(() => calcularPesoCalorias(node.g), [node]);
  return (
    <button onClick={onClick} className="w-full text-left rounded border border-stone-800 hover:border-emerald-800 bg-stone-950/50 p-2.5 transition-colors">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-stone-200">{node.clado}</span>
        {node.isPrimordial && <Badge className="border-amber-800 text-amber-500">primordial</Badge>}
      </div>
      <div className="text-[10px] text-stone-500 mt-1">{REINO_LABEL[node.g.reino] || node.g.reino} · {fmtKg(pesoCal.pesoKg)} · {fmtAU(node.auSurgimento)}</div>
      <div className="flex gap-2 mt-1 text-[10px] text-stone-600">
        {node.filhos.length > 0 && <span>{node.filhos.length} descendente(s)</span>}
        {individuosCount > 0 && <span>{individuosCount} indivíduo(s)</span>}
      </div>
    </button>
  );
}

/* ============================================================
   ÁRVORE GENEALÓGICA — cada primordial é a raiz de uma árvore
   navegável (filhos reais, não uma lista plana). Substituiu a
   grade de cards agrupada por primordial: antes a genealogia só
   existia como contagem ("N espécie(s) na linhagem"); agora dá
   pra ver quem descende de quem, e clicar em qualquer nó abre o
   SpeciesViewer dele.

   Profundidade 0-1 sempre expandida; a partir da 2ª geração
   começa recolhida. Decisão de custo: uma linhagem longa (a
   deriva permite até MAX_ESPECIES_POR_DERIVACAO = 3000 nós) não
   pode renderizar tudo aberto de uma vez sem travar o celular —
   o usuário expande sob demanda, como uma árvore de arquivos.
   ============================================================ */
function NodeArvore({ node, idx, profundidade, onAbrir, individuosPorEspecie }) {
  const [aberto, setAberto] = useState(profundidade < 2);
  const filhos = useMemo(() => node.filhos.map((id) => idx.get(id)).filter(Boolean), [node, idx]);
  const pesoCal = useMemo(() => calcularPesoCalorias(node.g), [node]);
  const indCount = individuosPorEspecie[node.id] || 0;
  return (
    <div>
      <div className="flex items-center gap-1 py-0.5" style={{ paddingLeft: profundidade * 14 }}>
        {filhos.length > 0 ? (
          <button onClick={() => setAberto((v) => !v)} className="text-stone-600 hover:text-emerald-400 shrink-0">
            {aberto ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        ) : <span className="w-[11px] shrink-0" />}
        <button onClick={() => onAbrir(node.id)} className="flex items-center gap-1.5 text-left hover:text-emerald-400 group min-w-0">
          <Dna size={10} className="text-stone-700 group-hover:text-emerald-500 shrink-0" />
          <span className="font-mono text-xs text-stone-200 group-hover:text-emerald-400 truncate">{node.clado}</span>
          {node.isPrimordial && <Badge className="border-amber-800 text-amber-500 shrink-0">primordial</Badge>}
          <span className="text-[10px] text-stone-600 shrink-0 hidden sm:inline">{REINO_LABEL[node.g.reino] || node.g.reino} · {fmtKg(pesoCal.pesoKg)} · {fmtAU(node.auSurgimento)}</span>
          {filhos.length > 0 && <span className="text-[10px] text-stone-700 shrink-0">{filhos.length} filho(s)</span>}
          {indCount > 0 && <span className="text-[10px] text-stone-700 shrink-0">· {indCount} indivíduo(s)</span>}
        </button>
      </div>
      {aberto && filhos.length > 0 && (
        <div className="border-l border-stone-800 ml-2">
          {filhos.map((f) => (
            <NodeArvore key={f.id} node={f} idx={idx} profundidade={profundidade + 1} onAbrir={onAbrir} individuosPorEspecie={individuosPorEspecie} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArvoreGenealogicaGlobal({ nodes, idx, individuals, onAbrir }) {
  const primordiais = nodes.filter((n) => n.isPrimordial);
  const individuosPorEspecie = useMemo(() => {
    const m = {};
    for (const ind of individuals) m[ind.especieId] = (m[ind.especieId] || 0) + 1;
    return m;
  }, [individuals]);
  return (
    <div className="space-y-3">
      {primordiais.map((prim) => {
        const linhagem = nodes.filter((n) => n.primordialId === prim.id);
        return (
          <div key={prim.id} className="rounded border border-stone-800 bg-stone-950/40 p-2">
            <div className="text-[10px] uppercase tracking-widest text-stone-600 font-mono mb-1.5 px-1">{prim.clado} · {linhagem.length} espécie(s) na linhagem</div>
            <NodeArvore node={prim} idx={idx} profundidade={0} onAbrir={onAbrir} individuosPorEspecie={individuosPorEspecie} />
          </div>
        );
      })}
    </div>
  );
}

function PainelBiologia({ eras, nodes, setNodes, individuals, setIndividuals, onAbrirViewer, onCriarPrimordial, showToast, onLog, idx }) {
  const [modalEcossistema, setModalEcossistema] = useState(false);
  const [visao, setVisao] = useState("arvore"); // "arvore" | "lista" — árvore é o padrão pedido
  const eraAtual = eras[eras.length - 1];
  const primordiais = nodes.filter((n) => n.isPrimordial);

  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [progressoLabel, setProgressoLabel] = useState("");

  /* Assíncrona: cada derivarLinhagem já cede o controle ao navegador
     periodicamente (fatiamento de tempo no motor), então esperar por ela
     aqui não trava a aba — só mantém a UI num estado "gerando" enquanto
     o trabalho corre em segundo plano. O progresso reportado combina
     "quantos primordiais já terminaram" com o progresso interno do
     primordial em andamento, para a barra não pular em degraus grandes
     quando há poucos primordiais. */
  const gerarEcossistema = async (n, cMin, cMax) => {
    setGerando(true); setProgresso(0);
    const novos = [];
    let tetoAtingido = false;
    for (let i = 0; i < n; i++) {
      setProgressoLabel(`Primordial ${i + 1} de ${n}…`);
      const massa = eraAtual.massas[Math.floor(Math.random() * eraAtual.massas.length)];
      /* auInicio + fração aleatória de 1 AU. Antes era `Math.random() * 0.5`
         sobre uma unidade que a UI rotulava como bilhões — cada primordial
         nascia espalhado por até 500 milhões de anos sem motivo. Com AU = 1
         milhão de anos (AU_EM_ANOS), a dispersão vira meio milhão de anos,
         que é uma janela plausível para o surgimento de linhagens-raiz. */
      const auInicial = eraAtual.auInicio + Math.random() * 0.5;
      const primordial = gerarPrimordialValido(auInicial, massa?.id);
      novos.push(primordial);
      const ciclos = cMin + Math.floor(Math.random() * (cMax - cMin + 1));
      if (ciclos > 0) {
        const filhas = await derivarLinhagem(primordial, ciclos, (filha) => novos.push(filha), (fracaoLocal) => {
          setProgresso((i + fracaoLocal) / n);
        });
        if (filhas.tetoAtingido) tetoAtingido = true;
      }
      setProgresso((i + 1) / n);
    }
    setNodes((prev) => [...prev, ...novos]);
    setModalEcossistema(false);
    setGerando(false);
    /* Sem este bump o painel de log não atualizava: __eventLog é mutado em
       lugar, então o useMemo do App devolve sempre a MESMA referência de
       array e o React não vê mudança nenhuma. Os eventos do ecossistema
       ficavam invisíveis até outra ação bumpar a versão por acaso. */
    onLog();
    showToast(
      `Ecossistema gerado: ${n} primordial(is), ${novos.length} espécie(s) no total.` +
      (tetoAtingido ? " Teto de espécies por linhagem atingido — a deriva parou antes do fim." : "")
    );
  };

  /* simularSelecaoNatural, avaliarInteracao, especiesVivasEmAU e
     auFimDeVida estavam escritos e completos no motor, mas nenhuma delas
     era chamada em lugar nenhum — a exigência de "mudança numa espécie
     recalcula as interações" não tinha como ser atendida porque nada
     recalculava interação nenhuma. Aqui a leitura roda por massa de
     terra, no AU mais recente em que aquela massa tem espécies vivas:
     um passe determinístico e limitado, em vez de varrer toda a linha do
     tempo (que seria O(AUs x espécies²)). */
  const recalcularInteracoes = () => {
    const idx = buildIndex(nodes);
    const massas = eraAtual.massas;
    let totalAplicadas = 0, totalAvaliadas = 0;
    for (const massa of massas) {
      const daMassa = nodes.filter((n) => n.massaId === massa.id);
      if (daMassa.length < 2) continue;
      const au = Math.max(...daMassa.map((n) => n.auSurgimento));
      const { vivas, aplicadas } = simularSelecaoNatural(nodes, idx, au, massa.id);
      totalAvaliadas += vivas.length;
      totalAplicadas += aplicadas.length;
    }
    if (totalAplicadas > 0) setNodes((prev) => prev.map((n) => ({ ...n })));
    onLog();
    showToast(
      totalAvaliadas < 2
        ? "Nenhuma massa de terra tem duas espécies contemporâneas para interagir."
        : `${totalAvaliadas} espécie(s) contemporânea(s) avaliada(s) — ${totalAplicadas} sofreram pressão de predação ou competição.`
    );
  };

  return (
    <Section title="Fase 3 · Biologia" accent="text-emerald-500">
      <div className="flex flex-wrap gap-2 mb-4">
        <BotaoPrimario onClick={() => setModalEcossistema(true)}><Sparkles size={12} className="inline -mt-0.5 mr-1" />Gerar Ecossistema</BotaoPrimario>
        <button onClick={onCriarPrimordial} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-2"><Dices size={12} className="inline -mt-0.5 mr-1" />Criar Primordial Manualmente</button>
        {nodes.length > 1 && (
          <button onClick={recalcularInteracoes} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-2"><GitBranch size={12} className="inline -mt-0.5 mr-1" />Recalcular Interações</button>
        )}
      </div>

      {primordiais.length === 0 && <div className="text-xs text-stone-600 py-6 text-center">Nenhuma espécie ainda. Gere um ecossistema ou crie um primordial manualmente.</div>}

      {primordiais.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 mb-3">
            <button onClick={() => setVisao("arvore")} className={`text-[10px] font-mono uppercase px-2.5 py-1 rounded border ${visao === "arvore" ? "border-emerald-700 bg-emerald-950/50 text-emerald-400" : "border-stone-800 text-stone-500 hover:text-stone-300"}`}>
              <GitBranch size={11} className="inline -mt-0.5 mr-1" />Árvore Genealógica
            </button>
            <button onClick={() => setVisao("lista")} className={`text-[10px] font-mono uppercase px-2.5 py-1 rounded border ${visao === "lista" ? "border-emerald-700 bg-emerald-950/50 text-emerald-400" : "border-stone-800 text-stone-500 hover:text-stone-300"}`}>
              Lista
            </button>
          </div>

          {visao === "arvore" ? (
            <ArvoreGenealogicaGlobal nodes={nodes} idx={idx} individuals={individuals} onAbrir={onAbrirViewer} />
          ) : (
            <div className="space-y-4">
              {primordiais.map((prim) => {
                const linhagem = nodes.filter((n) => n.primordialId === prim.id);
                return (
                  <div key={prim.id}>
                    <div className="text-[10px] uppercase tracking-widest text-stone-600 font-mono mb-1.5">{prim.clado} · {linhagem.length} espécie(s) na linhagem</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {linhagem.map((n) => (
                        <CardEspecie key={n.id} node={n} onClick={() => onAbrirViewer(n.id)} individuosCount={individuals.filter((i) => i.especieId === n.id).length} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {modalEcossistema && <ModalGerarEcossistema eraAtual={eraAtual} onGerar={gerarEcossistema} onFechar={() => setModalEcossistema(false)} gerando={gerando} progresso={progresso} progressoLabel={progressoLabel} />}
    </Section>
  );
}

/* ============================================================
   LOG DO ECOSSISTEMA
   ============================================================ */
function PainelLog({ eventLog }) {
  const [expandido, setExpandido] = useState(false);
  /* "ver todos" renderizava o log inteiro de uma vez — 7.902 nós de DOM
     no pior caso medido, o que congela a página no celular. O expandido
     agora mostra os 300 eventos mais recentes; o histórico completo
     continua acessível pelo export .txt, que é o formato pedido para
     leitura longa mesmo. */
  const TETO_RENDER = 300;
  const itens = expandido ? eventLog.slice(-TETO_RENDER) : eventLog.slice(-8);
  const ocultos = expandido ? Math.max(0, eventLog.length - TETO_RENDER) : 0;
  return (
    <Section title="Histórico de Eventos" accent="text-stone-500" right={eventLog.length > 8 && <button onClick={() => setExpandido((v) => !v)} className="text-[10px] font-mono text-stone-500 hover:text-emerald-400">{expandido ? "recolher" : `ver todos (${eventLog.length})`}</button>}>
      {ocultos > 0 && <div className="text-[10px] text-stone-600 mb-2">Mostrando os {TETO_RENDER} eventos mais recentes de {eventLog.length}. Use o export .txt para o histórico completo.</div>}
      {eventLog.length === 0 ? <div className="text-xs text-stone-600">Nenhum evento ainda.</div> : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {itens.slice().reverse().map((e) => (
            <div key={e.seq} className="text-[11px] font-data border-l-2 border-stone-800 pl-2 py-0.5">
              <span className="text-stone-600">[#{e.seq}]</span> <span className="text-emerald-600">{e.tipoLabel}</span> <span className="text-stone-400">{e.clado}</span>
              <div className="text-stone-600">{e.texto}</div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
