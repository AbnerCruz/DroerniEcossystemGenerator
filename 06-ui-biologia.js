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
  /* v32 — os padrões subiram de 15-35 para 120-200 ciclos. Medido nesta
     versão: com 35 ciclos a árvore para com ~11 nós, todos bactéria, porque
     a linhagem não teve tempo de atravessar a barreira de reino; com 150
     ciclos saem ~780 espécies e a proporção de bactéria cai para ~23%, que é
     o mundo povoado que se quer. O que tornava esse padrão inviável antes
     era não saber quanto ia demorar — e a estimativa desta versão passou a
     ser exata (ver estimarTempoDeriva). */
  const [ciclosMin, setCiclosMin] = useState("120");
  const [ciclosMax, setCiclosMax] = useState("200");
  const [concorrencia, setConcorrencia] = useState(String(getConcorrenciaDeriva()));
  /* v32 — trilhas dirigidas geradas JUNTO com os primordiais, em vez de
     precisarem de uma segunda operação isolada. Um DNA-alvo por linha. */
  const [alvosTexto, setAlvosTexto] = useState("");

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

  const alvos = alvosTexto.split("\n").map((x) => x.trim()).filter(Boolean);
  const alvosValidos = alvos.filter((a) => ehCodigoDRN2(a));
  const gerar = () => {
    setConcorrenciaDeriva(Number(concorrencia) || 64);
    onGerar(n, cMin, cMax, alvosValidos);
  };

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
            <div>
              <label className="text-[10px] uppercase text-stone-500 font-mono">Linhagens simultâneas (concorrência)</label>
              <input type="range" min="8" max="256" step="8" value={concorrencia}
                onChange={(e) => setConcorrencia(e.target.value)} className="w-full accent-emerald-600" />
              <div className="text-[10px] text-stone-500 font-data text-center">{concorrencia} linhagens por rodada</div>
              <p className="text-[10px] text-stone-600 mt-0.5">
                Quantas linhagens avançam por rodada — não é mais um teto de população: nenhuma
                linhagem é extinta para caber. Mais concorrência = árvore maior e mais ramificada,
                e proporcionalmente mais tempo de processamento.
              </p>
            </div>

            <div>
              <label className="text-[10px] uppercase text-stone-500 font-mono">DNAs-alvo para gerar junto (opcional, 1 por linha)</label>
              <textarea value={alvosTexto} onChange={(e) => setAlvosTexto(e.target.value)} rows={2}
                placeholder={"DRN2-TAX:An.REP.Xyz-MOR:...\nDRN2-TAX:An.AVE.Abc-MOR:..."}
                className="w-full text-[10px] font-mono bg-stone-950 border border-stone-800 rounded px-2 py-1.5 text-stone-300 placeholder-stone-600 focus:border-emerald-700 focus:outline-none" />
              <p className="text-[10px] text-stone-600 mt-0.5">
                Cada alvo vira um ramo de uma linhagem própria, gerada na mesma leva dos
                primordiais. {alvos.length > 0 && `${alvosValidos.length} de ${alvos.length} linha(s) são códigos DRN2 válidos.`}
              </p>
            </div>

            <p className="text-[10px] text-stone-600">Cada primordial nasce em uma massa aleatória da era atual e deriva um nº aleatório de ciclos dentro da faixa acima. Contradições de coerência são corrigidas automaticamente, tanto na criação quanto a cada ciclo de deriva. Sem teto de ciclos — a geração roda em segundo plano com barra de progresso.</p>
            {/* v26 — estimativa de tempo antes de rodar. A deriva longa é
                pesada no celular (600 ciclos ≈ 20s mesmo depois da otimização
                desta versão); em vez de impor um teto artificial de ciclos,
                que empobreceria a bifurcação da árvore, o app avisa e deixa a
                decisão com o usuário. */}
            {(() => {
              const cMax = Math.max(1, Number(ciclosMax) || 1);
              const est = estimarTempoDeriva(cMax, n);
              return (
                <p className={`text-[10px] ${est.pesado ? "text-amber-500" : "text-stone-600"}`}>
                  Tempo estimado neste aparelho: <span className="font-mono">{est.texto}</span>
                  {est.pesado ? " — roda em segundo plano, mas prepare-se pra esperar." : ""}
                </p>
              );
            })()}
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

/* v23 — pergunta quantos ciclos de seleção natural populacional
   rodar, toda vez que o botão é apertado (não roda mais um único
   passe fixo escondido atrás de "Recalcular Interações"). Mesmo
   padrão visual do ModalDerivar. */
function ModalSelecaoNatural({ onRodar, onFechar, rodando, progresso }) {
  const [ciclos, setCiclos] = useState("10");
  return (
    <div className="fixed inset-0 z-40 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-lg w-full max-w-sm p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest">Rodar Seleção Natural</h2>
          {!rodando && <button onClick={onFechar} className="text-stone-500 hover:text-stone-200"><X size={18} /></button>}
        </div>
        {rodando ? (
          <BarraProgresso fracao={progresso} label="Simulando colisões de população…" />
        ) : (
          <>
            <div><label className="text-[10px] uppercase text-stone-500 font-mono">Quantos ciclos?</label><CampoNumero value={ciclos} onChange={setCiclos} /></div>
            <p className="text-[10px] text-stone-600">
              Cada ciclo agrupa os indivíduos vivos por massa de terra e divisão simulada. Onde indivíduos de
              espécies diferentes coexistem na mesma divisão, a espécie mais fraca sofre pressão genética
              (predação ou competição) e perde população local; a mais forte nasce um indivíduo novo ali.
              O ano atual avança {duracaoCicloSelecao()} AU por ciclo.
            </p>
            <BotaoPrimario onClick={() => onRodar(Math.max(1, Number(ciclos) || 1))}>Rodar</BotaoPrimario>
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
    <button onClick={onClick} className={`w-full text-left rounded border border-stone-800 hover:border-emerald-800 bg-stone-950/50 p-2.5 transition-colors ${node.extinta ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className={`font-mono text-[9px] tracking-widest ${REINO_COR[node.g.reino] || "text-stone-500"}`}>{REINO_CURTO[node.g.reino] || node.g.reino}</span>
          <span className="font-mono text-xs text-stone-200 truncate">{node.clado}</span>
        </span>
        <div className="flex gap-1">
          {node.isPrimordial && <Badge className="border-amber-800 text-amber-500">primordial</Badge>}
          {node.extinta && <Badge className="border-red-800 text-red-500">✝ extinta</Badge>}
        </div>
      </div>
      <div className="text-[10px] text-stone-500 mt-1">{REINO_LABEL[node.g.reino] || node.g.reino} · {fmtKg(pesoCal.pesoKg)} · {fmtAU(node.auSurgimento)}</div>
      <div className="text-[9px] font-mono text-stone-700 mt-0.5 truncate">{node.code}</div>{/* Fase 4, item 7.1 */}
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
function NodeArvore({ node, idx, profundidade, onAbrir, individuosPorEspecie, visiveis }) {
  const [aberto, setAberto] = useState(profundidade < 2);
  /* v29 — `visiveis` (quando presente) é o conjunto de ids que o filtro
     "ocultar extintas" deixa passar: espécies vivas MAIS os ancestrais
     extintos que ainda têm descendência viva. Sem essa segunda parte, o
     filtro cortaria o meio da árvore e órfãos vivos sumiriam junto. */
  const filhos = useMemo(
    () => node.filhos.map((id) => idx.get(id)).filter((f) => f && (!visiveis || visiveis.has(f.id))),
    [node, idx, visiveis]
  );
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
        <button onClick={() => onAbrir(node.id)} title={node.code} className={`flex items-center gap-1.5 text-left hover:text-emerald-400 group min-w-0 ${node.extinta ? "opacity-50" : ""}`}>
          <Dna size={10} className="text-stone-700 group-hover:text-emerald-500 shrink-0" />
          <span className={`font-mono text-[9px] tracking-widest shrink-0 ${REINO_COR[node.g.reino] || "text-stone-500"}`}>{REINO_CURTO[node.g.reino] || node.g.reino}</span>
          <span className="font-mono text-xs text-stone-200 group-hover:text-emerald-400 truncate">{node.clado}</span>
          {node.isPrimordial && <Badge className="border-amber-800 text-amber-500 shrink-0">primordial</Badge>}
          {node.extinta && <Badge className="border-red-800 text-red-500 shrink-0">✝ extinta</Badge>}
          <span className="text-[10px] text-stone-600 shrink-0 hidden sm:inline">{fmtKg(pesoCal.pesoKg)} · {fmtAU(node.auSurgimento)}</span>
          <span className="text-[9px] font-mono text-stone-700 shrink-0 hidden md:inline truncate max-w-[140px]">{node.code}</span>{/* Fase 4, item 7.1 */}
          {filhos.length > 0 && <span className="text-[10px] text-stone-700 shrink-0">{filhos.length} filho(s)</span>}
          {indCount > 0 && <span className="text-[10px] text-stone-700 shrink-0">· {indCount} indivíduo(s)</span>}
        </button>
      </div>
      {aberto && filhos.length > 0 && (
        <div className="border-l border-stone-800 ml-2">
          {filhos.map((f) => (
            <NodeArvore key={f.id} node={f} idx={idx} profundidade={profundidade + 1} onAbrir={onAbrir} individuosPorEspecie={individuosPorEspecie} visiveis={visiveis} />
          ))}
        </div>
      )}
    </div>
  );
}

/* v29 — conjunto de ids que sobrevivem ao filtro "só espécies vivas":
   toda espécie não extinta, mais todos os ancestrais dela (mesmo extintos),
   porque sem os ancestrais a árvore perde os galhos que ligam as vivas à
   raiz e as vivas somem junto com os mortos. Ancestral extinto mantido
   aparece esmaecido, como já aparecia. */
function idsVisiveisSoVivas(nodes, idx) {
  const visiveis = new Set();
  for (const n of nodes) {
    if (n.extinta) continue;
    let cur = n, guard = 0;
    while (cur && guard++ < 500) {
      if (visiveis.has(cur.id)) break;
      visiveis.add(cur.id);
      cur = cur.pais && cur.pais[0] ? idx.get(cur.pais[0]) : null;
    }
  }
  return visiveis;
}

function ArvoreGenealogicaGlobal({ nodes, idx, individuals, onAbrir, ocultarExtintas, filtroEstado, ctxFiltro }) {
  const individuosPorEspecie = useMemo(() => {
    const m = {};
    for (const ind of individuals) m[ind.especieId] = (m[ind.especieId] || 0) + 1;
    return m;
  }, [individuals]);
  /* v32 — o conjunto visível agora é a INTERSEÇÃO de duas regras que seguem
     o mesmo princípio: mostrar quem casa mais os ancestrais que ligam esses
     nós à raiz. "Só vivas" (v29) continua igual; o filtro geral usa
     idsVisiveisComFiltro. Quando os dois estão ligados, um nó precisa passar
     nos dois conjuntos. */
  const visiveis = useMemo(() => {
    const porVida = ocultarExtintas ? idsVisiveisSoVivas(nodes, idx) : null;
    const resultadoFiltro = filtroEstado ? idsVisiveisComFiltro(nodes, idx, filtroEstado, ctxFiltro) : null;
    const porFiltro = resultadoFiltro ? resultadoFiltro.visiveis : null;
    if (!porVida) return porFiltro;
    if (!porFiltro) return porVida;
    return new Set([...porVida].filter((id) => porFiltro.has(id)));
  }, [nodes, idx, ocultarExtintas, filtroEstado, ctxFiltro]);
  const primordiais = nodes.filter((n) => n.isPrimordial && (!visiveis || visiveis.has(n.id)));
  if (primordiais.length === 0) {
    return <div className="text-xs text-stone-600 py-6 text-center">Nenhuma linhagem passa nos filtros atuais. Afrouxe os filtros ou desligue o corte da linha do tempo.</div>;
  }
  return (
    <div className="space-y-3">
      {primordiais.map((prim) => {
        const linhagem = nodes.filter((n) => n.primordialId === prim.id);
        const vivas = linhagem.filter((n) => !n.extinta).length;
        return (
          <div key={prim.id} className="rounded border border-stone-800 bg-stone-950/40 p-2">
            <div className="text-[10px] uppercase tracking-widest text-stone-600 font-mono mb-1.5 px-1">
              {prim.clado} · {linhagem.length} espécie(s) na linhagem · <span className="text-emerald-600">{vivas} viva(s)</span> · <span className="text-red-800">{linhagem.length - vivas} extinta(s)</span>
            </div>
            <NodeArvore node={prim} idx={idx} profundidade={0} onAbrir={onAbrir} individuosPorEspecie={individuosPorEspecie} visiveis={visiveis} />
          </div>
        );
      })}
    </div>
  );
}

function PainelBiologia({ eras, nodes, setNodes, individuals, setIndividuals, anoAtual, setAnoAtual, onAbrirViewer, onCriarPrimordial, showToast, onLog, idx }) {
  const [modalEcossistema, setModalEcossistema] = useState(false);
  const [modalSelecaoNatural, setModalSelecaoNatural] = useState(false);
  const [visao, setVisao] = useState("arvore"); // "arvore" | "lista" — árvore é o padrão pedido
  /* v32 — a busca por trecho de DNA (v29) virou UM campo dentro do sistema
     de filtros: mesmo comportamento, agora combinável com todo o resto. */
  const [filtros, setFiltros] = useState({ texto: "", campos: {} });
  const [auCorte, setAuCorte] = useState(null); // slider de eras; null = sem corte
  const [modalTrilha, setModalTrilha] = useState(false);
  const [rodandoTrilha, setRodandoTrilha] = useState(false);
  const [progressoTrilha, setProgressoTrilha] = useState(0);
  const [relatorioTrilha, setRelatorioTrilha] = useState(null);
  /* v29 — a maioria das espécies de uma simulação longa está extinta, e na
     árvore isso deixava a espécie viva praticamente impossível de achar no
     meio dos mortos. O filtro é opt-in e não apaga nada: só esconde. */
  const [ocultarExtintas, setOcultarExtintas] = useState(false);
  const eraAtual = eras[eras.length - 1];
  const primordiais = nodes.filter((n) => n.isPrimordial);

  const [gerando, setGerando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [progressoLabel, setProgressoLabel] = useState("");
  const [rodandoSelecao, setRodandoSelecao] = useState(false);
  const [progressoSelecao, setProgressoSelecao] = useState(0);

  /* Assíncrona: cada derivarLinhagem já cede o controle ao navegador
     periodicamente (fatiamento de tempo no motor), então esperar por ela
     aqui não trava a aba — só mantém a UI num estado "gerando" enquanto
     o trabalho corre em segundo plano. O progresso reportado combina
     "quantos primordiais já terminaram" com o progresso interno do
     primordial em andamento, para a barra não pular em degraus grandes
     quando há poucos primordiais.

     v23: ao final, toda espécie nova (primordiais + derivadas) ganha
     automaticamente uma população de indivíduos espalhada pelas
     divisões simuladas da massa em que nasceu, e a seleção natural
     populacional roda um lote de ciclos automaticamente sobre o
     ecossistema recém-criado — "gerar espécies" deixa de ser um passo
     isolado da simulação de indivíduos/seleção natural. */
  const gerarEcossistema = async (n, cMin, cMax, alvosTrilha = []) => {
    setGerando(true); setProgresso(0);
    const novos = [];
    let tetoAtingido = false;
    let linhagensEstaveis = 0;
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
        linhagensEstaveis += (filhas.orcamentoEsgotado ? (filhas.linhagensComCiclosSobrando || 0) : 0);
      }
      setProgresso((i + 1) / n);
    }
    /* v32 — TRILHAS DIRIGIDAS NA MESMA LEVA. Antes, uma trilha só podia
       entrar no mundo por uma operação separada, depois de o ecossistema já
       existir; agora os DNAs-alvo colados no modal viram linhagens
       ramificadas geradas junto com os primordiais, e entram no mesmo lote
       de população e de seleção natural que todo o resto. */
    if (alvosTrilha && alvosTrilha.length) {
      setProgressoLabel(`Gerando ${alvosTrilha.length} linhagem(ns) dirigida(s) por DNA-alvo…`);
      const massaTrilha = eraAtual.massas[Math.floor(Math.random() * eraAtual.massas.length)];
      const rt = await gerarLinhagemMultiAlvo(alvosTrilha, {
        origem: null,
        massaId: massaTrilha?.id || null,
        auInicial: eraAtual.auInicio,
        onProgress: (f) => setProgresso(f),
      });
      for (const no of rt.novos) novos.push(no);
    }

    setNodes((prev) => [...prev, ...novos]);

    // população automática pra cada espécie nova
    setProgressoLabel("Espalhando populações de indivíduos…");
    let novosIndividuos = [];
    const massaIdxLocal = new Map(eraAtual.massas.map((m) => [m.id, m])); // Fase 2, item 5.5
    for (const node of novos) novosIndividuos = novosIndividuos.concat(gerarPopulacaoParaEspecie(node, TAMANHO_POPULACAO_INICIAL, DIVISOES_POR_MASSA, massaIdxLocal.get(node.massaId)));

    // seleção natural populacional automática sobre o ecossistema recém-criado
    setProgressoLabel("Rodando seleção natural sobre as populações…");
    const idxNovo = buildIndex([...nodes, ...novos]);
    const CICLOS_AUTOMATICOS = 20;
    const { individuals: individuosFinais, resumo, auAvancado } = await rodarSelecaoNaturalPopulacional(
      idxNovo, [...individuals, ...novosIndividuos], eraAtual.massas, CICLOS_AUTOMATICOS, (f) => setProgresso(f)
    );
    setIndividuals(individuosFinais);
    setAnoAtual((a) => novos.reduce((m, no) => Math.max(m, no.auSurgimento), a) + auAvancado);
    setNodes((prev) => prev.map((n) => ({ ...n }))); // força o React a ver os genomas mutados pela seleção natural

    setModalEcossistema(false);
    setGerando(false);
    /* Sem este bump o painel de log não atualizava: __eventLog é mutado em
       lugar, então o useMemo do App devolve sempre a MESMA referência de
       array e o React não vê mudança nenhuma. Os eventos do ecossistema
       ficavam invisíveis até outra ação bumpar a versão por acaso. */
    onLog();
    showToast(
      `Ecossistema gerado: ${n} primordial(is), ${novos.length} espécie(s) no total, ${novosIndividuos.length} indivíduo(s) espalhados pelo mundo.` +
      (tetoAtingido ? " Teto de espécies por linhagem atingido — a deriva parou antes do fim." : "") +
      (linhagensEstaveis > 0 ? ` ${linhagensEstaveis} linhagem(ns) ficaram estáveis por falta de orçamento de ciclos (nenhuma foi extinta por isso).` : "") +

      ` Seleção natural: ${resumo.colisoes} colisão(ões) de população, ${resumo.mortes} morte(s), ${resumo.nascimentos} nascimento(s), ${resumo.migracoes} migração(ões).`
    );
  };

  /* v23 — seleção natural conduzida pelas POPULAÇÕES de indivíduos
     (rodarSelecaoNaturalPopulacional), não mais por uma leitura de
     "quem existe agora" sem noção de onde os indivíduos estão. O
     número de ciclos é sempre perguntado ao usuário (ModalSelecaoNatural,
     mesmo padrão do "Derivar"). Ao final: os genomas afetados já saem
     atualizados (mutação em lugar, igual ao resto do motor), a árvore
     é forçada a re-renderizar, e o "ano atual" avança ciclos × 100 mil
     anos. */
  const rodarSelecaoNatural = async (ciclos) => {
    setRodandoSelecao(true); setProgressoSelecao(0);
    const idxAtual = buildIndex(nodes);
    const { individuals: individuosFinais, resumo, auAvancado } = await rodarSelecaoNaturalPopulacional(
      idxAtual, individuals, eraAtual.massas, ciclos, (f) => setProgressoSelecao(f)
    );
    setIndividuals(individuosFinais);
    setNodes((prev) => prev.map((n) => ({ ...n })));
    setAnoAtual((a) => a + auAvancado);
    setModalSelecaoNatural(false);
    setRodandoSelecao(false);
    onLog();
    showToast(
      resumo.colisoes === 0
        ? `${ciclos} ciclo(s) rodado(s) — nenhuma colisão de população (indivíduos de espécies diferentes não se cruzaram nas mesmas divisões).`
        : `${ciclos} ciclo(s) rodado(s): ${resumo.colisoes} colisão(ões) de população, ${resumo.mortes} morte(s), ${resumo.nascimentos} nascimento(s), ${resumo.migracoes} migração(ões). Ano atual avançou ${fmtAU(auAvancado)}.`
    );
  };

  /* v32 — MOTOR DE TRILHA MULTI-ALVO.
     Roda gerarLinhagemMultiAlvo e injeta os nós no mundo. Quando a origem é
     um nó já existente, o motor devolve os filhos já com `pais` apontando
     pra ele — mas o `filhos` do nó de origem é mutado dentro do motor, e o
     React só vê isso se as referências forem trocadas; daí o map de cópia
     rasa no fim, mesmo padrão já usado pela seleção natural. */
  const gerarTrilhaMultiAlvo = async ({ alvos, origemId, massaId, auInicial }) => {
    setRodandoTrilha(true); setProgressoTrilha(0); setRelatorioTrilha(null);
    const origem = origemId ? nodes.find((n) => n.id === origemId) : null;
    const r = await gerarLinhagemMultiAlvo(alvos, {
      origem, massaId, auInicial,
      onProgress: (f) => setProgressoTrilha(f),
    });
    if (r.novos.length) {
      setNodes((prev) => [...prev.map((n) => ({ ...n })), ...r.novos]);
      setAnoAtual((a) => Math.max(a, ...r.novos.map((n) => n.auSurgimento)));
    }
    setRelatorioTrilha(r.relatorio);
    setRodandoTrilha(false);
    onLog();
    const exatos = r.relatorio.filter((x) => x.sucesso).length;
    showToast(
      r.novos.length
        ? `Linhagem gerada: ${r.novos.length} espécie(s), ${r.bifurcacoes} ponto(s) de bifurcação, ${exatos} de ${r.alvos} alvo(s) batendo 100%.`
        : "Nenhuma trilha pôde ser materializada — veja o relatório no painel."
    );
  };

  /* Contexto que os filtros usam para ler geografia (massa, domínio, bioma
     viável) sem precisar receber isso campo a campo. */
  const ctxFiltro = useMemo(() => ({
    idx,
    massas: eraAtual?.massas || [],
    massaIdx: new Map((eraAtual?.massas || []).map((m) => [m.id, m])),
  }), [idx, eraAtual]);

  /* O corte temporal do slider entra no MESMO estado de filtro que o resto —
     assim "réptil alado vivo em AU 4.200 na massa X" é uma pergunta só. */
  const estadoFiltroCompleto = useMemo(
    () => ({ ...filtros, au: Number.isFinite(auCorte) ? auCorte : undefined }),
    [filtros, auCorte]
  );
  const nodesFiltrados = useMemo(
    () => filtrarEspecies(nodes, estadoFiltroCompleto, ctxFiltro),
    [nodes, estadoFiltroCompleto, ctxFiltro]
  );
  const temFiltro = contarFiltrosAtivos(estadoFiltroCompleto) > 0;

  return (
    <Section title="Fase 3 · Biologia" accent="text-emerald-500" right={<span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider">Ano atual: <span className="text-emerald-500">{fmtAU(anoAtual)}</span></span>}>
      <div className="flex flex-wrap gap-2 mb-4">
        <BotaoPrimario onClick={() => setModalEcossistema(true)}><Sparkles size={12} className="inline -mt-0.5 mr-1" />Gerar Ecossistema</BotaoPrimario>
        <button onClick={onCriarPrimordial} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-2"><Dices size={12} className="inline -mt-0.5 mr-1" />Criar Primordial Manualmente</button>
        <button onClick={() => { setRelatorioTrilha(null); setModalTrilha(true); }} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-2">
          <GitBranch size={12} className="inline -mt-0.5 mr-1" />Motor de Trilha (multi-DNA)
        </button>
        {nodes.length > 1 && (
          <button onClick={() => setModalSelecaoNatural(true)} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-2"><GitBranch size={12} className="inline -mt-0.5 mr-1" />Rodar Seleção Natural</button>
        )}
      </div>

      {primordiais.length === 0 && <div className="text-xs text-stone-600 py-6 text-center">Nenhuma espécie ainda. Gere um ecossistema ou crie um primordial manualmente.</div>}

      {primordiais.length > 0 && (
        <>
          <SliderEras nodes={nodes} eras={eras} anoAtual={anoAtual} au={auCorte} setAu={setAuCorte} />

          <PainelFiltros
            estado={filtros}
            setEstado={setFiltros}
            ctx={ctxFiltro}
            totalNodes={nodes.length}
            totalVisiveis={nodesFiltrados.length}
          />

          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            <button onClick={() => setVisao("arvore")} className={`text-[10px] font-mono uppercase px-2.5 py-1 rounded border ${visao === "arvore" ? "border-emerald-700 bg-emerald-950/50 text-emerald-400" : "border-stone-800 text-stone-500 hover:text-stone-300"}`}>
              <GitBranch size={11} className="inline -mt-0.5 mr-1" />Árvore Genealógica
            </button>
            <button onClick={() => setVisao("lista")} className={`text-[10px] font-mono uppercase px-2.5 py-1 rounded border ${visao === "lista" ? "border-emerald-700 bg-emerald-950/50 text-emerald-400" : "border-stone-800 text-stone-500 hover:text-stone-300"}`}>
              Lista
            </button>
            <button onClick={() => setOcultarExtintas((v) => !v)}
              className={`text-[10px] font-mono uppercase px-2.5 py-1 rounded border ml-auto ${ocultarExtintas ? "border-emerald-700 bg-emerald-950/50 text-emerald-400" : "border-stone-800 text-stone-500 hover:text-stone-300"}`}>
              {ocultarExtintas ? "Só vivas" : "Mostrando extintas"}
            </button>
          </div>

          {nodesFiltrados.length === 0 ? (
            <div className="text-xs text-stone-600 py-6 text-center">Nenhuma espécie passa nos filtros atuais.</div>
          ) : visao === "arvore" ? (
            /* Com filtro ativo, a árvore mostra os aprovados MAIS os
               ancestrais deles (senão os galhos que ligam o resultado à raiz
               somem e o resultado some junto) — mesma regra que o filtro
               "só vivas" da v29 já usava, agora generalizada em
               idsVisiveisComFiltro. */
            <ArvoreGenealogicaGlobal
              nodes={nodes}
              idx={idx}
              individuals={individuals}
              onAbrir={onAbrirViewer}
              ocultarExtintas={ocultarExtintas}
              filtroEstado={temFiltro ? estadoFiltroCompleto : null}
              ctxFiltro={ctxFiltro}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {nodesFiltrados
                .filter((n) => !ocultarExtintas || !n.extinta)
                .slice(0, 400)
                .map((n) => (
                  <CardEspecie key={n.id} node={n} onClick={() => onAbrirViewer(n.id)} individuosCount={individuals.filter((i) => i.especieId === n.id).length} />
                ))}
              {nodesFiltrados.length > 400 && (
                <div className="col-span-full text-[10px] text-stone-600 text-center py-2">
                  Mostrando as 400 primeiras de {nodesFiltrados.length}. Aperte mais os filtros para chegar ao que procura.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {modalEcossistema && <ModalGerarEcossistema eraAtual={eraAtual} onGerar={gerarEcossistema} onFechar={() => setModalEcossistema(false)} gerando={gerando} progresso={progresso} progressoLabel={progressoLabel} />}
      {modalSelecaoNatural && <ModalSelecaoNatural onRodar={rodarSelecaoNatural} onFechar={() => setModalSelecaoNatural(false)} rodando={rodandoSelecao} progresso={progressoSelecao} />}
      {modalTrilha && (
        <ModalTrilhaMultiAlvo
          eraAtual={eraAtual}
          nodesDisponiveis={nodes}
          onGerar={gerarTrilhaMultiAlvo}
          onFechar={() => setModalTrilha(false)}
          rodando={rodandoTrilha}
          progresso={progressoTrilha}
          relatorio={relatorioTrilha}
        />
      )}
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
     continua acessível pelo export .pdf, que é o formato pedido para
     leitura longa mesmo. */
  const TETO_RENDER = 300;
  const itens = expandido ? eventLog.slice(-TETO_RENDER) : eventLog.slice(-8);
  const ocultos = expandido ? Math.max(0, eventLog.length - TETO_RENDER) : 0;
  return (
    <Section title="Histórico de Eventos" accent="text-stone-500" right={eventLog.length > 8 && <button onClick={() => setExpandido((v) => !v)} className="text-[10px] font-mono text-stone-500 hover:text-emerald-400">{expandido ? "recolher" : `ver todos (${eventLog.length})`}</button>}>
      {ocultos > 0 && <div className="text-[10px] text-stone-600 mb-2">Mostrando os {TETO_RENDER} eventos mais recentes de {eventLog.length}. Use o export .pdf para o histórico completo.</div>}
      {eventLog.length === 0 ? <div className="text-xs text-stone-600">Nenhum evento ainda.</div> : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {itens.slice().reverse().map((e) => (
            <div key={e.seq} className="text-[11px] font-data border-l-2 border-stone-800 pl-2 py-0.5">
              <span className="text-stone-600">[#{e.seq}]</span> <span className="text-emerald-600">{e.tipoLabel}</span> <span className="text-stone-400">{e.clado}</span>
              <div className="text-stone-600">{e.texto}</div>
              {e.code && <div className="text-stone-700 font-mono break-all">{e.code}</div>}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
