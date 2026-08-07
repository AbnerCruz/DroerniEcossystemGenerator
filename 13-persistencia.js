/* ============================================================
   v33 — SALVAMENTO AUTOMÁTICO, ESCALA DE TEMPO E RESET TOTAL
   ============================================================

   O relato: "meu celular não tem memória, então toda vez que saio do app
   para gerar imagens eu perco a árvore gerada".

   Isso não é falta de memória do aparelho — é o navegador descartando a aba
   em segundo plano para liberar RAM, que é o comportamento normal de
   Android e iOS quando outro app pede memória. Nenhum ajuste de código
   impede o descarte; o que dá para fazer é o estado sobreviver a ele. É por
   isso que a solução é gravação em disco, não "cache".

   ONDE FICA GRAVADO. IndexedDB, com localStorage como reserva. A escolha
   importa justamente pelo caso relatado: localStorage é síncrono e tem cota
   de ~5 MB por origem, e um ecossistema grande (centenas de espécies +
   populações + log) passa disso com folga — daria QuotaExceededError na
   hora errada, exatamente quando o usuário está saindo do app. IndexedDB é
   assíncrono e a cota é uma fração do disco livre. A reserva em
   localStorage existe só para navegador em modo anônimo, onde o IndexedDB
   às vezes não abre.

   QUANDO GRAVA. Três gatilhos, e o terceiro é o que resolve o problema:
     1. debounce de 1,2 s depois de qualquer mudança de estado;
     2. `visibilitychange` para `hidden` — dispara no instante em que o app
        vai para segundo plano, que é o momento de sair para gerar imagem;
     3. `pagehide` — última chance antes de a aba ser descarregada.
   Os dois últimos gravam na hora, sem debounce: se esperassem 1,2 s, o
   sistema operacional já teria congelado a aba.

   O formato gravado é o MESMO do export manual (serializeProjetoV17), então
   um projeto exportado e um auto-salvo são intercambiáveis, e o import
   manual continua sendo a via para levar o mundo de um aparelho a outro.
   O auto-salvamento não substitui o export — ele é local ao navegador e
   some se o usuário limpar os dados do site.
   ============================================================ */

const DB_NOME = "droerni-drn2";
const DB_VERSAO = 1;
const DB_STORE = "projeto";
const CHAVE_SESSAO = "sessao-atual";
const CHAVE_PREFS = "preferencias";
const LS_PREFIXO = "droerni-drn2:";
const DEBOUNCE_SALVAMENTO_MS = 1200;

/* ---------- camada de armazenamento ---------- */

let __dbPromessa = null;
function abrirDB() {
  if (__dbPromessa) return __dbPromessa;
  __dbPromessa = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NOME, DB_VERSAO); } catch (e) { return resolve(null); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null); // modo anônimo, cota zerada, etc.
    req.onblocked = () => resolve(null);
  });
  return __dbPromessa;
}

async function dbGravar(chave, valor) {
  const db = await abrirDB();
  if (!db) {
    try { localStorage.setItem(LS_PREFIXO + chave, typeof valor === "string" ? valor : JSON.stringify(valor)); return true; }
    catch (e) { return false; }
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(valor, chave);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}

async function dbLer(chave) {
  const db = await abrirDB();
  if (!db) {
    try { return localStorage.getItem(LS_PREFIXO + chave); } catch (e) { return null; }
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, "readonly");
      const req = tx.objectStore(DB_STORE).get(chave);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

async function dbApagar(chave) {
  try { localStorage.removeItem(LS_PREFIXO + chave); } catch (e) { /* ignora */ }
  const db = await abrirDB();
  if (!db) return true;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(chave);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}

/* ---------- sessão ---------- */

async function salvarSessao(state) {
  const texto = serializeProjetoV17(state);
  const envelope = {
    versao: 33,
    salvoEm: new Date().toISOString(),
    bytes: texto.length,
    escalaTempo: getEscalaTempo(),
    projeto: texto,
  };
  const ok = await dbGravar(CHAVE_SESSAO, envelope);
  return ok ? envelope : null;
}

async function lerSessaoSalva() {
  const bruto = await dbLer(CHAVE_SESSAO);
  if (!bruto) return null;
  try {
    const envelope = typeof bruto === "string" ? JSON.parse(bruto) : bruto;
    if (!envelope || !envelope.projeto) return null;
    const dados = deserializarProjetoV17(envelope.projeto);
    return { envelope, dados };
  } catch (e) { return null; }
}

async function apagarSessaoSalva() { return dbApagar(CHAVE_SESSAO); }

/* Preferências (hoje só a escala de tempo) vivem numa chave separada de
   propósito: resetar o mundo não deve zerar a configuração do usuário. */
async function salvarPreferencias() { return dbGravar(CHAVE_PREFS, { escalaTempo: getEscalaTempo() }); }
async function lerPreferencias() {
  const bruto = await dbLer(CHAVE_PREFS);
  if (!bruto) return null;
  try { return typeof bruto === "string" ? JSON.parse(bruto) : bruto; } catch (e) { return null; }
}

/* ---------- hook de auto-salvamento ---------- */

/* `state` é o objeto de estado do App; `ativo` desliga a gravação (usada
   durante a própria restauração, para não regravar por cima do que acabou
   de ser lido, e enquanto o usuário confirma um reset). */
function useAutoSalvamento(state, { ativo = true, aoSalvar } = {}) {
  const timerRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const ativoRef = useRef(ativo);
  ativoRef.current = ativo;

  const gravarAgora = useCallback(async (motivo) => {
    if (!ativoRef.current) return null;
    const s = stateRef.current;
    // mundo vazio não vira sessão salva: não faz sentido restaurar o nada,
    // e gravar por cima apagaria um mundo real logo depois de um reset
    if (!s || (!s.nodes?.length && !s.eras?.length)) return null;
    const envelope = await salvarSessao(s);
    if (envelope && aoSalvar) aoSalvar(envelope, motivo);
    return envelope;
  }, [aoSalvar]);

  // 1) debounce após mudança de estado
  useEffect(() => {
    if (!ativo) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => gravarAgora("debounce"), DEBOUNCE_SALVAMENTO_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [state, ativo, gravarAgora]);

  // 2 e 3) app indo para segundo plano — o caso relatado
  useEffect(() => {
    const aoEsconder = () => { if (document.visibilityState === "hidden") gravarAgora("segundo-plano"); };
    const aoSair = () => { gravarAgora("pagehide"); };
    document.addEventListener("visibilitychange", aoEsconder);
    window.addEventListener("pagehide", aoSair);
    return () => {
      document.removeEventListener("visibilitychange", aoEsconder);
      window.removeEventListener("pagehide", aoSair);
    };
  }, [gravarAgora]);

  return gravarAgora;
}

/* ---------- ícones ---------- */

function Settings(props) {
  return <Icon {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Icon>;
}
function Save(props) {
  return <Icon {...props}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></Icon>;
}
function Clock(props) {
  return <Icon {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Icon>;
}

/* ---------- indicador de salvamento no cabeçalho ---------- */

function formatarHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function formatarTamanho(bytes) {
  if (!bytes) return "—";
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function IndicadorSalvamento({ ultimoSalvamento, onAbrir }) {
  const salvo = !!ultimoSalvamento;
  return (
    <button
      onClick={onAbrir}
      title={salvo ? `Salvo automaticamente às ${formatarHora(ultimoSalvamento.salvoEm)} (${formatarTamanho(ultimoSalvamento.bytes)})` : "Configurações e reset"}
      className="p-2 rounded border border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-600 relative"
    >
      <Settings size={14} />
      {salvo && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500" />}
    </button>
  );
}

/* ---------- painel de configurações ---------- */

function PainelConfiguracoes({
  onFechar, ultimoSalvamento, onSalvarAgora, onApagarSalvamento,
  onResetarTudo, escalaTempo, onMudarEscala, totais, showToast,
}) {
  const [confirmandoReset, setConfirmandoReset] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const salvarAgora = async () => {
    setSalvando(true);
    const env = await onSalvarAgora("manual");
    setSalvando(false);
    showToast(env ? `Salvo (${formatarTamanho(env.bytes)}).` : "Nada para salvar ainda.");
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onFechar}>
      <div className="bg-stone-950 border border-stone-800 rounded-t-2xl sm:rounded-xl w-full max-w-lg max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800 sticky top-0 bg-stone-950">
          <h2 className="font-display text-base text-stone-100 flex items-center gap-2"><Settings size={16} /> Configurações</h2>
          <button onClick={onFechar} className="p-1.5 rounded text-stone-500 hover:text-stone-200"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-5">
          {/* SALVAMENTO */}
          <section className="space-y-2">
            <h3 className="font-data text-[11px] uppercase tracking-wider text-stone-500 flex items-center gap-1.5"><Save size={12} /> Salvamento automático</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              O mundo é gravado no navegador toda vez que você sai do app — inclusive
              quando o celular descarta a aba para liberar memória. Ao voltar, ele é
              restaurado sozinho.
            </p>
            <div className="rounded border border-stone-800 bg-stone-900/40 px-3 py-2 font-data text-[11px] text-stone-400 space-y-0.5">
              <div>último salvamento: <span className="text-stone-200">{ultimoSalvamento ? formatarHora(ultimoSalvamento.salvoEm) : "nenhum"}</span></div>
              <div>tamanho: <span className="text-stone-200">{formatarTamanho(ultimoSalvamento?.bytes)}</span></div>
              <div>no mundo: <span className="text-stone-200">{totais.especies} espécie(s), {totais.individuos} indivíduo(s), {totais.eras} era(s)</span></div>
            </div>
            <div className="flex gap-2">
              <button onClick={salvarAgora} disabled={salvando}
                className="flex-1 px-3 py-2 rounded border border-stone-700 text-xs text-stone-200 hover:border-stone-500 disabled:opacity-50">
                {salvando ? "Salvando…" : "Salvar agora"}
              </button>
              <button onClick={onApagarSalvamento}
                className="px-3 py-2 rounded border border-stone-800 text-xs text-stone-400 hover:text-stone-200 hover:border-stone-600">
                Apagar cópia salva
              </button>
            </div>
            <p className="text-[11px] text-stone-600 leading-relaxed">
              Isto é local a este navegador e some se você limpar os dados do site.
              Para levar o mundo a outro aparelho, continue usando exportar/importar .json.
            </p>
          </section>

          {/* ESCALA DE TEMPO */}
          <section className="space-y-2">
            <h3 className="font-data text-[11px] uppercase tracking-wider text-stone-500 flex items-center gap-1.5"><Clock size={12} /> Escala de tempo evolutivo</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Quanto tempo geológico custa um ciclo de deriva. A escala padrão é
              calibrada pela história da Terra: bactérias em estase por bilhões de
              anos, animais mudando em dezenas de milhões.
            </p>
            <div className="space-y-1.5">
              {ESCALAS_TEMPO.map((e) => (
                <button key={e.id} onClick={() => onMudarEscala(e.id)}
                  className={`w-full text-left px-3 py-2 rounded border text-xs ${Number(escalaTempo) === Number(e.id)
                    ? "border-emerald-700 bg-emerald-950/30 text-emerald-200"
                    : "border-stone-800 text-stone-300 hover:border-stone-600"}`}>
                  <div className="font-medium">{e.label}</div>
                  <div className="text-[11px] text-stone-500">{e.desc}</div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-600 leading-relaxed">
              Vale para o que for gerado daqui em diante; espécies já datadas mantêm o AU delas.
            </p>
          </section>

          {/* RESET */}
          <section className="space-y-2">
            <h3 className="font-data text-[11px] uppercase tracking-wider text-red-500/80 flex items-center gap-1.5"><AlertTriangle size={12} /> Zona de perigo</h3>
            {!confirmandoReset ? (
              <button onClick={() => setConfirmandoReset(true)}
                className="w-full px-3 py-2.5 rounded border border-red-900/70 text-xs text-red-300 hover:bg-red-950/40 flex items-center justify-center gap-2">
                <Trash size={13} /> Resetar tudo e recomeçar do zero
              </button>
            ) : (
              <div className="rounded border border-red-900/70 bg-red-950/20 p-3 space-y-2">
                <p className="text-xs text-red-200 leading-relaxed">
                  Apaga geografia, eras, todas as espécies, indivíduos, o log inteiro e a
                  cópia salva no navegador. O app volta à Fase 1. Não dá para desfazer.
                </p>
                <p className="text-[11px] text-stone-400">
                  Se quiser guardar este mundo antes, feche aqui e exporte o .json.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmandoReset(false)}
                    className="flex-1 px-3 py-2 rounded border border-stone-700 text-xs text-stone-300">Cancelar</button>
                  <button onClick={onResetarTudo}
                    className="flex-1 px-3 py-2 rounded bg-red-900/70 border border-red-800 text-xs text-red-100 hover:bg-red-900">
                    Sim, apagar tudo
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
