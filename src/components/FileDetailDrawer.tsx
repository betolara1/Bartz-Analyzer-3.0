import React, { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction
} from "./ui/alert-dialog";
import { toast } from "sonner";
import {
  X,
  FileText,
  Minimize2,
  Maximize2,
} from "lucide-react";

import { ChipStatus } from "./ChipStatus";
import { Row } from "../types";
import { useFileActions } from "../hooks/useFileActions";
import { FileDetailTabs, type TabKey } from "./drawer/FileDetailTabs";

interface FileDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: Row | null;
  onAction?: (path: string, action: string) => void;
  onFileMoved?: (oldPath: string, newPath: string) => void;
}

function FileDetailDrawer({ open, onOpenChange, data, onAction, onFileMoved }: FileDetailDrawerProps) {
  const actions = useFileActions(data, open, onAction, onFileMoved);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [isMaximized, setIsMaximized] = useState(false);

  // Reset UI state when drawer closes
  React.useEffect(() => {
    if (!open) {
      setIsMaximized(false);
      setActiveTab("overview");
    }
  }, [open]);

  if (!data && open) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Overlay */}
        <DialogPrimitive.Overlay className="fd-modal-overlay" />

        {/* Modal */}
        <DialogPrimitive.Content
          className={`fd-modal-container ${isMaximized ? "fd-modal-maximized" : ""}`}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={() => onOpenChange(false)}
          onEscapeKeyDown={() => onOpenChange(false)}
        >
          <div className="fd-modal-inner">
            {/* ═══ HEADER ═══ */}
            <div className="fd-modal-header">
              {/* Top Bar: Title + Window Controls */}
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2.5 rounded-xl bg-muted border border-border text-muted-foreground shadow-inner shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogPrimitive.Title className="text-lg font-bold text-foreground tracking-tight leading-tight truncate">
                      {data?.filename || "Detalhes do Arquivo"}
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-[0.2em]">
                      Análise técnica profunda do componente
                    </DialogPrimitive.Description>
                  </div>
                </div>

                {/* Window Controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setIsMaximized(!isMaximized)}
                    className="fd-window-btn"
                    title={isMaximized ? "Restaurar" : "Maximizar"}
                  >
                    {isMaximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  </button>
                  <DialogPrimitive.Close asChild>
                    <button
                      className="fd-window-btn fd-window-btn-close"
                      title="Fechar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </DialogPrimitive.Close>
                </div>
              </div>

              {/* Status Strip */}
              <div className="flex items-center gap-3 flex-wrap">
                <ChipStatus status={data?.status || 'ERRO'} />
              </div>
            </div>

            {/* ═══ TABS + CONTENT ═══ */}
            <FileDetailTabs
              data={data}
              actions={actions}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />

            {/* Resize Grip */}
            {!isMaximized && <div className="fd-resize-grip" />}
          </div>
        </DialogPrimitive.Content>

        {/* ═══ CONFIRMATION MODALS (Portal siblings to main content) ═══ */}
        <AlertDialog open={actions.confirmCoringaOpen} onOpenChange={actions.setConfirmCoringaOpen}>
          <AlertDialogContent className="bg-card border border-amber-500/30">
            <AlertDialogTitle className="text-foreground">Confirmar troca de cor coringa?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Você está prestes a substituir <span className="font-mono font-bold text-amber-300">{actions.coringaFrom}</span> por <span className="font-mono font-bold text-amber-300">{actions.coringaTo}</span>.
            </AlertDialogDescription>
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel className="bg-muted text-foreground hover:bg-muted/80">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={actions.onApplyCoringa}
                className="bg-amber-500 text-black hover:bg-amber-600"
              >
                Confirmar
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={actions.confirmRefOpen} onOpenChange={actions.setConfirmRefOpen}>
          <AlertDialogContent className="bg-card border border-rose-500/30">
            <AlertDialogTitle className="text-foreground">Confirmar preenchimento de REFERENCIA?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {(() => {
                const [selId, ...selDescParts] = (actions.selectedRefSingle || '').split('|');
                const selDesc = selDescParts.join('|');
                return (
                  <>
                    Você está prestes a preencher REFERENCIA do item:
                    <div className="mt-2 p-2 bg-muted/50 rounded border border-border">
                      <div className="font-bold text-rose-300">ID: {selId}</div>
                      {selDesc && <div className="text-xs italic text-zinc-400">"{selDesc}"</div>}
                    </div>
                    <div className="mt-2">Novo código: <span className="font-mono font-bold text-rose-300">{actions.refFillValue}</span></div>
                  </>
                );
              })()}
            </AlertDialogDescription>
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel className="bg-muted text-foreground hover:bg-muted/80">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={actions.onApplyRef}
                className="bg-rose-500 text-black hover:bg-rose-600"
              >
                Confirmar
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={actions.confirmCgOpen} onOpenChange={actions.setConfirmCgOpen}>
          <AlertDialogContent className="bg-card border border-amber-500/30">
            <AlertDialogTitle className="text-foreground">Confirmar troca em lote (CG1/CG2)?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Você está prestes a substituir:
              <ul className="mt-2 ml-4 space-y-1 text-xs">
                {actions.cg1Replace && <li>• <span className="font-mono">CG1</span> → <span className="font-mono font-bold text-amber-300">{actions.cg1Replace}</span></li>}
                {actions.cg2Replace && <li>• <span className="font-mono">CG2</span> → <span className="font-mono font-bold text-amber-300">{actions.cg2Replace}</span></li>}
              </ul>
              <div className="mt-2 text-xs">Será criado um backup do arquivo original.</div>
            </AlertDialogDescription>
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel className="bg-muted text-foreground hover:bg-muted/80">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={actions.onApplyCgBatch}
                className="bg-amber-500 text-black hover:bg-amber-600"
              >
                Confirmar
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={actions.confirmMoveOpen} onOpenChange={actions.setConfirmMoveOpen}>
          <AlertDialogContent className="bg-card border border-amber-500/30">
            <AlertDialogTitle className="text-foreground">Ainda há desenhos duplados. Mover mesmo assim?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm">
              Existem pendências de correção DXF identificadas nestes itens duplados (ES08).
            </AlertDialogDescription>
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel className="bg-muted text-foreground hover:bg-muted/80">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  actions.setConfirmMoveOpen(false);
                  actions.resolveAndMaybeMove('es08');
                }}
                className="bg-amber-500 text-black hover:bg-amber-600"
              >
                Confirmar e Resolver
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={actions.confirmMoveEmptyOpen} onOpenChange={actions.setConfirmMoveEmptyOpen}>
          <AlertDialogContent className="bg-card border border-emerald-500/30">
            <AlertDialogTitle className="text-foreground">Ignorar erro e marcar como resolvido?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {actions.unresolvedProblems.length <= 1
                ? 'O arquivo será movido para a pasta de processados mesmo contendo itens sem componentes. Deseja continuar?'
                : 'Este problema será marcado como resolvido. O arquivo só será movido quando todos os problemas forem resolvidos.'}
            </AlertDialogDescription>
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel className="bg-muted text-foreground hover:bg-muted/80">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  actions.setConfirmMoveEmptyOpen(false);
                  actions.resolveAndMaybeMove('sem_filho');
                }}
                className="bg-emerald-500 text-black hover:bg-emerald-600"
              >
                {actions.unresolvedProblems.length <= 1 ? 'Confirmar e Mover' : 'Confirmar'}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={actions.confirmMoveOkOpen} onOpenChange={actions.setConfirmMoveOkOpen}>
          <AlertDialogContent className="bg-card border border-emerald-500/30">
            <AlertDialogTitle className="text-foreground">Confirmar resolução?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {actions.unresolvedProblems.length <= 1
                ? 'O arquivo será movido para a pasta de processados. Esta ação não pode ser desfeita facilmente.'
                : 'Este problema será marcado como resolvido. O arquivo só será movido quando todos os problemas forem resolvidos.'}
            </AlertDialogDescription>
            <div className="flex gap-2 justify-end">
              <AlertDialogCancel className="bg-muted text-foreground hover:bg-muted/80">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  actions.setConfirmMoveOkOpen(false);
                  actions.resolveAndMaybeMove('es08');
                }}
                className="bg-emerald-500 text-black hover:bg-emerald-600"
              >
                {actions.unresolvedProblems.length <= 1 ? 'Confirmar e Mover' : 'Confirmar'}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default React.memo(FileDetailDrawer);
