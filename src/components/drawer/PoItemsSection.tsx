import React, { useState } from "react";
import { Layers, ChevronDown, Edit2, AlertTriangle, Search, FileText, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { Row } from "../../types";

interface PoItemsSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  data: Row | null;
}

export function PoItemsSection({ isOpen, onToggle, data }: PoItemsSectionProps) {
  const poItems = (data?.meta?.poItems || []) as any[];

  // Filter State
  const [filterText, setFilterText] = useState("");

  // Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [newDescription, setNewDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const filteredItems = poItems.filter((item: any) => {
    if (!filterText.trim()) return true;
    const search = filterText.toLowerCase();
    return (
      (item.itemBase || "").toLowerCase().includes(search) ||
      (item.desenho || "").toLowerCase().includes(search) ||
      (item.dimensao || "").toLowerCase().includes(search) ||
      (item.descricao || "").toLowerCase().includes(search)
    );
  });

  if (poItems.length === 0) return null;

  const handleOpenEditModal = (item: any) => {
    setSelectedItem(item);
    setNewDescription(item.descricao || "");
    setIsEditModalOpen(true);
  };

  const handleApplyDescriptionChange = async () => {
    if (!data || !selectedItem || !newDescription.trim()) return;

    setIsSaving(true);
    const id = toast.loading("Salvando nova descrição...");
    try {
      const res = await (window as any).electron?.analyzer?.replaceItemDescription?.(
        data.fullpath,
        selectedItem.ids || [selectedItem.id],
        newDescription.trim(),
        selectedItem.desenho
      );

      if (res?.ok) {
        toast.success("Descrição alterada com sucesso!");
        setIsConfirmModalOpen(false);
        setSelectedItem(null);
      } else {
        toast.error(`Falha ao alterar descrição: ${res?.message || "erro desconhecido"}`);
      }
    } catch (error: any) {
      toast.error(`Erro ao alterar: ${error.message || error}`);
    } finally {
      setIsSaving(false);
      toast.dismiss(id);
    }
  };

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

  return (
    <section className="rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/5 overflow-hidden shadow-sm transition-all duration-300">
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer group"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#111] border border-[#232323] text-indigo-400">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight">Itens POXXXX</h3>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Detecção de códigos padrão POXXXX / POXXXXAA</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`h-2 w-2 rounded-full ${poItems.length > 0 ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]' : 'bg-[#333]'}`} />
          <div className={`p-2 rounded-full bg-[#111] border border-[#232323] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
            <ChevronDown className="h-4 w-4 text-[#666]" />
          </div>
        </div>
      </div>
      {isOpen && (
        <div className="px-5 pb-5 pt-2 space-y-3">
          {poItems.length > 0 && (
            <div className="relative max-w-md">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">
                <Search className="h-3.5 w-3.5" />
              </span>
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Buscar por item, desenho, dimensão ou descrição..."
                className="w-full bg-[#111] border border-[#232323] text-white pl-9 pr-3 py-2 rounded-lg text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all font-medium"
              />
            </div>
          )}

          {filteredItems.length > 0 ? (
            <div className="rounded-lg border border-[#232323] bg-[#111] overflow-hidden shadow-inner overflow-x-auto">
              <table className="w-full text-xs min-w-[500px]">
                <thead className="bg-[#1B1B1B] text-muted-foreground border-b border-[#232323]">
                  <tr>
                    <th className="text-left px-4 py-3 uppercase font-bold tracking-widest text-[9px]">Item Base</th>
                    <th className="text-left px-4 py-3 uppercase font-bold tracking-widest text-[9px]">Desenho</th>
                    <th className="text-left px-4 py-3 uppercase font-bold tracking-widest text-[9px]">Dimensão</th>
                    <th className="text-left px-4 py-3 uppercase font-bold tracking-widest text-[9px]">Descrição</th>
                    <th className="text-center px-4 py-3 uppercase font-bold tracking-widest text-[9px] w-[240px]">Desenhos</th>
                    <th className="text-right px-4 py-3 uppercase font-bold tracking-widest text-[9px] w-[130px]">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232323]">
                  {filteredItems.map((item: any, i: number) => (
                    <tr key={i} className="hover:bg-white/[0.02] transition-colors group/inner">
                      <td className="px-4 py-3 font-mono text-indigo-400">{item.itemBase}</td>
                      <td className="px-4 py-3 text-white/80">{item.desenho || <span className="text-[#444] italic">vazio</span>}</td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[100px]">{item.dimensao}</td>
                      <td className="px-4 py-3 text-white text-[11px] leading-tight max-w-[220px] break-words">
                        {item.descricao || <span className="text-white/40 italic">vazio</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            disabled={!item.desenho}
                            onClick={() => handleOpenDrawing(item.desenho)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 active:scale-[0.97] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Abrir desenho"
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
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 active:scale-[0.97] transition-all"
                        >
                          <Edit2 className="h-3 w-3" />
                          Trocar Descrição
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : poItems.length > 0 ? (
            <div className="flex flex-col items-center justify-center py-8 rounded-lg border border-dashed border-[#232323] opacity-40">
              <p className="text-xs italic text-[#555]">Nenhum item corresponde à busca.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 rounded-lg border border-dashed border-[#232323] opacity-40">
              <p className="text-xs italic text-[#555]">Nenhum item POXXXX detectado.</p>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: EDITAR DESCRIÇÃO */}
      {isEditModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#151515] border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 bg-[#1B1B1B] border-b border-[#232323] flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Edit2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Trocar Descrição</h3>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">Alteração de descrição de item POXXXX</p>
              </div>
            </div>
            
            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest pl-1">Descrição Atual</label>
                <div className="px-3 py-2.5 rounded-lg bg-[#0E0E0E] border border-[#232323] text-xs text-zinc-400 select-all font-medium leading-relaxed">
                  {selectedItem.descricao || <span className="italic text-zinc-600">vazio</span>}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest pl-1">Nova Descrição</label>
                <input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Digite a nova descrição do item..."
                  className="w-full bg-[#0E0E0E] border border-[#2C2C2C] text-white px-3 py-2.5 rounded-lg text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all font-medium"
                  autoFocus
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-[#1B1B1B] border-t border-[#232323] flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setSelectedItem(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#222] hover:bg-[#2A2A2A] text-white/80 transition-colors uppercase tracking-wider"
              >
                Cancelar
              </button>
              <button
                disabled={!newDescription.trim() || newDescription.trim() === selectedItem.descricao}
                onClick={() => {
                  setIsEditModalOpen(false);
                  setIsConfirmModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRMAR ALTERAÇÃO */}
      {isConfirmModalOpen && selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#151515] border border-indigo-500/40 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 bg-[#1B1B1B] border-b border-[#232323] flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Confirmar Troca de Descrição</h3>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">Aviso de segurança</p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <p className="text-xs text-zinc-300 leading-relaxed font-medium">
                Você tem certeza que deseja alterar a descrição deste produto no arquivo XML? Esta alteração será gravada diretamente nas tags correspondentes.
              </p>

              <div className="space-y-3 p-4 rounded-xl bg-[#0E0E0E] border border-[#232323]">
                <div>
                  <div className="text-[8px] text-muted-foreground uppercase font-bold tracking-widest mb-1">De:</div>
                  <div className="text-xs text-rose-400 font-medium line-through leading-relaxed">
                    {selectedItem.descricao || "—"}
                  </div>
                </div>
                <div className="border-t border-[#232323] pt-2">
                  <div className="text-[8px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Para:</div>
                  <div className="text-xs text-emerald-400 font-bold leading-relaxed">
                    {newDescription}
                  </div>
                </div>
              </div>

              <div className="text-[10px] text-zinc-500 font-medium italic">
                * Um backup do arquivo original será criado antes de aplicar esta alteração.
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-[#1B1B1B] border-t border-[#232323] flex justify-end gap-2">
              <button
                disabled={isSaving}
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setIsEditModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#222] hover:bg-[#2A2A2A] text-white/80 transition-colors uppercase tracking-wider disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                disabled={isSaving}
                onClick={handleApplyDescriptionChange}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors uppercase tracking-wider disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSaving ? "Salvando..." : "Confirmar Troca"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
