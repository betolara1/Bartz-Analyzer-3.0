// tests/xml-validation.test.js
import { describe, it, expect } from 'vitest';
import { validateXmlContent } from '../src/lib/xml-logic.js';

describe('XML Validation Logic', () => {

    it('should detect FERRAGENS-ONLY when BUILDER="N" and no BUILDER="S"', () => {
        const xml = `<XML><ITEM BUILDER="N" /></XML>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.tags).toContain('ferragens');
        expect(payload.meta.ferragensOnly).toBe(true);
    });

    it('should detect ITEM SEM CÓDIGO correctly', () => {
        const xml = `<XML><ITEM ID="1" REFERENCIA="" ITEM_BASE="" DESCRICAO="Teste" /></XML>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.erros).toContainEqual({ descricao: 'ITEM SEM CÓDIGO' });
        expect(payload.tags).toContain('sem_codigo');
        expect(payload.meta.referenciaEmpty).toHaveLength(1);
        expect(payload.meta.referenciaEmpty[0].id).toBe('1');
    });

    it('should detect ITEM SEM QUANTIDADE and apply auto-fix', () => {
        const xml = `<XML><ITEM REFERENCIA="REF1" QUANTIDADE="0" /></XML>`;
        const { payload, updatedTxt } = validateXmlContent(xml, { enableAutoFix: true });
        // Without auto-fix it would have the error, but with auto-fix it should be cleared
        expect(payload.autoFixes).toContain('Ajustes de QUANTIDADE aplicados em 1 item(ns)');
        expect(updatedTxt).toContain('QUANTIDADE="1"');
    });

    it('should detect ITEM SEM PREÇO and apply auto-fix', () => {
        const xml = `<XML><ITEM PRECO_TOTAL="0" /></XML>`;
        const { payload, updatedTxt } = validateXmlContent(xml, { enableAutoFix: true });
        expect(payload.autoFixes).toContain('Ajustes de PREÇO aplicados em 1 item(ns)');
        expect(updatedTxt).toContain('PRECO_TOTAL="0.10"');
    });

    it('should detect COR CORINGA tokens', () => {
        const xml = `<XML><ITEM COR="PAINEL_CG1_18" /></XML>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.tags).toContain('coringa');
        expect(payload.meta.coringaMatches).toContain('PAINEL_CG1_18');
        expect(payload.meta.cg1_detected).toBe(true);
    });

    it('should detect DUPLADO 37MM (ES08)', () => {
        const xml = `<XML><ITEM ITEM_BASE="ES08" ID="DUPLADO1" REFERENCIA="R1" DESENHO="D1" /></XML>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.erros).toContainEqual({ descricao: 'ITEM DUPLADO 37MM' });
        expect(payload.tags).toContain('duplado37mm');
        expect(payload.meta.es08Matches).toHaveLength(1);
        expect(payload.meta.es08Matches[0].id).toBe('DUPLADO1');
    });

    it('should detect special ES0X items (excluding ES08)', () => {
        const xml = `<XML><ITEM ITEM_BASE="ES02" DESCRICAO="Painel" LARGURA="100" ALTURA="200" PROFUNDIDADE="18" /></XML>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.meta.specialItems).toHaveLength(1);
        expect(payload.meta.specialItems[0].itemBase).toBe('ES02');
        expect(payload.meta.specialItems[0].dimensao).toBe('100x200x18');
    });

    it('should detect MUXARABI items', () => {
        const xml = `<XML><ITEM ITEM_BASE="MX008001" DESCRICAO="Porta Muxarabi" /></XML>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.tags).toContain('muxarabi');
        expect(payload.warnings).toContain('MUXARABI');
        expect(payload.erros).toContainEqual({ descricao: 'PEÇA MUXARABI' });
        expect(payload.meta.muxarabiItems).toHaveLength(1);
        expect(payload.meta.muxarabiItems[0].itemBase).toBe('MX008001');
    });

    it('should detect MODULO CURVO', () => {
        const xml = `<XML><ITEM REFERENCIA="LR0001" /></XML>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.tags).toContain('curvo');
        expect(payload.warnings).toContain('MÓD.CURVO  NO PED');
    });

    it('should detect missing machines for non-ferragens files', () => {
        // REQUIRED_PLUGINS = ["2530", "2534"]
        // Only one of them present (Aspan): should fail
        const xmlOnlyOne = `<XML><ITEM BUILDER="S" /><MAQUINA ID_PLUGIN="2530" NOME_PLUGIN="Aspan" /></XML>`;
        const resOnlyOne = validateXmlContent(xmlOnlyOne);
        expect(resOnlyOne.payload.erros).toContainEqual({ descricao: 'PROBLEMA NA GERAÇÃO DE MÁQUINAS' });

        // None of them present: should fail
        const xmlNone = `<XML><ITEM BUILDER="S" /></XML>`;
        const resNone = validateXmlContent(xmlNone);
        expect(resNone.payload.erros).toContainEqual({ descricao: 'PROBLEMA NA GERAÇÃO DE MÁQUINAS' });

        // Both present: should pass
        const xmlBoth = `<XML><ITEM BUILDER="S" /><MAQUINA ID_PLUGIN="2530" NOME_PLUGIN="Aspan" /><MAQUINA ID_PLUGIN="2534" NOME_PLUGIN="NCB612" /></XML>`;
        const resBoth = validateXmlContent(xmlBoth);
        expect(resBoth.payload.erros).not.toContainEqual({ descricao: 'PROBLEMA NA GERAÇÃO DE MÁQUINAS' });
    });

    it('should NOT detect missing machines if it is ferragensOnly', () => {
        const xml = `<XML><ITEM BUILDER="N" /></XML>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.erros).not.toContainEqual({ descricao: 'PROBLEMA NA GERAÇÃO DE MÁQUINAS' });
    });

    it('should detect SEM ITEM FILHO when PRECO_TOTAL="0.01" and it has no children', () => {
        const xml = `
        <PEDIDO>
            <ITENS>
                <ITEM ID="PAI_VAZIO" REFERENCIA="LN4002" PRECO_TOTAL="0.01">
                    <MAQUINAS />
                </ITEM>
            </ITENS>
        </PEDIDO>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.erros).toContainEqual({ descricao: 'Sem Item Filho' });
        expect(payload.tags).toContain('sem_filho');
        expect(payload.meta.semFilhoItems).toContainEqual({ id: 'PAI_VAZIO', referencia: 'LN4002' });
    });

    it('should NOT detect SEM ITEM FILHO if PRECO_TOTAL is NOT "0.01", even if empty', () => {
        const xml = `
        <PEDIDO>
            <ITENS>
                <ITEM ID="PAI_VAZIO" REFERENCIA="LN4002" PRECO_TOTAL="100.00">
                    <ITEMS></ITEMS>
                </ITEM>
            </ITENS>
        </PEDIDO>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.erros).not.toContainEqual({ descricao: 'Sem Item Filho' });
    });

    it('should NOT detect SEM ITEM FILHO if it has children, even if PRECO_TOTAL="0.01"', () => {
        const xml = `
        <PEDIDO>
            <ITENS>
                <ITEM ID="PAI_OK" REFERENCIA="LN4002" PRECO_TOTAL="0.01">
                    <ITEMS>
                        <ITEM ID="FILHO1" REFERENCIA="F01" />
                    </ITEMS>
                </ITEM>
            </ITENS>
        </PEDIDO>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.erros).not.toContainEqual({ descricao: 'Sem Item Filho' });
    });

});
