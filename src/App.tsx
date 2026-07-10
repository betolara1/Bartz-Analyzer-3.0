// src/App.tsx
import { useState, useEffect } from "react";
import Dashboard from "./components/Dashboard";
import ConfigurationScreen from "./components/ConfigurationScreen";
import { Toaster, toast } from "sonner";

export default function App() {
  const [screen, setScreen] = useState<'dash' | 'cfg'>('dash');

  useEffect(() => {
    if (window.electron?.updater) {
      window.electron.updater.onUpdateAvailable((info) => {
        toast.info(`Atualização ${info?.version || ''} encontrada!`, {
          description: "Deseja fazer o download agora?",
          action: {
            label: "Baixar",
            onClick: () => {
              toast.loading("Baixando atualização... 0%", { id: "update-progress" });
              window.electron?.updater?.startDownload();
            }
          },
          duration: 999999,
        });
      });

      window.electron.updater.onUpdateProgress((progressObj) => {
        const percent = Math.round(progressObj.percent || 0);
        toast.loading(`Baixando atualização... ${percent}%`, { id: "update-progress" });
      });

      window.electron.updater.onUpdateDownloaded((info) => {
        toast.success("Download concluído!", {
          id: "update-progress",
          description: `Versão ${info?.version || ''} pronta para ser instalada.`,
          action: {
            label: "Reiniciar e Atualizar",
            onClick: () => window.electron?.updater?.installUpdate()
          },
          duration: 999999,
        });
      });

      window.electron.updater.onUpdateNotAvailable((info) => {
        toast.info("Você já possui a versão mais recente.", {
          description: `Versão atual: ${info?.version || ''}`
        });
      });

      window.electron.updater.onUpdateError((err) => {
        toast.error(`Erro na atualização: ${err}`, { id: "update-progress" });
      });
    }
  }, []);

  return (
    <>
      {screen === 'dash'
        ? <Dashboard onNavigateToConfig={() => setScreen('cfg')} />
        : <ConfigurationScreen onBack={() => setScreen('dash')} />}
      <Toaster position="bottom-left" richColors closeButton />
    </>
  );
}
