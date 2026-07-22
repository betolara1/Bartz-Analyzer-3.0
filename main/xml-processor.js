// main/xml-processor.js
// Núcleo do pipeline: lê e valida um XML de pedido, gera o XML simplificado,
// aplica os auto-fixes de DXF (fresa 37mm e muxarabi) e move o arquivo para
// a pasta final (ok/erro). É aqui que watcher, editor de XML e replay convergem.
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const fse = require("fs-extra");
const { validateXmlContent } = require(path.join(__dirname, "..", "src", "lib", "xml-logic.js"));
const { send } = require("./helpers");
const { findFileRecursive } = require("./helpers");
const { runErpValidation } = require("./erp-validation");
const { doFixFresa37to18, doInjectMuxarabi, copyDrawingToMirror } = require("./dxf-tools");

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
  await runErpValidation(updatedTxt, payload);

  return payload;
}

/**
 * Gera a versão simplificada do XML de pedido:
 * mantém o documento inteiro, mas dentro de <ITENS_PEDIDO> deixa somente
 * a linha de cada ITEM pai (sem filhos), com apenas os atributos:
 * ID, REFERENCIA, ITEM_BASE, LARGURA, ALTURA, PROFUNDIDADE, DESCRICAO, UNIDADE, QUANTIDADE, PRECO_TOTAL.
 */
const SIMPLIFIED_KEEP_ATTRS = ["ID", "REFERENCIA", "ITEM_BASE", "LARGURA", "ALTURA", "PROFUNDIDADE", "DESCRICAO", "UNIDADE", "QUANTIDADE", "PRECO_TOTAL"];

function buildSimplifiedXml(txt) {
  const openMatch = /<ITENS_PEDIDO\b[^>]*>/i.exec(txt);
  if (!openMatch) return null;
  const openEnd = openMatch.index + openMatch[0].length;

  const closeMatch = /<\/ITENS_PEDIDO>/i.exec(txt.slice(openEnd));
  if (!closeMatch) return null;
  const closeIdx = openEnd + closeMatch.index;

  const inner = txt.slice(openEnd, closeIdx);

  // preservar a indentação da linha do </ITENS_PEDIDO>
  const closeLineStart = inner.lastIndexOf('\n');
  const closeIndent = closeLineStart >= 0 && /^\s*$/.test(inner.slice(closeLineStart + 1)) ? inner.slice(closeLineStart + 1) : '';

  // varrer ITEMs de nível 1 (pais), ignorando os aninhados dentro de ESTRUTURA
  const simplifiedItems = [];
  const tagRe = /<ITEM\b[^>]*>|<\/ITEM>/gi;
  let depth = 0;
  let m;
  while ((m = tagRe.exec(inner))) {
    const tag = m[0];
    if (tag.startsWith('</')) { if (depth > 0) depth--; continue; }
    const selfClosing = /\/>$/.test(tag);

    if (depth === 0) {
      // indentação original da linha do ITEM pai
      const lineStart = inner.lastIndexOf('\n', m.index) + 1;
      const prefix = inner.slice(lineStart, m.index);
      const indent = /^\s*$/.test(prefix) ? prefix : '\t\t';

      // filtrar atributos, mantendo apenas os desejados (na ordem definida)
      const attrs = {};
      const attrRe = /([A-Za-z0-9_]+)\s*=\s*"([^"]*)"/g;
      let a;
      while ((a = attrRe.exec(tag))) attrs[a[1].toUpperCase()] = a[2];
      const kept = SIMPLIFIED_KEEP_ATTRS
        .filter((k) => Object.prototype.hasOwnProperty.call(attrs, k))
        .map((k) => `${k}="${attrs[k]}"`);

      simplifiedItems.push(`${indent}<ITEM ${kept.join(' ')}>\r\n${indent}</ITEM>`);
    }

    if (!selfClosing) depth++;
  }

  if (simplifiedItems.length === 0) return null;

  return txt.slice(0, openEnd) + '\r\n' + simplifiedItems.join('\r\n') + '\r\n' + closeIndent + txt.slice(closeIdx);
}

async function generateSimplifiedXml(fileFullPath, cfg, analysis) {
  if (!cfg?.simplificado) return; // pasta não configurada — recurso desativado
  try {
    const destPath = path.join(cfg.simplificado, path.basename(fileFullPath));
    // gerar somente na primeira análise: se já existe, não sobrescreve
    if (await fse.pathExists(destPath)) return;

    const txt = await fsp.readFile(fileFullPath, 'utf8');
    const simplified = buildSimplifiedXml(txt);
    if (!simplified) {
      console.log(`[Simplificado] ${path.basename(fileFullPath)}: sem ITENS_PEDIDO/ITEM — nada gerado.`);
      return;
    }

    await fse.ensureDir(cfg.simplificado);
    await fsp.writeFile(destPath, simplified, 'utf8');
    console.log(`[Simplificado] Gerado: ${destPath}`);

    if (analysis) {
      if (!analysis.autoFixes) analysis.autoFixes = [];
      analysis.autoFixes.push(`XML simplificado gerado na pasta configurada`);
    }
  } catch (e) {
    console.error('[Simplificado] Erro ao gerar XML simplificado:', String((e && e.message) || e));
  }
}

async function processOne(fileFullPath, cfg) {
  try {
    const analysis = await validateXml(fileFullPath, cfg);

    // GERAÇÃO DE XML SIMPLIFICADO (somente na primeira análise de cada arquivo)
    await generateSimplifiedXml(fileFullPath, cfg, analysis);

    // AUTO-FIX DUPLADO 37MM (ES08) - AUTOMATIZAÇÃO DE CORREÇÃO DXF
    if (cfg.enableAutoFix && analysis.meta && analysis.meta.es08Matches && analysis.meta.es08Matches.length > 0 && cfg.drawings) {
      let fixedCount = 0;

      for (const match of analysis.meta.es08Matches) {
        if (!match.desenho) continue;
        const exactFilename = `${match.desenho.toLowerCase()}.dxf`;
        const fullPath = await findFileRecursive(cfg.drawings, exactFilename);

        if (fullPath) {
          const res = await doFixFresa37to18(fullPath);
          if (res.ok) {
            fixedCount++;
            if (!analysis.autoFixes) analysis.autoFixes = [];
            analysis.autoFixes.push(`DXF: corrigido duplado (37mm/31mm) no arquivo ${match.desenho}`);

            // Desenho foi alterado pelo robô — replicar na pasta de cópia, se configurada
            const mirrorRes = await copyDrawingToMirror(fullPath);
            if (mirrorRes.ok) {
              analysis.autoFixes.push(`DXF: cópia atualizada na pasta espelho (${match.desenho})`);
            }
          } else if (res.message === 'Nenhuma alteração foi necessária') {
            fixedCount++;
            if (!analysis.autoFixes) analysis.autoFixes = [];
            analysis.autoFixes.push(`DXF: já estava correto no arquivo ${match.desenho}`);
          }
        }
      }

      if (fixedCount > 0) {
        // Remover o erro "ITEM DUPLADO 37MM" da lista se resolvemos algum
        analysis.erros = (analysis.erros || []).filter(e => (e.descricao || e).toUpperCase() !== "ITEM DUPLADO 37MM");

        // Assegurar que a tag "duplado_autofix" seja adicionada para manter rastro
        if (!analysis.tags) analysis.tags = [];
        analysis.tags.push("duplado_autofix");
      }
    }

    // AUTO-FIX MUXARABI (MX008) - AUTOMATIZAÇÃO DE INJEÇÃO DXF
    if (cfg.enableAutoFix && analysis.meta && analysis.meta.muxarabiItems && analysis.meta.muxarabiItems.length > 0 && cfg.drawings) {
      let injectedCount = 0;
      for (const item of analysis.meta.muxarabiItems) {
        if (!item.desenho) continue;
        const match = item.descricao?.match(/(\d+\s*x\s*\d+)/i);
        const sizeCode = match ? match[1].replace(/\s+/g, '').toLowerCase() : null;
        const thMatch = item.descricao?.match(/(\d{2})\s*mm/i);
        const thickness = thMatch ? thMatch[1] : '18';

        if (sizeCode) {
          const res = await doInjectMuxarabi({ drawingCode: item.desenho, sizeCode, thickness });
          if (res.ok) {
            injectedCount++;
            if (!analysis.autoFixes) analysis.autoFixes = [];
            analysis.autoFixes.push(`DXF: Muxarabi ${sizeCode} (${thickness}mm) aplicado no desenho ${item.desenho}`);

            // Desenho foi alterado pelo robô — replicar na pasta de cópia, se configurada
            if (res.path) {
              const mirrorRes = await copyDrawingToMirror(res.path);
              if (mirrorRes.ok) {
                analysis.autoFixes.push(`DXF: cópia atualizada na pasta espelho (${item.desenho})`);
              }
            }
          } else if (res.message && res.message.includes('já possui usinagens de muxarabi')) {
            injectedCount++;
            if (!analysis.autoFixes) analysis.autoFixes = [];
            analysis.autoFixes.push(`DXF: Muxarabi já estava aplicado no desenho ${item.desenho}`);
          }
        }
      }

      if (injectedCount > 0) {
        // Assegurar que a tag "muxarabi_autofix" seja adicionada para manter rastro
        if (!analysis.tags) analysis.tags = [];
        analysis.tags.push("muxarabi_autofix");

        // Remover o erro "PEÇA MUXARABI" da lista pois já foi tratado automaticamente
        analysis.erros = (analysis.erros || []).filter(e => (e.descricao || e).toUpperCase() !== "PEÇA MUXARABI");
      }
    }

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
    send('file-validated', { ...analysis, arquivo: finalPath, movedTo });
  } catch (e) {
    send('error', { where: 'processOne', message: String(e?.message || e) });
  }
}

module.exports = { validateXml, processOne, buildSimplifiedXml };
