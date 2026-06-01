import React from "react";
import { Grid3X3, Zap, CheckCircle, XCircle } from "lucide-react";
import { Row } from "../../types";

interface MachineSectionProps {
  data: Row | null;
}

export function MachineSection({ data }: MachineSectionProps) {
  const machines = data?.meta?.machines || [];

  const PLUGIN_NAMES: Record<string, string> = { 
    "2530": "Aspan", 
    "2534": "NCB612" 
  };

  return (
    <section className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border hover:border-primary/50 transition-colors">
      <div className="flex items-center gap-2 px-1">
        <Grid3X3 className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Maquinário / Plugins (GerADOS)</h4>
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        {["2530", "2534"].map(id => {
          const m = machines.find(m => m.id === id);
          const name = PLUGIN_NAMES[id] || "—";
          return (
            <div 
              key={id} 
              className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
                m ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-muted border-border text-muted-foreground/30'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {m ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3 opacity-30" />}
                <span className="text-[11px] font-bold font-mono">{id}</span>
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-tight ${m ? 'text-emerald-500/60' : 'text-muted-foreground/60'}`}>
                {name}
              </span>
            </div>
          );
        })}
      </div>

      {machines.length > 0 && (
        <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl flex items-start gap-2.5">
          <Zap className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
          <div className="text-[10px] text-blue-500/60 leading-tight">
            Estes IDs representam os plugins de máquinas que processaram este XML com sucesso.
          </div>
        </div>
      )}
    </section>
  );
}
