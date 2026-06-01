// src/lib/xml-logic.js
// Lógica de validação XML extraída para testes e reuso
const { XMLParser } = require('fast-xml-parser');

/**
 * Valida o conteúdo XML de um orçamento Bartz.
 */
function validateXmlContent(txt, cfg = {}) {
    const payload = {
        erros: [],
        warnings: [],
        tags: [],
        autoFixes: [],
        meta: {},
    };

    // ===== BUILDER flags =====
    const hasBldrS = /\bBUILDER\s*=\s*"S"/i.test(txt);
    const hasBldrN = /\bBUILDER\s*=\s*"N"/i.test(txt);
    const isFerragensOnly = hasBldrN && !hasBldrS;
    if (isFerragensOnly) {
        payload.tags.push("ferragens");
        payload.meta.ferragensOnly = true;
    }

    // ===== Regras fixas =====
    const itemMatches = Array.from(txt.matchAll(/<ITEM\b[\s\S]*?>/gi));
    const refEmptyMatches = [];

    for (const m of itemMatches) {
        const itemTag = m[0];
        const hasEmptyRef = /\bREFERENCIA\s*=\s*""/i.test(itemTag);
        const hasEmptyBase = /\bITEM_BASE\s*=\s*""/i.test(itemTag);
        const hasNoRef = !/\bREFERENCIA\s*=\s*"/i.test(itemTag);
        const hasNoBase = !/\bITEM_BASE\s*=\s*"/i.test(itemTag);

        const refIsMissing = hasEmptyRef || hasNoRef;
        const baseIsMissing = hasEmptyBase || hasNoBase;

        if (refIsMissing && baseIsMissing) {
            const idMatch = itemTag.match(/\bID\s*=\s*"([^"]+)"/i);
            const descMatch = itemTag.match(/\bDESCRICAO\s*=\s*"([^"]+)"/i);
            const caminhoMatch = itemTag.match(/\bCAMINHOITEMCATALOG\s*=\s*"([^"]+)"/i);

            refEmptyMatches.push({
                id: idMatch ? idMatch[1] : null,
                descricao: descMatch ? descMatch[1] : null,
                caminhoItemCatalog: caminhoMatch ? caminhoMatch[1] : null,
                snippet: itemTag.slice(0, 500)
            });
        }
    }

    if (refEmptyMatches.length > 0) {
        payload.erros.push({ descricao: "ITEM SEM CÓDIGO" });
        payload.tags.push("sem_codigo");

        const map = new Map();
        for (const r of refEmptyMatches) {
            const key = `${r.id || ''}|${r.descricao || ''}`;
            if (!map.has(key)) map.set(key, r);
        }
        payload.meta.referenciaEmpty = Array.from(map.values());
    }

    if (/\bQUANTIDADE\s*=\s*"0(?:\.0+)?"/i.test(txt)) payload.erros.push({ descricao: "ITEM SEM QUANTIDADE" });
    if (/\bPRECO_TOTAL\s*=\s*"0(?:\.0+)?"/i.test(txt)) payload.erros.push({ descricao: "ITEM SEM PREÇO" });

    // ===== ITEM_BASE="ES08" (DUPLADO 37MM) =====
    try {
        const es08Matches = [];
        for (const m of txt.matchAll(/<ITEM\b[^>]*\bITEM_BASE\s*=\s*"ES08"[^>]*>/gi)) {
            const snippet = ((m[0] || '').trim()).slice(0, 400);
            const idMatch = snippet.match(/\bID\s*=\s*"([^"]+)"/i);
            const refMatch = snippet.match(/\bREFERENCIA\s*=\s*"([^"]*)"/i);
            const desenhoMatch = snippet.match(/\bDESENHO\s*=\s*"([^"]*)"/i);
            es08Matches.push({
                id: idMatch ? idMatch[1] : null,
                referencia: refMatch ? refMatch[1] : null,
                desenho: desenhoMatch ? desenhoMatch[1] : null,
                snippet
            });
        }
        if (es08Matches.length) {
            payload.erros.push({ descricao: "ITEM DUPLADO 37MM" });
            payload.tags.push("duplado37mm");
            const map = new Map();
            for (const r of es08Matches) {
                const key = `${r.id || ''}|${r.referencia || ''}|${r.desenho || ''}`;
                if (!map.has(key)) map.set(key, r);
            }
            payload.meta.es08Matches = Array.from(map.values());
        }
    } catch (e) { }

    // Cor coringa
    const COR_CORINGA_LIST = [
        "PAINEL_CG1_06", "PAINEL_CG1_18", "PAINEL_CG1_37", "PAINEL_CG1_15", "PAINEL_CG1_25",
        "PAINEL_CG2_06", "PAINEL_CG2_18", "PAINEL_CG2_37", "PAINEL_CG2_15", "PAINEL_CG2_25",
        "FITA_CG1_19", "FITA_CG1_22", "FITA_CG1_29", "FITA_CG1_35", "FITA_CG1_42", "FITA_CG1_50",
        "FITA_CG2_19", "FITA_CG2_22", "FITA_CG2_29", "FITA_CG2_35", "FITA_CG2_42", "FITA_CG2_50",
        "CHAPA_CG1_06", "CHAPA_CG1_18", "CHAPA_CG1_37", "CHAPA_CG1_15", "CHAPA_CG1_25",
        "CHAPA_CG2_06", "CHAPA_CG2_18", "CHAPA_CG2_37", "CHAPA_CG2_15", "CHAPA_CG2_25",
        "TAPAFURO_CG1_06", "TAPAFURO_CG1_18", "TAPAFURO_CG1_37", "TAPAFURO_CG1_15", "TAPAFURO_CG1_25",
        "TAPAFURO_CG2_06", "TAPAFURO_CG2_18", "TAPAFURO_CG2_37", "TAPAFURO_CG2_15", "TAPAFURO_CG2_25",
        "CAPA_CG1", "TAPAFURO_CG1", "TAPAFURO_CG2", "CAPA_CG2",
    ];
    try {
        const corRegex = new RegExp(`\\b(${COR_CORINGA_LIST.join("|")})\\b`, "gi");
        const corMatches = Array.from(new Set(Array.from(txt.matchAll(corRegex)).map(m => (m[1] || m[0] || '').toString().toUpperCase()))).filter(Boolean);
        if (corMatches.length) {
            payload.erros.push({ descricao: "CADASTRO DE COR CORINGA" });
            payload.tags.push("coringa");
            payload.meta.coringaMatches = corMatches;
        }

        const hasCG1Global = /(?<![a-zA-Z0-9])CG1(?![a-zA-Z0-9])/i.test(txt);
        const hasCG2Global = /(?<![a-zA-Z0-9])CG2(?![a-zA-Z0-9])/i.test(txt);
        const hasCoringa1Global = /(?<![a-zA-Z0-9])CORINGA1(?![a-zA-Z0-9])/i.test(txt);
        const hasCoringa2Global = /(?<![a-zA-Z0-9])CORINGA2(?![a-zA-Z0-9])/i.test(txt);

        if (hasCG1Global || hasCG2Global || hasCoringa1Global || hasCoringa2Global) {
            payload.erros.push({ descricao: "PENDENTE: TROCA DE SIGLAS (LOTE)" });
            payload.tags.push("coringa");
            if (hasCG1Global) payload.meta.cg1_detected = true;
            if (hasCG2Global) payload.meta.cg2_detected = true;
            if (hasCoringa1Global) payload.meta.coringa1_detected = true;
            if (hasCoringa2Global) payload.meta.coringa2_detected = true;
        }
    } catch (e) { }

    // ITENS ESPECIAIS
    try {
        const specialItems = [];
        for (const m of itemMatches) {
            const itemTag = m[0];
            const baseMatch = itemTag.match(/\bITEM_BASE\s*=\s*"(ES0[^"]*)"/i);
            if (baseMatch) {
                const itemBase = baseMatch[1].toUpperCase();
                const idMatch = itemTag.match(/\bID\s*=\s*"([^"]*)"/i);
                const desenhoMatch = itemTag.match(/\bDESENHO\s*=\s*"([^"]*)"/i);
                const descMatch = itemTag.match(/\bDESCRICAO\s*=\s*"([^"]*)"/i);
                const largMatch = itemTag.match(/\bLARGURA\s*=\s*"([^"]*)"/i);
                const altMatch = itemTag.match(/\bALTURA\s*=\s*"([^"]*)"/i);
                const profMatch = itemTag.match(/\bPROFUNDIDADE\s*=\s*"([^"]*)"/i);

                const l = largMatch ? Math.round(parseFloat(largMatch[1])) : "0";
                const a = altMatch ? Math.round(parseFloat(altMatch[1])) : "0";
                const p = profMatch ? Math.round(parseFloat(profMatch[1])) : "0";

                specialItems.push({
                    id: idMatch ? idMatch[1] : "",
                    itemBase,
                    desenho: desenhoMatch ? desenhoMatch[1] : "",
                    descricao: descMatch ? descMatch[1] : "",
                    dimensao: `${l}x${a}x${p}`
                });
            }
        }
        const spMap = new Map();
        for (const s of specialItems) {
            const key = `${s.itemBase}|${s.desenho}|${s.descricao}|${s.dimensao}`;
            if (!spMap.has(key)) {
                spMap.set(key, {
                    id: s.id,
                    itemBase: s.itemBase,
                    desenho: s.desenho,
                    descricao: s.descricao,
                    dimensao: s.dimensao,
                    ids: [s.id]
                });
            } else {
                spMap.get(key).ids.push(s.id);
            }
        }
        payload.meta.specialItems = Array.from(spMap.values());
    } catch (e) { }

    // IMPORTKEY
    try {
        const importKeyMatch = txt.match(/<IMPORTKEY\b[^>]*\bCODIGO\s*=\s*"([^"]*)"/i);
        if (importKeyMatch) payload.meta.importKey = importKeyMatch[1];
    } catch (e) { }

    // MUXARABI
    try {
        const muxarabiItems = [];
        for (const m of itemMatches) {
            const itemTag = m[0];
            const mxMatch = itemTag.match(/\bITEM_BASE\s*=\s*"(MX008[^"]*)"/i);
            if (mxMatch) {
                const itemBase = mxMatch[1].toUpperCase();
                const desenhoMatch = itemTag.match(/\bDESENHO\s*=\s*"([^"]*)"/i);
                const descMatch = itemTag.match(/\bDESCRICAO\s*=\s*"([^"]*)"/i);
                muxarabiItems.push({
                    itemBase,
                    desenho: desenhoMatch ? desenhoMatch[1] : "",
                    descricao: descMatch ? descMatch[1] : ""
                });
            }
        }
        if (muxarabiItems.length > 0) {
            const mxMap = new Map();
            for (const m of muxarabiItems) {
                const key = `${m.itemBase}|${m.desenho}|${m.descricao}`;
                if (!mxMap.has(key)) mxMap.set(key, m);
            }
            payload.meta.muxarabiItems = Array.from(mxMap.values());
        }
        if (/\bMX008001\b/i.test(txt) || /\bMX008002\b/i.test(txt)) {
            payload.erros.push({ descricao: "PEÇA MUXARABI" });
            payload.warnings.push("MUXARABI");
            payload.tags.push("muxarabi");
        }
    } catch (e) { }

    // MODULOS CURVOS
    if (/\bLR00(0[1-9]|1[01])\b/i.test(txt)) {
        payload.warnings.push("MÓD.CURVO  NO PED");
        payload.tags.push("curvo");
    }

    // ===== SEM ITEM FILHO =====
    try {
        const parser = new XMLParser({ 
            ignoreAttributes: false, 
            attributeNamePrefix: "",
            isArray: (name) => ['ITEM', 'ITEMS', 'ITENS'].includes(name)
        });
        const jsonObj = parser.parse(txt);
        
        const allItens = [];
        const findItens = (node) => {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node)) {
                node.forEach(findItens);
                return;
            }
            if (node.ITEM) {
                node.ITEM.forEach(item => {
                    allItens.push(item);
                    findItens(item);
                });
            }
            for (const key in node) {
                if (key !== 'ITEM') findItens(node[key]);
            }
        };
        findItens(jsonObj);

        const semFilhoMatches = [];
        for (const item of allItens) {
            const preco = String(item.PRECO_TOTAL || "").trim();
            if (preco === "0.01") {
                const itemsCol = item.ITEMS?.[0];
                const children = itemsCol?.ITEM || [];
                const hasChildren = Array.isArray(children) && children.length > 0;
                
                if (!hasChildren) {
                    semFilhoMatches.push({
                        id: item.ID || "",
                        referencia: item.REFERENCIA || ""
                    });
                }
            }
        }

        if (semFilhoMatches.length > 0) {
            payload.erros.push({ descricao: "Sem Item Filho" });
            payload.tags.push("sem_filho");
            payload.meta.semFilhoItems = semFilhoMatches;
        }
    } catch (e) { }

    // MAQUINAS
    const machines = [];
    for (const m of txt.matchAll(/<MAQUINA\b([^>]*\bID_PLUGIN\s*=\s*"([^"]+)"[^>]*\bNOME_PLUGIN\s*=\s*"([^"]+)")/gi)) {
        const id = (m[2] || "").trim();
        const name = (m[3] || "").trim();
        if (id === "2530" || id === "2534") {
            machines.push({ id, name });
        }
    }
    payload.meta.machines = machines;

    if (!isFerragensOnly) {
        const REQUIRED_PLUGINS = ["2530", "2534"];
        const seen = new Set(machines.map(m => m.id));
        if (!REQUIRED_PLUGINS.every(id => seen.has(id))) {
            payload.erros.push({ descricao: "PROBLEMA NA GERAÇÃO DE MÁQUINAS" });
        }
        const PLUGIN_NAMES = { "2530": "Aspan", "2534": "NCB612" };
        payload.meta.machines = Array.from(seen).map(id => ({ id, name: PLUGIN_NAMES[id] }));
    }

    // AUTO-FIX
    let updatedTxt = txt;
    if (cfg.enableAutoFix) {
        let changed = false;
        let priceFixCount = 0;
        let qtyFixCount = 0;

        updatedTxt = updatedTxt.replace(/<ITEM\b([^>]*)>/gi, (full, attrs) => {
            let updatedAttrs = attrs;
            const refMatch = updatedAttrs.match(/\bREFERENCIA\s*=\s*"([^"]*)"/i);
            const ref = (refMatch?.[1] || "").trim();

            const qtyMatch = updatedAttrs.match(/\bQUANTIDADE\s*=\s*"([^"]*)"/i);
            if (qtyMatch) {
                const qtyVal = (qtyMatch[1] || "").trim();
                if (ref && /^0(?:\.0+)?$/.test(qtyVal)) {
                    updatedAttrs = updatedAttrs.replace(/(\bQUANTIDADE\s*=\s*")0(?:\.0+)?(")/i, `$11$2`);
                    qtyFixCount++;
                    changed = true;
                }
            }

            const priceMatch = updatedAttrs.match(/\bPRECO_TOTAL\s*=\s*"([^"]*)"/i);
            if (priceMatch) {
                const pVal = (priceMatch[1] || "").trim();
                if (/^0(?:\.0+)?$/.test(pVal)) {
                    updatedAttrs = updatedAttrs.replace(/(\bPRECO_TOTAL\s*=\s*")0(?:\.0+)?(")/i, `$10.10$2`);
                    priceFixCount++;
                    changed = true;
                }
            }
            return `<ITEM${updatedAttrs}>`;
        });

        if (qtyFixCount > 0) {
            payload.autoFixes.push(`Ajustes de QUANTIDADE aplicados em ${qtyFixCount} item(ns)`);
            payload.erros = (payload.erros || []).filter(e => (e.descricao || e).toUpperCase() !== "ITEM SEM QUANTIDADE");
        }
        if (priceFixCount > 0) {
            payload.autoFixes.push(`Ajustes de PREÇO aplicados em ${priceFixCount} item(ns)`);
            payload.erros = (payload.erros || []).filter(e => (e.descricao || e).toUpperCase() !== "ITEM SEM PREÇO");
        }
    }

    // Dedup final
    payload.tags = Array.from(new Set(payload.tags));
    const dedup = (arr) => {
        const s = new Set();
        return (arr || []).filter(x => {
            const k = (typeof x === "string" ? x : x?.descricao || String(x)).toLowerCase();
            if (s.has(k)) return false; s.add(k); return true;
        });
    };
    payload.erros = dedup(payload.erros);
    payload.warnings = dedup(payload.warnings);

    return { payload, updatedTxt };
}

module.exports = { validateXmlContent };
