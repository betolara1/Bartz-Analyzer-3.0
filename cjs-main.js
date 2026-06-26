// main.js (CJS)
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
// Desabilitar aceleração de hardware para evitar erros de cache de GPU
app.disableHardwareAcceleration();
const path = require("path");
const { exec } = require("child_process");
const fs = require("fs");
const fsp = fs.promises;
const chokidar = require("chokidar");
const fse = require("fs-extra");
const { validateXmlContent } = require(path.join(__dirname, "src", "lib", "xml-logic.js"));

let win = null;
let watcher = null;
let currentCfg = null;

const CFG_FILE = path.join(app.getPath("userData"), "settings.json");

function isUNC(p) { return typeof p === "string" && p.startsWith("\\\\"); }
function normalizeWin(p) { if (!p) return ""; return isUNC(p) ? p.replace(/\//g, "\\") : path.normalize(p); }

// Remove diacritics/accents from a string for robust matching
function removeAccents(str) {
  if (typeof str !== 'string') return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

async function loadCfg() { try { return JSON.parse(await fsp.readFile(CFG_FILE, "utf8")); } catch { return {}; } }
// saveCfg unificado será definido abaixo

async function checkWrite(dir) {
  try {
    if (!dir) return { exist: false, write: false, error: "vazio" };
    const p = normalizeWin(dir);
    await fse.ensureDir(p);
    const probe = path.join(p, `.probe_${Date.now()}.tmp`);
    await fsp.writeFile(probe, "ok");
    await fsp.unlink(probe);
    return { exist: true, write: true };
  } catch (e) {
    const exist = await fse.pathExists(dir).catch(() => false);
    return { exist, write: false, error: String((e && e.message) || e) };
  }
}

async function testPathsAll(cfg) {
  const keys = [
    "entrada",
    "exportacao",
    "ok",
    "erro",
    "logsErrors",
    "logsProcessed",
    "drawings",
  ];
  const out = {};
  for (const k of keys) out[k] = await checkWrite(cfg[k]);
  return out;
}

function send(evt, payload) {
  try { win && win.webContents.send("analyzer:event", { evt, payload }); } catch { }
}

ipcMain.on('renderer-error', (_, err) => {
  console.error('[Renderer Error]', err);
});

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV) {
    win.loadURL("http://localhost:5174/");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "dist/index.html"));
    // win.webContents.openDevTools({ mode: "detach" }); // Comentado para a versão final
  }
}

// --- HELPERS PARA VALIDAÇÃO NO ERP ---
function extractItemCodes(txt) {
  const itemMatches = Array.from(txt.matchAll(/<ITEM\b[\s\S]*?>/gi));
  const codes = [];
  for (const m of itemMatches) {
    const itemTag = m[0];
    const refMatch = itemTag.match(/\bREFERENCIA\s*=\s*"([^"]*)"/i);
    const baseMatch = itemTag.match(/\bITEM_BASE\s*=\s*"([^"]*)"/i);
    const ref = refMatch ? refMatch[1].trim() : "";
    const base = baseMatch ? baseMatch[1].trim() : "";
    const codigo = ref || base;
    if (codigo) {
      codes.push(codigo);
    }
  }
  return Array.from(new Set(codes));
}

async function checkCodeExistsInErp(codigo, cache = {}) {
  let processedCode = codigo.trim();
  const originalUpper = processedCode.toUpperCase();

  // Ignorar códigos de cores coringas (ex: TAPAFURO_CG1, CHAPA_CG2, etc)
  const wildcardPatterns = [
    'CHAPA_CG',
    'PAINEL_CG',
    'FITA_CG',
    'TAPAFURO_CG',
    'CAPA_CG'
  ];
  if (wildcardPatterns.some(p => originalUpper.includes(p))) {
    return true; // Ignora a consulta no ERP, assume como válido para este check
  }

  // 1. Remover sufixo CG1 ou CG2 do final do código (case-insensitive)
  if (/cg[12]$/i.test(processedCode)) {
    processedCode = processedCode.slice(0, -3);
  }

  // 2. Se o código terminar com um número seguido de exatamente duas letras (sufixo de cor), remove as duas letras
  if (/\d[a-zA-Z]{2}$/.test(processedCode)) {
    processedCode = processedCode.slice(0, -2);
  }

  const upperCode = processedCode.toUpperCase();
  if (!upperCode) return true;

  if (cache.results && cache.results.has(upperCode)) {
    return cache.results.get(upperCode);
  }

  let exists = false;

  // 1. Verificar CSV de painéis
  if (!exists && cache.panels) {
    exists = cache.panels.has(upperCode);
  } else if (!exists) {
    try {
      const csvPath = '\\\\192.168.1.10\\Promob\\codigos_paineis.csv';
      if (await fse.pathExists(csvPath)) {
        const content = await fsp.readFile(csvPath, 'utf8');
        const lines = content.split(/\r?\n/).filter(x => x.trim());
        const header = lines[0] || '';
        const delimiter = header.includes(';') ? ';' : '\t';
        cache.panels = new Set();
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(delimiter);
          if (cols.length < 2) continue;
          const rowCode = (cols[0] || '').trim().toUpperCase();
          if (rowCode) cache.panels.add(rowCode);
        }
        exists = cache.panels.has(upperCode);
      }
    } catch (csvErr) {
      console.error('[ERP Validation] Erro ao ler CSV de painéis:', csvErr.message);
    }
  }

  // 2. Verificar API de cores
  if (!exists && cache.colors) {
    exists = cache.colors.has(upperCode);
  } else if (!exists) {
    try {
      const url = `http://192.168.1.10:8081/api/cor?size=2000`;
      const response = await fetch(url, {
        headers: { 'X-API-KEY': 'bartznewmoveisapi' },
        signal: AbortSignal.timeout(15000)
      });
      if (response.ok) {
        if (response.status === 204) {
          exists = false;
        } else {
          const text = await response.text();
          if (!text || text.trim() === '') {
            exists = false;
          } else {
            const data = JSON.parse(text);
            let corResults = [];
            if (Array.isArray(data)) {
              corResults = data;
            } else if (data && Array.isArray(data.content)) {
              corResults = data.content;
            }
            cache.colors = new Set();
            corResults.forEach(item => {
              const fields = [
                item.siglaCor,
                item.sigla,
                item.code,
                item.itemCode,
                item.refComercial,
                item.id
              ];
              fields.forEach(f => {
                if (f) {
                  const clean = f.toString().trim().toUpperCase();
                  cache.colors.add(clean);
                }
              });
            });
            exists = cache.colors.has(upperCode);
          }
        }
      } else {
        exists = true; // Se falhou a resposta HTTP, assume que existe para evitar falso positivo
      }
    } catch (colorErr) {
      console.error('[ERP Validation] Erro ao buscar API de cores:', colorErr.message);
      exists = true; // Timeout ou erro de rede -> assume que existe
    }
  }

  // 3. Verificar API de itens do ERP
  if (!exists) {
    try {
      const url = `http://192.168.1.10:8081/api/item/search-code?q=${encodeURIComponent(upperCode)}`;
      const response = await fetch(url, {
        headers: { 'X-API-KEY': 'bartznewmoveisapi' },
        signal: AbortSignal.timeout(15000)
      });
      if (response.ok) {
        if (response.status === 204) {
          exists = false;
        } else {
          const text = await response.text();
          if (!text || text.trim() === '') {
            exists = false;
          } else {
            const data = JSON.parse(text);
            const erpResults = Array.isArray(data) ? data : (data ? [data] : []);
            exists = erpResults.some(item => {
              const fieldsToTry = [
                item.code,
                item.CODIGO,
                item.item_code,
                item.codeItem,
                item.refComercial
              ];
              return fieldsToTry.some(f => {
                if (!f) return false;
                const cleanField = f.toString().trim().toUpperCase();
                return cleanField === upperCode;
              });
            });
          }
        }
      } else {
        exists = true; // Falha na resposta -> assume que existe
      }
    } catch (erpErr) {
      console.error(`[ERP Validation] Erro ao buscar código ${upperCode} no ERP:`, erpErr.message);
      exists = true; // Timeout ou erro de rede -> assume que existe
    }
  }

  if (!cache.results) cache.results = new Map();
  cache.results.set(upperCode, exists);
  return exists;
}

// Cache global persistente para validação de ERP durante a sessão
const globalErpCache = new Map();
let globalPanelsCache = null;
let globalColorsCache = null;

// --- VALIDATION lendo conteúdo do XML e usando cfg.enableAutoFix ---
async function validateXml(fileFullPath, cfg = {}) {
  const raw = await fsp.readFile(fileFullPath, "utf8");
  const { payload, updatedTxt } = validateXmlContent(raw, cfg);

  // Set the file path back in payload (this part depends on the file system)
  payload.arquivo = path.resolve(fileFullPath);

  // If auto-fix was enabled and text changed, save it
  if (cfg.enableAutoFix && updatedTxt !== raw) {
    await fsp.writeFile(fileFullPath, updatedTxt, "utf8");
  }

  // Consulta ERP para validar se todos os itens existem
  try {
    const uniqueCodes = extractItemCodes(updatedTxt);
    if (uniqueCodes.length > 0) {
      const cache = {
        results: globalErpCache,
        panels: globalPanelsCache,
        colors: globalColorsCache
      };
      const results = [];


      // Lote de concorrência controlada de 5 por vez
      const limit = 5;
      for (let i = 0; i < uniqueCodes.length; i += limit) {
        const chunk = uniqueCodes.slice(i, i + limit);
        const chunkPromises = chunk.map(async (code) => {
          const exists = await checkCodeExistsInErp(code, cache);
          return { code, exists };
        });
        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);
      }

      // Sincronizar de volta os caches de panels e colors para a variável global
      globalPanelsCache = cache.panels;
      globalColorsCache = cache.colors;

      let missingAny = false;
      const missingErpItems = [];

      // Extrair todos os itens do XML para associar detalhes caso não existam no ERP
      const xmlItems = [];
      const itemMatches = Array.from(updatedTxt.matchAll(/<ITEM\b[\s\S]*?>/gi));
      for (const m of itemMatches) {
        const itemTag = m[0];
        const idMatch = itemTag.match(/\bID\s*=\s*"([^"]*)"/i);
        const refMatch = itemTag.match(/\bREFERENCIA\s*=\s*"([^"]*)"/i);
        const baseMatch = itemTag.match(/\bITEM_BASE\s*=\s*"([^"]*)"/i);
        const descMatch = itemTag.match(/\bDESCRICAO\s*=\s*"([^"]*)"/i);
        const largMatch = itemTag.match(/\bLARGURA\s*=\s*"([^"]*)"/i);
        const altMatch = itemTag.match(/\bALTURA\s*=\s*"([^"]*)"/i);
        const profMatch = itemTag.match(/\bPROFUNDIDADE\s*=\s*"([^"]*)"/i);
        const caminhoMatch = itemTag.match(/\bCAMINHOITEMCATALOG\s*=\s*"([^"]*)"/i);

        const ref = refMatch ? refMatch[1].trim() : "";
        const base = baseMatch ? baseMatch[1].trim() : "";
        const code = ref || base;

        if (code) {
          const parseDim = (val) => {
            if (!val) return "0";
            const num = parseFloat(val);
            return isNaN(num) ? "0" : Math.round(num).toString();
          };

          xmlItems.push({
            id: idMatch ? idMatch[1] : "",
            code: code,
            referencia: ref,
            itemBase: base,
            descricao: descMatch ? descMatch[1] : "",
            largura: parseDim(largMatch ? largMatch[1] : ""),
            altura: parseDim(altMatch ? altMatch[1] : ""),
            profundidade: parseDim(profMatch ? profMatch[1] : ""),
            caminhoItemCatalog: caminhoMatch ? caminhoMatch[1] : ""
          });
        }
      }

      for (const res of results) {
        if (!res.exists) {
          payload.erros.push({
            descricao: `o item não encontrado no erp (${res.code})`,
            referencia: res.code
          });
          missingAny = true;

          // Buscar itens correspondentes no XML para detalhar
          const matchingItems = xmlItems.filter(item => item.code.toUpperCase() === res.code.toUpperCase());
          for (const item of matchingItems) {
            if (!missingErpItems.some(x => x.id === item.id)) {
              missingErpItems.push(item);
            }
          }
        }
      }
      if (missingAny) {
        payload.tags.push("sem código erp");
        payload.meta.missingErpItems = missingErpItems;
        // Dedup final das tags e erros
        payload.tags = Array.from(new Set(payload.tags));
        const s = new Set();
        payload.erros = (payload.erros || []).filter(x => {
          const k = (typeof x === "string" ? x : x?.descricao || String(x)).toLowerCase();
          if (s.has(k)) return false; s.add(k); return true;
        });
      }
    }
  } catch (erpValErr) {
    console.error('[ERP Validation Flow] Erro crítico na validação ERP:', erpValErr.message);
  }

  return payload;
}

async function processOne(fileFullPath, cfg) {
  try {
    const analysis = await validateXml(fileFullPath, cfg);
    const isOK = (analysis.erros || []).length === 0;

    const baseName = path.basename(fileFullPath);
    const destDir = isOK ? (cfg.ok || cfg.exportacao) : (cfg.erro || cfg.exportacao);

    let finalPath = path.resolve(fileFullPath);
    const originalPath = path.resolve(fileFullPath); // Guardar caminho original
    let movedTo = null;

    if (destDir) {
      await fse.ensureDir(destDir);
      const target = path.join(destDir, baseName);
      if (path.resolve(target).toLowerCase() !== finalPath.toLowerCase()) {
        try {
          await fse.move(finalPath, target, { overwrite: true });
          finalPath = path.resolve(target);
          movedTo = path.resolve(destDir);

          // ✅ DELETAR arquivo antigo de ERRO se foi movido para OK
          if (isOK && originalPath.toLowerCase() !== finalPath.toLowerCase()) {
            try {
              await fse.remove(originalPath);
            } catch (delErr) {
              // Falha ao deletar é aceitável
            }
          }
        } catch { }
      }
    }

    const logDir = isOK ? cfg.logsProcessed : cfg.logsErrors;
    if (logDir) {
      await fse.ensureDir(logDir);
      const logName = baseName.replace(/\.xml$/i, '') + `_${isOK ? 'ok' : 'erro'}.json`;
      await fsp.writeFile(path.join(logDir, logName), JSON.stringify(analysis, null, 2), 'utf8');
    }

    send('file-validated', { ...analysis, arquivo: finalPath, movedTo });
  } catch (e) {
    send('error', { where: 'processOne', message: String(e?.message || e) });
  }
}


/** ================== IPC: SETTINGS (com enableAutoFix) ================== **/
ipcMain.handle("settings:load", async () => {
  const saved = await loadCfg();
  return {
    entrada: normalizeWin(saved.entrada || ""),
    exportacao: normalizeWin(saved.exportacao || saved.working || ""),
    ok: normalizeWin(saved.ok || ""),
    erro: normalizeWin(saved.erro || ""),
    logsErrors: normalizeWin(saved.logsErrors || ""),
    logsProcessed: normalizeWin(saved.logsProcessed || ""),
    drawings: normalizeWin(saved.drawings || ""),
    enableAutoFix: !!saved.enableAutoFix,
  };
});

/** Prepara objeto de config pronto para salvar (sanitizado) **/
function sanitizeCfg(obj) {
  return {
    entrada: normalizeWin(obj?.entrada || ""),
    exportacao: normalizeWin(obj?.exportacao || obj?.working || ""),
    ok: normalizeWin(obj?.ok || ""),
    erro: normalizeWin(obj?.erro || ""),
    logsErrors: normalizeWin(obj?.logsErrors || ""),
    logsProcessed: normalizeWin(obj?.logsProcessed || ""),
    drawings: normalizeWin(obj?.drawings || ""),
    enableAutoFix: !!obj?.enableAutoFix,
  };
}

/** Salvar config **/
async function saveCfg(obj) {
  const final = sanitizeCfg(obj);
  await fse.writeJson(CFG_FILE, final, { spaces: 2 });
  currentCfg = final;
  return final;
}

/** Objeto de teste p/ pasta **/
async function testPaths(obj) {
  const payload = sanitizeCfg(obj);
  const res = {};
  for (const k of ["entrada", "exportacao", "ok", "erro"]) {
    res[k] = await checkWrite(payload[k]);
  }
  for (const k of ["logsErrors", "logsProcessed", "drawings"]) {
    res[k] = await checkWrite(payload[k]);
  }
  return res;
}

ipcMain.handle("settings:save", async (_e, obj) => {
  const next = sanitizeCfg(obj);
  await saveCfg(next);
  currentCfg = next;
  return { ok: true, saved: next };
});

ipcMain.handle("settings:testPaths", async (_e, obj) => {
  const cfg = sanitizeCfg(obj);
  return await testPaths(cfg);
});

ipcMain.handle("settings:pickFolder", async (_e, initial) => {
  const res = await dialog.showOpenDialog(win, {
    defaultPath: initial || undefined,
    properties: ["openDirectory", "createDirectory"],
  });
  if (res.canceled || !res.filePaths?.length) return null;
  return res.filePaths[0];
});

/** ================== IPC: ANALYZER ================== **/
ipcMain.handle("analyzer:start", async (_e, overrideCfg) => {
  try {
    const saved = currentCfg && Object.keys(currentCfg).length ? currentCfg : await loadCfg();
    const raw = overrideCfg && Object.keys(overrideCfg).length ? overrideCfg : saved;

    const cfg = {
      entrada: normalizeWin(raw.entrada),
      exportacao: normalizeWin(raw.exportacao || raw.working),
      ok: normalizeWin(raw.ok),
      erro: normalizeWin(raw.erro),
      logsErrors: normalizeWin(raw.logsErrors),
      logsProcessed: normalizeWin(raw.logsProcessed),
      enableAutoFix: !!raw.enableAutoFix,
    };

    for (const k of ["entrada", "exportacao", "ok", "erro"]) {
      if (!cfg[k]) { send("error", { where: "start", message: `Config inválida: '${k}' vazio.` }); return false; }
      await fse.ensureDir(cfg[k]);
    }
    currentCfg = cfg;

    if (watcher) { send("started", { watching: cfg.entrada }); return true; }

    const isUncEntrada = isUNC(cfg.entrada);
    watcher = chokidar.watch(cfg.entrada, {
      ignoreInitial: false,
      depth: 0,
      awaitWriteFinish: { stabilityThreshold: 600, pollInterval: 120 },
      usePolling: isUncEntrada,
      interval: isUncEntrada ? 800 : 100,
    });

    watcher.on("add", (p) => p.toLowerCase().endsWith(".xml") && processOne(p, cfg));
    watcher.on("change", (p) => p.toLowerCase().endsWith(".xml") && processOne(p, cfg));
    watcher.on("error", (err) => send("error", { where: "watch", message: String(err) }));

    send("started", { watching: cfg.entrada });
    return true;
  } catch (e) {
    send("error", { where: "start", message: String((e && e.message) || e) });
    return false;
  }
});

ipcMain.handle("analyzer:stop", async () => {
  try {
    if (watcher) { await watcher.close(); watcher = null; }
    send("stopped", {});
    return true;
  } catch (e) {
    send("error", { where: "stop", message: String((e && e.message) || e) });
    return false;
  }
});

ipcMain.handle("analyzer:scanOnce", async () => {
  try {
    const cfg = currentCfg || (await loadCfg());
    if (!cfg?.entrada) { send("error", { where: "scanOnce", message: "Entrada não configurada." }); return false; }
    const files = await fsp.readdir(cfg.entrada);
    for (const f of files) if (f.toLowerCase().endsWith(".xml")) await processOne(path.join(cfg.entrada, f), cfg);
    send("scan-finished", {});
    return true;
  } catch (e) {
    send("error", { where: "scanOnce", message: String((e && e.message) || e) });
    return false;
  }
});

/** -------- helpers para openInFolder / reprocessOne -------- **/
function dirname(p) { try { return path.dirname(p); } catch { return ""; } }
async function resolveFilePathMaybeBase(input, cfg) {
  if (!input) return null;
  if (await fse.pathExists(input)) return input;
  const base = path.basename(input);
  const candidates = [cfg?.entrada, cfg?.ok, cfg?.erro, cfg?.exportacao].filter(Boolean);
  for (const dir of candidates) {
    const full = path.join(dir, base);
    if (await fse.pathExists(full)) return full;
  }
  return null;
}

/** --- abrir na pasta --- */
ipcMain.handle("analyzer:openInFolder", async (_e, fileFullPath) => {
  try {
    const cfg = currentCfg || (await loadCfg());
    const real = await resolveFilePathMaybeBase(fileFullPath, cfg);
    if (!real) {
      send("error", { where: "openInFolder", message: "Arquivo não encontrado." });
      return false;
    }

    const p = path.resolve(real);

    if (process.platform === "win32") {
      exec(`explorer.exe /select,"${p.replace(/\//g, "\\")}"`);
    } else if (process.platform === "darwin") {
      exec(`open -R "${p}"`);
    } else {
      const dir = path.dirname(p);
      try { await shell.openPath(dir); } catch { }
    }

    return true;
  } catch (e) {
    send("error", { where: "openInFolder", message: String((e && e.message) || e) });
    return false;
  }
});

/** --- reprocessar --- */
ipcMain.handle("analyzer:reprocessOne", async (_e, fileFullPath) => {
  try {
    const cfg = currentCfg || (await loadCfg());
    if (!cfg?.exportacao) { send("error", { where: "reprocessOne", message: "Config faltando (Exportação)." }); return false; }

    const real = await resolveFilePathMaybeBase(fileFullPath, cfg);
    if (!real) { send("error", { where: "reprocessOne", message: "Arquivo não encontrado." }); return false; }

    await fse.ensureDir(cfg.exportacao);
    const base = path.basename(real);
    const staging = path.join(cfg.exportacao, base);

    await fse.copy(real, staging, { overwrite: true });
    await processOne(staging, cfg);
    return true;
  } catch (e) {
    send("error", { where: "reprocessOne", message: String((e && e.message) || e) });
    return false;
  }
});

// função auxiliar para escapar caracteres especiais de regex
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
}
// arquivos de backup/histórico para replace/desfazer
const REPLACE_BACKUP_DIR = path.join(app.getPath('userData'), 'backups');
const REPLACE_HISTORY_FILE = path.join(app.getPath('userData'), 'replace-history.json');

async function readReplaceHistory() {
  try { return JSON.parse(await fsp.readFile(REPLACE_HISTORY_FILE, 'utf8')); } catch { return []; }
}
async function writeReplaceHistory(arr) {
  try { await fse.ensureFile(REPLACE_HISTORY_FILE); await fsp.writeFile(REPLACE_HISTORY_FILE, JSON.stringify(arr || [], null, 2), 'utf8'); } catch { }
}
async function appendReplaceHistory(entry) {
  const h = await readReplaceHistory();
  h.push(entry);
  await writeReplaceHistory(h);
}

/** --- replace a detected cor coringa in the given file (creates backup + history) --- **/
ipcMain.handle("analyzer:replaceCoringa", async (_e, obj) => {
  try {
    const { filePath, from, to } = obj || {};
    if (!filePath || !from || typeof to === 'undefined') { send('error', { where: 'replaceCoringa', message: 'Parâmetros inválidos.' }); return { ok: false, message: 'invalid-params' }; }

    const cfg = currentCfg || (await loadCfg());
    const real = await resolveFilePathMaybeBase(filePath, cfg);
    if (!real) { send('error', { where: 'replaceCoringa', message: 'Arquivo não encontrado.' }); return { ok: false, message: 'not-found' }; }

    // read original
    const raw = await fsp.readFile(real, 'utf8');

    const re = new RegExp(`\\b${escapeRegExp(String(from))}\\b`, 'gi');
    let count = 0;
    const replaced = raw.replace(re, (m) => { count++; return String(to); });
    if (count === 0) return { ok: false, message: 'no-match' };

    // garantir diretório de backup e escrever cópia de backup
    await fse.ensureDir(REPLACE_BACKUP_DIR);
    const base = path.basename(real);
    const backupName = `${base.replace(/\.xml$/i, '')}_backup_${Date.now()}.xml`;
    const backupPath = path.join(REPLACE_BACKUP_DIR, backupName);
    try { await fse.copy(real, backupPath, { overwrite: true }); } catch (e) { /* continuar mesmo se backup falhar */ }

    // escrever conteúdo substituído
    await fsp.writeFile(real, replaced, 'utf8');

    // adicionar entrada ao histórico
    const entry = {
      id: Date.now(),
      file: path.resolve(real),
      backupPath: backupPath,
      timestamp: new Date().toISOString(),
      from: String(from),
      to: String(to),
      replaced: count,
      undone: false,
    };
    try { await appendReplaceHistory(entry); } catch (e) { /* ignorar */ }

    // reprocessar arquivo atualizado (vai revalidar e mover se necessário)
    try { await processOne(real, cfg); } catch (e) { /* ignorar */ }

    return { ok: true, replaced: count, backupPath };
  } catch (e) {
    send('error', { where: 'replaceCoringa', message: String((e && e.message) || e) });
    return { ok: false, message: String((e && e.message) || e) };
  }
});

/** --- undo last replace for a given file --- **/
ipcMain.handle('analyzer:undoReplace', async (_e, obj) => {
  try {
    const { filePath } = obj || {};
    if (!filePath) return { ok: false, message: 'invalid-params' };
    const real = path.resolve(filePath);
    const hist = await readReplaceHistory();
    // encontrar última entrada correspondente para este arquivo que não foi desfeita
    for (let i = hist.length - 1; i >= 0; i--) {
      const en = hist[i];
      if (!en || en.undone) continue;
      // corresponder caminho exato ou mesmo nome base (caso arquivo foi movido após processamento)
      if (path.resolve(en.file) === real || path.basename(en.file) === path.basename(real)) {
        const backup = en.backupPath;
        if (!backup || !(await fse.pathExists(backup))) return { ok: false, message: 'backup-not-found' };
        // restaurar
        try { await fse.copy(backup, real, { overwrite: true }); } catch (e) { return { ok: false, message: 'restore-failed' }; }
        // marcar desfeito
        hist[i].undone = true;
        await writeReplaceHistory(hist);
        // reprocessar
        try { await processOne(real, currentCfg || await loadCfg()); } catch (e) { /* ignorar */ }
        return { ok: true, restored: true, entry: hist[i] };
      }
    }
    return { ok: false, message: 'no-history' };
  } catch (e) {
    send('error', { where: 'undoReplace', message: String((e && e.message) || e) });
    return { ok: false, message: String((e && e.message) || e) };
  }
});

/** --- replace all CG1/CG2 occurrences in a file according to provided map --- **/
ipcMain.handle('analyzer:replaceCgGroups', async (_e, obj) => {
  try {
    const { filePath, map } = obj || {};
    if (!filePath || !map || (typeof map !== 'object')) { return { ok: false, message: 'invalid-params' }; }

    const cfg = currentCfg || (await loadCfg());
    const real = await resolveFilePathMaybeBase(filePath, cfg);
    if (!real) return { ok: false, message: 'not-found' };

    const raw = await fsp.readFile(real, 'utf8');
    let replacedText = raw;
    const counts = {};
    // aplicar substituições para chaves conhecidas (cg1, cg2) -- case-insensitive
    for (const key of Object.keys(map)) {
      const val = map[key];
      if (!val) { counts[key] = 0; continue; }
      const re = new RegExp(escapeRegExp(key.toString()), 'gi');
      let c = 0;
      replacedText = replacedText.replace(re, (m) => { c++; return String(val); });
      counts[key] = c;
    }

    const total = Object.values(counts).reduce((s, n) => s + (n || 0), 0);
    if (total === 0) return { ok: false, message: 'no-match' };

    // backup
    await fse.ensureDir(REPLACE_BACKUP_DIR);
    const base = path.basename(real);
    const backupName = `${base.replace(/\.xml$/i, '')}_backup_cg_${Date.now()}.xml`;
    const backupPath = path.join(REPLACE_BACKUP_DIR, backupName);
    try { await fse.copy(real, backupPath, { overwrite: true }); } catch (e) { /* continuar */ }

    // escrever substituído
    await fsp.writeFile(real, replacedText, 'utf8');

    // entrada do histórico
    const entry = {
      id: Date.now(),
      file: path.resolve(real),
      backupPath,
      timestamp: new Date().toISOString(),
      type: 'cg-groups',
      map,
      counts,
      undone: false,
    };
    try { await appendReplaceHistory(entry); } catch (e) { /* ignorar */ }

    // reprocessar
    try { await processOne(real, cfg); } catch (e) { /* ignorar */ }

    return { ok: true, counts, backupPath };
  } catch (e) {
    send('error', { where: 'replaceCgGroups', message: String((e && e.message) || e) });
    return { ok: false, message: String((e && e.message) || e) };
  }
});

/** --- fill empty REFERENCIA attributes (REFERENCIA="" -> REFERENCIA="<value>") --- **/
ipcMain.handle('analyzer:fillReferencia', async (_e, obj) => {
  try {
    const { filePath, value } = obj || {};
    if (!filePath || typeof value === 'undefined') return { ok: false, message: 'invalid-params' };

    const cfg = currentCfg || (await loadCfg());
    const real = await resolveFilePathMaybeBase(filePath, cfg);
    if (!real) return { ok: false, message: 'not-found' };

    const raw = await fsp.readFile(real, 'utf8');
    const re = /\bREFERENCIA\s*=\s*""/gi;
    let count = 0;
    const replaced = raw.replace(re, (m) => { count++; return `REFERENCIA="${String(value)}"`; });
    if (count === 0) return { ok: false, message: 'no-match' };

    // backup
    await fse.ensureDir(REPLACE_BACKUP_DIR);
    const base = path.basename(real);
    const backupName = `${base.replace(/\.xml$/i, '')}_backup_ref_${Date.now()}.xml`;
    const backupPath = path.join(REPLACE_BACKUP_DIR, backupName);
    try { await fse.copy(real, backupPath, { overwrite: true }); } catch (e) { /* continue */ }

    await fsp.writeFile(real, replaced, 'utf8');

    const entry = {
      id: Date.now(),
      file: path.resolve(real),
      backupPath,
      timestamp: new Date().toISOString(),
      type: 'fill-referencia',
      value: String(value),
      replaced: count,
      undone: false,
    };
    try { await appendReplaceHistory(entry); } catch (e) { /* ignore */ }

    try { await processOne(real, cfg); } catch (e) { /* ignore */ }

    return { ok: true, replaced: count, backupPath };
  } catch (e) {
    send('error', { where: 'fillReferencia', message: String((e && e.message) || e) });
    return { ok: false, message: String((e && e.message) || e) };
  }
});

/** --- preencher REFERENCIA apenas para IDs específicas de ITEM --- **/
ipcMain.handle('analyzer:fillReferenciaByIds', async (_e, obj) => {
  try {
    const { filePath, replacements } = obj || {};
    // replacements: [{ id: string, value: string }, ...]
    if (!filePath || !Array.isArray(replacements) || replacements.length === 0) return { ok: false, message: 'invalid-params' };

    const cfg = currentCfg || (await loadCfg());
    const real = await resolveFilePathMaybeBase(filePath, cfg);
    if (!real) return { ok: false, message: 'not-found' };

    let raw = await fsp.readFile(real, 'utf8');
    const counts = {};

    for (const rep of replacements) {
      const id = rep?.id;
      const value = rep?.value;
      if (!id || typeof value === 'undefined') { counts[id] = 0; continue; }

      // Encontrar a tag ITEM com ID correspondente e substituir REFERENCIA dentro dela
      // FIX CRÍTICO: Não usar [\s\S]*? sem terminação apropriada
      // Em vez disso, corresponder apenas até /> ou fechamento > 
      const escapedId = escapeRegExp(String(id));

      // Este regex lida adequadamente com tags multi-linha ao:
      // 1. Começar com <ITEM
      // 2. Usar [^<]* para corresponder atributos (qualquer coisa exceto outra tag)
      // 3. Permitir quebras de linha nos atributos com \s explícito
      // 4. Corresponder atributo ID
      // 5. Corresponder resto dos atributos até > ou />
      const itemRegex = new RegExp(`<ITEM(?:[^<]|\\n)*?ID\\s*=\\s*"${escapedId}"(?:[^<]|\\n)*?(?:>|/>)`, 'gi');

      let c = 0;
      const originalRaw = raw; // Guardar para debug
      raw = raw.replace(itemRegex, (itemMatch) => {
        // Se foi passada uma descrição, verifica se bate (para lidar com duplicados de ID)
        if (rep.descricao) {
          const mDesc = itemMatch.match(/\bDESCRICAO\s*=\s*"([^"]*)"/i);
          const currentDesc = mDesc ? mDesc[1] : "";
          if (currentDesc !== rep.descricao) return itemMatch;
        }

        // Passo 2: Substituir REFERENCIA dentro dessa tag ITEM específica
        // APENAS se estiver vazia ou não existir
        let updated = itemMatch;
        const refAttrRegex = /REFERENCIA\s*=\s*"([^"]*)"/i;
        const matchRef = updated.match(refAttrRegex);

        if (matchRef) {
          const currentRef = matchRef[1] || "";
          // Só substitui se estiver vazio
          if (currentRef.trim() === "") {
            updated = updated.replace(refAttrRegex, `REFERENCIA="${String(value)}"`);
            c++;
          }
        } else {
          // Atributo REFERENCIA não existe, adiciona antes do fechamento
          updated = updated.replace(/[\s\S]*?>/, (match) => {
            return match.replace(/[\s\n]*>/, ` REFERENCIA="${String(value)}"`);
          });
          c++;
        }
        return updated;
      });

      counts[id] = c;

      if (c === 0) {
        // Nenhuma correspondência encontrada
      }
    }

    const total = Object.values(counts).reduce((s, n) => s + (n || 0), 0);
    if (total === 0) return { ok: false, message: 'no-match' };

    // backup
    await fse.ensureDir(REPLACE_BACKUP_DIR);
    const base = path.basename(real);
    const backupName = `${base.replace(/\.xml$/i, '')}_backup_refids_${Date.now()}.xml`;
    const backupPath = path.join(REPLACE_BACKUP_DIR, backupName);
    try { await fse.copy(real, backupPath, { overwrite: true }); } catch (e) { /* continue */ }

    // escrever arquivo
    await fsp.writeFile(real, raw, 'utf8');

    // Verificar se foi escrito
    const writtenContent = await fsp.readFile(real, 'utf8');

    // history
    const entry = {
      id: Date.now(),
      file: path.resolve(real),
      backupPath,
      timestamp: new Date().toISOString(),
      type: 'fill-referencia-ids',
      replacements,
      counts,
      undone: false,
    };
    try { await appendReplaceHistory(entry); } catch (e) { /* ignorar */ }

    // Reprocessar arquivo (isso também o moverá se necessário)
    // Mas precisamos rastrear o novo caminho se ele se mover
    let finalPath = path.resolve(real);
    const originalPath = finalPath; // Guardar caminho original para limpeza
    try {
      const analysis = await validateXml(real, cfg);
      const isOK = (analysis.erros || []).length === 0;
      const baseName = path.basename(real);
      const destDir = isOK ? (cfg.ok || cfg.exportacao) : (cfg.erro || cfg.exportacao);

      if (destDir) {
        await fse.ensureDir(destDir);
        const target = path.join(destDir, baseName);
        if (path.resolve(target).toLowerCase() !== finalPath.toLowerCase()) {
          try {
            await fse.move(finalPath, target, { overwrite: true });
            finalPath = path.resolve(target);

            // DELETAR arquivo antigo de ERRO se foi movido para OK
            if (isOK && originalPath.toLowerCase() !== finalPath.toLowerCase()) {
              try {
                await fse.remove(originalPath);
              } catch (delErr) {
                // Falha ao deletar é aceitável
              }
            }
          } catch { }
        }
      }

      const logDir = isOK ? cfg.logsProcessed : cfg.logsErrors;
      if (logDir) {
        await fse.ensureDir(logDir);
        const logName = baseName.replace(/\.xml$/i, '') + `_${isOK ? 'ok' : 'erro'}.json`;
        await fsp.writeFile(path.join(logDir, logName), JSON.stringify(analysis, null, 2), 'utf8');
      }

      send('file-validated', { ...analysis, arquivo: finalPath });
    } catch (e) {
      send('error', { where: 'fillReferenciaByIds-processOne', message: String(e?.message || e) });
    }

    return { ok: true, counts, backupPath, arquivo: finalPath };
  } catch (e) {
    send('error', { where: 'fillReferenciaByIds', message: String((e && e.message) || e) });
    return { ok: false, message: String((e && e.message) || e) };
  }
});

/** --- replace DESCRICAO attribute for specific ITEM IDs --- **/
ipcMain.handle('analyzer:replaceItemDescription', async (_e, obj) => {
  try {
    const { filePath, ids, newDescription, desenho } = obj || {};
    if (!filePath || !Array.isArray(ids) || ids.length === 0 || typeof newDescription !== 'string') {
      send('error', { where: 'replaceItemDescription', message: 'Parâmetros inválidos.' });
      return { ok: false, message: 'invalid-params' };
    }

    const cfg = currentCfg || (await loadCfg());
    const real = await resolveFilePathMaybeBase(filePath, cfg);
    if (!real) {
      send('error', { where: 'replaceItemDescription', message: 'Arquivo não encontrado.' });
      return { ok: false, message: 'not-found' };
    }

    let raw = await fsp.readFile(real, 'utf8');
    const counts = {};

    for (const id of ids) {
      if (!id) continue;
      
      // Step 1: Build the itemRegex targeting by ID (unique identifier in XML)
      const escapedId = escapeRegExp(String(id));
      const itemRegex = new RegExp(`<ITEM(?:[^<]|\\n)*?ID\\s*=\\s*"${escapedId}"(?:[^<]|\\n)*?(?:>|/>)`, 'gi');

      let oldDesc = "";
      let itemDrawing = desenho || "";
      
      // Step 2: Find the old description and drawing from the correct item tag
      const matchItems = raw.match(itemRegex) || [];
      let matchedItemTag = "";

      if (desenho) {
        for (const itemTag of matchItems) {
          const desenhoAttrRegex = /DESENHO\s*=\s*"([^"]*)"/i;
          const matchDes = itemTag.match(desenhoAttrRegex);
          if (matchDes && matchDes[1] === desenho) {
            matchedItemTag = itemTag;
            break;
          }
        }
      }

      if (!matchedItemTag && matchItems.length > 0) {
        matchedItemTag = matchItems[0];
      }

      if (matchedItemTag) {
        const descAttrRegex = /DESCRICAO\s*=\s*"([^"]*)"/i;
        const matchDesc = matchedItemTag.match(descAttrRegex);
        if (matchDesc) {
          oldDesc = matchDesc[1];
        }
        
        if (!itemDrawing) {
          const desenhoAttrRegex = /DESENHO\s*=\s*"([^"]*)"/i;
          const matchDesenho = matchedItemTag.match(desenhoAttrRegex);
          if (matchDesenho) {
            itemDrawing = matchDesenho[1];
          }
        }
      }

      let c = 0;
      
      // Step 3: Replace DESCRICAO on the correct ITEM tag
      raw = raw.replace(itemRegex, (itemMatch) => {
        if (desenho) {
          const desenhoAttrRegex = /DESENHO\s*=\s*"([^"]*)"/i;
          const matchDes = itemMatch.match(desenhoAttrRegex);
          const currentDesenho = matchDes ? matchDes[1] : "";
          if (currentDesenho !== desenho) {
            return itemMatch;
          }
        }

        let updated = itemMatch;
        const descAttrRegex = /DESCRICAO\s*=\s*"([^"]*)"/i;
        const matchDesc = updated.match(descAttrRegex);

        if (matchDesc) {
          updated = updated.replace(descAttrRegex, `DESCRICAO="${String(newDescription)}"`);
          c++;
        } else {
          updated = updated.replace(/[\s\S]*?>/, (match) => {
            return match.replace(/[\s\n]*>/, ` DESCRICAO="${String(newDescription)}"`);
          });
          c++;
        }
        return updated;
      });

      // Step 4: If we found an old description, replace `<COLUNA CODIGO="PartName" RESPOSTA="..." />` ONLY inside corresponding `<SETUP>` blocks
      if (oldDesc) {
        if (itemDrawing) {
          const escapedDesenho = escapeRegExp(itemDrawing);
          const setupRegex = /<SETUP\b[\s\S]*?<\/SETUP>/gi;
          
          raw = raw.replace(setupRegex, (setupBlock) => {
            const hasDrawing = new RegExp(`\\b${escapedDesenho}\\b`, 'i').test(setupBlock);
            if (hasDrawing) {
              const escapedOldDesc = escapeRegExp(oldDesc.trim());
              const partNameRegex = new RegExp(`<COLUNA\\s+CODIGO\\s*=\\s*"PartName"\\s+RESPOSTA\\s*=\\s*"\\s*${escapedOldDesc}\\s*"\\s*/>`, 'gi');
              
              return setupBlock.replace(partNameRegex, () => {
                c++;
                return `<COLUNA CODIGO="PartName" RESPOSTA="${String(newDescription)}" />`;
              });
            }
            return setupBlock;
          });
        } else {
          // Fallback globally if no drawing code is found
          const escapedOldDesc = escapeRegExp(oldDesc.trim());
          const partNameRegex = new RegExp(`<COLUNA\\s+CODIGO\\s*=\\s*"PartName"\\s+RESPOSTA\\s*=\\s*"\\s*${escapedOldDesc}\\s*"\\s*/>`, 'gi');
          
          raw = raw.replace(partNameRegex, () => {
            c++;
            return `<COLUNA CODIGO="PartName" RESPOSTA="${String(newDescription)}" />`;
          });
        }
      }

      counts[id] = c;
    }

    const total = Object.values(counts).reduce((s, n) => s + (n || 0), 0);
    if (total === 0) return { ok: false, message: 'no-match' };

    // backup
    await fse.ensureDir(REPLACE_BACKUP_DIR);
    const base = path.basename(real);
    const backupName = `${base.replace(/\.xml$/i, '')}_backup_desc_${Date.now()}.xml`;
    const backupPath = path.join(REPLACE_BACKUP_DIR, backupName);
    try { await fse.copy(real, backupPath, { overwrite: true }); } catch (e) { /* continue */ }

    // escrever arquivo
    await fsp.writeFile(real, raw, 'utf8');

    // history
    const entry = {
      id: Date.now(),
      file: path.resolve(real),
      backupPath,
      timestamp: new Date().toISOString(),
      type: 'replace-description',
      ids,
      newDescription,
      counts,
      undone: false,
    };
    try { await appendReplaceHistory(entry); } catch (e) { /* ignorar */ }

    // Reprocessar arquivo
    let finalPath = path.resolve(real);
    const originalPath = finalPath;
    try {
      const analysis = await validateXml(real, cfg);
      const isOK = (analysis.erros || []).length === 0;
      const baseName = path.basename(real);
      const destDir = isOK ? (cfg.ok || cfg.exportacao) : (cfg.erro || cfg.exportacao);

      if (destDir) {
        await fse.ensureDir(destDir);
        const target = path.join(destDir, baseName);
        if (path.resolve(target).toLowerCase() !== finalPath.toLowerCase()) {
          try {
            await fse.move(finalPath, target, { overwrite: true });
            finalPath = path.resolve(target);

            if (isOK && originalPath.toLowerCase() !== finalPath.toLowerCase()) {
              try {
                await fse.remove(originalPath);
              } catch (delErr) { }
            }
          } catch { }
        }
      }

      const logDir = isOK ? cfg.logsProcessed : cfg.logsErrors;
      if (logDir) {
        await fse.ensureDir(logDir);
        const logName = baseName.replace(/\.xml$/i, '') + `_${isOK ? 'ok' : 'erro'}.json`;
        await fsp.writeFile(path.join(logDir, logName), JSON.stringify(analysis, null, 2), 'utf8');
      }

      send('file-validated', { ...analysis, arquivo: finalPath });
    } catch (e) {
      send('error', { where: 'replaceItemDescription-processOne', message: String(e?.message || e) });
    }

    return { ok: true, counts, backupPath, arquivo: finalPath };
  } catch (e) {
    send('error', { where: 'replaceItemDescription', message: String((e && e.message) || e) });
    return { ok: false, message: String((e && e.message) || e) };
  }
});


/** ================== IPC: SEARCH CSV PRODUCT ================== **/
ipcMain.handle('analyzer:searchErpProduct', async (_e, params) => {
  try {
    const { code, desc, type } = params || {};

    // Configurações de prefixo por tipo
    const typePrefixes = {
      'CHAPAS': '10.01.',
      'FITAS': '10.02.',
      'TAPAFURO': '10.15.',
      'CAPA': '10.03.'
    };

    // Prefixos permitidos para "TODOS"
    const allowedPrefixes = ['10.01.', '10.02.', '10.15.', '10.03.'];

    let allResults = [];

    // ==========================================================
    // 1. BUSCA EM CSV (Se type === 'PAINEL' ou 'TODOS')
    // ==========================================================
    if (type === 'PAINEL' || !type) {
      console.log('[Analyzer] Buscando no CSV de painéis (\\\\192.168.1.10\\Promob\\codigos_paineis.csv)...');
      const csvPath = '\\\\192.168.1.10\\Promob\\codigos_paineis.csv';

      if (await fse.pathExists(csvPath)) {
        const content = await fsp.readFile(csvPath, 'utf8');
        const lines = content.split(/\r?\n/).filter(x => x.trim());
        const header = lines[0] || '';
        const delimiter = header.includes(';') ? ';' : '\t';
        const searchCode = (code || '').trim().toUpperCase();
        const searchDesc = (desc || '').trim().toUpperCase();
        const searchTerms = searchDesc.split(/\s+/).filter(t => t.length > 0);

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(delimiter);
          if (cols.length < 2) continue;
          const rowCode = (cols[0] || '').trim().toUpperCase();
          const rawDesc = (cols[1] || '').trim().toUpperCase();
          const rowThickness = (cols[2] || '').trim().toUpperCase();

          let match = false;
          if (searchCode) {
            if (rowCode === searchCode || rowCode.startsWith(searchCode)) match = true;
          } else if (searchTerms.length > 0) {
            match = searchTerms.every(term => {
              const cleanTerm = term.replace(/MM$/i, '');
              const cleanTermNoAccent = removeAccents(cleanTerm);
              const termNoAccent = removeAccents(term);
              const rawDescNoAccent = removeAccents(rawDesc);
              const inDesc = rawDescNoAccent.includes(termNoAccent) || rawDescNoAccent.includes(cleanTermNoAccent);
              const inThickness = rowThickness && (rowThickness === term || rowThickness === cleanTerm);
              return inDesc || inThickness;
            });
          } else {
            match = true;
          }

          if (match) {
            allResults.push({
              code: (cols[0] || '').trim(),
              description: rawDesc,
              thickness: (cols[2] || '').trim()
            });
          }
        }
      }
    }

    // ==========================================================
    // 1.1 BUSCA EM API DE CORES (Se type === 'CORINGA')
    // ==========================================================
    if (type === 'CORINGA') {
      const searchDesc = (desc || '').trim().toUpperCase();
      const codeTerm = (code || '').trim().toUpperCase();
      
      // Sempre buscar todas as cores com proteção de tamanho para fazer filtragem local com suporte a acentos
      const url = `http://192.168.1.10:8081/api/cor?size=2000`;

      console.log(`[COR API] Solicitando todos os registros para filtragem local: ${url}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(url, {
          headers: { 'X-API-KEY': 'bartznewmoveisapi' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          let corResults = [];
          if (Array.isArray(data)) {
            corResults = data;
          } else if (data && Array.isArray(data.content)) {
            corResults = data.content;
          } else if (data) {
            corResults = [data];
          }

          console.log(`[COR API] Resultados recebidos: ${corResults.length}`);

          corResults.forEach(item => {
            const rowCode = (item.siglaCor || item.sigla || item.code || item.CODIGO || item.refComercial || item.id || '').toString().trim();
            const rawDesc = (item.descricao || item.description || item.DESCRICAO || item.nome || '').toString().trim();

            if (!rowCode) return;

            // Limpeza de descrição para o select
            const rowDescFormatted = rawDesc.split('-')[0]
              .replace(/\b(MDF|MDP|1F|2F|BP|\d{1,2}MM)\b/gi, '')
              .replace(/\s+/g, ' ')
              .trim();

            allResults.push({
              code: rowCode,
              description: rowDescFormatted || rowCode
            });
          });

          // Filtragem local inteligente com suporte a acentos
          if (searchDesc || codeTerm) {
            const queryClean = removeAccents(searchDesc || codeTerm).toUpperCase();
            allResults = allResults.filter(res => {
              const codeClean = removeAccents(res.code).toUpperCase();
              const descClean = removeAccents(res.description).toUpperCase();
              return codeClean.includes(queryClean) || descClean.includes(queryClean);
            });
          }

          // Remover duplicatas baseadas na descrição formatada
          const uniqueMap = new Map();
          for (const res of allResults) {
            if (!uniqueMap.has(res.description)) {
              uniqueMap.set(res.description, res);
            }
          }
          allResults = Array.from(uniqueMap.values());
        }
      } catch (err) {
        clearTimeout(timeoutId);
        console.error(`[COR API] Erro na requisição ${url}:`, err.message);
      }
    }

    // ==========================================================
    // 2. BUSCA NO ERP (Sempre executa para buscar itens relacionados no banco, EXCETO para CORINGA e PAINEL)
    // ==========================================================
    if (type !== 'CORINGA' && type !== 'PAINEL') {
      let url = '';
      const searchDesc = (desc || '').trim().toUpperCase();
      const codeTerm = (code || '').trim().toUpperCase();
      const searchTerms = searchDesc.split(/\s+/).filter(t => t.length > 0);

      if (codeTerm) {
        url = `http://192.168.1.10:8081/api/item/search-code?q=${encodeURIComponent(codeTerm)}`;
      } else if (searchDesc) {
        // Enviar o termo mais longo para o banco para ser mais permissivo na query inicial
        // e depois filtramos rigorosamente localmente com todos os termos.
        const longestTerm = searchTerms.reduce((a, b) => a.length > b.length ? a : b, '');
        url = `http://192.168.1.10:8081/api/item/search-desc?q=${encodeURIComponent(longestTerm || searchDesc)}`;
      } else if (type && typePrefixes[type]) {
        // Se não informou código nem descrição, mas selecionou um tipo, busca pelo prefixo do tipo
        url = `http://192.168.1.10:8081/api/item/search-code?q=${encodeURIComponent(typePrefixes[type])}`;
      }

      if (url) {
        console.log(`[ERP API] Solicitando: ${url}`);

        // Adicionando timeout de 15 segundos
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
          const response = await fetch(url, {
            headers: { 'X-API-KEY': 'bartznewmoveisapi' },
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            let erpResults = Array.isArray(data) ? data : (data ? [data] : []);

            // Filtragem local inteligente com suporte a acentos
            erpResults = erpResults.filter(item => {
              const itemCode = (item.code || item.CODIGO || item.item_code || item.codeItem || item.refComercial || '').toString().toUpperCase();
              const itemDesc = (item.description || item.DESCRICAO || item.item_description || item.descItem || item.nomeItem || item.descricao || '').toString().toUpperCase();

              // 1. Filtrar por formato rigoroso: apenas xx.xx.xxxx (exatamente 2 pontos)
              const dotCount = (itemCode.match(/\./g) || []).length;
              if (dotCount !== 2) return false;

              // 2. Se um tipo específico foi selecionado (exceto PAINEL que busca em tudo do banco)
              if (type && type !== 'PAINEL' && typePrefixes[type]) {
                if (!itemCode.startsWith(typePrefixes[type])) return false;
              } else {
                // Se "TODOS" ou "PAINEL", aceita qualquer um dos prefixos permitidos
                if (!allowedPrefixes.some(p => itemCode.startsWith(p))) return false;
              }

              // 3. Match de todos os termos da busca
              if (searchTerms.length > 0) {
                const normDesc = removeAccents(itemDesc);
                const normCode = removeAccents(itemCode);
                return searchTerms.every(term => {
                  const normTerm = removeAccents(term);
                  const cleanNormTerm = normTerm.replace(/MM$/i, '');
                  return normDesc.includes(normTerm) || normDesc.includes(cleanNormTerm) || normCode.includes(normTerm);
                });
              }

              return true;
            });

            // Adicionar ao pool global
            erpResults.forEach(item => {
              allResults.push({
                code: (item.code || item.CODIGO || item.item_code || item.codeItem || item.refComercial || '').toString(),
                description: (item.description || item.DESCRICAO || item.item_description || item.descItem || item.nomeItem || item.descricao || '').toString()
              });
            });
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          console.error(`[ERP API] Erro na requisição ${url}:`, fetchError.name === 'AbortError' ? 'Timeout' : fetchError.message);
        }
      }
    }

    // Remover duplicatas caso o código apareça em ambos (raro, mas possível)
    const uniqueMap = new Map();
    allResults.forEach(r => uniqueMap.set(r.code, r));
    const finalResults = Array.from(uniqueMap.values());

    return { ok: true, results: finalResults, count: finalResults.length };
  } catch (e) {
    console.error(`[ERP API Error] ${e.message}`);
    return { ok: false, message: `Erro na busca: ${e.message}`, results: [] };
  }
});

ipcMain.handle('analyzer:getOrderComments', async (_e, numPedido) => {
  try {
    if (!numPedido) return { ok: false, message: 'Número do pedido não informado.' };

    const url = `http://192.168.1.10:8080/api_pedidos.php?num_pedido=${encodeURIComponent(numPedido)}`;
    console.log(`[Order API] Solicitando: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    // A API retorna um array de comentários
    return { ok: true, data: Array.isArray(data) ? data : (data ? [data] : []) };
  } catch (e) {
    console.error(`[Order API Error] ${e.message}`);
    return { ok: false, message: `Erro ao buscar pedido: ${e.message}` };
  }
});

ipcMain.handle('analyzer:searchCsvProduct', async (_e, obj) => {
  try {
    const { colorName, productType } = obj || {};

    if (!colorName || !productType) {
      return { ok: false, message: 'invalid-params', results: [] };
    }

    // Validar tipo de produto
    const validTypes = ['CHAPAS', 'FITAS', 'PAINEL', 'PUXADORES', 'TAPAFURO'];
    if (!validTypes.includes(productType.toUpperCase())) {
      return { ok: false, message: 'invalid-product-type', results: [] };
    }

    // Construir caminho do arquivo CSV
    const csvFileName = `${productType.toUpperCase()}.csv`;
    const csvPath = path.join(__dirname, 'csv', csvFileName);

    // Verificar se arquivo existe
    const exists = await fse.pathExists(csvPath);
    if (!exists) {
      send('error', { where: 'searchCsvProduct', message: `Arquivo CSV não encontrado: ${csvFileName}` });
      return { ok: false, message: 'csv-not-found', results: [] };
    }

    // Ler arquivo CSV
    const csvContent = await fsp.readFile(csvPath, 'utf8');
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim());

    if (lines.length < 2) {
      return { ok: false, message: 'empty-csv', results: [] };
    }

    // Primeira linha é o cabeçalho, usar para detectar delimitador
    const header = lines[0];
    const dataLines = lines.slice(1);

    // Auto-detectar delimitador: TAB ou ponto e vírgula
    // PAINEL usa ";" enquanto outros usam "\t"
    const delimiter = header.includes(';') ? ';' : '\t';

    // Buscar linhas que contenham o nome da cor (case-insensitive)
    const searchTerm = removeAccents(colorName.toLowerCase());
    const results = [];

    for (const line of dataLines) {
      // CSV separado por delimitador detectado
      const columns = line.split(delimiter);
      if (columns.length < 2) continue;

      const code = (columns[0] || '').trim();
      const description = (columns[1] || '').trim();
      const group = columns.length > 2 ? (columns[2] || '').trim() : '';

      // Verificar se a descrição contém o nome da cor
      if (removeAccents(description.toLowerCase()).includes(searchTerm)) {
        results.push({
          code,
          description,
          group
        });
      }
    }

    return { ok: true, results, count: results.length };
  } catch (e) {
    send('error', { where: 'searchCsvProduct', message: String((e && e.message) || e) });
    return { ok: false, message: String((e && e.message) || e), results: [] };
  }
});

/** ================== IPC: FIND DRAWING FILE ================== **/

ipcMain.handle('analyzer:findDrawingFile', async (_e, obj) => {
  try {
    const { drawingCode, xmlFilePath } = obj || {};

    console.log('[DXF Search] ========== INICIANDO BUSCA ==========');
    console.log('[DXF Search] Código de desenho procurado:', drawingCode);
    console.log('[DXF Search] Arquivo XML:', xmlFilePath);

    const cfg = (await loadCfg()) || {};
    const drawingsFolder = cfg?.drawings;

    console.log('[DXF Search] Pasta de desenhos configurada:', drawingsFolder);

    // Se a pasta não foi configurada, usar Desktop/desenho_dxf como fallback
    let dxfFolderPath = drawingsFolder;
    if (!dxfFolderPath) {
      const desktopPath = path.join(app.getPath('home'), 'Desktop');
      dxfFolderPath = path.join(desktopPath, 'desenho_dxf');
      console.log('[DXF Search] Pasta não configurada, usando fallback:', dxfFolderPath);
    }

    console.log('[DXF Search] Caminho final a buscar:', dxfFolderPath);

    // Verificar se a pasta existe
    const folderExists = await fse.pathExists(dxfFolderPath);
    console.log('[DXF Search] Pasta existe?', folderExists);

    if (!folderExists) {
      console.log('[DXF Search] ❌ FALHA: Pasta não encontrada');
      return { found: false, path: null, message: `Pasta não encontrada: ${dxfFolderPath}` };
    }

    // Ler arquivos da pasta
    const files = await fsp.readdir(dxfFolderPath);
    console.log('[DXF Search] Total de arquivos na pasta:', files.length);
    console.log('[DXF Search] Arquivos encontrados:');
    files.forEach((f, i) => {
      console.log(`  [${i + 1}] ${f}`);
    });

    // Procurar arquivo que seja EXATAMENTE o código de desenho + .dxf (case-insensitive)
    const exactFilename = `${drawingCode.toLowerCase()}.dxf`;
    console.log('[DXF Search] Nome de arquivo esperado (lowercase):', exactFilename);

    const foundFile = files.find(f => {
      const lowerF = f.toLowerCase();
      const matches = lowerF === exactFilename;
      console.log(`  [Comparação] "${f}" (${lowerF}) === "${exactFilename}"? ${matches}`);
      return matches;
    });

    if (!foundFile) {
      console.log('[DXF Search] ❌ FALHA: Nenhum arquivo corresponde ao padrão');
      return { found: false, path: null, message: `Arquivo "${drawingCode}" não encontrado em ${dxfFolderPath}` };
    }

    const fullPath = path.join(dxfFolderPath, foundFile);
    console.log('[DXF Search] ✅ ARQUIVO DXF ENCONTRADO');
    console.log('[DXF Search] Nome do arquivo:', foundFile);
    console.log('[DXF Search] Caminho completo:', fullPath);

    // ===== ANALISAR ARQUIVO DXF =====
    let panelInfo = null;
    let fresaInfo = null;

    try {
      console.log('[DXF Analysis] Lendo arquivo DXF:', fullPath);
      const dxfContent = await fsp.readFile(fullPath, 'utf8');
      const lines = dxfContent.split(/\r?\n/);

      console.log('[DXF Analysis] Total de linhas no DXF:', lines.length);

      // 1. PROCURAR PRIMEIRO PANEL e extrair o valor de 39 (dimensão)
      let panelFound = false;
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line.toUpperCase() === 'PANEL' && !panelFound) {
          console.log('[DXF Analysis] ✓ PANEL encontrado na linha', i);
          panelFound = true;

          // Procurar o próximo "39" para pegar a dimensão
          for (let j = i + 1; j < lines.length; j++) {
            const codeLine = lines[j].trim();
            if (codeLine === '39') {
              const dimensionLine = j + 1 < lines.length ? lines[j + 1].trim() : null;
              if (dimensionLine) {
                const dimension = dimensionLine.startsWith('-') ? dimensionLine : '-' + dimensionLine;
                panelInfo = {
                  panelCode: 'PANEL',
                  dimension: dimension
                };
                console.log('[DXF Analysis] ✓ Dimensão do PANEL encontrada:', dimension);
                break;
              }
            }
          }
          break;
        }
      }

      if (!panelFound) {
        console.log('[DXF Analysis] ✗ Nenhum PANEL encontrado no DXF');
      }

      // 2. PROCURAR FRESA_12_37 ou FRESA_12_18 e USINAGEM_37 ou USINAGEM_18
      let fresa37Found = false;
      let fresa18Found = false;
      let usinagem37Found = false;
      let usinagem18Found = false;

      let fresa37Count = 0;
      let fresa18Count = 0;
      let usinagem37Count = 0;
      let usinagem18Count = 0;

      const fresa37List = [];
      const usinagem37List = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim().toUpperCase();
        if (line === 'FRESA_12_37' || line === 'USINAGEM_37') {
          const isUsinagem = line === 'USINAGEM_37';
          if (isUsinagem) {
            usinagem37Found = true;
            usinagem37Count++;
          } else {
            fresa37Found = true;
            fresa37Count++;
          }

          console.log(`[DXF Analysis] ✓ ${line} #${isUsinagem ? usinagem37Count : fresa37Count} encontrada na linha`, i);

          // Procurar pelos códigos 30 (-37) e 39 (37 ou -37) após essa linha
          let hasNegative37 = false;
          let hasPositive37 = false;

          // Scan next 20 lines for coordinates
          for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
            const codeLine = lines[j].trim();

            if (codeLine === '30') {
              const valueLine = j + 1 < lines.length ? lines[j + 1].trim() : null;
              if (valueLine === '-37') {
                hasNegative37 = true;
                console.log(`[DXF Analysis]   ✓ [Item #${isUsinagem ? usinagem37Count : fresa37Count}] Código 30 = -37 encontrado na linha`, j);
              }
            }

            if (codeLine === '39') {
              const valueLine = j + 1 < lines.length ? lines[j + 1].trim() : null;
              if (valueLine === '37' || valueLine === '-37') {
                hasPositive37 = true;
                console.log(`[DXF Analysis]   ✓ [Item #${isUsinagem ? usinagem37Count : fresa37Count}] Código 39 =`, valueLine, 'encontrado na linha', j);
              }
            }
          }

          const itemData = {
            index: isUsinagem ? usinagem37Count : fresa37Count,
            line: i + 1,
            hasNegative37,
            hasPositive37,
            type: line
          };

          if (isUsinagem) {
            usinagem37List.push(itemData);
          } else {
            fresa37List.push(itemData);
          }

        } else if (line === 'FRESA_12_18') {
          fresa18Found = true;
          fresa18Count++;
          console.log('[DXF Analysis] ✓ FRESA_12_18 encontrada na linha', i);
        } else if (line === 'USINAGEM_18') {
          usinagem18Found = true;
          usinagem18Count++;
          console.log('[DXF Analysis] ✓ USINAGEM_18 encontrada na linha', i);
        }
      }

      // Montar resumo do fresaInfo
      const has37 = fresa37Found || usinagem37Found;
      const has18 = fresa18Found || usinagem18Found;

      if (has37 && has18) {
        fresaInfo = {
          fresaCode: `FRESA/USINAGEM 37 (${fresa37Count + usinagem37Count}x) e 18 (${fresa18Count + usinagem18Count}x)`,
          status: 'Estado misto (contém ambas as versões)',
          count37: fresa37Count,
          count18: fresa18Count,
          usinagemCount37: usinagem37Count,
          usinagemCount18: usinagem18Count,
          fresa37List,
          usinagem37List
        };
      } else if (has37) {
        fresaInfo = {
          fresaCode: `37MM (${fresa37Count} Fresa / ${usinagem37Count} Usinagem)`,
          status: 'Status: ⚠️ Ainda está DUPLICADO em 37MM',
          count37: fresa37Count,
          count18: 0,
          usinagemCount37: usinagem37Count,
          usinagemCount18: 0,
          fresa37List,
          usinagem37List
        };
      } else if (has18) {
        fresaInfo = {
          fresaCode: `18MM (${fresa18Count} Fresa / ${usinagem18Count} Usinagem)`,
          status: 'Status: ✅ Corrigido para 18MM',
          count37: 0,
          count18: fresa18Count,
          usinagemCount37: 0,
          usinagemCount18: usinagem18Count,
          fresa37List: [],
          usinagem37List: []
        };
      } else {
        console.log('[DXF Analysis] ✗ Nenhuma FRESA ou USINAGEM encontrada');
      }

    } catch (dxfErr) {
      console.log('[DXF Analysis] ✗ Erro ao ler DXF:', dxfErr.message);
    }

    return {
      found: true,
      path: fullPath,
      name: foundFile,
      panelInfo,
      fresaInfo
    };
  } catch (e) {
    console.log('[DXF Search] ❌ ERRO DURANTE BUSCA:', e.message || e);
    console.error('[DXF Search] Stack completo:', e.stack);
    return { found: false, path: null, message: `Erro ao buscar: ${String(e && e.message || e)}` };
  }
});

/** ================== IPC: FIX FRESA 37 TO 18 ================== **/
ipcMain.handle('analyzer:fixFresa37to18', async (_e, dxfFilePath) => {
  try {
    console.log('[DXF Fix] ========== INICIANDO CORREÇÃO ==========');
    console.log('[DXF Fix] Arquivo DXF:', dxfFilePath);

    if (!dxfFilePath || !(await fse.pathExists(dxfFilePath))) {
      console.log('[DXF Fix] ❌ Arquivo não encontrado');
      return { ok: false, message: 'Arquivo não encontrado' };
    }

    // Ler arquivo
    const content = await fsp.readFile(dxfFilePath, 'utf8');
    const lines = content.split(/\r?\n/);

    console.log('[DXF Fix] Total de linhas:', lines.length);

    let modified = false;
    let panelModified = false;
    let fresaModified = false;
    let firstPanelFound = false;
    let firstFresa37Found = false;

    // Processar linhas
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 1. Alterar primeiro PANEL: valor 39 de 37 ou -37 para 18 ou -18
      if (!firstPanelFound && line.toUpperCase() === 'PANEL') {
        console.log('[DXF Fix] ✓ PANEL encontrado na linha', i);
        firstPanelFound = true;

        // Procurar o código 39 após essa linha
        for (let j = i + 1; j < lines.length && j < i + 20; j++) {
          if (lines[j].trim() === '39') {
            const nextIdx = j + 1;
            if (nextIdx < lines.length) {
              const value = lines[nextIdx].trim();
              // Alterar 37 → 18 ou -37 → -18
              if (value === '37') {
                lines[nextIdx] = '18';
                console.log('[DXF Fix]   ✓ Código 39: 37 → 18 na linha', nextIdx);
                panelModified = true;
                modified = true;
              } else if (value === '-37') {
                lines[nextIdx] = '-18';
                console.log('[DXF Fix]   ✓ Código 39: -37 → -18 na linha', nextIdx);
                panelModified = true;
                modified = true;
              }
            }
            break;
          }
        }
      }

      // 2. Alterar TODAS as ocorrências de FRESA_12_37 ou USINAGEM_37: 
      // valores 30 (-37→-18 ou 37→18) e 39 (37→18 ou -37→-18)
      const isTarget = line.toUpperCase() === 'FRESA_12_37' || line.toUpperCase() === 'USINAGEM_37';
      if (isTarget) {
        console.log(`[DXF Fix] ✓ ${line} encontrada na linha`, i);

        // Procurar códigos 30 e 39 após essa linha (para este item específico)
        for (let j = i + 1; j < lines.length && j < i + 20; j++) {
          const codeLine = lines[j].trim();

          // Alterar código 30: -37 → -18 ou 37 → 18
          if (codeLine === '30') {
            const nextIdx = j + 1;
            if (nextIdx < lines.length) {
              const value = lines[nextIdx].trim();
              if (value === '-37') {
                lines[nextIdx] = '-18';
                console.log('[DXF Fix]   ✓ Código 30: -37 → -18 na linha', nextIdx);
                fresaModified = true;
                modified = true;
              } else if (value === '37') {
                lines[nextIdx] = '18';
                console.log('[DXF Fix]   ✓ Código 30: 37 → 18 na linha', nextIdx);
                fresaModified = true;
                modified = true;
              }
            }
          }

          // Alterar código 39: 37 → 18 ou -37 → -18
          if (codeLine === '39') {
            const nextIdx = j + 1;
            if (nextIdx < lines.length) {
              const value = lines[nextIdx].trim();
              if (value === '37') {
                lines[nextIdx] = '18';
                console.log('[DXF Fix]   ✓ Código 39: 37 → 18 na linha', nextIdx);
                fresaModified = true;
                modified = true;
              } else if (value === '-37') {
                lines[nextIdx] = '-18';
                console.log('[DXF Fix]   ✓ Código 39: -37 → -18 na linha', nextIdx);
                fresaModified = true;
                modified = true;
              }
            }
          }
        }
      }
    }

    // 3. Substituir nomes
    let fresa37Replacements = 0;
    let usinagem37Replacements = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineUpper = lines[i].trim().toUpperCase();
      if (lineUpper === 'FRESA_12_37') {
        lines[i] = lines[i].replace(/FRESA_12_37/i, 'FRESA_12_18');
        fresa37Replacements++;
        console.log('[DXF Fix] ✓ FRESA_12_37 → FRESA_12_18 na linha', i);
      } else if (lineUpper === 'USINAGEM_37') {
        lines[i] = lines[i].replace(/USINAGEM_37/i, 'USINAGEM_18');
        usinagem37Replacements++;
        console.log('[DXF Fix] ✓ USINAGEM_37 → USINAGEM_18 na linha', i);
      }
    }

    if (fresa37Replacements > 0 || usinagem37Replacements > 0) {
      modified = true;
    }

    if (!modified) {
      console.log('[DXF Fix] ⚠️ Nenhuma alteração foi feita');
      return { ok: false, message: 'Nenhuma alteração foi necessária' };
    }

    // Escrever arquivo de volta
    const newContent = lines.join('\n');
    await fsp.writeFile(dxfFilePath, newContent, 'utf8');

    console.log('[DXF Fix] ✅ ARQUIVO CORRIGIDO COM SUCESSO');
    console.log('[DXF Fix] Alterações:');
    console.log('[DXF Fix]   - PANEL modificado:', panelModified);
    console.log('[DXF Fix]   - Primeira FRESA_12_37 modificada:', fresaModified);
    console.log('[DXF Fix]   - FRESA_12_37 → FRESA_12_18:', fresa37Replacements, 'ocorrências');

    return {
      ok: true,
      message: 'Arquivo corrigido com sucesso',
      changes: {
        panelModified,
        fresaModified,
        fresa37Replacements
      }
    };
  } catch (e) {
    console.log('[DXF Fix] ❌ ERRO NA CORREÇÃO:', e.message || e);
    console.error('[DXF Fix] Stack:', e.stack);
    return { ok: false, message: `Erro ao corrigir: ${String(e && e.message || e)}` };
  }
});

/** ================== RELATÓRIO AUTOMÁTICO ================== **/

/**
 * Agrega todos os arquivos processados hoje a partir dos logs gravados em logsProcessed e logsErrors.
 */
async function aggregateTodayLogs() {
  const cfg = currentCfg || (await loadCfg());
  const logDirs = [cfg.logsProcessed, cfg.logsErrors].filter(d => !!d);
  if (logDirs.length === 0) return { rows: [] };

  const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const fileGroups = new Map();

  for (const dir of logDirs) {
    if (!(await fse.pathExists(dir))) continue;
    const files = await fs.promises.readdir(dir);

    for (const file of files) {
      if (!file.toLowerCase().endsWith('.json')) continue;
      const fullPath = path.join(dir, file);
      try {
        const stats = await fs.promises.stat(fullPath);

        // Filtra apenas arquivos modificados hoje
        if (stats.mtime.toISOString().split('T')[0] === todayStr) {
          const analysis = await fse.readJson(fullPath);
          const originalFile = analysis.arquivo;
          const filename = path.basename(originalFile || '');
          if (!filename) continue;

          if (!fileGroups.has(filename)) fileGroups.set(filename, []);
          fileGroups.get(filename).push({ analysis, mtime: stats.mtime, originalFile });
        }
      } catch (e) {
        /* ignorar erro de leitura */
      }
    }
  }

  const rows = [];
  for (const [filename, logs] of fileGroups.entries()) {
    // Ordenar por mtime crescente (mais antigo primeiro)
    logs.sort((a, b) => a.mtime - b.mtime);

    const earliest = logs[0];
    const latest = logs[logs.length - 1];

    // Verificar se o arquivo XML atualmente reside na pasta OK
    // Isso é importante se o usuário moveu o arquivo manualmente (sem gerar log)
    let finalXmlFoundInOk = false;
    if (cfg.ok && await fse.pathExists(path.join(cfg.ok, filename))) {
      finalXmlFoundInOk = true;
    }

    const isOK = (latest.analysis.erros || []).length === 0 || finalXmlFoundInOk;
    let status = isOK ? "OK" : "ERRO";
    if (!finalXmlFoundInOk && latest.analysis.meta?.ferragensOnly) status = "FERRAGENS-ONLY";

    const isEarlyOK = (earliest.analysis.erros || []).length === 0;
    let earlyStatus = isEarlyOK ? "OK" : "ERRO";
    if (earliest.analysis.meta?.ferragensOnly) earlyStatus = "FERRAGENS-ONLY";

    // Mesclar histórico de todas as passagens do dia
    const combinedHistory = [];
    logs.forEach(l => {
      (l.analysis.history || []).forEach(h => {
        if (!combinedHistory.includes(h)) combinedHistory.push(h);
      });
    });

    rows.push({
      filename,
      fullpath: latest.originalFile,
      status,
      errors: finalXmlFoundInOk ? [] : (latest.analysis.erros || []).map(e => e.descricao || String(e)),
      autoFixes: (latest.analysis.autoFixes || []),
      warnings: (latest.analysis.avisos || []),
      tags: (latest.analysis.tags || []),
      timestamp: latest.mtime.toLocaleString('pt-BR'),
      initialStatus: earlyStatus,
      initialErrors: earlyStatus === "ERRO" ? (earliest.analysis.erros || []).map(e => e.descricao || String(e)) : [],
      history: combinedHistory
    });
  }

  return { rows: rows };
}

/**
 * Salva o relatório diário (JSON e CSV) baseado nos dados fornecidos.
 * Refatorado para ser usado tanto via IPC quanto pelo Agendador Automático.
 */
async function saveDailyReport(reportData) {
  console.log('[Report] ========== INICIANDO GERAÇÃO DE RELATÓRIO ==========');

  const now = new Date();
  const dayStr = now.toLocaleDateString('pt-BR').split('/').reverse().join('-'); // 2026-02-12
  const timestamp = dayStr;

  // Obter pasta de exportação da config
  let exportFolder = currentCfg?.exportacao || "";
  if (!exportFolder || !(await fse.pathExists(exportFolder))) {
    exportFolder = path.join(app.getPath("desktop"), "Bartz-Analyzer_Exports");
    await fse.ensureDir(exportFolder);
  }

  const jsonPath = path.join(exportFolder, `Relatorio_${timestamp}.json`);
  const csvPath = path.join(exportFolder, `Relatorio_${timestamp}.csv`);

  let existingData = { files: [] };
  if (await fse.pathExists(jsonPath)) {
    try {
      const raw = await fs.promises.readFile(jsonPath, 'utf8');
      existingData = JSON.parse(raw);
      if (!Array.isArray(existingData.files)) existingData.files = [];
    } catch (e) {
      console.warn('[Report] Erro ao ler JSON existente, recomeçando:', e.message);
    }
  }

  // Mesclar linhas
  const fileMap = new Map();
  existingData.files.forEach(f => {
    if (f.filename) fileMap.set(f.filename, f);
  });

  if (Array.isArray(reportData.rows)) {
    reportData.rows.forEach(r => {
      if (r.filename) {
        const old = fileMap.get(r.filename);
        if (old) {
          r.initialStatus = old.initialStatus || r.initialStatus;
          r.initialErrors = (old.initialErrors && old.initialErrors.length > 0) ? old.initialErrors : (r.initialErrors || []);
          const combinedHistory = [...(old.history || [])];
          (r.history || []).forEach(entry => {
            if (!combinedHistory.includes(entry)) combinedHistory.push(entry);
          });
          r.history = combinedHistory;
        }
        fileMap.set(r.filename, r);
      }
    });
  }

  const allFiles = Array.from(fileMap.values());
  const totalFiles = allFiles.length;
  const okFiles = allFiles.filter(f => f.status === "OK").length;
  const errorFiles = allFiles.filter(f => f.status === "ERRO").length;
  const ferragensFiles = allFiles.filter(f => f.status === "FERRAGENS-ONLY").length;

  const formatStatus = (status) => {
    const s = String(status || "").toUpperCase();
    if (s === "OK") return "🟢 OK";
    if (s === "ERRO") return "🔴 ERRO";
    if (s === "FERRAGENS-ONLY") return "🟡 FERRAGENS-ONLY";
    return s;
  };

  // JSON
  const jsonData = {
    ultimaExportacao: now.toLocaleString('pt-BR'),
    summary: {
      totalFiles,
      okFiles,
      errorFiles,
      successRate: totalFiles > 0 ? ((okFiles / totalFiles) * 100).toFixed(2) + '%' : 'N/A'
    },
    files: allFiles,
    config: {
      entrada: currentCfg?.entrada || '',
      ok: currentCfg?.ok || '',
      erro: currentCfg?.erro || ''
    }
  };

  await fs.promises.writeFile(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');
  console.log('[Report] ✓ JSON atualizado:', jsonPath);

  // CSV
  const csvLines = [];
  csvLines.push(['STATUS_INICIAL', 'STATUS_FINAL', 'ARQUIVO', 'ERROS_DETECTADOS', 'AVISOS', 'TAGS', 'ACOES_REALIZADAS (HISTORICO)', 'FINALIZADO_EM'].map(v => `"${v}"`).join(';'));

  for (const row of allFiles) {
    const errorsList = (row.initialErrors && row.initialErrors.length > 0) ? row.initialErrors : (row.errors || []);
    csvLines.push([
      formatStatus(row.initialStatus || row.status || ''),
      formatStatus(row.status || ''),
      row.filename || '',
      errorsList.join(' | '),
      (row.warnings || []).join(' | '),
      (row.tags || []).join(', '),
      (row.history || []).join(' | '),
      row.timestamp || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'));
  }

  csvLines.push('');
  csvLines.push(['RESUMO DO RELATÓRIO DO DIA'].map(v => `"${v}"`).join(';'));
  csvLines.push(['Data da Última Exportação', now.toLocaleString('pt-BR')].map(v => `"${v}"`).join(';'));
  csvLines.push(['Total de Arquivos Processados', totalFiles].map(v => `"${v}"`).join(';'));
  csvLines.push(['Arquivos OK', `🟢 ${okFiles}`].map(v => `"${v}"`).join(';'));
  csvLines.push(['Arquivos com ERRO', `🔴 ${errorFiles}`].map(v => `"${v}"`).join(';'));
  csvLines.push(['Arquivos FERRAGENS-ONLY', `🟡 ${ferragensFiles}`].map(v => `"${v}"`).join(';'));
  csvLines.push(['Taxa de Sucesso', totalFiles > 0 ? `${(((okFiles + ferragensFiles) / totalFiles) * 100).toFixed(2)}%` : 'N/A'].map(v => `"${v}"`).join(';'));

  await fs.promises.writeFile(csvPath, csvLines.join('\n'), 'utf8');
  console.log('[Report] ✓ CSV atualizado:', csvPath);

  return { ok: true, csvPath, jsonPath, filesCount: totalFiles };
}

/**
 * Remove todos os arquivos das pastas configuradas (OK, ERRO, Logs).
 */
async function clearTargetFolders() {
  console.log('[Scheduler] ========== INICIANDO LIMPEZA DE PASTAS ==========');
  const cfg = currentCfg || (await loadCfg());
  const foldersToClear = [cfg.ok, cfg.erro, cfg.logsProcessed, cfg.logsErrors].filter(d => !!d);

  if (foldersToClear.length === 0) {
    console.log('[Scheduler] Nenhuma pasta configurada para limpeza.');
    return { ok: false, message: 'Nenhuma pasta configurada para limpeza.' };
  }

  let clearedCount = 0;
  for (const dir of foldersToClear) {
    try {
      if (await fse.pathExists(dir)) {
        const files = await fs.promises.readdir(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stats = await fs.promises.stat(fullPath);
          if (stats.isFile()) {
            await fse.remove(fullPath);
            clearedCount++;
          }
        }
        console.log(`[Scheduler] ✓ Pasta limpa: ${dir}`);
      }
    } catch (e) {
      console.error(`[Scheduler] Erro ao limpar pasta ${dir}:`, e.message);
    }
  }
  return { ok: true, clearedCount };
}

/**
 * Loop que verifica o horário a cada minuto para gerar o relatório automático e limpar pastas.
 */
function startAutomaticScheduler() {
  console.log('[Scheduler] Iniciado. Verificando horários (Relatórios: 11:30/17:30 | Limpeza: 17:30)...');

  setInterval(async () => {
    const now = new Date();
    const day = now.getDay(); // 0=Dom, 1=Seg, ..., 6=Sab
    const hours = now.getHours();
    const minutes = now.getMinutes();

    // Apenas Segunda a Sexta
    if (day >= 1 && day <= 5) {
      // Relatórios automáticos
      if ((hours === 11 && minutes === 30) || (hours === 17 && minutes === 30)) {
        console.log(`[Scheduler] Horário de relatório atingido (${hours}:${minutes}). Executando exportação automática...`);
        try {
          const reportData = await aggregateTodayLogs();
          if (reportData.rows.length > 0) {
            await saveDailyReport(reportData);
            console.log(`[Scheduler] Exportação automática concluída com sucesso.`);
          } else {
            console.log(`[Scheduler] Nenhum arquivo processado hoje para exportar.`);
          }
        } catch (e) {
          console.error(`[Scheduler] Erro na exportação automática:`, e.message);
        }
      }
    }
  }, 60000); // 60 segundos
}

/** ================== IPC: CLEAR TARGET FOLDERS ================== **/
ipcMain.handle('analyzer:clearTargetFolders', async () => {
  try {
    return await clearTargetFolders();
  } catch (e) {
    console.error('[Clear Folders] Erro:', e.message);
    return { ok: false, message: e.message };
  }
});

/** ================== IPC: EXPORT REPORT ================== **/
ipcMain.handle('analyzer:exportReport', async (_e, reportData) => {
  try {
    const res = await saveDailyReport(reportData);
    return {
      ...res,
      message: `Relatório diário atualizado (${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')})`
    };
  } catch (e) {
    console.log('[Export Report] ❌ ERRO NA EXPORTAÇÃO:', e.message || e);
    return { ok: false, message: `Erro ao exportar relatório: ${String(e.message || e)}` };
  }
});

// ========== ANALYZER: MOVE TO OK ==========
ipcMain.handle("analyzer:moveToOk", async (_, filePath) => {
  try {
    if (!filePath) return { ok: false, message: "Arquivo não informado" };
    const cfg = await loadCfg();
    if (!cfg.ok) return { ok: false, message: "Pasta Final OK não configurada" };

    const fileName = path.basename(filePath);
    const destPath = path.join(cfg.ok, fileName);

    // Garantir que a pasta de destino existe
    await fse.ensureDir(cfg.ok);

    // Mover arquivo (overwrite se existir)
    await fse.move(filePath, destPath, { overwrite: true });

    // ✅ GRAVAR LOG DE SUCESSO AO MOVER MANUALMENTE
    // Isso garante que o agendador automático veja este arquivo como OK
    if (cfg.logsProcessed) {
      await fse.ensureDir(cfg.logsProcessed);
      const logName = fileName.replace(/\.xml$/i, '') + '_ok.json';
      const logData = {
        arquivo: path.resolve(destPath),
        erros: [],
        warnings: [],
        tags: ["manually-moved"],
        autoFixes: [],
        timestamp: new Date().toLocaleString('pt-BR')
      };
      await fsp.writeFile(path.join(cfg.logsProcessed, logName), JSON.stringify(logData, null, 2), 'utf8');
    }

    console.log(`[Move] Arquivo movido para OK: ${destPath}`);
    return { ok: true, destPath };
  } catch (e) {
    console.error("[Move] Erro ao mover arquivo:", e);
    return { ok: false, message: String(e.message || e) };
  }
});

/** ----------------- lifecycle ----------------- **/
app.whenReady().then(() => {
  createWindow();
  startAutomaticScheduler();
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
