export type MigrationResult = {
  scanned: number;
  updated: number;
  notes?: string[];
};

export type MigrationContext = {
  dryRun: boolean;
  log: (message: string) => void;
};

export type Migration = {
  id: string;
  title: string;
  description: string;
  up: (context: MigrationContext) => Promise<MigrationResult>;
};
