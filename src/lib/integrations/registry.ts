import type { IntegrationConnector } from "@/lib/integrations/types";

const connectors: IntegrationConnector[] = [
  {
    key: "zatca",
    nameKey: "integrations.connector.zatca",
    descriptionKey: "integrations.connector.zatcaDesc",
    supports: { test: true, sync: true, mapping: true },
  },
  {
    key: "gosi",
    nameKey: "integrations.connector.gosi",
    descriptionKey: "integrations.connector.gosiDesc",
    supports: { test: true, sync: true },
  },
  {
    key: "mudad",
    nameKey: "integrations.connector.mudad",
    descriptionKey: "integrations.connector.mudadDesc",
    supports: { test: true, sync: true },
  },
  {
    key: "custom",
    nameKey: "integrations.connector.custom",
    descriptionKey: "integrations.connector.customDesc",
    supports: { test: true, sync: true },
  },
];

export function listConnectors() {
  return connectors;
}

export function getConnector(key: string) {
  return connectors.find((connector) => connector.key === key) ?? null;
}
