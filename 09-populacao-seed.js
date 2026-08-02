/* ============================================================
   v23 — VISOR DE INDIVÍDUO, PROMPT DE IMAGEM E BUSCA POR SEED
   ============================================================
   Três peças novas que faltavam:
   1) IndividualViewer — painel dedicado a UM indivíduo (antes só
      existia uma linha resumida dentro do SpeciesViewer; ao gerar um
      indivíduo novo não havia como abrir um painel com os atributos
      completos dele).
   2) PromptImagemBox — caixa de texto com o prompt de geração de
      imagem (gerarPromptImagem, no motor) e botão de copiar.
   3) SeedSearchModal — busca por seed: cola a seed (só de espécie, ou
      colada espécie+indivíduo) e decodifica de volta num espécime,
      sem precisar que ele já exista na árvore atual.
   ============================================================ */

function Search(props) { return <Icon {...props}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Icon>; }

/* ============================================================
   PROMPT DE IMAGEM — caixa de texto + copiar
   ============================================================ */
function PromptImagemBox({ g, individual, showToast }) {
  const [aberto, setAberto] = useState(false);
  const prompt = useMemo(() => (aberto ? gerarPromptImagem(g, individual || null) : ""), [aberto, g, individual]);
  const copiar = () => { navigator.clipboard?.writeText(prompt); showToast("Prompt de imagem copiado."); };
  if (!aberto) {
    return (
      <button onClick={() => setAberto(true)} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5">
        <ImageIcon size={12} className="inline -mt-0.5 mr-1" />Gerar Prompt de Imagem
      </button>
    );
  }
  return (
    <div className="rounded border border-stone-800 bg-stone-900/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-stone-500 font-mono">Prompt para IA de imagem (colar e usar direto)</div>
        <button onClick={() => setAberto(false)} className="text-stone-500 hover:text-stone-200"><X size={14} /></button>
      </div>
      <textarea readOnly value={prompt} rows={10} className="w-full bg-stone-950 border border-stone-800 rounded p-2 text-[11px] font-data text-stone-300 resize-y" onFocus={(e) => e.target.select()} />
      <button onClick={copiar} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Copy size={12} className="inline -mt-0.5 mr-1" />Copiar Prompt</button>
    </div>
  );
}
function ImageIcon(props) { return <Icon {...props}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></Icon>; }

/* ============================================================
   VISOR DE INDIVÍDUO — painel dedicado, com todos os atributos,
   o genoma completo do indivíduo (variação sobre a espécie) e o
   prompt de imagem. Aberto tanto ao gerar um indivíduo novo quanto
   ao clicar num já existente na lista da espécie.
   ============================================================ */
function IndividualViewer({ individual, especieNode, onFechar, onNavegarEspecie, showToast }) {
  const g = individual.ind || especieNode?.g;
  // Os nós de espécie não guardam a seed pronta — ela é recomputada sob
  // demanda a partir do genoma atual (mesma lógica usada pelo export de
  // fichas), o que garante que a seed colada sempre reflete o genoma
  // MAIS RECENTE da espécie, mesmo depois de deriva/seleção natural.
  const speciesSeed = useMemo(() => (especieNode ? seedParaGenoma(especieNode.g, especieNode.isPrimordial).seed : null), [especieNode]);
  const gluedSeed = individual.individualSeed !== undefined && speciesSeed !== null
    ? gluedSeedText(speciesSeed, individual.individualSeed, especieNode.isPrimordial) : null;
  const copiarDNA = () => { navigator.clipboard?.writeText(individual.code); showToast("DNA do indivíduo copiado."); };
  const copiarSeed = () => { navigator.clipboard?.writeText(gluedSeed); showToast("Seed colada (espécie + indivíduo) copiada."); };

  const ATTR_LABEL = { FOR: "Força", AGI: "Agilidade", CON: "Constituição", PER: "Percepção", INT: "Intelecto", CAR: "Carisma" };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-t-lg sm:rounded-lg w-full sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-stone-950 border-b border-stone-800 px-4 py-3 flex items-center justify-between">
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest flex items-center gap-2">
            <User size={16} />{individual.nome}
            {individual.viva === false && <Badge className="border-red-900 text-red-500">morto</Badge>}
          </h2>
          <button onClick={onFechar} className="text-stone-500 hover:text-stone-200"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-xs text-stone-400">
            Indivíduo de{" "}
            {especieNode ? (
              <button onClick={() => onNavegarEspecie(especieNode.id)} className="text-emerald-400 hover:underline font-mono">{especieNode.clado}</button>
            ) : (
              <span className="font-mono text-stone-300">espécime decodificado por seed (não está na árvore atual)</span>
            )}
            {individual.divisao !== null && individual.divisao !== undefined && <span className="text-stone-600"> · divisão simulada {individual.divisao}</span>}
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            {Object.keys(ATTR_LABEL).map((k) => (
              <div key={k} className="rounded border border-stone-800 p-2 text-center">
                <div className="text-stone-500 text-[10px] uppercase">{ATTR_LABEL[k]}</div>
                <div className="text-stone-100 font-data text-lg">{individual.attrVaried?.[k] ?? "—"}</div>
                <div className="text-stone-600 text-[10px]">base {individual.attrBase?.[k] ?? "—"}</div>
              </div>
            ))}
          </div>

          {individual.ind?.anomalias?.length > 0 && (
            <div className="text-xs bg-amber-950/30 border border-amber-900 rounded px-2.5 py-2 text-amber-300">
              Anomalia(s) individual(is): {individual.ind.anomalias.map((a) => labelOf(T.ano, a).toLowerCase()).join(", ")}
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-widest text-stone-500 font-mono mb-1">Genoma do indivíduo (variação sobre a espécie)</div>
            <pre className="text-[10px] font-mono text-stone-400 bg-stone-900/40 rounded p-2 whitespace-pre-wrap break-all">{describeIndividual(g)}</pre>
          </div>

          <div className="text-[10px] font-mono text-stone-500 break-all bg-stone-900/40 rounded p-2">{individual.code}</div>

          <PromptImagemBox g={g} individual={individual} showToast={showToast} />
        </div>

        <div className="sticky bottom-0 bg-stone-950 border-t border-stone-800 px-4 py-3 flex flex-wrap gap-2">
          <button onClick={copiarDNA} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Copy size={12} className="inline -mt-0.5 mr-1" />Copiar DNA</button>
          {gluedSeed && <button onClick={copiarSeed} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Copy size={12} className="inline -mt-0.5 mr-1" />Copiar Seed (espécie+indivíduo)</button>}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   BUSCA POR SEED — decodifica um texto de seed (espécie, ou
   espécie+indivíduo colada) de volta num espécime, sem precisar
   que ele já exista na árvore atual (o espaço de espécimes
   possíveis é muito maior que qualquer mundo gerado).
   ============================================================ */
function SeedSearchModal({ onFechar, onAdicionarComoPrimordial, eraAtual, showToast }) {
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");

  const buscar = () => {
    setErro(""); setResultado(null);
    const bruto = (texto || "").trim();
    if (!bruto) { setErro("Cole uma seed (números), ou digite um texto/nome livre para gerar um endereço a partir dele."); return; }
    // heurística: se sobrar algum dígito depois de tirar tudo que não é número,
    // e o texto não tiver nenhuma letra, trata como seed numérica de verdade
    // (o formato colado da Estação DRN2). Qualquer letra no meio já indica
    // texto livre — nome, frase, apelido — que vira endereço por hash (FNV-128),
    // igual a Estação já faz internamente via parseAnySeed, só que essa caixa
    // nunca chamava essa função: ela sempre descartava letras e ficava só com
    // os dígitos, por isso um nome puro ("Abner Cruz", sem números) esvaziava
    // tudo e caía no erro de "seed vazia".
    const temLetra = /[A-Za-zÀ-ÿ]/.test(bruto);
    try {
      if (!temLetra) {
        const digitos = bruto.replace(/[^0-9]/g, "");
        if (!digitos) { setErro("Cole uma seed (só números — pontuação e espaços são ignorados)."); return; }
        const r = decodificarSeedColada(digitos);
        if (!r) { setErro("Não foi possível decodificar essa seed."); return; }
        setResultado(r);
      } else {
        // texto livre: endereço determinístico por hash, sempre a mesma espécie pro mesmo texto
        const enderecoTexto = parseAnySeed(bruto);
        const built = buildSpecies(enderecoTexto, {}, false, true);
        setResultado({ g: built.g, code: built.code, speciesSeed: built.speciesSeed, individual: null, isPrimordial: false, deTexto: bruto });
      }
    } catch (e) {
      setErro("Seed inválida — não foi possível decodificar.");
    }
  };

  const pesoCal = useMemo(() => (resultado ? calcularPesoCalorias(resultado.g) : null), [resultado]);
  const copiarDNA = () => { navigator.clipboard?.writeText(resultado.code); showToast("DNA copiado."); };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-t-lg sm:rounded-lg w-full sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-stone-950 border-b border-stone-800 px-4 py-3 flex items-center justify-between">
          <h2 className="font-mono text-sm text-emerald-400 uppercase tracking-widest flex items-center gap-2"><Search size={16} />Buscar por Seed</h2>
          <button onClick={onFechar} className="text-stone-500 hover:text-stone-200"><X size={18} /></button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-[11px] text-stone-500">
            Cole a seed de uma espécie, ou a seed colada (espécie + indivíduo, gerada ao copiar "Seed"
            no visor de espécie ou de indivíduo). O primeiro dígito já indica se é primordial ou
            derivada — não precisa informar isso à parte. O espaço de espécimes possíveis é enorme
            (~10^50) — a seed é o endereço dele, existindo ou não ainda no mundo atual.
            Também aceita texto livre (nome, apelido, frase): vira um endereço fixo por hash —
            o mesmo texto sempre decodifica a mesma criatura, mas ela não é "escolhida por você" gene a
            gene, é só o que aquele endereço específico contém.
          </p>
          <textarea
            value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} placeholder="Cole a seed aqui, ou digite um nome/texto…"
            className="w-full bg-stone-950 border border-stone-800 rounded p-2 text-[11px] font-data text-stone-300 resize-y"
          />
          <BotaoPrimario onClick={buscar}><Search size={12} className="inline -mt-0.5 mr-1" />Decodificar</BotaoPrimario>
          {erro && <div className="text-xs text-red-400">{erro}</div>}

          {resultado && (
            <div className="space-y-3 border-t border-stone-800 pt-3">
              {resultado.deTexto && (
                <p className="text-[10px] text-amber-500/80">
                  Gerado a partir do texto "{resultado.deTexto}" (endereço: {resultado.speciesSeed.toString()}) — não é uma seed numérica colada, é um hash desse texto.
                </p>
              )}
              <div>
                <h3 className="font-mono text-xs text-emerald-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                  {resultado.g.clado}{resultado.individual ? ` · ${resultado.individual.nome}` : ""}
                  <Badge className={resultado.isPrimordial ? "border-amber-800 text-amber-500" : "border-stone-700 text-stone-400"}>{resultado.isPrimordial ? "primordial" : "derivada"}</Badge>
                </h3>
                <p className="text-xs text-stone-400 leading-relaxed">{describeCreatureProse(resultado.g)}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded border border-stone-800 p-2"><div className="text-stone-500">Peso</div><div className="text-stone-200 font-data">{fmtKg(pesoCal.pesoKg)}</div></div>
                <div className="rounded border border-stone-800 p-2"><div className="text-stone-500">Calorias/dia</div><div className="text-stone-200 font-data">{fmtNum(pesoCal.caloriasDia)} kcal</div></div>
              </div>

              {resultado.individual && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {Object.entries(resultado.individual.attrVaried).map(([k, v]) => (
                    <div key={k} className="rounded border border-stone-800 p-2 text-center">
                      <div className="text-stone-500 text-[10px] uppercase">{k}</div>
                      <div className="text-stone-100 font-data text-lg">{v}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="text-[10px] font-mono text-stone-500 break-all bg-stone-900/40 rounded p-2">{resultado.code}</div>

              <PromptImagemBox g={resultado.g} individual={resultado.individual} showToast={showToast} />

              <div className="flex flex-wrap gap-2">
                <button onClick={copiarDNA} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5"><Copy size={12} className="inline -mt-0.5 mr-1" />Copiar DNA</button>
                {resultado.isPrimordial && eraAtual && (
                  <button onClick={() => onAdicionarComoPrimordial(resultado.g)} className="text-[11px] font-mono uppercase text-stone-400 hover:text-emerald-400 border border-stone-800 rounded px-3 py-1.5">
                    <Dices size={12} className="inline -mt-0.5 mr-1" />Adicionar ao mundo como primordial
                  </button>
                )}
              </div>
              {!resultado.isPrimordial && (
                <p className="text-[10px] text-stone-600">Essa seed foi decodificada como espécie derivada — não pode ser adicionada diretamente ao mundo sem uma espécie-mãe (use "Derivar" numa espécie existente pra gerar descendentes de verdade).</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
