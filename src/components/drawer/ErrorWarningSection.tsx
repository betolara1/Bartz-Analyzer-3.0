import React from "react";
import { AlertTriangle, Info, CheckCircle } from "lucide-react";
import { BadgeErro } from "../BadgeErro";
import { AutoFixBadge } from "../AutoFixBadge";
import { Row } from "../../types";

interface ErrorWarningSectionProps {
  data: Row | null;
  onMoveToOk?: () => void;
}

export function ErrorWarningSection({ data, onMoveToOk }: ErrorWarningSectionProps) {
  const errors = data?.errors || [];
  const warnings = data?.warnings || [];
  const autoFixes = data?.autoFixes || [];

  const isErpError = (e: string) => String(e).toLowerCase().includes("não encontrado no erp");
  const isMuxarabiError = (e: string) => String(e).toUpperCase().includes("PEÇA MUXARABI");

  const hasSemCodigoErp = data?.tags?.includes("sem código erp") || errors.some(isErpError);
  const hasMuxarabi = data?.tags?.includes("muxarabi") || errors.some(isMuxarabiError);
  const hasBypassableError = hasSemCodigoErp || hasMuxarabi;

  const otherErrors = errors.filter(e => !isErpError(e) && !isMuxarabiError(e));
  const hasOtherErrors = otherErrors.length > 0;

  if (errors.length === 0 && warnings.length === 0 && autoFixes.length === 0) {
    return (
      <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-3">
        <CheckCircle className="h-5 w-5 text-emerald-500" />
        <p className="text-sm text-emerald-500/80 font-medium tracking-tight">Nenhuma inconformidade ou aviso detectado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 bg-muted/30 p-4 rounded-xl border border-border hover:border-primary/50 transition-colors">
      {/* ERROS */}
      {errors.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle className="h-4 w-4 text-rose-500" />
            <h4 className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Inconformidades ({errors.length})</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {errors.map((e, i) => (
              <BadgeErro key={i} error={e} />
            ))}
          </div>

          {hasBypassableError && (
            <div className="pt-2 border-t border-border/40 mt-3">
              <button
                onClick={onMoveToOk}
                disabled={hasOtherErrors}
                className={`
                  w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-bold text-xs uppercase tracking-wider transition-all duration-200
                  ${hasOtherErrors
                    ? "bg-zinc-800/50 text-zinc-500 border border-zinc-700/30 cursor-not-allowed opacity-60"
                    : "bg-emerald-500 text-black hover:bg-emerald-600 shadow-lg shadow-emerald-500/10 active:scale-[0.98]"
                  }
                `}
              >
                <CheckCircle className="h-4 w-4" />
                Enviar para OK
              </button>
              {hasOtherErrors && (
                <p className="text-[10px] text-rose-400/80 font-bold tracking-wide uppercase mt-2 text-center leading-normal">
                  * Trate as outras inconformidades primeiro para liberar o envio.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* AUTO FIXES */}
      {autoFixes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Correções Automáticas ({autoFixes.length})</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {autoFixes.map((f, i) => (
              <AutoFixBadge key={i} fix={f} />
            ))}
          </div>
        </div>
      )}

      {/* WARNINGS */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <Info className="h-4 w-4 text-amber-500" />
            <h4 className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Avisos ({warnings.length})</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {warnings.map((w, i) => (
              <div key={i} className="text-[11px] bg-amber-500/5 text-amber-500/70 border border-amber-500/10 px-2 py-1 rounded-md font-medium leading-tight italic">
                {w}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
