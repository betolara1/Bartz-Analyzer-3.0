import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Row } from "../types";

export function useFileActions(
  data: Row | null,
  open: boolean,
  onAction?: (path: string, action: string) => void,
  onFileMoved?: (oldPath: string, newPath: string) => void
) {
  // Accordion States
  const [pendingRefOpen, setPendingRefOpen] = useState(false);
  const [erpSearchOpen, setErpSearchOpen] = useState(false);
  const [coringaOpen, setCoringaOpen] = useState(false);
  const [orderInfoOpen, setOrderInfoOpen] = useState(false);
  const [specialItemsOpen, setSpecialItemsOpen] = useState(false);
  const [muxarabiOpen, setMuxarabiOpen] = useState(false);
  const [es08Open, setEs08Open] = useState(false);
  const [semFilhoOpen, setSemFilhoOpen] = useState(false);

  // ERP Search
  const [erpSearchCode, setErpSearchCode] = useState('');
  const [erpSearchDesc, setErpSearchDesc] = useState('');
  const [erpSearchType, setErpSearchType] = useState('');
  const [erpSearching, setErpSearching] = useState(false);
  const [erpSearchResults, setErpSearchResults] = useState<any[]>([]);

  // Pending Reference
  const [selectedRefSingle, setSelectedRefSingle] = useState<string | null>(null);
  const [refFillValue, setRefFillValue] = useState('');
  const [confirmRefOpen, setConfirmRefOpen] = useState(false);

  // Confirmation Modals
  const [confirmCoringaOpen, setConfirmCoringaOpen] = useState(false);
  const [confirmCgOpen, setConfirmCgOpen] = useState(false);
  const [confirmMoveOpen, setConfirmMoveOpen] = useState(false);
  const [confirmMoveEmptyOpen, setConfirmMoveEmptyOpen] = useState(false);
  const [confirmMoveOkOpen, setConfirmMoveOkOpen] = useState(false);
  const [isReplacing, setIsReplacing] = useState(false);

  // Multi-problem resolution tracking
  const [resolvedProblems, setResolvedProblems] = useState<Set<string>>(new Set());
  const [lastReplace, setLastReplace] = useState<any>(null);

  // DXF / ES08
  const [dxfResults, setDxfResults] = useState<Record<string, any>>({});
  const [dxfSearching, setDxfSearching] = useState(false);
  const [dxfFixing, setDxfFixing] = useState<Record<string, boolean>>({});

  // Order Info
  const [orderComments, setOrderComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  // Coringa Logic
  const [coringaFrom, setCoringaFrom] = useState<string | null>(null);
  const [coringaTo, setCoringaTo] = useState("");
  const [indCoringaAcronym, setIndCoringaAcronym] = useState("");
  const [indCoringaSearching, setIndCoringaSearching] = useState(false);
  const [indCoringaOptions, setIndCoringaOptions] = useState<any[]>([]);

  const [coringa1Acronym, setCoringa1Acronym] = useState("");
  const [coringa1Searching, setCoringa1Searching] = useState(false);
  const [coringa1Options, setCoringa1Options] = useState<any[]>([]);
  const [coringa1Selected, setCoringa1Selected] = useState("");
  const [coringa1Done, setCoringa1Done] = useState(false);

  const [coringa2Acronym, setCoringa2Acronym] = useState("");
  const [coringa2Searching, setCoringa2Searching] = useState(false);
  const [coringa2Options, setCoringa2Options] = useState<any[]>([]);
  const [coringa2Selected, setCoringa2Selected] = useState("");
  const [coringa2Done, setCoringa2Done] = useState(false);

  const [cg1Acronym, setCg1Acronym] = useState("");
  const [cg1Searching, setCg1Searching] = useState(false);
  const [cg1Options, setCg1Options] = useState<any[]>([]);
  const [cg1Replace, setCg1Replace] = useState("");
  const [cg1Done, setCg1Done] = useState(false);

  const [cg2Acronym, setCg2Acronym] = useState("");
  const [cg2Searching, setCg2Searching] = useState(false);
  const [cg2Options, setCg2Options] = useState<any[]>([]);
  const [cg2Replace, setCg2Replace] = useState("");
  const [cg2Done, setCg2Done] = useState(false);

  // Memoized derived data
  const uniqueDrawings = useMemo(() => {
    const list = (data?.meta?.es08Matches || []) as any[];
    const set = new Set(list.map(m => m.desenho).filter(Boolean));
    return Array.from(set) as string[];
  }, [data]);

  // Compute active problems for the current file
  const activeProblems = useMemo(() => {
    const problems: string[] = [];
    if (data?.tags?.includes('sem_filho')) problems.push('sem_filho');
    if ((data?.meta?.es08Matches || []).length > 0) problems.push('es08');
    if (data?.tags?.includes('coringa')) problems.push('coringa');
    if (data?.tags?.includes('sem_codigo') || (data?.meta?.referenciaEmpty || []).length > 0) problems.push('sem_codigo');

    // Check if there are other errors in data.errors (e.g., machine generation)
    const knownErrorDescriptions = ["ITEM SEM CÓDIGO", "ITEM DUPLADO 37MM", "CADASTRO DE COR CORINGA", "PENDENTE: TROCA DE SIGLAS (LOTE)", "Sem Item Filho"];
    const otherErrors = (data?.errors || []).filter(e => !knownErrorDescriptions.includes(e));
    if (otherErrors.length > 0) {
      problems.push('other_errors');
    }

    return problems;
  }, [data]);

  const unresolvedProblems = useMemo(() => {
    return activeProblems.filter(p => !resolvedProblems.has(p));
  }, [activeProblems, resolvedProblems]);

  const filteredCoringaMatches = useMemo(() => {
    const rawMatches = (data?.meta?.coringaMatches || []) as string[];
    if (!erpSearchType) return rawMatches;

    const map: Record<string, string> = {
      'CHAPAS': 'CHAPA_',
      'FITAS': 'FITA_',
      'TAPAFURO': 'TAPAFURO_',
      'CAPA': 'CAPA_',
      'PAINEL': 'PAINEL_'
    };

    const prefix = map[erpSearchType];
    if (!prefix) return rawMatches;

    return rawMatches.filter(m => m.toUpperCase().startsWith(prefix));
  }, [data, erpSearchType]);

  // Effects
  useEffect(() => {
    const currentStillExists = filteredCoringaMatches.includes(coringaFrom || '');
    if (filteredCoringaMatches.length > 0 && (!coringaFrom || !currentStillExists)) {
      setCoringaFrom(filteredCoringaMatches[0]);
    }
  }, [filteredCoringaMatches, coringaFrom]);

  const lastFilenameRef = useRef<string | null>(null);
  const lastOpenRef = useRef<boolean>(false);

  useEffect(() => {
    const fileChanged = data?.filename !== lastFilenameRef.current;
    const justOpened = open && !lastOpenRef.current;

    if (fileChanged || justOpened) {
      // Reset accordion states when switching files or reopening drawer
      setPendingRefOpen(false);
      setErpSearchOpen(false);
      setCoringaOpen(false);
      setOrderInfoOpen(false);
      setSpecialItemsOpen(false);
      setMuxarabiOpen(false);
      setEs08Open(false);
      setSemFilhoOpen(false);

      // Reset search fields and results
      setErpSearchCode('');
      setErpSearchDesc('');
      setErpSearchType('');
      setErpSearchResults([]);
      setSelectedRefSingle(null);
      setRefFillValue('');

      // Reset resolved problems
      setResolvedProblems(new Set());

      // Reset Coringa States
      setCoringaFrom(null);
      setCoringaTo("");
      setIndCoringaAcronym("");
      setIndCoringaOptions([]);
      setCoringa1Acronym("");
      setCoringa1Options([]);
      setCoringa1Selected("");
      setCoringa1Done(false);
      setCoringa2Acronym("");
      setCoringa2Options([]);
      setCoringa2Selected("");
      setCoringa2Done(false);
      setCg1Acronym("");
      setCg1Options([]);
      setCg1Replace("");
      setCg1Done(false);
      setCg2Acronym("");
      setCg2Options([]);
      setCg2Replace("");
      setCg2Done(false);

      // Reset DXF search results for the new file context
      setDxfResults({});
    }

    if (!data) {
      setDxfResults({});
      setOrderComments([]);
      setLastReplace(null);
      setCoringa1Done(false);
      setCoringa2Done(false);
      setCg1Done(false);
      setCg2Done(false);
    } else {
      // Clear lastReplace when data refreshes to unlock UI for next action
      setLastReplace(null);
    }

    lastFilenameRef.current = data?.filename || null;
    lastOpenRef.current = open;
  }, [data, open]);

  // Actions
  const handleErpSearch = useCallback(async () => {
    setErpSearching(true);
    setErpSearchResults([]);
    try {
      const res = await (window as any).electron?.analyzer?.searchErpProduct?.({
        code: erpSearchCode,
        desc: erpSearchDesc,
        type: erpSearchType
      });
      const results = res?.results || [];
      setErpSearchResults(results);
      if (!results.length) toast.info("Nenhum produto encontrado.");
    } catch (e: any) {
      toast.error(`Erro na busca: ${e.message}`);
    } finally {
      setErpSearching(false);
    }
  }, [erpSearchCode, erpSearchDesc, erpSearchType]);

  const handleCoringaSearch = useCallback(async (acronym: string, group: number) => {
    if (!acronym) return;
    const setSearching = [null, setCoringa1Searching, setCoringa2Searching, setIndCoringaSearching, setCg1Searching, setCg2Searching][group];
    const setOptions = [null, setCoringa1Options, setCoringa2Options, setIndCoringaOptions, setCg1Options, setCg2Options][group];

    if (setSearching) setSearching(true);
    try {
      const res = await (window as any).electron?.analyzer?.searchErpProduct?.({ desc: acronym, type: 'CORINGA' });
      const results = res?.results || [];
      if (setOptions) setOptions(results);
      if (!results.length) toast.info("Nenhuma cor encontrada.");
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      if (setSearching) setSearching(false);
    }
  }, []);

  const searchAllDrawings = useCallback(async () => {
    if (!uniqueDrawings.length) return;
    setDxfSearching(true);
    for (const drawing of uniqueDrawings) {
      setDxfResults(prev => ({ ...prev, [drawing]: { status: 'searching' } }));
      try {
        const result = await (window as any).electron?.analyzer?.findDrawingFile?.(drawing, data?.fullpath);
        if (result?.found && result?.path) {
          setDxfResults(prev => ({
            ...prev,
            [drawing]: {
              status: 'found',
              data: {
                path: result.path,
                name: result.name || drawing,
                panelInfo: result.panelInfo,
                fresaInfo: result.fresaInfo
              }
            }
          }));
        } else {
          setDxfResults(prev => ({
            ...prev,
            [drawing]: { status: 'not_found', message: 'Desenho não localizado na pasta configurada.' }
          }));
        }
      } catch (e: any) {
        setDxfResults(prev => ({ ...prev, [drawing]: { status: 'error', message: e.message } }));
      }
    }
    setDxfSearching(false);
  }, [uniqueDrawings, data?.fullpath]);

  const fixFresa37to18 = useCallback(async (drawing: string) => {
    const dxfInfo = dxfResults[drawing];
    if (!data || !dxfInfo?.data?.path) return;

    setDxfFixing(prev => ({ ...prev, [drawing]: true }));
    const id = toast.loading(`Corrigindo ${drawing}...`);
    try {
      const res = await (window as any).electron?.analyzer?.fixFresa37to18?.(dxfInfo.data.path);
      if (res?.ok) {
        toast.success(`${drawing} corrigido com sucesso!`);
        if (onAction) onAction(data.fullpath, `[Automático] DXF: corrigido 37mm para 18mm no arquivo ${drawing}`);
        // Refresh info
        const result = await (window as any).electron?.analyzer?.findDrawingFile?.(drawing, data.fullpath);
        if (result?.found && result?.path) {
          setDxfResults(prev => ({
            ...prev,
            [drawing]: {
              status: 'found',
              data: {
                path: result.path,
                name: result.name || drawing,
                panelInfo: result.panelInfo,
                fresaInfo: result.fresaInfo
              }
            }
          }));
        }
      } else {
        toast.error(`Falha ao corrigir ${drawing}: ${res?.message}`);
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      toast.dismiss(id);
      setDxfFixing(prev => ({ ...prev, [drawing]: false }));
    }
  }, [data, dxfResults, onAction]);

  const fetchOrderComments = useCallback(async () => {
    if (!data || !data.filename) return;
    const match = data.filename.match(/^(\d{5})/);
    if (!match || !match[1]) {
      toast.info("Não foi possível identificar o número do pedido no nome do arquivo.");
      return;
    }
    const num = match[1];

    setLoadingComments(true);
    try {
      const res = await (window as any).electron?.analyzer?.getOrderComments?.(num);
      if (res?.ok) {
        setOrderComments(res.data || []);
      } else {
        setOrderComments([]);
        toast.error(`Falha: ${res?.message || 'Erro ao buscar'}`);
      }
    } catch (e: any) {
      toast.error("Erro ao buscar comentários.");
    } finally {
      setLoadingComments(false);
    }
  }, [data]);

  useEffect(() => {
    if (data?.filename) {
      fetchOrderComments();
    }
  }, [data?.filename, fetchOrderComments]);
  const onApplyCoringa = useCallback(async () => {
    if (!data || !coringaFrom) return;
    setConfirmCoringaOpen(false);
    setIsReplacing(true);
    const id = toast.loading('Substituindo cor...');
    try {
      const opt = indCoringaOptions.find(o => o.code === coringaTo);
      const replacementValue = opt?.description || coringaTo;
      const res = await (window as any).electron?.analyzer?.replaceCoringa?.(data.fullpath, coringaFrom, replacementValue);
      if (res?.ok) {
        toast.success(`Substituídos ${res.replaced || 0} ocorrência(s)`);
        if (onAction) onAction(data.fullpath, `[Manual] Coringa: substituído "${coringaFrom}" por "${replacementValue}" (${coringaTo})`);
        setLastReplace({ backupPath: res.backupPath, from: coringaFrom, to: coringaTo, replaced: res.replaced });
        setCoringaTo("");
        setIndCoringaAcronym("");
        setIndCoringaOptions([]);
      } else {
        toast.error(`Falha: ${res?.message || 'nenhuma ocorrência encontrada'}`);
      }
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      setIsReplacing(false);
      toast.dismiss(id);
    }
  }, [data, coringaFrom, coringaTo, indCoringaOptions, onAction]);

  const onApplyCoringa1 = useCallback(async () => {
    if (!data || !coringa1Selected) return;
    const id = toast.loading('Aplicando CORINGA1...');
    try {
      const opt = coringa1Options.find(o => o.code === coringa1Selected);
      const res = await (window as any).electron?.analyzer?.replaceCgGroups?.(data.fullpath, { 'CORINGA1': opt?.description || coringa1Selected });
      if (res?.ok) {
        toast.success('CORINGA1 substituído com sucesso.');
        if (onAction) onAction(data.fullpath, `[Manual] Coringa: substituído CORINGA1 por "${opt?.description}" (${coringa1Selected})`);
        setCoringa1Done(true);
        await (window as any).electron?.analyzer?.reprocessOne?.(data.fullpath);
      }
    } catch (e: any) { toast.error(String(e?.message || e)); }
    finally { toast.dismiss(id); }
  }, [data, coringa1Selected, coringa1Options, onAction]);

  const onApplyCoringa2 = useCallback(async () => {
    if (!data || !coringa2Selected) return;
    const id = toast.loading('Aplicando CORINGA2...');
    try {
      const opt = coringa2Options.find(o => o.code === coringa2Selected);
      const res = await (window as any).electron?.analyzer?.replaceCgGroups?.(data.fullpath, { 'CORINGA2': opt?.description || coringa2Selected });
      if (res?.ok) {
        toast.success('CORINGA2 substituído com sucesso.');
        if (onAction) onAction(data.fullpath, `[Manual] Coringa: substituído CORINGA2 por "${opt?.description}" (${coringa2Selected})`);
        setCoringa2Done(true);
        await (window as any).electron?.analyzer?.reprocessOne?.(data.fullpath);
      }
    } catch (e: any) { toast.error(String(e?.message || e)); }
    finally { toast.dismiss(id); }
  }, [data, coringa2Selected, coringa2Options, onAction]);

  const onApplyCg1 = useCallback(async () => {
    if (!data || !cg1Replace) return;
    const id = toast.loading('Trocando CG1...');
    try {
      const res = await (window as any).electron?.analyzer?.replaceCgGroups?.(data.fullpath, { 'CG1': cg1Replace.trim() });
      if (res?.ok) {
        toast.success('CG1 trocado com sucesso.');
        if (onAction) onAction(data.fullpath, `[Manual] Coringa Grupo: trocada sigla CG1 para "${cg1Replace}"`);
        setCg1Done(true);
        await (window as any).electron?.analyzer?.reprocessOne?.(data.fullpath);
      }
    } catch (e: any) { toast.error(String(e?.message || e)); }
    finally { toast.dismiss(id); }
  }, [data, cg1Replace, onAction]);

  const onApplyCg2 = useCallback(async () => {
    if (!data || !cg2Replace) return;
    const id = toast.loading('Trocando CG2...');
    try {
      const res = await (window as any).electron?.analyzer?.replaceCgGroups?.(data.fullpath, { 'CG2': cg2Replace.trim() });
      if (res?.ok) {
        toast.success('CG2 trocado com sucesso.');
        if (onAction) onAction(data.fullpath, `[Manual] Coringa Grupo: trocada sigla CG2 para "${cg2Replace}"`);
        setCg2Done(true);
        await (window as any).electron?.analyzer?.reprocessOne?.(data.fullpath);
      }
    } catch (e: any) { toast.error(String(e?.message || e)); }
    finally { toast.dismiss(id); }
  }, [data, cg2Replace, onAction]);

  const onApplyCgBatch = useCallback(async () => {
    if (!data) return;
    setConfirmCgOpen(false);
    const map: any = {};
    if (cg1Replace) map['CG1'] = cg1Replace;
    if (cg2Replace) map['CG2'] = cg2Replace;
    const id = toast.loading('Aplicando trocas CG1/CG2...');
    try {
      const res = await (window as any).electron?.analyzer?.replaceCgGroups?.(data.fullpath, map);
      if (res?.ok) {
        const total = Object.values(res.counts || {}).reduce((s: any, n: any) => s + (n || 0), 0);
        toast.success(`Substituições aplicadas (total: ${total})`);
        setLastReplace({ backupPath: res.backupPath, map: map, counts: res.counts });
      } else {
        toast.error(`Falha: ${res?.message || 'nenhuma ocorrência encontrada'}`);
      }
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      toast.dismiss(id);
    }
  }, [data, cg1Replace, cg2Replace]);

  const onApplyRef = useCallback(async () => {
    if (!data || !selectedRefSingle) return;
    setConfirmRefOpen(false);
    const id = toast.loading('Trocando REFERENCIA...');
    try {
      const [selId, ...selDescParts] = (selectedRefSingle || '').split('|');
      const selDesc = selDescParts.join('|');
      const replacements = [{ id: selId, descricao: selDesc, value: refFillValue }];
      const res = await (window as any).electron?.analyzer?.fillReferenciaByIds?.(data.fullpath, replacements);
      if (res?.ok) {
        const total = Object.values(res.counts || {}).reduce((s: any, n: any) => s + (n || 0), 0);
        toast.success(`Preenchidas ${total} ocorrência(s)`);
        if (onAction) onAction(data.fullpath, `[Manual] Referência: preenchido ID "${selectedRefSingle}" com valor "${refFillValue}"`);
        setLastReplace({ backupPath: res.backupPath, type: 'fill-referencia-ids', replacements, counts: res.counts });
        setRefFillValue('');
        setSelectedRefSingle(null);
      } else {
        toast.error(`Falha: ${res?.message || 'nenhuma ocorrência encontrada'}`);
      }
    } catch (e: any) {
      toast.error(String(e?.message || e));
    } finally {
      toast.dismiss(id);
    }
  }, [data, selectedRefSingle, refFillValue, onAction]);

  const handleMoveToOk = useCallback(async () => {
    if (!data) return;
    const id = toast.loading("Movendo para OK...");
    try {
      const res = await (window as any).electron?.analyzer?.moveToOk?.(data.fullpath);
      if (res?.ok) {
        toast.success("Arquivo movido para OK!");
        if (onAction) onAction(data.fullpath, "[Manual] Movido para pasta OK");
        if (onFileMoved && res.destPath) {
          onFileMoved(data.fullpath, res.destPath);
        }
      } else {
        toast.error(`Falha: ${res?.message}`);
      }
    } catch (e: any) {
      toast.error(String(e));
    } finally {
      toast.dismiss(id);
    }
  }, [data, onAction, onFileMoved]);

  // Ref to hold latest unresolvedProblems for use inside resolveAndMaybeMove
  const unresolvedRef = useRef(unresolvedProblems);
  unresolvedRef.current = unresolvedProblems;

  const resolveAndMaybeMove = useCallback(async (problemKey: string) => {
    setResolvedProblems(prev => {
      const next = new Set(prev);
      next.add(problemKey);
      return next;
    });

    // After adding this key, check how many remain
    const remainingAfter = unresolvedRef.current.filter(p => p !== problemKey);

    if (remainingAfter.length > 0) {
      toast.success(
        `Problema resolvido! Ainda resta(m) ${remainingAfter.length} problema(s) pendente(s).`,
        { icon: '✅' }
      );
    }
  }, []);

  // Automatically move to OK if all active problems are resolved and the file is still in the error folder
  useEffect(() => {
    if (open && data && activeProblems.length > 0 && unresolvedProblems.length === 0) {
      const isInErroFolder = data.fullpath.toLowerCase().includes('\\erro\\') || data.fullpath.toLowerCase().includes('/erro/');
      if (isInErroFolder) {
        handleMoveToOk();
      }
    }
  }, [unresolvedProblems, open, data, activeProblems.length, handleMoveToOk]);

  const handleReprocess = useCallback(async () => {
    if (!data) return;
    const id = toast.loading("Reprocessando...");
    try {
      await (window as any).electron?.analyzer?.reprocessOne?.(data.fullpath);
      toast.success("Arquivo reprocessado.");
    } catch (e: any) {
      toast.error("Erro ao reprocessar.");
    } finally {
      toast.dismiss(id);
    }
  }, [data]);

  const handleOpenFolder = useCallback(async () => {
    if (!data) return;
    await (window as any).electron?.analyzer?.openInFolder?.(data.fullpath);
  }, [data]);

  return {
    // States
    pendingRefOpen, setPendingRefOpen,
    erpSearchOpen, setErpSearchOpen,
    coringaOpen, setCoringaOpen,
    orderInfoOpen, setOrderInfoOpen,
    specialItemsOpen, setSpecialItemsOpen,
    muxarabiOpen, setMuxarabiOpen,
    es08Open, setEs08Open,
    erpSearchCode, setErpSearchCode,
    erpSearchDesc, setErpSearchDesc,
    erpSearchType, setErpSearchType,
    erpSearching,
    erpSearchResults,
    selectedRefSingle, setSelectedRefSingle,
    refFillValue, setRefFillValue,
    confirmRefOpen, setConfirmRefOpen,
    confirmCoringaOpen, setConfirmCoringaOpen,
    confirmCgOpen, setConfirmCgOpen,
    confirmMoveOpen, setConfirmMoveOpen,
    isReplacing, setIsReplacing,
    lastReplace, setLastReplace,
    dxfResults,
    dxfSearching,
    dxfFixing,
    orderComments,
    loadingComments,
    coringaFrom, setCoringaFrom,
    coringaTo, setCoringaTo,
    indCoringaAcronym, setIndCoringaAcronym,
    indCoringaSearching,
    indCoringaOptions,
    coringa1Acronym, setCoringa1Acronym,
    coringa1Searching,
    coringa1Options,
    coringa1Selected, setCoringa1Selected,
    coringa1Done, setCoringa1Done,
    coringa2Acronym, setCoringa2Acronym,
    coringa2Searching,
    coringa2Options,
    coringa2Selected, setCoringa2Selected,
    coringa2Done, setCoringa2Done,
    cg1Acronym, setCg1Acronym,
    cg1Searching,
    cg1Options,
    cg1Replace, setCg1Replace,
    cg1Done, setCg1Done,
    cg2Acronym, setCg2Acronym,
    cg2Searching,
    cg2Options,
    cg2Replace, setCg2Replace,
    cg2Done, setCg2Done,
    semFilhoOpen, setSemFilhoOpen,
    confirmMoveEmptyOpen, setConfirmMoveEmptyOpen,
    confirmMoveOkOpen, setConfirmMoveOkOpen,

    // Multi-problem resolution
    resolvedProblems,
    activeProblems,
    unresolvedProblems,
    resolveAndMaybeMove,

    // Derived
    uniqueDrawings,
    filteredCoringaMatches,

    // Actions
    handleErpSearch,
    handleCoringaSearch,
    onApplyCoringa,
    onApplyCoringa1,
    onApplyCoringa2,
    onApplyCg1,
    onApplyCg2,
    onApplyCgBatch,
    onApplyRef,
    searchAllDrawings,
    fixFresa37to18,
    fetchOrderComments,
    handleMoveToOk,
    handleReprocess,
    handleOpenFolder
  };
}
