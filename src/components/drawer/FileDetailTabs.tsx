import React from "react";
import {
  Eye,
  Boxes,
  Wrench,
  Stethoscope,
  FolderOpen,
  Clock,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { Row } from "../../types";
import { useFileActions } from "../../hooks/useFileActions";

// Sub-components
import { InfoSection } from "./InfoSection";
import { ErrorWarningSection } from "./ErrorWarningSection";
import { MachineSection } from "./MachineSection";
import { ImportKeySection } from "./ImportKeySection";
import { OrderInfoSection } from "./OrderInfoSection";
import { SpecialItemsSection } from "./SpecialItemsSection";
import { MuxarabiSection } from "./MuxarabiSection";
import { Es08Section } from "./Es08Section";
import { ErpSearchSection } from "./ErpSearchSection";
import { CoringaSection } from "./CoringaSection";
import { PendingRefSection } from "./PendingRefSection";
import { SemFilhoSection } from "./SemFilhoSection";

type TabKey = "overview" | "components" | "actions" | "diagnostics";

interface TabDef {
  key: TabKey;
  label: string;
  icon: React.ReactNode;
}

interface FileDetailTabsProps {
  data: Row | null;
  actions: ReturnType<typeof useFileActions>;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

export function FileDetailTabs({ data, actions, activeTab, onTabChange }: FileDetailTabsProps) {
  const hasCG1 = !!data?.meta?.cg1_detected;
  const hasCG2 = !!data?.meta?.cg2_detected;
  const hasCoringa1 = !!data?.meta?.coringa1_detected;
  const hasCoringa2 = !!data?.meta?.coringa2_detected;
  const hasRefError = (data?.errors ?? []).some(er => String(er).toUpperCase().includes("ITEM SEM CÓDIGO"));
  const hasCoringaMatches = (data?.meta?.coringaMatches?.length || 0) > 0;
  const hasReferenciaEmpty = (data?.meta?.referenciaEmpty?.length || 0) > 0;

  const hasActions = hasCoringaMatches ||
    hasRefError ||
    actions.filteredCoringaMatches.length > 0 ||
    hasCG1 || hasCG2 || hasCoringa1 || hasCoringa2 ||
    hasReferenciaEmpty;

  const hasSemFilho = !!data?.tags?.includes('sem_filho');
  const hasEs08 = (data?.meta?.es08Matches || []).length > 0;
  const hasSpecialItems = (data?.meta?.specialItems || []).length > 0;
  const hasMuxarabi = (data?.meta?.muxarabiItems || []).length > 0;
  const hasComponents = hasSemFilho || hasEs08 || hasSpecialItems || hasMuxarabi;

  const tabs: TabDef[] = [
    { key: "overview", label: "Visão Geral", icon: <Eye className="h-3.5 w-3.5" /> },
    ...(hasComponents ? [{ key: "components", label: "Componentes", icon: <Boxes className="h-3.5 w-3.5" /> } as TabDef] : []),
    ...(hasActions ? [{ key: "actions", label: "Ações Manuais", icon: <Wrench className="h-3.5 w-3.5" /> } as TabDef] : []),
  ];

  // If actions tab is active but no longer available, switch to overview
  React.useEffect(() => {
    if (activeTab === "actions" && !hasActions) {
      onTabChange("overview");
    }
  }, [hasActions, activeTab, onTabChange]);

  // If components tab is active but no longer available, switch to overview
  React.useEffect(() => {
    if (activeTab === "components" && !hasComponents) {
      onTabChange("overview");
    }
  }, [hasComponents, activeTab, onTabChange]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Tab Bar */}
      <div className="shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-1 px-6 pt-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`
                  fd-tab relative flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-widest
                  transition-all duration-200 rounded-t-lg border border-transparent
                  ${isActive
                    ? "bg-muted text-foreground border-border border-b-transparent -mb-px z-10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }
                `}
              >
                <span className={isActive ? "text-emerald-400" : ""}>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {isActive && (
                  <div className="absolute bottom-0 left-3 right-3 h-[2px] bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-card">
        <div className="p-6 space-y-6 pb-20 fd-tab-content">
          {activeTab === "overview" && (
            <OverviewTab data={data} actions={actions} />
          )}
          {activeTab === "components" && (
            <ComponentsTab data={data} actions={actions} />
          )}
          {activeTab === "actions" && (
            <ActionsTab data={data} actions={actions} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── TAB: Visão Geral ─── */
function OverviewTab({ data, actions }: { data: Row | null; actions: ReturnType<typeof useFileActions> }) {
  return (
    <div className="space-y-6">
      <InfoSection
        data={data}
        onReprocess={actions.handleReprocess}
        onOpenFolder={actions.handleOpenFolder}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Coluna da Esquerda */}
        <div className="space-y-6">
          <ErrorWarningSection data={data} onMoveToOk={actions.handleMoveToOk} />
          <ImportKeySection data={data} />
        </div>

        {/* Coluna da Direita */}
        <div className="space-y-6">
          <MachineSection data={data} />
          <OrderInfoSection
            isOpen={actions.orderInfoOpen}
            onToggle={() => {
              const next = !actions.orderInfoOpen;
              actions.setOrderInfoOpen(next);
              if (next && actions.orderComments.length === 0) actions.fetchOrderComments();
            }}
            loading={actions.loadingComments}
            comments={actions.orderComments}
            onFetch={actions.fetchOrderComments}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── TAB: Componentes ─── */
function ComponentsTab({ data, actions }: { data: Row | null; actions: ReturnType<typeof useFileActions> }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <div className="lg:col-span-2">
        <SemFilhoSection
          isOpen={actions.semFilhoOpen}
          onToggle={() => actions.setSemFilhoOpen(!actions.semFilhoOpen)}
          data={data}
          isResolved={actions.resolvedProblems.has('sem_filho')}
          otherPendingCount={actions.unresolvedProblems.filter(p => p !== 'sem_filho').length}
          onResolve={() => actions.resolveAndMaybeMove('sem_filho')}
        />
      </div>
      <div className="lg:col-span-2">
        <Es08Section
          isOpen={actions.es08Open}
          onToggle={() => actions.setEs08Open(!actions.es08Open)}
          data={data}
          uniqueDrawings={actions.uniqueDrawings}
          dxfSearching={actions.dxfSearching}
          dxfResults={actions.dxfResults}
          dxfFixing={actions.dxfFixing}
          onSearchAll={actions.searchAllDrawings}
          onFix={actions.fixFresa37to18}
          onMoveToOk={actions.handleMoveToOk}
          onOpenConfirmMove={() => actions.setConfirmMoveOpen(true)}
          onOpenConfirmMoveOk={() => actions.setConfirmMoveOkOpen(true)}
          isResolved={actions.resolvedProblems.has('es08')}
          otherPendingCount={actions.unresolvedProblems.filter(p => p !== 'es08').length}
          onResolve={() => actions.resolveAndMaybeMove('es08')}
        />
      </div>
      <div className="lg:col-span-2">
        <SpecialItemsSection
          isOpen={actions.specialItemsOpen}
          onToggle={() => actions.setSpecialItemsOpen(!actions.specialItemsOpen)}
          data={data}
        />
      </div>
      <MuxarabiSection
        isOpen={actions.muxarabiOpen}
        onToggle={() => actions.setMuxarabiOpen(!actions.muxarabiOpen)}
        data={data}
      />
    </div>
  );
}

/* ─── TAB: Ações Manuais ─── */
function ActionsTab({ data, actions }: { data: Row | null; actions: ReturnType<typeof useFileActions> }) {
  const hasCG1 = !!data?.meta?.cg1_detected;
  const hasCG2 = !!data?.meta?.cg2_detected;
  const hasCoringa1 = !!data?.meta?.coringa1_detected;
  const hasCoringa2 = !!data?.meta?.coringa2_detected;
  const showCoringa = actions.filteredCoringaMatches.length > 0 || hasCG1 || hasCG2 || hasCoringa1 || hasCoringa2;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <div className="lg:col-span-2">
        <OrderInfoSection
          isOpen={actions.orderInfoOpen}
          onToggle={() => {
            const next = !actions.orderInfoOpen;
            actions.setOrderInfoOpen(next);
            if (next && actions.orderComments.length === 0) actions.fetchOrderComments();
          }}
          loading={actions.loadingComments}
          comments={actions.orderComments}
          onFetch={actions.fetchOrderComments}
        />
      </div>
      <ErpSearchSection
        isOpen={actions.erpSearchOpen}
        onToggle={() => {
          const nextState = !actions.erpSearchOpen;
          actions.setErpSearchOpen(nextState);
          actions.setCoringaOpen(nextState);
        }}
        data={data}
        erpSearchCode={actions.erpSearchCode}
        setErpSearchCode={actions.setErpSearchCode}
        erpSearchDesc={actions.erpSearchDesc}
        setErpSearchDesc={actions.setErpSearchDesc}
        erpSearchType={actions.erpSearchType}
        setErpSearchType={actions.setErpSearchType}
        erpSearching={actions.erpSearching}
        erpSearchResults={actions.erpSearchResults}
        onSearch={actions.handleErpSearch}
        onSelectCode={(code) => {
          if (actions.filteredCoringaMatches.length > 0) {
            actions.setIndCoringaAcronym(code);
            actions.setCoringaTo(code);
          }
          const showRefPanel = ((data?.meta?.referenciaEmpty?.length ?? 0) > 0 || (data?.errors ?? []).some(er => String(er).toUpperCase().includes("ITEM SEM CÓDIGO")));
          if (showRefPanel) {
            actions.setRefFillValue(code);
          }
          toast.success(`Código "${code}" selecionado`);
        }}
      />
      <CoringaSection
        isOpen={actions.coringaOpen}
        onToggle={() => {
          const nextState = !actions.coringaOpen;
          actions.setErpSearchOpen(nextState);
          actions.setCoringaOpen(nextState);
        }}
        data={data}
        coringaFrom={actions.coringaFrom}
        setCoringaFrom={actions.setCoringaFrom}
        coringaTo={actions.coringaTo}
        setCoringaTo={actions.setCoringaTo}
        indCoringaAcronym={actions.indCoringaAcronym}
        setIndCoringaAcronym={actions.setIndCoringaAcronym}
        indCoringaSearching={actions.indCoringaSearching}
        indCoringaOptions={actions.indCoringaOptions}
        onCoringaSearch={actions.handleCoringaSearch}
        onApplyCoringa={() => actions.setConfirmCoringaOpen(true)}
        isReplacing={actions.isReplacing}
        lastReplace={actions.lastReplace}
        filteredCoringaMatches={actions.filteredCoringaMatches}
        coringa1Acronym={actions.coringa1Acronym}
        setCoringa1Acronym={actions.setCoringa1Acronym}
        coringa1Searching={actions.coringa1Searching}
        coringa1Options={actions.coringa1Options}
        coringa1Selected={actions.coringa1Selected}
        setCoringa1Selected={actions.setCoringa1Selected}
        coringa1Done={actions.coringa1Done}
        onApplyCoringa1={actions.onApplyCoringa1}
        coringa2Acronym={actions.coringa2Acronym}
        setCoringa2Acronym={actions.setCoringa2Acronym}
        coringa2Searching={actions.coringa2Searching}
        coringa2Options={actions.coringa2Options}
        coringa2Selected={actions.coringa2Selected}
        setCoringa2Selected={actions.setCoringa2Selected}
        coringa2Done={actions.coringa2Done}
        onApplyCoringa2={actions.onApplyCoringa2}
        cg1Acronym={actions.cg1Acronym}
        setCg1Acronym={actions.setCg1Acronym}
        cg1Searching={actions.cg1Searching}
        cg1Options={actions.cg1Options}
        cg1Replace={actions.cg1Replace}
        setCg1Replace={actions.setCg1Replace}
        cg1Done={actions.cg1Done}
        onApplyCg1={actions.onApplyCg1}
        cg2Acronym={actions.cg2Acronym}
        setCg2Acronym={actions.setCg2Acronym}
        cg2Searching={actions.cg2Searching}
        cg2Options={actions.cg2Options}
        cg2Replace={actions.cg2Replace}
        setCg2Replace={actions.setCg2Replace}
        cg2Done={actions.cg2Done}
        onApplyCg2={actions.onApplyCg2}
      />
      <PendingRefSection
        isOpen={actions.pendingRefOpen}
        onToggle={() => actions.setPendingRefOpen(!actions.pendingRefOpen)}
        data={data}
        selectedRefSingle={actions.selectedRefSingle}
        setSelectedRefSingle={actions.setSelectedRefSingle}
        refFillValue={actions.refFillValue}
        setRefFillValue={actions.setRefFillValue}
        onConfirm={() => actions.setConfirmRefOpen(true)}
      />
    </div>
  );
}

export type { TabKey };
