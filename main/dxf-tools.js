// main/dxf-tools.js
// Ferramentas de leitura/escrita de arquivos DXF: injeção automática de muxarabi,
// correção de fresa 37mm->18mm, e os handlers de IPC para localizar/abrir desenhos.
const { app, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const fse = require("fs-extra");
const state = require("./state");
const { loadCfg, findFileRecursive, send } = require("./helpers");

function parseDxfEntities(dxfContent) {
  const lines = dxfContent.split(/\r?\n/);
  let entitiesStart = -1;
  let entitiesEnd = -1;

  // Search line-by-line for boundaries
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i].trim();
    const val = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
    if (code === '2' && val === 'ENTITIES') {
      entitiesStart = i + 2; // the first entity's '0'
    }
    if (entitiesStart >= 0 && i >= entitiesStart && code === '0' && val === 'ENDSEC') {
      entitiesEnd = i;
      break;
    }
  }

  if (entitiesStart < 0 || entitiesEnd < 0) {
    return { entities: [], pieceBounds: null, hasUsinagem: false, entitiesEndLine: -1 };
  }

  const entities = [];
  let currentType = null;
  let currentLayer = '';
  let currentPoints = [];
  let rawLineStart = -1;

  // Use a state machine to ensure we only treat '0' as a new entity
  // if it's a code, not a value.
  let isCode = true;
  for (let i = entitiesStart; i < entitiesEnd; i++) {
    const text = lines[i].trim();

    if (isCode) {
      const code = text;
      const val = (i + 1 < lines.length) ? lines[i + 1].trim() : '';

      if (code === '0') {
        if (currentType) {
          entities.push({
            type: currentType, layer: currentLayer, points: [...currentPoints],
            rawStart: rawLineStart, rawEnd: i - 1
          });
        }
        currentType = val;
        currentLayer = '';
        currentPoints = [];
        rawLineStart = i;
      } else if (code === '8') {
        currentLayer = val;
      } else if (code === '10') {
        const x = parseFloat(val);
        let y = null;
        if (i + 2 < lines.length && lines[i + 2].trim() === '20') {
          y = parseFloat(lines[i + 3].trim());
        }
        currentPoints.push({ x, y });
      }
      isCode = false; // Next line is a value
    } else {
      isCode = true; // Next line is a code
    }
  }

  // Save the last entity
  if (currentType) {
    entities.push({
      type: currentType, layer: currentLayer, points: [...currentPoints],
      rawStart: rawLineStart, rawEnd: entitiesEnd - 1
    });
  }

  // Extract piece bounds from PANEL layer
  let pieceBounds = null;
  const panelEntities = entities.filter(e => e.layer === 'PANEL');
  if (panelEntities.length > 0) {
    // Une os pontos de TODAS as entidades da layer PANEL: cobre tanto LWPOLYLINE
    // (pontos na própria entidade) quanto POLYLINE antiga (pontos em entidades VERTEX separadas)
    const xs = [];
    const ys = [];
    for (const ent of panelEntities) {
      for (const p of ent.points) {
        if (!isNaN(p.x)) xs.push(p.x);
        if (p.y !== null && !isNaN(p.y)) ys.push(p.y);
      }
    }
    if (xs.length >= 2 && ys.length >= 2) {
      pieceBounds = {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
      };
    }
  }

  const hasUsinagem = entities.some(e => /^USINAGEM_\d+$/i.test(e.layer));

  return { entities, pieceBounds, hasUsinagem, entitiesEndLine: entitiesEnd, entitiesStartLine: entitiesStart };
}

/**
 * Garante que uma layer esteja declarada na tabela LAYER do DXF.
 * Clona o registro da layer PANEL (sempre presente) com novo nome/handle/cor.
 * Retorna true se inseriu (modifica o array lines in-place não é possível com splice retornando novo — retorna o array resultante).
 */
function ensureLayerDeclared(lines, layerName, colorIndex, newHandleHex) {
  // localizar tabela LAYER: par "0/TABLE" seguido de "2/LAYER"
  let tableStart = -1;
  for (let i = 0; i < lines.length - 3; i += 2) {
    if (lines[i].trim() === '0' && lines[i + 1].trim() === 'TABLE' &&
      lines[i + 2].trim() === '2' && lines[i + 3].trim() === 'LAYER') {
      tableStart = i;
      break;
    }
  }
  if (tableStart < 0) return { lines, added: false };

  // varrer registros LAYER até ENDTAB; verificar se já existe e localizar o registro PANEL para clonar
  let endTabLine = -1;
  let cloneStart = -1, cloneEnd = -1;
  let recStart = -1, recName = '';
  for (let i = tableStart + 4; i < lines.length - 1; i += 2) {
    const code = lines[i].trim();
    const val = lines[i + 1].trim();
    if (code === '0') {
      if (recStart >= 0) {
        if (recName.toUpperCase() === layerName.toUpperCase()) return { lines, added: false }; // já declarada
        if (recName.toUpperCase() === 'PANEL' && cloneStart < 0) { cloneStart = recStart; cloneEnd = i; }
      }
      if (val === 'ENDTAB') { endTabLine = i; break; }
      recStart = (val === 'LAYER') ? i : -1;
      recName = '';
    } else if (code === '2' && recStart >= 0 && !recName) {
      recName = val;
    }
  }
  if (endTabLine < 0 || cloneStart < 0) return { lines, added: false };

  // clonar registro PANEL, removendo blocos 102 {..} e trocando handle/nome/cor
  const src = lines.slice(cloneStart, cloneEnd);
  const rec = [];
  let handleDone = false, nameDone = false, colorDone = false;
  for (let i = 0; i < src.length; i += 2) {
    const code = src[i].trim();
    const val = src[i + 1];
    if (code === '102') { // pular bloco {ACAD_XDICTIONARY ... }
      if (val.trim().startsWith('{')) {
        while (i + 2 < src.length && src[i + 2].trim() !== '102') i += 2;
        i += 2; // consome o "102 / }"
      }
      continue;
    }
    if (code === '5' && !handleDone) { rec.push(src[i], newHandleHex); handleDone = true; continue; }
    if (code === '2' && !nameDone) { rec.push(src[i], layerName); nameDone = true; continue; }
    if (code === '62' && !colorDone) { rec.push(src[i], `     ${colorIndex}`); colorDone = true; continue; }
    rec.push(src[i], val);
  }

  const result = [...lines.slice(0, endTabLine), ...rec, ...lines.slice(endTabLine)];
  return { lines: result, added: true };
}

/**
 * Atualiza o $HANDSEED do cabeçalho para o próximo handle livre.
 */
function updateHandseed(lines, nextHandleHex) {
  for (let i = 0; i < lines.length - 3; i += 2) {
    if (lines[i].trim() === '9' && lines[i + 1].trim() === '$HANDSEED') {
      if (lines[i + 2].trim() === '5') lines[i + 3] = nextHandleHex;
      return;
    }
  }
}

/**
 * Extracts the raw DXF text for each USINAGEM_18 entity from a template file.
 * Returns array of { rawText, points } for each entity.
 */
function extractTemplateEntities(dxfContent) {
  const lines = dxfContent.split(/\r?\n/);
  let entitiesStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const code = lines[i].trim();
    const val = (i + 1 < lines.length) ? lines[i + 1].trim() : '';
    if (code === '2' && val === 'ENTITIES') {
      entitiesStart = i + 2; // skip "2 ENTITIES" pair, now at first entity's "0"
      break;
    }
  }

  if (entitiesStart < 0) return [];

  const templateEntities = [];
  let entityStart = -1;
  let currentLayer = '';
  let currentPoints = [];

  let isCode = true;
  for (let i = entitiesStart; i < lines.length; i++) {
    const text = lines[i].trim();

    if (isCode) {
      const code = text;
      const val = (i + 1 < lines.length) ? lines[i + 1].trim() : '';

      if (code === '0') {
        // Save previous entity if it was USINAGEM_18
        if (entityStart >= 0 && currentLayer === 'USINAGEM_18') {
          const rawText = lines.slice(entityStart, i).join('\r\n');
          templateEntities.push({ rawText, points: [...currentPoints] });
        }

        if (val === 'ENDSEC') break;

        entityStart = i;
        currentLayer = '';
        currentPoints = [];
      } else if (code === '8') {
        currentLayer = val;
      } else if (code === '10') {
        const x = parseFloat(val);
        // Y coordinate (group code 20) should be the next pair
        let y = null;
        if (i + 2 < lines.length && lines[i + 2].trim() === '20') {
          y = parseFloat(lines[i + 3].trim());
        }
        currentPoints.push({ x, y });
      }
      isCode = false;
    } else {
      isCode = true;
    }
  }

  return templateEntities;
}

/**
 * Generates a unique hex handle for DXF entities.
 * Finds the highest existing handle and increments from there.
 */
function findMaxHandle(dxfContent) {
  let maxHandle = 0x1000; // start high to avoid conflicts
  const lines = dxfContent.split(/\r?\n/);

  let isCode = true;
  for (let i = 0; i < lines.length; i++) {
    if (isCode) {
      if (lines[i].trim() === '5' && i + 1 < lines.length) {
        const h = parseInt(lines[i + 1].trim(), 16);
        if (!isNaN(h) && h > maxHandle) maxHandle = h;
      }
      isCode = false;
    } else {
      isCode = true;
    }
  }

  return maxHandle;
}

/**
 * Converte uma LWPOLYLINE do template para POLYLINE/VERTEX/SEQEND (estilo R12),
 * usado quando o desenho ITE é do formato mínimo (sem cabeçalho nem handles).
 * Preserva vértices, bulges (arcos, código 42) e o flag de fechada (código 70).
 */
function lwpolylineToOldStyle(rawText, layerName) {
  const src = rawText.split(/\r?\n/);
  const verts = [];
  let closedFlag = 0;
  let cur = null;
  let inVertices = false;
  for (let i = 0; i < src.length - 1; i += 2) {
    const code = src[i].trim();
    const val = (src[i + 1] || '').trim();
    if (code === '70' && !inVertices) closedFlag = (parseInt(val, 10) || 0) & 1;
    else if (code === '10') { cur = { x: val, y: '0', b: '0' }; verts.push(cur); inVertices = true; }
    else if (code === '20' && cur) cur.y = val;
    else if (code === '42' && cur) cur.b = val;
  }
  if (verts.length === 0) return [];

  const out = [];
  out.push('0', 'POLYLINE', '8', layerName, '66', '1', '70', String(closedFlag));
  for (const v of verts) {
    out.push('0', 'VERTEX', '8', layerName, '70', '0', '10', v.x, '20', v.y, '30', '0', '42', v.b);
  }
  out.push('0', 'SEQEND', '8', layerName);
  return out;
}

async function doInjectMuxarabi(arg) {
  try {
    const { drawingCode, sizeCode, thickness } = (typeof arg === 'object' && arg) ? arg : {};

    if (!drawingCode || !sizeCode) {
      return { ok: false, message: 'Código de desenho ou tamanho do muxarabi não informado.' };
    }

    // espessura da chapa (18mm ou 25mm) vinda da descrição do item
    const th = String(thickness || '18').replace(/\D/g, '') || '18';
    const usinagemLayer = `USINAGEM_${th}`;
    const fresaLayer = `FRESA_12_${th}`;

    console.log(`[Muxarabi Inject] ========== INICIANDO INJEÇÃO ==========`);
    console.log(`[Muxarabi Inject] Desenho: ${drawingCode}, Tamanho: ${sizeCode}, Espessura: ${th}mm`);

    // 1. Locate the ITE DXF file in the drawings folder
    const cfg = state.currentCfg || (await loadCfg()) || {};
    const dxfFolderPath = cfg?.drawings;

    if (!dxfFolderPath) {
      return { ok: false, message: 'A pasta de desenhos não está configurada nas preferências.' };
    }

    const iteFilename = `${drawingCode.toLowerCase()}.dxf`;
    const iteFullPath = await findFileRecursive(dxfFolderPath, iteFilename);

    if (!iteFullPath) {
      return { ok: false, message: `Desenho "${iteFilename}" não encontrado na pasta de desenhos.` };
    }

    console.log(`[Muxarabi Inject] ITE encontrado: ${iteFullPath}`);

    // 2. Read and parse the ITE DXF
    const iteContent = await fsp.readFile(iteFullPath, 'utf8');
    const iteParsed = parseDxfEntities(iteContent);

    if (!iteParsed.pieceBounds) {
      return { ok: false, message: 'Não foi possível identificar o retângulo da peça (layer PANEL) no desenho ITE.' };
    }

    if (iteParsed.hasUsinagem) {
      return { ok: false, message: 'O desenho ITE já possui usinagens de muxarabi (layer USINAGEM_*). Injeção cancelada para evitar duplicação.' };
    }

    const { width: pieceW, height: pieceH, minX: pieceMinX, minY: pieceMinY } = iteParsed.pieceBounds;
    console.log(`[Muxarabi Inject] Peça: ${pieceW}mm x ${pieceH}mm (origin: ${pieceMinX}, ${pieceMinY})`);

    // 3. Locate and read the muxarabi template
    const muxarabiDirPath = app.isPackaged
      ? path.join(process.resourcesPath, 'Muxarabi')
      : path.join(app.getAppPath(), 'Muxarabi');

    const templateFilename = `${sizeCode.replace(/\s+/g, '').toUpperCase()}.dxf`;
    const templateFullPath = await findFileRecursive(muxarabiDirPath, templateFilename.toLowerCase());

    if (!templateFullPath) {
      return { ok: false, message: `Template Muxarabi "${templateFilename}" não encontrado na pasta Muxarabi.` };
    }

    console.log(`[Muxarabi Inject] Template encontrado: ${templateFullPath}`);

    const templateContent = await fsp.readFile(templateFullPath, 'utf8');
    const templateEntities = extractTemplateEntities(templateContent);

    console.log(`[Muxarabi Inject] Total entidades USINAGEM_18 no template: ${templateEntities.length}`);

    // 4. Filter entities that fit COMPLETELY within the piece (with 50mm margin)
    const MARGIN = 50;
    const tolerance = 0.1; // floating point tolerance
    const clipMinX = pieceMinX + MARGIN - tolerance;
    const clipMaxX = pieceMinX + pieceW - MARGIN + tolerance;
    const clipMinY = pieceMinY + MARGIN - tolerance;
    const clipMaxY = pieceMinY + pieceH - MARGIN + tolerance;

    const fittingEntities = templateEntities.filter(entity => {
      return entity.points.every(p =>
        p.x >= clipMinX && p.x <= clipMaxX &&
        p.y !== null && p.y >= clipMinY && p.y <= clipMaxY
      );
    });

    console.log(`[Muxarabi Inject] Entidades que cabem na peça: ${fittingEntities.length} de ${templateEntities.length}`);

    if (fittingEntities.length === 0) {
      return { ok: false, message: `Nenhuma entidade do muxarabi ${sizeCode} cabe nas dimensões da peça (${pieceW}x${pieceH}mm com margem de ${MARGIN}mm).` };
    }

    // 5. Generate new handles and inject entities into the ITE DXF
    // Detectar o formato do ITE: "moderno" (com cabeçalho $ACADVER, handles, LWPOLYLINE)
    // ou "mínimo" estilo R12 (sem cabeçalho, POLYLINE/VERTEX, sem handles)
    const isModernDxf = /\$ACADVER/i.test(iteContent);
    console.log(`[Muxarabi Inject] Formato do ITE: ${isModernDxf ? 'moderno (com cabeçalho)' : 'mínimo R12 (sem cabeçalho)'}`);

    let maxHandle = findMaxHandle(iteContent);
    const iteLines = iteContent.split(/\r?\n/);

    // Find the correct 330 handle from the ITE file
    let ownerHandle = null;
    const firstIteEntity = iteParsed.entities[0];
    if (firstIteEntity) {
      const firstLines = iteLines.slice(firstIteEntity.rawStart, firstIteEntity.rawEnd + 1);
      for (let i = 0; i < firstLines.length; i++) {
        if (firstLines[i].trim() === '330') {
          ownerHandle = firstLines[i + 1].trim();
          break;
        }
      }
    }

    // 5a. Se a peça é de outra espessura (ex: 25mm), converter profundidades e layer de fresa da peça
    if (usinagemLayer !== 'USINAGEM_18') {
      for (let i = iteParsed.entitiesStartLine; i < iteParsed.entitiesEndLine - 1; i += 2) {
        const code = iteLines[i].trim();
        const val = (iteLines[i + 1] || '').trim();
        if ((code === '38' || code === '39' || code === '30') && (val === '18.0' || val === '-18.0' || val === '18' || val === '-18')) {
          iteLines[i + 1] = val.startsWith('-') ? `-${th}.0` : `${th}.0`;
        }
      }
      for (let i = 0; i < iteLines.length; i++) {
        if (iteLines[i].trim().toUpperCase() === 'FRESA_12_18') {
          iteLines[i] = iteLines[i].replace(/FRESA_12_18/i, fresaLayer);
        }
      }
      console.log(`[Muxarabi Inject] Peça convertida para ${th}mm (${fresaLayer})`);
    }

    // Build the new entity text
    const newEntityLines = [];
    if (isModernDxf) {
      // Formato moderno: copiar o texto bruto do template trocando handle (5), owner (330),
      // layer (8) e descartando a referência de material (347)
      for (const entity of fittingEntities) {
        maxHandle++;
        const handleHex = maxHandle.toString(16).toUpperCase();

        const entityLines = entity.rawText.split(/\r?\n/);
        let handleReplaced = false;
        let ownerReplaced = false;
        let layerReplaced = false;

        for (let i = 0; i < entityLines.length; i++) {
          const code = entityLines[i].trim();
          if (code === '5' && !handleReplaced) {
            newEntityLines.push(entityLines[i]); // push the "  5"
            i++;
            newEntityLines.push(handleHex); // replace old handle with new
            handleReplaced = true;
          } else if (code === '330' && !ownerReplaced && ownerHandle) {
            newEntityLines.push(entityLines[i]);
            i++;
            newEntityLines.push(ownerHandle);
            ownerReplaced = true;
          } else if (code === '8' && !layerReplaced && (entityLines[i + 1] || '').trim().toUpperCase() === 'USINAGEM_18') {
            newEntityLines.push(entityLines[i]);
            i++;
            newEntityLines.push(usinagemLayer);
            layerReplaced = true;
          } else if (code === '347' && handleReplaced) {
            i++; // referência de material do template não existe no ITE — descartar par
          } else {
            newEntityLines.push(entityLines[i]);
          }
        }
      }
    } else {
      // Formato mínimo R12: LWPOLYLINE/handles não são suportados — converter cada
      // entidade do template para POLYLINE/VERTEX/SEQEND no mesmo estilo do arquivo
      for (const entity of fittingEntities) {
        newEntityLines.push(...lwpolylineToOldStyle(entity.rawText, usinagemLayer));
      }
    }

    // Find insertion point: right before "  0\r\nENDSEC" at end of ENTITIES
    const insertionLine = iteParsed.entitiesEndLine;
    let resultLines = [
      ...iteLines.slice(0, insertionLine),
      ...newEntityLines,
      ...iteLines.slice(insertionLine)
    ];

    // 6. Garantir que a layer de usinagem está declarada na tabela LAYER
    // (entidade em layer não declarada faz o AutoCAD travar listando erros ao abrir)
    maxHandle++;
    const layerRes = ensureLayerDeclared(resultLines, usinagemLayer, 3, maxHandle.toString(16).toUpperCase());
    resultLines = layerRes.lines;
    if (layerRes.added) {
      console.log(`[Muxarabi Inject] Layer ${usinagemLayer} declarada na tabela LAYER`);
    } else {
      maxHandle--; // handle reservado não foi usado
    }

    // 7. Atualizar $HANDSEED para além do último handle usado
    updateHandseed(resultLines, (maxHandle + 1).toString(16).toUpperCase());

    // 8. Backup do ITE original antes de sobrescrever
    try {
      await fse.ensureDir(state.REPLACE_BACKUP_DIR);
      const backupName = `${path.basename(iteFullPath, path.extname(iteFullPath))}_backup_mx_${Date.now()}.dxf`;
      await fse.copy(iteFullPath, path.join(state.REPLACE_BACKUP_DIR, backupName), { overwrite: true });
    } catch (e) { /* continuar mesmo se backup falhar */ }

    // 9. Write back the modified DXF
    const resultContent = resultLines.join('\r\n');
    await fsp.writeFile(iteFullPath, resultContent, 'utf8');

    console.log(`[Muxarabi Inject] ✅ SUCESSO: ${fittingEntities.length} entidades injetadas em ${iteFullPath}`);

    return {
      ok: true,
      path: iteFullPath,
      injectedCount: fittingEntities.length,
      totalInTemplate: templateEntities.length,
      pieceDimensions: `${pieceW}x${pieceH}mm`,
      thickness: th,
      layer: usinagemLayer
    };
  } catch (e) {
    console.error('[Muxarabi Inject] ❌ ERRO:', e.message || e);
    console.error('[Muxarabi Inject] Stack:', e.stack);
    return { ok: false, message: `Erro ao injetar muxarabi: ${String(e && e.message || e)}` };
  }
}

/** ================== IPC: FIX FRESA 37 TO 18 ================== **/
async function doFixFresa37to18(dxfFilePath) {
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
}

/** ================== IPC: BUSCA DE ARQUIVOS DE DESENHO (DXF) ================== **/
ipcMain.handle('analyzer:searchDrawingFiles', async (_e, { searchTerm }) => {
  try {
    const cfg = state.currentCfg || (await loadCfg()) || {};
    const drawingsFolder = cfg?.drawings;
    if (!drawingsFolder) {
      return { ok: false, message: "A pasta de desenhos não está configurada." };
    }
    const folderExists = await fse.pathExists(drawingsFolder);
    if (!folderExists) {
      return { ok: false, message: `Pasta de desenhos não encontrada: ${drawingsFolder}` };
    }

    // Validar se a pasta raiz é legível
    try {
      await fse.readdir(drawingsFolder);
    } catch (e) {
      return { ok: false, message: `Sem permissão de leitura na pasta de desenhos: ${e.message}` };
    }

    const results = [];
    const term = String(searchTerm || '').toLowerCase().trim();
    if (!term) {
      return { ok: true, results: [] };
    }

    // Função interna recursiva para buscar arquivos .dxf correspondentes
    async function scanDir(directory) {
      if (results.length >= 100) return;
      let items;
      try {
        items = await fse.readdir(directory, { withFileTypes: true });
      } catch (e) {
        return; // Ignora erros de leitura de subpastas individuais
      }

      for (const item of items) {
        if (results.length >= 100) return;
        const full = path.join(directory, item.name);
        if (item.isDirectory()) {
          await scanDir(full);
        } else if (item.isFile()) {
          if (item.name.toLowerCase().endsWith('.dxf') && item.name.toLowerCase().includes(term)) {
            results.push({
              name: item.name,
              fullPath: full
            });
          }
        }
      }
    }

    await scanDir(drawingsFolder);
    return { ok: true, results };
  } catch (e) {
    return { ok: false, message: String(e && e.message || e) };
  }
});

/** ================== IPC: ABRIR DESENHO PELO CAMINHO COMPLETO ================== **/
ipcMain.handle('analyzer:openDrawingByPath', async (_e, fullPath) => {
  try {
    if (!fullPath) return { ok: false, message: "Caminho do arquivo não informado." };
    const exists = await fse.pathExists(fullPath);
    if (!exists) return { ok: false, message: "Arquivo não encontrado (pode ter sido movido ou renomeado)." };
    const errorMsg = await shell.openPath(fullPath);
    if (errorMsg) {
      return { ok: false, message: `Erro ao abrir o arquivo: ${errorMsg}` };
    }
    return { ok: true, path: fullPath };
  } catch (e) {
    return { ok: false, message: String(e && e.message || e) };
  }
});

/** ================== IPC: MOSTRAR DESENHO NA PASTA (CAMINHO COMPLETO) ================== **/
ipcMain.handle('analyzer:showDrawingInFolder', async (_e, fullPath) => {
  try {
    if (!fullPath) return { ok: false, message: "Caminho do arquivo não informado." };
    const exists = await fse.pathExists(fullPath);
    if (!exists) return { ok: false, message: "Arquivo não encontrado (pode ter sido movido ou renomeado)." };
    shell.showItemInFolder(fullPath);
    return { ok: true, path: fullPath };
  } catch (e) {
    return { ok: false, message: String(e && e.message || e) };
  }
});

/**
 * Copia um desenho da Pasta de Desenhos para a Pasta de Cópia de Desenhos configurada,
 * preservando a subpasta relativa (ex: ITE\ITE00000210A.dxf) para manter as duas em espelho.
 * Usada tanto pelo botão manual "Copiar" quanto pelos auto-fixes (fresa 37mm, muxarabi) —
 * nesses casos o robô já alterou o desenho sozinho, então a réplica também sai automática.
 */
async function copyDrawingToMirror(fullPath) {
  try {
    if (!fullPath) return { ok: false, message: 'Caminho do arquivo não informado.' };

    const cfg = state.currentCfg || (await loadCfg()) || {};
    const mirrorRoot = cfg?.drawingsCopy;
    if (!mirrorRoot) return { ok: false, message: 'A pasta de cópia de desenhos não está configurada nas preferências.' };

    const exists = await fse.pathExists(fullPath);
    if (!exists) return { ok: false, message: 'Arquivo não encontrado (pode ter sido movido ou renomeado).' };

    const resolvedFile = path.resolve(fullPath);
    const fileName = path.basename(resolvedFile);

    const destPath = path.join(mirrorRoot, fileName);
    await fse.ensureDir(mirrorRoot);
    await fse.copy(resolvedFile, destPath, { overwrite: true });
    console.log(`[Mirror] Desenho copiado: ${resolvedFile} -> ${destPath}`);
    return { ok: true, destPath };
  } catch (e) {
    console.error('[Mirror] Erro ao copiar desenho para a pasta espelho:', String((e && e.message) || e));
    return { ok: false, message: String((e && e.message) || e) };
  }
}

/** ================== IPC: COPIAR DESENHO PARA A PASTA ESPELHO (MANUAL) ================== **/
ipcMain.handle('analyzer:copyDrawingToMirror', async (_e, fullPath) => {
  return await copyDrawingToMirror(fullPath);
});

/**
 * Mesma cópia manual acima, mas localizando o arquivo pelo código do desenho
 * (ex: "ESP00004702A") em vez do caminho completo — usada pelos botões "Copiar"
 * espalhados nas tabelas de itens, que só conhecem o código, não o caminho.
 */
ipcMain.handle('analyzer:copyDrawingByCodeToMirror', async (_e, drawingCode) => {
  try {
    if (!drawingCode) return { ok: false, message: 'Código de desenho vazio ou inválido.' };
    const cfg = state.currentCfg || (await loadCfg()) || {};
    const dxfFolderPath = cfg?.drawings;
    if (!dxfFolderPath) return { ok: false, message: 'A pasta de desenhos não está configurada nas preferências.' };

    const exactFilename = `${drawingCode.toLowerCase()}.dxf`;
    const fullPath = await findFileRecursive(dxfFolderPath, exactFilename);
    if (!fullPath) return { ok: false, message: `Desenho "${exactFilename}" não encontrado na pasta de desenhos ou subpastas.` };

    return await copyDrawingToMirror(fullPath);
  } catch (e) {
    return { ok: false, message: String(e && e.message || e) };
  }
});

/** ================== IPC: FIND DRAWING FILE ================== **/
ipcMain.handle('analyzer:findDrawingFile', async (_e, obj) => {
  try {
    const { drawingCode, xmlFilePath } = obj || {};

    console.log('[DXF Search] ========== INICIANDO BUSCA ==========');
    console.log('[DXF Search] Código de desenho procurado:', drawingCode);
    console.log('[DXF Search] Arquivo XML:', xmlFilePath);

    const cfg = state.currentCfg || (await loadCfg()) || {};
    const drawingsFolder = cfg?.drawings;

    console.log('[DXF Search] Pasta de desenhos configurada:', drawingsFolder);

    let dxfFolderPath = drawingsFolder;
    if (!dxfFolderPath) {
      console.log('[DXF Search] ❌ Pasta de desenhos não configurada');
      return { found: false, path: null, message: "A pasta de desenhos não está configurada nas preferências." };
    }

    console.log('[DXF Search] Caminho final a buscar:', dxfFolderPath);

    // Verificar se a pasta existe
    const folderExists = await fse.pathExists(dxfFolderPath);
    console.log('[DXF Search] Pasta existe?', folderExists);

    if (!folderExists) {
      console.log('[DXF Search] ❌ FALHA: Pasta não encontrada');
      return { found: false, path: null, message: `Pasta não encontrada: ${dxfFolderPath}` };
    }

    // Procurar arquivo recursivamente
    const exactFilename = `${drawingCode.toLowerCase()}.dxf`;
    console.log('[DXF Search] Buscando arquivo recursivamente:', exactFilename);
    const fullPath = await findFileRecursive(dxfFolderPath, exactFilename);

    if (!fullPath) {
      console.log('[DXF Search] ❌ FALHA: Nenhum arquivo corresponde ao padrão nas subpastas');
      return { found: false, path: null, message: `Arquivo "${exactFilename}" não encontrado em ${dxfFolderPath} ou subpastas.` };
    }

    const foundFile = path.basename(fullPath);
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

/** ================== IPC: OPEN DRAWING FILE ================== **/
ipcMain.handle('analyzer:openDrawing', async (_e, arg) => {
  try {
    const drawingCode = (typeof arg === 'string') ? arg : (arg?.drawingCode || '');
    if (!drawingCode) {
      return { ok: false, message: "Código de desenho vazio ou inválido." };
    }
    const cfg = state.currentCfg || (await loadCfg()) || {};
    const dxfFolderPath = cfg?.drawings;

    if (!dxfFolderPath) {
      return { ok: false, message: "A pasta de desenhos não está configurada nas preferências." };
    }

    const folderExists = await fse.pathExists(dxfFolderPath);
    if (!folderExists) {
      return { ok: false, message: `Pasta de desenhos não encontrada: ${dxfFolderPath}` };
    }

    const exactFilename = `${drawingCode.toLowerCase()}.dxf`;
    const fullPath = await findFileRecursive(dxfFolderPath, exactFilename);

    if (!fullPath) {
      return { ok: false, message: `Desenho "${exactFilename}" não encontrado na pasta de desenhos ou subpastas.` };
    }
    const errorMsg = await shell.openPath(fullPath);
    if (errorMsg) {
      return { ok: false, message: `Erro ao abrir o arquivo: ${errorMsg}` };
    }
    return { ok: true, path: fullPath };
  } catch (e) {
    return { ok: false, message: String(e && e.message || e) };
  }
});

/** ================== IPC: OPEN DRAWING FOLDER ================== **/
ipcMain.handle('analyzer:openDrawingFolder', async (_e, arg) => {
  try {
    const drawingCode = (typeof arg === 'string') ? arg : (arg?.drawingCode || '');
    if (!drawingCode) {
      return { ok: false, message: "Código de desenho vazio ou inválido." };
    }
    const cfg = state.currentCfg || (await loadCfg()) || {};
    const dxfFolderPath = cfg?.drawings;

    if (!dxfFolderPath) {
      return { ok: false, message: "A pasta de desenhos não está configurada nas preferências." };
    }

    const folderExists = await fse.pathExists(dxfFolderPath);
    if (!folderExists) {
      return { ok: false, message: `Pasta de desenhos não encontrada: ${dxfFolderPath}` };
    }

    const exactFilename = `${drawingCode.toLowerCase()}.dxf`;
    const fullPath = await findFileRecursive(dxfFolderPath, exactFilename);

    if (!fullPath) {
      return { ok: false, message: `Desenho "${exactFilename}" não encontrado na pasta de desenhos ou subpastas.` };
    }

    shell.showItemInFolder(fullPath);
    return { ok: true, path: fullPath };
  } catch (e) {
    return { ok: false, message: String(e && e.message || e) };
  }
});

/** ================== IPC: OPEN MUXARABI DRAWING FILE ================== **/
ipcMain.handle('analyzer:injectMuxarabi', async (_e, arg) => {
  return await doInjectMuxarabi(arg);
});

ipcMain.handle('analyzer:openMuxarabiDrawing', async (_e, arg) => {
  try {
    const sizeCode = (typeof arg === 'string') ? arg : (arg?.sizeCode || '');
    if (!sizeCode) {
      return { ok: false, message: "Código de tamanho vazio ou inválido." };
    }
    const muxarabiDirPath = app.isPackaged
      ? path.join(process.resourcesPath, 'Muxarabi')
      : path.join(app.getAppPath(), 'Muxarabi');
    const folderExists = await fse.pathExists(muxarabiDirPath);
    if (!folderExists) {
      return { ok: false, message: `Pasta "Muxarabi" não encontrada na raiz do projeto ou recursos: ${muxarabiDirPath}` };
    }

    // Buscar o arquivo de desenho (ex: "50x50.dxf") recursivamente dentro da pasta Muxarabi na raiz
    const exactFilename = `${sizeCode.toLowerCase()}.dxf`;
    const fullPath = await findFileRecursive(muxarabiDirPath, exactFilename);

    if (!fullPath) {
      return { ok: false, message: `Desenho "${exactFilename}" não encontrado na pasta Muxarabi da raiz do projeto.` };
    }

    const errorMsg = await shell.openPath(fullPath);
    if (errorMsg) {
      return { ok: false, message: `Erro ao abrir o arquivo: ${errorMsg}` };
    }
    return { ok: true, path: fullPath };
  } catch (e) {
    return { ok: false, message: String(e && e.message || e) };
  }
});

ipcMain.handle('analyzer:fixFresa37to18', async (_e, dxfFilePath) => {
  return await doFixFresa37to18(dxfFilePath);
});

module.exports = { doFixFresa37to18, doInjectMuxarabi, copyDrawingToMirror };
