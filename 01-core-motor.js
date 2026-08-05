/* ============================================================
   MOTOR DE SEED — a seed é um ENDEREÇO num espaço combinatório
   finito de espécimes, não um gerador de números pseudoaleatórios.
   Cada gene contribui um "dígito" cuja base é o tamanho do domínio
   válido *naquele momento* (após travas). decode: seed -> ctx.
   encode: ctx -> seed. randomize: ctx fresco, com o mesmo peso de
   raridade das tabelas — só usado para "gerar uma seed aleatória".
   ============================================================ */

function pick(table, n) { for (const row of table) if (n <= row.max) return row; return table[table.length - 1]; }

/* CACHE de validNumbers. Medido: validNumbers custava ~70% do tempo de
   runSpeciesSteps (varre 1..100 chamando pick() a cada gene categórico,
   ~40x por espécie, 2x por buildSpecies). As tabelas são estáticas e o
   conjunto de restrições possíveis é pequeno e repetitivo, então o
   resultado é perfeitamente memoizável. A chave usa um id estável por
   tabela + a assinatura ordenada de restrict/exclude. O array devolvido
   é CONGELADO para nenhum chamador conseguir mutar o cache por engano. */
const __tableIds = new WeakMap();
let __tableIdSeq = 0;
function tableId(table) {
  let id = __tableIds.get(table);
  if (id === undefined) { id = ++__tableIdSeq; __tableIds.set(table, id); }
  return id;
}
const __validNumbersCache = new Map();
function validNumbers(table, opts = {}) {
  const r = opts.restrict ? opts.restrict.slice().sort().join(",") : "";
  const e = opts.exclude ? opts.exclude.slice().sort().join(",") : "";
  const chave = tableId(table) + "|" + r + "|" + e;
  const hit = __validNumbersCache.get(chave);
  if (hit) return hit;
  const nums = [];
  for (let n = 1; n <= 100; n++) {
    const label = pick(table, n).value;
    if (opts.restrict && !opts.restrict.includes(label)) continue;
    if (opts.exclude && opts.exclude.includes(label)) continue;
    nums.push(n);
  }
  Object.freeze(nums);
  __validNumbersCache.set(chave, nums);
  return nums;
}

// 3d4-3: enumera as 64 triplas de dados possíveis; TRIPLES[i] = soma (0..9)
const TRIPLES = (() => { const a = []; for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) a.push(x + y + z); return a; })();
const __scalarDomainCache = new Map();
function scalarDomainIdx(min = 0, max = 9) {
  const chave = min + ":" + max;
  const hit = __scalarDomainCache.get(chave);
  if (hit) return hit;
  const idxs = [];
  TRIPLES.forEach((sum, i) => { if (sum >= min && sum <= max) idxs.push(i); });
  Object.freeze(idxs);
  __scalarDomainCache.set(chave, idxs);
  return idxs;
}

/* ============================================================
   MISTURA BIJETIVA (rede de Feistel) — espalha seeds vizinhas
   por pontos distantes do espaço, sem perder reversibilidade:
   inverse(forward(x)) === x sempre. É o que faz "1" e "2"
   gerarem criaturas completamente diferentes.
   ============================================================ */
const F_MUL_A = 0x9E3779B97F4A7C15n;
const F_MUL_B = 0xC2B2AE3D27D4EB4Fn;
const F_KEYS = [0xA0761D6478BD642Fn, 0xE7037ED1A0B428DBn, 0x8EBC6AF09C88C6E3n, 0x589965CC75374CC3n];
const SPECIES_HALF = 256n; // espaço de 512 bits — folga sobre o maior endereço real
const IND_HALF = 64n;      // espaço de 128 bits

function feistelRoundF(x, key, mask) {
  let v = (x ^ key) & mask;
  v = (v * F_MUL_A) & mask;
  v ^= v >> 31n;
  v = (v * F_MUL_B) & mask;
  v ^= v >> 27n;
  return v & mask;
}
function mixForward(x, halfBits) {
  const mask = (1n << halfBits) - 1n, total = 1n << (halfBits * 2n);
  x = ((x % total) + total) % total;
  let L = (x >> halfBits) & mask, R = x & mask;
  for (const k of F_KEYS) { const nL = R, nR = L ^ feistelRoundF(R, k, mask); L = nL; R = nR; }
  return (L << halfBits) | R;
}
function mixInverse(y, halfBits) {
  const mask = (1n << halfBits) - 1n, total = 1n << (halfBits * 2n);
  y = ((y % total) + total) % total;
  let L = (y >> halfBits) & mask, R = y & mask;
  for (let i = F_KEYS.length - 1; i >= 0; i--) { const pR = L, pL = R ^ feistelRoundF(pR, F_KEYS[i], mask); L = pL; R = pR; }
  return (L << halfBits) | R;
}

/* Converte um texto livre (nome, frase) num endereço numérico estável.
   FNV-1a de 128 bits — determinístico, sem colisão prática pro uso aqui.
   Existia uma chamada a textToSeed em parseAnySeed sem a função estar
   definida em lugar nenhum: qualquer seed não-numérica derrubava a
   aplicação com ReferenceError. */
function textToSeed(str) {
  const s = String(str || "");
  const OFFSET = 0x6C62272E07BB014262B821756295C58Dn;
  const PRIME = 0x0000000001000000000000000000013Bn;
  const MASK = (1n << 128n) - 1n;
  let h = OFFSET;
  const bytes = new TextEncoder().encode(s);
  for (const b of bytes) { h = (h ^ BigInt(b)) & MASK; h = (h * PRIME) & MASK; }
  return { seed: h, texto: s };
}

/* Entrada única: dígitos puros viram número; qualquer outra coisa vira texto. */
function parseAnySeed(str) {
  const s = (str || "").trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) { try { return BigInt(s); } catch { return null; } }
  const { seed } = textToSeed(s);
  return seed;
}

/* ---------- passos de gene categórico (d100) ---------- */
function categoricalStep(cur, key, table, opts = {}) {
  if (opts.fixed !== undefined) { cur.ctx[key] = opts.fixed; return opts.fixed; }
  let nums = validNumbers(table, opts);
  if (nums.length === 0 && opts.restrict) nums = validNumbers(table, { restrict: opts.restrict }); // exclusão engoliu tudo: a restrição vence
  if (nums.length === 0 && opts.exclude) nums = validNumbers(table, { exclude: opts.exclude });
  if (nums.length === 0) { cur.ctx[key] = table[0].value; return table[0].value; }
  const base = BigInt(nums.length);
  let value;
  if (cur.mode === "randomize") {
    if (cur.manual[key] !== undefined && nums.some((n) => pick(table, n).value === cur.manual[key])) {
      value = cur.manual[key];
    } else if (opts.bias && opts.bias.length) {
      const n1 = nums[Math.floor(Math.random() * nums.length)];
      const n2 = nums[Math.floor(Math.random() * nums.length)];
      const l1 = pick(table, n1).value, l2 = pick(table, n2).value;
      value = opts.bias.includes(l1) ? l1 : l2;
    } else {
      value = pick(table, nums[Math.floor(Math.random() * nums.length)]).value;
    }
  } else if (cur.mode === "decode") {
    if (cur.manual[key] !== undefined && nums.some((n) => pick(table, n).value === cur.manual[key])) {
      value = cur.manual[key];
    } else {
      const idx = Number(cur.seed % base); cur.seed /= base;
      value = pick(table, nums[idx]).value;
    }
  } else { // encode
    value = cur.ctx[key];
    const n = nums.find((n) => pick(table, n).value === value) ?? nums[0];
    const idx = BigInt(nums.indexOf(n));
    cur.outValue += idx * cur.outMult; cur.outMult *= base;
  }
  cur.ctx[key] = value;
  return value;
}

/* ---------- passos de gene escalar (3d4-3) ---------- */
function scalarStep(cur, key, opts = {}) {
  const domain = scalarDomainIdx(opts.min ?? 0, opts.max ?? 9);
  const base = BigInt(domain.length);
  let value;
  if (cur.mode === "randomize") {
    // um valor manual fora do domínio atual (ex.: a deriva deixou locVelocidade=7
    // numa espécie que depois virou séssil, min:0/max:0) não pode ser aceito como
    // está — cai no sorteio normal dentro do domínio válido, senão a inconsistência
    // se propaga e a seed nunca mais reconstrói fielmente esse gene.
    const manualValido = cur.manual[key] !== undefined && domain.some((di) => TRIPLES[di] === Number(cur.manual[key]));
    if (manualValido) value = Number(cur.manual[key]);
    else if (opts.bias === "high") value = TRIPLES[domain[Math.max(...[0, 1].map(() => Math.floor(Math.random() * domain.length)))]];
    else if (opts.bias === "low") value = TRIPLES[domain[Math.min(...[0, 1].map(() => Math.floor(Math.random() * domain.length)))]];
    else value = TRIPLES[domain[Math.floor(Math.random() * domain.length)]];
  } else if (cur.mode === "decode") {
    if (cur.manual[key] !== undefined) value = Number(cur.manual[key]);
    else { const idx = Number(cur.seed % base); cur.seed /= base; value = TRIPLES[domain[idx]]; }
  } else {
    value = cur.ctx[key];
    const pos = domain.find((di) => TRIPLES[di] === value) ?? domain[0];
    const idx = BigInt(domain.indexOf(pos));
    cur.outValue += idx * cur.outMult; cur.outMult *= base;
  }
  cur.ctx[key] = value;
  return value;
}

/* ---------- dígito genérico (clado, variação d6, checagens d100) ---------- */
function rawStep(cur, key, base, { decodeFn, encodeFn, randomizeFn }) {
  let value;
  const b = BigInt(base);
  if (cur.mode === "randomize") value = cur.manual?.[key] !== undefined ? cur.manual[key] : randomizeFn();
  else if (cur.mode === "decode") {
    if (cur.manual?.[key] !== undefined) value = cur.manual[key];
    else { const raw = Number(cur.seed % b); cur.seed /= b; value = decodeFn(raw); }
  } else {
    value = cur.ctx[key];
    const raw = encodeFn(value);
    cur.outValue += BigInt(raw) * cur.outMult; cur.outMult *= b;
  }
  cur.ctx[key] = value;
  return value;
}

function newCursor(mode, { seed = 0n, manual = {}, ctx = {} } = {}) {
  return { mode, seed, manual, ctx, outValue: 0n, outMult: 1n };
}

/* ============================================================
   TABELAS (Parte II do DRN2)
   ============================================================ */
const T = {
  tolHidrica: [{ max: 34, value: "ms", label: "Mesófilo" }, { max: 52, value: "um", label: "Umidófilo" }, { max: 66, value: "xe", label: "Xerófilo" }, { max: 79, value: "sa", label: "Semiaquático" }, { max: 92, value: "aq", label: "Aquático obrigatório" }, { max: 100, value: "eu", label: "Eurihídrico" }],
  tolTermica: [{ max: 45, value: "tp", label: "Temperado" }, { max: 68, value: "qt", label: "Quente" }, { max: 86, value: "fr", label: "Frio" }, { max: 100, value: "eu", label: "Euritérmico" }],
  tolCiclo: [{ max: 40, value: "di", label: "Diurno" }, { max: 68, value: "no", label: "Noturno" }, { max: 84, value: "cr", label: "Crepuscular" }, { max: 94, value: "ct", label: "Catemeral" }, { max: 100, value: "sz", label: "Sazonal" }],
  // Fase 2, item 5.3 — reinos Ar (construto) e Sp (espiritual) removidos
  // por completo; pesos redistribuídos entre os quatro restantes.
  reino: [{ max: 70, value: "An", label: "Animal" }, { max: 86, value: "Pl", label: "Planta" }, { max: 94, value: "Fu", label: "Fungo" }, { max: 100, value: "Ba", label: "Bactéria" }],
  classeAn: [{ max: 25, value: "MAM", label: "Mamífero" }, { max: 42, value: "AVE", label: "Ave" }, { max: 58, value: "REP", label: "Réptil" }, { max: 68, value: "AMP", label: "Anfíbio" }, { max: 82, value: "PSC", label: "Peixe" }, { max: 94, value: "INS", label: "Inseto / artrópode" }, { max: 100, value: "MOL", label: "Molusco" }],
  mag: [{ max: 30, value: "A0", label: "Nulo" }, { max: 48, value: "A1", label: "Latente" }, { max: 60, value: "A2", label: "Residual" }, { max: 75, value: "A3", label: "Instintivo" }, { max: 85, value: "A4", label: "Funcional" }, { max: 93, value: "A5", label: "Disciplinado" }, { max: 97, value: "A6", label: "Versátil" }, { max: 98, value: "A7", label: "Dominante" }, { max: 99, value: "A8", label: "Excepcional" }, { max: 100, value: "A9", label: "Ápice" }],
  simetria: [{ max: 78, value: "bi", label: "Bilateral" }, { max: 88, value: "rd", label: "Radial" }, { max: 94, value: "es", label: "Espiral" }, { max: 98, value: "as", label: "Assimétrica" }, { max: 100, value: "am", label: "Amorfa" }],
  porte: [{ max: 12, value: "mn", label: "Minúsculo", n: 0 }, { max: 42, value: "pq", label: "Pequeno", n: 1 }, { max: 70, value: "md", label: "Médio", n: 2 }, { max: 88, value: "gr", label: "Grande", n: 3 }, { max: 97, value: "cl", label: "Colossal", n: 4 }, { max: 100, value: "tt", label: "Titânico", n: 5 }],
  // MOR gene 4 — só relevante para reino Pl/Fu (silhueta geral, que LOC+MEM+CRN já dão de graça pra An/Ar/Sp)
  morFormaPl: [{ max: 28, value: "ar", label: "Arbustiva" }, { max: 48, value: "av", label: "Arbórea" }, { max: 63, value: "ta", label: "Tapete / rasteira" }, { max: 76, value: "tr", label: "Trepadeira" }, { max: 86, value: "ro", label: "Rosácea" }, { max: 95, value: "co", label: "Colunar" }, { max: 100, value: "am", label: "Amorfa" }],
  morFormaFu: [{ max: 30, value: "ch", label: "Chapéu-e-pé" }, { max: 48, value: "mi", label: "Miceliar / tapete" }, { max: 63, value: "pr", label: "Prateleira" }, { max: 76, value: "es", label: "Esférica" }, { max: 90, value: "cr", label: "Coral" }, { max: 100, value: "am", label: "Amorfa" }],
  // Fase 1, item 4.1 — silhueta própria de bactéria (equivalente a morForma para Ba)
  morFormaBa: [{ max: 35, value: "cc", label: "Cocoide" }, { max: 65, value: "bc", label: "Bacilo" }, { max: 85, value: "es", label: "Espiral" }, { max: 100, value: "fl", label: "Filamentosa" }],
  // proporções — só fazem sentido pra quem tem tronco/membro/pescoço de verdade (An/Ar/Sp; Pl/Fu já resolvem silhueta via morForma)
  morTorso: [{ max: 30, value: "co", label: "Compacto" }, { max: 75, value: "pr", label: "Proporcional" }, { max: 95, value: "al", label: "Alongado" }, { max: 100, value: "se", label: "Serpentino" }],
  memProp: [{ max: 25, value: "cu", label: "Curtos" }, { max: 70, value: "pr", label: "Proporcionais" }, { max: 92, value: "lo", label: "Longos" }, { max: 100, value: "ex", label: "Extremamente longos" }],
  crnPescoco: [{ max: 15, value: "au", label: "Ausente" }, { max: 55, value: "cu", label: "Curto" }, { max: 85, value: "pr", label: "Proporcional" }, { max: 96, value: "lo", label: "Longo" }, { max: 100, value: "el", label: "Elongadíssimo" }],
  locPrim: [{ max: 24, value: "Q", label: "Quadrúpede" }, { max: 38, value: "B", label: "Bípede" }, { max: 48, value: "S", label: "Serpentiforme" }, { max: 60, value: "N", label: "Natação" }, { max: 70, value: "H", label: "Hexápode" }, { max: 78, value: "V", label: "Voo" }, { max: 84, value: "O", label: "Octópode+" }, { max: 88, value: "E", label: "Escalada" }, { max: 92, value: "C", label: "Escavação" }, { max: 96, value: "F", label: "Fixo / séssil" }, { max: 98, value: "P", label: "Planeio" }, { max: 99, value: "R", label: "Rolante" }, { max: 100, value: "Z", label: "Fásico" }],
  // Passo 5, gene 2: 01-50 = nenhum; 51-100 reescala a tabela de locPrim (mesma proporção, metade do espaço)
  locSec: [{ max: 50, value: "0", label: "Nenhum" }, { max: 63, value: "Q", label: "Quadrúpede" }, { max: 70, value: "B", label: "Bípede" }, { max: 75, value: "S", label: "Serpentiforme" }, { max: 81, value: "N", label: "Natação" }, { max: 86, value: "H", label: "Hexápode" }, { max: 90, value: "V", label: "Voo" }, { max: 93, value: "O", label: "Octópode+" }, { max: 95, value: "E", label: "Escalada" }, { max: 97, value: "C", label: "Escavação" }, { max: 99, value: "F", label: "Fixo / séssil" }, { max: 100, value: "P", label: "Planeio" }],
  memSup: [{ max: 35, value: "0S", label: "0 superiores" }, { max: 85, value: "2S", label: "2 superiores" }, { max: 95, value: "4S", label: "4 superiores" }, { max: 99, value: "6S", label: "6 superiores" }, { max: 100, value: "8S", label: "8 superiores" }],
  memTerm: [{ max: 22, value: "pa", label: "Pata almofadada" }, { max: 42, value: "gr", label: "Garra" }, { max: 55, value: "ca", label: "Casco" }, { max: 70, value: "mo", label: "Mão preênsil" }, { max: 80, value: "ba", label: "Barbatana" }, { max: 88, value: "pi", label: "Pinça" }, { max: 94, value: "ve", label: "Ventosa" }, { max: 98, value: "ra", label: "Raiz" }, { max: 100, value: "no", label: "Nenhuma diferenciada" }],
  repModo: [{ max: 32, value: "ov", label: "Ovíparo" }, { max: 58, value: "vv", label: "Vivíparo" }, { max: 70, value: "oz", label: "Ovovivíparo" }, { max: 79, value: "sp", label: "Esporos" }, { max: 86, value: "gm", label: "Gemação" }, { max: 92, value: "fs", label: "Fissão" }, { max: 96, value: "ax", label: "Assexuado" }, { max: 98, value: "an", label: "Animação" }, { max: 100, value: "ni", label: "Não se reproduz" }],
  crnFormato: [{ max: 30, value: "br", label: "Curto/robusto" }, { max: 58, value: "dl", label: "Alongado" }, { max: 72, value: "ch", label: "Achatado" }, { max: 84, value: "bi", label: "Bicudo" }, { max: 92, value: "hu", label: "Humanoide" }, { max: 97, value: "am", label: "Amorfo" }, { max: 100, value: "0", label: "Sem crânio definido" }],
  crnChifreQtd: [{ max: 65, value: "0", label: "Ausentes" }, { max: 85, value: "2", label: "2" }, { max: 93, value: "1", label: "1" }, { max: 97, value: "4", label: "4" }, { max: 100, value: "6", label: "6" }],
  crnChifreForma: [{ max: 35, value: "c", label: "Curvo" }, { max: 60, value: "r", label: "Reto" }, { max: 78, value: "g", label: "Galhado" }, { max: 90, value: "e", label: "Espiral" }, { max: 97, value: "l", label: "Lâmina" }, { max: 100, value: "f", label: "Coroa" }],
  crnCrista: [{ max: 60, value: "0", label: "Ausente" }, { max: 72, value: "ce", label: "Espinhal" }, { max: 82, value: "cr", label: "Craniana" }, { max: 90, value: "jb", label: "Juba" }, { max: 95, value: "ba", label: "Barbela" }, { max: 98, value: "ap", label: "Apêndice luminoso" }, { max: 100, value: "au", label: "Auréola áurica" }],
  dieBase: [{ max: 22, value: "hb", label: "Herbívoro" }, { max: 40, value: "cn", label: "Carnívoro" }, { max: 56, value: "on", label: "Onívoro" }, { max: 68, value: "in", label: "Insetívoro" }, { max: 77, value: "fr", label: "Frugívoro" }, { max: 84, value: "de", label: "Detritívoro" }, { max: 89, value: "nf", label: "Necrófago" }, { max: 93, value: "nc", label: "Nectarívoro" }, { max: 95, value: "he", label: "Hematófago" }, { max: 97, value: "ft", label: "Fotossintético" }, { max: 98, value: "qm", label: "Quimiossintético" }, { max: 99, value: "au", label: "Áurivoro" }, { max: 100, value: "ni", label: "Não se alimenta" }],
  dieRestricao: [{ max: 60, value: "0", label: "Generalista" }, { max: 74, value: "mo", label: "Monófago" }, { max: 85, value: "sz", label: "Sazonal" }, { max: 92, value: "ca", label: "Canibal" }, { max: 97, value: "os", label: "Osteófago" }, { max: 100, value: "ge", label: "Geófago" }],
  facFocinho: [{ max: 28, value: "cu", label: "Curto" }, { max: 52, value: "lo", label: "Longo" }, { max: 66, value: "pl", label: "Plano" }, { max: 78, value: "bi", label: "Bico" }, { max: 87, value: "mn", label: "Mandíbulas externas" }, { max: 93, value: "tr", label: "Tromba" }, { max: 98, value: "tu", label: "Tubular" }, { max: 100, value: "0", label: "Ausente" }],
  facOrelha: [{ max: 24, value: "rd", label: "Arredondada" }, { max: 44, value: "pn", label: "Pontiaguda" }, { max: 60, value: "in", label: "Interna" }, { max: 72, value: "cd", label: "Caída" }, { max: 82, value: "lg", label: "Longa" }, { max: 90, value: "mb", label: "Membranosa" }, { max: 97, value: "an", label: "Antena" }, { max: 100, value: "0", label: "Ausente" }],
  facOlhosQtd: [{ max: 70, value: 2, label: "2" }, { max: 76, value: 0, label: "0" }, { max: 86, value: 4, label: "4" }, { max: 93, value: 6, label: "6" }, { max: 98, value: 8, label: "8" }, { max: 100, value: 1, label: "1" }],
  facOlhosTipo: [{ max: 45, value: "rd", label: "Redondo" }, { max: 70, value: "fd", label: "Fendido" }, { max: 85, value: "cp", label: "Composto" }, { max: 95, value: "lm", label: "Luminoso" }, { max: 100, value: "cg", label: "Cego" }],
  facDenticao: [{ max: 28, value: "mx", label: "Mista" }, { max: 48, value: "cn", label: "Canina" }, { max: 66, value: "in", label: "Incisiva" }, { max: 78, value: "pl", label: "Placa moedora" }, { max: 86, value: "fl", label: "Filtradora" }, { max: 95, value: "pr", label: "Presas venenosas" }, { max: 100, value: "0", label: "Ausente" }],
  // Fase 2, item 5.3 — "Et" (Etéreo) removido: sem reino Sp, não há mais gatilho coerente pra ele
  tegTipo: [{ max: 15, value: "Pe", label: "Pelo" }, { max: 30, value: "Es", label: "Escama" }, { max: 45, value: "Cr", label: "Couro nu" }, { max: 60, value: "Ql", label: "Quitina" }, { max: 69, value: "Pn", label: "Pena" }, { max: 77, value: "Mu", label: "Mucosa" }, { max: 85, value: "Cs", label: "Casca" }, { max: 91, value: "Cn", label: "Cristalino" }, { max: 96, value: "Me", label: "Metálico" }, { max: 100, value: "Pd", label: "Pedra" }],
  tegCor: [{ max: 14, value: "Mrr", label: "Marrom", faixa: "Comum" }, { max: 26, value: "Cnz", label: "Cinza", faixa: "Comum" }, { max: 38, value: "Pre", label: "Preto", faixa: "Comum" }, { max: 50, value: "Vrd", label: "Verde", faixa: "Comum" }, { max: 60, value: "Bra", label: "Branco", faixa: "Comum" }, { max: 68, value: "Amr", label: "Amarelo", faixa: "Incomum" }, { max: 76, value: "Vrm", label: "Vermelho", faixa: "Incomum" }, { max: 83, value: "Azl", label: "Azul", faixa: "Incomum" }, { max: 88, value: "Lrj", label: "Laranja", faixa: "Incomum" }, { max: 92, value: "Rox", label: "Roxo", faixa: "Raro" }, { max: 95, value: "Dou", label: "Dourado", faixa: "Raro" }, { max: 97, value: "Prt", label: "Prateado", faixa: "Raro" }, { max: 99, value: "Trn", label: "Translúcido", faixa: "Excepcional" }, { max: 100, value: "Irr", label: "Irreal", faixa: "Excepcional" }],
  tegPadrao: [{ max: 35, value: "ls", label: "Liso", faixa: "Comum" }, { max: 55, value: "mc", label: "Manchado", faixa: "Comum" }, { max: 70, value: "lt", label: "Listrado", faixa: "Comum" }, { max: 80, value: "gd", label: "Gradiente", faixa: "Incomum" }, { max: 88, value: "rt", label: "Reticulado", faixa: "Incomum" }, { max: 93, value: "oc", label: "Ocelado", faixa: "Raro" }, { max: 97, value: "if", label: "Iridescente", faixa: "Raro" }, { max: 99, value: "lm", label: "Luminescente", faixa: "Excepcional" }, { max: 100, value: "gv", label: "Gravado", faixa: "Excepcional" }],
  asaQtd: [{ max: 72, value: 0, label: "0" }, { max: 90, value: 2, label: "2" }, { max: 96, value: 4, label: "4" }, { max: 99, value: 6, label: "6" }, { max: 100, value: 8, label: "8" }],
  // Fase 2, item 5.3 — "et" (Etérea) removida: sem reino Sp, não há mais gatilho coerente pra ela
  asaTipo: [{ max: 36, value: "mb", label: "Membranosa" }, { max: 65, value: "pn", label: "Penada" }, { max: 84, value: "qt", label: "Quitinosa" }, { max: 96, value: "el", label: "Élitro" }, { max: 100, value: "vg", label: "Vegetal" }],
  cdaComp: [{ max: 30, value: "0", label: "0" }, { max: 52, value: "md", label: "Média" }, { max: 74, value: "lg", label: "Longa" }, { max: 90, value: "ct", label: "Curta" }, { max: 100, value: "xl", label: "Extra longa" }],
  cdaTipo: [{ max: 22, value: "pl", label: "Peluda" }, { max: 40, value: "es", label: "Escamosa" }, { max: 54, value: "nu", label: "Nua" }, { max: 68, value: "pr", label: "Preênsil" }, { max: 78, value: "pq", label: "Emplumada" }, { max: 86, value: "bq", label: "Barbatana caudal" }, { max: 92, value: "lm", label: "Lâmina" }, { max: 97, value: "fr", label: "Ferrão venenoso" }, { max: 100, value: "lq", label: "Líquida" }],
  senEspecial: [{ max: 55, value: "0", label: "Nenhum" }, { max: 66, value: "vb", label: "Vibrossensor" }, { max: 75, value: "tr", label: "Termorrecepção" }, { max: 83, value: "ec", label: "Ecolocalização" }, { max: 89, value: "mg", label: "Magnetorrecepção" }, { max: 94, value: "el", label: "Eletrorrecepção" }, { max: 98, value: "au", label: "Percepção áurica" }, { max: 100, value: "pr", label: "Precognição rasa" }],
  socEstrutura: [{ max: 35, value: "so", label: "Solitário" }, { max: 56, value: "ba", label: "Bando" }, { max: 68, value: "pa", label: "Par vitalício" }, { max: 80, value: "ma", label: "Matilha" }, { max: 89, value: "co", label: "Colônia" }, { max: 96, value: "en", label: "Enxame" }, { max: 100, value: "me", label: "Mente coletiva" }],
  defArma: [{ max: 25, value: "0", label: "Nenhuma" }, { max: 42, value: "gr", label: "Garras" }, { max: 58, value: "pr", label: "Presas" }, { max: 68, value: "es", label: "Espinhos" }, { max: 77, value: "ch", label: "Chifres" }, { max: 85, value: "ve", label: "Veneno" }, { max: 90, value: "cn", label: "Constrição" }, { max: 94, value: "cu", label: "Cuspe/jato" }, { max: 97, value: "el", label: "Descarga elétrica" }, { max: 99, value: "so", label: "Ataque sônico" }, { max: 100, value: "au", label: "Ataque áurico" }],
  defEstrategia: [{ max: 28, value: "fu", label: "Fuga" }, { max: 46, value: "ca", label: "Camuflagem" }, { max: 62, value: "lu", label: "Luta" }, { max: 74, value: "gp", label: "Defesa em grupo" }, { max: 83, value: "mm", label: "Mimetismo" }, { max: 90, value: "to", label: "Toxicidade aposemática" }, { max: 96, value: "ri", label: "Rigidez" }, { max: 100, value: "re", label: "Regeneração" }],
  ano: [{ max: 18, value: "*alb", label: "Albinismo" }, { max: 34, value: "*mel", label: "Melanismo" }, { max: 48, value: "*het", label: "Heterocromia" }, { max: 60, value: "*gig", label: "Gigantismo" }, { max: 71, value: "*nan", label: "Nanismo" }, { max: 81, value: "*pol", label: "Polimelia" }, { max: 89, value: "*reg", label: "Regeneração anômala" }, { max: 95, value: "*bic", label: "Bicefalia" }, { max: 98, value: "*aur", label: "Poder fora de escala" }, { max: 100, value: "*fas", label: "Fasmatismo" }],

  // ===== Fase 3 — Genes novos por táxon (proposta aprovada sem alterações) =====
  // MAM
  glandulaMamaria: [{ max: 20, value: "au", label: "Ausente" }, { max: 45, value: "ve", label: "Vestigial" }, { max: 80, value: "fb", label: "Funcional — baixa produção" }, { max: 100, value: "fa", label: "Funcional — alta produção" }],
  dentesTipo: [{ max: 34, value: "ho", label: "Homodonte" }, { max: 67, value: "he", label: "Heterodonte simples" }, { max: 100, value: "hc", label: "Heterodonte complexo (molares especializados)" }],
  termorregulacao: [{ max: 20, value: "er", label: "Ectotermia residual" }, { max: 55, value: "ep", label: "Endotermia parcial" }, { max: 100, value: "el", label: "Endotermia plena" }],
  gestacao: [{ max: 30, value: "ma", label: "Marsupial" }, { max: 65, value: "pc", label: "Placentária curta" }, { max: 100, value: "pl", label: "Placentária longa" }],
  // AVE
  bicoFormato: [{ max: 25, value: "gr", label: "Granívoro/curto-grosso" }, { max: 48, value: "in", label: "Insetívoro/fino" }, { max: 70, value: "ca", label: "Carnívoro/gancho" }, { max: 85, value: "fl", label: "Filtrador" }, { max: 100, value: "nc", label: "Nectarívoro/longo-fino" }],
  penaFuncao: [{ max: 40, value: "vo", label: "Só voo" }, { max: 78, value: "vi", label: "Voo + isolamento" }, { max: 100, value: "or", label: "Ornamental proeminente" }],
  migratorio: [{ max: 62, value: "se", label: "Sedentária" }, { max: 100, value: "mi", label: "Migratória sazonal" }],
  // REP
  escamaTipo: [{ max: 40, value: "li", label: "Lisa" }, { max: 75, value: "qu", label: "Quilhada" }, { max: 100, value: "os", label: "Osteoderme/blindada" }],
  venenoAparato: [{ max: 55, value: "au", label: "Ausente" }, { max: 82, value: "pi", label: "Presas inoculadoras" }, { max: 100, value: "gd", label: "Glândula difusa não-inoculadora" }],
  regeneracaoCauda: [{ max: 45, value: "au", label: "Ausente" }, { max: 78, value: "pa", label: "Parcial" }, { max: 100, value: "co", label: "Completa" }],
  // AMP
  metamorfose: [{ max: 30, value: "di", label: "Direta/sem estágio larval" }, { max: 78, value: "la", label: "Larval aquática clássica" }, { max: 100, value: "ne", label: "Neotenia possível" }],
  peleToxinas: [{ max: 50, value: "au", label: "Ausente" }, { max: 80, value: "le", label: "Leve irritante" }, { max: 100, value: "to", label: "Tóxica" }],
  // PSC
  nadadeiraConfiguracao: [{ max: 60, value: "pa", label: "Padrão" }, { max: 85, value: "mr", label: "Modificada em membro rudimentar" }, { max: 100, value: "vo", label: "Voadora" }],
  respiracaoBranquial: [{ max: 75, value: "sb", label: "Só brânquia" }, { max: 100, value: "ac", label: "Brânquia + órgão acessório de ar atmosférico" }],
  bexigaNatatoria: [{ max: 40, value: "au", label: "Ausente" }, { max: 100, value: "pr", label: "Presente" }],
  // INS
  metamorfoseTipo: [{ max: 30, value: "am", label: "Ametábola" }, { max: 65, value: "he", label: "Hemimetábola" }, { max: 100, value: "ho", label: "Holometábola" }],
  patasQtdEspecializada: [{ max: 55, value: "pd", label: "6 patas padrão" }, { max: 80, value: "rp", label: "Patas raptoriais" }, { max: 100, value: "na", label: "Patas natatórias/adaptadas" }],
  venenoOuFerroao: [{ max: 55, value: "au", label: "Ausente" }, { max: 80, value: "fd", label: "Ferrão defensivo" }, { max: 100, value: "mi", label: "Mandíbula inoculadora" }],
  coloniaTipo: [{ max: 65, value: "so", label: "Solitário" }, { max: 100, value: "eu", label: "Eussocial com castas" }],
  // MOL
  concha: [{ max: 30, value: "au", label: "Ausente/nu" }, { max: 55, value: "in", label: "Interna" }, { max: 80, value: "es", label: "Externa espiralada" }, { max: 100, value: "bv", label: "Externa bivalve" }],
  tentaculosQtd: [{ max: 25, value: 0, label: "0" }, { max: 50, value: 2, label: "2" }, { max: 75, value: 8, label: "8" }, { max: 92, value: 10, label: "10" }, { max: 100, value: 99, label: "Muitos" }],
  tintaDefensiva: [{ max: 60, value: "au", label: "Ausente" }, { max: 100, value: "pr", label: "Presente" }],
  // Pl
  raizTipo: [{ max: 45, value: "fa", label: "Fasciculada" }, { max: 85, value: "pi", label: "Pivotante" }, { max: 100, value: "ae", label: "Aérea/epífita" }],
  folhaTipo: [{ max: 15, value: "au", label: "Ausente" }, { max: 45, value: "ag", label: "Agulha" }, { max: 80, value: "la", label: "Larga" }, { max: 100, value: "su", label: "Suculenta" }],
  reproducaoEstrutura: [{ max: 55, value: "fl", label: "Flor" }, { max: 80, value: "co", label: "Cone" }, { max: 100, value: "es", label: "Esporo" }],
  // Fu
  corpoFrutiferoTipo: [{ max: 20, value: "nv", label: "Nenhum visível" }, { max: 60, value: "cp", label: "Cogumelo clássico (píleo-estipe)" }, { max: 82, value: "cr", label: "Crosta" }, { max: 100, value: "pr", label: "Prateleira" }],
  esporoDispersao: [{ max: 55, value: "ve", label: "Vento" }, { max: 82, value: "an", label: "Animal" }, { max: 100, value: "ag", label: "Água" }],
  // Ba
  paredeCelularTipo: [{ max: 55, value: "gp", label: "Gram-positiva-análoga" }, { max: 100, value: "gn", label: "Gram-negativa-análoga" }],
  metabolismoTipo: [{ max: 40, value: "qm", label: "Quimiossíntese" }, { max: 70, value: "ft", label: "Fotossíntese" }, { max: 100, value: "de", label: "Decomposição/heterotrofia" }],
  formaColonia: [{ max: 40, value: "is", label: "Isolada" }, { max: 75, value: "ca", label: "Cadeia" }, { max: 100, value: "bf", label: "Biofilme" }],
};
const CONS = "BCDFGHJKLMNPQRSTVXZ", VOG = "aeiouy";

/* ============================================================
   PASSO 1 A 18 — a mesma sequência causal do documento, agora
   como uma função que roda em 3 modos (randomize/decode/encode)
   ============================================================ */
/* ============================================================
   TRAVAS POR CLASSE TAXONÔMICA
   Até aqui a classe (MAM/AVE/REP/...) era decorativa: era sorteada
   e não restringia nada, o que produzia "aves" serpentiformes sem
   pena nem asa. Agora cada classe trava o plano corporal inteiro.
   Regras aplicadas nos passos posteriores ao Passo 2 (a classe é
   definida lá, então tudo aqui corre para frente).
   ============================================================ */
const CLASSE_TRAVAS = {
  MAM: { // mamífero: quatro membros no máximo, pelo ou pele nua, vivíparo
    locPrimario: { restrict: ["Q", "B", "N", "E", "C", "V", "S"] },
    memSup: { restrict: ["0S", "2S"] },
    memTerm: { restrict: ["pa", "gr", "ca", "mo", "ba"] },
    repModo: { restrict: ["vv", "oz"] },
    tegTipo: { restrict: ["Pe", "Cr"] },
    asaTipo: { restrict: ["mb"] }, // Fase 1, item 4.3 — membranosa, única coerente com pelo/couro (tipo morcego)
    crnFormato: { exclude: ["0"] },
    facFocinho: { exclude: ["bi", "mn", "tu"] },
    facOrelha: { exclude: ["an", "mb"] },
  },
  AVE: { // ave: bípede ou voadora, pena, bico sem dente, duas asas, ovípara
    locPrimario: { restrict: ["V", "B", "N", "P"] },
    memSup: { fixed: "0S" },
    memInf: { fixed: "2I" },
    memTerm: { restrict: ["gr", "pa", "ba"] },
    repModo: { fixed: "ov" },
    tegTipo: { fixed: "Pn" },
    crnFormato: { restrict: ["br", "dl", "bi"] },
    facFocinho: { fixed: "bi" },
    facDenticao: { fixed: "0" },
    facOrelha: { restrict: ["in", "pn"] },
    asaQtd: { fixed: 2 },
    asaTipo: { fixed: "pn" },
    cdaTipo: { restrict: ["pq", "nu"] },
  },
  REP: { // réptil: escama, ovíparo, sem asa, crânio ossificado
    locPrimario: { restrict: ["Q", "S", "N", "E", "C", "B"] },
    // sem esta trava, 3,14% dos répteis nasciam sem crânio definido — e daí
    // saíam as combinações contraditórias reportadas (réptil sem crânio com
    // presas). MAM/AVE/PSC/INS/MOL já travavam crnFormato; REP e AMP não.
    crnFormato: { exclude: ["0", "hu"] },
    memSup: { restrict: ["0S", "2S"] },
    memTerm: { restrict: ["gr", "pa", "ba", "no"] },
    repModo: { restrict: ["ov", "oz"] },
    tegTipo: { restrict: ["Es", "Cr"] },
    facFocinho: { exclude: ["tr", "mn", "an"] },
    facOrelha: { restrict: ["in", "rd"] },
    asaQtd: { fixed: 0 },
    cdaTipo: { restrict: ["es", "nu", "pr", "lm"] },
  },
  AMP: { // anfíbio: pele mucosa, ovíparo, ligado à água, crânio ossificado
    locPrimario: { restrict: ["Q", "S", "N", "B", "E"] },
    crnFormato: { exclude: ["0", "hu"] },
    memSup: { restrict: ["0S", "2S"] },
    memTerm: { restrict: ["pa", "ve", "ba", "no"] },
    repModo: { fixed: "ov" },
    tegTipo: { restrict: ["Mu", "Cr"] },
    facFocinho: { restrict: ["cu", "pl", "lo"] },
    facOrelha: { restrict: ["in", "mb"] },
    asaQtd: { fixed: 0 },
    cdaTipo: { restrict: ["nu", "bq"] },
  },
  PSC: { // peixe: nada, barbatana, escama ou mucosa, sem membro
    locPrimario: { fixed: "N" },
    memSup: { fixed: "0S" },
    memTerm: { fixed: "ba" },
    repModo: { restrict: ["ov", "oz"] },
    tegTipo: { restrict: ["Es", "Mu"] },
    facFocinho: { restrict: ["cu", "lo", "tu", "pl"] },
    facOrelha: { restrict: ["in", "mb"] },
    asaQtd: { fixed: 0 },
    cdaTipo: { fixed: "bq" },
    crnFormato: { exclude: ["hu"] },
  },
  INS: { // inseto/artrópode: quitina, seis ou oito patas, antena, ovíparo
    locPrimario: { restrict: ["H", "O", "V", "C", "E", "S"] },
    memSup: { restrict: ["0S", "2S"] },
    memTerm: { restrict: ["gr", "pi", "ve", "no"] },
    repModo: { restrict: ["ov", "sp"] },
    tegTipo: { fixed: "Ql" },
    crnFormato: { exclude: ["hu"] },
    facFocinho: { restrict: ["mn", "tu", "cu"] },
    facOrelha: { restrict: ["an", "in"] },
    facDenticao: { restrict: ["0", "mx", "pr"] },
    asaTipo: { restrict: ["qt", "el", "mb"] },
    cdaTipo: { restrict: ["nu", "fr", "lm"] },
  },
  MOL: { // molusco: corpo mole, ventosa, sem esqueleto craniano
    locPrimario: { restrict: ["S", "N", "O", "F", "E"] },
    memSup: { fixed: "0S" },
    memTerm: { restrict: ["ve", "no"] },
    repModo: { restrict: ["ov", "oz"] },
    tegTipo: { restrict: ["Mu", "Cs", "Cn"] },
    crnFormato: { restrict: ["0", "am", "ch"] },
    asaQtd: { fixed: 0 },
    cdaTipo: { restrict: ["nu", "bq"] },
  },
};

/* Mescla duas restrições: `fixed` prevalece, `restrict` vira interseção,
   `exclude` vira união. Se a interseção esvaziar, mantém a mais específica
   (a da classe) — nunca devolve domínio vazio. */
function mergeOpts(base, extra) {
  if (!extra) return base || {};
  if (!base || Object.keys(base).length === 0) return extra;
  if (base.fixed !== undefined) return base;
  if (extra.fixed !== undefined) return { fixed: extra.fixed };
  const out = { ...base };
  if (extra.restrict) {
    if (out.restrict) {
      const inter = out.restrict.filter((v) => extra.restrict.includes(v));
      out.restrict = inter.length ? inter : extra.restrict;
    } else out.restrict = extra.restrict;
  }
  if (extra.exclude) out.exclude = [...(out.exclude || []), ...extra.exclude];
  if (out.restrict && out.exclude) {
    const sobra = out.restrict.filter((v) => !out.exclude.includes(v));
    if (sobra.length) { out.restrict = sobra; delete out.exclude; }
    else delete out.exclude; // exclusão engoliria tudo: a restrição vence
  }
  return out;
}
/* Devolve a trava que a classe impõe a um gene, ou undefined. */
function classeOpts(g, gene) {
  const regras = CLASSE_TRAVAS[g.classe];
  return regras ? regras[gene] : undefined;
}

function runSpeciesSteps(cur, isPrimordialIntent) {
  const g = cur.ctx;
  // Passo 0 — se esta é uma primordial fica dentro da própria seed, não de um estado externo:
  // a mesma seed tem que dar a mesma criatura não importa a posição do checkbox no momento de colar.
  rawStep(cur, "isPrimordial", 2, {
    decodeFn: (r) => r === 1,
    encodeFn: (b) => (b ? 1 : 0),
    randomizeFn: () => !!isPrimordialIntent,
  });

  // Passo 1 — TOL
  categoricalStep(cur, "tolHidrica", T.tolHidrica);
  categoricalStep(cur, "tolTermica", T.tolTermica);
  const cicloBias = (g.tolHidrica === "xe" || g.tolTermica === "qt") ? ["no", "cr"] : undefined;
  categoricalStep(cur, "tolCiclo", T.tolCiclo, { bias: cicloBias });

  // Passo 2 — TAX
  categoricalStep(cur, "reino", T.reino, g.isPrimordial ? { fixed: "Ba" } : {}); // Fase 2, item 5.2 — todo primordial nasce bactéria
  if (g.reino === "Pl") g.classe = "VEG";
  else if (g.reino === "Fu") g.classe = "FUN";
  else if (g.reino === "Ba") g.classe = "MIC"; // Fase 1, item 4.1
  else {
    // a tolerância hídrica já está definida (Passo 1) e limita quais classes fazem sentido
    let classeOptsHid = {};
    if (g.tolHidrica === "aq") classeOptsHid = { restrict: ["PSC", "MOL", "MAM", "REP"] };
    else if (g.tolHidrica === "sa") classeOptsHid = { restrict: ["AMP", "REP", "MAM", "MOL", "AVE"] };
    else if (g.tolHidrica === "xe") classeOptsHid = { exclude: ["PSC", "AMP", "MOL"] };
    else classeOptsHid = { exclude: ["PSC"] }; // peixe exige água
    categoricalStep(cur, "classe", T.classeAn, classeOptsHid);
  }
  if (!g.classe) g.classe = cur.ctx.classe;

  // Passo 3 — MAG
  categoricalStep(cur, "mag", T.mag, g.isPrimordial ? { restrict: ["A0", "A1", "A2", "A3"] } : {}); // Fase 2, item 5.3 — removida cláusula de reino Sp

  // Passo 4 — MOR
  categoricalStep(cur, "simetria", T.simetria);
  const porteBias = g.tolTermica === "fr" ? ["gr", "cl", "tt"] : g.tolTermica === "qt" ? ["mn", "pq"] : undefined;
  categoricalStep(cur, "porte", T.porte, { bias: porteBias });
  const porteRow = T.porte.find((r) => r.value === g.porte);
  scalarStep(cur, "densidade"); // Fase 2, item 5.3 — removido teto de densidade de reino Sp (não existe mais)
  if (g.reino === "Pl") categoricalStep(cur, "morForma", T.morFormaPl);
  else if (g.reino === "Fu") categoricalStep(cur, "morForma", T.morFormaFu);
  else if (g.reino === "Ba") categoricalStep(cur, "morForma", T.morFormaBa); // Fase 1, item 4.1
  else g.morForma = "0";
  if (g.reino === "An") categoricalStep(cur, "morTorso", T.morTorso); // Fase 2, item 5.3 — removido reino Ar
  else g.morTorso = "0";

  // Passo 5 — LOC
  const locBasico = ["Q", "B", "S", "N", "H"]; // primordial: locomoção comum, nada de especializações já prontas
  let locOpts = {};
  if (g.reino === "Pl" || g.reino === "Fu") locOpts = { fixed: "F" };
  else if (g.reino === "Ba") locOpts = { restrict: ["N", "F"] }; // Fase 1, item 4.1 — flagelo (natação) ou fixo/séssil (biofilme)
  else if (g.tolHidrica === "aq" && g.isPrimordial) locOpts = { restrict: ["N", "S"] }; // interseção de aquático com o conjunto básico
  else if (g.tolHidrica === "aq") locOpts = { restrict: ["N", "F", "O", "S"] };
  else if (g.isPrimordial) locOpts = { restrict: locBasico };
  if (g.morTorso === "se" && !locOpts.fixed && !locOpts.restrict) locOpts.bias = ["S"]; // corpo serpentino já decidido — a locomoção tende a acompanhar
  categoricalStep(cur, "locPrimario", T.locPrim, mergeOpts(locOpts, classeOpts(g, "locPrimario")));
  const locSecOpts = (g.reino === "Pl" || g.reino === "Fu" || g.reino === "Ba") // Fase 1, item 4.1 — bactéria não tem modo secundário
    ? { fixed: "0" }
    : g.isPrimordial
      ? { restrict: [...locBasico, "0"], exclude: g.locPrimario !== "0" ? [g.locPrimario] : [] }
      : { exclude: g.locPrimario !== "0" ? [g.locPrimario] : [] };
  /* A restrição de classe é definida para a locomoção PRIMÁRIA e reaproveitada
     aqui — mas "nenhum modo secundário" tem que continuar disponível para
     qualquer classe: ter só um modo de locomoção nunca é inválido. Sem isso,
     algumas classes ficavam obrigadas a ter um segundo modo, e o valor "0"
     (usado também pelos ajustes de coerência abaixo) ficava fora do conjunto
     representável — o que impedia a seed de reconstruir a espécie. */
  const locSecClasse = classeOpts(g, "locPrimario");
  const locSecClasseAjustada = locSecClasse?.restrict
    ? { ...locSecClasse, restrict: [...locSecClasse.restrict, "0"] }
    : locSecClasse;
  categoricalStep(cur, "locSecundario", T.locSec, mergeOpts(locSecOpts, locSecClasseAjustada));
  scalarStep(cur, "locVelocidade", g.locPrimario === "F" ? { min: 0, max: 0 } : {});

  // Passo 6 — MEM
  categoricalStep(cur, "memSup", T.memSup, mergeOpts((g.reino === "Pl" || g.reino === "Fu" || g.reino === "Ba") ? { fixed: "0S" } : g.isPrimordial ? { restrict: ["0S", "2S"] } : {}, classeOpts(g, "memSup"))); // Fase 1, item 4.1
  const memInfClasse = classeOpts(g, "memInf");
  const memInfFixed = { B: "2I", Q: "4I", H: "6I", O: "8I", S: "0I", N: "0I", F: "0I", R: "0I" }[g.locPrimario];
  if (g.reino === "Ba") { g.memInf = "0I"; g.memInfRaw = undefined; } // Fase 1, item 4.1 (Sp removido — Fase 2, item 5.3)
  else if (memInfClasse?.fixed) { g.memInf = memInfClasse.fixed; g.memInfRaw = undefined; } // classe vence a derivação por locomoção (pinguim nada e continua bípede)
  else if (memInfFixed) { g.memInf = memInfFixed; g.memInfRaw = undefined; }
  else {
    const opt = rawStep(cur, "memInfRaw", 100, {
      decodeFn: (r) => (r < 40 ? "2I" : r < 85 ? "4I" : "0I"),
      encodeFn: (v) => (v === "2I" ? 0 : v === "4I" ? 40 : 85),
      randomizeFn: () => { const r = Math.floor(Math.random() * 100); return r < 40 ? "2I" : r < 85 ? "4I" : "0I"; },
    });
    g.memInf = opt;
  }
  categoricalStep(cur, "memApendices", [{ max: 75, value: "0X" }, { max: 90, value: "2X" }, { max: 96, value: "4X" }, { max: 99, value: "6X" }, { max: 100, value: "8X" }], (g.reino === "Pl" || g.reino === "Fu" || g.reino === "Ba") ? { fixed: "0X" } : g.isPrimordial ? { restrict: ["0X", "2X"] } : {}); // Fase 1, item 4.1
  categoricalStep(cur, "memTerm", T.memTerm, mergeOpts(g.reino === "Pl" ? { fixed: "ra" } : (g.reino === "Fu" || g.reino === "Ba") ? { fixed: "no" } : g.tolHidrica === "aq" ? { bias: ["ba", "ve"] } : {}, classeOpts(g, "memTerm"))); // Fase 1, item 4.1
  if (g.memSup !== "0S" || g.memInf !== "0I") {
    const memPropOpts = g.locPrimario === "C" ? { bias: ["cu"] } : ["V", "E"].includes(g.locPrimario) ? { bias: ["lo", "ex"] } : {};
    categoricalStep(cur, "memProp", T.memProp, memPropOpts);
  } else g.memProp = "0"; // sem membro, não há o que ter proporção

  /* Coerência locomoção x membros. locSecundario é sorteado no Passo 5, antes
     dos membros existirem (Passo 6) — e memInf costuma ser DERIVADO da
     locomoção primária, então dá para acabar com "primária: serpentiforme
     (0 membros inferiores), secundária: quadrúpede", que não se sustenta.
     Aqui, já com os membros definidos, um modo secundário que exige pernas
     que a criatura não tem cai para um modo que ela consegue de fato executar
     (ou para nenhum). Não consome dígito da seed: é derivação determinística
     a partir de genes que já foram codificados. */
  const PERNAS_EXIGIDAS = { B: 2, Q: 4, H: 6, O: 8 };
  const pernasDisponiveis = Number(String(g.memInf).replace("I", "")) || 0;
  const membrosSupDisponiveis = Number(String(g.memSup).replace("S", "")) || 0;

  /* A locomoção PRIMÁRIA normalmente deriva memInf (quadrúpede => 4 pernas),
     mas duas regras posteriores podem zerar os membros por cima disso: reino
     Sp (etéreo, sem corpo físico) e travas de classe com memInf fixo. Nesses
     casos sobra um "quadrúpede sem pernas". Como a locomoção primária é um
     gene de Estrato I (identidade da linhagem), não dá pra simplesmente
     rerrolar: aqui trocamos pelo modo sem membros mais próximo — serpentiforme
     se ela puder, senão o primeiro modo válido que não exija pernas — e
     apenas quando o valor escolhido também for representável pela seed. */
  const locPrimValidos = new Set(
    validNumbers(T.locPrim, mergeOpts(locOpts, classeOpts(g, "locPrimario"))).map((n) => pick(T.locPrim, n).value)
  );
  const exigidoPrim = PERNAS_EXIGIDAS[g.locPrimario];
  if (exigidoPrim !== undefined && pernasDisponiveis < exigidoPrim) {
    const alternativasPrim = Object.entries(PERNAS_EXIGIDAS)
      .filter(([modo, n]) => n <= pernasDisponiveis && locPrimValidos.has(modo))
      .sort((a, b) => b[1] - a[1]);
    if (alternativasPrim.length) g.locPrimario = alternativasPrim[0][0];
    else {
      // nenhum modo com pernas cabe — usa um que dispense membros por completo
      const semMembros = ["S", "N", "F", "R", "V", "P"].filter((m) => locPrimValidos.has(m));
      if (semMembros.length) g.locPrimario = semMembros[0];
    }
  }

  /* Qualquer substituto escolhido aqui precisa ser um valor que o passo de
     locSecundario conseguiria ter produzido — senão o genoma guarda algo que
     a seed não consegue representar, e a espécie deixa de ser reconstruível.
     "0" está sempre disponível (garantido acima). */
  const locSecValidos = new Set(
    validNumbers(T.locSec, mergeOpts(locSecOpts, locSecClasseAjustada)).map((n) => pick(T.locSec, n).value)
  );
  locSecValidos.add("0");
  const exigidoSec = PERNAS_EXIGIDAS[g.locSecundario];
  if (exigidoSec !== undefined && pernasDisponiveis < exigidoSec) {
    // escolhe o melhor substituto que os membros atuais permitem, preservando
    // a ideia de "tem um segundo modo" sempre que possível
    const alternativasPorPernas = Object.entries(PERNAS_EXIGIDAS)
      .filter(([modo, n]) => n <= pernasDisponiveis && locSecValidos.has(modo))
      .sort((a, b) => b[1] - a[1]); // o mais "completo" que couber
    if (alternativasPorPernas.length) g.locSecundario = alternativasPorPernas[0][0];
    else if (g.locPrimario !== "S" && pernasDisponiveis === 0 && locSecValidos.has("S")) g.locSecundario = "S"; // rastejar não precisa de perna
    else g.locSecundario = "0";
  }
  // Escalada secundária sem nenhum membro (nem superior nem inferior) também
  // não se sustenta — vira nenhum modo secundário.
  if (g.locSecundario === "E" && pernasDisponiveis === 0 && membrosSupDisponiveis === 0) g.locSecundario = "0";

  /* Terminação de membro (garra, pata, casco, pinça, mão preênsil, barbatana...)
     só faz sentido se existir algum membro onde ela fique. Sem membro nenhum,
     cai para "nenhuma diferenciada" — que é justamente a entrada da tabela
     prevista para esse caso. Plantas/fungos ficam de fora: raiz e "nenhuma"
     já são os valores travados por reino, e não dependem de membro. */
  const TERM_EXIGE_MEMBRO = ["pa", "gr", "ca", "mo", "pi", "ba", "ve"];
  if (g.reino !== "Pl" && g.reino !== "Fu"
      && pernasDisponiveis === 0 && membrosSupDisponiveis === 0
      && TERM_EXIGE_MEMBRO.includes(g.memTerm)) {
    g.memTerm = "no";
  }
  // Secundário nunca deve repetir o primário depois desses ajustes.
  if (g.locSecundario === g.locPrimario) g.locSecundario = "0";

  // Passo 7 — REP
  let repOpts = {};
  if (g.reino === "Fu") repOpts = { fixed: "sp" };
  else if (g.reino === "Ba") repOpts = { fixed: "fs" }; // Fase 1, item 4.1 — fissão binária (valor "fs" já existia na tabela)
  /* Plantas não tinham trava nenhuma de reprodução: saíam plantas
     vivíparas, hematófagas de ninhada, e plantas "que não se reproduzem"
     (0,36% da amostra). Restringido aos modos que uma planta de fato usa. */
  else if (g.reino === "Pl") repOpts = { restrict: ["sp", "gm", "fs", "ax", "ov"] };
  // Fase 2, item 5.3 — reinos Ar/Sp removidos (repOpts fixo "an" e restrito respectivamente saíram)
  categoricalStep(cur, "repModo", T.repModo, mergeOpts(repOpts, classeOpts(g, "repModo")));
  scalarStep(cur, "repProle", porteRow.n >= 4 ? { max: 3 } : porteRow.n === 0 ? { min: 5 } : {});
  scalarStep(cur, "repMaturacao", porteRow.n >= 4 ? { min: 5 } : {});
  scalarStep(cur, "repLongevidade", (g.mag && Number(g.mag.slice(1)) >= 8) ? { min: 7 } : porteRow.n === 0 ? { max: 3 } : {});

  // Passo 8 — CRN
  categoricalStep(cur, "crnFormato", T.crnFormato, mergeOpts((g.reino === "Pl" || g.reino === "Fu" || g.reino === "Ba") ? { fixed: "0" } : g.isPrimordial ? { exclude: ["hu"] } : {}, classeOpts(g, "crnFormato"))); // Fase 1, item 4.1 — sem crânio
  const semCranio = g.crnFormato === "0";
  categoricalStep(cur, "crnChifreQtd", T.crnChifreQtd, semCranio ? { fixed: "0" } : {}); // Fase 2, item 5.3 — removida cláusula de reino Sp
  if (g.crnChifreQtd !== "0") categoricalStep(cur, "crnChifreForma", T.crnChifreForma); else g.crnChifreForma = "";
  categoricalStep(cur, "crnCrista", T.crnCrista, semCranio ? { restrict: ["0", "ap", "au"], exclude: g.isPrimordial ? ["ap", "au"] : [] } : g.isPrimordial ? { exclude: ["ap", "au"] } : {});
  if (!semCranio) {
    const pescocoOpts = g.morTorso === "se" || g.locPrimario === "S" ? { bias: ["au", "cu"] } : {};
    categoricalStep(cur, "crnPescoco", T.crnPescoco, pescocoOpts);
  } else g.crnPescoco = "0";

  // Passo 9 — DIE
  // Tabela própria da planta: majoritariamente fotossintética, com uma fração real de
  // carnivoria/insetivoria por armadilha (sem boca — a dentição continua travada em 0
  // pela ausência de crânio) — nada de exceção, só uma dieta que ainda é de planta.
  const dieBasePl = [{ max: 85, value: "ft", label: "Fotossintético" }, { max: 94, value: "in", label: "Insetívoro" }, { max: 98, value: "de", label: "Detritívoro" }, { max: 100, value: "qm", label: "Quimiossintético" }];
  let dieOpts = {};
  if (g.reino === "Fu") dieOpts = { restrict: ["de", "qm"] };
  else if (g.reino === "Ba") dieOpts = { restrict: ["de", "qm"] }; // Fase 1, item 4.1 — decomposição/quimiossíntese, restrito (confirmado)
  // Fase 2, item 5.3 — reinos Ar/Sp removidos (dieOpts restrito a ni/au saiu)
  categoricalStep(cur, "dieBase", g.reino === "Pl" ? dieBasePl : T.dieBase, g.reino === "Pl" ? {} : dieOpts);
  scalarStep(cur, "dieFrequencia", g.tolHidrica === "xe" ? { max: 5 } : {});
  categoricalStep(cur, "dieRestricao", T.dieRestricao);

  // Passo 10 — FAC
  const cranial0 = g.crnFormato === "0";
  if (cranial0) { g.facFocinho = "0"; g.facOrelha = "0"; }
  else {
    categoricalStep(cur, "facFocinho", T.facFocinho, mergeOpts({}, classeOpts(g, "facFocinho")));
    categoricalStep(cur, "facOrelha", T.facOrelha, mergeOpts(g.tolHidrica === "aq" ? { bias: ["in", "mb"] } : {}, classeOpts(g, "facOrelha")));
  }
  categoricalStep(cur, "facOlhosQtd", T.facOlhosQtd, (g.reino === "Pl" || g.reino === "Fu" || g.reino === "Ba") ? { fixed: 0 } : {}); // Fase 1, item 4.1
  if (g.facOlhosQtd !== 0) categoricalStep(cur, "facOlhosTipo", T.facOlhosTipo, g.isPrimordial ? { restrict: ["rd", "fd", "cg"] } : {}); else g.facOlhosTipo = "";
  if (cranial0) g.facDenticao = "0";
  else {
    let dOpts = {};
    if (["cn", "he", "nf"].includes(g.dieBase)) dOpts = { restrict: ["cn", "pr", "mx"] };
    else if (["hb", "fr"].includes(g.dieBase)) dOpts = { restrict: ["in", "pl", "mx"] };
    categoricalStep(cur, "facDenticao", T.facDenticao, mergeOpts(dOpts, classeOpts(g, "facDenticao")));
  }

  // Passo 11 — TEG
  let tegOpts = {};
  if (g.reino === "Ba") tegOpts = { fixed: "Mu" }; // Fase 1, item 4.1 — membrana simples (reaproveita "Mucosa")
  else if (g.reino === "Pl") tegOpts = { restrict: ["Cs", "Mu", "Cn"] };
  else if (g.reino === "Fu") tegOpts = { restrict: ["Ql", "Mu", "Pd"] };
  // Fase 2, item 5.3 — reinos Ar/Sp removidos (tegOpts fixo "Et" e restrito "Me/Pd/Cn" saíram)
  else if (g.tolHidrica === "aq") tegOpts = { exclude: ["Pe", "Cs"] };
  else if (g.tolHidrica === "sa") tegOpts = { exclude: ["Cs"] };
  else if (g.tolTermica === "qt") tegOpts = { exclude: ["Pe"] };
  if (!tegOpts.fixed) {
    const tegBias = [...(g.tolHidrica === "um" ? ["Mu", "Cr"] : []), ...(g.tolTermica === "fr" ? ["Pe", "Pn"] : [])];
    if (tegBias.length) tegOpts.bias = tegBias;
  }
  categoricalStep(cur, "tegTipo", T.tegTipo, mergeOpts(tegOpts, classeOpts(g, "tegTipo")));
  scalarStep(cur, "tegResistencia", g.tolTermica === "eu" ? { min: 4 } : {});
  categoricalStep(cur, "tegCor", T.tegCor);
  scalarStep(cur, "tegCorIntensidade");
  const gvAllowed = g.mag && Number(g.mag.slice(1)) >= 3;
  categoricalStep(cur, "tegPadrao", T.tegPadrao, gvAllowed ? {} : { exclude: ["gv"] });

  // Passo 12 — ASA
  let asaOpts = {};
  if (g.reino === "Ba") asaOpts = { fixed: 0 }; // Fase 1, item 4.1
  else if (g.locPrimario === "F") asaOpts = { fixed: 0 };
  else if (g.locPrimario === "V" && !(g.mag && Number(g.mag.slice(1)) >= 4)) asaOpts = { exclude: [0] };
  /* Aquático obrigatório respira por brânquias — o próprio REGRAS_COERENCIA
     trata "aquático com asas" como erro BLOQUEANTE, mas o gerador só
     enviesava contra (bias), então 0,5% das espécies nasciam já violando
     uma regra que o app recusaria na criação manual. Vira trava dura. */
  else if (g.tolHidrica === "aq") asaOpts = { fixed: 0 };
  categoricalStep(cur, "asaQtd", T.asaQtd, mergeOpts(asaOpts, classeOpts(g, "asaQtd")));
  if (g.asaQtd !== 0) {
    categoricalStep(cur, "asaTipo", T.asaTipo, classeOpts(g, "asaTipo")); // Fase 2, item 5.3 — exclude ["et"] removido (valor não existe mais)
    scalarStep(cur, "asaFuncionalidade", g.densidade >= 6 ? { max: 4 } : {});
  } else { g.asaTipo = undefined; g.asaFuncionalidade = undefined; }

  /* Voo ou planeio como modo SECUNDÁRIO exige asas — ou poder ambiental
     forte o bastante para sustentar a criatura sem elas. A locomoção
     secundária é sorteada no Passo 5, muito antes das asas existirem
     (Passo 12), então a checagem só pode acontecer aqui. O modo primário
     não precisa do mesmo ajuste: quando ele é voo/planeio, a própria
     tabela de asas já é enviesada para garantir asas. */
  if ((g.locSecundario === "V" || g.locSecundario === "P")) {
    const magNivel = g.mag ? Number(String(g.mag).slice(1)) || 0 : 0;
    if ((Number(g.asaQtd) || 0) === 0 && magNivel < 4) g.locSecundario = "0";
  }

  // Passo 13 — CDA
  categoricalStep(cur, "cdaComp", T.cdaComp, (g.reino === "Pl" || g.reino === "Fu" || g.reino === "Ba") ? { fixed: "0" } : {}); // Fase 1, item 4.1
  if (g.cdaComp !== "0") { categoricalStep(cur, "cdaTipo", T.cdaTipo, mergeOpts(g.isPrimordial ? { exclude: ["lq"] } : {}, classeOpts(g, "cdaTipo"))); scalarStep(cur, "cdaFuncao"); } else { g.cdaTipo = undefined; g.cdaFuncao = undefined; }

  // Passo 14 — SEN
  scalarStep(cur, "senVisao");
  if (g.facOlhosQtd === 0 || g.facOlhosTipo === "cg") g.senVisao = Math.min(g.senVisao, 1);
  scalarStep(cur, "senOlfato"); scalarStep(cur, "senAudicao"); scalarStep(cur, "senTato");
  let senEspOpts = {};
  if (g.reino === "Ba") senEspOpts = { restrict: ["0", "vb"] }; // Fase 1, item 4.1 — sem sistema nervoso, só quimio/vibrotaxia rasa
  else if (g.mag && Number(g.mag.slice(1)) >= 7) senEspOpts = { fixed: "au" };
  else if (g.isPrimordial && g.tolCiclo === "no" && g.senVisao < 6) senEspOpts = { restrict: ["vb", "tr"] };
  else if (g.isPrimordial) senEspOpts = { restrict: ["0", "vb", "tr"] };
  else if (g.tolCiclo === "no" && g.senVisao < 6) senEspOpts = { exclude: ["0"] };
  categoricalStep(cur, "senEspecial", T.senEspecial, senEspOpts);
  if (g.senEspecial !== "0") scalarStep(cur, "senEspecialIntensidade", (g.mag && Number(g.mag.slice(1)) >= 7) ? { min: 5 } : {}); else g.senEspecialIntensidade = undefined;

  // Passo 15 — SOC
  categoricalStep(cur, "socEstrutura", T.socEstrutura, g.isPrimordial ? { exclude: ["me"] } : {});
  scalarStep(cur, "socAgressividade", ["hb", "fr"].includes(g.dieBase) ? { max: 5 } : {});
  scalarStep(cur, "socSencienciaBruta");
  const penalizado = g.crnFormato !== "hu";
  let sencFinal = penalizado ? Math.max(0, g.socSencienciaBruta - 2) : g.socSencienciaBruta;
  if (g.mag && Number(g.mag.slice(1)) >= 8) sencFinal = Math.max(sencFinal, 4);
  if (g.isPrimordial) sencFinal = Math.min(sencFinal, 5); // raiz nunca nasce com cognição abstrata plena
  if (g.reino === "Pl" || g.reino === "Fu" || g.reino === "Ba") sencFinal = 0; // sem sistema nervoso centralizado — vence qualquer piso de magia (Fase 1, item 4.1)
  g.socSenciencia = sencFinal;
  g.socSencienciaPenalizada = penalizado && g.reino !== "Pl" && g.reino !== "Fu" && g.reino !== "Ba";

  /* Passo 16 — DEF
     A arma natural agora depende da estrutura que a produz. Antes o gene
     era sorteado solto, e saíam espécies com "arma: chifres" sem nenhum
     chifre (8% da amostra), "arma: presas" sem crânio nem dentição, e
     "arma: garras" sem membro nenhum onde a garra ficaria. A trava entra
     como `exclude` no próprio categoricalStep, então a seed continua
     simétrica (decode/encode/randomize enxergam o mesmo domínio). */
  // Fase 1, item 4.1 — bactéria só tem "arma" quando ela implica doença (veneno/toxina);
  // sem estrutura física, todo o resto (espinho, descarga, ataque sônico/áurico) é excluído.
  const defArmaExclude = (g.reino === "Pl" || g.reino === "Fu") ? ["gr", "pr", "cn"]
    : g.reino === "Ba" ? ["gr", "pr", "cn", "ch", "cu", "es", "el", "so", "au"] : [];
  const pernasDef = Number(String(g.memInf).replace("I", "")) || 0;
  const supDef = Number(String(g.memSup).replace("S", "")) || 0;
  const apendicesDef = Number(String(g.memApendices).replace("X", "")) || 0;
  if (g.crnChifreQtd === "0") defArmaExclude.push("ch");                       // sem chifre não se ataca com chifre
  if (g.crnFormato === "0" || g.facDenticao === "0") defArmaExclude.push("pr"); // presa exige crânio com dentição
  if (pernasDef === 0 && supDef === 0 && apendicesDef === 0) defArmaExclude.push("gr", "cn"); // garra/constrição exigem membro ou corpo preênsil
  if (g.crnFormato === "0" && g.facFocinho === "0") defArmaExclude.push("cu");  // cuspe/jato precisa de abertura oral
  const magNivelDef = g.mag ? Number(String(g.mag).slice(1)) || 0 : 0;
  if (magNivelDef < 3) defArmaExclude.push("au");                              // ataque áurico exige poder mínimo
  const defArmaOpts = ["cn", "he", "nf"].includes(g.dieBase)
    ? { exclude: [...defArmaExclude, "0"] }
    : (defArmaExclude.length ? { exclude: defArmaExclude } : {});
  categoricalStep(cur, "defArma", T.defArma, defArmaOpts);
  scalarStep(cur, "defBlindagem");
  categoricalStep(cur, "defEstrategia", T.defEstrategia, g.locPrimario === "F" ? { restrict: ["ri", "to", "ca", "re"] } : {});

  // Passo 16.5 — GENES POR TÁXON (Fase 3) — condicionados a g.classe/g.reino,
  // aprovados na proposta de expansão de DNA por táxon. Cada gene segue o
  // procedimento de 5 passos do plano: tabela em T (quando categórico),
  // step aqui, entrada em GENE_TABLE_MAP/ESCALAR_KEYS, estrato de mutação,
  // e frase em describeCreatureProse.
  if (g.classe === "MAM") {
    categoricalStep(cur, "glandulaMamaria", T.glandulaMamaria);
    scalarStep(cur, "pelagemDensidade");
    categoricalStep(cur, "dentesTipo", T.dentesTipo);
    categoricalStep(cur, "termorregulacao", T.termorregulacao);
    categoricalStep(cur, "gestacao", T.gestacao);
  } else {
    g.glandulaMamaria = undefined; g.pelagemDensidade = undefined; g.dentesTipo = undefined;
    g.termorregulacao = undefined; g.gestacao = undefined;
  }

  if (g.classe === "AVE") {
    categoricalStep(cur, "bicoFormato", T.bicoFormato);
    categoricalStep(cur, "penaFuncao", T.penaFuncao);
    scalarStep(cur, "ovoCasca");
    categoricalStep(cur, "migratorio", T.migratorio);
  } else {
    g.bicoFormato = undefined; g.penaFuncao = undefined; g.ovoCasca = undefined; g.migratorio = undefined;
  }

  if (g.classe === "REP") {
    categoricalStep(cur, "escamaTipo", T.escamaTipo);
    categoricalStep(cur, "venenoAparato", T.venenoAparato);
    categoricalStep(cur, "regeneracaoCauda", T.regeneracaoCauda);
    scalarStep(cur, "ectotermiaDependencia");
  } else {
    g.escamaTipo = undefined; g.venenoAparato = undefined; g.regeneracaoCauda = undefined; g.ectotermiaDependencia = undefined;
  }

  if (g.classe === "AMP") {
    categoricalStep(cur, "metamorfose", T.metamorfose);
    categoricalStep(cur, "peleToxinas", T.peleToxinas);
    scalarStep(cur, "respiracaoCutanea");
  } else {
    g.metamorfose = undefined; g.peleToxinas = undefined; g.respiracaoCutanea = undefined;
  }

  if (g.classe === "PSC") {
    categoricalStep(cur, "nadadeiraConfiguracao", T.nadadeiraConfiguracao);
    categoricalStep(cur, "respiracaoBranquial", T.respiracaoBranquial);
    categoricalStep(cur, "bexigaNatatoria", T.bexigaNatatoria);
  } else {
    g.nadadeiraConfiguracao = undefined; g.respiracaoBranquial = undefined; g.bexigaNatatoria = undefined;
  }

  if (g.classe === "INS") {
    categoricalStep(cur, "metamorfoseTipo", T.metamorfoseTipo);
    categoricalStep(cur, "patasQtdEspecializada", T.patasQtdEspecializada);
    categoricalStep(cur, "venenoOuFerroao", T.venenoOuFerroao);
    categoricalStep(cur, "coloniaTipo", T.coloniaTipo);
  } else {
    g.metamorfoseTipo = undefined; g.patasQtdEspecializada = undefined; g.venenoOuFerroao = undefined; g.coloniaTipo = undefined;
  }

  if (g.classe === "MOL") {
    categoricalStep(cur, "concha", T.concha);
    categoricalStep(cur, "tentaculosQtd", T.tentaculosQtd);
    categoricalStep(cur, "tintaDefensiva", T.tintaDefensiva);
  } else {
    g.concha = undefined; g.tentaculosQtd = undefined; g.tintaDefensiva = undefined;
  }

  if (g.reino === "Pl") {
    categoricalStep(cur, "raizTipo", T.raizTipo);
    categoricalStep(cur, "folhaTipo", T.folhaTipo);
    categoricalStep(cur, "reproducaoEstrutura", T.reproducaoEstrutura);
    scalarStep(cur, "fotossinteseIntensidade");
  } else {
    g.raizTipo = undefined; g.folhaTipo = undefined; g.reproducaoEstrutura = undefined; g.fotossinteseIntensidade = undefined;
  }

  if (g.reino === "Fu") {
    categoricalStep(cur, "corpoFrutiferoTipo", T.corpoFrutiferoTipo);
    scalarStep(cur, "redeMicelialAlcance");
    categoricalStep(cur, "esporoDispersao", T.esporoDispersao);
  } else {
    g.corpoFrutiferoTipo = undefined; g.redeMicelialAlcance = undefined; g.esporoDispersao = undefined;
  }

  if (g.reino === "Ba") {
    categoricalStep(cur, "paredeCelularTipo", T.paredeCelularTipo);
    categoricalStep(cur, "metabolismoTipo", T.metabolismoTipo);
    categoricalStep(cur, "formaColonia", T.formaColonia);
  } else {
    g.paredeCelularTipo = undefined; g.metabolismoTipo = undefined; g.formaColonia = undefined;
  }

  // Passo 17 — Anomalia
  const scalarKeys = ["densidade", "locVelocidade", "repProle", "repMaturacao", "repLongevidade", "tegResistencia", "tegCorIntensidade", "cdaFuncao", "senVisao", "senOlfato", "senAudicao", "senTato", "senEspecialIntensidade", "socAgressividade", "defBlindagem", "asaFuncionalidade"];
  let extremos = 0;
  for (const k of scalarKeys) if (g[k] === 0 || g[k] === 9) extremos++;
  const corRow = T.tegCor.find((r) => r.value === g.tegCor);
  const padRow = T.tegPadrao.find((r) => r.value === g.tegPadrao);
  if (corRow?.faixa === "Excepcional") extremos++;
  if (padRow?.faixa === "Excepcional") extremos++;
  g.extremos = extremos;
  g.anomalias = [];
  if (extremos >= 5) g.anomalias.push(categoricalStep(cur, "ano1", T.ano));
  else g.ano1 = undefined; // sem gatilho, não há anomalia — limpa resíduo de um estado anterior
  if (extremos >= 8) {
    let second = categoricalStep(cur, "ano2", T.ano);
    if (second === g.anomalias[0]) {
      // colisão: avança para a próxima entrada da tabela, sem pedir mais dígitos da seed —
      // uma seed pequena/esgotada faria qualquer nova tentativa repetir o mesmo resultado.
      const idx = T.ano.findIndex((r) => r.value === second);
      second = T.ano[(idx + 1) % T.ano.length].value;
      cur.ctx.ano2 = second;
    }
    g.anomalias.push(second);
  } else g.ano2 = undefined; // idem: sem o segundo gatilho, nada de segunda anomalia

  // Passo 18 — Clado
  const c1 = rawStep(cur, "cladoC1", CONS.length, { decodeFn: (i) => CONS[i], encodeFn: (ch) => CONS.indexOf(ch), randomizeFn: () => CONS[Math.floor(Math.random() * CONS.length)] });
  const v1 = rawStep(cur, "cladoV", VOG.length, { decodeFn: (i) => VOG[i], encodeFn: (ch) => VOG.indexOf(ch), randomizeFn: () => VOG[Math.floor(Math.random() * VOG.length)] });
  const c2 = rawStep(cur, "cladoC2", CONS.length, { decodeFn: (i) => CONS[i], encodeFn: (ch) => CONS.indexOf(ch), randomizeFn: () => CONS[Math.floor(Math.random() * CONS.length)] });
  g.clado = (c1 + v1 + c2).charAt(0).toUpperCase() + (c1 + v1 + c2).slice(1).toLowerCase();

  return g;
}

function serialize(g) {
  const parts = [];
  parts.push(`TAX:${g.reino}.${g.classe}.${g.clado}`);
  parts.push(`MOR:${g.porte}.${g.densidade}.${g.simetria}.${g.morForma}.${g.morTorso}`);
  parts.push(`LOC:${g.locPrimario}.${g.locSecundario}.${g.locVelocidade}`);
  parts.push(`MEM:${g.memSup}.${g.memInf}.${g.memApendices}.${g.memTerm}.${g.memProp}`);
  parts.push(`TEG:${g.tegTipo}.${g.tegCor}${g.tegCorIntensidade}.${g.tegPadrao}.${g.tegResistencia}`);
  parts.push(`CRN:${g.crnChifreQtd}${g.crnChifreForma || ""}.${g.crnCrista}.${g.crnFormato}.${g.crnPescoco}`);
  parts.push(`FAC:${g.facOrelha}.${g.facFocinho}.${g.facOlhosQtd}${g.facOlhosTipo}.${g.facDenticao}`);
  if (g.asaQtd !== 0) parts.push(`ASA:${g.asaQtd}.${g.asaTipo}.${g.asaFuncionalidade}`);
  if (g.cdaComp !== "0") parts.push(`CDA:${g.cdaComp}.${g.cdaTipo}.${g.cdaFuncao}`);
  parts.push(`DIE:${g.dieBase}.${g.dieFrequencia}.${g.dieRestricao}`);
  parts.push(`MAG:${g.mag}`);
  parts.push(`SEN:${g.senVisao}.${g.senOlfato}.${g.senAudicao}.${g.senTato}.${g.senEspecial}${g.senEspecial !== "0" ? g.senEspecialIntensidade : ""}`);
  parts.push(`REP:${g.repModo}.${g.repProle}.${g.repMaturacao}.${g.repLongevidade}`);
  parts.push(`TOL:${g.tolHidrica}.${g.tolTermica}.${g.tolCiclo}`);
  parts.push(`SOC:${g.socEstrutura}.${g.socAgressividade}.${g.socSenciencia}`);
  parts.push(`DEF:${g.defArma}.${g.defBlindagem}.${g.defEstrategia}`);
  if (g.anomalias?.length) parts.push(`ANO:${g.anomalias.join(",")}`);
  return "DRN2-" + parts.join("-");
}

/* ============================================================
   INDIVÍDUO (Passo 20b) + ATRIBUTOS (Parte VII) — mesmo motor,
   consumindo dígitos da MESMA seed do indivíduo, em sequência.
   ============================================================ */
const ESTRATO_III_SCALARS = ["tegCorIntensidade", "cdaFuncao", "dieFrequencia", "senVisao", "senOlfato", "senAudicao", "senTato", "senEspecialIntensidade", "socAgressividade", "defBlindagem", "asaFuncionalidade"];
const ATTR_ORDER = ["FOR", "AGI", "CON", "PER", "INT", "CAR"];
const ATTR_LABELS = { FOR: "Força", AGI: "Agilidade", CON: "Constituição", PER: "Percepção", INT: "Inteligência", CAR: "Carisma" };

function d6DeltaRaw(cur, key) {
  return rawStep(cur, key, 6, {
    decodeFn: (r) => (r <= 1 ? -1 : r >= 4 ? 1 : 0),
    encodeFn: (d) => (d === -1 ? 0 : d === 1 ? 4 : 2),
    randomizeFn: () => { const r = Math.floor(Math.random() * 6); return r <= 1 ? -1 : r >= 4 ? 1 : 0; },
  });
}
function d100CheckRaw(cur, key, threshold) {
  return rawStep(cur, key, 100, {
    decodeFn: (r) => r >= (100 - threshold),
    encodeFn: (b) => (b ? 99 : 0),
    randomizeFn: () => Math.random() < threshold / 100,
  });
}

function computeAttributeBase(g) {
  const porteRow = T.porte.find((r) => r.value === g.porte) || { n: 2 };
  const termBonus = { gr: 2, pi: 2, mo: 1 }[g.memTerm] || 0;
  const FOR = porteRow.n * 3 + g.densidade + termBonus;
  const locoBonus = { V: 3, E: 3, P: 3, B: 1, Q: 1, H: 1, O: 1, S: 0, N: 0, R: 0, F: -2, C: -2, Z: -2 }[g.locPrimario] || 0;
  const AGI = g.locVelocidade + locoBonus + Math.floor((9 - g.densidade) / 2);
  const CON = g.tegResistencia + Math.floor(g.repLongevidade / 2) + Math.floor((g.defBlindagem || 0) / 2);
  const mediaSent = (g.senVisao + g.senOlfato + g.senAudicao + g.senTato) / 4;
  const especialBonus = g.senEspecial !== "0" ? Math.floor((g.senEspecialIntensidade || 0) / 2) : 0;
  const PER = Math.round(mediaSent) + especialBonus;
  const magNum = g.mag ? Number(g.mag.slice(1)) : 0;
  const INT = g.socSenciencia * 2 + 1 + Math.floor(magNum / 3);
  const corRow = T.tegCor.find((r) => r.value === g.tegCor);
  const padRow = T.tegPadrao.find((r) => r.value === g.tegPadrao);
  const faixaOrdem = { Comum: 0, Incomum: 1, Raro: 2, Excepcional: 4 };
  const raridade = Math.max(faixaOrdem[corRow?.faixa] || 0, faixaOrdem[padRow?.faixa] || 0);
  const estruturaBonus = { me: 3, pa: 1, ma: 1, co: 1, ba: 0, so: -1, en: -2 }[g.socEstrutura] || 0;
  const CAR = (9 - g.socAgressividade) + raridade + estruturaBonus;
  return { FOR, AGI, CON, PER, INT, CAR };
}

// roda o indivíduo inteiro (variação + atributos) sobre um cursor cujo ctx já é uma cópia da espécie
function runIndividualSteps(cur, speciesCtx) {
  const ind = cur.ctx;
  Object.assign(ind, speciesCtx); // ponto de partida: valores da espécie
  const changes = [];
  for (const k of ESTRATO_III_SCALARS) {
    if (speciesCtx[k] === undefined) continue;
    const before = ind[k];
    const delta = d6DeltaRaw(cur, `ind_${k}`);
    const after = Math.max(0, Math.min(9, before + delta));
    if (after !== before) changes.push(`${k}: ${before} → ${after}`);
    ind[k] = after;
  }
  const rerollCor = d100CheckRaw(cur, "ind_corReroll", 20);
  if (rerollCor) { const before = ind.tegCor; categoricalStep(cur, "ind_tegCorNovo", T.tegCor); if (cur.ctx.ind_tegCorNovo !== before) { changes.push(`tegCor: ${before} → ${cur.ctx.ind_tegCorNovo}`); ind.tegCor = cur.ctx.ind_tegCorNovo; } }
  const rerollPad = d100CheckRaw(cur, "ind_padReroll", 20);
  if (rerollPad) {
    const before = ind.tegPadrao;
    const gvAllowed = ind.mag && Number(ind.mag.slice(1)) >= 3;
    categoricalStep(cur, "ind_tegPadraoNovo", T.tegPadrao, gvAllowed ? {} : { exclude: ["gv"] });
    if (cur.ctx.ind_tegPadraoNovo !== before) { changes.push(`tegPadrao: ${before} → ${cur.ctx.ind_tegPadraoNovo}`); ind.tegPadrao = cur.ctx.ind_tegPadraoNovo; }
  }
  const anomaliaIndividual = d100CheckRaw(cur, "ind_anomalia", 3);
  if (anomaliaIndividual) { const a = categoricalStep(cur, "ind_anoTipo", T.ano); ind.anomalias = [...(ind.anomalias || []), a]; changes.push(`Anomalia individual: ${a}`); }

  const attrBase = computeAttributeBase(ind);
  const attrVaried = {}; const attrRolls = {};
  for (const k of ATTR_ORDER) { const d = d6DeltaRaw(cur, `attr_${k}`); attrRolls[k] = d; attrVaried[k] = Math.max(1, attrBase[k] + d); }

  return { ind, changes, code: serialize(ind), anomaliaIndividual, attrBase, attrVaried, attrRolls };
}

/* Refaz exatamente os mesmos passos de runIndividualSteps, mas em modo
   encode: consome o cursor sem tocar em `ind` (o genoma final já está
   pronto em cur.ctx) — só precisa avançar pelos mesmos dígitos pra
   acumular o outValue que vira a seed do indivíduo. */
function runIndividualStepsEncodeOnly(cur, speciesCtx) {
  const ind = cur.ctx;
  for (const k of ESTRATO_III_SCALARS) { if (speciesCtx[k] === undefined) continue; d6DeltaRaw(cur, `ind_${k}`); }
  d100CheckRaw(cur, "ind_corReroll", 20);
  if (cur.ctx.ind_corReroll) categoricalStep(cur, "ind_tegCorNovo", T.tegCor);
  d100CheckRaw(cur, "ind_padReroll", 20);
  if (cur.ctx.ind_padReroll) { const gvAllowed = ind.mag && Number(ind.mag.slice(1)) >= 3; categoricalStep(cur, "ind_tegPadraoNovo", T.tegPadrao, gvAllowed ? {} : { exclude: ["gv"] }); }
  d100CheckRaw(cur, "ind_anomalia", 3);
  if (cur.ctx.ind_anomalia) categoricalStep(cur, "ind_anoTipo", T.ano);
  for (const k of ATTR_ORDER) d6DeltaRaw(cur, `attr_${k}`);
}

/* Gera um indivíduo a partir do genoma de uma espécie (speciesCtx) —
   seedBigOrNull null sorteia livremente; caso contrário decodifica a
   seed do indivíduo (independente da seed da espécie, que já está
   fixa em speciesCtx). Retorna também individualSeed, o endereço que
   reconstrói esse indivíduo exato quando decodificado de novo sobre
   a mesma espécie. */
function buildIndividual(speciesCtx, seedBigOrNull) {
  const address = seedBigOrNull !== null ? mixForward(seedBigOrNull, IND_HALF) : null;
  const cur = address !== null ? newCursor("decode", { seed: address, ctx: {} }) : newCursor("randomize", { ctx: {} });
  const r = runIndividualSteps(cur, speciesCtx);
  const encCur2 = newCursor("encode", { ctx: cur.ctx });
  runIndividualStepsEncodeOnly(encCur2, speciesCtx);
  return { ...r, individualSeed: mixInverse(encCur2.outValue, IND_HALF) };
}

/* ---------- seed colada: espécie + indivíduo num único texto ----------
   Útil pra copiar/colar um indivíduo específico de uma vez, sem
   precisar carregar as duas seeds separadamente. Usa IND_DIGITS,
   SPECIES_DIGITS e padSeed — definidos mais abaixo, junto do resto do
   motor de seed de espécie (mesmo padrão que a Estação DRN2 usava).

   O primeiro dígito NÃO é dado de espécie — é uma flag: "1" = a
   espécie é primordial, "0" = é derivada. isPrimordial nunca é um gene
   "rolado" (é um parâmetro que o motor recebe de fora e usa só pra
   decidir algumas travas durante a geração), então não tem como
   recuperá-lo a partir dos dígitos de dados — decodificar a mesma
   sequência como primordial ou como derivada pode, em casos raros,
   produzir genomas ligeiramente diferentes justamente nos pontos onde
   essa trava importa. Embutir a flag elimina essa ambiguidade: quem
   gera a seed já sabe se a espécie é primordial, então a seed sempre
   carrega a resposta certa — não precisa mais perguntar a quem
   decodifica depois. */
function gluedSeedText(speciesSeed, individualSeed, isPrimordial) {
  const flag = isPrimordial ? "1" : "0";
  const speciesPart = padSeed(speciesSeed, SPECIES_DIGITS);
  if (individualSeed === null || individualSeed === undefined) return flag + speciesPart;
  return flag + speciesPart + padSeed(individualSeed, IND_DIGITS);
}
/* O 1º dígito é sempre a flag de primordial/derivada. Do resto: só
   divide em espécie+indivíduo quando o comprimento bate exatamente com
   o padrão desta ferramenta (155 dígitos = só espécie · 194 = espécie +
   indivíduo). Qualquer outro comprimento é tratado inteiro como seed de
   espécie — nunca adivinha, porque uma seed de espécie sozinha já
   costuma passar dos 39 dígitos reservados ao indivíduo. */
function splitGluedSeed(rawText) {
  const digitsRaw = (rawText || "").replace(/[^0-9]/g, "");
  if (!digitsRaw) return { speciesDigits: "", individualDigits: "", isPrimordial: true };
  const isPrimordial = digitsRaw[0] !== "0";
  const resto = digitsRaw.slice(1);
  const S = Number(SPECIES_DIGITS), I = Number(IND_DIGITS);
  if (resto.length === S + I) return { speciesDigits: resto.slice(0, S), individualDigits: resto.slice(S), isPrimordial };
  return { speciesDigits: resto, individualDigits: "", isPrimordial };
}

/* ---------- leitura de habitat (aproximação) ---------- */
/* ============================================================
   CHAVE DE HABITAT — Códice de Biomas Específicos
   27 biomas nomeados em 5 domínios. Para cada um: exigência
   absoluta (TOL mínima pra não morrer), vantagem primária
   (qualquer traço da lista já classifica como primário) e
   traços letais (qualquer um vence a exigência e vira vedado).
   ============================================================ */
const magNum = (g) => (g.mag ? Number(g.mag.slice(1)) : 0);
const semVisaoFuncional = (g) => g.senEspecial === "0" && g.senVisao >= 6; // depende de enxergar

const HABITAT_CODEX = [
  // I. Domínios de Frio e Gelo
  { nome: "Glaciar Continental Aberto", dominio: "Frio e Gelo",
    exige: (g) => g.tolTermica === "fr" && ["xe", "ms"].includes(g.tolHidrica),
    vantagem: (g) => (g.tegTipo === "Pe" && g.tegResistencia >= 7) || ["Q", "C"].includes(g.locPrimario),
    letal: (g) => ["aq", "sa"].includes(g.tolHidrica) || g.tegTipo === "Mu" },
  { nome: "Tundra de Permafrost", dominio: "Frio e Gelo",
    exige: (g) => g.tolTermica === "fr" && ["ms", "xe"].includes(g.tolHidrica),
    vantagem: (g) => g.dieBase === "hb" || g.locPrimario === "C",
    letal: (g) => g.tolHidrica === "aq" || g.locPrimario === "N" },
  { nome: "Floresta Boreal (Taiga Densa)", dominio: "Frio e Gelo",
    exige: (g) => g.tolTermica === "fr" && ["ms", "um"].includes(g.tolHidrica),
    vantagem: (g) => ["pq", "md"].includes(g.porte) || g.locPrimario === "E",
    letal: (g) => g.porte === "tt" },
  { nome: "Pântano Congelado (Turfeira)", dominio: "Frio e Gelo",
    exige: (g) => g.tolTermica === "fr" && ["um", "sa"].includes(g.tolHidrica),
    vantagem: (g) => g.memTerm === "pa",
    letal: (g) => g.tolHidrica === "xe" || g.locPrimario === "C" },
  { nome: "Mar Subglacial Escuro", dominio: "Frio e Gelo",
    exige: (g) => g.tolTermica === "fr" && g.tolHidrica === "aq",
    vantagem: (g) => g.locPrimario === "N" || ["vb", "ec"].includes(g.senEspecial) || g.facOrelha === "mb",
    letal: (g) => ["B", "Q", "V"].includes(g.locPrimario) || semVisaoFuncional(g) },
  { nome: "Encosta Alpina de Ventos", dominio: "Frio e Gelo",
    exige: (g) => g.tolTermica === "fr" && g.tolHidrica === "xe",
    vantagem: (g) => ["V", "P"].includes(g.locPrimario) || g.densidade <= 3 || (g.asaQtd !== 0 && g.asaFuncionalidade >= 7),
    letal: (g) => g.locPrimario === "N" || ["um", "sa"].includes(g.tolHidrica) },

  // II. Domínios Temperados
  { nome: "Floresta Decídua Pluvial", dominio: "Temperados",
    exige: (g) => g.tolTermica === "tp" && ["um", "ms"].includes(g.tolHidrica),
    vantagem: (g) => g.locPrimario === "E" || g.memTerm === "mo",
    letal: (g) => g.tolHidrica === "xe" },
  { nome: "Estepes de Vento (Pradaria)", dominio: "Temperados",
    exige: (g) => g.tolTermica === "tp" && ["ms", "xe"].includes(g.tolHidrica),
    vantagem: (g) => (g.locPrimario === "Q" && g.locVelocidade >= 7) || g.dieBase === "hb",
    letal: (g) => g.tolHidrica === "aq" || g.locPrimario === "E" },
  { nome: "Bosque de Cogumelos Gigantes", dominio: "Temperados",
    exige: (g) => g.tolTermica === "tp" && g.tolHidrica === "um",
    vantagem: (g) => ["de", "on"].includes(g.dieBase) || g.tegResistencia >= 7,
    letal: (g) => g.tolHidrica === "xe" || g.dieBase === "ft" },
  { nome: "Charco de Água Salobra", dominio: "Temperados",
    exige: (g) => g.tolTermica === "tp" && ["sa", "aq"].includes(g.tolHidrica),
    vantagem: (g) => g.locSecundario === "N" || ["Mu", "Es"].includes(g.tegTipo),
    letal: (g) => g.tolHidrica === "xe" || g.memTerm === "ca" },
  { nome: "Costa de Falésias Rochosas", dominio: "Temperados",
    exige: (g) => g.tolTermica === "tp" && ["ms", "sa"].includes(g.tolHidrica),
    vantagem: (g) => ["V", "E"].includes(g.locPrimario) || ["gr", "ve"].includes(g.memTerm),
    letal: (g) => g.locPrimario === "C" },

  // III. Domínios Quentes e Áridos
  { nome: "Deserto de Dunas Eólicas", dominio: "Quentes e Áridos",
    exige: (g) => g.tolTermica === "qt" && g.tolHidrica === "xe",
    vantagem: (g) => ["S", "C"].includes(g.locPrimario) || ["Es", "Ql"].includes(g.tegTipo) || g.tolCiclo === "no",
    letal: (g) => ["aq", "um"].includes(g.tolHidrica) || g.tegTipo === "Mu" },
  { nome: "Deserto de Sal (Salar)", dominio: "Quentes e Áridos",
    exige: (g) => g.tolTermica === "qt" && g.tolHidrica === "xe",
    vantagem: (g) => g.tegResistencia >= 7 || g.locPrimario === "V",
    letal: (g) => g.tegTipo === "Mu" || g.tolHidrica === "um" },
  { nome: "Savana Arbustiva Seca", dominio: "Quentes e Áridos",
    exige: (g) => g.tolTermica === "qt" && ["ms", "xe"].includes(g.tolHidrica),
    vantagem: (g) => (g.locPrimario === "Q" && g.locVelocidade >= 7) || g.porte === "gr",
    letal: (g) => g.tolHidrica === "aq" },
  { nome: "Cânions de Rocha Torrada", dominio: "Quentes e Áridos",
    exige: (g) => g.tolTermica === "qt" && g.tolHidrica === "xe",
    vantagem: (g) => ["E", "V"].includes(g.locPrimario) || g.senVisao >= 7 || ["cr", "no"].includes(g.tolCiclo),
    letal: (g) => ["tt", "cl"].includes(g.porte) },
  { nome: "Selva de Dossel Fechado", dominio: "Quentes e Áridos",
    exige: (g) => g.tolTermica === "qt" && g.tolHidrica === "um",
    vantagem: (g) => ["E", "O"].includes(g.locPrimario) || g.cdaTipo === "pr" || g.defEstrategia === "mm",
    letal: (g) => g.tolHidrica === "xe" || ["cl", "tt"].includes(g.porte) },
  { nome: "Manguezal Lamacento Quente", dominio: "Quentes e Áridos",
    exige: (g) => g.tolTermica === "qt" && ["sa", "um"].includes(g.tolHidrica),
    vantagem: (g) => g.locPrimario === "S" || g.locSecundario === "N" || ["ra", "ve"].includes(g.memTerm),
    letal: (g) => g.tolHidrica === "xe" },

  // IV. Domínios Aquáticos e Oceânicos
  { nome: "Recife de Coral Raso", dominio: "Aquáticos", exige: (g) => g.tolHidrica === "aq" && g.tolTermica === "qt",
    vantagem: (g) => ["pq", "md"].includes(g.porte) || ["if", "mc"].includes(g.tegPadrao),
    letal: (g) => g.porte === "tt" || g.tolTermica === "fr" },
  { nome: "Floresta de Kelp Fria", dominio: "Aquáticos", exige: (g) => g.tolHidrica === "aq" && g.tolTermica === "fr",
    vantagem: (g) => ["N", "S"].includes(g.locPrimario) || ["mo", "ba"].includes(g.memTerm),
    letal: (g) => g.tolTermica === "qt" },
  { nome: "Abismo Oceânico Afótico", dominio: "Aquáticos", exige: (g) => g.tolHidrica === "aq" && ["fr", "tp"].includes(g.tolTermica),
    vantagem: (g) => (g.senVisao === 0 && ["vb", "ec"].includes(g.senEspecial)) || g.tegPadrao === "lm",
    letal: (g) => semVisaoFuncional(g) || g.dieBase === "ft" },
  { nome: "Fissura Vulcânica Submarina", dominio: "Aquáticos", exige: (g) => g.tolHidrica === "aq" && g.tolTermica === "qt",
    vantagem: (g) => g.dieBase === "qm" || ["Pd", "Me"].includes(g.tegTipo),
    letal: (g) => g.tolTermica === "fr" || ["Pe", "Pn"].includes(g.tegTipo) },
  { nome: "Mar Aberto (Pelágico)", dominio: "Aquáticos", exige: (g) => g.tolHidrica === "aq",
    vantagem: (g) => (g.locPrimario === "N" && g.locVelocidade >= 7) || g.tegResistencia >= 7,
    letal: (g) => g.locPrimario === "F" },

  // V. Domínios Extremos, Subterrâneos e Mágicos
  { nome: "Cavernas Úmidas Profundas", dominio: "Extremos e Mágicos", exige: (g) => ["um", "ms"].includes(g.tolHidrica),
    vantagem: (g) => ["vb", "ec"].includes(g.senEspecial) || ["E", "O"].includes(g.locPrimario) || g.tegTipo === "Mu",
    letal: (g) => semVisaoFuncional(g) || g.locPrimario === "V" },
  { nome: "Câmaras de Magma Ocultas", dominio: "Extremos e Mágicos", exige: (g) => g.tolTermica === "qt" && g.tolHidrica === "xe",
    vantagem: (g) => g.densidade === 9 || g.tegResistencia >= 8,
    letal: (g) => ["Pe", "Pn", "Mu", "Cs"].includes(g.tegTipo) },
  { nome: "Pântano Sulfuroso / Tóxico", dominio: "Extremos e Mágicos", exige: (g) => ["um", "sa"].includes(g.tolHidrica),
    vantagem: (g) => g.defEstrategia === "to" || g.dieBase === "de" || g.tegResistencia >= 7,
    letal: (g) => g.tegResistencia <= 2 && g.defBlindagem <= 2 },
  { nome: "Ruínas de Alta Radiação Áurica", dominio: "Extremos e Mágicos", exige: (g) => magNum(g) >= 4,
    vantagem: (g) => g.senEspecial === "au" || g.dieBase === "au" || g.tegTipo === "Cn",
    letal: (g) => magNum(g) <= 1 },
  { nome: "Nuvem Tempestuosa Contínua", dominio: "Extremos e Mágicos", exige: (g) => g.locPrimario === "V" && magNum(g) >= 6,
    vantagem: (g) => magNum(g) >= 8, // Fase 2, item 5.3 — removida cláusula de reino Sp
    letal: (g) => (!["V", "P"].includes(g.locPrimario) && magNum(g) < 6) || g.densidade >= 8 },
];

/* ============================================================
   GEOGRAFIA POR ERA — supercontinente que nasce inteiro e se
   divide em blocos ao longo do tempo, sem simulação de deriva
   continental contínua. Uma "era" é um estado geográfico válido
   por um intervalo de AU; trocar de era é um evento manual do
   usuário ("dividir agora"), não algo que a simulação decide.

   Cada massa de terra carrega os DOMÍNIOS climáticos (das 5
   categorias do Códice de Biomas) presentes nela — não os 27
   biomas específicos diretamente, que continuam sendo calculados
   por espécie a partir do HABITAT_CODEX, agora restrito aos
   domínios que aquela massa realmente tem. Uma massa de terra sem
   o domínio "Frio e Gelo", por exemplo, nunca oferece Glaciar
   Continental Aberto como bioma, mesmo que a espécie tolere.
   ============================================================ */
const DOMINIOS_CLIMATICOS = ["Frio e Gelo", "Temperados", "Quentes e Áridos", "Aquáticos", "Extremos e Mágicos"];

/* Fase 5, item 9.5 — domínios climáticos customizados, adicionados pelo
   usuário além dos 5 embutidos acima. Aditivo por design (nenhum dos 27
   biomas nem seus domínios originais em HABITAT_CODEX é tocado): um
   domínio customizado é só um "pacote" com nome próprio agrupando um
   subconjunto dos biomas JÁ existentes — não autora bioma novo com regras
   de exige/vantagem/letal próprias (isso exigiria uma UI de autoria de
   regras, fora de escopo razoável). Estado mutável no módulo, espelhado
   em `state.dominiosCustom` no App e persistido no export/import. */
let DOMINIOS_CUSTOM = []; // [{ nome, biomas: [nomeDoBioma, ...] }]

function listarDominiosDisponiveis() {
  return [...DOMINIOS_CLIMATICOS, ...DOMINIOS_CUSTOM.map((d) => d.nome)];
}
function adicionarDominioCustom(nome, biomasNomes) {
  if (!nome || !nome.trim() || DOMINIOS_CUSTOM.some((d) => d.nome === nome) || DOMINIOS_CLIMATICOS.includes(nome)) return false;
  DOMINIOS_CUSTOM = [...DOMINIOS_CUSTOM, { nome: nome.trim(), biomas: biomasNomes || [] }];
  return true;
}
function removerDominioCustom(nome) {
  DOMINIOS_CUSTOM = DOMINIOS_CUSTOM.filter((d) => d.nome !== nome);
}
function restaurarDominiosCustom(lista) {
  DOMINIOS_CUSTOM = Array.isArray(lista) ? lista : [];
}

let __idRegiaoCounter = 1;
function novoIdRegiao() { return "rg" + __idRegiaoCounter++ + "_" + Math.random().toString(36).slice(2, 6); }

/* Cria uma massa de terra dentro de uma era. dominios: subconjunto de
   DOMINIOS_CLIMATICOS presente ali — controla quais dos 27 biomas do
   códice essa massa consegue oferecer a qualquer espécie que viva nela. */
function criarMassaDeTerra(nome, dominios, biomasExcluidos) {
  // Fase 5, item 9.3 — biomasExcluidos: lista de nomes de bioma (do
  // HABITAT_CODEX) explicitamente desligados mesmo com o domínio deles
  // habilitado (ex.: manter o domínio "Aquáticos" mas excluir "Abismo
  // Oceânico Afótico" numa massa sem fossas profundas).
  const massa = { id: novoIdRegiao(), nome, dominios: dominios && dominios.length ? dominios : [...DOMINIOS_CLIMATICOS], biomasExcluidos: biomasExcluidos || [] };
  // Fase 2, item 5.5 (pré-requisito 1) — bioma prevalecente por divisão
  // espacial simulada. Modo aleatório: sorteia, para cada uma das
  // DIVISOES_POR_MASSA divisões, um bioma válido dentre os domínios
  // climáticos habilitados na massa (biomasDaMassa). Sem isso, "divisao"
  // era só um índice sem nenhum significado geográfico, e a migração
  // (item 5.5) não tinha pra onde apontar de forma coerente.
  const biomasValidos = biomasDaMassa(massa);
  massa.divisoesBiomas = Array.from({ length: DIVISOES_POR_MASSA }, (_, i) => ({
    id: i,
    biomaNome: biomasValidos.length ? biomasValidos[Math.floor(Math.random() * biomasValidos.length)].nome : null,
  }));
  return massa;
}

/* Fase 2, item 5.5 (pré-requisito 2) — topologia de vizinhança entre
   divisões: grade circular simples (0↔1↔2...↔7↔0), cada divisão vizinha
   das duas adjacentes por índice. Escolhida por ser a opção mais simples
   de implementar sem inventar geometria nova, dado que DIVISOES_POR_MASSA
   já é um número fixo pequeno (recomendação do próprio plano). */
function divisoesVizinhas(divisao, total = DIVISOES_POR_MASSA) {
  return [(divisao - 1 + total) % total, (divisao + 1) % total];
}

let __idEraCounter = 1;
function novaIdEra() { return "era" + __idEraCounter++; }

/* Cria a era inicial — tipicamente um único supercontinente com todos
   os domínios climáticos presentes (ele é grande o bastante para conter
   de tudo), mas o usuário pode restringir isso na criação se quiser um
   mundo mais nichado desde o início. */
function criarEraInicial(nomeMassaInicial, auInicio, dominios) {
  const massa = criarMassaDeTerra(nomeMassaInicial || "Pangeia Primordial", dominios);
  return { id: novaIdEra(), nome: "Era 1", auInicio: auInicio ?? 0, massas: [massa], eraAnteriorId: null };
}

/* Divide uma era em uma nova era com múltiplas massas de terra. mapaHeranca
   diz, para cada massa antiga, quais massas novas herdam as espécies que
   viviam lá (normalmente 1 massa antiga -> N massas novas, ex.: o
   supercontinente vira dois continentes). Se uma massa antiga não aparece
   no mapa, assume-se que ela se torna 1 nova massa homônima sem mudança de
   domínios — divisão é opt-in, não obrigatória para toda massa. */
function dividirEra(eraAtual, novoNomeEra, novasMassasPorAntiga, auDivisao) {
  const todasNovasMassas = [];
  const mapaAntigaParaNovas = {}; // massaAntigaId -> [novaMassaId, ...]
  for (const massaAntiga of eraAtual.massas) {
    const definicoes = novasMassasPorAntiga[massaAntiga.id];
    if (definicoes && definicoes.length) {
      const novas = definicoes.map((d) => criarMassaDeTerra(d.nome, d.dominios || massaAntiga.dominios, d.biomasExcluidos || massaAntiga.biomasExcluidos)); // Fase 5, item 9.3
      todasNovasMassas.push(...novas);
      mapaAntigaParaNovas[massaAntiga.id] = novas.map((n) => n.id);
    } else {
      const clone = criarMassaDeTerra(massaAntiga.nome, massaAntiga.dominios, massaAntiga.biomasExcluidos); // Fase 5, item 9.3
      todasNovasMassas.push(clone);
      mapaAntigaParaNovas[massaAntiga.id] = [clone.id];
    }
  }
  const novaEra = {
    id: novaIdEra(),
    nome: novoNomeEra || `Era ${__idEraCounter}`,
    auInicio: auDivisao,
    massas: todasNovasMassas,
    eraAnteriorId: eraAtual.id,
  };
  return { novaEra, mapaAntigaParaNovas };
}

/* Escolhe, para uma espécie que estava na massa antiga X, qual massa nova
   ela herda. Quando uma massa antiga virou várias (divisão de verdade),
   distribui aleatoriamente entre as novas — cada linhagem "ficou" em um
   pedaço do continente partido; o usuário pode reatribuir manualmente
   depois se quiser controlar isso com precisão. */
function herdarMassaNaDivisao(massaAntigaId, mapaAntigaParaNovas) {
  const opcoes = mapaAntigaParaNovas[massaAntigaId];
  if (!opcoes || !opcoes.length) return null;
  return opcoes[Math.floor(Math.random() * opcoes.length)];
}

/* Biomas específicos (do Códice) que uma massa de terra consegue oferecer:
   filtra HABITAT_CODEX pelos domínios climáticos presentes na massa
   (embutidos, via o campo `dominio` de cada bioma) mais os biomas
   agrupados por qualquer domínio CUSTOMIZADO presente na massa (Fase 5,
   item 9.5), e remove qualquer bioma individualmente excluído (item 9.3). */
function biomasDaMassa(massa) {
  if (!massa) return HABITAT_CODEX;
  const excluidos = massa.biomasExcluidos || [];
  const viaEmbutido = HABITAT_CODEX.filter((b) => massa.dominios.includes(b.dominio));
  const dominiosCustomNaMassa = DOMINIOS_CUSTOM.filter((d) => massa.dominios.includes(d.nome));
  const nomesViaCustom = new Set(dominiosCustomNaMassa.flatMap((d) => d.biomas));
  const viaCustom = HABITAT_CODEX.filter((b) => nomesViaCustom.has(b.nome));
  const todos = [...new Map([...viaEmbutido, ...viaCustom].map((b) => [b.nome, b])).values()]; // dedupe por nome
  return todos.filter((b) => !excluidos.includes(b.nome));
}

/* Igual a readHabitat, mas restrito aos biomas que a massa de terra da
   espécie de fato tem — uma espécie aquática tolerante a tudo não pode
   viver em Mar Aberto se a massa em que ela está não tem o domínio
   "Aquáticos" (ex.: um continente totalmente interior, sem costa/oceano
   modelado). Biomas fora do domínio da massa entram como vedados por
   geografia, uma quarta categoria além de clima/letal. */
function readHabitatNaMassa(g, massa) {
  const codexRestrito = biomasDaMassa(massa);
  const primary = [], marginal = [], vedadoLetal = [];
  let vedadoClima = 0, vedadoGeografia = HABITAT_CODEX.length - codexRestrito.length;
  for (const b of codexRestrito) {
    if (!b.exige(g)) { vedadoClima++; continue; }
    if (b.letal(g)) { vedadoLetal.push(b.nome); continue; }
    (b.vantagem(g) ? primary : marginal).push(b.nome);
  }
  return { primary, marginal, vedadoLetal, vedadoClima, vedadoGeografia };
}

/* comSeed=false pula o segundo passe (encode) do pipeline. buildSpecies
   rodava runSpeciesSteps SEMPRE duas vezes, mesmo quando o chamador só
   queria o genoma: o editor de espécie refaz isso a cada tecla e
   gerarPrimordialValido chega a chamar 6 vezes seguidas. Sem a seed, o
   custo cai pela metade (medido: 0,64ms -> 0,33ms por espécie). */
function buildSpecies(seedBigOrNull, manual, isPrimordial, comSeed = true) {
  const address = seedBigOrNull !== null ? mixForward(seedBigOrNull, SPECIES_HALF) : null;
  const cur = address !== null ? newCursor("decode", { seed: address, manual }) : newCursor("randomize", { manual });
  runSpeciesSteps(cur, isPrimordial);
  if (!comSeed) return { g: cur.ctx, code: serialize(cur.ctx), speciesSeed: undefined };
  const encCur = newCursor("encode", { ctx: { ...cur.ctx } });
  runSpeciesSteps(encCur, isPrimordial);
  const canonical = mixInverse(encCur.outValue, SPECIES_HALF);
  return { g: cur.ctx, code: serialize(cur.ctx), speciesSeed: canonical };
}

/* Genes sempre recalculados a partir de outros durante runSpeciesSteps —
   nunca são "roletados" de forma independente, então nunca fazem parte do
   que a seed precisa reconstruir. Ficam de fora da checagem de fidelidade;
   eles vão bater sozinhos sempre que os genes-base dos quais dependem
   estiverem corretos, e ficam expostos como possível divergência residual
   só quando a deriva empurrou o genoma para um estado que o gerador normal
   nunca produziria (ex.: sentido de visão alto numa espécie cega). */
const GENES_SEMPRE_DERIVADOS = new Set(["socSenciencia", "socSencienciaPenalizada", "extremos", "anomalias", "clado", "cladoC1", "cladoV", "cladoC2"]);

/* Obtém a seed (endereço combinatório) que, decodificada na Estação DRN2,
   reconstrói este genoma — inclusive espécies nascidas por deriva, que
   nunca tiveram uma seed própria. Retorna também se a reconstrução bate
   fielmente com o genoma atual: pode não bater em casos raros onde a
   deriva mutou um gene escalar (ex. senVisao) sem respeitar uma condição
   que o gerador normal sempre impõe (ex. espécie cega com visão alta) —
   nesse caso a seed ainda é válida e reconstrói a espécie mais próxima
   possível, mas alguns campos derivados podem diferir; eles são listados. */
function seedParaGenoma(g, isPrimordial) {
  const encCur = newCursor("encode", { ctx: { ...g } });
  runSpeciesSteps(encCur, isPrimordial);
  const seed = mixInverse(encCur.outValue, SPECIES_HALF);
  // decodifica de volta para checar fidelidade real (o que a Estação DRN2 vai mostrar)
  const rebuilt = buildSpecies(seed, {}, isPrimordial);
  const camposDivergentes = [];
  for (const k of Object.keys(g)) {
    if (GENES_SEMPRE_DERIVADOS.has(k)) continue;
    if (JSON.stringify(g[k]) !== JSON.stringify(rebuilt.g[k])) camposDivergentes.push(k);
  }
  return { seed, fiel: camposDivergentes.length === 0, camposDivergentes, codeRebuilt: rebuilt.code };
}

/* ============================================================
   ESTRATOS DE PROFUNDIDADE — Parte I §4 do documento DRN2.
   Chaves usando os nomes de campo do ctx (g.<chave>).
   Estrato I nunca muda por deriva/mutação — só por especiação
   deliberada (Parte V). Estrato II muda por deriva (custo 4).
   Estrato III muda por deriva (custo 1) e mutação de nascimento.
   ============================================================ */
const ESTRATO_I = ["reino", "classe", "simetria", "morForma", "locPrimario", "memSup", "memInf", "repModo", "crnFormato", "facFocinho", "tolHidrica",
  "metamorfoseTipo"]; // Fase 3 — gene central ao plano corporal do INS (ametábola/hemi/holometábola)
const ESTRATO_II = ["porte", "densidade", "morTorso", "locSecundario", "locVelocidade", "memApendices", "memTerm", "memProp", "tegTipo", "tegResistencia", "crnChifreQtd", "crnCrista", "crnPescoco", "facOrelha", "facOlhosQtd", "facDenticao", "asaQtd", "asaTipo", "cdaComp", "cdaTipo", "dieBase", "mag", "repProle", "repMaturacao", "repLongevidade", "tolTermica",
  // Fase 3 — genes categóricos novos por táxon (taxa de mutação moderada)
  "glandulaMamaria", "dentesTipo", "termorregulacao", "gestacao",
  "bicoFormato", "penaFuncao", "migratorio",
  "escamaTipo", "venenoAparato", "regeneracaoCauda",
  "metamorfose", "peleToxinas",
  "nadadeiraConfiguracao", "respiracaoBranquial", "bexigaNatatoria",
  "patasQtdEspecializada", "venenoOuFerroao", "coloniaTipo",
  "concha", "tentaculosQtd", "tintaDefensiva",
  "raizTipo", "folhaTipo", "reproducaoEstrutura",
  "corpoFrutiferoTipo", "esporoDispersao",
  "paredeCelularTipo", "metabolismoTipo", "formaColonia"];
const ESTRATO_III = ["tegCor", "tegPadrao", "asaFuncionalidade", "cdaFuncao", "dieFrequencia", "dieRestricao", "senVisao", "senOlfato", "senAudicao", "senTato", "senEspecial", "tolCiclo", "socEstrutura", "socAgressividade", "socSenciencia", "defArma", "defBlindagem", "defEstrategia",
  // Fase 3 — genes escalares novos por táxon (detalhe fino)
  "pelagemDensidade", "ovoCasca", "ectotermiaDependencia", "respiracaoCutanea", "fotossinteseIntensidade", "redeMicelialAlcance"];

/* Genes categóricos com tabela fixa — usados para rerrolar em deriva.
   Escalares (3d4-3, 0-9) deslocam ±1 em vez de rerrolar. */
const GENE_TABLE_MAP = {
  tolHidrica: T.tolHidrica, tolTermica: T.tolTermica, tolCiclo: T.tolCiclo,
  reino: T.reino, mag: T.mag, simetria: T.simetria, porte: T.porte, morTorso: T.morTorso,
  locPrimario: T.locPrim, locSecundario: T.locSec, memSup: T.memSup, memTerm: T.memTerm, memProp: T.memProp,
  repModo: T.repModo, crnFormato: T.crnFormato, crnChifreQtd: T.crnChifreQtd, crnChifreForma: T.crnChifreForma, crnCrista: T.crnCrista, crnPescoco: T.crnPescoco,
  dieBase: T.dieBase, dieRestricao: T.dieRestricao,
  facFocinho: T.facFocinho, facOrelha: T.facOrelha, facOlhosQtd: T.facOlhosQtd, facOlhosTipo: T.facOlhosTipo, facDenticao: T.facDenticao,
  tegTipo: T.tegTipo, tegCor: T.tegCor, tegPadrao: T.tegPadrao,
  asaQtd: T.asaQtd, asaTipo: T.asaTipo, cdaComp: T.cdaComp, cdaTipo: T.cdaTipo,
  senEspecial: T.senEspecial, socEstrutura: T.socEstrutura, defArma: T.defArma, defEstrategia: T.defEstrategia,
  // Fase 3 — genes categóricos novos por táxon
  glandulaMamaria: T.glandulaMamaria, dentesTipo: T.dentesTipo, termorregulacao: T.termorregulacao, gestacao: T.gestacao,
  bicoFormato: T.bicoFormato, penaFuncao: T.penaFuncao, migratorio: T.migratorio,
  escamaTipo: T.escamaTipo, venenoAparato: T.venenoAparato, regeneracaoCauda: T.regeneracaoCauda,
  metamorfose: T.metamorfose, peleToxinas: T.peleToxinas,
  nadadeiraConfiguracao: T.nadadeiraConfiguracao, respiracaoBranquial: T.respiracaoBranquial, bexigaNatatoria: T.bexigaNatatoria,
  metamorfoseTipo: T.metamorfoseTipo, patasQtdEspecializada: T.patasQtdEspecializada, venenoOuFerroao: T.venenoOuFerroao, coloniaTipo: T.coloniaTipo,
  concha: T.concha, tentaculosQtd: T.tentaculosQtd, tintaDefensiva: T.tintaDefensiva,
  raizTipo: T.raizTipo, folhaTipo: T.folhaTipo, reproducaoEstrutura: T.reproducaoEstrutura,
  corpoFrutiferoTipo: T.corpoFrutiferoTipo, esporoDispersao: T.esporoDispersao,
  paredeCelularTipo: T.paredeCelularTipo, metabolismoTipo: T.metabolismoTipo, formaColonia: T.formaColonia,
};
const ESCALAR_KEYS = new Set(["densidade", "locVelocidade", "repProle", "repMaturacao", "repLongevidade", "tegResistencia", "tegCorIntensidade", "cdaFuncao", "senVisao", "senOlfato", "senAudicao", "senTato", "senEspecialIntensidade", "socAgressividade", "defBlindagem", "asaFuncionalidade", "dieFrequencia", "socSenciencia", "socSencienciaBruta",
  // Fase 3 — genes escalares novos por táxon
  "pelagemDensidade", "ovoCasca", "ectotermiaDependencia", "respiracaoCutanea", "fotossinteseIntensidade", "redeMicelialAlcance"]);

/* Genes cujo valor decide se OUTROS genes existem, quais opções eles têm,
   ou que faixa podem assumir — ou seja, os que aparecem em alguma condição
   dentro de runSpeciesSteps. Alterar um destes pode deixar o genoma
   inconsistente e exige renormalizar; alterar qualquer outro (gene-folha,
   como tegCor ou senOlfato) não pode quebrar dependência nenhuma.

   A lista é deliberadamente conservadora — inclui tudo que aparece numa
   comparação no pipeline, mesmo indiretamente (limites min/max de escalares,
   travas de classe, viés de bioma). Errar para mais custa desempenho;
   errar para menos reintroduz genomas incoerentes, que é bem pior. */
const GENES_CONDICIONANTES = new Set([
  // estrutura corporal e locomoção
  "reino", "classe", "morForma", "morTorso", "porte", "densidade",
  "locPrimario", "locSecundario", "locVelocidade",
  "memSup", "memInf", "memApendices", "memTerm", "memProp",
  // apêndices e extremidades condicionais
  "asaQtd", "asaTipo", "cdaComp", "cdaTipo",
  "crnFormato", "crnChifreQtd", "crnChifreForma", "crnCrista", "crnPescoco",
  "facOlhosQtd", "facOlhosTipo", "facDenticao", "facOrelha", "facFocinho",
  // tolerâncias e ambiente (enviesam várias tabelas)
  "tolHidrica", "tolTermica", "tolCiclo", "mag",
  // dieta, sentidos e sociedade que condicionam outros passos
  "dieBase", "dieRestricao", "senVisao", "senEspecial",
  "tegTipo", "tegPadrao", "socEstrutura", "socSencienciaBruta",
  "defArma", "defEstrategia", "repModo",
  /* Genes que só EXISTEM sob uma condição também entram: mexer neles quando
     a condição está falsa recria um campo órfão (ex.: a deriva sobe
     asaFuncionalidade numa espécie sem asas), e só a normalização apaga
     isso de novo. Descobri isso na marra — sem estes, a otimização
     reintroduzia exatamente os campos órfãos que já tínhamos corrigido. */
  "asaFuncionalidade", "cdaFuncao", "senEspecialIntensidade",
  /* Escalares com min/max que dependem de OUTRO gene (porte limita a prole,
     magia alta força longevidade mínima, locomoção séssil zera velocidade).
     Alterá-los isoladamente pode estourar um limite herdado de um estado
     anterior, e só a normalização traz de volta pro intervalo válido. */
  "repProle", "repMaturacao", "repLongevidade", "tegResistencia",
]);

function readHabitat(g) {
  const primary = [], marginal = [], vedadoLetal = [];
  let vedadoClima = 0;
  for (const b of HABITAT_CODEX) {
    if (!b.exige(g)) { vedadoClima++; continue; }
    if (b.letal(g)) { vedadoLetal.push(b.nome); continue; }
    (b.vantagem(g) ? primary : marginal).push(b.nome);
  }
  return { primary, marginal, vedadoLetal, vedadoClima };
}

/* ---------- busca por seed (v23) ----------
   Decodifica um texto de seed colado pelo usuário — pode ser só a
   seed de espécie, ou a seed colada (espécie+indivíduo, gluedSeedText)
   — de volta em um genoma (e, se houver parte de indivíduo, também um
   indivíduo). Não valida SE aquela seed já existe no mundo atual: o
   espaço de espécimes possíveis (~10^50) é muito maior que qualquer
   mundo gerado, então "buscar uma seed" aqui significa reconstruir o
   espécime que ela endereça, esteja ele já na árvore ou não.
   isPrimordial vem embutido no 1º dígito da própria seed (ver
   splitGluedSeed) — não precisa mais ser informado por quem chama. */
function decodificarSeedColada(textoSeed) {
  const { speciesDigits, individualDigits, isPrimordial } = splitGluedSeed(textoSeed);
  if (!speciesDigits) return null;
  const speciesSeedBig = BigInt(speciesDigits);
  const built = buildSpecies(speciesSeedBig, {}, isPrimordial, true);
  const g = { ...built.g, isPrimordial };
  let individual = null;
  if (individualDigits) {
    const individualSeedBig = BigInt(individualDigits);
    const r = buildIndividual(g, individualSeedBig);
    individual = {
      id: "seedlookup_" + Date.now(), especieId: null, nome: sortNomeIndividuo(),
      ind: r.ind, code: r.code, individualSeed: r.individualSeed,
      attrBase: r.attrBase, attrVaried: r.attrVaried, massaId: null, divisao: null, viva: true,
    };
  }
  return { g, code: built.code, speciesSeed: built.speciesSeed, individual, isPrimordial };
}

/* ---------- 32 dígitos reservados ao indivíduo; 130 à espécie (teto medido: 108) ---------- */
const IND_DIGITS = 39n;      // 128 bits
const SPECIES_DIGITS = 155n; // 512 bits
const IND_MOD = 10n ** IND_DIGITS;
function padSeed(value, digits) { return (value ?? 0n).toString().padStart(Number(digits), "0"); }
const GENE_LABELS = {
  reino: "reino", classe: "classe", clado: "clado",
  porte: "porte", densidade: "densidade", simetria: "simetria", morForma: "forma de crescimento", morTorso: "proporção de tronco",
  memProp: "proporção de membros",
  crnPescoco: "pescoço",
  locPrimario: "primário", locSecundario: "secundário", locVelocidade: "velocidade",
  memSup: "superiores", memInf: "inferiores", memApendices: "apêndices", memTerm: "terminação",
  tegTipo: "tipo", tegResistencia: "resistência", tegPadrao: "padrão",
  crnChifreQtd: "chifres", crnCrista: "crista", crnFormato: "formato",
  facOrelha: "orelha", facFocinho: "focinho", facDenticao: "dentição",
  dieBase: "base", dieFrequencia: "frequência", dieRestricao: "restrição",
  mag: "nível",
  senVisao: "visão", senOlfato: "olfato", senAudicao: "audição", senTato: "tato",
  repModo: "modo", repProle: "prole", repMaturacao: "maturação", repLongevidade: "longevidade",
  tolHidrica: "hídrica", tolTermica: "térmica", tolCiclo: "ciclo",
  socEstrutura: "estrutura", socAgressividade: "agressividade", socSenciencia: "senciência",
  defArma: "arma", defBlindagem: "blindagem", defEstrategia: "estratégia",
};
function describeIndividual(g) {
  const l = (k) => GENE_LABELS[k] || k;
  const lines = [
    `TAX: ${l("reino")}=${g.reino} ${l("classe")}=${g.classe} ${l("clado")}=${g.clado}`,
    `MOR: ${l("porte")}=${g.porte} ${l("densidade")}=${g.densidade} ${l("simetria")}=${g.simetria}${g.morForma !== "0" ? ` ${l("morForma")}=${g.morForma}` : ""}${g.morTorso !== "0" ? ` ${l("morTorso")}=${g.morTorso}` : ""}`,
    `LOC: ${l("locPrimario")}=${g.locPrimario} ${l("locSecundario")}=${g.locSecundario} ${l("locVelocidade")}=${g.locVelocidade}`,
    `MEM: ${l("memSup")}=${g.memSup} ${l("memInf")}=${g.memInf} ${l("memApendices")}=${g.memApendices} ${l("memTerm")}=${g.memTerm}${g.memProp !== "0" ? ` ${l("memProp")}=${g.memProp}` : ""}`,
    `TEG: ${l("tegTipo")}=${g.tegTipo} cor=${g.tegCor}(${g.tegCorIntensidade}) ${l("tegPadrao")}=${g.tegPadrao} ${l("tegResistencia")}=${g.tegResistencia}`,
    `CRN: ${l("crnChifreQtd")}=${g.crnChifreQtd}${g.crnChifreForma || ""} ${l("crnCrista")}=${g.crnCrista} ${l("crnFormato")}=${g.crnFormato}${g.crnPescoco !== "0" ? ` ${l("crnPescoco")}=${g.crnPescoco}` : ""}`,
    `FAC: ${l("facOrelha")}=${g.facOrelha} ${l("facFocinho")}=${g.facFocinho} olhos=${g.facOlhosQtd}(${g.facOlhosTipo}) ${l("facDenticao")}=${g.facDenticao}`,
  ];
  if (g.asaQtd !== 0) lines.push(`ASA: quantidade=${g.asaQtd} tipo=${g.asaTipo} funcionalidade=${g.asaFuncionalidade}`);
  if (g.cdaComp !== "0") lines.push(`CDA: comprimento=${g.cdaComp} tipo=${g.cdaTipo} função=${g.cdaFuncao}`);
  lines.push(`DIE: ${l("dieBase")}=${g.dieBase} ${l("dieFrequencia")}=${g.dieFrequencia} ${l("dieRestricao")}=${g.dieRestricao}`);
  lines.push(`MAG: ${l("mag")}=${g.mag}`);
  lines.push(`SEN: ${l("senVisao")}=${g.senVisao} ${l("senOlfato")}=${g.senOlfato} ${l("senAudicao")}=${g.senAudicao} ${l("senTato")}=${g.senTato} especial=${g.senEspecial}${g.senEspecial !== "0" ? `(${g.senEspecialIntensidade})` : ""}`);
  lines.push(`REP: ${l("repModo")}=${g.repModo} ${l("repProle")}=${g.repProle} ${l("repMaturacao")}=${g.repMaturacao} ${l("repLongevidade")}=${g.repLongevidade}`);
  lines.push(`TOL: ${l("tolHidrica")}=${g.tolHidrica} ${l("tolTermica")}=${g.tolTermica} ${l("tolCiclo")}=${g.tolCiclo}`);
  lines.push(`SOC: ${l("socEstrutura")}=${g.socEstrutura} ${l("socAgressividade")}=${g.socAgressividade} ${l("socSenciencia")}=${g.socSenciencia}${g.socSencienciaPenalizada ? " (−2 aplicado)" : ""}`);
  lines.push(`DEF: ${l("defArma")}=${g.defArma} ${l("defBlindagem")}=${g.defBlindagem} ${l("defEstrategia")}=${g.defEstrategia}`);
  if (g.anomalias?.length) lines.push(`ANO: ${g.anomalias.join(", ")}`);
  return lines.join("\n");
}

/* ============================================================
   DESCRIÇÃO EM PROSA — traduz cada gene pelo rótulo da tabela
   correspondente e monta um texto legível, gerado a partir do
   próprio código, não escrito à mão por espécime.
   ============================================================ */
function labelOf(table, value) {
  const row = table.find((r) => r.value === value);
  return row ? row.label : String(value);
}
function tier(n, labels = ["muito baixo", "baixo", "moderado", "alto", "muito alto"]) {
  if (n <= 1) return labels[0];
  if (n <= 3) return labels[1];
  if (n <= 5) return labels[2];
  if (n <= 7) return labels[3];
  return labels[4];
}
function generoReino(reino) {
  return { An: "um animal", Pl: "uma planta", Fu: "um fungo", Ba: "uma bactéria" }[reino] || "uma criatura"; // Fase 1, item 4.1 / Fase 2, item 5.3 — Ar/Sp removidos
}
function describeCreatureProse(g) {
  const p = [];

  p.push(
    `${g.isPrimordial ? "Primordial" : "Espécie"} do clado ${g.clado}: ${generoReino(g.reino)}${g.classe && !["VEG", "FUN", "MIC"].includes(g.classe) ? ` da classe ${labelOf(T.classeAn, g.classe).toLowerCase()}` : ""}, de porte ${labelOf(T.porte, g.porte).toLowerCase()} e simetria ${labelOf(T.simetria, g.simetria).toLowerCase()}, com densidade corporal ${tier(g.densidade, ["quase sem massa", "leve", "mediana", "densa", "pétrea ou metálica"])}${g.morForma !== "0" ? `, de forma de crescimento ${labelOf(g.reino === "Pl" ? T.morFormaPl : g.reino === "Ba" ? T.morFormaBa : T.morFormaFu, g.morForma).toLowerCase()}` : ""}${g.morTorso !== "0" ? `, tronco ${labelOf(T.morTorso, g.morTorso).toLowerCase()}` : ""}.`
  );

  // Fase 1, item 4.1 — bactéria não tem membros; molde próprio, sem falar em
  // membro/terminação (o molde geral com membros fica para o resto dos reinos).
  let locFrase;
  if (g.reino === "Ba") {
    locFrase = `Locomove-se principalmente por ${labelOf(T.locPrim, g.locPrimario).toLowerCase()}, a uma velocidade ${tier(g.locVelocidade)}, sem membros diferenciados — organismo unicelular.`;
  } else {
    locFrase = `Locomove-se principalmente por ${labelOf(T.locPrim, g.locPrimario).toLowerCase()}${g.locSecundario !== "0" ? `, com ${labelOf(T.locSec, g.locSecundario).toLowerCase()} como modo secundário` : ""}, a uma velocidade ${tier(g.locVelocidade)}. Tem ${labelOf(T.memSup, g.memSup).toLowerCase()} e ${g.memInf.replace("I", "")} membro(s) inferior(es)${g.memApendices !== "0X" ? `, além de ${g.memApendices.replace("X", "")} apêndices auxiliares` : ""}, terminando em ${labelOf(T.memTerm, g.memTerm).toLowerCase()}${g.memProp !== "0" ? `, com membros ${labelOf(T.memProp, g.memProp).toLowerCase()}` : ""}.`;
  }
  p.push(locFrase);

  let tegFrase = `O corpo é revestido por ${labelOf(T.tegTipo, g.tegTipo).toLowerCase()}, na cor ${labelOf(T.tegCor, g.tegCor).toLowerCase()} (intensidade ${g.tegCorIntensidade}), em padrão ${labelOf(T.tegPadrao, g.tegPadrao).toLowerCase()}, com resistência ${tier(g.tegResistencia)}.`;
  p.push(tegFrase);

  let crnFrase = `O crânio é ${g.crnFormato === "0" ? "indefinido, sem estrutura craniana fixa" : labelOf(T.crnFormato, g.crnFormato).toLowerCase()}${g.crnPescoco !== "0" ? `, sobre um pescoço ${labelOf(T.crnPescoco, g.crnPescoco).toLowerCase()}` : ""}`;
  if (g.crnChifreQtd !== "0") crnFrase += `, com ${g.crnChifreQtd} chifres em formato ${labelOf(T.crnChifreForma, g.crnChifreForma).toLowerCase()}`;
  if (g.crnCrista !== "0") crnFrase += `, e crista do tipo ${labelOf(T.crnCrista, g.crnCrista).toLowerCase()}`;
  crnFrase += ".";
  p.push(crnFrase);

  if (g.crnFormato !== "0") {
    p.push(`No rosto: orelha ${labelOf(T.facOrelha, g.facOrelha).toLowerCase()}, focinho ${labelOf(T.facFocinho, g.facFocinho).toLowerCase()}, dentição ${g.facDenticao === "0" ? "ausente" : labelOf(T.facDenticao, g.facDenticao).toLowerCase()}.`);
  }
  if (g.facOlhosQtd !== 0) {
    p.push(`Possui ${g.facOlhosQtd} olho(s) do tipo ${labelOf(T.facOlhosTipo, g.facOlhosTipo).toLowerCase()}.`);
  }

  if (g.asaQtd !== 0) p.push(`Possui ${g.asaQtd} asas do tipo ${labelOf(T.asaTipo, g.asaTipo).toLowerCase()}, com funcionalidade ${tier(g.asaFuncionalidade)}.`);
  if (g.cdaComp !== "0") p.push(`A cauda é ${labelOf(T.cdaComp, g.cdaComp).toLowerCase()}, do tipo ${labelOf(T.cdaTipo, g.cdaTipo).toLowerCase()}.`);

  let dieFrase = `Alimenta-se como ${labelOf(T.dieBase, g.dieBase).toLowerCase()}`;
  if (g.dieRestricao !== "0") dieFrase += `, com restrição ${labelOf(T.dieRestricao, g.dieRestricao).toLowerCase()}`;
  dieFrase += `. Reproduz-se de forma ${labelOf(T.repModo, g.repModo).toLowerCase()}, com prole ${tier(g.repProle, ["quase nenhuma", "pequena", "moderada", "numerosa", "aos milhares"])}, maturação ${tier(g.repMaturacao, ["quase instantânea", "rápida", "moderada", "lenta", "de séculos"])} e longevidade ${tier(g.repLongevidade, ["de dias", "curta", "moderada", "longa", "quase indefinida"])}.`;
  p.push(dieFrase);

  let tolFrase = `Tolera climas ${labelOf(T.tolHidrica, g.tolHidrica).toLowerCase()} e ${labelOf(T.tolTermica, g.tolTermica).toLowerCase()}, com atividade ${labelOf(T.tolCiclo, g.tolCiclo).toLowerCase()}.`;
  if (g.senEspecial !== "0") tolFrase += ` Conta ainda com ${labelOf(T.senEspecial, g.senEspecial).toLowerCase()} como sentido extra (intensidade ${g.senEspecialIntensidade}).`;
  p.push(tolFrase);

  const sencLabel = g.socSenciencia <= 2 ? "instintiva" : g.socSenciencia <= 5 ? "associativa (aprende por repetição)" : g.socSenciencia <= 8 ? "simbólica (resolve problemas novos)" : "abstrata plena";
  p.push(`Socialmente é ${labelOf(T.socEstrutura, g.socEstrutura).toLowerCase()}, com agressividade ${tier(g.socAgressividade)} e cognição ${sencLabel}${g.socSencienciaPenalizada ? " (penalizada por não ter crânio humanoide)" : ""}.`);

  let defFrase = `Defende-se com ${g.defArma === "0" ? "nenhuma arma natural" : labelOf(T.defArma, g.defArma).toLowerCase()}, blindagem ${tier(g.defBlindagem)}, e estratégia de ${labelOf(T.defEstrategia, g.defEstrategia).toLowerCase()}. Nível de magia: ${labelOf(T.mag, g.mag).toLowerCase()}.`;
  p.push(defFrase);

  // Fase 3 — frases dos genes novos por táxon
  if (g.classe === "MAM") {
    p.push(`Mamífero com termorregulação ${labelOf(T.termorregulacao, g.termorregulacao).toLowerCase()}, dentição ${labelOf(T.dentesTipo, g.dentesTipo).toLowerCase()}, gestação ${labelOf(T.gestacao, g.gestacao).toLowerCase()}, pelagem de densidade ${tier(g.pelagemDensidade)}${g.glandulaMamaria !== "au" ? ` e glândulas mamárias ${labelOf(T.glandulaMamaria, g.glandulaMamaria).toLowerCase()}` : ""}.`);
  }
  if (g.classe === "AVE") {
    p.push(`Ave de bico ${labelOf(T.bicoFormato, g.bicoFormato).toLowerCase()}, penas com função ${labelOf(T.penaFuncao, g.penaFuncao).toLowerCase()}, casca de ovo com resistência ${tier(g.ovoCasca)}, hábito ${labelOf(T.migratorio, g.migratorio).toLowerCase()}.`);
  }
  if (g.classe === "REP") {
    p.push(`Réptil de escama ${labelOf(T.escamaTipo, g.escamaTipo).toLowerCase()}, dependência solar (ectotermia) ${tier(g.ectotermiaDependencia)}${g.venenoAparato !== "au" ? `, com aparato de veneno: ${labelOf(T.venenoAparato, g.venenoAparato).toLowerCase()}` : ""}, regeneração de cauda ${labelOf(T.regeneracaoCauda, g.regeneracaoCauda).toLowerCase()}.`);
  }
  if (g.classe === "AMP") {
    p.push(`Anfíbio de metamorfose ${labelOf(T.metamorfose, g.metamorfose).toLowerCase()}, respiração cutânea ${tier(g.respiracaoCutanea)}${g.peleToxinas !== "au" ? `, pele ${labelOf(T.peleToxinas, g.peleToxinas).toLowerCase()}` : ""}.`);
  }
  if (g.classe === "PSC") {
    p.push(`Peixe de nadadeiras ${labelOf(T.nadadeiraConfiguracao, g.nadadeiraConfiguracao).toLowerCase()}, respiração ${labelOf(T.respiracaoBranquial, g.respiracaoBranquial).toLowerCase()}, ${g.bexigaNatatoria === "pr" ? "com" : "sem"} bexiga natatória.`);
  }
  if (g.classe === "INS") {
    p.push(`Inseto/artrópode de metamorfose ${labelOf(T.metamorfoseTipo, g.metamorfoseTipo).toLowerCase()}, patas ${labelOf(T.patasQtdEspecializada, g.patasQtdEspecializada).toLowerCase()}, colônia ${labelOf(T.coloniaTipo, g.coloniaTipo).toLowerCase()}${g.venenoOuFerroao !== "au" ? `, com ${labelOf(T.venenoOuFerroao, g.venenoOuFerroao).toLowerCase()}` : ""}.`);
  }
  if (g.classe === "MOL") {
    p.push(`Molusco de concha ${labelOf(T.concha, g.concha).toLowerCase()}, ${g.tentaculosQtd === 99 ? "muitos" : g.tentaculosQtd} tentáculo(s)${g.tintaDefensiva === "pr" ? ", com tinta defensiva" : ""}.`);
  }
  if (g.reino === "Pl") {
    p.push(`Raiz ${labelOf(T.raizTipo, g.raizTipo).toLowerCase()}, folhas do tipo ${g.folhaTipo === "au" ? "ausentes" : labelOf(T.folhaTipo, g.folhaTipo).toLowerCase()}, reprodução por ${labelOf(T.reproducaoEstrutura, g.reproducaoEstrutura).toLowerCase()}, intensidade fotossintética ${tier(g.fotossinteseIntensidade)}.`);
  }
  if (g.reino === "Fu") {
    p.push(`Corpo frutífero: ${labelOf(T.corpoFrutiferoTipo, g.corpoFrutiferoTipo).toLowerCase()}. Alcance da rede micelial ${tier(g.redeMicelialAlcance)}, dispersão de esporos por ${labelOf(T.esporoDispersao, g.esporoDispersao).toLowerCase()}.`);
  }
  if (g.reino === "Ba") {
    p.push(`Parede celular ${labelOf(T.paredeCelularTipo, g.paredeCelularTipo).toLowerCase()}, metabolismo ${labelOf(T.metabolismoTipo, g.metabolismoTipo).toLowerCase()}, colônia em formação ${labelOf(T.formaColonia, g.formaColonia).toLowerCase()}.`);
  }

  if (g.anomalias?.length) p.push(`Carrega ${g.anomalias.length > 1 ? "as anomalias" : "a anomalia"}: ${g.anomalias.map((a) => labelOf(T.ano, a).toLowerCase()).join(", ")}.`);

  return p.join(" ");
}


/* ============================================================
   MOTOR DE DERIVA E ESPECIAÇÃO — Parte V do documento DRN2
   ============================================================ */

function rollD(n) { return 1 + Math.floor(Math.random() * n); }
function roll3d4menos3() { return rollD(4) + rollD(4) + rollD(4) - 3; }

const PRESSAO_TABELA = [
  { max: 2, nome: "Estase" }, { max: 5, nome: "Moderada" }, { max: 7, nome: "Severa" }, { max: 9, nome: "Catastrófica" },
];
function nomePressao(v) { return PRESSAO_TABELA.find((r) => v <= r.max)?.nome || "Catastrófica"; }

const FONTES_PRESSAO = [
  { id: 1, nome: "Bioma subterrâneo", vies: { senVisao: "baixo", senEspecial: ["vb", "ec"], tegCor: ["Bra", "Cnz"], porte: "baixo" } },
  { id: 2, nome: "Bioma aquático", vies: { tolHidrica: ["sa", "aq"], locPrimario: ["N"], memTerm: ["ba"], tegTipo: ["Es", "Mu"], cdaTipo: ["bq"] } },
  { id: 3, nome: "Bioma glacial", vies: { tolTermica: ["fr"], porte: "alto", tegTipo: ["Pe"], tegResistencia: "alto", tegCor: ["Bra"] } },
  { id: 4, nome: "Bioma árido", vies: { tolHidrica: ["xe"], tegResistencia: "alto", tolCiclo: ["no"], dieFrequencia: "baixo" } },
  { id: 5, nome: "Bioma aéreo / grande altitude", vies: { asaFuncionalidade: "alto", densidade: "baixo", porte: "baixo" } },
  { id: 6, nome: "Predação alta", vies: { defBlindagem: "alto", locVelocidade: "alto", repProle: "alto", socEstrutura: ["ba", "ma"] } },
  { id: 7, nome: "Escassez alimentar", vies: { dieBase: ["on", "de"], porte: "baixo", dieFrequencia: "baixo" } },
  { id: 8, nome: "Alta densidade de poder ambiental", vies: { mag: "alto", tegPadrao: ["gv"], senEspecial: ["au"] } },
  { id: 9, nome: "Competição cognitiva", vies: { socSenciencia: "alto", memTerm: ["mo"], crnFormato: ["hu"], repProle: "baixo", repMaturacao: "alto" } },
  { id: 10, nome: "Deriva neutra", vies: {} },
];
function sortFontePressao() { return FONTES_PRESSAO[rollD(10) - 1]; }

const CUSTO_ESTRATO = { I: 12, II: 4, III: 1 };

function sortGeneAlvo(estrato) {
  if (estrato === "I") { let n; do { n = rollD(12); } while (n > 11); return ESTRATO_I[n - 1]; }
  if (estrato === "II") { let n; do { n = rollD(14) + (Math.random() < 0.5 ? 0 : 14); } while (n > 26); return ESTRATO_II[n - 1]; }
  let n; do { n = rollD(20); } while (n > 18); return ESTRATO_III[n - 1];
}

function rerollGeneCategorico(g, key, fonte) {
  const table = GENE_TABLE_MAP[key];
  if (!table) return false;
  const bias = fonte?.vies?.[key];
  const nums = [];
  for (let n = 1; n <= 100; n++) nums.push(n);
  let novoValor;
  if (Array.isArray(bias) && bias.length) {
    const n1 = nums[Math.floor(Math.random() * nums.length)];
    const n2 = nums[Math.floor(Math.random() * nums.length)];
    const l1 = pick(table, n1).value, l2 = pick(table, n2).value;
    novoValor = bias.includes(l1) ? l1 : (bias.includes(l2) ? l2 : l1);
  } else {
    novoValor = pick(table, nums[Math.floor(Math.random() * nums.length)]).value;
  }
  if (novoValor === g[key]) return false;
  g[key] = novoValor;
  return true;
}

function deslocarGeneEscalar(g, key, fonte) {
  const bias = fonte?.vies?.[key];
  let delta;
  if (bias === "alto") delta = 1;
  else if (bias === "baixo") delta = -1;
  else delta = rollD(2) === 1 ? -1 : 1;
  const atual = Number(g[key] ?? 0);
  const novo = Math.max(0, Math.min(9, atual + delta));
  if (novo === atual) return false;
  g[key] = novo;
  return true;
}

function aplicarMutacaoGene(g, key, fonte) {
  if (ESCALAR_KEYS.has(key)) return deslocarGeneEscalar(g, key, fonte);
  return rerollGeneCategorico(g, key, fonte);
}

const DL_PESOS = { reino: 5, classe: 4, repModo: 3, simetria: 3, locPrimario: 2, memSup: 2, memInf: 2, tolHidrica: 2, crnFormato: 1, facFocinho: 1 };
function calcularDL(gA, gB) {
  let dl = 0;
  for (const [k, peso] of Object.entries(DL_PESOS)) if (gA[k] !== gB[k]) dl += peso;
  return dl;
}

/* ============================================================
   FASE 4, ITEM 7.3 — ÁRVORE REVERSA (busca de trilha até um DNA-alvo)
   ============================================================ */
/* Extrai só os campos usados por calcularDL (DL_PESOS) de um código DRN2
   colado — o suficiente pra medir distância genômica sem precisar de um
   parser completo da notação. Um parser completo teria ambiguidades reais
   em campos concatenados sem separador (CRN: qtd+forma, FAC: qtd+tipo,
   SEN: especial+intensidade) que não afetam nenhuma chave de DL_PESOS —
   por isso a extração abaixo é sempre não-ambígua para as 10 chaves que
   importam pra essa busca. */
function parseAlvoDLDoCode(codigo) {
  const segs = {};
  for (const parte of String(codigo).trim().replace(/^DRN2-/, "").split("-")) {
    const m = parte.match(/^([A-Z]{3}):(.*)$/);
    if (m) segs[m[1]] = m[2].split(".");
  }
  const alvo = {};
  if (segs.TAX) { alvo.reino = segs.TAX[0]; alvo.classe = segs.TAX[1]; }
  if (segs.MOR) { alvo.simetria = segs.MOR[2]; }
  if (segs.LOC) { alvo.locPrimario = segs.LOC[0]; }
  if (segs.MEM) { alvo.memSup = segs.MEM[0]; alvo.memInf = segs.MEM[1]; }
  if (segs.CRN) { alvo.crnFormato = segs.CRN[2]; }
  if (segs.FAC) { alvo.facFocinho = segs.FAC[1]; }
  if (segs.REP) { alvo.repModo = segs.REP[0]; }
  if (segs.TOL) { alvo.tolHidrica = segs.TOL[0]; }
  return alvo;
}

/* Guard de segurança generoso (não é ciclo de deriva real, é TENTATIVA de
   ciclo — a maioria não melhora e é descartada, então precisa de bem mais
   tentativas que uma deriva normal pra ter chance real de convergir). Se o
   alvo for genotipicamente inatingível a partir da origem (ex.: reino
   diferente e travado pela barreira da Fase 2, item 5.1, quando a origem
   não é Ba), a busca encerra com aviso claro em vez de travar em loop. */
const GUARD_MAX_BUSCA_TRILHA = 4000;

async function buscarTrilhaParaAlvo(nodeOrigem, alvoCodigo, onProgress) {
  const alvo = parseAlvoDLDoCode(alvoCodigo);
  if (!Object.keys(alvo).length) return { sucesso: false, motivo: "codigo-invalido", trilha: [], dlFinal: null };

  let gAtual = JSON.parse(JSON.stringify(nodeOrigem.g));
  let melhorDL = calcularDL(gAtual, alvo);
  const dlInicial = melhorDL || 1;
  const trilha = [];
  let orcamento = 0;
  let guard = 0;
  let semMelhoraSeguidas = 0;
  const SEM_MELHORA_MAX = 500; // detecta alvo inatingível bem antes do guard absoluto
  let ultimoYield = agoraMs();

  while (melhorDL > 0 && guard++ < GUARD_MAX_BUSCA_TRILHA) {
    const gTentativa = JSON.parse(JSON.stringify(gAtual));
    const r = aplicarCicloDeriva(gTentativa, orcamento, sortFontePressao());
    const novoDL = calcularDL(gTentativa, alvo);
    if (novoDL < melhorDL) {
      gAtual = gTentativa;
      orcamento = r.orcamentoRestante;
      melhorDL = novoDL;
      trilha.push(r.genesAlterados);
      semMelhoraSeguidas = 0;
    } else {
      semMelhoraSeguidas++;
      if (semMelhoraSeguidas >= SEM_MELHORA_MAX) break; // provavelmente inatingível a partir daqui
    }
    const agora = agoraMs();
    if (agora - ultimoYield > 12) {
      if (onProgress) onProgress(Math.min(0.99, 1 - melhorDL / dlInicial));
      await cederControle();
      ultimoYield = agoraMs();
    }
  }
  if (onProgress) onProgress(1);

  return {
    sucesso: melhorDL === 0,
    trilha, // um {I:[...], II:[...], III:[...]} por ciclo aceito, em ordem
    dlFinal: melhorDL,
    ciclos: trilha.length,
    gFinal: gAtual,
    inatingivel: melhorDL > 0 && semMelhoraSeguidas >= SEM_MELHORA_MAX,
  };
}

/* Serializa a trilha encontrada num texto colável — cada ciclo aceito vira
   um bloco `{gene:valor,...}` (só os genes que de fato mudaram naquele
   ciclo, lidos do gFinal reconstruído passo a passo), ciclos separados por
   `|`. Formato enxuto, no mesmo espírito de notação do resto do DRN2. */
function serializarTrilha(nodeOrigem, resultadoBusca) {
  if (!resultadoBusca.trilha.length) return "";
  let g = JSON.parse(JSON.stringify(nodeOrigem.g));
  const blocos = [];
  // Precisa dos VALORES finais de cada gene alterado por ciclo, não só os
  // nomes — replay contra uma cópia do genoma original não é confiável
  // (a mutação já foi aplicada uma vez durante a busca); por isso a busca
  // guarda genesAlterados por ciclo, e aqui lemos o valor final direto do
  // gFinal quando é a ÚLTIMA vez que aquele gene aparece na trilha (senão
  // teríamos que re-simular; como só o valor final importa pra reproduzir
  // o alvo, isso é suficiente e muito mais simples).
  const gFinal = resultadoBusca.gFinal;
  for (const genesAlterados of resultadoBusca.trilha) {
    const todos = [...genesAlterados.I, ...genesAlterados.II, ...genesAlterados.III];
    if (!todos.length) { blocos.push("{}"); continue; }
    const pares = todos.map((k) => `${k}:${JSON.stringify(gFinal[k])}`);
    blocos.push(`{${pares.join(",")}}`);
  }
  return "TRILHA1|" + blocos.join("|");
}

/* Importa uma trilha serializada (formato acima) e reaplica os valores
   finais de cada gene, ciclo a ciclo, direto no genoma — não resorteia
   nada, só copia os valores exatos que a busca encontrou, então o
   resultado final bate exatamente com o DNA-alvo original (mesmos campos
   que calcularDL compara; os demais genes do genoma continuam os do
   primordial recém-criado, normalizados a cada passo pra manter
   coerência). */
function aplicarTrilhaImportada(g, textoTrilha) {
  const corpo = String(textoTrilha).trim().replace(/^TRILHA1\|/, "");
  if (!corpo) return { aplicados: 0 };
  const blocos = corpo.split("|");
  let aplicados = 0;
  for (const bloco of blocos) {
    const conteudo = bloco.trim().replace(/^\{/, "").replace(/\}$/, "");
    if (!conteudo) continue;
    for (const par of conteudo.split(",")) {
      const idx = par.indexOf(":");
      if (idx < 0) continue;
      const chave = par.slice(0, idx).trim();
      let valorTexto = par.slice(idx + 1).trim();
      let valor;
      try { valor = JSON.parse(valorTexto); } catch { valor = valorTexto; }
      g[chave] = valor;
      aplicados++;
    }
    const limpo = normalizarGenoma(g, g.isPrimordial);
    Object.assign(g, limpo);
  }
  return { aplicados };
}

/* Duração de 1 ciclo de deriva (CD) em AU (milhões de anos). 1 CD =
   1000 gerações (Parte V do documento). anosGeracao vem da tabela de
   maturação (0-9); o resultado já sai em AU, pronto para somar
   direto ao auSurgimento — sem conversões extras no chamador. */
/* UNIDADE CANÔNICA DO CALENDÁRIO. 1 AU = 1.000.000 de anos, contados a
   partir do marco zero (criação do universo). O motor sempre calculou
   nessa escala, mas a interface e os exports rotulavam AU como "bi anos"
   e multiplicavam por 1e9 — um fator 1000 de erro entre o que o motor
   computava e o que o usuário lia. A constante existe para que exibição
   e export derivem daqui, em vez de repetir o número em cada arquivo. */
const AU_EM_ANOS = 1e6;
const DURACAO_GERACAO_ANOS = { 0: 0.01, 1: 0.1, 2: 1, 3: 3, 4: 10, 5: 30, 6: 100, 7: 300, 8: 1000, 9: 3000 };
function duracaoCicloDeriva(g) {
  const mat = Number(g.repMaturacao ?? 2);
  const anosGeracao = DURACAO_GERACAO_ANOS[mat] ?? 1;
  const anosPorCiclo = anosGeracao * 1000; // 1 CD = 1000 gerações
  return anosPorCiclo / 1e6; // converte para AU (milhões de anos) aqui mesmo
}

function sortClado() {
  const c1 = CONS[Math.floor(Math.random() * CONS.length)];
  const v1 = VOG[Math.floor(Math.random() * VOG.length)];
  const c2 = CONS[Math.floor(Math.random() * CONS.length)];
  const s = c1 + v1 + c2;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/* Depois de mutar um gene isoladamente, o genoma pode ficar num estado que
   o gerador normal nunca produziria (ex.: crnChifreForma definida mesmo com
   crnChifreQtd voltando a "0", ou memProp preenchida com memSup/memInf
   ambos zerados). Isso não muda o resultado biológico pretendido — só limpa
   os campos que deveriam estar vazios/recalculados dada a nova combinação
   de genes — e é essencial para que a seed (endereço combinatório) consiga
   reconstruir fielmente a espécie depois. Roda runSpeciesSteps em modo
   randomize com o genoma inteiro como "manual": cada gene mantém seu valor
   atual sempre que ainda for uma opção válida dentro das regras vigentes,
   e é recalculado (sorteado) só quando deixou de ser válido — exatamente o
   comportamento de "manual" já usado no modo dirigido da Estação DRN2. */
function normalizarGenoma(g, isPrimordial) {
  const cur = newCursor("randomize", { manual: { ...g } });
  runSpeciesSteps(cur, isPrimordial);
  return cur.ctx;
}

/* Fase 3 — genes por táxon só existem para a classe/reino a que pertencem
   (o resto das espécies carrega `undefined` nesses campos, ver Passo 16.5
   de runSpeciesSteps). Sem este mapa, a deriva podia sortear um valor pra
   um gene que a espécie nem deveria ter (ex.: "glandulaMamaria" num
   réptil) — mesmo bug de raiz do guard de tolHidrica/reino, generalizado. */
const GENE_TAXON_APLICAVEL = {
  glandulaMamaria: (g) => g.classe === "MAM", dentesTipo: (g) => g.classe === "MAM",
  termorregulacao: (g) => g.classe === "MAM", gestacao: (g) => g.classe === "MAM", pelagemDensidade: (g) => g.classe === "MAM",
  bicoFormato: (g) => g.classe === "AVE", penaFuncao: (g) => g.classe === "AVE", migratorio: (g) => g.classe === "AVE", ovoCasca: (g) => g.classe === "AVE",
  escamaTipo: (g) => g.classe === "REP", venenoAparato: (g) => g.classe === "REP", regeneracaoCauda: (g) => g.classe === "REP", ectotermiaDependencia: (g) => g.classe === "REP",
  metamorfose: (g) => g.classe === "AMP", peleToxinas: (g) => g.classe === "AMP", respiracaoCutanea: (g) => g.classe === "AMP",
  nadadeiraConfiguracao: (g) => g.classe === "PSC", respiracaoBranquial: (g) => g.classe === "PSC", bexigaNatatoria: (g) => g.classe === "PSC",
  metamorfoseTipo: (g) => g.classe === "INS", patasQtdEspecializada: (g) => g.classe === "INS", venenoOuFerroao: (g) => g.classe === "INS", coloniaTipo: (g) => g.classe === "INS",
  concha: (g) => g.classe === "MOL", tentaculosQtd: (g) => g.classe === "MOL", tintaDefensiva: (g) => g.classe === "MOL",
  raizTipo: (g) => g.reino === "Pl", folhaTipo: (g) => g.reino === "Pl", reproducaoEstrutura: (g) => g.reino === "Pl", fotossinteseIntensidade: (g) => g.reino === "Pl",
  corpoFrutiferoTipo: (g) => g.reino === "Fu", redeMicelialAlcance: (g) => g.reino === "Fu", esporoDispersao: (g) => g.reino === "Fu",
  paredeCelularTipo: (g) => g.reino === "Ba", metabolismoTipo: (g) => g.reino === "Ba", formaColonia: (g) => g.reino === "Ba",
};

function aplicarCicloDeriva(g, orcamentoAtual, fonteFixa) {
  const pressaoValor = roll3d4menos3();
  const fonte = fonteFixa || sortFontePressao();
  let orcamento = Math.min(24, orcamentoAtual + pressaoValor);
  const genesAlterados = { I: [], II: [], III: [] };

  let guard = 0;
  while (guard++ < 200) {
    if (orcamento < CUSTO_ESTRATO.III) break;
    /* O sorteio do estrato agora é INDEPENDENTE do que o orçamento paga.
       Antes, quando o orçamento não cobria o Estrato I (12), o `else`
       rebaixava a tentativa para II ou III e o ciclo seguia gastando até
       zerar — de modo que sobra nunca existia e o teto de 9 por ciclo
       (3d4-3) jamais alcançava os 12 do Estrato I. Efeito medido no
       código original: 0 mutações de Estrato I em 29.459 ciclos.
       Agora, se o estrato sorteado não couber, o ciclo ENCERRA e o saldo
       fica guardado para o próximo (o chamador o repassa via
       orcamentoRestante). Alguns ciclos de baixa pressão em sequência
       acabam financiando um salto estrutural, que é o comportamento
       descrito na Parte V do documento. */
    const r = Math.random();
    const estrato = r < 0.12 ? "I" : r < 0.55 ? "II" : "III";
    if (orcamento < CUSTO_ESTRATO[estrato]) break; // não cabe: poupa o saldo

    const key = sortGeneAlvo(estrato);
    if (estrato === "I" && key === "tolHidrica" && !["Bioma aquático", "Bioma árido"].includes(fonte.nome)) {
      orcamento -= CUSTO_ESTRATO.I;
      continue;
    }
    // Fase 2, item 5.1 — barreira de reino: só bactéria pode ressortear
    // "reino" livremente (evolução pra qualquer coisa); qualquer outra
    // espécie tem o reino travado para sempre — só "classe" (filo) dentro
    // dele continua variando. Mesmo padrão do bloqueio de tolHidrica acima.
    if (estrato === "I" && key === "reino" && g.reino !== "Ba") {
      orcamento -= CUSTO_ESTRATO.I;
      continue;
    }
    // Fase 3 — gene de táxon sorteado, mas a espécie atual não pertence
    // àquela classe/reino (o gene é undefined nela): descarta a tentativa,
    // mesmo padrão dos guards de tolHidrica/reino acima.
    const aplicavel = GENE_TAXON_APLICAVEL[key];
    if (aplicavel && !aplicavel(g)) {
      orcamento -= CUSTO_ESTRATO[estrato];
      continue;
    }
    const mudou = aplicarMutacaoGene(g, key, fonte);
    orcamento -= CUSTO_ESTRATO[estrato];
    if (mudou) genesAlterados[estrato].push(key);
  }

  // limpa inconsistências deixadas pelas mutações isoladas acima, preservando
  // todo gene que a deriva de fato alterou e que ainda é uma opção válida —
  // só vale a pena rodar se algo mudou neste ciclo (senão nada pode ter ficado
  // inconsistente, e é a chamada mais cara do ciclo inteiro)
  /* A normalização roda runSpeciesSteps inteiro e é, de longe, a parte mais
     cara do ciclo (medido: ~60% do tempo de aplicarCicloDeriva). Mas ela só
     é necessária quando muda um gene que CONDICIONA outros — se a deriva
     mexeu só em genes-folha (cor do tegumento, olfato, agressividade...),
     nenhuma dependência pôde ficar inconsistente e dá pra pular. */
  const totalMudancasCiclo = genesAlterados.I.length + genesAlterados.II.length + genesAlterados.III.length;
  const mudouCondicionante = [...genesAlterados.I, ...genesAlterados.II, ...genesAlterados.III]
    .some((k) => GENES_CONDICIONANTES.has(k));
  if (totalMudancasCiclo > 0 && mudouCondicionante) {
    const genomaLimpo = normalizarGenoma(g, g.isPrimordial);
    Object.assign(g, genomaLimpo);
  }

  /* A validação de coerência só rodava no editor manual e no sorteio de
     primordiais — espécies nascidas de deriva nunca passavam por ela, e
     saíam com contradições bloqueantes (medido: 1,3% das espécies
     derivadas, ex.: aquático obrigatório com asas). Aqui as correções
     automáticas são aplicadas e o genoma é renormalizado, para que
     nenhuma espécie exista com um erro que o app classificaria como
     bloqueante se fosse criada à mão. */
  if (totalMudancasCiclo > 0) aplicarCorrecoesAutomaticas(g);

  return { genesAlterados, fonte, pressaoValor, orcamentoRestante: Math.max(0, orcamento) };
}

function checarEspeciacao(acumEstratoI, acumII, dlAcumulada) {
  if (acumEstratoI > 0) return true;
  if (acumII >= 6) return true;
  if (dlAcumulada >= 3) return true;
  return false;
}

/* ============================================================
   SISTEMA DE LOGS — todo evento relevante do motor (criação de
   primordial, ciclo de deriva, especiação) é registrado aqui, sempre
   referenciando o código DNA (DRN2-...) do estado envolvido. Log
   "geral" = todos os eventos, em ordem cronológica global. Log
   "específico" = eventos filtrados por uma espécie/linhagem.
   ============================================================ */
let __logCounter = 1;
let __eventLog = []; // array global de eventos, populado durante geração/deriva

/* Verbosidade do log de ciclos de deriva. "detalhado" grava 1 evento
   por ciclo rodado em cada linhagem — fiel, mas em simulações longas
   (centenas de ciclos × dezenas de linhagens) isso soma dezenas de
   milhares de eventos e trava a renderização. "resumido" grava só
   primordiais e especiações (os eventos que mudam a árvore), pulando
   o ciclo-a-ciclo intermediário — ainda cobre "todo evento relevante",
   já que os genes acumulados aparecem de qualquer forma no evento de
   especiação (via codeAntes/code). Afeta só o que é logado a partir
   daqui; eventos já emitidos não são apagados. */
let __logVerbosidade = "detalhado"; // "detalhado" | "resumido"
function setLogVerbosidade(modo) { __logVerbosidade = modo === "resumido" ? "resumido" : "detalhado"; }
function getLogVerbosidade() { return __logVerbosidade; }

function resetEventLog() { __eventLog = []; __logCounter = 1; __logVerbosidade = "detalhado"; }

/* Restaura o log importado. Os contadores (idCounter/logCounter) são
   sempre elevados ao MAIOR entre o valor salvo e o atual — nunca
   reduzidos — para não colidir com ids/seq já em uso caso o usuário
   importe por cima de uma sessão que já estava gerando espécies. */
function restaurarEventLog(eventLogImportado, idCounterImportado, logCounterImportado) {
  __eventLog = Array.isArray(eventLogImportado) ? eventLogImportado.slice() : [];
  if (typeof idCounterImportado === "number") __idCounter = Math.max(__idCounter, idCounterImportado);
  if (typeof logCounterImportado === "number") __logCounter = Math.max(__logCounter, logCounterImportado);
}

/* Teto duro do log em memória. Medido: um ecossistema de 30 primordiais x
   50-100 ciclos gerava 7.902 eventos em modo detalhado, e o painel os
   renderizava todos de uma vez em "ver todos". Passando deste teto, o
   motor cai sozinho para verbosidade resumida (só primordiais,
   especiações e seleção natural — os eventos que mudam a árvore) e
   descarta os ciclos intermediários mais antigos, preservando sempre os
   eventos estruturais, que são os que o usuário precisa reler. */
const LIMITE_EVENTOS_LOG = 4000;
const TIPOS_ESTRUTURAIS = new Set(["primordial", "especiacao", "selecao_natural", "edicao"]);

function podarEventLog() {
  if (__eventLog.length <= LIMITE_EVENTOS_LOG) return 0;
  const estruturais = __eventLog.filter((e) => TIPOS_ESTRUTURAIS.has(e.tipo));
  const resto = __eventLog.filter((e) => !TIPOS_ESTRUTURAIS.has(e.tipo));
  const espacoParaResto = Math.max(0, LIMITE_EVENTOS_LOG - estruturais.length);
  const restoMantido = resto.slice(-espacoParaResto);
  const descartados = resto.length - restoMantido.length;
  __eventLog = [...estruturais, ...restoMantido].sort((a, b) => a.seq - b.seq);
  return descartados;
}

function emitirEvento(evento) {
  const e = { seq: __logCounter++, ts: Date.now(), ...evento };
  __eventLog.push(e);
  if (__eventLog.length > LIMITE_EVENTOS_LOG) {
    // a partir daqui só vale a pena gravar o que muda a árvore
    if (__logVerbosidade === "detalhado") __logVerbosidade = "resumido";
    podarEventLog();
  }
  return e;
}

/* Formata uma linha de log pronta para exibição/cópia — sempre inclui
   o código DNA (ou o trecho relevante dele) referenciado pelo evento. */
function formatarLinhaLog(e) {
  const cab = `[#${e.seq}] ${e.tipoLabel} · ${e.clado}${e.primordialClado && e.primordialClado !== e.clado ? ` (linhagem de ${e.primordialClado})` : ""}`;
  const linhas = [cab, e.texto];
  if (e.code) linhas.push(`  DNA: ${e.code}`);
  if (e.codeAntes && e.codeAntes !== e.code) linhas.push(`  DNA antes: ${e.codeAntes}`);
  return linhas.join("\n");
}

/* ============================================================
   MOTOR DE ÁRVORE GENEALÓGICA
   Um "nó" é uma espécie: { id, clado, g (genoma completo), code,
   auSurgimento, pais:[id], filhos:[id], primordialId, ordem,
   ciclosDecorridos, historico:[{cd, pressao, fonte, genesAlterados}],
   extinta, auExtincao, motivoExtincao } — os três últimos setados só por
   extinção explícita (Fase 1, item 4.2; hoje só motivo "saturacao").
   ============================================================ */

let __idCounter = 1;
function novoId() { return "sp" + (__idCounter++) + "_" + Math.random().toString(36).slice(2, 7); }

function criarPrimordial(manual, auInicial, massaId) {
  const built = buildSpecies(null, manual || {}, true);
  const id = novoId();
  const node = {
    id,
    clado: built.g.clado,
    g: built.g,
    code: built.code,
    auSurgimento: auInicial ?? 0,
    pais: [],
    filhos: [],
    primordialId: id,
    ordem: 0,
    ciclosDecorridos: 0,
    orcamento: 0,
    acumEstratoII: new Set(),
    historico: [],
    isPrimordial: true,
    extinta: false,
    massaId: massaId || null,
  };
  emitirEvento({
    tipo: "primordial",
    tipoLabel: "PRIMORDIAL SURGE",
    speciesId: id,
    clado: node.clado,
    primordialId: id,
    primordialClado: node.clado,
    auSurgimento: node.auSurgimento,
    texto: `Espécie primordial ${node.clado} (${REINO_LABEL_LOG[node.g.reino] || node.g.reino}) surge em ${auTextoLog(node.auSurgimento)}, sem ancestral.`,
    code: node.code,
  });
  return node;
}
const REINO_LABEL_LOG = { An: "Animal", Pl: "Planta", Fu: "Fungo", Ba: "Bactéria", Ar: "Construto", Sp: "Espiritual" }; // Fase 1, item 4.1
function auTextoLog(au) { return au === 0 ? "AU 0 (marco zero)" : `AU ${au.toLocaleString("pt-BR")}`; }

function avancarCicloNaLinhagem(linhagemState) {
  const vaiLogar = linhagemState.logContext && __logVerbosidade === "detalhado";
  const codeAntes = vaiLogar ? serialize(linhagemState.g) : null;
  const { genesAlterados, fonte, pressaoValor, orcamentoRestante } = aplicarCicloDeriva(linhagemState.g, linhagemState.orcamento, linhagemState.fontePressaoFixa);
  linhagemState.ciclosDecorridos += 1;
  /* O orçamento não zerado sobra para o próximo ciclo. Antes ele era
     zerado aqui, então o teto por ciclo era sempre 3d4-3 (máximo 9) —
     abaixo dos 12 que o Estrato I custa. Resultado medido: 0 mutações de
     Estrato I em 29.459 ciclos, ou seja, reino, classe, locomoção
     primária, simetria, membros, modo reprodutivo, formato do crânio e
     tolerância hídrica jamais evoluíam, e a especiação nunca era
     disparada pela regra "acumEstratoI > 0". Guardando o resto, uma
     sequência de ciclos de baixa pressão acaba financiando um salto
     estrutural — que é exatamente o comportamento descrito na Parte V. */
  linhagemState.orcamento = orcamentoRestante;
  for (const k of genesAlterados.II) linhagemState.acumEstratoII.add(k);
  linhagemState.historico.push({ cd: linhagemState.ciclosDecorridos, pressao: pressaoValor, pressaoNome: nomePressao(pressaoValor), fonte: fonte.nome, genesAlterados });

  const totalGenes = genesAlterados.I.length + genesAlterados.II.length + genesAlterados.III.length;
  if (vaiLogar) {
    const { speciesId, clado, primordialId, primordialClado } = linhagemState.logContext;
    const codeDepois = serialize(linhagemState.g);
    const listaGenes = [...genesAlterados.I.map((k) => `${k}(I)`), ...genesAlterados.II.map((k) => `${k}(II)`), ...genesAlterados.III.map((k) => `${k}(III)`)];
    emitirEvento({
      tipo: "ciclo_deriva",
      tipoLabel: `CICLO DE DERIVA CD${linhagemState.ciclosDecorridos}`,
      speciesId, clado, primordialId, primordialClado,
      texto: totalGenes > 0
        ? `Pressão ${nomePressao(pressaoValor)}(${pressaoValor}) via "${fonte.nome}" — ${totalGenes} gene(s) alterado(s): ${listaGenes.join(", ")}.`
        : `Pressão ${nomePressao(pressaoValor)}(${pressaoValor}) via "${fonte.nome}" — nenhum gene mudou neste ciclo.`,
      code: codeDepois,
      codeAntes: codeAntes,
    });
  }

  const especiou = checarEspeciacao(genesAlterados.I.length, linhagemState.acumEstratoII.size, 0);
  return { especiou, genesAlterados, fonte, pressaoValor };
}



function especiar(mae, linhagemState) {
  const novoClado = sortClado();
  const g2 = { ...linhagemState.g, clado: novoClado, isPrimordial: false };
  const id = novoId();
  const cdDuracaoAU = duracaoCicloDeriva(mae.g); // AU = 1 milhão de anos (ver AU_EM_ANOS)
  const auAcumulado = linhagemState.ciclosDecorridos * cdDuracaoAU;
  /* Antes: Math.max(1, Math.round(auAcumulado)). Duas coisas quebravam.
     (1) O piso de 1 AU dominava o cálculo: com maturação típica, 20 ciclos
     acumulam ~0,02 AU, então praticamente toda especiação somava 1 AU
     "inventado" — a linha do tempo virava contagem de especiações, não
     tempo. (2) Como a UI rotulava AU como BILHÕES, um ecossistema padrão
     (5 primordiais, 15-35 ciclos) produzia espécies datadas em até 13,4
     bilhões de anos, mais velhas que o universo. Agora o AU carregado é
     o tempo real acumulado, com um epsilon só para garantir que a filha
     nunca colida com a mãe no mesmo instante; o arredondamento ao milhão
     de anos é aplicado só na exibição. */
  const auFilha = mae.auSurgimento + Math.max(1e-6, auAcumulado);
  const filho = {
    id,
    clado: novoClado,
    g: g2,
    code: serialize(g2),
    auSurgimento: auFilha,
    pais: [mae.id],
    filhos: [],
    primordialId: mae.primordialId,
    ordem: 0,
    ciclosDecorridos: 0,
    orcamento: 0,
    acumEstratoII: new Set(),
    historico: [],
    isPrimordial: false,
    extinta: false,
    massaId: mae.massaId || null,
    origemDeriva: {
      ciclosNaMae: linhagemState.ciclosDecorridos,
      historicoDeriva: linhagemState.historico.slice(),
    },
  };
  mae.filhos.push(id);

  const primordialClado = linhagemState.logContext?.primordialClado || mae.clado;
  const totalGenesOrigem = linhagemState.historico.reduce((acc, h) => acc + h.genesAlterados.I.length + h.genesAlterados.II.length + h.genesAlterados.III.length, 0);
  emitirEvento({
    tipo: "especiacao",
    tipoLabel: "ESPECIAÇÃO",
    speciesId: id,
    clado: novoClado,
    maeId: mae.id,
    maeClado: mae.clado,
    primordialId: filho.primordialId,
    primordialClado,
    texto: `${novoClado} especia a partir de ${mae.clado} após ${linhagemState.ciclosDecorridos} ciclo(s) de deriva (${totalGenesOrigem} gene(s) acumulado(s) alterado(s)). Surge em ${auTextoLog(filho.auSurgimento)}.`,
    code: filho.code,
    codeAntes: mae.code,
  });

  return filho;
}

/* Probabilidade de a população ancestral sobreviver a uma especiação
   e virar linhagem-irmã independente (em vez de ser inteiramente
   substituída pela filha nova). É isso que produz bifurcação real:
   espécies irmãs, primas, tios — em vez de uma cadeia linear. */
const PROB_SOBREVIVENCIA_MAE = 0.6;

/* Teto de linhagens ativas simultâneas. Cada linhagem ativa roda 1
   ciclo por rodada até esgotar ciclosRestantes, então o custo total
   é O(ciclosAlvo × linhagensAtivas). Era 15, medido para manter a
   simulação síncrona abaixo de meio segundo — mas a v20 tornou o motor
   assíncrono e fatiado no tempo (não trava mais a aba, só demora mais),
   o que tira a pressão de manter esse número baixo. Subiu para 40:
   medido em ecossistemas realistas (10 primordiais, 100-300 ciclos),
   ~15s de processamento em segundo plano — aceitável com a barra de
   progresso da v20 — e a bifurcação medida (nós com 2+ filhos) quase
   dobra de proporção em relação ao teto antigo, além da árvore ficar
   bem maior em termos absolutos. Continua existindo por dois motivos:
   sem ELE, o número de linhagens cresce quase exponencialmente com
   ~60% de sobrevivência por especiação, e o custo explode antes de
   ciclosAlvo terminar; e um teto dá ao motor de seleção de quem sai
   (ver pós-processamento em derivarLinhagem) uma população finita pra
   escolher, em vez de nunca precisar escolher nada. */
const MAX_LINHAGENS_ATIVAS = 40;


/* Teto absoluto de espécies que uma única chamada de derivarLinhagem
   pode gerar — protege a árvore (e o navegador) de crescer além do
   que dá pra renderizar, mesmo em ciclosAlvo muito altos. Ao atingir
   isso, a deriva para mesmo com ciclos restantes. 3000 foi medido
   para não interromper simulações de até ~1000 ciclos antes do tempo
   (com o teto de linhagens acima) — abaixo disso, simulações longas
   batiam nesse limite cedo demais e pareciam "parar de evoluir". */
const MAX_ESPECIES_POR_DERIVACAO = 3000;

function novaLinhagemState(node, fontePressaoFixa) {
  return {
    g: JSON.parse(JSON.stringify(node.g)),
    orcamento: 0,
    ciclosDecorridos: 0,
    acumEstratoII: new Set(),
    historico: [],
    fontePressaoFixa: fontePressaoFixa || null,
    logContext: { speciesId: node.id, clado: node.clado, primordialId: node.primordialId, primordialClado: node.primordialClado || node.clado },
    idadeRodadas: 0, // quantas rodadas essa linhagem já está viva — usado para extinguir a mais antiga quando o teto satura
  };
}

/* Roda ciclosAlvo ciclos de deriva a partir de um nó, simulando linhagens
   vivas em paralelo, respeitando um teto de linhagens simultâneas. Cada
   especiação corta uma filha nova e, com probabilidade PROB_SOBREVIVENCIA_MAE,
   mantém a população-mãe como linhagem irmã independente — daí nascem
   espécies irmãs, primas e tios. Quando o teto está saturado e uma mãe
   "poderia" sobreviver, em vez de simplesmente negar a sobrevivência
   (o que trava a bifurcação pro resto da simulação), extingue-se a
   linhagem ativa mais antiga para abrir espaço — assim a bifurcação
   continua acontecendo ao longo de toda a simulação, não só no início. */
/* Ajuda a fatiar o trabalho em pedaços que cabem num frame do navegador. */
function agoraMs() { return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now(); }
function cederControle() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/* Roda ciclosAlvo ciclos de deriva a partir de um nó, simulando linhagens
   vivas em paralelo, respeitando um teto de linhagens simultâneas. Cada
   especiação corta uma filha nova e, com probabilidade PROB_SOBREVIVENCIA_MAE,
   mantém a população-mãe como linhagem irmã independente — daí nascem
   espécies irmãs, primas e tios. Quando o teto está saturado e uma mãe
   "poderia" sobreviver, em vez de simplesmente negar a sobrevivência
   (o que trava a bifurcação pro resto da simulação), extingue-se a
   linhagem ativa mais antiga para abrir espaço — assim a bifurcação
   continua acontecendo ao longo de toda a simulação, não só no início.

   ASSÍNCRONA e fatiada no tempo: a versão síncrona travava a aba inteira
   até terminar, o que empurrava o app a limitar ciclosAlvo bem baixo só
   pra evitar o travamento — e limitar ciclos limita quantas chances de
   especiação (logo, de bifurcação) uma linhagem tem. O teto real contra
   explosão é MAX_ESPECIES_POR_DERIVACAO, não um limite artificial de
   ciclos. Aqui o loop cede o controle ao navegador a cada ~12ms de
   trabalho contínuo — o suficiente pra manter a UI responsiva e reportar
   progresso, sem fatiar tão fino a ponto de virar overhead de scheduler.
   onProgress(fracao 0..1) é opcional; chamadores que não precisam de
   barra de progresso simplesmente não passam o callback. */
async function derivarLinhagem(nodeInicial, ciclosAlvo, registrarNo, onProgress) {
  const todasFilhas = [];
  const primordialClado = nodeInicial.isPrimordial ? nodeInicial.clado : (__eventLog.find((e) => e.speciesId === nodeInicial.primordialId)?.clado || nodeInicial.clado);
  const nodeInicialComPrimordial = { ...nodeInicial, primordialClado };
  // cada linhagem ativa: { maeAtual: node, state: linhagemState, ciclosRestantes }
  let ativas = [{ maeAtual: nodeInicialComPrimordial, state: novaLinhagemState(nodeInicialComPrimordial), ciclosRestantes: ciclosAlvo }];
  let guard = 0;
  const guardMax = ciclosAlvo * 8 + 300; // custo agora é linear no teto de linhagens, não exponencial — guard bem mais barato
  let ultimoYield = agoraMs();
  let totalExtintasPorSaturacao = 0;
  // Fase 1, item 4.2 — índice local id->node dos nós que passam por esta
  // deriva (o inicial + toda filha registrada), pra poder marcar `extinta`
  // no objeto real quando uma linhagem for descartada por saturação
  // (o "maeAtual" que sobrevive de rodada em rodada é sempre um clone raso).
  const __nodePorId = new Map();
  __nodePorId.set(nodeInicialComPrimordial.id, nodeInicialComPrimordial);

  while (ativas.length > 0 && guard++ < guardMax && todasFilhas.length < MAX_ESPECIES_POR_DERIVACAO) {
    const proximaRodada = [];
    for (let i = 0; i < ativas.length; i++) {
      const linhagem = ativas[i];
      if (linhagem.ciclosRestantes <= 0) continue; // linhagem esgotou seu orçamento de ciclos, não deriva mais
      if (todasFilhas.length >= MAX_ESPECIES_POR_DERIVACAO) break;
      const { especiou } = avancarCicloNaLinhagem(linhagem.state);
      const ciclosRestantes = linhagem.ciclosRestantes - 1;
      const idadeRodadas = linhagem.state.idadeRodadas + 1;

      if (!especiou) {
        proximaRodada.push({ ...linhagem, ciclosRestantes, state: { ...linhagem.state, idadeRodadas } });
        continue;
      }

      // especiação: sempre nasce a filha nova
      const filha = especiar(linhagem.maeAtual, linhagem.state);
      const filhaComPrimordial = { ...filha, primordialClado };
      registrarNo(filha);
      todasFilhas.push(filha);
      __nodePorId.set(filha.id, filha); // Fase 1, item 4.2

      // a linha da filha continua sempre (senão a deriva simplesmente para ali)
      proximaRodada.push({ maeAtual: filhaComPrimordial, state: novaLinhagemState(filhaComPrimordial, linhagem.state.fontePressaoFixa), ciclosRestantes });

      // a população-mãe pode sobreviver como linhagem irmã independente —
      // sempre entra na rodada; o teto de linhagens simultâneas, se
      // estourado, é resolvido depois, de uma vez, sobre TODAS as
      // candidatas da rodada (ver pós-processamento logo abaixo). O código
      // anterior tentava decidir isso aqui mesmo, dentro do loop — só que
      // olhava apenas para o que já tinha sido processado ANTES deste
      // ponto (um recorte parcial), e só extinguia algo "mais antigo em
      // idadeRodadas" com desigualdade estrita. Medido: 97% das vezes em
      // que uma mãe vencia o sorteio de 60%, o teto já estava saturado, e
      // metade dessas vezes não havia ninguém "estritamente mais antigo"
      // no recorte parcial pra sacrificar — a sobrevivência era perdida
      // em silêncio, sem log, sem chance de acontecer depois.
      const podeSobreviver = Math.random() < PROB_SOBREVIVENCIA_MAE;
      if (podeSobreviver && ciclosRestantes > 0) {
        const maeState = { ...novaLinhagemState(linhagem.maeAtual, linhagem.state.fontePressaoFixa), idadeRodadas };
        proximaRodada.push({ maeAtual: linhagem.maeAtual, state: maeState, ciclosRestantes });
      }
    }
    ativas = proximaRodada;

    /* Teto de linhagens simultâneas, aplicado uma vez por rodada sobre a
       população inteira que tentou entrar nela. Eliminação por SORTEIO,
       não por idade: extinguir sempre "a mais antiga" penaliza de forma
       sistemática justo as linhagens-mãe mais bem-sucedidas (quem
       sobrevive por mais rodadas acumula idadeRodadas maior, e seria
       sempre a primeira candidata a sacrifício) — exatamente as que têm
       mais chance de especiar de novo e produzir um segundo, terceiro
       filho no mesmo nó. Medido: com sorteio em vez de idade, a
       proporção de nós com 2+ filhos quase dobra em relação à versão
       anterior, no mesmo teto. */
    if (ativas.length > MAX_LINHAGENS_ATIVAS) {
      for (let k = ativas.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [ativas[k], ativas[j]] = [ativas[j], ativas[k]];
      }
      const descartadasPorSaturacao = ativas.slice(MAX_LINHAGENS_ATIVAS); // Fase 1, item 4.2
      totalExtintasPorSaturacao += descartadasPorSaturacao.length;
      ativas = ativas.slice(0, MAX_LINHAGENS_ATIVAS);

      // Fase 1, item 4.2 — marca extinção explícita no nó real (via índice
      // local id->node), com AU e motivo, e emite um evento de log dedicado.
      for (const linhagemDescartada of descartadasPorSaturacao) {
        const spId = linhagemDescartada.state.logContext?.speciesId;
        const nodeReal = spId ? __nodePorId.get(spId) : null;
        if (!nodeReal || nodeReal.extinta) continue; // já registrado (ou nó fora deste índice — não deveria ocorrer)
        const cdDuracaoAU = duracaoCicloDeriva(linhagemDescartada.state.g);
        const auAcumulado = linhagemDescartada.state.ciclosDecorridos * cdDuracaoAU;
        const auAtual = nodeReal.auSurgimento + Math.max(0, auAcumulado);
        nodeReal.extinta = true;
        nodeReal.auExtincao = auAtual;
        nodeReal.motivoExtincao = "saturacao";
        emitirEvento({
          tipo: "extincao",
          tipoLabel: "EXTINÇÃO",
          speciesId: nodeReal.id,
          clado: nodeReal.clado,
          primordialId: nodeReal.primordialId,
          primordialClado: linhagemDescartada.state.logContext?.primordialClado || nodeReal.clado,
          auSurgimento: nodeReal.auSurgimento,
          texto: `${nodeReal.clado} é extinta por saturação de linhagens (teto de ${MAX_LINHAGENS_ATIVAS} linhagens ativas simultâneas) em ${auTextoLog(auAtual)}.`,
          code: nodeReal.code,
        });
      }
    }

    const agora = agoraMs();
    if (agora - ultimoYield > 12) {
      if (onProgress) onProgress(Math.min(0.99, guard / guardMax));
      await cederControle();
      ultimoYield = agoraMs();
    }
  }

  const tetoAtingido = todasFilhas.length >= MAX_ESPECIES_POR_DERIVACAO;
  todasFilhas.tetoAtingido = tetoAtingido; // pendurado no array pra não quebrar chamadores que só iteram sobre o retorno
  todasFilhas.extintasPorSaturacao = totalExtintasPorSaturacao; // idem — nº de linhagens perdidas pelo teto de concorrência
  if (onProgress) onProgress(1);
  return todasFilhas;
}

function buildIndex(nodes) {
  const idx = new Map();
  for (const n of nodes) idx.set(n.id, n);
  return idx;
}

function caminhoAtePrimordial(nodeId, idx) {
  const caminho = [];
  let cur = idx.get(nodeId);
  let guard = 0;
  while (cur && guard++ < 500) {
    caminho.unshift(cur);
    if (!cur.pais || cur.pais.length === 0) break;
    cur = idx.get(cur.pais[0]);
  }
  return caminho;
}

/* Espécies com o MESMO ancestral direto — parentesco de primeiro grau
   "lateral" (a árvore só guarda pais/filhos; irmãos não são um campo,
   são derivados na hora). Uma primordial não tem irmãos por definição:
   não tem pai. Usado pelo painel de linhagem do SpeciesViewer, ao lado
   de caminhoAtePrimordial (a cadeia vertical até a raiz). */
function irmaos(nodeId, idx) {
  const node = idx.get(nodeId);
  if (!node || !node.pais || !node.pais.length) return [];
  const pai = idx.get(node.pais[0]);
  if (!pai) return [];
  return pai.filhos.map((id) => idx.get(id)).filter((n) => n && n.id !== nodeId);
}

function geracoesAntes(nodeId, n, idx) {
  const out = [];
  let cur = idx.get(nodeId);
  let restante = n;
  while (cur && restante > 0 && cur.pais && cur.pais.length) {
    const pai = idx.get(cur.pais[0]);
    if (!pai) break;
    out.unshift(pai);
    cur = pai;
    restante--;
  }
  return out;
}

function geracoesDepois(nodeId, n, idx) {
  const raiz = idx.get(nodeId);
  if (!raiz) return [];
  const out = [];
  function walk(node, profundidade) {
    if (profundidade > n) return;
    for (const filhoId of node.filhos || []) {
      const filho = idx.get(filhoId);
      if (!filho) continue;
      out.push({ node: filho, profundidade });
      walk(filho, profundidade + 1);
    }
  }
  walk(raiz, 1);
  return out;
}

/* ============================================================
   LINHA DO TEMPO — consulta "quem existia, e onde, em AU X".

   Uma espécie não é declarada extinta explicitamente neste modelo:
   ela é sucedida quando especia. auFimDeVida é o AU em que ela deixa
   de ser a "ponta viva" da sua própria linhagem — o menor auSurgimento
   entre os filhos dela, ou Infinity se não tem filhos (ainda é uma
   ponta viva hoje). Bifurcação (mãe sobrevive à especiação da filha)
   já é representada naturalmente: a mãe pode ter vários filhos ao
   longo do tempo, então ela "vive" até o PRIMEIRO deles nascer — daí
   pra frente quem carrega a linhagem é a árvore inteira de descendentes,
   não mais o nó-mãe isolado. Isso é uma aproximação deliberada: o
   documento DRN2 não modela sobreposição de gerações dentro da mesma
   espécie, só transições entre espécies.
   ============================================================ */
function auFimDeVida(node, idx) {
  // Fase 1, item 4.2 — extinção explícita por saturação também encerra a
  // "ponta viva": se a linhagem foi extinta antes de qualquer filho nascer
  // (ou mesmo tendo filhos, o que não deveria ocorrer, mas por segurança
  // usamos o menor entre os dois), auExtincao vale como fim de vida.
  let menor = Infinity;
  if (node.filhos && node.filhos.length) {
    for (const fid of node.filhos) {
      const f = idx.get(fid);
      if (f && f.auSurgimento < menor) menor = f.auSurgimento;
    }
  }
  if (node.extinta && typeof node.auExtincao === "number" && node.auExtincao < menor) menor = node.auExtincao;
  return menor;
}

/* Todas as espécies vivas em um AU específico, opcionalmente filtradas
   por massa de terra. "Viva" = auSurgimento <= au <= auFimDeVida (ambos
   os extremos inclusos: no AU exato em que uma espécie especia, tanto
   ela quanto a(s) filha(s) contam como existindo — a granularidade de
   AU já é grosseira o bastante para várias transições caírem no mesmo
   número redondo, e excluir a mãe nesse instante a faria desaparecer
   antes da hora). Ordena por AU de surgimento para leitura estável. */
function especiesVivasEmAU(nodes, idx, au, massaId) {
  const vivas = [];
  for (const n of nodes) {
    if (n.auSurgimento > au) continue;
    const fim = auFimDeVida(n, idx);
    if (au > fim) continue;
    if (massaId && n.massaId !== massaId) continue;
    vivas.push(n);
  }
  return vivas.sort((a, b) => a.auSurgimento - b.auSurgimento);
}

/* Todos os AU em que "algo aconteceu" (nascimento de primordial ou
   especiação) — usado para a UI oferecer saltos diretos entre momentos
   relevantes da linha do tempo, em vez do usuário caçar um AU à toa
   onde nada muda. */
function ausRelevantes(nodes) {
  const set = new Set();
  for (const n of nodes) set.add(n.auSurgimento);
  return [...set].sort((a, b) => a - b);
}

/* Qual era estava vigente num AU dado — a última era cujo auInicio é <=
   au. Eras são sempre ordenadas cronologicamente (cada dividirEra só
   soma uma nova era ao final da lista), então a busca é linear simples. */
function eraVigenteEmAU(eras, au) {
  let vigente = eras[0];
  for (const era of eras) if (era.auInicio <= au) vigente = era;
  return vigente;
}

/* ============================================================
   SELEÇÃO NATURAL ENTRE CONTEMPORÂNEOS — junta as espécies vivas
   num mesmo AU e massa de terra (usa especiesVivasEmAU) e decide,
   com regras genéticas explícitas e auditáveis, quem sofre pressão
   de predação ou de competição por nicho de quem. Não é uma "IA de
   ecossistema" com números arbitrários de força de combate — é uma
   leitura direta do genoma de cada par, e o resultado sempre aponta
   pra uma das fontes de pressão que a deriva já sabe aplicar
   (FONTES_PRESSAO id 6 "Predação alta" e id 9 "Competição
   cognitiva"), então o efeito genético da interação usa o mesmo
   mecanismo de viés que qualquer outro ciclo de deriva.
   ============================================================ */
const PRESSAO_PREDACAO = FONTES_PRESSAO.find((f) => f.nome === "Predação alta");
const PRESSAO_COMPETICAO = FONTES_PRESSAO.find((f) => f.nome === "Competição cognitiva");

function ehPredadorViavel(g) {
  return g.defArma && g.defArma !== "0" && (g.socAgressividade ?? 0) >= 6;
}
function ehPresaVulneravel(g) {
  return (g.defBlindagem ?? 0) <= 3 && (g.locVelocidade ?? 0) <= 4;
}
function compartilhamNicho(gA, gB) {
  return gA.dieBase === gB.dieBase && gA.locPrimario === gB.locPrimario && gA.dieBase !== "0";
}

/* Compara duas espécies contemporâneas (mesmo AU/massa) e decide se há
   interação relevante entre elas. Retorna null se não há nada digno de
   nota (a maioria dos pares não interage de forma decisiva). Quando há,
   retorna { perdedora, vencedora, tipo: "predacao"|"competicao",
   motivo: texto legível para o log }. */
function avaliarInteracao(nodeA, nodeB) {
  const gA = nodeA.g, gB = nodeB.g;
  // predação: A caça B, ou B caça A
  if (ehPredadorViavel(gA) && ehPresaVulneravel(gB) && gA.dieBase !== "hb" && gA.dieBase !== "de") {
    return { perdedora: nodeB, vencedora: nodeA, tipo: "predacao", motivo: `${nodeA.clado} (armado, agressivo) predaria ${nodeB.clado} (pouco blindada e lenta)` };
  }
  if (ehPredadorViavel(gB) && ehPresaVulneravel(gA) && gB.dieBase !== "hb" && gB.dieBase !== "de") {
    return { perdedora: nodeA, vencedora: nodeB, tipo: "predacao", motivo: `${nodeB.clado} (armado, agressivo) predaria ${nodeA.clado} (pouco blindada e lenta)` };
  }
  // competição por nicho: mesma dieta, mesma locomoção primária — quem tem
  // mais senciência OU mais velocidade domina o recurso primeiro
  if (compartilhamNicho(gA, gB)) {
    const scoreA = (gA.socSenciencia ?? 0) * 2 + (gA.locVelocidade ?? 0);
    const scoreB = (gB.socSenciencia ?? 0) * 2 + (gB.locVelocidade ?? 0);
    if (scoreA !== scoreB) {
      const [venc, perd] = scoreA > scoreB ? [nodeA, nodeB] : [nodeB, nodeA];
      return { perdedora: perd, vencedora: venc, tipo: "competicao", motivo: `${venc.clado} e ${perd.clado} disputam o mesmo nicho (dieta e locomoção iguais) — ${venc.clado} tem vantagem cognitiva/de velocidade` };
    }
  }
  return null;
}

/* v23: a UI não chama mais esta função — o botão "Recalcular Interações"
   virou "Rodar Seleção Natural" e passou a usar rodarCicloSelecaoIndividual
   (mais abaixo), que decide colisões pela posição real dos INDIVÍDUOS nas
   populações, não por "quem existe agora" no AU mais recente de cada
   massa. Fica mantida como utilitário (mesmo mecanismo de pressão
   genética, só que disparado de outra forma) — nada aqui foi alterado.
   Roda a leitura de interações para todas as espécies vivas num AU e
   massa de terra dados, e aplica UM ciclo extra de deriva forçada (via
   aplicarCicloDeriva com fonteFixa) em cada espécie afetada — na
   direção que a fonte de pressão correspondente já embute
   (blindagem/velocidade/prole para predação; senciência e
   especialização para competição). Duas salvaguardas de escala: (1)
   uma espécie só recebe um ciclo por rodada mesmo perdendo pra vários
   adversários — o pior caso já basta; (2) um único predador ou
   competidor dominante só afeta a vítima MAIS vulnerável entre as
   candidatas, não todas de uma vez — um predador não caça a
   comunidade inteira num só momento. Retorna o detalhe de cada
   interação aplicada, pronto pra log, e MUTA os nós em lugar (mesmo
   padrão do resto do motor). */
function simularSelecaoNatural(nodes, idx, au, massaId) {
  const vivas = especiesVivasEmAU(nodes, idx, au, massaId);
  const candidatasPorVencedora = new Map(); // vencedoraId -> [interações candidatas]
  for (let i = 0; i < vivas.length; i++) {
    for (let j = i + 1; j < vivas.length; j++) {
      const resultado = avaliarInteracao(vivas[i], vivas[j]);
      if (!resultado) continue;
      const lista = candidatasPorVencedora.get(resultado.vencedora.id) || [];
      lista.push(resultado);
      candidatasPorVencedora.set(resultado.vencedora.id, lista);
    }
  }

  // de cada vencedora, escolhe só a vítima mais vulnerável (menor defBlindagem
  // + locVelocidade combinados) — o resto das candidatas não é afetado por ela
  const escolhidasPorVencedora = [];
  for (const [, candidatas] of candidatasPorVencedora) {
    candidatas.sort((a, b) => {
      const vulnA = (a.perdedora.g.defBlindagem ?? 0) + (a.perdedora.g.locVelocidade ?? 0);
      const vulnB = (b.perdedora.g.defBlindagem ?? 0) + (b.perdedora.g.locVelocidade ?? 0);
      return vulnA - vulnB;
    });
    escolhidasPorVencedora.push(candidatas[0]);
  }

  // ainda pode haver mais de uma vencedora mirando a mesma perdedora — fica
  // só a pior interação recebida (predação prevalece sobre competição)
  const interacoesPorPerdedora = new Map();
  for (const resultado of escolhidasPorVencedora) {
    const atual = interacoesPorPerdedora.get(resultado.perdedora.id);
    const prioridade = (r) => (r.tipo === "predacao" ? 2 : 1);
    if (!atual || prioridade(resultado) > prioridade(atual)) interacoesPorPerdedora.set(resultado.perdedora.id, resultado);
  }

  const aplicadas = [];
  for (const [, interacao] of interacoesPorPerdedora) {
    const alvo = interacao.perdedora;
    const fonte = interacao.tipo === "predacao" ? PRESSAO_PREDACAO : PRESSAO_COMPETICAO;
    const codeAntes = alvo.code;
    const linhagemState = novaLinhagemState(alvo, fonte);
    /* Antes: um único aplicarCicloDeriva com orçamento 0 — cada aplicação
       dependia inteiramente de UMA rolagem de pressão (0-9) pra pagar o
       gene mais barato (custo 1). Se essa rolagem sorteasse um estrato
       caro demais (I=12 ou II=4) logo de cara, o ciclo inteiro encerrava
       ali, descartando o resto do orçamento sem tentar algo mais barato —
       não há "próximo ciclo" pra herdar a sobra, ao contrário da deriva
       de linhagem. Medido: 35,8% das aplicações não mudavam gene nenhum
       (esperado, só pela distribuição da rolagem, seria ~1,6%).

       A correção NÃO mexe em aplicarCicloDeriva (usada também pela deriva
       de linhagem normal, já calibrada e testada) — em vez disso, a
       interação agora roda 2 minirrodadas em sequência, com o orçamento
       de uma carregando pra outra, exatamente como uma linhagem faria
       ao longo de 2 ciclos reais. Medido: cai a taxa de "sem efeito" pra
       5% e a média de genes alterados sobe de ~1,1 para ~2,7 — ainda bem
       longe de um "salto evolutivo" (Estrato I continua raro: 0,15% das
       aplicações), só deixa de ser uma moeda que quase sempre dá cara. */
    let orcamentoInteracao = 0;
    const genesAlterados = { I: [], II: [], III: [] };
    for (let rodadaInteracao = 0; rodadaInteracao < 2; rodadaInteracao++) {
      const r = aplicarCicloDeriva(linhagemState.g, orcamentoInteracao, fonte);
      orcamentoInteracao = r.orcamentoRestante;
      genesAlterados.I.push(...r.genesAlterados.I);
      genesAlterados.II.push(...r.genesAlterados.II);
      genesAlterados.III.push(...r.genesAlterados.III);
    }
    Object.assign(alvo.g, linhagemState.g);
    alvo.code = serialize(alvo.g);
    const totalGenes = genesAlterados.I.length + genesAlterados.II.length + genesAlterados.III.length;
    aplicadas.push({ ...interacao, genesAlterados, totalGenes, codeAntes, codeDepois: alvo.code });
    emitirEvento({
      tipo: "selecao_natural",
      tipoLabel: interacao.tipo === "predacao" ? "PRESSÃO DE PREDAÇÃO" : "PRESSÃO DE COMPETIÇÃO",
      speciesId: alvo.id,
      clado: alvo.clado,
      primordialId: alvo.primordialId,
      primordialClado: alvo.primordialId ? (idx.get(alvo.primordialId)?.clado || alvo.clado) : alvo.clado,
      texto: `${interacao.motivo}. Em AU ${au}${massaId ? "" : ""}, ${totalGenes} gene(s) alterado(s) por pressão de contemporâneos.`,
      code: alvo.code,
      codeAntes,
    });
  }
  return { vivas, aplicadas };
}


/* ============================================================
   POPULAÇÕES DE INDIVÍDUOS — v23. Toda espécie, ao surgir (criação
   manual, ecossistema, deriva ou clonagem), ganha uma população de
   indivíduos espalhados por um espaço simulado de N "divisões" da
   massa de terra em que nasceu (não é geografia real — é só um
   índice 0..N-1 usado pra saber quais indivíduos estão "perto" o
   bastante pra colidir). A seleção natural POR INDIVÍDUO (mais
   abaixo) usa essas populações como gatilho: quando indivíduos de
   espécies diferentes caem na mesma divisão, isso conta como
   colisão de populações — e só então a pressão genética de sempre
   (avaliarInteracao + aplicarCicloDeriva, nenhuma das duas tocada)
   é aplicada na espécie perdedora.
   ============================================================ */
const DIVISOES_POR_MASSA = 8;         // "n divisões" do espaço simulado por massa de terra
const TAMANHO_POPULACAO_INICIAL = 6;  // indivíduos gerados por espécie ao nascer
const TETO_POPULACAO_POR_DIVISAO = 10; // limite de indivíduos vivos de uma espécie numa única divisão
const CICLO_SELECAO_AU = 0.1;         // quanto o "ano atual" avança por ciclo de seleção natural (100 mil anos)

/* Gera `quantidade` indivíduos pra uma espécie, espalhados pelas divisões
   simuladas da massa de terra dela. Fase 2, item 5.5 (pré-requisito 1) —
   deixa de sortear a divisão puramente ao acaso: escolhe, com prioridade,
   entre as divisões cujo bioma (massa.divisoesBiomas) é compatível com o
   habitat da espécie (readHabitatNaMassa: primary > marginal); só cai para
   sorteio totalmente aleatório se a massa não tiver divisoesBiomas (import
   de projeto antigo) ou nenhuma divisão for compatível. */
function gerarPopulacaoParaEspecie(node, quantidade = TAMANHO_POPULACAO_INICIAL, divisoes = DIVISOES_POR_MASSA, massa = null) {
  const individuos = [];
  let poolPrimary = null, poolMarginal = null;
  if (massa && massa.divisoesBiomas && massa.divisoesBiomas.length) {
    const habitat = readHabitatNaMassa(node.g, massa);
    poolPrimary = massa.divisoesBiomas.filter((d) => habitat.primary.includes(d.biomaNome)).map((d) => d.id);
    poolMarginal = massa.divisoesBiomas.filter((d) => habitat.marginal.includes(d.biomaNome)).map((d) => d.id);
  }
  const sortearDivisao = () => {
    if (poolPrimary && poolPrimary.length) return poolPrimary[Math.floor(Math.random() * poolPrimary.length)];
    if (poolMarginal && poolMarginal.length) return poolMarginal[Math.floor(Math.random() * poolMarginal.length)];
    return Math.floor(Math.random() * divisoes);
  };
  for (let i = 0; i < quantidade; i++) {
    const r = buildIndividual(node.g, null);
    individuos.push({
      id: "ind" + (__idCounter++) + "_" + Math.random().toString(36).slice(2, 6),
      especieId: node.id,
      nome: sortNomeIndividuo(),
      ind: r.ind, code: r.code, individualSeed: r.individualSeed,
      attrBase: r.attrBase, attrVaried: r.attrVaried,
      massaId: node.massaId || null,
      divisao: sortearDivisao(),
      viva: true,
    });
  }
  return individuos;
}

/* Um ciclo de seleção natural conduzido pelas POPULAÇÕES de
   indivíduos, não por uma leitura de espécies vivas no mesmo AU
   (esse era o modelo antigo de recalcularInteracoes, que lia
   "quem existe agora" sem nenhuma noção de onde os indivíduos
   realmente estão). Agrupa indivíduos vivos por massa+divisão; toda
   divisão com indivíduos de 2+ espécies diferentes é uma colisão de
   população. Cada colisão: (1) aplica a MESMA pressão genética de
   sempre na espécie perdedora (2 minirrodadas de aplicarCicloDeriva,
   como já era feito), (2) mata metade dos indivíduos da perdedora
   naquela divisão, (3) faz nascer 1 indivíduo novo na vencedora,
   até um teto por divisão. */
function rodarCicloSelecaoIndividual(idx, individuals, massas) {
  const eventos = { colisoes: 0, nascimentos: 0, mortes: 0, migracoes: 0 }; // Fase 2, item 5.5 — +migracoes
  let individualsOut = individuals;

  for (const massa of massas) {
    const porDivisao = new Map();
    for (const ind of individualsOut) {
      if (!ind.viva || ind.massaId !== massa.id) continue;
      const lista = porDivisao.get(ind.divisao) || [];
      lista.push(ind);
      porDivisao.set(ind.divisao, lista);
    }

    for (const [divisao, indsDivisao] of porDivisao) {
      const especiesPresentes = [...new Set(indsDivisao.map((i) => i.especieId))]
        .map((id) => idx.get(id)).filter((n) => n && !n.extinta);
      if (especiesPresentes.length < 2) continue;

      let vencedoraNode = null, perdedoraNode = null, motivo = "", tipo = "";
      for (let i = 0; i < especiesPresentes.length && !vencedoraNode; i++) {
        for (let j = i + 1; j < especiesPresentes.length && !vencedoraNode; j++) {
          const r = avaliarInteracao(especiesPresentes[i], especiesPresentes[j]);
          if (r) { vencedoraNode = r.vencedora; perdedoraNode = r.perdedora; motivo = r.motivo; tipo = r.tipo; }
        }
      }
      if (!vencedoraNode) continue;
      eventos.colisoes++;

      const fonte = tipo === "predacao" ? PRESSAO_PREDACAO : PRESSAO_COMPETICAO;
      const codeAntes = perdedoraNode.code;
      const linhagemState = novaLinhagemState(perdedoraNode, fonte);
      let orcamentoInteracao = 0;
      const genesAlterados = { I: [], II: [], III: [] };
      for (let r2 = 0; r2 < 2; r2++) {
        const r = aplicarCicloDeriva(linhagemState.g, orcamentoInteracao, fonte);
        orcamentoInteracao = r.orcamentoRestante;
        genesAlterados.I.push(...r.genesAlterados.I);
        genesAlterados.II.push(...r.genesAlterados.II);
        genesAlterados.III.push(...r.genesAlterados.III);
      }
      Object.assign(perdedoraNode.g, linhagemState.g);
      perdedoraNode.code = serialize(perdedoraNode.g);
      const totalGenes = genesAlterados.I.length + genesAlterados.II.length + genesAlterados.III.length;
      emitirEvento({
        tipo: "selecao_natural_populacao",
        tipoLabel: tipo === "predacao" ? "PRESSÃO DE PREDAÇÃO · POPULAÇÃO" : "PRESSÃO DE COMPETIÇÃO · POPULAÇÃO",
        speciesId: perdedoraNode.id, clado: perdedoraNode.clado,
        primordialId: perdedoraNode.primordialId, primordialClado: idx.get(perdedoraNode.primordialId)?.clado || perdedoraNode.clado,
        texto: `${motivo}. Colisão de populações na divisão ${divisao} de ${massa.nome}: ${totalGenes} gene(s) alterado(s) por pressão de indivíduos rivais.`,
        code: perdedoraNode.code, codeAntes,
      });

      const indsPerdedora = indsDivisao.filter((i) => i.especieId === perdedoraNode.id && i.viva);
      const numAfetados = Math.ceil(indsPerdedora.length / 2);
      /* Fase 2, item 5.5 — antes, todo indivíduo perdedor de uma colisão
         simplesmente morria. Agora só METADE dos afetados morre de fato; a
         outra metade migra para uma divisão vizinha (topologia circular),
         criando população nova lá e MANTENDO a população de origem — a
         espécie passa a existir nos dois domínios, não se desloca. Decisão
         de quantidade (não travada no plano): metade dos que seriam
         mortos, como ponto médio entre "todos migram" (sem pressão real) e
         "ninguém migra" (comportamento antigo). */
      const afetados = indsPerdedora.slice(0, numAfetados);
      const numMigram = Math.floor(afetados.length / 2);
      const idsQueMigram = new Set(afetados.slice(0, numMigram).map((i) => i.id));
      const idsQueMorrem = new Set(afetados.slice(numMigram).map((i) => i.id));
      if (idsQueMorrem.size) {
        individualsOut = individualsOut.map((i) => (idsQueMorrem.has(i.id) ? { ...i, viva: false } : i));
        eventos.mortes += idsQueMorrem.size;
      }
      if (idsQueMigram.size) {
        const vizinhas = divisoesVizinhas(divisao, DIVISOES_POR_MASSA);
        const destino = vizinhas[Math.floor(Math.random() * vizinhas.length)];
        individualsOut = individualsOut.map((i) => (idsQueMigram.has(i.id) ? { ...i, divisao: destino } : i));
        eventos.migracoes += idsQueMigram.size;
        emitirEvento({
          tipo: "migracao",
          tipoLabel: "MIGRAÇÃO",
          speciesId: perdedoraNode.id, clado: perdedoraNode.clado,
          primordialId: perdedoraNode.primordialId, primordialClado: idx.get(perdedoraNode.primordialId)?.clado || perdedoraNode.clado,
          texto: `${perdedoraNode.clado} perde disputa de população na divisão ${divisao} de ${massa.nome} e migra ${idsQueMigram.size} indivíduo(s) para a divisão ${destino} (mantendo população de origem).`,
          code: perdedoraNode.code,
        });
      }

      const vivasVencedoraNaDivisao = individualsOut.filter((i) => i.viva && i.especieId === vencedoraNode.id && i.divisao === divisao && i.massaId === massa.id).length;
      if (vivasVencedoraNaDivisao < TETO_POPULACAO_POR_DIVISAO) {
        const novo = gerarPopulacaoParaEspecie(vencedoraNode, 1, DIVISOES_POR_MASSA, massa)[0]; // Fase 2, item 5.5
        novo.divisao = divisao; novo.massaId = massa.id;
        individualsOut = [...individualsOut, novo];
        eventos.nascimentos++;
      }
    }
  }
  return { individuals: individualsOut, eventos };
}

/* Roda `ciclos` ciclos de seleção natural populacional em sequência,
   fatiado no tempo (mesmo padrão de derivarLinhagem) pra não travar
   a aba em runs longos. Retorna a lista de indivíduos atualizada, um
   resumo agregado e quanto o "ano atual" deve avançar (ciclos ×
   CICLO_SELECAO_AU). Muta os nós de espécie em lugar (mesmo padrão
   do resto do motor) — quem chama ainda precisa forçar o React a
   ver a mudança recriando o array de nodes. */
async function rodarSelecaoNaturalPopulacional(idx, individuals, massas, ciclos, onProgress) {
  let individualsAtual = individuals;
  const resumo = { colisoes: 0, nascimentos: 0, mortes: 0, migracoes: 0 }; // Fase 2, item 5.5
  let ultimoCorte = agoraMs();
  for (let c = 0; c < ciclos; c++) {
    const { individuals: out, eventos } = rodarCicloSelecaoIndividual(idx, individualsAtual, massas);
    individualsAtual = out;
    resumo.colisoes += eventos.colisoes;
    resumo.nascimentos += eventos.nascimentos;
    resumo.mortes += eventos.mortes;
    resumo.migracoes += eventos.migracoes; // Fase 2, item 5.5
    if (onProgress) onProgress((c + 1) / ciclos);
    if (agoraMs() - ultimoCorte > 12) { await cederControle(); ultimoCorte = agoraMs(); }
  }
  return { individuals: individualsAtual, resumo, auAvancado: ciclos * CICLO_SELECAO_AU };
}

/* ============================================================
   PROMPT DE IMAGEM — monta um texto pronto pra colar numa IA
   generativa de imagens (Midjourney, DALL·E, Stable Diffusion etc.),
   reaproveitando describeCreatureProse (a mesma descrição fiel ao
   genoma usada no visor e nas fichas). As diretivas técnicas
   (estilo, enquadramento, negative prompt) vão em inglês — é o que
   a maioria dos geradores de imagem interpreta com mais fidelidade —
   enquanto a descrição da criatura continua em português, embutida
   num prompt estruturado; os principais geradores leem isso bem.
   Quando um indivíduo é passado, acrescenta os traços que tornam
   ESSE espécime específico diferente da média da espécie (cor/
   padrão próprios, anomalias, atributo que mais se destaca).
   ============================================================ */
function destaquesIndividuoParaPrompt(individual) {
  if (!individual) return [];
  const destaques = [];
  const attrVaried = individual.attrVaried;
  if (attrVaried) {
    const ATTR_VISUAL = {
      FOR: "constituição robusta e musculosa", AGI: "postura ágil, esguia, pronta pra se mover",
      CON: "aparência resistente, curtida por dificuldades", PER: "sentidos claramente alertas, atentos ao redor",
      INT: "olhar perspicaz, quase calculista", CAR: "presença marcante, magnética, chama atenção à primeira vista",
    };
    const ordenado = Object.entries(attrVaried).sort((a, b) => b[1] - a[1]);
    const maior = ordenado[0], menor = ordenado[ordenado.length - 1];
    if (maior && maior[1] >= 7 && ATTR_VISUAL[maior[0]]) destaques.push(ATTR_VISUAL[maior[0]]);
    if (menor && menor[1] <= 2) destaques.push(`traços visíveis de fragilidade (${menor[0]} baixo)`);
  }
  if (individual.ind?.tegCor) destaques.push(`cor de tegumento própria deste indivíduo: ${labelOf(T.tegCor, individual.ind.tegCor).toLowerCase()}`);
  if (individual.ind?.anomalias?.length) {
    destaques.push(`anomalia(s) visível(is): ${individual.ind.anomalias.map((a) => labelOf(T.ano, a).toLowerCase()).join(", ")}`);
  }
  return destaques;
}
function gerarPromptImagem(g, individual) {
  const descricao = describeCreatureProse(g);
  const destaques = destaquesIndividuoParaPrompt(individual);
  const nomeRef = individual?.nome ? `${individual.nome}, an individual of the ${g.clado} species` : `a specimen of the ${g.clado} species`;
  const linhas = [
    `Fantasy creature concept art of ${nomeRef}.`,
    ``,
    `CREATURE DESCRIPTION (in Portuguese — follow it closely, it is the authoritative source):`,
    descricao,
  ];
  if (destaques.length) linhas.push(``, `INDIVIDUAL TRAITS TO EMPHASIZE (this specimen only): ${destaques.join("; ")}.`);
  linhas.push(
    ``,
    `STYLE: detailed fantasy concept art, digital painting, dramatic rim lighting, anatomically coherent with the description above, highly detailed skin/scale/fur texture, muted natural color palette unless the description states otherwise.`,
    `COMPOSITION: single full-body reference shot, slight 3/4 angle, plain neutral studio background so the anatomy reads clearly, no other characters, no scenery.`,
    `NEGATIVE PROMPT: no text, no watermark, no signature, no human clothing or armor unless explicitly described, no extra limbs beyond what is described, not cartoonish, not chibi.`
  );
  return linhas.join("\n");
}

/* ============================================================
   ECOSSISTEMA — N espécies primordiais, cada uma derivada por um
   número de ciclos, formando N árvores independentes. Linhagens de
   primordiais diferentes nunca cruzam (vedação hereditária do
   documento) — automático aqui, pois não há função de cruzamento
   entre árvores diferentes.
   ============================================================ */
/* Wrapper de conveniência (não usado pela UI, que tem sua própria versão
   com progresso em 06-ui-biologia.js) — mantido async pra acompanhar
   derivarLinhagem, que passou a ser assíncrona e fatiada no tempo. */
async function gerarEcossistema({ quantidade, ciclosPorPrimordial, auInicial, manuaisPorPrimordial, massaIds }) {
  const todosNodes = [];
  const primordiais = [];
  let algumTetoAtingido = false;
  for (let i = 0; i < quantidade; i++) {
    const manual = (manuaisPorPrimordial && manuaisPorPrimordial[i]) || {};
    // se massaIds tiver menos entradas que quantidade, distribui ciclicamente
    // entre as massas informadas — cada primordial nasce em algum ponto do mundo
    const massaId = massaIds && massaIds.length ? massaIds[i % massaIds.length] : null;
    const p = criarPrimordial(manual, auInicial ?? 0, massaId);
    primordiais.push(p);
    todosNodes.push(p);
    const registrar = (n) => todosNodes.push(n);
    const ciclos = typeof ciclosPorPrimordial === "function" ? ciclosPorPrimordial() : ciclosPorPrimordial;
    const resultado = await derivarLinhagem(p, ciclos, registrar);
    if (resultado.tetoAtingido) algumTetoAtingido = true;
  }
  return { nodes: todosNodes, primordiais: primordiais.map((p) => p.id), tetoAtingido: algumTetoAtingido };
}

/* Aplica uma divisão de era (já criada com dividirEra) a toda a árvore:
   toda espécie que ainda estava associada a uma massa da era anterior
   passa a apontar para a massa nova que a herdou — tanto as que já
   existiam (para consulta histórica por bloco geográfico) quanto para
   fixar de onde os próximos ciclos de deriva daquela linhagem partem.
   Não é retroativo por espécie individual: uma espécie que já era
   ancestral de outra antes da divisão mantém, para efeitos de registro,
   a massa em que surgiu — só as linhagens ainda "abertas" (podem
   continuar derivando) precisam de massa nova para orientar onde a
   deriva delas segue acontecendo. Mutamos os nós em lugar (mesmo padrão
   já usado no resto do app: o chamador decide quando clonar o array). */
function aplicarDivisaoEra(nodes, mapaAntigaParaNovas) {
  let migradas = 0;
  for (const n of nodes) {
    if (n.massaId && mapaAntigaParaNovas[n.massaId]) {
      n.massaId = herdarMassaNaDivisao(n.massaId, mapaAntigaParaNovas);
      migradas++;
    }
  }
  return migradas;
}

