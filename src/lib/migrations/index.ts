import type { Migration } from "@/lib/migrations/types";
import encryptSensitiveData from "@/lib/migrations/2026-01-27-encrypt-sensitive-data";
import encryptIntegrationCredentials from "@/lib/migrations/2026-06-20-encrypt-integration-credentials";

export const MIGRATIONS: Migration[] = [encryptSensitiveData, encryptIntegrationCredentials];

export function getMigrationById(migrationId: string) {
  return MIGRATIONS.find((migration) => migration.id === migrationId) ?? null;
}
