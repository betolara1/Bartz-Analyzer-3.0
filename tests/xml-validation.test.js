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

    it('should detect missing machines for non-ferragens files as tags/warnings', () => {
        // REQUIRED_PLUGINS = ["2530", "2534"]
        // Only one of them present (Aspan): should flag as warning
        const xmlOnlyOne = `<XML><ITEM BUILDER="S" /><MAQUINA ID_PLUGIN="2530" NOME_PLUGIN="Aspan" /></XML>`;
        const resOnlyOne = validateXmlContent(xmlOnlyOne);
        expect(resOnlyOne.payload.erros).not.toContainEqual({ descricao: 'PROBLEMA NA GERAÇÃO DE MÁQUINAS' });
        expect(resOnlyOne.payload.tags).toContain('PROBLEMA NA GERAÇÃO DE MÁQUINAS');
        expect(resOnlyOne.payload.warnings).toContain('PROBLEMA NA GERAÇÃO DE MÁQUINAS');

        // None of them present: should flag as warning
        const xmlNone = `<XML><ITEM BUILDER="S" /></XML>`;
        const resNone = validateXmlContent(xmlNone);
        expect(resNone.payload.erros).not.toContainEqual({ descricao: 'PROBLEMA NA GERAÇÃO DE MÁQUINAS' });
        expect(resNone.payload.tags).toContain('PROBLEMA NA GERAÇÃO DE MÁQUINAS');

        // Both present: should pass without warning
        const xmlBoth = `<XML><ITEM BUILDER="S" /><MAQUINA ID_PLUGIN="2530" NOME_PLUGIN="Aspan" /><MAQUINA ID_PLUGIN="2534" NOME_PLUGIN="NCB612" /></XML>`;
        const resBoth = validateXmlContent(xmlBoth);
        expect(resBoth.payload.tags).not.toContain('PROBLEMA NA GERAÇÃO DE MÁQUINAS');
    });

    it('should NOT detect missing machines if it is ferragensOnly', () => {
        const xml = `<XML><ITEM BUILDER="N" /></XML>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.tags).not.toContain('PROBLEMA NA GERAÇÃO DE MÁQUINAS');
        expect(payload.warnings).not.toContain('PROBLEMA NA GERAÇÃO DE MÁQUINAS');
    });

    it('should detect SEM ITEM FILHO when top-level ITEM has no UNIQUE_ID', () => {
        const xml = `
        <PEDIDO>
            <ITENS>
                <ITEM ID="PAI_VAZIO" REFERENCIA="LN4002">
                    <CONFIGURADO>
                        <CARACTERISTICA CODIGO="FILETYPE" RESPOSTA="10" />
                    </CONFIGURADO>
                    <ESTRUTURA />
                    <SORTIDO />
                </ITEM>
            </ITENS>
        </PEDIDO>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.erros).toContainEqual({ descricao: 'Sem Item Filho' });
        expect(payload.tags).toContain('sem_filho');
        expect(payload.meta.semFilhoItems).toContainEqual({ id: 'PAI_VAZIO', referencia: 'LN4002', rawBlock: expect.any(String) });
    });

    it('should REMOVE "Sem Item Filho" blocks when auto-fix is enabled', () => {
        const xml = `
        <PEDIDO>
            <ITENS>
                <ITEM ID="PAI_VAZIO" REFERENCIA="LN4002">
                    <CONFIGURADO>
                        <CARACTERISTICA CODIGO="FILETYPE" RESPOSTA="10" />
                    </CONFIGURADO>
                    <ESTRUTURA />
                    <SORTIDO />
                </ITEM>
                <ITEM ID="PAI_OK" REFERENCIA="LN4003">
                    <CONFIGURADO>
                        <UNIQUE_ID CODIGO="123" />
                    </CONFIGURADO>
                </ITEM>
            </ITENS>
        </PEDIDO>`;
        const { payload, updatedTxt } = validateXmlContent(xml, { enableAutoFix: true });
        
        // Verifica se o erro foi removido do payload e adicionado em autoFixes
        expect(payload.erros).not.toContainEqual({ descricao: 'Sem Item Filho' });
        expect(payload.tags).toContain('sem_filho'); // A tag agora é mantida mesmo após a correção
        expect(payload.autoFixes).toContainEqual(expect.stringContaining('Removido 1 item(ns) vazio(s) sem filho'));

        // Verifica se o texto atualizado não tem mais o item vazio, mas manteve o OK
        expect(updatedTxt).not.toContain('PAI_VAZIO');
        expect(updatedTxt).toContain('PAI_OK');
    });

    it('should NOT detect SEM ITEM FILHO when top-level ITEM has UNIQUE_ID', () => {
        const xml = `
        <PEDIDO>
            <ITENS>
                <ITEM ID="PAI_OK" REFERENCIA="LN4002">
                    <CONFIGURADO>
                        <UNIQUE_ID CODIGO="abc123" AMBIENTGUID="def456" />
                        <CARACTERISTICA CODIGO="FILETYPE" RESPOSTA="10" />
                    </CONFIGURADO>
                    <ITEMS>
                        <ITEM ID="FILHO1" REFERENCIA="F01" />
                    </ITEMS>
                    <ESTRUTURA />
                    <SORTIDO />
                </ITEM>
            </ITENS>
        </PEDIDO>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.erros).not.toContainEqual({ descricao: 'Sem Item Filho' });
    });

    it('should detect SEM ITEM FILHO for item without UNIQUE_ID inside ITENS_PEDIDO', () => {
        const xml = `
        <ITENS_PEDIDO>
            <ITEM ID="item_com_uid" REFERENCIA="10.15.0245">
                <CONFIGURADO>
                    <UNIQUE_ID CODIGO="blr2a594" AMBIENTGUID="ccb5aa38" />
                    <CARACTERISTICA CODIGO="FILETYPE" RESPOSTA="10" />
                </CONFIGURADO>
                <ITEMS>
                    <ITEM ID="child1" REFERENCIA="CHILD_REF" />
                </ITEMS>
                <ESTRUTURA />
            </ITEM>
            <ITEM ID="item_sem_uid" REFERENCIA="10.15.0266">
                <CONFIGURADO>
                    <CARACTERISTICA CODIGO="FILETYPE" RESPOSTA="10" />
                </CONFIGURADO>
                <ESTRUTURA />
                <SORTIDO />
            </ITEM>
        </ITENS_PEDIDO>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.erros).toContainEqual({ descricao: 'Sem Item Filho' });
        expect(payload.tags).toContain('sem_filho');
        expect(payload.meta.semFilhoItems).toHaveLength(1);
        expect(payload.meta.semFilhoItems[0].id).toBe('item_sem_uid');
    });

    it('should NOT flag a child ITEM nested inside a parent as "Sem Item Filho"', () => {
        // Item filho (CORTE_INT) está dentro do bloco pai que tem UNIQUE_ID
        // O filho não tem UNIQUE_ID, mas não deve ser verificado pois não é top-level
        const xml = `
        <PEDIDO>
            <ITENS>
                <ITEM ID="embalagem_peca_600" REFERENCIA="EMBALAGEM">
                    <CONFIGURADO>
                        <UNIQUE_ID CODIGO="abc123" AMBIENTGUID="def456" />
                    </CONFIGURADO>
                    <ITEMS>
                        <ITEM ID="raiz_estr_Modulo_geometrias_Corte_retangulo_angulo_" REFERENCIA="CORTE_INT">
                            <MAQUINAS />
                        </ITEM>
                    </ITEMS>
                </ITEM>
            </ITENS>
        </PEDIDO>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.erros).not.toContainEqual({ descricao: 'Sem Item Filho' });
        expect(payload.tags).not.toContain('sem_filho');
    });
 
    it('should detect POXXXX and POXXXXAA items correctly', () => {
        const xml = `
        <PEDIDO>
            <ITENS>
                <ITEM ID="PAI_PO" REFERENCIA="PO320600" ITEM_BASE="PO320600" DESCRICAO="Porta Pai" LARGURA="600" ALTURA="2000" PROFUNDIDADE="18" />
                <ITEM ID="FILHO_PO" REFERENCIA="PO320600AA" ITEM_BASE="PO320600AA" DESCRICAO="Puxador Filho" LARGURA="50" ALTURA="50" PROFUNDIDADE="20" />
            </ITENS>
        </PEDIDO>`;
        const { payload } = validateXmlContent(xml);
        expect(payload.meta.poItems).toHaveLength(2);
        expect(payload.meta.poItems[0].itemBase).toBe('PO320600');
        expect(payload.meta.poItems[0].dimensao).toBe('600x2000x18');
        expect(payload.meta.poItems[1].itemBase).toBe('PO320600AA');
        expect(payload.meta.poItems[1].dimensao).toBe('50x50x20');
    });

});
