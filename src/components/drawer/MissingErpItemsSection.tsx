import React from "react";
import { ChevronDown, Database } from "lucide-react";
import { Row } from "../../types";

interface MissingErpItemsSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  data: Row | null;
}

export function MissingErpItemsSection({ isOpen, onToggle, data }: MissingErpItemsSectionProps) {
  const missingItems = (data?.meta?.missingErpItems || []) as any[];

  if (missingItems.length === 0) return null;

  return (
    <section className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/5 overflow-hidden shadow-sm transition-all duration-300">
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer group"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#111] border border-[#232323] text-rose-400">
            <Database className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight">Itens não encontrados no ERP</h3>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Informações dos itens ausentes no cadastro do ERP</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`h-2 w-2 rounded-full ${missingItems.length > 0 ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-[#333]'}`} />
          <div className={`p-2 rounded-full bg-[#111] border border-[#232323] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
            <ChevronDown className="h-4 w-4 text-[#666]" />
          </div>
        </div>
      </div>
      
      {isOpen && (
        <div className="px-5 pb-5 pt-2 space-y-3">
          <div className="rounded-lg border border-[#232323] bg-[#111] overflow-hidden shadow-inner overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#1B1B1B] text-muted-foreground border-b border-[#232323]">
                <tr>
                  <th className="text-left px-4 py-3 uppercase font-bold tracking-widest text-[9px] w-[180px]">Código</th>
                  <th className="text-left px-4 py-3 uppercase font-bold tracking-widest text-[9px]">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232323]">
                {missingItems.map((item: any, i: number) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors group/inner">
                    <td className="px-4 py-3 font-mono text-rose-400 select-all font-bold">{item.code}</td>
                    <td className="px-4 py-3 text-white text-[11px] leading-tight break-words">
                      {item.descricao || <span className="text-white/40 italic">vazio</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
