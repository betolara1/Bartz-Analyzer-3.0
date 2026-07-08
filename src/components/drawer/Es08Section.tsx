import React from "react";
import { Zap, ChevronDown, Database, Layers, Search, RefreshCw, FileText, CheckCircle, Info, Check, ChevronRight, AlertTriangle } from "lucide-react";
import { Row } from "../../types";

interface Es08SectionProps {
  isOpen: boolean;
  onToggle: () => void;
  data: Row | null;
  uniqueDrawings: string[];
  dxfSearching: boolean;
  dxfResults: Record<string, any>;
  dxfFixing: Record<string, boolean>;
  onSearchAll: () => void;
  onFix: (drawing: string) => void;
  onMoveToOk: () => void;
  onOpenConfirmMove: () => void;
  onOpenConfirmMoveOk: () => void;
  isResolved: boolean;
  otherPendingCount: number;
  onResolve: () => void;
}

export function Es08Section({
  isOpen, onToggle, data, uniqueDrawings, dxfSearching, dxfResults, dxfFixing,
  onSearchAll, onFix, onMoveToOk, onOpenConfirmMove, onOpenConfirmMoveOk,
  isResolved, otherPendingCount, onResolve
}: Es08SectionProps) {
  const matches = (data?.meta?.es08Matches || []) as any[];
  if (matches.length === 0) return null;

  const allOk = uniqueDrawings.length > 0 && uniqueDrawings.every(d => {
    const info = dxfResults[d]?.data;
    if (!info) return false;
    const isPanel18 = Math.abs(parseFloat(info.panelInfo?.dimension || '0')) === 18;
    const noFresa37 = (info.fresaInfo?.count37 || 0) === 0;
    const noUsinagem37 = (info.fresaInfo?.usinagemCount37 || 0) === 0;
    return isPanel18 && noFresa37 && noUsinagem37;
  });

  return (
    <section className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/5 overflow-hidden shadow-sm dark:shadow-[0_4px_20px_rgba(244,63,94,0.1)] transition-all duration-300">
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer group"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight leading-none">Itens ES08 - Duplado 37MM</h3>
            <p className="text-[10px] dark:text-rose-300/60 text-muted-foreground font-medium uppercase tracking-widest mt-1">
              {matches.length} componente(s) detectado(s)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isResolved ? (
            <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          ) : (
            <div className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)] animate-pulse" />
          )}
          <div className={`p-2 rounded-full bg-rose-500/5 border border-rose-500/10 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
            <ChevronDown className="h-4 w-4 text-rose-400/50" />
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="p-5 space-y-6 border-t border-rose-500/10">
          <div className="grid grid-cols-1 gap-3">
            {matches.map((item, i) => (
              <div key={i} className="p-4 rounded-xl bg-[#0a0a0a] border border-white/5 group hover:border-rose-500/30 transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div className="text-[9px] uppercase font-bold text-zinc-500 tracking-widest">ID do Item</div>
                  <span className="font-mono text-[10px] text-white bg-white/5 px-2 py-0.5 rounded border border-white/10">{item.id || "—"}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Database className="h-3 w-3 text-zinc-500" />
                    <span className="text-xs text-muted-foreground">Ref:</span>
                    <span className="text-xs text-white/90 font-medium truncate">{item.referencia || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Layers className="h-3 w-3 text-zinc-500" />
                    <span className="text-xs text-muted-foreground">Dese:</span>
                    <span className="text-xs text-white/90 font-medium truncate">{item.desenho || "—"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!isResolved && (
            <div className="pt-5 border-t border-rose-500/20">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <Search className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-tight">Busca de Desenho DXF</h4>
                    <p className="text-[9px] text-muted-foreground font-bold uppercase">{uniqueDrawings.length} arquivos detectados</p>
                  </div>
                </div>
                <button
                  onClick={onSearchAll}
                  disabled={dxfSearching}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 transition-all shadow-lg active:scale-95"
                >
                  {dxfSearching ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-3 w-3 animate-spin" /> Buscando...
                    </span>
                  ) : "Buscar Todos"}
                </button>
              </div>

              <div className="space-y-4">
                {uniqueDrawings.map((drawing) => {
                  const result = dxfResults[drawing];
                  const isFixing = dxfFixing[drawing];
                  const dxfData = result?.data;

                  return (
                    <div key={drawing} className="rounded-xl border border-[#232323] bg-[#111] overflow-hidden shadow-inner group/dxf">
                      <div className="px-4 py-2.5 bg-[#1B1B1B] border-b border-[#232323] flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-3.5 w-3.5 text-zinc-500 group-hover/dxf:text-rose-400 transition-colors" />
                          <div className="font-mono text-[10px] text-zinc-300 truncate">{drawing}</div>
                        </div>
                        <div className="text-[10px] uppercase font-bold tracking-widest">
                          {!result ? (
                            <span className="text-[#444]">Pendente</span>
                          ) : result.status === 'searching' ? (
                            <span className="text-yellow-500 animate-pulse">Buscando</span>
                          ) : result.status === 'found' ? (
                            <span className="text-emerald-500">Localizado</span>
                          ) : result.status === 'not_found' ? (
                            <span className="text-rose-500">Não Encontrado</span>
                          ) : (
                            <span className="text-red-500">Falha</span>
                          )}
                        </div>
                      </div>

                      {result?.status === 'found' && dxfData && (
                        <div className="p-4 space-y-4">
                          <div className="p-3 bg-[#0a0a0a] rounded-lg border border-white/[0.03]">
                            <div className="text-[9px] uppercase font-bold text-muted-foreground mb-1 tracking-widest pl-1">Diretório do Arquivo</div>
                            <div className="font-mono text-[10px] dark:text-zinc-400 text-zinc-600 break-all select-all leading-relaxed pr-1 underline underline-offset-4 decoration-rose-500/20">
                              {dxfData.path}
                            </div>
                          </div>

                          {dxfData.panelInfo && (
                            <div className={`p-3 rounded-lg border ${Math.abs(parseFloat(dxfData.panelInfo.dimension)) === 18 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-blue-500/5 border-blue-500/20'}`}>
                              {Math.abs(parseFloat(dxfData.panelInfo.dimension)) === 18 ? (
                                <div className="text-emerald-400 font-bold flex items-center gap-2 text-[10px] uppercase tracking-wide">
                                  <CheckCircle className="h-4 w-4" />
                                  <span>Painel de 18mm Verificado</span>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  <div className="text-blue-400 font-bold text-[10px] uppercase tracking-widest flex items-center gap-2">
                                    <Info className="h-3.5 w-3.5" />
                                    PAINEL PRINCIPAL:
                                  </div>
                                  <div className="text-white text-sm font-medium pl-5">
                                    {dxfData.panelInfo.panelCode} <span className="font-mono text-blue-400/80 bg-blue-500/10 px-1.5 py-0.5 rounded ml-1">({dxfData.panelInfo.dimension})</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {dxfData.fresaInfo && (
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-[9px] font-bold text-purple-400 uppercase tracking-widest pl-1">
                                  <Zap className="h-3 w-3" /> FRESAS <span className="opacity-40">({dxfData.fresaInfo.fresa37List?.length || 0})</span>
                                </div>
                                <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                                  {dxfData.fresaInfo.fresa37List?.map((item: any, idx: number) => (
                                    <div key={`fresa-${idx}`} className="bg-purple-500/5 border border-purple-500/10 p-2 rounded-lg flex items-center justify-between group/item">
                                      <span className="text-[9px] font-mono text-purple-300">#{item.index} (L{item.line})</span>
                                      <div className="flex gap-1">
                                        {item.hasNegative37 && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]" title="-37mm" />}
                                        {item.hasPositive37 && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]" title="37mm" />}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 text-[9px] font-bold text-blue-400 uppercase tracking-widest pl-1">
                                  <Layers className="h-3 w-3" /> USINAGENS <span className="opacity-40">({dxfData.fresaInfo.usinagem37List?.length || 0})</span>
                                </div>
                                <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                                  {dxfData.fresaInfo.usinagem37List?.map((item: any, idx: number) => (
                                    <div key={`usinagem-${idx}`} className="bg-blue-500/5 border border-blue-500/10 p-2 rounded-lg flex items-center justify-between group/item">
                                      <span className="text-[9px] font-mono text-blue-300">#{item.index} (L{item.line})</span>
                                      <div className="flex gap-1">
                                        {item.hasNegative37 && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]" title="-37mm" />}
                                        {item.hasPositive37 && <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]" title="37mm" />}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {(
                            (dxfData.fresaInfo?.count37 > 0 || dxfData.fresaInfo?.usinagemCount37 > 0) ||
                            (dxfData.panelInfo?.dimension === '-37' || dxfData.panelInfo?.dimension === '37')
                          ) && (
                              <button
                                onClick={() => onFix(drawing)}
                                disabled={isFixing}
                                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900/50 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-3 shadow-lg shadow-rose-900/20 active:scale-95"
                              >
                                {isFixing ? (
                                  <>
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                    Executando Correção Automática...
                                  </>
                                ) : (
                                  <>
                                    <Zap className="h-4 w-4" />
                                    Corrigir TUDO (Fresa + Usinagem + Painel)
                                  </>
                                )}
                              </button>
                            )}
                        </div>
                      )}

                      {result?.message && (
                        <div className="p-4 text-xs text-rose-300 bg-rose-500/10 border-t border-rose-500/20 flex items-center gap-3 italic">
                          <AlertTriangle className="h-5 w-5 opacity-50 shrink-0" />
                          {result.message}
                        </div>
                      )}
                    </div>
                  );
                })}
                {uniqueDrawings.length === 0 && (
                  <div className="text-center text-zinc-600 text-[10px] py-10 rounded-xl border border-dashed border-[#232323] uppercase font-bold tracking-widest">
                    Nenhum desenho identificado
                  </div>
                )}
              </div>
            </div>
          )}

          <div className={`mt-6 pt-6 border-t ${allOk ? 'border-emerald-500/20' : 'border-amber-500/20'} flex items-center justify-between bg-black/20 -mx-5 px-5 py-4`}>
            <div className="flex items-center gap-2">
              {allOk ? (
                <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                  <Check className="h-4 w-4 text-emerald-500" />
                </div>
              ) : (
                <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                </div>
              )}
              <div className="flex flex-col">
                <span className={`text-[11px] font-bold uppercase tracking-widest ${allOk ? 'dark:text-emerald-400 text-emerald-600' : 'dark:text-amber-400 text-amber-600'}`}>
                  {allOk ? 'Validação Concluída' : 'Atenção Necessária'}
                </span>
                <span className="text-[10px] text-muted-foreground font-medium">
                  {allOk ? 'Todos os desenhos estão em conformidade.' : 'Alguns desenhos requerem correção DXF.'}
                </span>
              </div>
            </div>
            
          </div>
        </div>
      )}
    </section>
  );
}
