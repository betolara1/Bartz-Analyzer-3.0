// src/components/ConfigurationScreen.tsx
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { CircleHelp, FolderOpen, Clock, Trash2, Settings, Save, ArrowLeft } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { Switch } from "./ui/switch";

export type FullConfig = {
  entrada: string;
  exportacao: string;
  ok: string;
  erro: string;
  drawings: string;
  simplificado: string;
  enableAutoFix: boolean;

  // Scheduler Options
  schedulerEnabled: boolean;
  schedulerTimes: string;
  schedulerDays: string;

  // Cleanup Options
  cleanupEnabled: boolean;
  cleanupTime: string;
  cleanupRetentionDays: number;
  cleanupCleanOk: boolean;
  cleanupCleanErro: boolean;
};

export type PathConfigKey = "entrada" | "exportacao" | "ok" | "erro" | "drawings" | "simplificado";

export interface PathConfig {
  key: PathConfigKey;
  label: string;
  placeholder: string;
  tooltip: string;
}

export const PATH_CONFIGS: PathConfig[] = [
  {
    key: "entrada",
    label: "Pasta de Entrada",
    placeholder: "\\\\servidor\\orcamentos\\entrada",
    tooltip: "Pasta de entrada onde o sistema irá ler os arquivos XML."
  },
  {
    key: "exportacao",
    label: "Pasta de Relatórios",
    placeholder: "\\\\servidor\\orcamentos\\exportacao",
    tooltip: "Pasta de exportação onde os relatórios gerados serão salvos."
  },
  {
    key: "ok",
    label: "Pasta Arquivos OK",
    placeholder: "\\\\servidor\\orcamentos\\XML_FINAL\\ok",
    tooltip: "Pasta de destino para onde os arquivos XML corretos (sem inconformidades) serão movidos."
  },
  {
    key: "erro",
    label: "Pasta Arquivos Erro",
    placeholder: "\\\\servidor\\orcamentos\\XML_FINAL\\erro",
    tooltip: "Pasta de destino para onde os arquivos XML com erros ou inconformidades serão movidos."
  },
  {
    key: "drawings",
    label: "Pasta de Desenhos",
    placeholder: "\\\\servidor\\desenhos",
    tooltip: "Pasta onde o sistema buscará os desenhos técnicos correspondentes."
  },
  {
    key: "simplificado",
    label: "Pasta XML Simplificado",
    placeholder: "\\\\servidor\\orcamentos\\simplificado",
    tooltip: "Pasta onde será salvo o XML simplificado (somente os itens pais de ITENS_PEDIDO, sem os filhos), gerado automaticamente na primeira análise de cada arquivo."
  }
];

export default function ConfigurationScreen({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<"paths" | "automations">("paths");
  const [form, setForm] = useState<FullConfig>({
    entrada: "",
    exportacao: "",
    ok: "",
    erro: "",
    drawings: "",
    simplificado: "",
    enableAutoFix: true,
    schedulerEnabled: true,
    schedulerTimes: "11:30, 17:30",
    schedulerDays: "seg-sex",
    cleanupEnabled: false,
    cleanupTime: "17:30",
    cleanupRetentionDays: 0,
    cleanupCleanOk: true,
    cleanupCleanErro: true,
  });

  const [testResults, setTestResults] = useState<Record<string, { exist: boolean; write: boolean; error?: string }> | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      const cur = await window.electron?.settings?.load();
      if (cur) {
        setForm((prev) => ({ ...prev, ...cur }));
      }
    })();
  }, []);

  function setVal(key: keyof FullConfig, v: any) {
    setForm((p) => ({ ...p, [key]: v }));
  }

  async function handlePickFolder(key: keyof FullConfig) {
    try {
      const current = form[key] || "";
      const chosen = await window.electron?.settings?.pickFolder(String(current));
      if (chosen) {
        setVal(key, chosen);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleTestPaths() {
    setTesting(true);
    setTestResults(null);
    try {
      const res = await window.electron?.settings?.testPaths(form);
      if (res) {
        setTestResults(res);
      }
    } catch (e: any) {
      alert(`Erro ao testar caminhos: ${e.message || e}`);
    } finally {
      setTesting(false);
    }
  }

  async function handleSalvar() {
    // Validação de horários do agendador
    if (form.schedulerEnabled) {
      const times = form.schedulerTimes.split(",").map((t) => t.trim());
      for (const t of times) {
        if (!/^\d{2}:\d{2}$/.test(t)) {
          alert(`Erro: O horário "${t}" é inválido. Use o formato HH:MM (ex: 11:30).`);
          return;
        }
      }
    }

    // Validação de horário da limpeza
    if (form.cleanupEnabled) {
      if (!/^\d{2}:\d{2}$/.test(form.cleanupTime.trim())) {
        alert(`Erro: O horário da limpeza "${form.cleanupTime}" é inválido. Use o formato HH:MM (ex: 17:30).`);
        return;
      }
    }

    await window.electron?.settings?.save(form);
    alert("Configurações salvas!");
  }

  const PathRow = (props: { label: string; field: keyof FullConfig; placeholder?: string; tooltip: string }) => (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <label className="text-sm opacity-80">{props.label}</label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground/60 hover:text-foreground transition-colors cursor-help">
              <CircleHelp className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="bg-popover text-popover-foreground border border-border p-2 shadow-md max-w-xs">
            <p>{props.tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={String(form[props.field] || "")}
          onChange={(e) => setVal(props.field, e.target.value)}
          placeholder={props.placeholder}
          className="bg-[#151515] border-[#2C2C2C] w-[680px]"
        />
        <Button
          variant="outline"
          onClick={() => handlePickFolder(props.field)}
          className="border-[#2C2C2C] bg-[#151515] hover:bg-[#252525] hover:text-white shrink-0 h-9"
          title="Selecionar pasta"
        >
          <FolderOpen className="h-4 w-4 text-gray-400" />
        </Button>
      </div>
      {testResults && testResults[props.field] && (
        <div className="text-xs mt-1">
          {testResults[props.field].write ? (
            <span className="text-green-400">✓ Conexão estabelecida e pasta gravável.</span>
          ) : (
            <span className="text-red-400">
              ✗ Falha: {testResults[props.field].exist ? "Sem permissão de gravação" : "Diretório não encontrado"}{" "}
              {testResults[props.field].error && `(${testResults[props.field].error})`}
            </span>
          )}
        </div>
      )}
    </div>
  );

  const renderPaths = () => (
    <div className="space-y-5 bg-[#111] border border-[#2C2C2C] rounded-xl p-6 max-w-[920px]">
      {PATH_CONFIGS.map((config) => (
        <PathRow
          key={config.key}
          label={config.label}
          field={config.key}
          placeholder={config.placeholder}
          tooltip={config.tooltip}
        />
      ))}
    </div>
  );

  const renderAutomations = () => (
    <div className="space-y-6 max-w-[920px]">
      {/* Bloco 1: Auto-Fix Geral */}
      <div className="bg-[#111] border border-[#2C2C2C] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-[#2C2C2C] pb-3 mb-1">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-white">
              <Settings className="h-4 w-4 text-emerald-400" />
              Robô Auto-Fix
            </h3>
            <p className="text-xs text-muted-foreground">Regula o comportamento automático de correção dos arquivos.</p>
          </div>
          <Switch
            checked={form.enableAutoFix}
            onCheckedChange={(val) => setVal("enableAutoFix", val)}
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {form.enableAutoFix
            ? "O robô irá tentar corrigir automaticamente as cores coringas, itens sem cadastro e tamanhos de chapas nos XMLs de entrada."
            : "O sistema irá apenas identificar e alertar sobre inconformidades, sem alterar os arquivos."}
        </div>
      </div>

      {/* Bloco 2: Agendador de Relatórios */}
      <div className="bg-[#111] border border-[#2C2C2C] rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-[#2C2C2C] pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-white">
              <Clock className="h-4 w-4 text-yellow-500" />
              Agendamento de Relatórios
            </h3>
            <p className="text-xs text-muted-foreground">Exporta relatórios do histórico em CSV para a pasta configurada.</p>
          </div>
          <Switch
            checked={form.schedulerEnabled}
            onCheckedChange={(val) => setVal("schedulerEnabled", val)}
          />
        </div>

        {form.schedulerEnabled && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold text-gray-300">Horários de Exportação</label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground/60 hover:text-foreground transition-colors cursor-help">
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-popover text-popover-foreground border border-border p-2 shadow-md max-w-xs">
                    <p>Insira horários no formato HH:MM separados por vírgula (ex: 11:30, 17:30).</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                value={form.schedulerTimes}
                onChange={(e) => setVal("schedulerTimes", e.target.value)}
                placeholder="11:30, 17:30"
                className="bg-[#151515] border-[#2C2C2C] w-full"
              />
              <p className="text-[10px] text-muted-foreground">Formato de 24 horas, separados por vírgula.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300">Dias de Funcionamento</label>
              <select
                value={form.schedulerDays}
                onChange={(e) => setVal("schedulerDays", e.target.value)}
                className="flex h-9 w-full rounded-md border border-[#2C2C2C] bg-[#151515] px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring text-white"
              >
                <option value="seg-sex">Segunda a Sexta-feira</option>
                <option value="seg-sab">Segunda a Sábado</option>
                <option value="todos">Todos os dias</option>
              </select>
              <p className="text-[10px] text-muted-foreground">Controla em quais dias os relatórios serão agendados.</p>
            </div>
          </div>
        )}
      </div>

      {/* Bloco 3: Rotina de Limpeza */}
      <div className="bg-[#111] border border-[#2C2C2C] rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between border-b border-[#2C2C2C] pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-white">
              <Trash2 className="h-4 w-4 text-red-500" />
              Rotina de Limpeza Automática
            </h3>
            <p className="text-xs text-muted-foreground">Remove arquivos das pastas de destino para liberar espaço na rede.</p>
          </div>
          <Switch
            checked={form.cleanupEnabled}
            onCheckedChange={(val) => setVal("cleanupEnabled", val)}
          />
        </div>

        {form.cleanupEnabled && (
          <div className="space-y-5 pt-1">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300">Horário da Limpeza</label>
                <Input
                  value={form.cleanupTime}
                  onChange={(e) => setVal("cleanupTime", e.target.value)}
                  placeholder="17:30"
                  className="bg-[#151515] border-[#2C2C2C] w-full"
                />
                <p className="text-[10px] text-muted-foreground">Formato HH:MM (ex: 17:30).</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-semibold text-gray-300">Dias de Retenção</label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground/60 hover:text-foreground transition-colors cursor-help">
                        <CircleHelp className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="bg-popover text-popover-foreground border border-border p-2 shadow-md max-w-xs">
                      <p>Escolha 0 para excluir os arquivos no mesmo dia. Se configurado com 3, por exemplo, apagará apenas arquivos com mais de 3 dias de criação.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  type="number"
                  min={0}
                  value={form.cleanupRetentionDays}
                  onChange={(e) => setVal("cleanupRetentionDays", parseInt(e.target.value) || 0)}
                  className="bg-[#151515] border-[#2C2C2C] w-full"
                />
                <p className="text-[10px] text-muted-foreground">Idade mínima do arquivo (em dias).</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300">Pastas para Limpar</label>
                <div className="flex flex-col gap-2 pt-1.5">
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.cleanupCleanOk}
                      onChange={(e) => setVal("cleanupCleanOk", e.target.checked)}
                      className="rounded border-[#2C2C2C] bg-[#151515] text-yellow-600 focus:ring-yellow-500 h-4 w-4"
                    />
                    Limpar Pasta OK (Sucessos)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.cleanupCleanErro}
                      onChange={(e) => setVal("cleanupCleanErro", e.target.checked)}
                      className="rounded border-[#2C2C2C] bg-[#151515] text-yellow-600 focus:ring-yellow-500 h-4 w-4"
                    />
                    Limpar Pasta Erro (Inconformidades)
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="p-6 text-white min-h-screen bg-background">
      <div className="mb-4">
        <Button variant="outline" onClick={onBack} className="gap-2 text-gray-300 hover:text-white border-[#2C2C2C] hover:bg-muted bg-[#111]">
          <ArrowLeft className="h-4 w-4" /> Voltar ao Dashboard
        </Button>
      </div>

      <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
        <Settings className="h-6 w-6 text-yellow-500" />
        Configurações Gerais
      </h2>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#2C2C2C] mb-6 max-w-[920px]">
        <button
          onClick={() => setActiveTab("paths")}
          className={`px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === "paths"
              ? "border-yellow-500 text-yellow-500 font-bold"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          <FolderOpen className="h-4 w-4" /> Caminhos UNC
        </button>
        <button
          onClick={() => setActiveTab("automations")}
          className={`px-4 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px flex items-center gap-2 ${
            activeTab === "automations"
              ? "border-yellow-500 text-yellow-500 font-bold"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          <Clock className="h-4 w-4" /> Automação & Agendamentos
        </button>
      </div>

      {/* Contens */}
      <div className="mb-6">
        {activeTab === "paths" ? renderPaths() : renderAutomations()}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-3 pt-2 max-w-[920px] border-t border-[#2C2C2C] mt-6">
        <Button onClick={handleSalvar} className="bg-yellow-600 hover:bg-yellow-500 text-white font-semibold flex items-center gap-2 h-9 px-4">
          <Save className="h-4 w-4" /> Salvar Configurações
        </Button>
        {activeTab === "paths" && (
          <Button
            variant="outline"
            disabled={testing}
            onClick={handleTestPaths}
            className="border-gray-600/30 hover:bg-muted text-white font-semibold bg-[#111] h-9 px-4"
          >
            {testing ? "Testando..." : "Testar Acesso a Pastas"}
          </Button>
        )}
      </div>
    </div>
  );
}
