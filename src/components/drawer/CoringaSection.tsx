import React from "react";
import { AlertTriangle, ChevronDown, CheckCircle, Search, RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { Row } from "../../types";

interface CoringaSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  data: Row | null;
  coringaFrom: string | null;
  setCoringaFrom: (v: string) => void;
  coringaTo: string;
  setCoringaTo: (v: string) => void;
  indCoringaAcronym: string;
  setIndCoringaAcronym: (v: string) => void;
  indCoringaSearching: boolean;
  indCoringaOptions: any[];
  onCoringaSearch: (acronym: string, group: number) => void;
  onApplyCoringa: () => void;
  isReplacing: boolean;
  lastReplace: any;
  filteredCoringaMatches: string[];

  // CG/Batch logic
  coringa1Acronym: string;
  setCoringa1Acronym: (v: string) => void;
  coringa1Searching: boolean;
  coringa1Options: any[];
  coringa1Selected: string;
  setCoringa1Selected: (v: string) => void;
  coringa1Done: boolean;
  onApplyCoringa1: () => void;

  coringa2Acronym: string;
  setCoringa2Acronym: (v: string) => void;
  coringa2Searching: boolean;
  coringa2Options: any[];
  coringa2Selected: string;
  setCoringa2Selected: (v: string) => void;
  coringa2Done: boolean;
  onApplyCoringa2: () => void;

  cg1Acronym: string;
  setCg1Acronym: (v: string) => void;
  cg1Searching: boolean;
  cg1Options: any[];
  cg1Replace: string;
  setCg1Replace: (v: string) => void;
  cg1Done: boolean;
  onApplyCg1: () => void;

  cg2Acronym: string;
  setCg2Acronym: (v: string) => void;
  cg2Searching: boolean;
  cg2Options: any[];
  cg2Replace: string;
  setCg2Replace: (v: string) => void;
  cg2Done: boolean;
  onApplyCg2: () => void;
}

export function CoringaSection({
  isOpen, onToggle, data, coringaFrom, setCoringaFrom, coringaTo, setCoringaTo,
  indCoringaAcronym, setIndCoringaAcronym, indCoringaSearching, indCoringaOptions,
  onCoringaSearch, onApplyCoringa, isReplacing, lastReplace, filteredCoringaMatches,
  coringa1Acronym, setCoringa1Acronym, coringa1Searching, coringa1Options, coringa1Selected, setCoringa1Selected, coringa1Done, onApplyCoringa1,
  coringa2Acronym, setCoringa2Acronym, coringa2Searching, coringa2Options, coringa2Selected, setCoringa2Selected, coringa2Done, onApplyCoringa2,
  cg1Acronym, setCg1Acronym, cg1Searching, cg1Options, cg1Replace, setCg1Replace, cg1Done, onApplyCg1,
  cg2Acronym, setCg2Acronym, cg2Searching, cg2Options, cg2Replace, setCg2Replace, cg2Done, onApplyCg2
}: CoringaSectionProps) {

  const errors = data?.errors || [];
  const hasCG1 = !!data?.meta?.cg1_detected;
  const hasCG2 = !!data?.meta?.cg2_detected;
  const hasCoringa1 = !!data?.meta?.coringa1_detected;
  const hasCoringa2 = !!data?.meta?.coringa2_detected;

  const rawCoringaMatches = (data?.meta?.coringaMatches || []) as string[];
  const hasIndividualCoringas = rawCoringaMatches.length > 0;
  const showSection = hasIndividualCoringas || hasCG1 || hasCG2 || hasCoringa1 || hasCoringa2;

  if (!showSection) return null;

  return (
    <section className="rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5 overflow-hidden shadow-sm dark:shadow-[0_4px_20px_rgba(245,158,11,0.1)] transition-all duration-300">
      <div
        className="px-5 py-4 flex items-center justify-between cursor-pointer group"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-tight leading-none">Cor Coringa Detectada</h3>
            <p className="text-[10px] dark:text-amber-300/60 text-muted-foreground font-medium uppercase tracking-widest mt-1">
              Substituição de siglas genéricas identificadas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse" />
          <div className={`p-2 rounded-full bg-amber-500/5 border border-amber-500/10 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
            <ChevronDown className="h-4 w-4 text-amber-400/50" />
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="p-5 space-y-4 border-t border-amber-500/10">
          {hasIndividualCoringas ? (
            filteredCoringaMatches.length > 0 ? (
              <>
                <div className="p-3 bg-amber-50 dark:bg-[#0a0a0a] border border-amber-100 dark:border-white/5 rounded-lg text-[11px] text-black dark:text-white leading-relaxed font-medium">
                  Sigla genérica identificada no XML. Escolha a sigla original e o novo código para substituição definitiva.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest pl-1">Sigla Encontrada</label>
                    <select
                      value={coringaFrom ?? ""}
                      onChange={(e) => setCoringaFrom(e.target.value)}
                      className="w-full bg-background border border-border text-foreground px-3 py-2 rounded-lg text-sm focus:border-amber-500 outline-none disabled:opacity-50 transition-all font-bold"
                    >
                      {filteredCoringaMatches.map((m, i) => (
                        <option key={i} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5 w-full">
                    <label className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest pl-1">Novo Código/Valor</label>
                    <div className="relative">
                      <input
                        placeholder="Ex: 10.01.0000"
                        value={indCoringaAcronym}
                        onChange={(e) => setIndCoringaAcronym(e.target.value.toUpperCase())}
                        onKeyDown={(e) => { if (e.key === 'Enter') onCoringaSearch(indCoringaAcronym, 3); }}
                        className="w-full bg-background border border-border text-foreground px-3 py-2 pr-8 rounded-lg text-sm focus:border-amber-500 outline-none disabled:opacity-50 transition-all font-mono"
                      />
                      <button
                        onClick={() => onCoringaSearch(indCoringaAcronym, 3)}
                        disabled={!indCoringaAcronym || indCoringaSearching}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-amber-500 disabled:opacity-50"
                      >
                        <Search className="h-4 w-4" />
                      </button>
                    </div>
                    {indCoringaOptions.length > 0 && (
                      <select
                        value={coringaTo}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCoringaTo(val);
                          if (val) {
                            if (coringaFrom?.includes('CG1') && hasCG1) setCg1Replace(val);
                            else if (coringaFrom?.includes('CG2') && hasCG2) setCg2Replace(val);
                          }
                        }}
                        className="w-full bg-background border border-border text-foreground px-3 py-2 mt-2 rounded-lg text-sm focus:border-amber-500 outline-none transition-all font-mono"
                      >
                        <option value="">Selecione...</option>
                        {indCoringaOptions.map((opt, i) => (
                          <option key={i} value={opt.code}>{opt.description}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <button
                  disabled={!coringaFrom || !coringaTo || isReplacing}
                  onClick={onApplyCoringa}
                  className="w-full px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm disabled:opacity-50 transition-all shadow-lg shadow-amber-900/20 flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  {isReplacing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Aplicar Substituição de Cor
                </button>
              </>
            ) : (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <div className="text-[11px] text-amber-200">
                  Existem coringas pendentes, mas nenhuma corresponde ao filtro selecionado no ERP.
                </div>
              </div>
            )
          ) : (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-3">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <div className="text-[11px] text-emerald-200">
                Substituições de cores individuais concluídas. <span className="font-bold">Pendência: Troca de Siglas (Lote) abaixo.</span>
              </div>
            </div>
          )}

          {/* CORINGA1/CG1 e CORINGA2/CG2 - Layout unificado */}
          {(hasCoringa1 || hasCoringa2 || hasCG1 || hasCG2) && (
            <div className="mt-4 border-t border-amber-500/10 pt-4 space-y-4">
              {/* CORINGA 1 / CG1 Row */}
              {(hasCoringa1 || hasCG1) && (
                <div className="space-y-2">
                  <label className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest pl-1">
                    {hasCoringa1 ? 'CORINGA 1' : 'CG1'}
                  </label>
                  <div className="flex gap-2 items-center">
                    {hasCoringa1 && (
                      <>
                        <div className="relative flex-1">
                          <input
                            value={coringa1Acronym}
                            disabled={coringa1Done || hasIndividualCoringas}
                            onChange={(e) => setCoringa1Acronym(e.target.value.toUpperCase())}
                            onKeyDown={(e) => { if (e.key === 'Enter') onCoringaSearch(coringa1Acronym, 1); }}
                            placeholder="Cor (Ex: Branco)"
                            className="w-full bg-background border border-border text-foreground px-2 py-1.5 pr-8 rounded-lg text-[11px] outline-none font-mono disabled:opacity-50"
                          />
                          <button
                            onClick={() => onCoringaSearch(coringa1Acronym, 1)}
                            disabled={!coringa1Acronym || coringa1Searching || coringa1Done || hasIndividualCoringas}
                            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-amber-500 disabled:opacity-50"
                          >
                            <Search className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex-1 min-w-[120px]">
                          <select
                            value={coringa1Selected}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCoringa1Selected(val);
                              if (val && hasCG1) setCg1Replace(val);
                            }}
                            disabled={coringa1Options.length === 0 || coringa1Done || hasIndividualCoringas}
                            className="w-full bg-background border border-border text-foreground px-2 py-1.5 rounded-lg text-[11px] outline-none disabled:opacity-50 transition-all font-mono"
                          >
                            <option value="">Selecione a cor...</option>
                            {coringa1Options.map((opt, i) => (
                              <option key={i} value={opt.code}>{opt.description}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          disabled={!coringa1Selected || coringa1Done || hasIndividualCoringas}
                          onClick={onApplyCoringa1}
                          className="px-2 py-1.5 bg-amber-600/20 text-amber-500 border border-amber-600/30 rounded-lg hover:bg-amber-600 hover:text-white transition-all disabled:opacity-50 shrink-0"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </>
                    )}

                    {hasCG1 && (
                      <>
                        {hasCoringa1 && <div className="w-px h-6 bg-amber-500/20 shrink-0" />}
                        <div className={`flex gap-2 items-center ${hasCoringa1 ? 'shrink-0' : 'flex-1'}`}>
                          <span className="text-[9px] dark:text-amber-300/60 text-amber-600/70 font-bold uppercase tracking-widest shrink-0">CG1 →</span>
                          {hasCoringa1 ? (
                            <input
                              value={cg1Replace}
                              disabled={cg1Done || hasIndividualCoringas}
                              onChange={(e) => setCg1Replace(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                              placeholder="LA"
                              className="bg-background border border-border text-foreground px-2 py-1.5 rounded-lg text-[11px] outline-none font-mono w-16 disabled:opacity-50"
                            />
                          ) : (
                            <div className="flex gap-2 w-full">
                              <div className="relative flex-1 max-w-[150px]">
                                <input
                                  value={cg1Acronym}
                                  disabled={cg1Done || hasIndividualCoringas}
                                  onChange={(e) => setCg1Acronym(e.target.value.toUpperCase())}
                                  onKeyDown={(e) => { if (e.key === 'Enter') onCoringaSearch(cg1Acronym, 4); }}
                                  placeholder="Branco"
                                  className="w-full bg-background border border-border text-foreground px-2 py-1.5 pr-8 rounded-lg text-[11px] outline-none font-mono disabled:opacity-50"
                                />
                                <button
                                  onClick={() => onCoringaSearch(cg1Acronym, 4)}
                                  disabled={!cg1Acronym || cg1Done || hasIndividualCoringas}
                                  className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-zinc-400 disabled:opacity-50"
                                >
                                  <Search className="h-3 w-3" />
                                </button>
                              </div>
                              <select
                                value={cg1Replace}
                                onChange={(e) => setCg1Replace(e.target.value)}
                                disabled={cg1Options.length === 0 || cg1Done || hasIndividualCoringas}
                                className="flex-1 min-w-[120px] bg-background border border-border text-foreground px-2 py-1.5 rounded-lg text-[11px] font-mono disabled:opacity-50"
                              >
                                <option value="">Selecione...</option>
                                {cg1Options.map((opt, i) => (
                                  <option key={i} value={opt.code}>{opt.description}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          <button
                            disabled={!cg1Replace || cg1Done || hasIndividualCoringas}
                            onClick={onApplyCg1}
                            className="px-2 py-1.5 bg-amber-600/20 text-amber-500 border border-amber-600/30 rounded-lg hover:bg-amber-600 hover:text-white transition-all disabled:opacity-50 shrink-0"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* CORINGA 2 / CG2 Row - Similar logic */}
              {(hasCoringa2 || hasCG2) && (
                <div className="space-y-2">
                  <label className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest pl-1">
                    {hasCoringa2 ? 'CORINGA 2' : 'CG2'}
                  </label>
                  <div className="flex gap-2 items-center">
                    {hasCoringa2 && (
                      <>
                        <div className="relative flex-1">
                          <input
                            value={coringa2Acronym}
                            disabled={coringa2Done || hasIndividualCoringas}
                            onChange={(e) => setCoringa2Acronym(e.target.value.toUpperCase())}
                            onKeyDown={(e) => { if (e.key === 'Enter') onCoringaSearch(coringa2Acronym, 2); }}
                            className="w-full bg-background border border-border text-foreground px-2 py-1.5 pr-8 rounded-lg text-[11px] outline-none font-mono disabled:opacity-50"
                          />
                          <button onClick={() => onCoringaSearch(coringa2Acronym, 2)} disabled={coringa2Done || hasIndividualCoringas} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-zinc-400 disabled:opacity-50">
                            <Search className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex-1 min-w-[120px]">
                          <select
                            value={coringa2Selected}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCoringa2Selected(val);
                              if (val && hasCG2) setCg2Replace(val);
                            }}
                            disabled={coringa2Options.length === 0 || coringa2Done || hasIndividualCoringas}
                            className="w-full bg-background border border-border text-foreground px-2 py-1.5 rounded-lg text-[11px] font-mono disabled:opacity-50"
                          >
                            <option value="">Selecione...</option>
                            {coringa2Options.map((opt, i) => (
                              <option key={i} value={opt.code}>{opt.description}</option>
                            ))}
                          </select>
                        </div>
                        <button disabled={!coringa2Selected || coringa2Done || hasIndividualCoringas} onClick={onApplyCoringa2} className="px-2 py-1.5 bg-amber-600/20 text-amber-500 border border-amber-600/30 rounded-lg shrink-0 disabled:opacity-50"><Check className="h-4 w-4" /></button>
                      </>
                    )}
                    {hasCG2 && (
                      <>
                        {hasCoringa2 && <div className="w-px h-6 bg-amber-500/20 shrink-0" />}
                        <div className={`flex gap-2 items-center ${hasCoringa2 ? 'shrink-0' : 'flex-1'}`}>
                          <span className="text-[9px] dark:text-amber-300/60 text-amber-600/70 font-bold uppercase tracking-widest shrink-0">CG2 →</span>
                          {hasCoringa2 ? (
                            <input
                              value={cg2Replace}
                              disabled={cg2Done || hasIndividualCoringas}
                              onChange={(e) => setCg2Replace(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                              className="bg-background border border-border text-foreground px-2 py-1.5 rounded-lg text-[11px] outline-none font-mono w-16 disabled:opacity-50"
                            />
                          ) : (
                            <div className="flex gap-2 w-full">
                              <div className="relative flex-1 max-w-[150px]">
                                <input value={cg2Acronym} disabled={cg2Done || hasIndividualCoringas} onChange={(e) => setCg2Acronym(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === 'Enter') onCoringaSearch(cg2Acronym, 5); }} className="w-full bg-background border border-border text-foreground px-2 py-1.5 pr-8 rounded-lg text-[11px] outline-none font-mono disabled:opacity-50" />
                                <button onClick={() => onCoringaSearch(cg2Acronym, 5)} disabled={cg2Done || hasIndividualCoringas} className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-zinc-400 disabled:opacity-50"><Search className="h-3 w-3" /></button>
                              </div>
                              <select value={cg2Replace} onChange={(e) => setCg2Replace(e.target.value)} disabled={cg2Options.length === 0 || cg2Done || hasIndividualCoringas} className="flex-1 min-w-[120px] bg-background border border-border text-foreground px-2 py-1.5 rounded-lg text-[11px] font-mono disabled:opacity-50">
                                <option value="">Selecione...</option>
                                {cg2Options.map((opt, i) => (
                                  <option key={i} value={opt.code}>{opt.description}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          <button disabled={!cg2Replace || cg2Done || hasIndividualCoringas} onClick={onApplyCg2} className="px-2 py-1.5 bg-amber-600/20 text-amber-500 border border-amber-600/30 rounded-lg shrink-0 disabled:opacity-50"><Check className="h-4 w-4" /></button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
