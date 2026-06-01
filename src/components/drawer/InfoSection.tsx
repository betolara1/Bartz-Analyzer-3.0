import React from "react";
import { Clock, Folder, RotateCcw } from "lucide-react";
import { Row } from "../../types";

interface InfoSectionProps {
  data: Row | null;
  onReprocess: () => void;
  onOpenFolder: () => void;
}

export function InfoSection({ data, onReprocess, onOpenFolder }: InfoSectionProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-1 bg-muted/30 p-3 rounded-xl border border-border hover:border-primary/50 transition-colors">
        <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest flex items-center gap-1.5">
          <Clock className="h-3 w-3" /> Data do Processamento
        </div>
        <div className="text-sm font-medium text-foreground">{data?.timestamp || "--/--/---- --:--"}</div>
      </div>
      
      <div className="space-y-1 bg-muted/30 p-3 rounded-xl border border-border hover:border-primary/50 transition-colors">
        <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Ações Rápidas</div>
        <div className="flex gap-2">  
          <button 
            onClick={onOpenFolder}
            className="flex-1 bg-muted hover:bg-muted/80 text-foreground text-[10px] font-bold uppercase tracking-widest py-1.5 rounded-lg border border-border flex items-center justify-center gap-1.5 transition-all"
          >
            <Folder className="h-3 w-3" /> Pasta
          </button>
        </div>
      </div>
{/* 
      <div className="sm:col-span-2 space-y-1 bg-muted/30 p-3 rounded-xl border border-border hover:border-primary/50 transition-colors overflow-hidden">
        <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Caminho do Arquivo</div>
        <div className="text-[10px] font-mono text-muted-foreground break-all select-all leading-relaxed bg-background p-2 rounded-lg border border-border">
          {data?.fullpath || "Caminho não disponível"}
        </div>
      </div> */}
    </div>
  );
}
