export type IntegrationConnectorKey = "zatca" | "gosi" | "mudad" | "custom";

export type IntegrationTestResult = {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
};

export type IntegrationConnector = {
  key: IntegrationConnectorKey;
  nameKey: string;
  descriptionKey: string;
  supports: {
    test: boolean;
    sync: boolean;
    mapping?: boolean;
  };
  test?: (payload: {
    config: Record<string, unknown>;
    credentials: Record<string, unknown>;
  }) => Promise<IntegrationTestResult>;
};
