export {};

declare global {
  interface Window {
    electron?: {
      analyzer?: {
        start: (cfg?: any) => Promise<boolean>;
        stop: () => Promise<boolean>;
        scanOnce: () => Promise<boolean>;
        onEvent: (cb: (msg: any) => void) => void;
        openInFolder: (fullOrBasePath: string) => Promise<boolean>;
        reprocessOne: (fullOrBasePath: string) => Promise<boolean>;
        openDrawing?: (drawingCode: string) => Promise<{ ok: boolean; path?: string; message?: string }>;
        openMuxarabiDrawing?: (sizeCode: string) => Promise<{ ok: boolean; path?: string; message?: string }>;
        injectMuxarabi?: (drawingCode: string, sizeCode: string, thickness?: string) => Promise<{ ok: boolean; path?: string; message?: string; injectedCount?: number; totalInTemplate?: number; pieceDimensions?: string; thickness?: string; layer?: string }>;
      };
      settings?: {
        load: () => Promise<any>;
        save: (data: any) => Promise<any>;
        testPaths: (data: any) => Promise<any>;
        pickFolder: (initial?: string) => Promise<string | null>;
      };
      updater?: {
        onUpdateAvailable: (cb: (info: any) => void) => void;
        onUpdateProgress: (cb: (progress: any) => void) => void;
        onUpdateDownloaded: (cb: (info: any) => void) => void;
        startDownload: () => Promise<void>;
        installUpdate: () => Promise<void>;
      };
    };
  }
}
