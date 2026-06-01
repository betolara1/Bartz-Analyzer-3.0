import React from "react";
import { Layers, ChevronDown } from "lucide-react";
import { Row } from "../../types";

interface MuxarabiSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  data: Row | null;
}

export function MuxarabiSection({ isOpen, onToggle, data }: MuxarabiSectionProps) {
  const muxarabiItems = (data?.meta?.muxarabiItems || []) as any[];

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
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232323]">
                  {muxarabiItems.map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-mono text-orange-400">{item.itemBase}</td>
                      <td className="px-4 py-3 text-white/80">{item.desenho || <span className="text-[#444] italic">vazio</span>}</td>
                      <td className="px-4 py-3 text-white text-[11px] leading-tight break-words max-w-[250px]">
                        {item.descricao || <span className="text-white/40 italic">vazio</span>}
                      </td>
                    </tr>
                  ))}
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
