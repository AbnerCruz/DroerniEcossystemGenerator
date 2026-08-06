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
/* v28, otimização — recorte único por (tabela × restrições).

   Antes existiam DOIS caches paralelos, `validNumbers` e `validIndex`, e
   `categoricalStep` consultava os dois a cada gene. Cada consulta remontava
   a chave do zero com `slice().sort().join()` sobre restrict e exclude —
   três alocações de string por consulta, duas consultas por gene, ~90 genes
   por chamada de runSpeciesSteps, duas chamadas por buildSpecies. Eram
   ~1.000 strings descartadas por espécie gerada, só pra localizar dados que
   já estavam em memória.

   Agora é um recorte só, com a lista de números e o índice valor→posição no
   mesmo objeto, e uma única construção de chave. O caso mais comum (nenhuma
   restrição) tem atalho: a chave é só o id da tabela, sem concatenar nada.

   A lógica de recorte em si não mudou — só a contabilidade em volta. */
const __recorteCache = new Map();

function chaveRecorte(table, opts) {
  const id = tableId(table);
  if (!opts) return id;
  const r = opts.restrict, e = opts.exclude;
  if (!r && !e) return id;
  const rs = r ? (r.length > 1 ? r.slice().sort().join(",") : r[0]) : "";
  const es = e ? (e.length > 1 ? e.slice().sort().join(",") : e[0]) : "";
  return id + "|" + rs + "|" + es;
}

function recorteTabela(table, opts) {
  const chave = chaveRecorte(table, opts);
  let hit = __recorteCache.get(chave);
  if (hit) return hit;
  const nums = [];
  for (let n = 1; n <= 100; n++) {
    const label = pick(table, n).value;
    if (opts && opts.restrict && !opts.restrict.includes(label)) continue;
    if (opts && opts.exclude && opts.exclude.includes(label)) continue;
    nums.push(n);
  }
  Object.freeze(nums);
  const idx = new Map();
  for (let i = 0; i < nums.length; i++) {
    const v = pick(table, nums[i]).value;
    if (!idx.has(v)) idx.set(v, { n: nums[i], i });
  }
  hit = { nums, idx };
  __recorteCache.set(chave, hit);
  return hit;
}

/* Fachadas — chamadas de vários pontos do motor e de fora dele. */
function validNumbers(table, opts) { return recorteTabela(table, opts).nums; }
function validIndex(table, opts) { return recorteTabela(table, opts).idx; }

// 3d4-3: enumera as 64 triplas de dados possíveis; TRIPLES[i] = soma (0..9)
const TRIPLES = (() => { const a = []; for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) for (let z = 0; z < 4; z++) a.push(x + y + z); return a; })();
const __scalarDomainCache = new Map();
function scalarDomainIdx(min = 0, max = 9) {
  return scalarDomainInfo(min, max).idxs;
}

/* v32, otimização — o domínio escalar guarda, além da lista de índices,
   duas coisas que antes eram recalculadas por VARREDURA a cada gene:

     - `valido(v)`: antes era `domain.some(di => TRIPLES[di] === Number(v))`,
       uma passada linear por até 64 entradas, executada para cada um dos
       ~25 genes escalares, a cada normalização de genoma. Medido no
       profiler: era a linha mais quente do motor inteiro (922 de ~3.000
       amostras dentro de normalizarGenoma). Como TRIPLES cobre exatamente
       os inteiros 0..9, "estar no domínio" é só um teste de intervalo.

     - `posPorValor`: o modo `encode` fazia `domain.find(...)` seguido de
       `domain.indexOf(pos)` — duas varreduras encadeadas pelo mesmo motivo.
       O mapa devolve exatamente o mesmo índice (a posição do PRIMEIRO di
       cujo TRIPLES bate), então a seed continua idêntica bit a bit.

   Nada aqui muda a semântica: é a mesma resposta, sem a varredura. */
function scalarDomainInfo(min = 0, max = 9) {
  const chave = min + ":" + max;
  const hit = __scalarDomainCache.get(chave);
  if (hit) return hit;
  const idxs = [];
  const posPorValor = new Map();
  TRIPLES.forEach((sum, i) => {
    if (sum >= min && sum <= max) {
      if (!posPorValor.has(sum)) posPorValor.set(sum, idxs.length);
      idxs.push(i);
    }
  });
  Object.freeze(idxs);
  const info = { idxs, posPorValor, min, max };
  __scalarDomainCache.set(chave, info);
  return info;
}

/* v32, otimização — conjunto (Set) dos VALORES válidos de uma tabela sob um
   recorte, cacheado na mesma chave do recorte. Vários pontos do motor
   montavam `new Set(validNumbers(t, o).map(n => pick(t, n).value))` na mão,
   dentro de runSpeciesSteps — ou seja, alocavam um Set novo e varriam a
   tabela a cada normalização. Agora o Set é construído uma vez por
   (tabela × restrições) e reaproveitado. */
const __valoresCache = new Map();
function valoresValidos(table, opts) {
  const chave = chaveRecorte(table, opts);
  let hit = __valoresCache.get(chave);
  if (hit) return hit;
  hit = new Set(recorteTabela(table, opts).nums.map((n) => pick(table, n).value));
  __valoresCache.set(chave, hit);
  return hit;
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
  /* v28 — um único recorte cacheado carrega a lista de números E o índice
     valor→posição; antes eram duas consultas com duas chaves reconstruídas. */
  let recorte = recorteTabela(table, opts);
  if (recorte.nums.length === 0 && opts.restrict) recorte = recorteTabela(table, { restrict: opts.restrict }); // exclusão engoliu tudo: a restrição vence
  if (recorte.nums.length === 0 && opts.exclude) recorte = recorteTabela(table, { exclude: opts.exclude });
  const nums = recorte.nums;
  if (nums.length === 0) { cur.ctx[key] = table[0].value; return table[0].value; }
  const base = BigInt(nums.length);
  const idxValores = recorte.idx;
  let value;
  if (cur.mode === "randomize") {
    if (cur.manual[key] !== undefined && idxValores.has(cur.manual[key])) {
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
    if (cur.manual[key] !== undefined && idxValores.has(cur.manual[key])) {
      value = cur.manual[key];
    } else {
      const idx = Number(cur.seed % base); cur.seed /= base;
      value = pick(table, nums[idx]).value;
    }
  } else { // encode
    value = cur.ctx[key];
    const achado = idxValores.get(value);
    const idx = BigInt(achado ? achado.i : 0);
    cur.outValue += idx * cur.outMult; cur.outMult *= base;
  }
  cur.ctx[key] = value;
  return value;
}

/* ---------- passos de gene escalar (3d4-3) ---------- */
function scalarStep(cur, key, opts = {}) {
  const info = scalarDomainInfo(opts.min ?? 0, opts.max ?? 9);
  const domain = info.idxs;
  const base = BigInt(domain.length);
  let value;
  if (cur.mode === "randomize") {
    // um valor manual fora do domínio atual (ex.: a deriva deixou locVelocidade=7
    // numa espécie que depois virou séssil, min:0/max:0) não pode ser aceito como
    // está — cai no sorteio normal dentro do domínio válido, senão a inconsistência
    // se propaga e a seed nunca mais reconstrói fielmente esse gene.
    const bruto = cur.manual[key];
    const manualValido = bruto !== undefined && info.posPorValor.has(Number(bruto));
    if (manualValido) value = Number(bruto);
    else if (opts.bias === "high") value = TRIPLES[domain[Math.max(...[0, 1].map(() => Math.floor(Math.random() * domain.length)))]];
    else if (opts.bias === "low") value = TRIPLES[domain[Math.min(...[0, 1].map(() => Math.floor(Math.random() * domain.length)))]];
    else value = TRIPLES[domain[Math.floor(Math.random() * domain.length)]];
  } else if (cur.mode === "decode") {
    if (cur.manual[key] !== undefined) value = Number(cur.manual[key]);
    else { const idx = Number(cur.seed % base); cur.seed /= base; value = TRIPLES[domain[idx]]; }
  } else {
    value = cur.ctx[key];
    const idx = BigInt(info.posPorValor.get(value) ?? 0);
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
    memApendices: { fixed: "0X" }, // v29 — tetrápode não tem apêndice locomotor extra
    memTerm: { restrict: ["pa", "gr", "ca", "mo", "ba"] },
    repModo: { restrict: ["vv", "oz"] },
    tegTipo: { restrict: ["Pe", "Cr"] },
    asaTipo: { restrict: ["mb"] }, // Fase 1, item 4.3 — membranosa, única coerente com pelo/couro (tipo morcego)
    asaQtd: { restrict: [0, 2] }, // v29 — a asa É o par de membros superiores: no máximo um par
    crnFormato: { exclude: ["0"] },
    facFocinho: { exclude: ["bi", "mn", "tu"] },
    facOrelha: { exclude: ["an", "mb"] },
  },
  AVE: { // ave: bípede ou voadora, pena, bico sem dente, duas asas, ovípara
    locPrimario: { restrict: ["V", "B", "N", "P"] },
    memSup: { fixed: "0S" },
    memInf: { fixed: "2I" },
    memApendices: { fixed: "0X" }, // v29
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
  REP: { // réptil: escama, ovíparo, crânio ossificado — asa liberada (v29, pedido do usuário: dragão)
    locPrimario: { restrict: ["Q", "S", "N", "E", "C", "B", "V", "P"] }, // v29 — V/P (voo/planeio) entram para o réptil alado poder ter voo como modo primário
    // sem esta trava, 3,14% dos répteis nasciam sem crânio definido — e daí
    // saíam as combinações contraditórias reportadas (réptil sem crânio com
    // presas). MAM/AVE/PSC/INS/MOL já travavam crnFormato; REP e AMP não.
    crnFormato: { exclude: ["0", "hu"] },
    memSup: { restrict: ["0S", "2S"] },
    memApendices: { fixed: "0X" }, // v29
    memTerm: { restrict: ["gr", "pa", "ba", "no"] },
    repModo: { restrict: ["ov", "oz"] },
    tegTipo: { restrict: ["Es", "Cr"] },
    facFocinho: { exclude: ["tr", "mn", "an"] },
    facOrelha: { restrict: ["in", "rd"] },
    /* v29 — liberada a pedido do usuário: o único tipo coerente com escama/
       couro é membrana (pterossauro, wyvern) — pena e élitro pertencem a
       plano corporal de ave e inseto.
       v31 — REP é a única classe com asa INDEPENDENTE do orçamento de
       pernas/braços (ver CLASSES_ASA_INDEPENDENTE): pode sair wyvern (asa
       no lugar do braço, 4 membros) ou dragão ocidental (4 pernas + par de
       asas, 6 membros) — exceção mitológica deliberada, pedida pelo
       usuário. O teto de 1 par de asas continua valendo (asaQtd via
       T.asaQtd, sem restrict extra aqui — a classe não limita quantidade,
       só tipo). Cap de 1 par aqui mesmo, pelo mesmo motivo do mamífero:
       sem isso a tabela permite 4/6/8 asas (uma hidra alada), que não é o
       que foi pedido. */
    asaTipo: { restrict: ["mb"] },
    asaQtd: { restrict: [0, 2] },
    cdaTipo: { restrict: ["es", "nu", "pr", "lm"] },
  },
  AMP: { // anfíbio: pele mucosa, ovíparo, ligado à água, crânio ossificado
    locPrimario: { restrict: ["Q", "S", "N", "B", "E"] },
    crnFormato: { exclude: ["0", "hu"] },
    memSup: { restrict: ["0S", "2S"] },
    memApendices: { fixed: "0X" }, // v29
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
    memApendices: { restrict: ["0X", "2X"] }, // v29 — barbilhões, não membros
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
    memApendices: { restrict: ["0X", "2X", "4X"] }, // v29 — tentáculos têm gene próprio
    memTerm: { restrict: ["ve", "no"] },
    repModo: { restrict: ["ov", "oz"] },
    tegTipo: { restrict: ["Mu", "Cs", "Cn"] },
    crnFormato: { restrict: ["0", "am", "ch"] },
    asaQtd: { fixed: 0 },
    cdaTipo: { restrict: ["nu", "bq"] },
  },
};

/* v29 — teto de membros LOCOMOTORES (superiores + inferiores) por classe.
   Vertebrado tetrápode: quatro, e ponto — se as pernas são quatro, não há
   par superior; se são duas, cabem dois braços. Ave gasta o par superior
   nas asas (memSup já é fixo 0S). Peixe não tem membro (só barbatanas, que
   são terminação, não membro). Artrópode e molusco têm planos corporais com
   mais membros, daí o teto de oito. Classes fora desta tabela (VEG, FUN,
   MIC) não têm membro nenhum por trava de reino. */
const ORCAMENTO_MEMBROS = { MAM: 4, AVE: 4, REP: 4, AMP: 4, PSC: 0, INS: 8, MOL: 8 };
const CLASSES_TETRAPODES = new Set(["MAM", "AVE", "REP", "AMP"]);
/* v31 — pedido explícito do usuário: dragão OCIDENTAL, 4 pernas + 2 asas
   (hexápode). Nenhum vertebrado real tem esse plano corporal — toda asa de
   vertebrado é o par de membros superiores modificado, por isso o teto de
   4 membros "ao todo" da v29. O dragão ocidental é justamente a exceção
   mitológica clássica a essa regra (é o argumento biológico mais comum
   contra a existência de dragões "de verdade"), e só ele: a asa deixa de
   consumir o orçamento de pernas/braços exclusivamente para a classe REP,
   virando um SEXTO membro à parte. Isso não afeta MAM/AVE/AMP — para eles
   a asa continua sendo o braço modificado. Dentro de REP, os dois planos
   corporais coexistem: locPrimario V/S + memInf 2I ainda sai wyvern (asa
   substituindo o braço, 4 membros no total); locPrimario Q + memInf 4I com
   asa dá o dragão ocidental (6 membros no total). Qual dos dois sai depende
   do sorteio — quem quer garantir um ou outro define locPrimario e asaQtd
   manualmente. */
const CLASSES_ASA_INDEPENDENTE = new Set(["REP"]);

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
  /* v28 — simetria por reino. Bilateral saía em 78% de TUDO, inclusive
     bactéria e planta: um cocobacilo bilateral e uma árvore bilateral são
     leituras erradas do próprio conceito. Bactéria é radial/esférica ou
     amorfa; planta e fungo crescem em torno de um eixo (radial), com espiral
     e amorfo possíveis. Bilateral fica com o reino animal, que é onde ela
     descreve alguma coisa. */
  categoricalStep(cur, "simetria", T.simetria, opcoesCategoricas(g, "simetria"));

  /* v28 — PORTE POR REINO. Antes a tabela de porte era única e o reino não
     entrava na conta: bactéria sorteava "titânico" em 3% dos casos, e o
     modelo de peso traduzia isso em 45 metros de altura e 31.894 TONELADAS.
     A mediana de uma bactéria era 175 kg. Uma bactéria é um organismo
     unicelular: o porte dela varre micrômetros, não metros.
     A escala real (ALTURA_POR_PORTE_REINO, em 02-coerencia.js) passou a ser
     por reino, e aqui restringimos quais degraus cada reino alcança:
     - Ba: só os dois degraus menores (na escala microbiana, "mn" a "pq" já
       cobre de 0,2µm a 20µm, que é a faixa real inteira mais folga fantástica)
     - Pl/Fu: excluído "tt" — a escala vegetal já leva "cl" a ~90m, altura de
       sequoia; um degrau acima disso não descreve mais uma planta */
  const portePorReino = opcoesCategoricas(g, "porte");
  const porteBias = g.tolTermica === "fr" ? ["gr", "cl", "tt"] : g.tolTermica === "qt" ? ["mn", "pq"] : undefined;
  categoricalStep(cur, "porte", T.porte, mergeOpts({ bias: porteBias }, portePorReino));
  const porteRow = T.porte.find((r) => r.value === g.porte);

  /* v28 — DENSIDADE POR REINO. O escalar 0-9 mapeava para 50 a 7000 kg/m³:
     o topo é densidade de FERRO, e o piso é mais leve que cortiça. Nenhum
     tecido vivo chega perto de nenhum dos dois. A tabela nova (02-coerencia)
     ficou realista, e aqui limitamos a faixa que cada reino alcança:
     - Ba: célula é essencialmente água (5-6 na escala nova)
     - Pl: de madeira balsa a madeira densa, sem chegar a osso/mineral
     - Fu: corpo de frutificação é 85-90% água, sempre leve
     - An: faixa inteira (gordura/pulmão até osso e concha mineralizada) */
  scalarStep(cur, "densidade", limitesEscalar(g, "densidade"));
  /* v28 — forma de crescimento coerente com o porte. Uma roseta/suculenta é
     compacta por definição, e a compacidade entra no cálculo de volume: uma
     "roseta" de porte colossal (90 m) saía com 23.182 toneladas, dez vezes
     uma sequoia. Acima de porte médio, uma planta só se sustenta com forma
     arbórea, arbustiva, de talo ou trepadeira. */
  /* v28 — tentei travar morForma pelo porte (uma "rosácea" de 90 m saía com
     30.909 toneladas). Mas `morForma` é Estrato I e `porte` não é: a deriva
     mudava o porte e a normalização era obrigada a mexer num gene de Estrato
     I, quebrando a regra de que Estrato I só muda por especiação. A restrição
     foi movida para o MODELO DE MASSA (fatorForma, em 02-coerencia.js), que
     limita a fração de volume ocupada quando a altura é grande — é uma
     afirmação sobre geometria, não uma trava genética, e não toca no genoma. */
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
  /* v28 — bactéria natante ganhava velocidade até 9, mesmo escalar de um
     felino. A escala é relativa ao porte, mas o valor alto sugeria
     capacidade de deslocamento que uma célula flagelada não tem. */
  scalarStep(cur, "locVelocidade", g.locPrimario === "F" ? { min: 0, max: 0 } : limitesEscalar(g, "locVelocidade"));

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
  /* v29 — ORÇAMENTO TOTAL DE MEMBROS POR PLANO CORPORAL.
     memSup e memInf eram decididos de forma independente: memInf derivava
     da locomoção primária (quadrúpede => 4I) e memSup era sorteado dentro
     da trava da classe (0S ou 2S), sem nenhum teto comum. O resultado
     medido: répteis quadrúpedes com 4 membros inferiores + 2 superiores
     (+ apêndices auxiliares) — um tetrápode com oito membros. Não era
     ambiguidade de redação: o genoma tinha mesmo os oito.
     Aqui o total passa a ser limitado pelo plano corporal: tetrápode tem
     QUATRO membros ao todo, e se as pernas já são quatro não sobra par
     superior. Não consome dígito de seed — é derivação determinística a
     partir de genes já codificados, e é idempotente (reaplicar sobre o
     genoma corrigido não muda nada), então a seed continua reconstruindo
     a mesma espécie. */
  const numMembros = (v) => Number(String(v).replace(/[SIX]/g, "")) || 0;
  const orcamentoMembros = ORCAMENTO_MEMBROS[g.classe];
  if (orcamentoMembros !== undefined) {
    /* Voo/planeio como locomoção PRIMÁRIA num tetrápode implica o plano
       corporal alado: par superior virou asa, e sobram no máximo duas
       pernas. Resolvido aqui (Passo 6) e não no passo da asa, para que a
       asa possa ser concedida sem reescrever membro depois. */
    if (CLASSES_TETRAPODES.has(g.classe) && !CLASSES_ASA_INDEPENDENTE.has(g.classe) && (g.locPrimario === "V" || g.locPrimario === "P")) {
      g.memSup = "0S";
      if (numMembros(g.memInf) > 2) g.memInf = "2I";
    }
    const inf2 = numMembros(g.memInf), sup2 = numMembros(g.memSup);
    if (inf2 + sup2 > orcamentoMembros) {
      const supPermitido = Math.max(0, orcamentoMembros - inf2);
      g.memSup = supPermitido >= 8 ? "8S" : supPermitido >= 6 ? "6S" : supPermitido >= 4 ? "4S" : supPermitido >= 2 ? "2S" : "0S";
    }
  }

  categoricalStep(cur, "memApendices", [{ max: 75, value: "0X" }, { max: 90, value: "2X" }, { max: 96, value: "4X" }, { max: 99, value: "6X" }, { max: 100, value: "8X" }], mergeOpts((g.reino === "Pl" || g.reino === "Fu" || g.reino === "Ba") ? { fixed: "0X" } : g.isPrimordial ? { restrict: ["0X", "2X"] } : {}, classeOpts(g, "memApendices"))); // Fase 1, item 4.1 + v29 (trava por classe)
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
  const locPrimValidos = valoresValidos(T.locPrim, mergeOpts(locOpts, classeOpts(g, "locPrimario"))); // v32 — Set cacheado
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
  const locSecValidos = valoresValidos(T.locSec, mergeOpts(locSecOpts, locSecClasseAjustada)); // v32 — Set cacheado (não mutar: "0" é testado à parte)
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
  /* v28 — MODO DE REPRODUÇÃO POR REINO. Medido na v27: 54% das PLANTAS
     saíam ovíparas e 13% por gemação-de-animal — uma árvore botando ovo.
     Ovíparo, vivíparo e ovovivíparo descrevem exclusivamente o reino animal;
     planta, fungo e bactéria se reproduzem por esporo, gemação, fissão ou
     assexuadamente. A trava sai da mesma tabela que a deriva consulta, senão
     a deriva reintroduz o problema logo no primeiro ciclo. */
  categoricalStep(cur, "repModo", T.repModo, mergeOpts(mergeOpts(repOpts, classeOpts(g, "repModo")), opcoesCategoricas(g, "repModo")));
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
  /* v32 — a bactéria ganha "ft" (fotossíntese) além de decomposição e
     quimiossíntese. Cianobactéria é bactéria fotossintética de verdade, e a
     ausência dessa opção era justamente o que deixava `metabolismoTipo`
     (que JÁ sorteava fotossíntese) contradizendo a dieta na mesma ficha. */
  else if (g.reino === "Ba") dieOpts = { restrict: ["de", "qm", "ft"] };
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
  /* v29 — a ASA entra no orçamento de membros do tetrápode: ela É o par de
     membros superiores modificado (morcego, pterossauro, ave), não um quinto
     e sexto membro pendurado no mesmo tronco. Então só há asa se o par
     superior estiver livre (0S) e as pernas couberem no que sobra do teto de
     quatro. A trava fica AQUI, na asa (Estrato II), e não no membro (Estrato
     I): assim um ciclo de deriva barato nunca reescreve o plano corporal de
     graça — para virar alado, a linhagem primeiro tem que pagar a mudança
     estrutural nos membros. */
  if (CLASSES_TETRAPODES.has(g.classe) && g.classe !== "AVE" && !CLASSES_ASA_INDEPENDENTE.has(g.classe)) {
    const supAtual = Number(String(g.memSup).replace("S", "")) || 0;
    const infAtual = Number(String(g.memInf).replace("I", "")) || 0;
    if (supAtual > 0 || infAtual > 2) asaOpts = { fixed: 0 };
  }
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
  /* v28 — SENTIDOS POR REINO. Planta, fungo e bactéria vinham com audição e
     olfato sorteados de 0 a 9 igual a um mamífero: saía planta com audição 7
     e bactéria com olfato 6. Nenhum dos três tem órgão auditivo — audição
     vai a zero. Quimiorrecepção, essa sim existe nos três (uma raiz "sente"
     nutriente, uma bactéria faz quimiotaxia, um micélio segue gradiente
     químico), então `senOlfato` sobrevive numa faixa baixa em vez de virar
     zero. Tato/mecanorrecepção idem: tigmotropismo é real. Visão já era
     limitada a 1 pela ausência de olhos; fica explícito. */
  scalarStep(cur, "senVisao", limitesEscalar(g, "senVisao"));
  if (g.facOlhosQtd === 0 || g.facOlhosTipo === "cg") g.senVisao = Math.min(g.senVisao, 1);
  scalarStep(cur, "senOlfato", limitesEscalar(g, "senOlfato"));
  scalarStep(cur, "senAudicao", limitesEscalar(g, "senAudicao"));
  scalarStep(cur, "senTato", limitesEscalar(g, "senTato"));
  let senEspOpts = {};
  if (g.reino === "Ba") senEspOpts = { restrict: ["0", "vb"] }; // Fase 1, item 4.1 — sem sistema nervoso, só quimio/vibrotaxia rasa
  else if (g.mag && Number(g.mag.slice(1)) >= 7) senEspOpts = { fixed: "au" };
  else if (g.isPrimordial && g.tolCiclo === "no" && g.senVisao < 6) senEspOpts = { restrict: ["vb", "tr"] };
  else if (g.isPrimordial) senEspOpts = { restrict: ["0", "vb", "tr"] };
  else if (g.tolCiclo === "no" && g.senVisao < 6) senEspOpts = { exclude: ["0"] };
  categoricalStep(cur, "senEspecial", T.senEspecial, senEspOpts);
  if (g.senEspecial !== "0") scalarStep(cur, "senEspecialIntensidade", (g.mag && Number(g.mag.slice(1)) >= 7) ? { min: 5 } : {}); else g.senEspecialIntensidade = undefined;

  // Passo 15 — SOC
  /* v28 — ESTRUTURA SOCIAL POR REINO. Saía bactéria em "matilha" e planta em
     "bando"/"par vitalício" — categorias que descrevem coordenação
     comportamental entre indivíduos móveis. O que planta, fungo e bactéria
     de fato formam é indivíduo isolado ou colônia (biofilme, micélio,
     bosque clonal); enxame cabe na bactéria, que se move em massa. */
  categoricalStep(cur, "socEstrutura", T.socEstrutura, mergeOpts(g.isPrimordial ? { exclude: ["me"] } : {}, opcoesCategoricas(g, "socEstrutura")));
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
  /* v28 — bactéria saía com "luta", "fuga" e "defesa em grupo". O que uma
     célula faz é esporular/enquistar (rigidez), produzir toxina, ou se
     esconder quimicamente. Séssil já era tratado; a bactéria agora também. */
  const defEstrOpts = mergeOpts(
    g.locPrimario === "F" ? { restrict: ["ri", "to", "ca", "re"] } : {},
    opcoesCategoricas(g, "defEstrategia")
  );
  categoricalStep(cur, "defEstrategia", T.defEstrategia, defEstrOpts);

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
    /* v32 — metabolismo deixa de ser sorteado à parte da dieta. Antes os dois
       genes eram independentes e a mesma bactéria saía "detritívoro" no bloco
       DIE e "fotossíntese" na prosa. Como as três opções de metabolismo são
       exatamente as três dietas permitidas à bactéria, o gene vira leitura
       direta de dieBase — sem consumir dígito de seed, igual a qualquer
       outro gene travado por condição. */
    categoricalStep(cur, "metabolismoTipo", T.metabolismoTipo, { fixed: ["de", "qm", "ft"].includes(g.dieBase) ? g.dieBase : "de" });
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
  /* v26, correção #7 — limiares recalibrados contra a distribuição real.
     Medido em 20.000 espécies: extremos = {0:8814, 1:7983, 2:2667, 3:460,
     4:70, 5:6} e NUNCA acima de 6 (nem após 40 ciclos de deriva). Com os
     limiares antigos (5 e 8), a 1ª anomalia saía em 0,03% das espécies e a
     2ª era código morto — inalcançável por construção. Baixados para 3 e 5,
     que é onde a cauda da distribuição de fato existe: ~2,8% das espécies
     ganham uma anomalia e ~0,05% ganham a segunda. */
  if (extremos >= 3) g.anomalias.push(categoricalStep(cur, "ano1", T.ano));
  else g.ano1 = undefined; // sem gatilho, não há anomalia — limpa resíduo de um estado anterior
  if (extremos >= 5) {
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
/* v26, correção #6 — validação de configuração geográfica. Antes, três
   configurações impossíveis eram aceitas em silêncio e produziam uma massa
   de terra morta (8 divisões com biomaNome: null), sem erro nem aviso:
   (a) domínio climático inexistente; (b) todos os biomas do domínio
   excluídos; (c) lista de domínios vazia depois de filtrar os inválidos.
   Agora a função devolve `massa.avisos` (lista de problemas legíveis) e,
   quando não sobra nenhum bioma, cai no conjunto completo em vez de deixar
   a massa vazia — uma massa sem bioma nenhum não é uma configuração, é um
   estado inválido. Quem chama pode exibir `massa.avisos` ao usuário. */
function validarConfigMassa(dominios, biomasExcluidos) {
  const avisos = [];
  const disponiveis = listarDominiosDisponiveis();
  const pedidos = Array.isArray(dominios) ? dominios : [];
  const invalidos = pedidos.filter((d) => !disponiveis.includes(d));
  if (invalidos.length) avisos.push(`Domínio(s) climático(s) inexistente(s), ignorado(s): ${invalidos.join(", ")}.`);
  const validos = pedidos.filter((d) => disponiveis.includes(d));
  return { avisos, dominiosValidos: validos };
}

function criarMassaDeTerra(nome, dominios, biomasExcluidos) {
  // Fase 5, item 9.3 — biomasExcluidos: lista de nomes de bioma (do
  // HABITAT_CODEX) explicitamente desligados mesmo com o domínio deles
  // habilitado (ex.: manter o domínio "Aquáticos" mas excluir "Abismo
  // Oceânico Afótico" numa massa sem fossas profundas).
  const { avisos, dominiosValidos } = validarConfigMassa(dominios, biomasExcluidos);
  const massa = {
    id: novoIdRegiao(), nome,
    dominios: dominiosValidos.length ? dominiosValidos : [...DOMINIOS_CLIMATICOS],
    biomasExcluidos: biomasExcluidos || [],
    avisos,
  };
  if (dominios && dominios.length && !dominiosValidos.length) {
    massa.avisos.push("Nenhum domínio válido informado — a massa foi criada com todos os domínios climáticos.");
  }
  if (!biomasDaMassa(massa).length) {
    massa.avisos.push(`Todos os biomas de "${massa.nome}" estavam excluídos, o que deixaria a massa sem nenhum ambiente habitável. As exclusões foram descartadas.`);
    massa.biomasExcluidos = [];
  }
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

/* ============================================================
   v32 — GEOGRAFIA: GERAÇÃO ALEATÓRIA COERENTE E EDIÇÃO PLENA
   ============================================================
   Duas lacunas eram resolvidas juntas aqui.

   (1) Não havia como sortear uma geografia. Configurar cinco massas de terra
       à mão, domínio por domínio e bioma por bioma, é o caminho certo quando
       se quer um mundo específico — e é trabalho demais quando se quer só
       "um mundo". Mas sortear domínios sem regra nenhuma produz coisas como
       uma massa polar que oferece deserto quente: cada massa teria uma
       colcha de retalhos climáticos, e o Códice de Biomas perderia sentido.

       A solução é sortear a FAIXA LATITUDINAL da massa, não os domínios: uma
       massa polar, temperada, tropical ou equatorial: e derivar dela os
       domínios plausíveis. O acaso continua existindo (qual faixa, quantas
       massas, quais biomas dentro de cada domínio, e a chance de um domínio
       "Extremos e Mágicos" aparecer), mas não pode mais produzir uma
       combinação incoerente, porque as combinações incoerentes não estão
       na tabela.

   (2) Depois de confirmada, a geografia era imutável: massa mal configurada
       ou domínio esquecido só se resolviam recomeçando o mundo. `editarMassa`
       abaixo altera a massa NO LUGAR, preservando o `id` — que é o que as
       espécies e as populações guardam. Trocar o id seria "excluir e criar",
       e deixaria toda espécie daquela massa órfã.
   ============================================================ */

const FAIXAS_LATITUDINAIS = [
  {
    nome: "Polar",
    peso: 12,
    dominios: ["Frio e Gelo"],
    opcionais: [{ dom: "Aquáticos", chance: 0.7 }, { dom: "Temperados", chance: 0.2 }],
  },
  {
    nome: "Subpolar",
    peso: 16,
    dominios: ["Frio e Gelo", "Temperados"],
    opcionais: [{ dom: "Aquáticos", chance: 0.6 }],
  },
  {
    nome: "Temperada",
    peso: 26,
    dominios: ["Temperados"],
    opcionais: [{ dom: "Aquáticos", chance: 0.7 }, { dom: "Frio e Gelo", chance: 0.3 }, { dom: "Quentes e Áridos", chance: 0.3 }],
  },
  {
    nome: "Subtropical",
    peso: 22,
    dominios: ["Quentes e Áridos", "Temperados"],
    opcionais: [{ dom: "Aquáticos", chance: 0.7 }],
  },
  {
    nome: "Equatorial",
    peso: 18,
    dominios: ["Quentes e Áridos"],
    opcionais: [{ dom: "Temperados", chance: 0.5 }, { dom: "Aquáticos", chance: 0.8 }],
  },
  {
    /* Uma massa inteiramente oceânica: arquipélago, mar interior, plataforma
       submersa. Existe porque um mundo só de continentes seria estranho, e
       porque o domínio Aquáticos sozinho é uma configuração legítima. */
    nome: "Oceânica",
    peso: 14,
    dominios: ["Aquáticos"],
    opcionais: [{ dom: "Temperados", chance: 0.35 }, { dom: "Frio e Gelo", chance: 0.2 }, { dom: "Quentes e Áridos", chance: 0.2 }],
  },
];

/* "Extremos e Mágicos" fica fora das faixas: ele não é um clima, é uma
   anomalia. Aparece com chance baixa em qualquer faixa — é o que o torna
   notável quando aparece. */
const CHANCE_DOMINIO_EXTREMO = 0.22;

const NOMES_MASSA_SORTEIO = [
  "Pangeia", "Aurenor", "Kaltavar", "Solmyr", "Vhandara", "Tessalon", "Orivunn",
  "Zaharek", "Melquira", "Drovask", "Ithuanne", "Cauldrik", "Yssamar", "Brenhold",
];

function sorteioPonderado(lista) {
  const total = lista.reduce((a, x) => a + x.peso, 0);
  let n = Math.random() * total;
  for (const x of lista) { n -= x.peso; if (n <= 0) return x; }
  return lista[lista.length - 1];
}

/* Sorteia uma geografia inteira. Devolve RASCUNHOS no mesmo formato que a
   Fase 1 já usa ({ nome, dominios, biomasExcluidos }), e não massas prontas
   — assim o usuário vê o resultado, mexe no que quiser e só então confirma.
   Sortear e confirmar continuam sendo dois atos separados. */
function gerarGeografiaAleatoria(quantidade, opts = {}) {
  const { permitirExtremos = true, excluirBiomasChance = 0.25 } = opts;
  const n = Math.max(1, Math.min(12, Math.floor(Number(quantidade) || 3)));
  const nomesDisponiveis = NOMES_MASSA_SORTEIO.slice();
  const usados = new Set();
  const rascunhos = [];

  for (let i = 0; i < n; i++) {
    const faixa = sorteioPonderado(FAIXAS_LATITUDINAIS);
    const dominios = new Set(faixa.dominios);
    for (const opc of faixa.opcionais) if (Math.random() < opc.chance) dominios.add(opc.dom);
    if (permitirExtremos && Math.random() < CHANCE_DOMINIO_EXTREMO) dominios.add("Extremos e Mágicos");

    let nome;
    do {
      nome = nomesDisponiveis.length
        ? nomesDisponiveis.splice(Math.floor(Math.random() * nomesDisponiveis.length), 1)[0]
        : `Massa ${i + 1}`;
    } while (usados.has(nome) && nomesDisponiveis.length);
    usados.add(nome);

    /* Exclusão de biomas específicos: dá textura ao mundo (uma massa com
       domínio Aquáticos mas sem abissal, por exemplo) sem nunca esvaziar o
       domínio — pelo menos metade dos biomas de cada domínio sobrevive, e
       `criarMassaDeTerra` ainda descarta as exclusões se, mesmo assim,
       sobrar nenhum. */
    const biomasExcluidos = [];
    for (const dom of dominios) {
      const doDominio = HABITAT_CODEX.filter((b) => b.dominio === dom);
      const maxExcluir = Math.floor(doDominio.length / 2);
      for (const b of doDominio) {
        if (biomasExcluidos.length >= maxExcluir) break;
        if (Math.random() < excluirBiomasChance) biomasExcluidos.push(b.nome);
      }
    }

    rascunhos.push({
      tempId: i + 1,
      nome: `${nome} (${faixa.nome})`,
      faixa: faixa.nome,
      dominios: [...dominios],
      biomasExcluidos,
    });
  }
  return rascunhos;
}

/* Edição no lugar de uma massa já existente. Preserva `id` (as espécies e
   populações apontam para ele) e recalcula os biomas por divisão apenas
   quando o conjunto de biomas disponíveis realmente mudou — assim renomear
   uma massa não embaralha a geografia inteira dela.

   `divisoesPreservadas` mantém o bioma de cada divisão que continua válido;
   só as divisões cujo bioma deixou de existir na massa são resorteadas. É a
   diferença entre "corrigi um domínio" e "recomecei o mundo". */
function editarMassa(massa, { nome, dominios, biomasExcluidos } = {}) {
  if (!massa) return null;
  if (typeof nome === "string" && nome.trim()) massa.nome = nome.trim();
  if (Array.isArray(dominios)) {
    const { avisos, dominiosValidos } = validarConfigMassa(dominios, biomasExcluidos || massa.biomasExcluidos);
    massa.dominios = dominiosValidos.length ? dominiosValidos : massa.dominios;
    massa.avisos = avisos;
  }
  if (Array.isArray(biomasExcluidos)) massa.biomasExcluidos = biomasExcluidos;

  const validos = biomasDaMassa(massa);
  if (!validos.length) {
    massa.avisos = [...(massa.avisos || []), `Todas as exclusões de "${massa.nome}" deixariam a massa sem nenhum ambiente habitável — foram descartadas.`];
    massa.biomasExcluidos = [];
  }
  const nomesValidos = new Set(biomasDaMassa(massa).map((b) => b.nome));
  const total = massa.divisoesBiomas?.length || DIVISOES_POR_MASSA;
  const lista = biomasDaMassa(massa);
  massa.divisoesBiomas = Array.from({ length: total }, (_, i) => {
    const anterior = massa.divisoesBiomas?.[i];
    if (anterior && anterior.biomaNome && nomesValidos.has(anterior.biomaNome)) return anterior;
    return { id: i, biomaNome: lista.length ? lista[Math.floor(Math.random() * lista.length)].nome : null };
  });
  return massa;
}

/* Resorteia só os biomas das divisões de uma massa, mantendo domínios e
   nome. Serve ao caso "gostei da configuração climática, não gostei de como
   os biomas caíram no mapa". */
function resortearBiomasDaMassa(massa) {
  if (!massa) return null;
  const lista = biomasDaMassa(massa);
  const total = massa.divisoesBiomas?.length || DIVISOES_POR_MASSA;
  massa.divisoesBiomas = Array.from({ length: total }, (_, i) => ({
    id: i,
    biomaNome: lista.length ? lista[Math.floor(Math.random() * lista.length)].nome : null,
  }));
  return massa;
}

/* Define manualmente o bioma de uma divisão específica. Recusa biomas que a
   massa não oferece — é a trava que impede um vulcão de aparecer onde só
   existe domínio polar, que era exatamente a incoerência a evitar. */
function definirBiomaDaDivisao(massa, indiceDivisao, biomaNome) {
  if (!massa || !massa.divisoesBiomas) return false;
  const div = massa.divisoesBiomas[indiceDivisao];
  if (!div) return false;
  if (biomaNome && !biomasDaMassa(massa).some((b) => b.nome === biomaNome)) return false;
  div.biomaNome = biomaNome || null;
  return true;
}

/* Fase 2, item 5.5 (pré-requisito 2) — topologia de vizinhança entre
   divisões: grade circular simples (0↔1↔2...↔7↔0), cada divisão vizinha
   das duas adjacentes por índice. Escolhida por ser a opção mais simples
   de implementar sem inventar geometria nova, dado que DIVISOES_POR_MASSA
   já é um número fixo pequeno (recomendação do próprio plano). */
function divisoesVizinhas(divisao, total = DIVISOES_POR_MASSA) {
  /* v26, correção #6 — com total = 1 a fórmula devolvia [0, 0]: a divisão
     virava vizinha de si mesma e "migrar" significava ficar parado. Com
     total = 2 devolvia a mesma vizinha duplicada. Importa agora que o número
     de divisões deixou de ser necessariamente 8. */
  if (!Number.isFinite(total) || total <= 1) return [];
  if (total === 2) return [(divisao + 1) % 2];
  return [...new Set([(divisao - 1 + total) % total, (divisao + 1) % total])].filter((d) => d !== divisao);
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
/* v26 — `ano1`/`ano2` entram aqui. Eles só são sorteados quando o contador
   derivado `extremos` cruza um limiar, e `extremos` é recalculado do zero na
   reconstrução. Depois de deriva, um escalar que virou 0 ou 9 muda `extremos`
   sem disparar normalização (escalares-folha não são condicionantes), então a
   presença da anomalia podia divergir entre o genoma corrente e o
   reconstruído — 0,13% dos genomas derivados, medido. Como `extremos` e
   `anomalias` já eram tratados como derivados, os dois campos que dependem
   deles seguem a mesma regra. */
/* v27 — genes escalares que o código DRN2 carrega mas que são CALCULADOS a
   partir de outro gene, e por isso não podem ser escritos direto: a
   normalização os recalcula da fonte e desfaz a atribuição. Quem quer um
   valor específico precisa mexer na fonte. */
const GENE_FONTE_DERIVADA = { socSenciencia: "socSencienciaBruta" };

/* v27 — genes que o código DRN2 carrega mas cujo valor "de verdade" mora num
   campo-espelho não serializado (`rawStep` guarda o estado sob outra chave).
   Ao reconstruir a partir de um código colado, escrever só o campo visível
   não adianta: a normalização seguinte lê o espelho, não o encontra, e
   ressorteia. Medido: `memInf` divergia em 5% dos códigos reconstruídos —
   exatamente a chance de o sorteio não repetir o valor original. */
const GENE_RAW_ESPELHO = { memInf: "memInfRaw" };
function fixarEspelhoRaw(g, chave, valor) {
  g[chave] = valor;
  const espelho = GENE_RAW_ESPELHO[chave];
  if (espelho) g[espelho] = valor;
}

const GENES_SEMPRE_DERIVADOS = new Set(["socSenciencia", "socSencienciaPenalizada", "extremos", "anomalias", "ano1", "ano2", "clado", "cladoC1", "cladoV", "cladoC2"]);

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
  /* v28, otimização — a comparação usava JSON.stringify nos DOIS lados de
     cada uma das ~107 chaves: 214 serializações por chamada, para comparar
     quase sempre um número ou uma string curta. `seedParaGenoma` é chamada
     toda vez que o app exibe a seed de uma espécie, e era a função mais cara
     do motor (1,15 ms). A comparação direta cobre escalar e string; só o que
     for objeto/array (na prática, `anomalias`) cai no caminho lento. */
  const camposDivergentes = [];
  for (const k of Object.keys(g)) {
    if (GENES_SEMPRE_DERIVADOS.has(k)) continue;
    const a = g[k], b = rebuilt.g[k];
    if (a === b) continue;
    if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
    }
    camposDivergentes.push(k);
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
/* v28 — tetos de escalar por reino, numa tabela única consultada TANTO pelo
   passo de construção quanto pela deriva. Quando a restrição existia só na
   construção, a deriva empurrava o valor para fora da faixa (um +1 em
   senAudicao de uma planta), a normalização depois o trazia de volta, e a
   reconstrução pela seed divergia — 8 genomas em 1200, medido. Uma trava só
   é confiável se os dois caminhos que escrevem o gene a respeitarem. */
const TETO_ESCALAR_POR_REINO = {
  Ba: { senVisao: { max: 1 }, senOlfato: { max: 3 }, senAudicao: { min: 0, max: 0 }, senTato: { max: 2 }, locVelocidade: { max: 2 }, densidade: { min: 5, max: 6 } },
  Pl: { senVisao: { max: 1 }, senOlfato: { max: 4 }, senAudicao: { min: 0, max: 0 }, senTato: { max: 4 }, densidade: { min: 1, max: 6 } },
  Fu: { senVisao: { max: 1 }, senOlfato: { max: 4 }, senAudicao: { min: 0, max: 0 }, senTato: { max: 3 }, densidade: { min: 0, max: 4 } },
};
function limitesEscalar(g, key) { return TETO_ESCALAR_POR_REINO[g.reino]?.[key] || {}; }

/* v28 — o mesmo princípio para genes CATEGÓRICOS. As restrições por reino
   introduzidas nesta versão (simetria, porte, estrutura social, modo de
   reprodução, estratégia de defesa) viviam só nos passos de construção; a
   deriva rerrolava o gene na tabela inteira, sem saber delas. O resultado
   passava despercebido porque a maior parte dos sorteios cai numa opção
   válida por acaso — mas quando não caía, ficava um fungo bilateral no
   genoma, e a reconstrução pela seed normalizava para radial e divergia.
   Uma trava só é confiável quando os dois caminhos que escrevem o gene a
   respeitam: aqui é o par de `limitesEscalar` para o lado categórico. */
const OPCOES_CATEGORICAS_POR_REINO = {
  Ba: {
    /* v32 — `dieBase` entra aqui porque a trava vivia só no passo de
       construção: a deriva rerrolava a dieta na tabela inteira e podia
       deixar uma bactéria "carnívora" até a próxima normalização. */
    dieBase: ["de", "qm", "ft"],
    simetria: ["rd", "am", "as"],
    porte: ["mn", "pq"],
    socEstrutura: ["so", "co", "en"],
    repModo: ["fs", "gm", "ax", "sp"],
    defEstrategia: ["ca", "to", "ri", "re"],
  },
  Pl: {
    dieBase: ["ft", "in", "de", "qm"], // v32 — mesma lista de dieBasePl
    simetria: ["rd", "es", "am", "as"],
    porte: ["mn", "pq", "md", "gr", "cl"],
    socEstrutura: ["so", "co"],
    repModo: ["sp", "gm", "ax", "fs"],
    defEstrategia: ["ca", "to", "ri", "re"],
  },
  Fu: {
    dieBase: ["de", "qm"], // v32 — idem Ba: a trava também vale na deriva
    simetria: ["rd", "am", "as", "es"],
    porte: ["mn", "pq", "md", "gr", "cl"],
    socEstrutura: ["so", "co"],
    repModo: ["sp", "gm", "ax", "fs"],
    defEstrategia: ["ca", "to", "ri", "re"],
  },
};
function opcoesCategoricas(g, key) {
  const lista = OPCOES_CATEGORICAS_POR_REINO[g.reino]?.[key];
  return lista ? { restrict: lista } : {};
}

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
  /* v26 — `dieFrequencia` e `socAgressividade` fecham as duas últimas fontes
     de divergência medidas entre o genoma corrente e o reconstruído pela
     seed: ambos têm intervalo dependente de outro gene (dieBase e
     socEstrutura, respectivamente) e podiam ficar fora da faixa após deriva. */
  "dieFrequencia", "socAgressividade",
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

/* ============================================================
   v27 — BUSCA POR DNA (código DRN2 colado)
   ============================================================
   Até aqui a caixa de busca aceitava seed numérica e texto livre, mas não
   o próprio código DRN2 — que é justamente o formato que o app exibe em
   todo lugar (visor de espécie, visor de indivíduo, logs, árvore, fichas
   do Obsidian) e o que o usuário mais tem à mão pra colar de volta.

   O código DRN2 não é um endereço no espaço de espécimes (a seed é); é uma
   DESCRIÇÃO do genoma. Então a reconstrução é: parseia o código, usa os
   genes lidos como valores manuais, normaliza pra preencher o que o código
   não carrega (os 36 genes de táxon da Fase 3 não são serializados) e roda
   algumas rodadas dirigidas pra fixar os campos que a normalização
   reverteria. A seed correspondente é calculada depois, a partir do genoma
   reconstruído — então dá pra colar um DNA e sair com a seed dele. */
const MAX_RODADAS_DNA = 6;

function ehCodigoDRN2(texto) {
  const t = String(texto || "").trim();
  return /^DRN2-/i.test(t) || /\b(TAX|MOR|LOC|MEM|TEG|CRN|FAC|DIE|SEN|REP|TOL|SOC|DEF):/.test(t);
}

function genomaDeCodigoDRN2(codigo, isPrimordial = false) {
  const alvo = parseAlvoDLDoCode(codigo);
  if (!Object.keys(alvo).length) return null;
  const anomalias = Array.isArray(alvo.__anomalias) ? alvo.__anomalias : null;
  const manual = { ...alvo };
  delete manual.__anomalias;

  let g = normalizarGenoma({ ...manual }, isPrimordial);
  for (let i = 0; i < MAX_RODADAS_DNA; i++) {
    const divergentes = Object.keys(DL_PESOS).filter((k) => manual[k] !== undefined && String(g[k]) !== String(manual[k]));
    if (!divergentes.length) break;
    // genes derivados ficam de fora da atribuição direta: escrevê-los antes
    // de calcular o delta zeraria o próprio delta (o valor já estaria igual
    // ao alvo) e a normalização desfaria tudo na sequência
    for (const k of divergentes) if (!GENE_FONTE_DERIVADA[k]) fixarEspelhoRaw(g, k, manual[k]);
    for (const [derivado, fonte] of Object.entries(GENE_FONTE_DERIVADA)) {
      if (manual[derivado] === undefined || g[derivado] === undefined) continue;
      const delta = Number(manual[derivado]) - Number(g[derivado]);
      if (delta && Number.isFinite(delta) && g[fonte] !== undefined) {
        g[fonte] = Math.max(0, Math.min(9, Number(g[fonte]) + delta));
      }
    }
    const limpo = normalizarGenoma(g, isPrimordial);
    Object.assign(g, limpo);
    aplicarCorrecoesAutomaticas(g);
  }
  // anomalias são derivadas de `extremos`: fixamos QUAIS são, respeitando
  // a quantidade que o genoma reconstruído comporta
  if (anomalias && Array.isArray(g.anomalias) && g.anomalias.length && anomalias.length >= g.anomalias.length) {
    g.anomalias = anomalias.slice(0, g.anomalias.length);
    g.ano1 = g.anomalias[0];
    g.ano2 = g.anomalias[1];
  }
  g.isPrimordial = isPrimordial;
  return g;
}

/* Devolve o mesmo formato de decodificarSeedColada, pra que a UI de busca
   trate seed, texto livre e DNA pelo mesmo caminho. `fiel` diz se o código
   reconstruído bate exatamente com o colado (ignorando o clado, que é nome
   próprio e não gene); `camposDivergentes` lista o que não coube — acontece
   quando o código colado descreve uma combinação que as travas do sistema
   não permitem (ex.: código editado à mão, ou vindo de uma versão antiga). */
function decodificarDNAColado(codigo, isPrimordial = false) {
  const g = genomaDeCodigoDRN2(codigo, isPrimordial);
  if (!g) return null;
  const alvo = parseAlvoDLDoCode(codigo);
  const camposDivergentes = Object.keys(DL_PESOS)
    .filter((k) => alvo[k] !== undefined && String(g[k]) !== String(alvo[k]));
  const code = serialize(g);
  const { seed } = seedParaGenoma(g, isPrimordial);
  return {
    g, code, speciesSeed: seed, individual: null, isPrimordial,
    deDNA: String(codigo).trim(), fiel: camposDivergentes.length === 0, camposDivergentes,
  };
}

/* ============================================================
   v27 — TRILHA REVERSA (de onde este espécime pode ter vindo)
   ============================================================
   A busca de trilha existente parte de um nó e anda PRA FRENTE até um
   DNA-alvo. Faltava o inverso: dado um espécime, reconstruir uma das
   trilhas de deriva que poderiam tê-lo produzido, desde um ancestral
   primordial.

   Não existe "a" trilha certa — o passado não é recuperável a partir do
   genoma atual, porque a deriva descarta informação (dois caminhos
   diferentes chegam ao mesmo lugar). O que dá pra fazer, e é o que esta
   função faz, é sortear ancestrais primordiais plausíveis e devolver uma
   trilha VÁLIDA que realmente chega no alvo — daí "uma das possíveis".
   Rodar de novo dá outra trilha, o que é a resposta honesta.

   O ancestral é sempre bactéria (Fase 2, item 5.2: todo primordial nasce
   Ba), e a barreira de reino permite que uma bactéria chegue a qualquer
   reino — então nenhum alvo é inatingível por essa via, ao contrário da
   busca pra frente a partir de uma espécie já especializada.

   Testa `tentativas` ancestrais e devolve o que produziu a trilha mais
   curta: uma linhagem mais econômica é mais plausível como história. */
async function buscarTrilhaReversa(codigoAlvo, onProgress, tentativas = 3) {
  if (!ehCodigoDRN2(codigoAlvo)) {
    return { sucesso: false, motivo: "codigo-invalido", trilha: [], ancestral: null };
  }
  let melhor = null;
  for (let t = 0; t < tentativas; t++) {
    const gAncestral = buildSpecies(null, { reino: "Ba" }, true).g;
    const nodeAncestral = {
      id: "ancestral_hipotetico_" + t,
      clado: gAncestral.clado,
      g: gAncestral,
      isPrimordial: true,
      code: serialize(gAncestral),
      pais: [], filhos: [],
    };
    const r = await buscarTrilhaParaAlvo(
      nodeAncestral, codigoAlvo,
      (f) => { if (onProgress) onProgress((t + f) / tentativas); }
    );
    const candidato = { ...r, ancestral: nodeAncestral, tentativa: t + 1 };
    if (!melhor) melhor = candidato;
    else if (candidato.codigoIdentico && !melhor.codigoIdentico) melhor = candidato;
    else if (candidato.codigoIdentico === melhor.codigoIdentico && candidato.trilha.length < melhor.trilha.length) melhor = candidato;
    if (melhor.codigoIdentico && melhor.trilha.length <= 4) break; // já é curta e exata
  }
  if (onProgress) onProgress(1);
  return { ...melhor, tentativasFeitas: tentativas };
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
  /* v26, correção #1 — reinos sem plano corporal animal (Pl/Fu/Ba) não
     podem receber frases de anatomia animal, nem mesmo NEGADAS ("0 membros",
     "crânio indefinido"). A prosa é a fonte autoritativa do prompt de imagem:
     citar crânio/membros, ainda que para dizer que não existem, é o que fazia
     a IA de imagem desenhar planta e fungo com cara de bicho (bug 4.4). */
  const semPlanoCorporalAnimal = ["Pl", "Fu", "Ba"].includes(g.reino);
  let locFrase;
  if (g.reino === "Pl" || g.reino === "Fu") {
    locFrase = `${g.reino === "Pl" ? "Não se locomove ativamente: fixa-se ao substrato e cresce" : "Não se locomove ativamente: expande-se pelo substrato"}${g.locPrimario !== "F" ? `, com ${labelOf(T.locPrim, g.locPrimario).toLowerCase()} como capacidade de deslocamento residual` : ""}${g.memApendices !== "0X" ? `, projetando ${g.memApendices.replace("X", "")} estrutura(s) auxiliar(es)` : ""}.`;
  } else if (g.reino === "Ba") {
    locFrase = `Locomove-se principalmente por ${labelOf(T.locPrim, g.locPrimario).toLowerCase()}, a uma velocidade ${tier(g.locVelocidade)}, organismo unicelular sem qualquer estrutura corporal diferenciada.`;
  } else {
    /* v29 — a frase somava três números independentes ("0 superiores",
       "4 membros inferiores", "2 apêndices auxiliares") e deixava o leitor
       montar a conta sozinho — daí a leitura de um réptil quadrúpede com
       oito membros. Agora o TOTAL vem primeiro, e apêndice é dito pelo que
       ele é: estrutura não-locomotora (antena, barbilhão, tentáculo), fora
       da contagem de membros. */
    const nSup = Number(String(g.memSup).replace("S", "")) || 0;
    const nInf = Number(String(g.memInf).replace("I", "")) || 0;
    const nApd = Number(String(g.memApendices).replace("X", "")) || 0;
    const totalMembros = nSup + nInf;
    const membrosFrase = totalMembros === 0
      ? "Não tem membros locomotores"
      : `Tem ${totalMembros} membro(s) locomotor(es) ao todo — ${nSup} superior(es) e ${nInf} inferior(es)`;
    locFrase = `Locomove-se principalmente por ${labelOf(T.locPrim, g.locPrimario).toLowerCase()}${g.locSecundario !== "0" ? `, com ${labelOf(T.locSec, g.locSecundario).toLowerCase()} como modo secundário` : ""}, a uma velocidade ${tier(g.locVelocidade)}. ${membrosFrase}${totalMembros > 0 ? `, terminando em ${labelOf(T.memTerm, g.memTerm).toLowerCase()}` : ""}${g.memProp !== "0" && totalMembros > 0 ? `, com membros ${labelOf(T.memProp, g.memProp).toLowerCase()}` : ""}${nApd > 0 ? `. Fora dos membros, porta ${nApd} apêndice(s) não-locomotor(es) — antena, barbilhão ou tentáculo, conforme o plano corporal` : ""}.`;
  }
  p.push(locFrase);

  let tegFrase = `O corpo é revestido por ${labelOf(T.tegTipo, g.tegTipo).toLowerCase()}, na cor ${labelOf(T.tegCor, g.tegCor).toLowerCase()} (intensidade ${g.tegCorIntensidade}), em padrão ${labelOf(T.tegPadrao, g.tegPadrao).toLowerCase()}, com resistência ${tier(g.tegResistencia)}.`;
  p.push(tegFrase);

  /* v26, correção #1 — a frase do crânio só existe para quem tem plano
     corporal animal. Um animal SEM crânio ainda merece a menção (é uma
     característica marcante dele); uma planta, não. */
  if (!semPlanoCorporalAnimal) {
    let crnFrase = `O crânio é ${g.crnFormato === "0" ? "indefinido, sem estrutura craniana fixa" : labelOf(T.crnFormato, g.crnFormato).toLowerCase()}${g.crnPescoco !== "0" ? `, sobre um pescoço ${labelOf(T.crnPescoco, g.crnPescoco).toLowerCase()}` : ""}`;
    if (g.crnChifreQtd !== "0") crnFrase += `, com ${g.crnChifreQtd} chifres em formato ${labelOf(T.crnChifreForma, g.crnChifreForma).toLowerCase()}`;
    if (g.crnCrista !== "0") crnFrase += `, e crista do tipo ${labelOf(T.crnCrista, g.crnCrista).toLowerCase()}`;
    crnFrase += ".";
    p.push(crnFrase);

    if (g.crnFormato !== "0") {
      p.push(`No rosto: orelha ${labelOf(T.facOrelha, g.facOrelha).toLowerCase()}, focinho ${labelOf(T.facFocinho, g.facFocinho).toLowerCase()}, dentição ${g.facDenticao === "0" ? "ausente" : labelOf(T.facDenticao, g.facDenticao).toLowerCase()}.`);
    }
  }
  if (g.facOlhosQtd !== 0 && g.facOlhosQtd !== "0") {
    p.push(`Possui ${g.facOlhosQtd} olho(s) do tipo ${labelOf(T.facOlhosTipo, g.facOlhosTipo).toLowerCase()}.`);
  }

  if (g.asaQtd !== 0 && g.asaQtd !== "0") p.push(`Possui ${g.asaQtd} asas do tipo ${labelOf(T.asaTipo, g.asaTipo).toLowerCase()}, com funcionalidade ${tier(g.asaFuncionalidade)}.`);
  if (g.cdaComp && g.cdaComp !== "0") p.push(`A cauda é ${labelOf(T.cdaComp, g.cdaComp).toLowerCase()}, do tipo ${labelOf(T.cdaTipo, g.cdaTipo).toLowerCase()}.`);

  let dieFrase = `Alimenta-se como ${labelOf(T.dieBase, g.dieBase).toLowerCase()}`;
  if (g.dieRestricao !== "0") dieFrase += `, com restrição ${labelOf(T.dieRestricao, g.dieRestricao).toLowerCase()}`;
  dieFrase += `. Reproduz-se de forma ${labelOf(T.repModo, g.repModo).toLowerCase()}, com prole ${tier(g.repProle, ["quase nenhuma", "pequena", "moderada", "numerosa", "aos milhares"])}, maturação ${tier(g.repMaturacao, ["quase instantânea", "rápida", "moderada", "lenta", "de séculos"])} e longevidade ${tier(g.repLongevidade, ["de dias", "curta", "moderada", "longa", "quase indefinida"])}.`;
  p.push(dieFrase);

  let tolFrase = `Tolera climas ${labelOf(T.tolHidrica, g.tolHidrica).toLowerCase()} e ${labelOf(T.tolTermica, g.tolTermica).toLowerCase()}, com atividade ${labelOf(T.tolCiclo, g.tolCiclo).toLowerCase()}.`;
  if (g.senEspecial !== "0") tolFrase += ` Conta ainda com ${labelOf(T.senEspecial, g.senEspecial).toLowerCase()} como sentido extra (intensidade ${g.senEspecialIntensidade}).`;
  p.push(tolFrase);

  const sencLabel = g.socSenciencia <= 2 ? "instintiva" : g.socSenciencia <= 5 ? "associativa (aprende por repetição)" : g.socSenciencia <= 8 ? "simbólica (resolve problemas novos)" : "abstrata plena";
  if (semPlanoCorporalAnimal) {
    /* v26, correção #1 — "cognição" e "agressividade" em planta/fungo/bactéria
       viram resposta a estímulo e competitividade por substrato. */
    p.push(`Ocupa o substrato de forma ${labelOf(T.socEstrutura, g.socEstrutura).toLowerCase()}, com competitividade ${tier(g.socAgressividade)} e resposta a estímulos ${g.socSenciencia <= 2 ? "puramente tropística" : g.socSenciencia <= 5 ? "adaptativa lenta" : "surpreendentemente coordenada"}.`);
  } else {
    p.push(`Socialmente é ${labelOf(T.socEstrutura, g.socEstrutura).toLowerCase()}, com agressividade ${tier(g.socAgressividade)} e cognição ${sencLabel}${g.socSencienciaPenalizada ? " (penalizada por não ter crânio humanoide)" : ""}.`);
  }

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
    /* v32 — o metabolismo agora É a dieta (ver Passo 16.5), então a frase
       diz isso explicitamente em vez de listar dois rótulos que pareciam
       independentes e às vezes se contradiziam. */
    p.push(`Parede celular ${labelOf(T.paredeCelularTipo, g.paredeCelularTipo).toLowerCase()}, obtendo energia por ${labelOf(T.metabolismoTipo, g.metabolismoTipo).toLowerCase()} (o mesmo modo de alimentação declarado no bloco DIE), colônia em formação ${labelOf(T.formaColonia, g.formaColonia).toLowerCase()}.`);
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

/* v29 — PESO DO SALTO DE REINO NA BACTÉRIA.
   Medido na v28, numa deriva de 1000 ciclos a partir de um primordial:
   2649 espécies, das quais 2207 (83%) continuavam bactérias — só 27 das
   1686 especiações saídas de mãe bactéria (1,6%) atravessaram a barreira
   de reino. A causa não era a barreira em si (ela permite a travessia),
   era estatística: `reino` é 1 de 11 genes do Estrato I, e o Estrato I só
   é sorteado em 12% das tentativas, com orçamento de 12 — dá ~0,34% de
   chance por ciclo. Pior: para uma bactéria, quase todo o resto do
   Estrato I está travado por reino (memSup, memInf, crânio, repModo,
   focinho são fixos), então a maioria dos sorteios de Estrato I gastava
   orçamento sem mudar nada e ainda assim disparava especiação por outras
   vias — o mundo ficava cheio de bactérias ligeiramente diferentes.
   Aqui a bactéria (e só ela, que é quem pode atravessar) sorteia `reino`
   em 1/3 das tentativas de Estrato I. Não é um atalho: continua sendo
   deriva, sujeita a orçamento e à normalização. */
/* v32 — subiu de 1/3 para 0,85. Duas razões, uma de conteúdo e uma de
   variância.

   A de conteúdo: quase todo o Estrato I de uma bactéria está travado
   (membros, crânio, focinho, modo reprodutivo são fixos nela). Sortear um
   gene estrutural qualquer significava, na maioria das vezes, gastar o
   sorteio mais caro do sistema em algo que não podia mudar. Para uma
   bactéria, a mudança estrutural que de fato existe É deixar de ser
   bactéria.

   A de variância: medido em 8 rodadas de 4 primordiais × 150 ciclos, a
   proporção final de bactérias na árvore ficava assim conforme o peso —

     peso 0,45: mínimo 11%, mediana 27%, máximo 65%
     peso 0,70: mínimo  8%, mediana 20%, máximo 43%
     peso 0,85: mínimo 13%, mediana 21%, máximo 24%

   Com peso baixo, se a travessia calhava de demorar, a linhagem passava a
   simulação inteira acumulando bactérias e o mundo saía majoritariamente
   bacteriano de novo — o problema original reaparecia por azar. Com 0,85 a
   banda fecha: o resultado deixa de depender de sorte. */
const PESO_SALTO_REINO_BA = 0.85;

function sortGeneAlvo(estrato, g) {
  if (estrato === "I") {
    if (g && g.reino === "Ba" && Math.random() < PESO_SALTO_REINO_BA) return "reino";
    let n; do { n = rollD(12); } while (n > 11); return ESTRATO_I[n - 1];
  }
  if (estrato === "II") { let n; do { n = rollD(14) + (Math.random() < 0.5 ? 0 : 14); } while (n > 26); return ESTRATO_II[n - 1]; }
  let n; do { n = rollD(20); } while (n > 18); return ESTRATO_III[n - 1];
}

function rerollGeneCategorico(g, key, fonte) {
  const table = GENE_TABLE_MAP[key];
  if (!table) return false;
  const bias = fonte?.vies?.[key];
  // v28 — a deriva sorteia dentro do MESMO recorte por reino que a
  // construção usa, e não na tabela inteira
  /* v32 — quando a bactéria sorteia `reino`, "Bactéria" sai da mesa. Esse
     sorteio custa 12 de orçamento (Estrato I inteiro) e só acontece porque a
     linhagem é a única que PODE atravessar; cair de volta em Ba gastava o
     salto estrutural mais caro do sistema para não mudar nada — e era 6% dos
     sorteios de travessia. */
  const opts = (key === "reino" && g.reino === "Ba") ? { exclude: ["Ba"] } : opcoesCategoricas(g, key);
  const nums = validNumbers(table, opts);
  if (!nums.length) return false;
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
  const lim = limitesEscalar(g, key); // v28 — a deriva respeita a mesma trava da construção
  const piso = Math.max(0, lim.min ?? 0), teto = Math.min(9, lim.max ?? 9);
  const novo = Math.max(piso, Math.min(teto, atual + delta));
  if (novo === atual) return false;
  g[key] = novo;
  return true;
}

function aplicarMutacaoGene(g, key, fonte) {
  if (ESCALAR_KEYS.has(key)) return deslocarGeneEscalar(g, key, fonte);
  return rerollGeneCategorico(g, key, fonte);
}

/* v26, correção #2 — a distância genômica comparava 10 genes de ~107 (e de
   ~50 dos que o código DRN2 chega a serializar). "DL = 0" significava acertar
   menos de 10% do DNA, e o app anunciava isso como "bate 100% no alvo".
   Agora o DL cobre TODO campo que serialize() escreve no código DRN2 — que é
   exatamente o que o usuário cola como alvo, e portanto a única definição
   honesta de "100%". Os pesos seguem o custo de mutação por estrato
   (I = 12, II = 4, III = 1), então a busca continua priorizando o que é
   estruturalmente mais caro de mudar. */
const DL_PESOS = (() => {
  const pesos = {};
  const noCodigo = new Set([
    "reino", "classe", "porte", "densidade", "simetria", "morForma", "morTorso",
    "locPrimario", "locSecundario", "locVelocidade",
    "memSup", "memInf", "memApendices", "memTerm", "memProp",
    "tegTipo", "tegCor", "tegCorIntensidade", "tegPadrao", "tegResistencia",
    "crnChifreQtd", "crnChifreForma", "crnCrista", "crnFormato", "crnPescoco",
    "facOrelha", "facFocinho", "facOlhosQtd", "facOlhosTipo", "facDenticao",
    "asaQtd", "asaTipo", "asaFuncionalidade",
    "cdaComp", "cdaTipo", "cdaFuncao",
    "dieBase", "dieFrequencia", "dieRestricao", "mag",
    "senVisao", "senOlfato", "senAudicao", "senTato", "senEspecial", "senEspecialIntensidade",
    "repModo", "repProle", "repMaturacao", "repLongevidade",
    "tolHidrica", "tolTermica", "tolCiclo",
    "socEstrutura", "socAgressividade", "socSenciencia",
    "defArma", "defBlindagem", "defEstrategia",
  ]);
  for (const k of noCodigo) {
    pesos[k] = ESTRATO_I.includes(k) ? CUSTO_ESTRATO.I : ESTRATO_II.includes(k) ? CUSTO_ESTRATO.II : CUSTO_ESTRATO.III;
  }
  return pesos;
})();

/* Compara só as chaves que o alvo de fato declara — um código DRN2 sem
   bloco ASA/CDA (porque a espécie não tem asa nem cauda) não deve penalizar
   as chaves ausentes como se fossem exigências. */
function calcularDL(gA, gB) {
  let dl = 0;
  for (const [k, peso] of Object.entries(DL_PESOS)) {
    if (gB[k] === undefined) continue;
    if (String(gA[k]) !== String(gB[k])) dl += peso;
  }
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
  const num = (v) => (v === undefined || v === "" || isNaN(Number(v)) ? undefined : Number(v));

  /* v26, correção #2 — parser COMPLETO do código DRN2 (antes só extraía as
     10 chaves do DL antigo). Os quatro campos concatenados sem separador
     (CRN qtd+forma, TEG cor+intensidade, FAC olhosQtd+tipo, SEN especial+
     intensidade) são desambiguados casando com os valores reais das tabelas
     de T, e não por posição de caractere — que era a ambiguidade citada no
     comentário antigo como motivo para não fazer o parser completo. */
  const separarConcat = (bruto, tabela, ordem) => {
    // ordem "valorDepoisNumero": "6c" -> qtd 6 + forma "c"; "Vrd5" -> cor "Vrd" + intensidade 5
    if (bruto === undefined) return [undefined, undefined];
    const valores = tabela.map((r) => String(r.value)).sort((a, b) => b.length - a.length);
    if (ordem === "numeroPrimeiro") {
      for (const v of valores) if (bruto.endsWith(v) && bruto.length > v.length) return [bruto.slice(0, -v.length), v];
      return [bruto, undefined];
    }
    for (const v of valores) if (bruto.startsWith(v)) return [v, bruto.slice(v.length)];
    return [bruto, undefined];
  };

  if (segs.TAX) { alvo.reino = segs.TAX[0]; alvo.classe = segs.TAX[1]; }
  if (segs.MOR) { alvo.porte = segs.MOR[0]; alvo.densidade = num(segs.MOR[1]); alvo.simetria = segs.MOR[2]; alvo.morForma = segs.MOR[3]; alvo.morTorso = segs.MOR[4]; }
  if (segs.LOC) { alvo.locPrimario = segs.LOC[0]; alvo.locSecundario = segs.LOC[1]; alvo.locVelocidade = num(segs.LOC[2]); }
  if (segs.MEM) { alvo.memSup = segs.MEM[0]; alvo.memInf = segs.MEM[1]; alvo.memApendices = segs.MEM[2]; alvo.memTerm = segs.MEM[3]; alvo.memProp = segs.MEM[4]; }
  if (segs.TEG) {
    alvo.tegTipo = segs.TEG[0];
    const [cor, inten] = separarConcat(segs.TEG[1], T.tegCor, "valorPrimeiro");
    alvo.tegCor = cor; alvo.tegCorIntensidade = num(inten);
    alvo.tegPadrao = segs.TEG[2]; alvo.tegResistencia = num(segs.TEG[3]);
  }
  if (segs.CRN) {
    const [qtd, forma] = separarConcat(segs.CRN[0], T.crnChifreForma, "numeroPrimeiro");
    alvo.crnChifreQtd = qtd; alvo.crnChifreForma = forma;
    alvo.crnCrista = segs.CRN[1]; alvo.crnFormato = segs.CRN[2]; alvo.crnPescoco = segs.CRN[3];
  }
  if (segs.FAC) {
    alvo.facOrelha = segs.FAC[0]; alvo.facFocinho = segs.FAC[1];
    const [qtd, tipo] = separarConcat(segs.FAC[2], T.facOlhosTipo, "numeroPrimeiro");
    alvo.facOlhosQtd = num(qtd) ?? qtd; alvo.facOlhosTipo = tipo;
    alvo.facDenticao = segs.FAC[3];
  }
  // ASA e CDA só existem no código quando a espécie os tem — a ausência do
  // bloco É a informação "sem asa"/"sem cauda", e vira exigência explícita.
  if (segs.ASA) { alvo.asaQtd = num(segs.ASA[0]) ?? segs.ASA[0]; alvo.asaTipo = segs.ASA[1]; alvo.asaFuncionalidade = num(segs.ASA[2]); }
  else if (segs.TAX) { alvo.asaQtd = 0; }
  if (segs.CDA) { alvo.cdaComp = segs.CDA[0]; alvo.cdaTipo = segs.CDA[1]; alvo.cdaFuncao = num(segs.CDA[2]); }
  else if (segs.TAX) { alvo.cdaComp = "0"; }
  if (segs.DIE) { alvo.dieBase = segs.DIE[0]; alvo.dieFrequencia = num(segs.DIE[1]); alvo.dieRestricao = segs.DIE[2]; }
  if (segs.MAG) { alvo.mag = segs.MAG[0]; }
  if (segs.SEN) {
    alvo.senVisao = num(segs.SEN[0]); alvo.senOlfato = num(segs.SEN[1]);
    alvo.senAudicao = num(segs.SEN[2]); alvo.senTato = num(segs.SEN[3]);
    const [esp, inten] = separarConcat(segs.SEN[4], T.senEspecial, "valorPrimeiro");
    alvo.senEspecial = esp;
    if (esp !== "0" && inten !== undefined && inten !== "") alvo.senEspecialIntensidade = num(inten);
  }
  if (segs.REP) { alvo.repModo = segs.REP[0]; alvo.repProle = num(segs.REP[1]); alvo.repMaturacao = num(segs.REP[2]); alvo.repLongevidade = num(segs.REP[3]); }
  if (segs.TOL) { alvo.tolHidrica = segs.TOL[0]; alvo.tolTermica = segs.TOL[1]; alvo.tolCiclo = segs.TOL[2]; }
  if (segs.SOC) { alvo.socEstrutura = segs.SOC[0]; alvo.socAgressividade = num(segs.SOC[1]); alvo.socSenciencia = num(segs.SOC[2]); }
  if (segs.DEF) { alvo.defArma = segs.DEF[0]; alvo.defBlindagem = num(segs.DEF[1]); alvo.defEstrategia = segs.DEF[2]; }

  /* v26 — o bloco ANO faz parte do código DRN2 mas as anomalias são
     DERIVADAS (o gatilho é o contador `extremos`), então não entram no DL.
     Ainda assim precisam ser lidas: com todos os genes do DL iguais, dois
     genomas têm o mesmo `extremos` e portanto a mesma QUANTIDADE de
     anomalias, mas QUAL anomalia saiu é um sorteio independente — era a
     última fonte de divergência entre o código final e o alvo colado
     (1 caso em 25, medido). Ficam num campo à parte, aplicado na fase
     dirigida da busca. */
  if (segs.ANO) alvo.__anomalias = String(segs.ANO[0]).split(",").filter(Boolean);
  else if (segs.TAX) alvo.__anomalias = [];

  for (const k of Object.keys(alvo)) if (alvo[k] === undefined) delete alvo[k];
  return alvo;
}

/* v26, correção #2 — genes que a busca NÃO tem direito de forçar, porque
   forçá-los violaria uma regra dura do universo em vez de simular evolução.
   Hoje só um: a barreira de reino da Fase 2 (item 5.1) — quem não é bactéria
   nunca muda de reino, e um alvo de reino diferente é genuinamente
   inatingível, não "difícil". A busca reporta isso explicitamente em vez de
   rodar 4000 tentativas e desistir com uma mensagem genérica. */
function motivoInatingivel(gOrigem, alvo) {
  if (alvo.reino && alvo.reino !== gOrigem.reino && gOrigem.reino !== "Ba") {
    return `A origem é do reino ${REINO_LABEL_LOG[gOrigem.reino] || gOrigem.reino} e o alvo é do reino ${REINO_LABEL_LOG[alvo.reino] || alvo.reino}. Só bactéria pode atravessar a barreira de reino — nenhuma trilha de deriva liga essas duas espécies.`;
  }
  return null;
}

/* v26, correção #2 — reescrita completa. O que havia antes era um
   hill-climbing puro: sorteava um ciclo de deriva aleatório, aceitava só se
   o DL melhorasse ESTRITAMENTE, e desistia após 500 tentativas sem melhora.
   Medido na v25: 1 de 25 buscas atingia DL = 0 (num DL que já só olhava 10
   genes), 24 de 25 encerravam como "inatingível", e 0 de 25 terminavam com o
   código DRN2 igual ao alvo. Duas causas: platôs (um ciclo de deriva mexe em
   vários genes de uma vez, e quase nunca melhora tudo ao mesmo tempo) e o
   critério estrito, que impede atravessar empate.

   Agora a busca tem duas fases:

   FASE ESTOCÁSTICA — mantém a deriva aleatória (é ela que dá "sabor
   evolutivo" à trilha), mas aceita também movimentos de DL igual, o que
   permite atravessar platô. Roda com orçamento limitado.

   FASE DIRIGIDA — resolve o que sobrou gene a gene, escrevendo o valor do
   alvo diretamente e renormalizando. É o que garante o "bate 100%" que o
   requisito pede: um gene que o alvo declara é escrito, ponto. Se a
   normalização reverter o gene (porque ele depende de outro que ainda não
   está no lugar), a rodada seguinte tenta de novo — daí o laço externo.

   Genes bloqueados por regra dura (barreira de reino) não são forçados: a
   busca encerra antes, dizendo exatamente por quê. */
/* v32 — INSTANTÂNEO DE GENES POR CICLO.

   Até a v31 a trilha guardava só os NOMES dos genes alterados em cada
   ciclo; os valores eram lidos, depois, do genoma final. Isso já era
   admitido como aproximação no comentário de `serializarTrilha` ("como só o
   valor final importa"), e funcionava enquanto a trilha era uma linha reta
   com um único destino. Deixa de funcionar assim que a trilha precisa
   BIFURCAR: para pendurar um ramo no meio do caminho é preciso reconstruir
   o genoma exato daquele ponto, e o valor final de um gene que mudou três
   vezes ao longo da trilha não diz nada sobre o que ele valia no ciclo 2.

   Guardando o valor no momento em que o ciclo foi aceito, o replay passa a
   ser exato, e de quebra `serializarTrilha` deixa de ser aproximada. */
function instantaneoDeGenes(g, genesAlterados) {
  const foto = {};
  for (const estrato of ["I", "II", "III"]) {
    for (const k of (genesAlterados[estrato] || [])) foto[k] = g[k];
  }
  return foto;
}

const GUARD_MAX_BUSCA_TRILHA = 4000;
const MAX_RODADAS_DIRIGIDAS = 12;

async function buscarTrilhaParaAlvo(nodeOrigem, alvoCodigo, onProgress) {
  const alvo = parseAlvoDLDoCode(alvoCodigo);
  if (!Object.keys(alvo).length) return { sucesso: false, motivo: "codigo-invalido", trilha: [], dlFinal: null };

  let gAtual = clonarGenoma(nodeOrigem.g);

  /* v27 — a barreira de reino diz que só bactéria pode ressortear `reino`.
     Isso vale por CICLO, mas uma linhagem que COMEÇOU bactéria pode chegar
     legitimamente a qualquer reino: o estado intermediário é só onde a
     deriva calhou de estar. A fase estocástica muitas vezes flipava Ba pra
     um reino errado e ali travava para sempre — medido: `reino` residual em
     8 de 8 trilhas reversas. Guardamos a origem pra que a fase dirigida
     possa corrigir o reino de uma linhagem bacteriana. */
  const origemEraBacteria = gAtual.reino === "Ba";

  /* v27 — o genoma de trabalho deixa de ser primordial já no primeiro passo.
     Uma trilha de deriva produz um DESCENDENTE da origem, não a origem de
     novo. Enquanto `isPrimordial` continuava true, toda normalização
     reaplicava a trava "primordial nasce bactéria" e devolvia `reino` para
     Ba — medido na trilha reversa: `reino` residual em 12 de 12 buscas,
     porque o ancestral hipotético é sempre uma bactéria primordial. */
  gAtual.isPrimordial = false;

  const bloqueio = motivoInatingivel(gAtual, alvo);
  if (bloqueio) {
    return { sucesso: false, motivo: "barreira-de-reino", motivoTexto: bloqueio, inatingivel: true, trilha: [], ciclos: 0, dlFinal: calcularDL(gAtual, alvo), gFinal: gAtual, genesResiduais: [] };
  }

  let melhorDL = calcularDL(gAtual, alvo);
  const dlInicial = melhorDL || 1;
  const trilha = [];
  let orcamento = 0;
  let ultimoYield = agoraMs();
  const yieldSeNecessario = async (fracao) => {
    if (agoraMs() - ultimoYield > 12) {
      if (onProgress) onProgress(Math.min(0.99, fracao));
      await cederControle();
      ultimoYield = agoraMs();
    }
  };

  /* ---------- Fase 1: deriva estocástica, com platô permitido ---------- */
  let guard = 0, semMelhoraSeguidas = 0;
  const SEM_MELHORA_MAX = 400;
  while (melhorDL > 0 && guard++ < GUARD_MAX_BUSCA_TRILHA && semMelhoraSeguidas < SEM_MELHORA_MAX) {
    const gTentativa = clonarGenoma(gAtual);
    const r = aplicarCicloDeriva(gTentativa, orcamento, sortFontePressao());
    const novoDL = calcularDL(gTentativa, alvo);
    const mexeu = r.genesAlterados.I.length + r.genesAlterados.II.length + r.genesAlterados.III.length > 0;
    if (novoDL < melhorDL) {
      gAtual = gTentativa; orcamento = r.orcamentoRestante; melhorDL = novoDL;
      trilha.push({ ...r.genesAlterados, fase: "deriva", valores: instantaneoDeGenes(gAtual, r.genesAlterados) });
      semMelhoraSeguidas = 0;
    } else if (novoDL === melhorDL && mexeu && Math.random() < 0.15) {
      // movimento lateral: atravessa platô sem piorar
      gAtual = gTentativa; orcamento = r.orcamentoRestante;
      trilha.push({ ...r.genesAlterados, fase: "deriva-lateral", valores: instantaneoDeGenes(gAtual, r.genesAlterados) });
      semMelhoraSeguidas++;
    } else {
      semMelhoraSeguidas++;
    }
    await yieldSeNecessario((1 - melhorDL / dlInicial) * 0.6);
  }

  /* ---------- Fase 2: convergência dirigida, gene a gene ---------- */
  let rodadas = 0;
  while (melhorDL > 0 && rodadas++ < MAX_RODADAS_DIRIGIDAS) {
    const divergentes = Object.keys(DL_PESOS).filter((k) => alvo[k] !== undefined && String(gAtual[k]) !== String(alvo[k]));
    if (!divergentes.length) break;
    // mais caros primeiro: um gene de Estrato I costuma arrastar os de baixo
    divergentes.sort((a, b) => (DL_PESOS[b] || 0) - (DL_PESOS[a] || 0));

    const aplicadosNestaRodada = { I: [], II: [], III: [], fase: "dirigida" };
    for (const k of divergentes) {
      if (GENE_FONTE_DERIVADA[k]) continue; // ver comentário abaixo: ajustados pela fonte
      // barreira de reino: só forçada se a linhagem nasceu bactéria
      if (k === "reino" && gAtual.reino !== "Ba" && !origemEraBacteria) continue;
      const antes = gAtual[k];
      fixarEspelhoRaw(gAtual, k, alvo[k]);
      if (String(gAtual[k]) !== String(antes)) {
        const estrato = ESTRATO_I.includes(k) ? "I" : ESTRATO_II.includes(k) ? "II" : "III";
        aplicadosNestaRodada[estrato].push(k);
      }
    }
    /* Genes DERIVADOS não aceitam atribuição direta — a normalização os
       recalcula a partir do gene-fonte. Ajustamos a fonte pelo delta em vez
       do resultado. Medido: `socSenciencia` divergia em 168 de 300 códigos
       reconstruídos justamente por isso. */
    for (const [derivado, fonte] of Object.entries(GENE_FONTE_DERIVADA)) {
      if (alvo[derivado] === undefined || gAtual[derivado] === undefined) continue;
      const delta = Number(alvo[derivado]) - Number(gAtual[derivado]);
      if (delta && Number.isFinite(delta) && gAtual[fonte] !== undefined) {
        gAtual[fonte] = Math.max(0, Math.min(9, Number(gAtual[fonte]) + delta));
      }
    }
    const limpo = normalizarGenoma(gAtual, gAtual.isPrimordial);
    Object.assign(gAtual, limpo);
    aplicarCorrecoesAutomaticas(gAtual);

    /* Anomalias: a normalização recalcula QUANTAS existem (a partir de
       `extremos`); aqui fixamos QUAIS são, copiando do alvo, respeitando a
       quantidade que o genoma atual comporta. */
    if (Array.isArray(alvo.__anomalias) && Array.isArray(gAtual.anomalias)) {
      const n = gAtual.anomalias.length;
      if (n > 0 && alvo.__anomalias.length >= n) {
        gAtual.anomalias = alvo.__anomalias.slice(0, n);
        gAtual.ano1 = gAtual.anomalias[0];
        gAtual.ano2 = gAtual.anomalias[1];
      }
    }

    const dlDepois = calcularDL(gAtual, alvo);
    const mudouAlgo = aplicadosNestaRodada.I.length + aplicadosNestaRodada.II.length + aplicadosNestaRodada.III.length > 0;
    if (mudouAlgo) trilha.push({ ...aplicadosNestaRodada, valores: instantaneoDeGenes(gAtual, aplicadosNestaRodada) });
    if (dlDepois >= melhorDL && !mudouAlgo) break; // travou de vez
    melhorDL = dlDepois;
    await yieldSeNecessario(0.6 + 0.4 * (1 - melhorDL / dlInicial));
  }

  if (onProgress) onProgress(1);

  const genesResiduais = Object.keys(DL_PESOS)
    .filter((k) => alvo[k] !== undefined && String(gAtual[k]) !== String(alvo[k]));

  /* "Bate 100%" é medido no artefato que o usuário de fato colou: o código
     DRN2 serializado. É o critério mais duro disponível e o único verificável
     dos dois lados. */
  const codigoFinal = serialize(gAtual);
  const alvoNormalizado = String(alvoCodigo).trim();
  const codigoIdentico = codigoFinal.replace(/-TAX:[^.]+\.[^.]+\.[^-]+/, "") === alvoNormalizado.replace(/^DRN2/, "DRN2").replace(/-TAX:[^.]+\.[^.]+\.[^-]+/, "");

  return {
    sucesso: melhorDL === 0,
    codigoIdentico, // ignora só o clado (nome próprio da espécie, não é gene)
    codigoFinal,
    trilha,
    dlFinal: melhorDL,
    ciclos: trilha.length,
    gFinal: gAtual,
    genesResiduais,
    inatingivel: melhorDL > 0,
    motivoTexto: melhorDL > 0
      ? `Restaram ${genesResiduais.length} gene(s) que a normalização do genoma reverte a cada tentativa (dependem de combinações que o alvo não declara): ${genesResiduais.join(", ")}.`
      : null,
  };
}

/* Serializa a trilha encontrada num texto colável — cada ciclo aceito vira
   um bloco `{gene:valor,...}` (só os genes que de fato mudaram naquele
   ciclo, lidos do gFinal reconstruído passo a passo), ciclos separados por
   `|`. Formato enxuto, no mesmo espírito de notação do resto do DRN2. */
function serializarTrilha(nodeOrigem, resultadoBusca) {
  if (!resultadoBusca.trilha.length) return "";
  let g = clonarGenoma(nodeOrigem.g);
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
    /* v32 — usa o instantâneo do ciclo quando existe (trilhas geradas por
       esta versão); cai no valor final só para trilhas antigas, coladas
       pelo usuário, que não têm a foto. */
    const foto = genesAlterados.valores || {};
    const pares = todos.map((k) => `${k}:${JSON.stringify(foto[k] !== undefined ? foto[k] : gFinal[k])}`);
    blocos.push(`{${pares.join(",")}}`);
  }
  return "TRILHA1|" + blocos.join("|");
}

/* ============================================================
   v29 — MATERIALIZAR TRILHA (gerar a linhagem encontrada)
   ============================================================
   Até aqui a trilha de deriva só sabia ser COPIADA: o resultado da busca
   virava um texto "TRILHA1|..." que o usuário colava, à mão, no campo de
   importação da criação de primordial. Ou seja: o app encontrava a
   linhagem inteira e depois entregava um único genoma final, jogando fora
   os passos intermediários — que são justamente a árvore genealógica que
   a busca acabou de descobrir.

   Aqui a mesma trilha vira nós de verdade no mundo: o ancestral (quando a
   busca foi para trás, é um primordial hipotético que ainda não existe), as
   espécies intermediárias e a espécie final. O critério de onde cortar uma
   espécie nova é o MESMO da deriva automática (checarEspeciacao): todo
   ciclo que mexe em gene de Estrato I corta espécie; os demais só
   acumulam. O último ciclo sempre corta, senão o alvo não existiria.

   `finalExistente` cobre o caso da busca para trás a partir de uma espécie
   que JÁ está na árvore: em vez de criar uma gêmea de DNA idêntico, a
   função devolve `anexarA` — o id do nó que deve virar pai da espécie
   existente (a reparentagem em si é feita por quem tem o estado da árvore
   em mãos, porque envolve remapear o primordialId da subárvore inteira).
   ============================================================ */
function materializarTrilha(resultado, opts = {}) {
  const { origem = null, massaId = null, auInicial = 0, finalExistente = null, ramosLaterais = PROB_RAMO_LATERAL_TRILHA } = opts;
  const blocos = resultado?.trilha || [];
  if (!blocos.length) return { novos: [], anexarA: null, motivo: "trilha-vazia" };

  const novos = [];
  let pai;
  if (origem) {
    pai = origem;
  } else {
    if (!resultado.ancestral) return { novos: [], anexarA: null, motivo: "sem-ancestral" };
    const gA = clonarGenoma(resultado.ancestral.g);
    gA.isPrimordial = true;
    const id = novoId();
    pai = {
      id, clado: gA.clado, g: gA, code: serialize(gA), auSurgimento: auInicial,
      pais: [], filhos: [], primordialId: id, ordem: 0, ciclosDecorridos: 0,
      orcamento: 0, acumEstratoII: new Set(), historico: [], isPrimordial: true,
      extinta: false, massaId: massaId || null, origemTrilha: true,
    };
    novos.push(pai);
    emitirEvento({
      tipo: "primordial", tipoLabel: "PRIMORDIAL SURGE", speciesId: id, clado: pai.clado,
      primordialId: id, primordialClado: pai.clado, auSurgimento: pai.auSurgimento,
      texto: `Espécie primordial ${pai.clado} (${REINO_LABEL_LOG[gA.reino] || gA.reino}) surge em ${auTextoLog(pai.auSurgimento)}, reconstruída como ancestral hipotético de uma trilha de deriva.`,
      code: pai.code,
    });
  }

  const g = clonarGenoma(pai.g);
  g.isPrimordial = false;
  const gFinal = resultado.gFinal || {};
  let au = pai.auSurgimento;
  let ciclosDesdeUltimoCorte = 0;
  const acumII = new Set();

  blocos.forEach((genesAlterados, i) => {
    const estruturais = genesAlterados.I || [];
    const chaves = [...estruturais, ...(genesAlterados.II || []), ...(genesAlterados.III || [])];
    const foto = genesAlterados.valores || {};
    for (const k of chaves) {
      const v = foto[k] !== undefined ? foto[k] : gFinal[k];
      if (v !== undefined) g[k] = v;
    }
    Object.assign(g, normalizarGenoma(g, false));
    ciclosDesdeUltimoCorte++;
    for (const k of (genesAlterados.II || [])) acumII.add(k);
    const ultimo = i === blocos.length - 1;
    /* Mesmo critério da deriva automática (checarEspeciacao): corta espécie
       quando muda gene de Estrato I, ou quando 6 genes de Estrato II já se
       acumularam desde o último corte. Sem a segunda via, uma trilha de 57
       ciclos com um único ciclo estrutural virava uma "linhagem" de dois
       nós — o ancestral e o alvo — e todo o meio do caminho sumia. */
    if (!checarEspeciacao(estruturais.length, acumII.size, 0, g) && !ultimo) return;

    au += Math.max(1e-6, ciclosDesdeUltimoCorte * duracaoCicloDeriva(g));
    if (ultimo && finalExistente) return; // o nó final já existe: quem chama reparenta
    /* No último nó usamos o genoma que a BUSCA de fato alcançou, não o
       replay bloco a bloco: o replay só reaplica os genes que mudaram em
       cada ciclo, e a normalização intermediária pode deslocar em 1 ponto
       algum escalar derivado (medido: socSenciencia). Como o ponto da
       trilha é chegar exatamente no alvo, o nó final tem que ser o alvo. */
    const paiAnterior = pai;
    const g2 = ultimo && gFinal && gFinal.reino ? clonarGenoma(gFinal) : clonarGenoma(g);
    g2.clado = sortClado();
    g2.isPrimordial = false;
    const id = novoId();
    const filho = {
      id, clado: g2.clado, g: g2, code: serialize(g2), auSurgimento: au,
      pais: [pai.id], filhos: [], primordialId: pai.primordialId, ordem: 0,
      ciclosDecorridos: 0, orcamento: 0, acumEstratoII: new Set(), historico: [],
      isPrimordial: false, extinta: false, massaId: massaId || pai.massaId || null,
      origemTrilha: true,
    };
    pai.filhos.push(id);
    emitirEvento({
      tipo: "especiacao", tipoLabel: "ESPECIAÇÃO (TRILHA)", speciesId: id, clado: filho.clado,
      maeId: pai.id, maeClado: pai.clado, primordialId: filho.primordialId,
      primordialClado: pai.primordialClado || pai.clado, auSurgimento: filho.auSurgimento,
      texto: `${filho.clado} especia a partir de ${pai.clado} após ${ciclosDesdeUltimoCorte} ciclo(s) de uma trilha de deriva materializada. Surge em ${auTextoLog(filho.auSurgimento)}.`,
      code: filho.code, codeAntes: pai.code,
    });
    novos.push(filho);

    /* v32 — RAMO LATERAL. Uma trilha materializada continuava sendo uma
       escada: um nó por degrau, sempre um único filho, nunca duas irmãs. Só
       que uma linhagem real não deixa de se ramificar só porque estamos
       contando a história de um dos ramos — as espécies-primas existem, elas
       é que não levam ao alvo.

       A cada corte, a população ancestral pode gerar TAMBÉM uma irmã, que
       recebe um ciclo de deriva próprio e para ali (é um beco, não parte do
       caminho até o alvo). Isso não afeta em nada a exatidão da trilha: o
       nó que continua rumo ao alvo é sempre `filho`, e a irmã é folha. */
    /* Nunca no último corte: o contrato de materializarTrilha é que o
       ÚLTIMO nó devolvido seja o alvo. Um ramo lateral empurrado depois dele
       tomaria esse lugar, e todo mundo que lê `novos[novos.length - 1]`
       esperando o alvo (a UI, os exports, a bateria) pegaria a espécie
       errada. */
    if (!ultimo && Math.random() < ramosLaterais) {
      const gIrma = clonarGenoma(g);
      gIrma.isPrimordial = false;
      aplicarCicloDeriva(gIrma, 0, null);
      Object.assign(gIrma, normalizarGenoma(gIrma, false));
      aplicarCorrecoesAutomaticas(gIrma);
      gIrma.clado = sortClado();
      const idIrma = novoId();
      const irma = {
        id: idIrma, clado: gIrma.clado, g: gIrma, code: serialize(gIrma),
        auSurgimento: au + Math.max(1e-6, duracaoCicloDeriva(gIrma) * 0.5),
        pais: [paiAnterior.id], filhos: [], primordialId: paiAnterior.primordialId, ordem: 0,
        ciclosDecorridos: 0, orcamento: 0, acumEstratoII: new Set(), historico: [],
        isPrimordial: false, extinta: false, massaId: massaId || paiAnterior.massaId || null,
        origemTrilha: true, ramoLateral: true,
      };
      paiAnterior.filhos.push(idIrma);
      emitirEvento({
        tipo: "especiacao", tipoLabel: "ESPECIAÇÃO (RAMO LATERAL)", speciesId: idIrma, clado: irma.clado,
        maeId: paiAnterior.id, maeClado: paiAnterior.clado, primordialId: irma.primordialId,
        primordialClado: paiAnterior.primordialClado || paiAnterior.clado, auSurgimento: irma.auSurgimento,
        texto: `${irma.clado} especia a partir de ${paiAnterior.clado} como ramo lateral da trilha — linhagem-irmã de ${filho.clado}, que não segue rumo ao DNA-alvo. Surge em ${auTextoLog(irma.auSurgimento)}.`,
        code: irma.code, codeAntes: paiAnterior.code,
      });
      novos.push(irma);
    }

    pai = filho;
    ciclosDesdeUltimoCorte = 0;
    acumII.clear();
  });

  return { novos, anexarA: finalExistente ? pai.id : null, ultimoId: pai.id };
}

/* ============================================================
   v32 — TRILHA RAMIFICADA (vários DNAs-alvo numa árvore só)
   ============================================================
   O relato foi direto: "a trilha não está bifurcando". E não estava mesmo —
   por construção. `materializarTrilha` percorre os ciclos em ordem, e no fim
   de cada corte faz `pai = filho`: o resultado é sempre uma escada, uma
   espécie por degrau, nunca duas irmãs. Uma trilha com um único destino não
   tem por que bifurcar; o que faltava era poder pedir VÁRIOS destinos.

   É exatamente o motor pedido junto: "adicionar DNA alvo" quantas vezes se
   quiser, e sair disso uma linhagem só. A construção é incremental:

     1. O primeiro alvo é buscado a partir da origem (ou de um ancestral
        primordial hipotético, quando não há origem) e materializado — esse
        é o TRONCO.
     2. Para cada alvo seguinte, o motor mede a distância genômica (DL) de
        TODOS os nós já criados até esse alvo e escolhe o mais próximo como
        ponto de ancoragem. A busca recomeça dali, e a trilha nova vira um
        RAMO pendurado naquele nó.
     3. Repete. Quanto mais alvos, mais galhos — e o ponto de bifurcação sai
        do parentesco real entre eles, não de um sorteio: dois alvos
        parecidos entre si divergem tarde, dois muito diferentes divergem
        perto da raiz.

   O critério de ancoragem por DL é o que dá sentido filogenético ao
   desenho. Se dois dragões e um peixe forem pedidos, os dragões vão
   compartilhar quase todo o tronco e o peixe vai sair lá de baixo — sem
   ninguém precisar dizer isso ao sistema.
   ============================================================ */

/* Escolhe, entre os nós disponíveis, o melhor ponto de partida para chegar
   a `alvo`. Nós de reino incompatível são descartados aqui mesmo (a
   barreira de reino tornaria a busca inatingível de qualquer forma), com
   uma exceção: bactéria alcança qualquer reino. */
function melhorAncora(nodes, alvoParseado) {
  const viaveis = [];
  for (const n of nodes) {
    if (!n || !n.g) continue;
    if (motivoInatingivel(n.g, alvoParseado)) continue;
    viaveis.push({ node: n, dl: calcularDL(n.g, alvoParseado) });
  }
  if (!viaveis.length) return null;
  viaveis.sort((a, b) => a.dl - b.dl);
  const melhorDL = viaveis[0].dl;

  /* Empate técnico resolvido pelo nó MAIS ANTIGO, não pelo mais próximo.

     Sem esta regra, a âncora caía quase sempre na ponta do ramo anterior —
     que é, afinal, o nó mais "evoluído" disponível — e o resultado era outra
     escada: cada alvo virava continuação do anterior em vez de irmão dele.
     Preferindo o ancestral mais antigo dentro de uma margem de 15% do melhor
     DL, os ramos passam a divergir mais perto da raiz, que é onde a
     divergência de fato acontece numa filogenia. A margem existe para isso
     não custar exatidão: fora dela, o DL continua mandando. */
  const margem = melhorDL * 1.15 + 6;
  const empatados = viaveis.filter((v) => v.dl <= margem);
  empatados.sort((a, b) => (a.node.auSurgimento ?? 0) - (b.node.auSurgimento ?? 0));
  return empatados[0];
}

/* Gera a linhagem inteira. Devolve os nós novos (já com pais/filhos
   ligados) e um relatório por alvo, para a UI poder dizer o que bateu 100%
   e o que ficou com genes residuais.

   opts:
     origem       — nó existente de onde partir (opcional). Sem ele, o motor
                    sorteia um ancestral primordial bactéria, como a trilha
                    reversa já fazia.
     massaId      — massa de terra onde a linhagem nasce
     auInicial    — ano de surgimento do ancestral
     onProgress   — callback(0..1)
*/
async function gerarLinhagemMultiAlvo(codigosAlvo, opts = {}) {
  const { origem = null, massaId = null, auInicial = 0, onProgress = null } = opts;
  const alvos = (codigosAlvo || []).map((c) => String(c).trim()).filter(Boolean);
  if (!alvos.length) return { novos: [], relatorio: [], motivo: "sem-alvos" };

  const novos = [];
  const relatorio = [];
  /* Pool de ancoragem: tudo que já existe nesta linhagem. Começa com a
     origem (quando há) e cresce a cada alvo materializado. */
  const candidatos = origem ? [origem] : [];

  for (let i = 0; i < alvos.length; i++) {
    const codigo = alvos[i];
    const relatar = (extra) => relatorio.push({ alvo: codigo, indice: i, ...extra });
    if (!ehCodigoDRN2(codigo)) { relatar({ sucesso: false, motivo: "Código DRN2 inválido." }); continue; }

    const alvoParseado = parseAlvoDLDoCode(codigo);
    const progressoBase = i / alvos.length;
    const reportar = (f) => { if (onProgress) onProgress(progressoBase + f / alvos.length); };

    const ancora = candidatos.length ? melhorAncora(candidatos, alvoParseado) : null;

    let resultado, paiDaTrilha;
    if (ancora) {
      resultado = await buscarTrilhaParaAlvo(ancora.node, codigo, reportar);
      paiDaTrilha = ancora.node;
    } else {
      /* Nenhuma âncora utilizável — nem porque não há nós ainda, nem porque
         todos estão do lado errado da barreira de reino. Cai na trilha
         reversa, que sorteia um ancestral bactéria (e bactéria alcança
         qualquer reino, então isso nunca falha por barreira). */
      resultado = await buscarTrilhaReversa(codigo, reportar, 3);
      paiDaTrilha = null;
    }

    if (!resultado || !resultado.trilha || !resultado.trilha.length) {
      relatar({ sucesso: false, motivo: resultado?.motivoTexto || "A busca não encontrou nenhuma trilha." });
      continue;
    }

    const mat = materializarTrilha(resultado, {
      origem: paiDaTrilha,
      massaId,
      auInicial,
    });
    if (!mat.novos.length) { relatar({ sucesso: false, motivo: "A trilha encontrada não gerou nenhum nó." }); continue; }

    for (const n of mat.novos) { novos.push(n); candidatos.push(n); }

    relatar({
      sucesso: !!resultado.codigoIdentico,
      ciclos: resultado.trilha.length,
      nosCriados: mat.novos.length,
      ancoraClado: paiDaTrilha ? paiDaTrilha.clado : null,
      ancoraDL: ancora ? ancora.dl : null,
      cladoFinal: mat.novos[mat.novos.length - 1]?.clado || null,
      genesResiduais: resultado.genesResiduais || [],
      motivo: resultado.codigoIdentico ? null : (resultado.motivoTexto || null),
    });
  }

  if (onProgress) onProgress(1);

  /* Contagem de bifurcação — é o número que o relato original cobrava, então
     ele volta explícito para a UI poder mostrar. */
  const filhosPorId = new Map();
  for (const n of novos) {
    for (const p of (n.pais || [])) filhosPorId.set(p, (filhosPorId.get(p) || 0) + 1);
  }
  let bifurcacoes = 0;
  for (const qtd of filhosPorId.values()) if (qtd >= 2) bifurcacoes++;

  return { novos, relatorio, bifurcacoes, alvos: alvos.length };
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
/* v26, otimização — o genoma é um objeto plano: só `anomalias` é array e
   nenhum valor é objeto aninhado. O round-trip JSON.parse(JSON.stringify(g))
   era o clone usado em todo lugar e custava ~5× mais que um spread. Medido no
   caminho quente (novaLinhagemState, chamado uma vez por especiação e uma vez
   por interação de seleção natural). */
function clonarGenoma(g) {
  const c = { ...g };
  if (Array.isArray(g.anomalias)) c.anomalias = g.anomalias.slice();
  return c;
}

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

    const key = sortGeneAlvo(estrato, g);
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

/* v32 — LIMIAR DE ESPECIAÇÃO POR REINO.

   Medido na v31, com 5 primordiais: 60 ciclos produziam 92% de bactérias na
   árvore; 300 ciclos, ainda 50%. A causa não era a barreira de reino (ela
   permite a travessia e a travessia acontece) — era a taxa de CORTE. Quase
   todo o Estrato I de uma bactéria está travado (membros, crânio, focinho,
   modo reprodutivo são fixos), então ela raramente corta por via estrutural,
   mas continuava cortando pelo acúmulo de 6 genes de Estrato II igual a
   qualquer outro reino. Resultado: o mundo enchia de bactérias
   ligeiramente diferentes umas das outras, gastando o orçamento de espécies
   que deveria ir para os outros reinos.

   O limiar agora acompanha a complexidade genômica do reino: uma bactéria
   precisa acumular bem mais deriva de Estrato II para valer uma espécie
   nova. Ela continua existindo do começo ao fim da simulação — só para de
   ocupar a maior parte da árvore. */
const LIMIAR_ESTRATO_II_POR_REINO = { Ba: 8, Fu: 8, Pl: 7, An: 6 };

function checarEspeciacao(acumEstratoI, acumII, dlAcumulada, g) {
  if (acumEstratoI > 0) return true;
  const limiar = (g && LIMIAR_ESTRATO_II_POR_REINO[g.reino]) || 6;
  if (acumII >= limiar) return true;
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
/* v26, correção #8 — o teto de 4000 era batido por uma simulação modesta
   (400 ciclos, 919 espécies = 4000/4000, poda ativada), fazendo qualquer run
   real perder histórico. O teto existe por causa da RENDERIZAÇÃO, não do
   armazenamento: agora o log persistido (o que vai pro export .pdf) guarda
   bem mais, e quem renderiza deve fatiar com getEventLogRecente(). */
const LIMITE_EVENTOS_LOG = 30000;
/* v26 — "extincao" entra aqui: é um evento que muda a árvore (uma espécie
   deixa de existir) e nunca deve ser descartado pela poda. */
const TIPOS_ESTRUTURAIS = new Set(["primordial", "especiacao", "selecao_natural", "edicao", "extincao"]);

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

/* v26, correção #9 — o motor chamava sortNomeIndividuo(), definida em
   04-ui-fases.js. Funcionava só porque os scripts compartilham o escopo
   global e carregam nessa ordem; quebrava ao reordenar os <script>, ao
   migrar para módulos ESM ou ao testar o motor isolado. O gerador de nomes
   passa a viver aqui, no motor, que é quem precisa dele; a camada de UI
   continua podendo chamar o mesmo nome (é a mesma função global). */
function sortNomeIndividuo() {
  const s = CONS[Math.floor(Math.random() * CONS.length)] + VOG[Math.floor(Math.random() * VOG.length)] +
    CONS[Math.floor(Math.random() * CONS.length)] + VOG[Math.floor(Math.random() * VOG.length)] +
    CONS[Math.floor(Math.random() * CONS.length)];
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

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
/* v28 — mapa único de rótulo de reino. Antes existia uma cópia aqui e outra
   em 04-ui-fases.js; a camada de teste (11-testes.js) precisava do nome da
   UI e quebrava quando rodava sem ela. `REINO_LABEL` é o nome que a UI e os
   exports já usam; `REINO_LABEL_LOG` continua como alias pro que o motor
   escreve nos logs. */
const REINO_LABEL = { An: "Animal", Pl: "Planta", Fu: "Fungo", Ba: "Bactéria", Ar: "Construto", Sp: "Espiritual" }; // Fase 1, item 4.1
const REINO_LABEL_LOG = REINO_LABEL;
/* v29 — a árvore mostra o reino ANTES do clado, para dar pra identificar a
   espécie sem abrir o card. Em tela de celular o nome inteiro come a linha,
   então aqui ficam a etiqueta curta e a cor de cada reino. */
const REINO_CURTO = { An: "ANI", Pl: "PLA", Fu: "FUN", Ba: "BAC", Ar: "CON", Sp: "ESP" };
const REINO_COR = {
  An: "text-orange-400/90", Pl: "text-lime-400/90", Fu: "text-violet-400/90",
  Ba: "text-cyan-400/90", Ar: "text-stone-400", Sp: "text-stone-400",
};
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

  const especiou = checarEspeciacao(genesAlterados.I.length, linhagemState.acumEstratoII.size, 0, linhagemState.g);
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

/* v32 — mesma ideia da constante acima, aplicada à trilha materializada: a
   chance de cada corte de espécie da trilha deixar para trás uma
   linhagem-irmã que não segue até o DNA-alvo. É o que transforma a trilha de
   uma escada numa árvore. Mais baixa que PROB_SOBREVIVENCIA_MAE de
   propósito: uma trilha costuma ter dezenas de cortes, e a 60% ela viraria
   mais ramo lateral do que caminho principal. */
const PROB_RAMO_LATERAL_TRILHA = 0.35;

/* ============================================================
   v32 — O TETO DE LINHAGENS VIROU UM ESCALONADOR
   ============================================================
   Até a v31, `MAX_LINHAGENS_ATIVAS = 40` era um teto POPULACIONAL: quando
   mais de 40 linhagens tentavam entrar numa rodada, o excedente era
   sorteado e EXTINTO ("extinção por saturação de linhagens"). Isso existia
   por um motivo puramente computacional — o custo da deriva é
   O(ciclos × linhagens vivas em paralelo), e sem teto o número de
   linhagens cresce quase exponencialmente com ~60% de sobrevivência
   materna por especiação. Mas o preço era alto e ficava visível na árvore:
   ramos inteiros morriam por uma regra que não é biologia nem geografia, é
   orçamento de CPU disfarçado de evento evolutivo.

   Agora o número passa a ser um teto de CONCORRÊNCIA, não de população:
   quantas linhagens avançam POR RODADA, como o tamanho de um pool de
   threads. As demais não morrem — ficam na fila e avançam nas rodadas
   seguintes, em rodízio (round-robin). O trabalho total continua limitado,
   e por isso a performance continua a mesma: o orçamento global é
   `ciclosAlvo × CONCORRENCIA_DERIVA` passos de ciclo, exatamente o mesmo
   pior caso que o teto antigo já impunha. A diferença é para onde vai esse
   trabalho: antes, o excedente era jogado fora junto com a linhagem; agora
   é redistribuído entre todas elas.

   Consequências:
     - some a categoria "extinta por saturação" (o campo continua no retorno,
       zerado, para não quebrar quem o lê);
     - uma linhagem que não recebeu ciclos suficientes não morre: ela
       simplesmente para de derivar, o que é um estado legítimo ("linhagem
       estável"), e continua viva na árvore;
     - o número de linhagens simultâneas deixa de ter limite.

   Extinção de verdade continua existindo, e vem de onde deveria vir: a
   seleção natural populacional (rodarCicloSelecaoIndividual), que mata por
   competição, predação e capacidade de suporte da divisão geográfica.

   CONCORRENCIA_DERIVA é ajustável em tempo de execução (o app expõe isso na
   UI) porque o custo por ciclo varia uma ordem de grandeza entre um desktop
   e um celular. */
let CONCORRENCIA_DERIVA = 64;
function setConcorrenciaDeriva(n) {
  CONCORRENCIA_DERIVA = Math.max(4, Math.min(512, Math.floor(Number(n) || 64)));
  return CONCORRENCIA_DERIVA;
}
function getConcorrenciaDeriva() { return CONCORRENCIA_DERIVA; }
/* Alias mantido só para código antigo que lia a constante pelo nome velho. */
const MAX_LINHAGENS_ATIVAS = CONCORRENCIA_DERIVA;

/* Teto absoluto de espécies que uma única chamada de derivarLinhagem pode
   gerar — protege a árvore (e o navegador) de crescer além do que dá pra
   renderizar. Subiu de 3.000 para 12.000 na v32: com o limiar de especiação
   por reino, a bactéria parou de consumir a maior parte desse orçamento
   (medido: de 56% para ~18% da árvore), e o pedido explícito é "quanto mais
   elementos gerar, melhor". A árvore em si aguenta porque ela renderiza sob
   demanda (nós recolhidos a partir da 2ª geração) e agora tem filtros. */
const MAX_ESPECIES_POR_DERIVACAO = 12000;

/* v26 — ESTIMATIVA DE TEMPO. O custo da deriva cresce linearmente com os
   ciclos (medido: 200 -> 1500 ciclos multiplicou o tempo por 6,6×, para 7,5×
   mais ciclos), então dá pra estimar antes de rodar. O motor ficou ~45% mais
   rápido nesta versão, mas 600 ciclos ainda são ~20s num celular — e o app é
   usado no celular. Em vez de esconder isso ou impor um teto artificial de
   ciclos (que empobrece a bifurcação da árvore), a UI passa a AVISAR: o
   usuário decide se vale a espera.

   A referência é calibrada em tempo de execução, na primeira chamada, com um
   micro-benchmark de 60 ciclos de deriva — assim a estimativa vale para o
   aparelho de quem está usando, e não para a máquina onde foi medida. */
let __msPorCicloMedido = null;
function calibrarCustoDeriva() {
  if (__msPorCicloMedido !== null) return __msPorCicloMedido;
  const amostra = buildSpecies(null, {}, false).g;
  const inicio = agoraMs();
  const N = 60;
  for (let i = 0; i < N; i++) aplicarCicloDeriva(clonarGenoma(amostra), 0, null);
  __msPorCicloMedido = Math.max(0.05, (agoraMs() - inicio) / N);
  return __msPorCicloMedido;
}

/* Estimativa por LINHAGEM ATIVA: uma deriva de N ciclos roda, na prática,
   N × (linhagens vivas em paralelo) ciclos de trabalho, com o teto de
   MAX_LINHAGENS_ATIVAS. Fator empírico 0.55 = fração média do teto ocupada
   ao longo de uma simulação típica (linhagens levam tempo pra saturar). */
function estimarTempoDeriva(ciclosAlvo, quantidadePrimordiais = 1) {
  const msCiclo = calibrarCustoDeriva();
  /* v32 — a estimativa deixou de ser um chute com fator empírico. O
     escalonador gasta exatamente `ciclosAlvo × CONCORRENCIA_DERIVA` passos de
     ciclo por primordial (é o orçamento global, não uma média observada),
     então o produto abaixo é o teto real, não uma aproximação. Ele só
     superestima quando a deriva termina antes por falta de linhagens vivas. */
  const segundos = (ciclosAlvo * CONCORRENCIA_DERIVA * msCiclo * quantidadePrimordiais) / 1000;
  return {
    segundos,
    texto: segundos < 3 ? "quase instantâneo"
      : segundos < 20 ? `~${Math.round(segundos)}s`
      : segundos < 120 ? `~${Math.round(segundos)}s (dá pra sair da tela e voltar)`
      : `~${Math.round(segundos / 60)} min`,
    pesado: segundos >= 20,
  };
}

function novaLinhagemState(node, fontePressaoFixa) {
  return {
    g: clonarGenoma(node.g),
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

  /* Pool de linhagens vivas. Ao contrário da v31, ele NÃO tem tamanho
     máximo: o que é limitado é quantas avançam por rodada (concorrência) e
     quanto trabalho total a chamada inteira pode gastar (orçamento global).
     Ninguém é extinto para caber. */
  const pool = [{ maeAtual: nodeInicialComPrimordial, state: novaLinhagemState(nodeInicialComPrimordial), ciclosRestantes: ciclosAlvo }];

  const concorrencia = Math.max(1, CONCORRENCIA_DERIVA);
  /* Orçamento global de passos de ciclo. É exatamente o pior caso do teto
     antigo (ciclosAlvo × teto), então o tempo de parede não piora — o que
     muda é que esse trabalho passa a ser REPARTIDO entre todas as linhagens
     em vez de concentrado nas 40 sobreviventes de um sorteio. */
  let orcamentoPassos = ciclosAlvo * concorrencia;
  const passosTotais = orcamentoPassos;

  let cursor = 0;          // ponteiro do rodízio dentro do pool
  let linhagensEncerradas = 0; // só contabilidade: linhagens que gastaram todos os ciclos
  let ultimoYield = agoraMs();

  while (orcamentoPassos > 0 && todasFilhas.length < MAX_ESPECIES_POR_DERIVACAO) {
    /* Seleciona a fatia desta rodada: até `concorrencia` linhagens que ainda
       têm ciclos a rodar, varrendo o pool circularmente a partir do cursor.
       O rodízio é o que garante que uma linhagem no fim da fila não fique
       eternamente sem ser simulada só porque nasceu tarde. */
    const rodada = [];
    let varridos = 0;
    while (rodada.length < concorrencia && varridos < pool.length) {
      const linhagem = pool[cursor % pool.length];
      cursor++;
      varridos++;
      if (linhagem.ciclosRestantes > 0) rodada.push(linhagem);
    }
    if (rodada.length === 0) break; // ninguém tem ciclos sobrando: acabou

    const nascidosNestaRodada = [];
    for (const linhagem of rodada) {
      if (orcamentoPassos <= 0) break;
      if (todasFilhas.length >= MAX_ESPECIES_POR_DERIVACAO) break;
      orcamentoPassos--;

      const { especiou } = avancarCicloNaLinhagem(linhagem.state);
      linhagem.ciclosRestantes -= 1;
      linhagem.state.idadeRodadas = (linhagem.state.idadeRodadas || 0) + 1;
      if (!especiou) continue;

      // especiação: a filha nova sempre nasce
      const maeAnterior = linhagem.maeAtual;
      const filha = especiar(maeAnterior, linhagem.state);
      const filhaComPrimordial = { ...filha, primordialClado };
      registrarNo(filha);
      todasFilhas.push(filha);

      /* A linha da filha CONTINUA no lugar da linhagem que acabou de
         especiar (herda os ciclos restantes dela) — é a mesma população,
         seguindo em frente com o genoma novo. */
      linhagem.maeAtual = filhaComPrimordial;
      linhagem.state = novaLinhagemState(filhaComPrimordial, linhagem.state.fontePressaoFixa);

      /* E a população-mãe pode sobreviver como linhagem-irmã independente —
         é daqui que saem espécies irmãs, primas e tias, ou seja, a
         BIFURCAÇÃO da árvore. Na v31 essa sobrevivência disputava vaga com
         o teto e era perdida em silêncio na maioria das vezes (medido no
         comentário da própria v31: 97%); agora ela simplesmente entra no
         pool, porque o pool não tem tamanho máximo. */
      if (Math.random() < PROB_SOBREVIVENCIA_MAE && linhagem.ciclosRestantes > 0) {
        nascidosNestaRodada.push({
          maeAtual: maeAnterior,
          state: novaLinhagemState(maeAnterior, linhagem.state.fontePressaoFixa),
          ciclosRestantes: linhagem.ciclosRestantes,
        });
      }
    }
    for (const nova of nascidosNestaRodada) pool.push(nova);

    /* Compactação do pool. Sem isso, a varredura circular teria que passar
       por cima de todas as linhagens já esgotadas para encontrar as vivas —
       com um pool de milhares de entradas e a maioria zerada, a busca da
       fatia vira o gargalo (O(pool) por rodada, quadrático no total). A
       compactação só roda quando vale a pena, para não realocar o array a
       cada rodada. */
    if (pool.length > 64) {
      let esgotadas = 0;
      for (const l of pool) if (l.ciclosRestantes <= 0) esgotadas++;
      if (esgotadas > pool.length / 2) {
        const vivas = pool.filter((l) => l.ciclosRestantes > 0);
        linhagensEncerradas += pool.length - vivas.length;
        pool.length = 0;
        for (const l of vivas) pool.push(l);
        cursor = 0;
      }
    }

    const agora = agoraMs();
    if (agora - ultimoYield > 12) {
      if (onProgress) onProgress(Math.min(0.99, 1 - orcamentoPassos / passosTotais));
      await cederControle();
      ultimoYield = agoraMs();
    }
  }

  const tetoAtingido = todasFilhas.length >= MAX_ESPECIES_POR_DERIVACAO;
  todasFilhas.tetoAtingido = tetoAtingido;
  /* v32 — nenhuma linhagem é mais extinta por saturação. O campo continua
     existindo (zerado) porque a UI e a bateria de testes o leem. */
  todasFilhas.extintasPorSaturacao = 0;
  todasFilhas.linhagensAoFinal = pool.length + linhagensEncerradas;
  todasFilhas.linhagensComCiclosSobrando = pool.filter((l) => l.ciclosRestantes > 0).length;
  todasFilhas.orcamentoEsgotado = orcamentoPassos <= 0;
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
/* v32 — QUANDO UMA ESPÉCIE DEIXA DE EXISTIR.

   A regra antiga era "morre no instante em que nasce o primeiro filho": a
   especiação substituía a mãe. Isso descrevia anagênese pura, e fazia
   sentido enquanto a mãe raramente sobrevivia à especiação. Deixou de fazer
   na v32: com o escalonador, a população-mãe entra no pool como linhagem
   irmã em ~60% das especiações e continua derivando por conta própria — ou
   seja, ela demonstravelmente continua existindo depois de ter filhos.
   Mantida a regra antiga, o slider de eras mostraria como morta uma espécie
   que a própria simulação continuou a fazer evoluir.

   Agora só encerra a existência o que de fato encerra: extinção explícita,
   registrada com AU e motivo pela seleção natural populacional. Sem
   extinção registrada, a espécie está viva até o presente. */
function auFimDeVida(node, idx) {
  if (node.extinta && typeof node.auExtincao === "number") return node.auExtincao;
  if (node.extinta) return node.auSurgimento; // extinta sem AU registrado: encerra onde surgiu
  return Infinity;
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

/* ============================================================
   v32 — SISTEMA DE FILTROS
   ============================================================
   O pedido era "filtros o mais abrangentes possível: por geografia, por
   elementos do DNA etc.". Escrever cada filtro à mão significaria trinta
   blocos de UI quase idênticos e uma lista que envelhece toda vez que um
   gene novo entra no sistema.

   Em vez disso, os filtros são DECLARADOS aqui, numa tabela, e a UI se
   desenha a partir dela. Um filtro é: de onde ler o valor no nó, como se
   chama, a que grupo pertence e que tipo de controle usa. Acrescentar um
   filtro novo é acrescentar uma linha — e um gene novo que ganhe tabela em
   `T` pode virar filtro de uma linha também.

   Três tipos:
     multi  — escolha múltipla sobre valores discretos (reino, dieta, bioma…)
     faixa  — intervalo numérico (peso, AU, magia, senciência…)
     bool   — sim/não/tanto faz (tem asa, é primordial, está extinta…)

   Todos os filtros ativos são combinados por E; dentro de um filtro `multi`,
   as opções marcadas são combinadas por OU. É o comportamento que qualquer
   um espera de uma barra de filtros, e o único que permite compor perguntas
   do tipo "réptil OU ave, alado, de mais de 200 kg, vivo na massa X".
   ============================================================ */

const GRUPO_FILTRO = {
  TAXONOMIA: "Taxonomia",
  CORPO: "Corpo",
  ECOLOGIA: "Ecologia",
  GEOGRAFIA: "Geografia",
  TEMPO: "Tempo e estado",
};

/* Constrói as opções de um filtro `multi` a partir de uma tabela do DRN2,
   já no formato { value, label } que a UI consome. */
function opcoesDeTabela(tabela) {
  return tabela.map((r) => ({ value: String(r.value), label: r.label }));
}

const FILTROS_ESPECIE = [
  // ---------- Taxonomia ----------
  { id: "reino", grupo: GRUPO_FILTRO.TAXONOMIA, label: "Reino", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.reino), ler: (n) => n.g.reino },
  { id: "classe", grupo: GRUPO_FILTRO.TAXONOMIA, label: "Classe", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.classeAn).concat([
      { value: "VEG", label: "Vegetal" }, { value: "FUN", label: "Fúngica" }, { value: "MIC", label: "Microbiana" },
    ]), ler: (n) => n.g.classe },

  // ---------- Corpo ----------
  { id: "porte", grupo: GRUPO_FILTRO.CORPO, label: "Porte", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.porte), ler: (n) => n.g.porte },
  { id: "simetria", grupo: GRUPO_FILTRO.CORPO, label: "Simetria", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.simetria), ler: (n) => n.g.simetria },
  { id: "locPrimario", grupo: GRUPO_FILTRO.CORPO, label: "Locomoção primária", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.locPrim), ler: (n) => n.g.locPrimario },
  { id: "tegTipo", grupo: GRUPO_FILTRO.CORPO, label: "Tegumento", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.tegTipo), ler: (n) => n.g.tegTipo },
  { id: "tegCor", grupo: GRUPO_FILTRO.CORPO, label: "Cor", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.tegCor), ler: (n) => n.g.tegCor },
  { id: "crnFormato", grupo: GRUPO_FILTRO.CORPO, label: "Crânio", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.crnFormato), ler: (n) => n.g.crnFormato },
  { id: "facDenticao", grupo: GRUPO_FILTRO.CORPO, label: "Dentição", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.facDenticao), ler: (n) => n.g.facDenticao },
  { id: "temAsa", grupo: GRUPO_FILTRO.CORPO, label: "Tem asas", tipo: "bool",
    ler: (n) => n.g.asaQtd !== 0 && n.g.asaQtd !== "0" },
  { id: "temCauda", grupo: GRUPO_FILTRO.CORPO, label: "Tem cauda", tipo: "bool",
    ler: (n) => n.g.cdaComp && n.g.cdaComp !== "0" },
  { id: "temChifre", grupo: GRUPO_FILTRO.CORPO, label: "Tem chifres", tipo: "bool",
    ler: (n) => n.g.crnChifreQtd && String(n.g.crnChifreQtd) !== "0" },
  { id: "pesoKg", grupo: GRUPO_FILTRO.CORPO, label: "Peso (kg)", tipo: "faixa",
    ler: (n) => calcularPesoCalorias(n.g).pesoKg, escalaLog: true },
  { id: "alturaM", grupo: GRUPO_FILTRO.CORPO, label: "Dimensão linear (m)", tipo: "faixa",
    ler: (n) => calcularPesoCalorias(n.g).alturaM, escalaLog: true },

  // ---------- Ecologia ----------
  { id: "dieBase", grupo: GRUPO_FILTRO.ECOLOGIA, label: "Dieta", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.dieBase), ler: (n) => n.g.dieBase },
  { id: "tolHidrica", grupo: GRUPO_FILTRO.ECOLOGIA, label: "Tolerância hídrica", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.tolHidrica), ler: (n) => n.g.tolHidrica },
  { id: "tolTermica", grupo: GRUPO_FILTRO.ECOLOGIA, label: "Tolerância térmica", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.tolTermica), ler: (n) => n.g.tolTermica },
  { id: "tolCiclo", grupo: GRUPO_FILTRO.ECOLOGIA, label: "Ciclo de atividade", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.tolCiclo), ler: (n) => n.g.tolCiclo },
  { id: "socEstrutura", grupo: GRUPO_FILTRO.ECOLOGIA, label: "Estrutura social", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.socEstrutura), ler: (n) => n.g.socEstrutura },
  { id: "repModo", grupo: GRUPO_FILTRO.ECOLOGIA, label: "Reprodução", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.repModo), ler: (n) => n.g.repModo },
  { id: "defArma", grupo: GRUPO_FILTRO.ECOLOGIA, label: "Arma natural", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.defArma), ler: (n) => n.g.defArma },
  { id: "senEspecial", grupo: GRUPO_FILTRO.ECOLOGIA, label: "Sentido especial", tipo: "multi",
    opcoes: () => opcoesDeTabela(T.senEspecial), ler: (n) => n.g.senEspecial },
  { id: "mag", grupo: GRUPO_FILTRO.ECOLOGIA, label: "Magia (0-9)", tipo: "faixa",
    ler: (n) => (n.g.mag ? Number(String(n.g.mag).slice(1)) : 0), min: 0, max: 9 },
  { id: "socSenciencia", grupo: GRUPO_FILTRO.ECOLOGIA, label: "Senciência (0-9)", tipo: "faixa",
    ler: (n) => Number(n.g.socSenciencia || 0), min: 0, max: 9 },
  { id: "anomalia", grupo: GRUPO_FILTRO.ECOLOGIA, label: "Tem anomalia", tipo: "bool",
    ler: (n) => Array.isArray(n.g.anomalias) && n.g.anomalias.length > 0 },

  // ---------- Geografia ----------
  { id: "massaId", grupo: GRUPO_FILTRO.GEOGRAFIA, label: "Massa de terra", tipo: "multi",
    opcoes: (ctx) => (ctx?.massas || []).map((m) => ({ value: m.id, label: m.nome })),
    ler: (n) => n.massaId },
  { id: "dominio", grupo: GRUPO_FILTRO.GEOGRAFIA, label: "Domínio climático", tipo: "multi",
    opcoes: () => listarDominiosDisponiveis().map((d) => ({ value: d, label: d })),
    /* Um nó pode "estar" em vários domínios: os da massa em que vive. Ler
       devolve uma lista, e o filtro casa se qualquer um dos valores marcados
       estiver nela. */
    ler: (n, ctx) => (ctx?.massaIdx?.get(n.massaId)?.dominios) || [] },
  { id: "bioma", grupo: GRUPO_FILTRO.GEOGRAFIA, label: "Bioma viável", tipo: "multi",
    opcoes: () => HABITAT_CODEX.map((b) => ({ value: b.nome, label: b.nome })),
    /* Aqui o valor não vem do nó, vem da LEITURA de habitat: quais biomas a
       criatura consegue ocupar na massa em que está. É o filtro que responde
       "me mostre tudo que vive em recife de coral". */
    ler: (n, ctx) => {
      const massa = ctx?.massaIdx?.get(n.massaId);
      const h = massa ? readHabitatNaMassa(n.g, massa) : readHabitat(n.g);
      return [...h.primary, ...h.marginal];
    } },

  // ---------- Tempo e estado ----------
  { id: "auSurgimento", grupo: GRUPO_FILTRO.TEMPO, label: "Ano de surgimento (AU)", tipo: "faixa",
    ler: (n) => n.auSurgimento },
  { id: "extinta", grupo: GRUPO_FILTRO.TEMPO, label: "Extinta", tipo: "bool", ler: (n) => !!n.extinta },
  { id: "isPrimordial", grupo: GRUPO_FILTRO.TEMPO, label: "É primordial", tipo: "bool", ler: (n) => !!n.isPrimordial },
  { id: "temDescendencia", grupo: GRUPO_FILTRO.TEMPO, label: "Tem descendência", tipo: "bool",
    ler: (n) => (n.filhos || []).length > 0 },
  { id: "origemTrilha", grupo: GRUPO_FILTRO.TEMPO, label: "Veio de trilha dirigida", tipo: "bool",
    ler: (n) => !!n.origemTrilha },
];

const FILTROS_POR_ID = new Map(FILTROS_ESPECIE.map((f) => [f.id, f]));

/* Estado de filtro (o que a UI guarda):
   {
     texto: "trecho de DNA ou nome de clado",
     au: 12345 | null,                        // corte temporal do slider
     campos: { reino: ["An","Pl"], pesoKg: { min: 1, max: 500 }, temAsa: true }
   }
   Um campo ausente, com lista vazia ou com bool `null` está DESLIGADO. */
function filtroEstaAtivo(filtro, valor) {
  if (valor === undefined || valor === null) return false;
  if (filtro.tipo === "multi") return Array.isArray(valor) && valor.length > 0;
  if (filtro.tipo === "bool") return typeof valor === "boolean";
  if (filtro.tipo === "faixa") {
    return valor && (Number.isFinite(Number(valor.min)) || Number.isFinite(Number(valor.max)));
  }
  return false;
}

function contarFiltrosAtivos(estado) {
  let n = 0;
  for (const [id, valor] of Object.entries(estado?.campos || {})) {
    const f = FILTROS_POR_ID.get(id);
    if (f && filtroEstaAtivo(f, valor)) n++;
  }
  if (estado?.texto && estado.texto.trim()) n++;
  if (Number.isFinite(estado?.au)) n++;
  return n;
}

function nodePassaNoFiltro(node, estado, ctx) {
  // corte temporal: a espécie tem que existir no AU escolhido
  if (Number.isFinite(estado?.au)) {
    if (node.auSurgimento > estado.au) return false;
    if (estado.au > auFimDeVida(node, ctx?.idx)) return false;
  }

  const texto = (estado?.texto || "").trim().toLowerCase();
  if (texto) {
    const alvo = `${node.clado} ${node.code}`.toLowerCase();
    if (!alvo.includes(texto)) return false;
  }

  for (const [id, valor] of Object.entries(estado?.campos || {})) {
    const filtro = FILTROS_POR_ID.get(id);
    if (!filtro || !filtroEstaAtivo(filtro, valor)) continue;
    const lido = filtro.ler(node, ctx);

    if (filtro.tipo === "bool") {
      if (!!lido !== valor) return false;
      continue;
    }
    if (filtro.tipo === "multi") {
      const marcados = valor.map(String);
      if (Array.isArray(lido)) {
        // valor multivalorado (domínios da massa, biomas viáveis): casa por interseção
        if (!lido.some((v) => marcados.includes(String(v)))) return false;
      } else if (!marcados.includes(String(lido))) return false;
      continue;
    }
    if (filtro.tipo === "faixa") {
      const num = Number(lido);
      if (!Number.isFinite(num)) return false;
      if (Number.isFinite(Number(valor.min)) && num < Number(valor.min)) return false;
      if (Number.isFinite(Number(valor.max)) && num > Number(valor.max)) return false;
    }
  }
  return true;
}

function filtrarEspecies(nodes, estado, ctx) {
  if (!estado || contarFiltrosAtivos(estado) === 0) return nodes;
  return nodes.filter((n) => nodePassaNoFiltro(n, estado, ctx));
}

/* Ids visíveis na ÁRVORE sob um filtro: os nós que passam, mais os
   ancestrais deles (mesmo reprovados), porque sem os ancestrais a árvore
   perde os galhos que ligam o resultado à raiz e o resultado some junto.
   É a mesma regra que o filtro "só vivas" da v29 já usava — generalizada. */
function idsVisiveisComFiltro(nodes, idx, estado, ctx) {
  if (!estado || contarFiltrosAtivos(estado) === 0) return null;
  const visiveis = new Set();
  const casam = new Set();
  for (const n of nodes) {
    if (!nodePassaNoFiltro(n, estado, ctx)) continue;
    casam.add(n.id);
    let cur = n, guard = 0;
    while (cur && guard++ < 2000) {
      if (visiveis.has(cur.id)) break;
      visiveis.add(cur.id);
      cur = cur.pais && cur.pais[0] ? idx.get(cur.pais[0]) : null;
    }
  }
  return { visiveis, casam };
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
/* v29 — presa de PREDAÇÃO é bicho. Antes qualquer coisa de blindagem baixa
   e lenta servia, e como planta, fungo e bactéria são por definição lentos e
   moles, um carnívoro "predava" um arbusto. Comer planta é herbivoria, e
   herbívoro nem entra nesta regra (dieBase hb/de já é excluída). */
function ehPresaAnimal(g) { return g.reino === "An"; }
function ehPresaVulneravel(g) {
  return (g.defBlindagem ?? 0) <= 3 && (g.locVelocidade ?? 0) <= 4;
}
/* v29 — competição é disputa por RECURSO, não por modo de andar. A regra
   antiga exigia dieta E locomoção primária idênticas; num mundo todo
   bacteriano (deriva N/F, dieta "de") isso batia quase sempre, mas assim
   que a v29 abriu a diversidade de reinos a coincidência exata virou rara e
   ecossistemas inteiros ficaram sem nenhuma interação — medido: em alguns
   mundos, 2 de 51 espécies tinham par interagível. Agora o que define o
   nicho é a mesma base alimentar disputada no mesmo meio (aquático,
   semiaquático ou terrestre): dois herbívoros do mesmo pântano competem,
   ande um deles saltando e o outro rastejando. */
function meioDe(g) { return g.tolHidrica === "aq" ? "aq" : (g.tolHidrica === "sa" || g.tolHidrica === "um") ? "sa" : "te"; }
function compartilhamNicho(gA, gB) {
  return gA.dieBase === gB.dieBase && gA.dieBase !== "0" && meioDe(gA) === meioDe(gB);
}

/* Compara duas espécies contemporâneas (mesmo AU/massa) e decide se há
   interação relevante entre elas. Retorna null se não há nada digno de
   nota (a maioria dos pares não interage de forma decisiva). Quando há,
   retorna { perdedora, vencedora, tipo: "predacao"|"competicao",
   motivo: texto legível para o log }. */
function avaliarInteracao(nodeA, nodeB) {
  const gA = nodeA.g, gB = nodeB.g;
  // predação: A caça B, ou B caça A
  if (ehPredadorViavel(gA) && ehPresaVulneravel(gB) && ehPresaAnimal(gB) && gA.dieBase !== "hb" && gA.dieBase !== "de") {
    return { perdedora: nodeB, vencedora: nodeA, tipo: "predacao", motivo: `${nodeA.clado} (armado, agressivo) predaria ${nodeB.clado} (pouco blindada e lenta)` };
  }
  if (ehPredadorViavel(gB) && ehPresaVulneravel(gA) && ehPresaAnimal(gA) && gB.dieBase !== "hb" && gB.dieBase !== "de") {
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
      texto: `${interacao.motivo}. Em ${auTextoLog(au)}, ${totalGenes} gene(s) alterado(s) por pressão de contemporâneos.`,
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
/* v26, correções #3/#4/#5 — três mudanças estruturais nesta função:

   #4 COBERTURA: antes, os dois loops aninhados paravam no PRIMEIRO par
   viável de cada divisão (`&& !vencedoraNode`). Medido: exatamente 8,0
   interações por ciclo (= nº de divisões) com 183 espécies vivas na massa,
   e 27-65 espécies coexistindo por divisão — ou seja, uma única disputa era
   resolvida e dezenas eram ignoradas; dobrar o número de espécies não
   aumentava a pressão em nada. Agora TODOS os pares viáveis da divisão são
   avaliados, e cada espécie perdedora sofre a pressão uma única vez por
   ciclo (a pior interação recebida — predação prevalece sobre competição),
   com um teto proporcional pra não explodir o custo em divisões lotadas.

   #5 CADÁVERES: antes, cada colisão fazia `individualsOut.map(...)` sobre o
   array inteiro (cópia completa por colisão) e os mortos ficavam no array
   pra sempre — medido: 543 de 1293 entradas eram cadáveres percorridos a
   cada ciclo. Agora as mutações são in-place sobre uma cópia rasa única
   feita no começo do ciclo, e os mortos antigos são podados no fim, mantendo
   só os TETO_CADAVERES_RETIDOS mais recentes (o suficiente pro badge "morto"
   da UI continuar tendo o que mostrar).

   #3 EXTINÇÃO: espécie que fica sem nenhum indivíduo vivo agora é marcada
   como extinta de fato (`extinta`/`auExtincao`/`motivoExtincao = "populacional"`)
   com evento de log dedicado. Antes, `extinta = true` só era escrito num
   único ponto do código inteiro — o descarte pelo teto de linhagens —, então
   47 espécies com zero indivíduos vivos seguiam marcadas como vivas na
   árvore, na lista e nos exports. */
const TETO_CADAVERES_RETIDOS = 300;   // quantos indivíduos mortos ficam no array pra exibição
const MAX_INTERACOES_POR_DIVISAO = 40; // teto de disputas resolvidas por divisão por ciclo
const CHANCE_MORTE_ULTIMO = 0.2;       // chance de o último indivíduo de uma divisão sucumbir a uma derrota
/* v26 — CAPACIDADE DE SUPORTE por divisão, contando TODAS as espécies juntas.
   O teto que existia (TETO_POPULACAO_POR_DIVISAO) era por espécie, então a
   população total de uma divisão crescia junto com o número de espécies:
   medido, 872 espécies levavam a 14.814 indivíduos vivos e a 953ms por ciclo
   (contra 108ms no começo). Um limite total por divisão é o que transforma
   espaço em recurso disputado — que é justamente o que a seleção natural
   deveria estar simulando — e mantém o custo por ciclo constante. */
const CAPACIDADE_POR_DIVISAO = 90;

function rodarCicloSelecaoIndividual(idx, individuals, massas, auAtual = 0) {
  const eventos = { colisoes: 0, nascimentos: 0, mortes: 0, migracoes: 0, extincoes: 0 };
  // cópia rasa ÚNICA por ciclo; daqui pra frente tudo é mutação in-place
  const individualsOut = individuals.slice();
  const novos = [];

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

      /* #4 — avalia TODOS os pares (com teto), e não só o primeiro viável.
         Guarda, por perdedora, só a pior interação recebida: predação
         prevalece sobre competição — mesmo critério que simularSelecaoNatural
         já usava na versão por AU. */
      const piorPorPerdedora = new Map();
      const prioridade = (r) => (r.tipo === "predacao" ? 2 : 1);
      let avaliadas = 0;
      for (let i = 0; i < especiesPresentes.length; i++) {
        for (let j = i + 1; j < especiesPresentes.length; j++) {
          if (avaliadas >= MAX_INTERACOES_POR_DIVISAO) break;
          const r = avaliarInteracao(especiesPresentes[i], especiesPresentes[j]);
          if (!r) continue;
          avaliadas++;
          const atual = piorPorPerdedora.get(r.perdedora.id);
          if (!atual || prioridade(r) > prioridade(atual)) piorPorPerdedora.set(r.perdedora.id, r);
        }
        if (avaliadas >= MAX_INTERACOES_POR_DIVISAO) break;
      }
      if (!piorPorPerdedora.size) continue;

      for (const [, interacao] of piorPorPerdedora) {
        const vencedoraNode = interacao.vencedora, perdedoraNode = interacao.perdedora;
        const { motivo, tipo } = interacao;
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
        /* v26 — Math.ceil virou Math.floor, mais um sorteio para o último
           indivíduo. Com `ceil`, uma população de 1 perdia sempre esse 1: a
           extinção virava consequência automática de uma única derrota. Como
           a correção #4 passou a resolver TODAS as disputas da divisão (e não
           só a primeira), isso zerava o ecossistema em poucos ciclos —
           medido: 92% de extinção em 60 ciclos. Com `floor`, uma população
           reduzida a 1 vira refúgio e só some se perder o sorteio de
           CHANCE_MORTE_ULTIMO, o que exige derrotas repetidas ao longo de
           vários ciclos. A extinção continua acontecendo; deixa de ser
           instantânea. */
        const numAfetados = indsPerdedora.length <= 1
          ? (Math.random() < CHANCE_MORTE_ULTIMO ? 1 : 0)
          : Math.floor(indsPerdedora.length / 2);
        const afetados = indsPerdedora.slice(0, numAfetados);
        const numMigram = Math.floor(afetados.length / 2);
        const queMigram = afetados.slice(0, numMigram);
        const queMorrem = afetados.slice(numMigram);

        // #5 — mutação in-place, sem varrer o array inteiro por colisão
        for (const i of queMorrem) { i.viva = false; i.auMorte = auAtual; }
        eventos.mortes += queMorrem.length;

        const vizinhas = queMigram.length ? divisoesVizinhas(divisao, DIVISOES_POR_MASSA) : [];
        if (queMigram.length && vizinhas.length) {
          const destino = vizinhas[Math.floor(Math.random() * vizinhas.length)];
          for (const i of queMigram) i.divisao = destino;
          eventos.migracoes += queMigram.length;
          emitirEvento({
            tipo: "migracao",
            tipoLabel: "MIGRAÇÃO",
            speciesId: perdedoraNode.id, clado: perdedoraNode.clado,
            primordialId: perdedoraNode.primordialId, primordialClado: idx.get(perdedoraNode.primordialId)?.clado || perdedoraNode.clado,
            texto: `${perdedoraNode.clado} perde disputa de população na divisão ${divisao} de ${massa.nome} e migra ${queMigram.length} indivíduo(s) para a divisão ${destino} (mantendo população de origem).`,
            code: perdedoraNode.code,
          });
        } else if (queMigram.length) {
          // v26 — sem divisão vizinha (mundo de 1 divisão), não há pra onde
          // migrar: os afetados morrem em vez de desaparecerem em silêncio.
          for (const i of queMigram) { i.viva = false; i.auMorte = auAtual; }
          eventos.mortes += queMigram.length;
        }

        const vivasVencedoraNaDivisao = indsDivisao.filter((i) => i.viva && i.especieId === vencedoraNode.id && i.divisao === divisao).length
          + novos.filter((i) => i.especieId === vencedoraNode.id && i.divisao === divisao && i.massaId === massa.id).length;
        const lotacaoDivisao = indsDivisao.filter((i) => i.viva).length
          + novos.filter((i) => i.divisao === divisao && i.massaId === massa.id).length;
        if (vivasVencedoraNaDivisao < TETO_POPULACAO_POR_DIVISAO && lotacaoDivisao < CAPACIDADE_POR_DIVISAO) {
          const novo = gerarPopulacaoParaEspecie(vencedoraNode, 1, DIVISOES_POR_MASSA, massa)[0];
          novo.divisao = divisao; novo.massaId = massa.id;
          novos.push(novo);
          eventos.nascimentos++;
        }
      }
    }
  }

  /* v26 — REPRODUÇÃO. Ao corrigir a cobertura (#4), a simulação passou a
     resolver todas as disputas de cada divisão em vez de uma só — e aí ficou
     visível um buraco que a cobertura baixa escondia: as populações só
     encolhiam. O único nascimento existente era o +1 da espécie vencedora de
     uma colisão; toda espécie derrotada perdia metade dos indivíduos a cada
     ciclo, sem nunca repor. Medido: o ecossistema colapsava para uma
     monocultura por divisão em ~50 ciclos e depois zerava as colisões.
     Agora toda espécie com população viva numa divisão pode gerar prole,
     com chance proporcional ao gene repProle (0-9) e limitada pelo mesmo
     teto por divisão que já existia. */
  const chaveDiv = (i) => `${i.massaId}|${i.divisao}|${i.especieId}`;
  const chaveLocal = (i) => `${i.massaId}|${i.divisao}`;
  const vivosPorDiv = new Map();
  const lotacaoPorLocal = new Map();
  for (const i of individualsOut.concat(novos)) {
    if (!i.viva) continue;
    const k = chaveDiv(i);
    vivosPorDiv.set(k, (vivosPorDiv.get(k) || 0) + 1);
    const kl = chaveLocal(i);
    lotacaoPorLocal.set(kl, (lotacaoPorLocal.get(kl) || 0) + 1);
  }
  const massaPorId = new Map(massas.map((m) => [m.id, m]));
  for (const [k, qtd] of vivosPorDiv) {
    if (qtd >= TETO_POPULACAO_POR_DIVISAO) continue;
    const [massaId, divisaoStr, especieId] = k.split("|");
    const kl = `${massaId}|${divisaoStr}`;
    if ((lotacaoPorLocal.get(kl) || 0) >= CAPACIDADE_POR_DIVISAO) continue; // divisão lotada
    const node = idx.get(especieId);
    if (!node || node.extinta) continue;
    const prole = Number(node.g.repProle ?? 4);
    const chance = 0.10 + 0.05 * prole; // repProle 0 -> 10%, repProle 9 -> 55%
    if (Math.random() >= chance) continue;
    const novo = gerarPopulacaoParaEspecie(node, 1, DIVISOES_POR_MASSA, massaPorId.get(massaId) || null)[0];
    novo.divisao = Number(divisaoStr); novo.massaId = massaId === "null" ? null : massaId;
    novos.push(novo);
    lotacaoPorLocal.set(kl, (lotacaoPorLocal.get(kl) || 0) + 1);
    eventos.nascimentos++;
  }

  let resultado = novos.length ? individualsOut.concat(novos) : individualsOut;

  /* #3 — extinção populacional: espécie sem nenhum indivíduo vivo é
     declarada extinta de fato. Só considera espécies que CHEGARAM a ter
     população (aparecem no array), pra não extinguir espécies que ainda
     nem foram povoadas. */
  const vivosPorEspecie = new Set();
  const conheceEspecie = new Set();
  for (const i of resultado) { conheceEspecie.add(i.especieId); if (i.viva) vivosPorEspecie.add(i.especieId); }
  for (const especieId of conheceEspecie) {
    if (vivosPorEspecie.has(especieId)) continue;
    const node = idx.get(especieId);
    if (!node || node.extinta) continue;
    node.extinta = true;
    node.auExtincao = Math.max(auAtual, node.auSurgimento);
    node.motivoExtincao = "populacional";
    eventos.extincoes++;
    emitirEvento({
      tipo: "extincao",
      tipoLabel: "EXTINÇÃO",
      speciesId: node.id, clado: node.clado,
      primordialId: node.primordialId, primordialClado: idx.get(node.primordialId)?.clado || node.clado,
      auSurgimento: node.auSurgimento,
      texto: `${node.clado} é extinta: perdeu o último indivíduo vivo em ${auTextoLog(node.auExtincao)} (extinção populacional, por pressão de contemporâneos).`,
      code: node.code,
    });
  }

  /* #5 — poda de cadáveres: mantém só os mais recentes, pra que os ciclos
     seguintes não continuem percorrendo milhares de mortos. */
  const mortos = resultado.filter((i) => !i.viva);
  if (mortos.length > TETO_CADAVERES_RETIDOS) {
    const manter = new Set(mortos.slice(-TETO_CADAVERES_RETIDOS).map((i) => i.id));
    resultado = resultado.filter((i) => i.viva || manter.has(i.id));
  }

  return { individuals: resultado, eventos };
}

/* Roda `ciclos` ciclos de seleção natural populacional em sequência,
   fatiado no tempo (mesmo padrão de derivarLinhagem) pra não travar
   a aba em runs longos. Retorna a lista de indivíduos atualizada, um
   resumo agregado e quanto o "ano atual" deve avançar (ciclos ×
   CICLO_SELECAO_AU). Muta os nós de espécie em lugar (mesmo padrão
   do resto do motor) — quem chama ainda precisa forçar o React a
   ver a mudança recriando o array de nodes. */
async function rodarSelecaoNaturalPopulacional(idx, individuals, massas, ciclos, onProgress, auInicial = 0) {
  let individualsAtual = individuals;
  const resumo = { colisoes: 0, nascimentos: 0, mortes: 0, migracoes: 0, extincoes: 0 }; // v26: +extincoes
  let ultimoCorte = agoraMs();
  for (let c = 0; c < ciclos; c++) {
    // v26 — o AU corrente é repassado ao ciclo pra datar mortes e extinções
    const auCiclo = auInicial + (c + 1) * CICLO_SELECAO_AU;
    const { individuals: out, eventos } = rodarCicloSelecaoIndividual(idx, individualsAtual, massas, auCiclo);
    individualsAtual = out;
    resumo.colisoes += eventos.colisoes;
    resumo.nascimentos += eventos.nascimentos;
    resumo.mortes += eventos.mortes;
    resumo.migracoes += eventos.migracoes; // Fase 2, item 5.5
    resumo.extincoes += eventos.extincoes; // v26, correção #3
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
  /* v26, correção #1 — âncora de assunto por reino. Sem isso, "creature" +
     "anatomically coherent" empurra qualquer gerador de imagem para bicho,
     mesmo quando a descrição é de uma planta. */
  const ANCORA_REINO = {
    Pl: "Fantasy BOTANICAL illustration of a plant organism — NOT an animal, NOT a creature with a face or limbs",
    Fu: "Fantasy MYCOLOGICAL illustration of a fungal organism — NOT an animal, NOT a creature with a face or limbs",
    Ba: "Scientific microscopy-style illustration of a single-celled microorganism — NOT an animal, NOT a multicellular creature",
  };
  const NEG_REINO = {
    Pl: " no animal anatomy, no face, no eyes, no mouth, no skull, no limbs, no legs, no wings, no fur, no scales",
    Fu: " no animal anatomy, no face, no eyes, no mouth, no skull, no limbs, no legs, no wings, no fur, no scales",
    Ba: " no animal anatomy, no face, no limbs, no macroscopic creature",
  };
  const abertura = ANCORA_REINO[g.reino]
    ? `${ANCORA_REINO[g.reino]}. Subject: ${nomeRef}.`
    : `Fantasy creature concept art of ${nomeRef}.`;
  const linhas = [
    abertura,
    ``,
    `CREATURE DESCRIPTION (in Portuguese — follow it closely, it is the authoritative source):`,
    descricao,
  ];
  if (destaques.length) linhas.push(``, `INDIVIDUAL TRAITS TO EMPHASIZE (this specimen only): ${destaques.join("; ")}.`);
  linhas.push(
    ``,
    ANCORA_REINO[g.reino]
      ? `STYLE: detailed naturalist/botanical plate illustration, digital painting, soft directional lighting, structurally coherent with the description above, highly detailed surface texture (bark, cuticle, membrane, mycelium), muted natural color palette unless the description states otherwise.`
      : `STYLE: detailed fantasy concept art, digital painting, dramatic rim lighting, anatomically coherent with the description above, highly detailed skin/scale/fur texture, muted natural color palette unless the description states otherwise.`,
    ANCORA_REINO[g.reino]
      ? `COMPOSITION: single full specimen reference plate, plain neutral background so the structure reads clearly, no other organisms, no scenery, no characters.`
      : `COMPOSITION: single full-body reference shot, slight 3/4 angle, plain neutral studio background so the anatomy reads clearly, no other characters, no scenery.`,
    `NEGATIVE PROMPT: no text, no watermark, no signature, no human clothing or armor unless explicitly described, no extra limbs beyond what is described, not cartoonish, not chibi.${NEG_REINO[g.reino] || ""}`
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

