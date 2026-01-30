import type { Migration } from "@/lib/migrations/types";
import encryptSensitiveData from "@/lib/migrations/2026-01-27-encrypt-sensitive-data";

export const MIGRATIONS: Migration[] = [encryptSensitiveData];

export function getMigrationById(migrationId: string) {
  return MIGRATIONS.find((migration) => migration.id === migrationId) ?? null;
}
