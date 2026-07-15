import React from "react";
import { Layers, ChevronDown, FileText, Wand2, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Row } from "../../types";

interface MuxarabiSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  data: Row | null;
}

export function MuxarabiSection({ isOpen, onToggle, data }: MuxarabiSectionProps) {
  const muxarabiItems = (data?.meta?.muxarabiItems || []) as any[];

  const handleOpenDrawing = async (drawingCode: string) => {
    if (!drawingCode) {
      toast.error("Código de desenho inválido.");
      return;
    }
    const id = toast.loading(`Buscando e abrindo desenho ${drawingCode}...`);
    try {
      const res = await (window as any).electron?.analyzer?.openDrawing?.(drawingCode);
      if (res?.ok) {
        toast.success(`Desenho ${drawingCode} aberto com sucesso!`);
      } else {
        toast.error(`Não foi possível abrir o desenho: ${res?.message || "Erro desconhecido."}`);
      }
    } catch (error: any) {
      toast.error(`Erro ao abrir desenho: ${error.message || error}`);
    } finally {
      toast.dismiss(id);
    }
  };

  const handleOpenDrawingFolder = async (drawingCode: string) => {
    if (!drawingCode) {
      toast.error("Código de desenho inválido.");
      return;
    }
    const id = toast.loading(`Buscando e localizando pasta do desenho ${drawingCode}...`);
    try {
      const res = await (window as any).electron?.analyzer?.openDrawingFolder?.(drawingCode);
      if (res?.ok) {
        toast.success(`Pasta do desenho ${drawingCode} aberta com sucesso!`);
      } else {
        toast.error(`Não foi possível abrir a pasta do desenho: ${res?.message || "Erro desconhecido."}`);
      }
    } catch (error: any) {
      toast.error(`Erro ao abrir pasta: ${error.message || error}`);
    } finally {
      toast.dismiss(id);
    }
  };

  const handleInjectMuxarabi = async (drawingCode: string, sizeCode: string, thickness: string) => {
    if (!drawingCode || !sizeCode) {
      toast.error("Desenho ou tamanho do muxarabi não identificado.");
      return;
    }
    const id = toast.loading(`Aplicando muxarabi ${sizeCode} (${thickness}mm) no desenho ${drawingCode}...`);
    try {
      const res = await (window as any).electron?.analyzer?.injectMuxarabi?.(drawingCode, sizeCode, thickness);
      if (res?.ok) {
        toast.success(`Muxarabi ${sizeCode} aplicado em ${drawingCode}: ${res.injectedCount} usinagens na layer ${res.layer} (peça ${res.pieceDimensions}).`);
      } else {
        toast.error(`Não foi possível aplicar o muxarabi: ${res?.message || "Erro desconhecido."}`);
      }
    } catch (error: any) {
      toast.error(`Erro ao aplicar muxarabi: ${error.message || error}`);
    } finally {
      toast.dismiss(id);
    }
  };

  const handleOpenMuxarabi = async (sizeCode: string) => {
    if (!sizeCode) {
      toast.error("Não foi possível identificar o tamanho do muxarabi.");
      return;
    }
    const id = toast.loading(`Buscando e abrindo desenho do Muxarabi ${sizeCode}...`);
    try {
      const res = await (window as any).electron?.analyzer?.openMuxarabiDrawing?.(sizeCode);
      if (res?.ok) {
        toast.success(`Desenho Muxarabi ${sizeCode} aberto com sucesso!`);
      } else {
        toast.error(`Não foi possível abrir o Muxarabi: ${res?.message || "Erro desconhecido."}`);
      }
    } catch (error: any) {
      toast.error(`Erro ao abrir Muxarabi: ${error.message || error}`);
    } finally {
      toast.dismiss(id);
    }
  };

  if (muxarabiItems.length === 0) return null;

  return (
    <section className="rounded-xl border border-orange-200 dark:border-orange-500/30 bg-orange-50 dark:bg-orange-500/5 overflow-hidden shadow-sm transition-all duration-300">
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer group"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#111] border border-[#232323] text-orange-400">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight">Itens Muxarabi (MX008)</h3>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Validação de grades e furos</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`h-2 w-2 rounded-full ${muxarabiItems.length > 0 ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]' : 'bg-[#333]'}`} />
          <div className={`p-2 rounded-full bg-[#111] border border-[#232323] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
            <ChevronDown className="h-4 w-4 text-[#666]" />
          </div>
        </div>
      </div>
      {isOpen && (
        <div className="px-5 pb-5 pt-2">
          {muxarabiItems.length > 0 ? (
            <div className="rounded-lg border border-[#232323] bg-[#111] overflow-hidden shadow-inner overflow-x-auto">
              <table className="w-full text-xs min-w-[350px]">
                <thead className="bg-[#1B1B1B] text-muted-foreground border-b border-[#232323]">
                  <tr>
                    <th className="text-left px-4 py-3 uppercase font-bold tracking-widest text-[9px]">Item Base</th>
                    <th className="text-left px-4 py-3 uppercase font-bold tracking-widest text-[9px]">Desenho</th>
                    <th className="text-left px-4 py-3 uppercase font-bold tracking-widest text-[9px]">Descrição</th>
                    <th className="text-center px-4 py-3 uppercase font-bold tracking-widest text-[9px] w-[400px]">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232323]">
                   {muxarabiItems.map((item: any, i: number) => {
                    const match = item.descricao?.match(/(\d+\s*x\s*\d+)/i);
                    const sizeCode = match ? match[1].replace(/\s+/g, '').toLowerCase() : null;
                    const thMatch = item.descricao?.match(/(\d{2})\s*mm/i);
                    const thickness = thMatch ? thMatch[1] : '18';

                    return (
                      <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 font-mono text-orange-400">{item.itemBase}</td>
                        <td className="px-4 py-3 text-white/80">{item.desenho || <span className="text-[#444] italic">vazio</span>}</td>
                        <td className="px-4 py-3 text-white text-[11px] leading-tight break-words max-w-[250px]">
                          {item.descricao || <span className="text-white/40 italic">vazio</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="inline-flex gap-2">
                            <button
                              disabled={!item.desenho}
                              onClick={() => handleOpenDrawing(item.desenho)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Abrir desenho principal do item"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Abrir Desenho
                            </button>
                            <button
                              disabled={!item.desenho}
                              onClick={() => handleOpenDrawingFolder(item.desenho)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Abrir pasta do desenho"
                            >
                              <FolderOpen className="h-3.5 w-3.5" />
                              Abrir Pasta
                            </button>
                            <button
                              disabled={!sizeCode}
                              onClick={() => handleOpenMuxarabi(sizeCode)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              title={`Abrir desenho Muxarabi de tamanho ${sizeCode || 'desconhecido'}`}
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Abrir Muxarabi
                            </button>
                            <button
                              disabled={!item.desenho || !sizeCode}
                              onClick={() => handleInjectMuxarabi(item.desenho, sizeCode!, thickness)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              title={`Injetar as usinagens do muxarabi ${sizeCode || 'desconhecido'} (chapa ${thickness}mm) no desenho ITE automaticamente (50mm da borda)`}
                            >
                              <Wand2 className="h-3.5 w-3.5" />
                              Aplicar Muxarabi
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 rounded-lg border border-dashed border-[#232323] opacity-40">
              <p className="text-xs italic text-[#555]">Nenhum item muxarabi detectado.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
