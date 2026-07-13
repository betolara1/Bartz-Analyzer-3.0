export type Status = "OK" | "ERRO" | "FERRAGENS-ONLY" | "FERRAGENS";

export interface Row {
  id?: string;
  filename: string;
  fullpath: string;
  status?: Status;
  errors?: string[];
  autoFixes?: string[];
  warnings?: string[];
  tags?: string[];
  timestamp?: string;
  timestampMs?: number;
  meta?: {
    ferragensOnly?: boolean;
    machines?: Array<{ id?: string; name?: string }>;
    [k: string]: any;
  };
  initialStatus?: Status;
  history?: string[];
  initialErrors?: string[];
}

export interface ProcessResult {
  arquivo: string;
  status: 'ok' | 'erro' | 'FERRAGENS-ONLY';
  erros: string[];
  avisos: string[];
  autoFix: string[];
  tags: string[];
}

export interface FileData {
  id?: string;
  filename: string;
  status: 'OK' | 'ERRO' | 'FERRAGENS';
  errors: any[];
  autoFixes: string[];
  warnings: string[];
  timestamp: string;
}
