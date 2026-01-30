import { z } from "zod";

const connectorSchema = z.enum(["zatca", "gosi", "mudad", "custom"]);
const statusSchema = z.enum(["inactive", "active", "error"]);
const environmentSchema = z.enum(["sandbox", "production"]);

export const integrationSchema = z.object({
  companyId: z.string().min(1),
  connector: connectorSchema,
  name: z.string().min(1),
  environment: environmentSchema.optional().default("sandbox"),
  status: statusSchema.optional().default("inactive"),
  config: z.record(z.unknown()).optional().default({}),
  credentials: z.record(z.unknown()).optional().default({}),
});

export const integrationUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  environment: environmentSchema.optional(),
  status: statusSchema.optional(),
  config: z.record(z.unknown()).optional(),
  credentials: z.record(z.unknown()).optional(),
});
