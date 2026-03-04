import { promises as fs } from "node:fs";
import path from "node:path";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, "src", "app", "api");
const DATA_DIR = path.join(ROOT, "src", "lib", "data");
const VALIDATORS_DIR = path.join(ROOT, "src", "lib", "validators");
const DOCS_DIR = path.join(ROOT, "docs", "developer");
const API_KEYS_FILE = path.join(ROOT, "src", "lib", "data", "api-keys.ts");

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function toApiPath(filePath) {
  const relative = toPosix(path.relative(API_DIR, filePath));
  const withoutSuffix = relative.replace(/\/route\.ts$/, "");
  return `/api/${withoutSuffix}`.replace(/\[(.+?)\]/g, "{$1}");
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(fullPath);
      }
      return [fullPath];
    })
  );
  return files.flat();
}

function csvEscape(value) {
  const raw = value ?? "";
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, "\"\"")}"`;
  }
  return raw;
}

function extractImportMap(source) {
  const map = new Map();
  const importRegex =
    /import\s+{([^}]+)}\s+from\s+["']@\/lib\/validators\/([^"']+)["'];/g;
  for (const match of source.matchAll(importRegex)) {
    const symbols = match[1]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.split(/\s+as\s+/i)[0]?.trim())
      .filter(Boolean);
    const filePath = `src/lib/validators/${match[2]}.ts`;
    for (const symbol of symbols) {
      map.set(symbol, filePath);
    }
  }
  return map;
}

function extractMethods(source) {
  const methods = new Set();
  for (const match of source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)) {
    methods.add(match[1]);
  }
  for (const match of source.matchAll(/as\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g)) {
    methods.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*=/g)) {
    methods.add(match[1]);
  }
  return HTTP_METHODS.filter((method) => methods.has(method));
}

function extractRequireCalls(source) {
  const calls = new Set();
  for (const match of source.matchAll(/\b(require[A-Za-z0-9_]+)\(/g)) {
    calls.add(match[1]);
  }
  return Array.from(calls).sort();
}

function extractAuthMode(source) {
  if (source.includes("authenticateApiKey(")) {
    return "api_key_bearer";
  }
  const requireCalls = extractRequireCalls(source);
  if (requireCalls.some((name) => name.startsWith("requireSystem"))) {
    return "system_session";
  }
  if (source.includes("getSessionUser(") || source.includes("getServerSession(")) {
    return "session_cookie";
  }
  if (requireCalls.length > 0) {
    return "guarded";
  }
  return "public_or_system";
}

function extractGuards(source) {
  return extractRequireCalls(source);
}

function extractSchemas(source) {
  const schemas = new Set();
  for (const match of source.matchAll(/([A-Za-z0-9_]+)\.safeParse\(/g)) {
    schemas.add(match[1]);
  }
  return Array.from(schemas).sort();
}

function extractFormats(source) {
  const formats = new Set(["json"]);
  if (source.includes("text/csv")) {
    formats.add("csv");
  }
  if (source.includes("application/pdf")) {
    formats.add("pdf");
  }
  return Array.from(formats).sort();
}

function extractPathParams(apiPath) {
  const params = [];
  for (const match of apiPath.matchAll(/\{([^}]+)\}/g)) {
    params.push(match[1]);
  }
  return Array.from(new Set(params)).sort();
}

function extractQueryParams(source) {
  const params = [];
  for (const match of source.matchAll(/searchParams\.(?:get|has)\((["'])([^"']+)\1\)/g)) {
    params.push(match[2]);
  }
  return Array.from(new Set(params)).sort();
}

function extractStatusCodes(source) {
  const codes = [];
  for (const match of source.matchAll(/status\s*:\s*(\d{3})/g)) {
    codes.push(match[1]);
  }
  return Array.from(new Set(codes)).sort((a, b) => Number(a) - Number(b));
}

function inferOperationPurpose(method, apiPath) {
  const lowerPath = apiPath.toLowerCase();
  if (lowerPath.includes("/export")) {
    return "Export data";
  }
  if (lowerPath.includes("/import")) {
    return "Import or upload data";
  }
  if (lowerPath.includes("/approve")) {
    return "Approve entity workflow state";
  }
  if (lowerPath.includes("/cancel")) {
    return "Cancel entity workflow state";
  }
  if (lowerPath.includes("/issue")) {
    return "Issue or finalize document";
  }
  if (lowerPath.includes("/send")) {
    return "Dispatch communication or document";
  }
  if (lowerPath.includes("/sync")) {
    return "Run integration synchronization";
  }
  if (lowerPath.includes("/test")) {
    return "Run connection or validation test";
  }
  if (lowerPath.includes("/report")) {
    return "Generate report data";
  }
  if (method === "GET") {
    return "Read data";
  }
  if (method === "POST") {
    return "Create or execute action";
  }
  if (method === "PUT" || method === "PATCH") {
    return "Update existing data";
  }
  if (method === "DELETE") {
    return "Delete or revoke data";
  }
  return "Operation";
}

function markdownEscape(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

function joinOrDash(values, separator = ", ") {
  if (!values || values.length === 0) {
    return "-";
  }
  return values.join(separator);
}

function lineDepthDelta(line) {
  let delta = 0;
  let inString = false;
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const prev = line[index - 1];
    if (inString) {
      if (char === quote && prev !== "\\") {
        inString = false;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === "{" || char === "[" || char === "(") {
      delta += 1;
      continue;
    }
    if (char === "}" || char === "]" || char === ")") {
      delta -= 1;
    }
  }
  return delta;
}

function extractTopLevelObjectFields(objectBody) {
  const fields = [];
  let depth = 0;
  for (const line of objectBody.split("\n")) {
    const trimmed = line.trim();
    if (depth === 0) {
      const match = trimmed.match(/^([A-Za-z0-9_]+)\s*:/);
      if (match) {
        fields.push(match[1]);
      }
    }
    depth += lineDepthDelta(line);
    if (depth < 0) {
      depth = 0;
    }
  }
  return Array.from(new Set(fields));
}

function readBalancedObject(source, startIndex) {
  const openIndex = source.indexOf("{", startIndex);
  if (openIndex === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let quote = "";
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const prev = source[index - 1];
    if (inString) {
      if (char === quote && prev !== "\\") {
        inString = false;
      }
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex + 1, index);
      }
    }
  }
  return null;
}

function extractObjectSchemas(source, exportOnly = false) {
  const schemas = new Map();
  const regex = exportOnly
    ? /export\s+const\s+([A-Za-z0-9_]+)\s*=\s*z\.object\(/g
    : /const\s+([A-Za-z0-9_]+)\s*=\s*z\.object\(/g;

  for (const match of source.matchAll(regex)) {
    const schemaName = match[1];
    const body = readBalancedObject(source, match.index);
    if (!body) {
      continue;
    }
    schemas.set(schemaName, extractTopLevelObjectFields(body));
  }
  return schemas;
}

function collectionNameFromField(fieldName) {
  const map = {
    companyId: "companies",
    userId: "users",
    employeeId: "employees",
    customerId: "customers",
    vendorId: "vendors",
    invoiceId: "sales_invoices",
    billId: "purchase_bills",
    accountId: "chart_accounts",
    paymentTermId: "payment_terms",
    departmentId: "departments",
    positionId: "positions",
    runId: "payroll_runs",
    itemId: "items",
    keyId: "api_keys",
    membershipId: "memberships",
    ticketId: "support_tickets",
    categoryId: "expense_categories",
    integrationId: "integrations",
  };
  if (map[fieldName]) {
    return map[fieldName];
  }
  if (!fieldName.endsWith("Id")) {
    return null;
  }
  const base = fieldName.slice(0, -2);
  const snake = base.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return snake.endsWith("s") ? snake : `${snake}s`;
}

function extractTypeBlocks(source) {
  const blocks = [];
  for (const match of source.matchAll(/export\s+type\s+([A-Za-z0-9_]+)\s*=\s*{([\s\S]*?)};/g)) {
    const typeName = match[1];
    const body = match[2];
    const fields = [];
    for (const fieldMatch of body.matchAll(/^\s*([A-Za-z0-9_]+)\??:\s*([^;]+);/gm)) {
      const normalizedType = fieldMatch[2].replace(/\s+/g, " ").trim();
      fields.push({ name: fieldMatch[1], type: normalizedType });
    }
    blocks.push({ typeName, fields });
  }
  return blocks;
}

function pickPrimaryType(typeBlocks) {
  if (typeBlocks.length === 0) {
    return null;
  }
  const scored = typeBlocks.map((block) => {
    let score = block.fields.length;
    if (block.typeName.endsWith("Record")) {
      score += 20;
    }
    if (block.fields.some((field) => field.name === "id")) {
      score += 10;
    }
    if (block.fields.some((field) => field.name === "companyId")) {
      score += 5;
    }
    return { score, block };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.block ?? null;
}

function toSnakeCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/__/g, "_")
    .toLowerCase();
}

function collectionForTypeName(typeName) {
  const trimmed = typeName
    .replace(/Record$/, "")
    .replace(/Status$/, "")
    .replace(/Entry$/, "")
    .replace(/Item$/, "");
  const snake = toSnakeCase(trimmed);
  return snake.endsWith("s") ? snake : `${snake}s`;
}

function pickTypeForCollection(typeBlocks, collection) {
  if (typeBlocks.length === 0) {
    return null;
  }
  const scored = typeBlocks.map((block) => {
    const typeCollection = collectionForTypeName(block.typeName);
    let score = block.fields.length;
    if (typeCollection === collection) {
      score += 120;
    }
    if (typeCollection.includes(collection) || collection.includes(typeCollection)) {
      score += 40;
    }
    if (block.typeName.endsWith("Record")) {
      score += 10;
    }
    if (block.fields.some((field) => field.name === "id")) {
      score += 10;
    }
    if (block.fields.some((field) => field.name === "companyId")) {
      score += 5;
    }
    return { score, block };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.block ?? null;
}

function extractCollectionNames(source) {
  const constMap = new Map();
  for (const match of source.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*["']([^"']+)["'];/g)) {
    constMap.set(match[1], match[2]);
  }

  const names = new Set();
  for (const match of source.matchAll(/collection\(([^)]+)\)/g)) {
    const expr = match[1].trim();
    if (/^["']/.test(expr)) {
      names.add(expr.slice(1, -1));
      continue;
    }
    if (constMap.has(expr)) {
      names.add(constMap.get(expr));
    }
  }
  return Array.from(names).sort();
}

function parseCollectionConstants(source) {
  const map = new Map();
  for (const match of source.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*["']([^"']+)["'];/g)) {
    map.set(match[1], match[2]);
  }
  return map;
}

function resolveCollectionExpr(expr, constMap) {
  const trimmed = expr.trim();
  if (/^["']/.test(trimmed)) {
    return trimmed.slice(1, -1);
  }
  if (constMap.has(trimmed)) {
    return constMap.get(trimmed);
  }
  return null;
}

function extractQueryPatternsFromSource(source) {
  const patterns = [];
  const constMap = parseCollectionConstants(source);
  const statements = source.split(";");

  for (const statementRaw of statements) {
    const statement = statementRaw.replace(/\s+/g, " ").trim();
    if (!statement.includes("collection(")) {
      continue;
    }
    const collectionMatch = statement.match(/collection\(([^)]+)\)/);
    if (!collectionMatch) {
      continue;
    }
    const collection = resolveCollectionExpr(collectionMatch[1], constMap);
    if (!collection) {
      continue;
    }

    const filters = [];
    for (const whereMatch of statement.matchAll(/\.where\((["'])([^"']+)\1,\s*(["'])([^"']+)\3/g)) {
      filters.push(`${whereMatch[2]} ${whereMatch[4]}`);
    }

    const orderBy = [];
    for (const orderMatch of statement.matchAll(/\.orderBy\((["'])([^"']+)\1(?:,\s*(["'])([^"']+)\3)?\)/g)) {
      const direction = orderMatch[4] ? ` ${orderMatch[4]}` : "";
      orderBy.push(`${orderMatch[2]}${direction}`);
    }

    if (filters.length === 0 && orderBy.length === 0) {
      continue;
    }

    patterns.push({
      collection,
      filters: Array.from(new Set(filters)).sort(),
      orderBy: Array.from(new Set(orderBy)).sort(),
    });
  }

  return patterns;
}

function inferRelationships(fields, knownCollections) {
  const relations = [];
  for (const field of fields) {
    if (!field.name.endsWith("Id")) {
      continue;
    }
    const target = collectionNameFromField(field.name);
    if (!target) {
      continue;
    }
    relations.push({
      field: field.name,
      target: knownCollections.has(target) ? target : `${target} (inferred)`,
    });
  }
  return relations;
}

async function buildValidatorSchemaFields() {
  const validatorFiles = (await walkFiles(VALIDATORS_DIR))
    .filter((filePath) => filePath.endsWith(".ts"))
    .sort((a, b) => a.localeCompare(b));
  const map = new Map();
  const rows = [];

  for (const filePath of validatorFiles) {
    const source = await fs.readFile(filePath, "utf8");
    const schemas = extractObjectSchemas(source, true);
    const sourceFile = toPosix(path.relative(ROOT, filePath));
    for (const [schemaName, fields] of schemas.entries()) {
      map.set(`${sourceFile}#${schemaName}`, fields);
      rows.push({
        sourceFile,
        schemaName,
        fields: fields.join("|"),
      });
    }
  }

  rows.sort((a, b) => {
    const sourceSort = a.sourceFile.localeCompare(b.sourceFile);
    if (sourceSort !== 0) {
      return sourceSort;
    }
    return a.schemaName.localeCompare(b.schemaName);
  });

  return { map, rows };
}

async function buildEndpointInventory(validatorSchemaFields) {
  const apiFiles = (await walkFiles(API_DIR))
    .filter((filePath) => filePath.endsWith("route.ts"))
    .sort((a, b) => a.localeCompare(b));

  const endpointRows = [];

  for (const filePath of apiFiles) {
    const source = await fs.readFile(filePath, "utf8");
    const methods = extractMethods(source);
    if (methods.length === 0) {
      continue;
    }

    const apiPath = toApiPath(filePath);
    const moduleName = apiPath.split("/")[2] ?? "misc";
    const auth = extractAuthMode(source);
    const guards = extractGuards(source);
    const schemas = extractSchemas(source);
    const importMap = extractImportMap(source);
    const localSchemas = extractObjectSchemas(source, false);
    const schemaRefs = schemas.map((schema) => {
      const importedFrom = importMap.get(schema);
      if (!importedFrom) {
        return schema;
      }
      return `${schema} (${importedFrom})`;
    });

    const requestFields = [];
    for (const schema of schemas) {
      if (localSchemas.has(schema)) {
        requestFields.push(...(localSchemas.get(schema) ?? []));
        continue;
      }
      const importedFrom = importMap.get(schema);
      if (!importedFrom) {
        continue;
      }
      const key = `${importedFrom}#${schema}`;
      requestFields.push(...(validatorSchemaFields.get(key) ?? []));
    }

    const sourceFile = toPosix(path.relative(ROOT, filePath));
    const formats = extractFormats(source);
    const pathParams = extractPathParams(apiPath);
    const queryParams = extractQueryParams(source);
    const statusCodes = extractStatusCodes(source);

    for (const method of methods) {
      const uniqueRequestFields = Array.from(new Set(requestFields)).sort();
      endpointRows.push({
        module: moduleName,
        method,
        path: apiPath,
        auth,
        guards: guards.join("|"),
        requestSchema: schemaRefs.join("|"),
        requestFields: uniqueRequestFields.join("|"),
        responseFormats: formats.join("|"),
        pathParams: pathParams.join("|"),
        queryParams: queryParams.join("|"),
        statusCodes: (statusCodes.length > 0 ? statusCodes : ["200"]).join("|"),
        purpose: inferOperationPurpose(method, apiPath),
        _pathParams: pathParams,
        _queryParams: queryParams,
        _requestFields: uniqueRequestFields,
        _schemas: schemaRefs,
        _formats: formats,
        _statusCodes: statusCodes.length > 0 ? statusCodes : ["200"],
        _guards: guards,
        sourceFile,
      });
    }
  }

  endpointRows.sort((a, b) => {
    const moduleSort = a.module.localeCompare(b.module);
    if (moduleSort !== 0) {
      return moduleSort;
    }
    const pathSort = a.path.localeCompare(b.path);
    if (pathSort !== 0) {
      return pathSort;
    }
    return a.method.localeCompare(b.method);
  });

  const moduleCounts = new Map();
  for (const row of endpointRows) {
    moduleCounts.set(row.module, (moduleCounts.get(row.module) ?? 0) + 1);
  }
  const moduleSummary = Array.from(moduleCounts.entries())
    .map(([module, operations]) => ({ module, operations }))
    .sort((a, b) => b.operations - a.operations || a.module.localeCompare(b.module));

  return { endpointRows, moduleSummary };
}

async function buildDatabaseInventory() {
  const dataFiles = (await walkFiles(DATA_DIR))
    .filter((filePath) => filePath.endsWith(".ts"))
    .sort((a, b) => a.localeCompare(b));

  const candidateRows = [];
  const allCollections = new Set();
  const contexts = [];
  const allQueryPatterns = [];

  for (const filePath of dataFiles) {
    const source = await fs.readFile(filePath, "utf8");
    const collections = extractCollectionNames(source);
    const queryPatterns = extractQueryPatternsFromSource(source).map((pattern) => ({
      ...pattern,
      sourceFile: toPosix(path.relative(ROOT, filePath)),
    }));
    allQueryPatterns.push(...queryPatterns);
    collections.forEach((collection) => allCollections.add(collection));
    contexts.push({ filePath, source, collections });
  }

  for (const context of contexts) {
    const typeBlocks = extractTypeBlocks(context.source);
    for (const collection of context.collections) {
      const selectedType = pickTypeForCollection(typeBlocks, collection) ?? pickPrimaryType(typeBlocks);
      const fields = selectedType?.fields ?? [];
      const relationships = inferRelationships(fields, allCollections);
      candidateRows.push({
        collection,
        sourceFile: toPosix(path.relative(ROOT, context.filePath)),
        primaryType: selectedType?.typeName ?? "",
        fieldDefs: fields,
        foreignKeyDefs: relationships,
        fields: fields.map((field) => `${field.name}:${field.type}`).join("|"),
        foreignKeys: relationships.map((rel) => `${rel.field}->${rel.target}`).join("|"),
      });
    }
  }

  const grouped = new Map();
  for (const row of candidateRows) {
    const list = grouped.get(row.collection) ?? [];
    list.push(row);
    grouped.set(row.collection, list);
  }

  const rows = [];
  for (const [collection, candidates] of grouped.entries()) {
    const scored = candidates.map((candidate) => {
      const base = path
        .basename(candidate.sourceFile, ".ts")
        .replace(/-/g, "_");
      let score = 0;
      if (base === collection) {
        score += 80;
      }
      if (base.includes(collection) || collection.includes(base)) {
        score += 20;
      }
      if (candidate.primaryType) {
        score += 30;
      }
      if (candidate.fields.includes("id:")) {
        score += 5;
      }
      if (!candidate.fields) {
        score -= 150;
      }
      if (!candidate.primaryType) {
        score -= 100;
      }
      return { score, candidate };
    });
    scored.sort((a, b) => b.score - a.score || a.candidate.sourceFile.localeCompare(b.candidate.sourceFile));
    const selected = scored[0]?.candidate;
    if (!selected) {
      continue;
    }
    rows.push({
      collection,
      sourceFile: selected.sourceFile,
      primaryType: selected.primaryType,
      fieldDefs: selected.fieldDefs ?? [],
      foreignKeyDefs: selected.foreignKeyDefs ?? [],
      fields: selected.fields,
      foreignKeys: selected.foreignKeys,
      relatedSourceFiles: Array.from(new Set(candidates.map((item) => item.sourceFile))).sort().join("|"),
    });
  }

  rows.sort((a, b) => a.collection.localeCompare(b.collection));

  const relationshipRows = [];
  for (const row of rows) {
    if (!row.foreignKeys) {
      continue;
    }
    for (const relation of row.foreignKeys.split("|")) {
      const [field, target] = relation.split("->");
      relationshipRows.push({
        fromCollection: row.collection,
        foreignKeyField: field,
        toCollection: target,
      });
    }
  }

  relationshipRows.sort((a, b) => {
    const fromSort = a.fromCollection.localeCompare(b.fromCollection);
    if (fromSort !== 0) {
      return fromSort;
    }
    return a.foreignKeyField.localeCompare(b.foreignKeyField);
  });

  const patternMap = new Map();
  for (const pattern of allQueryPatterns) {
    const key = `${pattern.collection}|${pattern.filters.join(",")}|${pattern.orderBy.join(",")}`;
    if (!patternMap.has(key)) {
      patternMap.set(key, {
        collection: pattern.collection,
        filters: pattern.filters,
        orderBy: pattern.orderBy,
        sourceFiles: [pattern.sourceFile],
      });
      continue;
    }
    const existing = patternMap.get(key);
    existing.sourceFiles.push(pattern.sourceFile);
  }
  const queryPatterns = Array.from(patternMap.values()).map((entry) => ({
    collection: entry.collection,
    filters: entry.filters.join("|"),
    orderBy: entry.orderBy.join("|"),
    sourceFiles: Array.from(new Set(entry.sourceFiles)).sort().join("|"),
    _filters: entry.filters,
    _orderBy: entry.orderBy,
    _sourceFiles: Array.from(new Set(entry.sourceFiles)).sort(),
  }));
  queryPatterns.sort((a, b) => {
    const c = a.collection.localeCompare(b.collection);
    if (c !== 0) {
      return c;
    }
    return a.filters.localeCompare(b.filters);
  });

  return { rows, relationshipRows, queryPatterns };
}

async function readApiScopes() {
  const source = await fs.readFile(API_KEYS_FILE, "utf8");
  const scopes = [];
  const typeMatch = source.match(/export\s+type\s+ApiKeyScope\s*=\s*([\s\S]*?);/);
  if (!typeMatch) {
    return scopes;
  }
  for (const match of typeMatch[1].matchAll(/"([^"]+)"/g)) {
    scopes.push(match[1]);
  }
  return scopes;
}

async function ensureDocsDir() {
  await fs.mkdir(DOCS_DIR, { recursive: true });
}

async function writeCsv(filePath, headers, rows) {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(String(row[header] ?? ""))).join(","));
  }
  await fs.writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
}

function renderApiModuleTables(endpointRows) {
  const moduleMap = new Map();
  for (const row of endpointRows) {
    const list = moduleMap.get(row.module) ?? [];
    list.push(row);
    moduleMap.set(row.module, list);
  }

  const modules = Array.from(moduleMap.keys()).sort((a, b) => a.localeCompare(b));
  const sections = [];

  for (const module of modules) {
    const rows = moduleMap.get(module) ?? [];
    rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
    const tableLines = [
      `## Module: ${module}`,
      "",
      `Operations: **${rows.length}**`,
      "",
      "| Method | Path | Purpose | Auth | Guards | Path Params | Query Params | Body Fields | Response | Status | Source |",
      "|---|---|---|---|---|---|---|---|---|---|---|",
      ...rows.map((row) =>
        [
          row.method,
          markdownEscape(row.path),
          markdownEscape(row.purpose),
          row.auth,
          markdownEscape(joinOrDash(row._guards)),
          markdownEscape(joinOrDash(row._pathParams)),
          markdownEscape(joinOrDash(row._queryParams)),
          markdownEscape(joinOrDash(row._requestFields)),
          markdownEscape(joinOrDash(row._formats)),
          markdownEscape(joinOrDash(row._statusCodes)),
          markdownEscape(row.sourceFile),
        ].join(" | ").replace(/^/, "| ").concat(" |")
      ),
      "",
    ];
    sections.push(tableLines.join("\n"));
  }

  return sections.join("\n");
}

function buildApiDetailedMarkdown(params) {
  const { generatedAt, endpointRows, moduleSummary, scopes } = params;
  const totalRoutes = new Set(endpointRows.map((row) => row.path)).size;
  const authCounts = new Map();
  for (const row of endpointRows) {
    authCounts.set(row.auth, (authCounts.get(row.auth) ?? 0) + 1);
  }
  const authSummary = Array.from(authCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([mode, count]) => `- ${mode}: ${count}`);

  return `# Saudi Waqef API Integration Documentation (Detailed)

Generated on: ${generatedAt}

## Scope
This document is generated from the current source code and covers all discovered API operations under \`src/app/api\`.

## Platform API Summary
- Total API operations: **${endpointRows.length}**
- Total unique routes: **${totalRoutes}**
- Endpoint inventory CSV: \`docs/developer/api-endpoints-inventory.csv\`
- Validator schema catalog CSV: \`docs/developer/api-schema-fields.csv\`

## Module Coverage
${moduleSummary.map((item) => `- ${item.module}: ${item.operations} operations`).join("\n")}

## Authentication Model
- API key bearer authentication is currently implemented for:
  - \`GET /api/developer/ping\`
- Most routes are authenticated with application sessions and role/system guards.
- Authentication mode distribution:
${authSummary.join("\n")}

### API Key Scopes (Defined in Code)
${scopes.map((scope) => `- ${scope}`).join("\n")}

### API Key Header
\`\`\`http
Authorization: Bearer <API_KEY>
\`\`\`

## Data Formats
- \`application/json\` for standard API responses
- \`text/csv; charset=utf-8\` for exports/import templates
- \`application/pdf\` for printable/report exports
- XML is not implemented in current API routes.

## Rate Limits and Security Controls
- Documented rate limits (\`docs/developer/api-overview.md\`):
  - Default: 300 requests/minute per API key
  - Burst: 50 requests
- Implemented controls:
  - Session authentication with NextAuth
  - Role/system guard checks in routes
  - Zod schema validation for request payloads
  - Audit logging and telemetry events
  - API key hashing/revocation and usage logging
  - MFA and login-throttling controls

## Usage Examples
\`\`\`bash
curl -H "Authorization: Bearer <API_KEY>" https://<your-domain>/api/developer/ping
\`\`\`

\`\`\`json
{
  "ok": true,
  "companyId": "<company-id>",
  "scopes": ["read:accounting"]
}
\`\`\`

---

# Complete Route Catalog (All Modules)

${renderApiModuleTables(endpointRows)}
`;
}

function inferFieldNotes(fieldName, fieldType) {
  const notes = [];
  if (fieldName === "id") {
    notes.push("Primary identifier (document id)");
  }
  if (fieldName.endsWith("Id") && fieldName !== "id") {
    notes.push("Reference field (foreign-key style)");
  }
  if (fieldName.endsWith("At")) {
    notes.push("Timestamp/date field");
  }
  const enumValues = Array.from(fieldType.matchAll(/"([^"]+)"/g)).map((match) => match[1]);
  if (enumValues.length > 0) {
    notes.push(`Enum: ${enumValues.join(", ")}`);
  }
  return notes.length > 0 ? notes.join("; ") : "-";
}

function renderCoreErd(relationshipRows) {
  const explicit = relationshipRows.filter((row) => !row.toCollection.includes("(inferred)"));
  if (explicit.length === 0) {
    return "No explicit relationships discovered.";
  }
  const edges = explicit.map((row) => {
    const fromId = row.fromCollection.replace(/[^a-zA-Z0-9_]/g, "_");
    const toId = row.toCollection.replace(/[^a-zA-Z0-9_]/g, "_");
    return `  ${fromId}["${row.fromCollection}"] -->|${row.foreignKeyField}| ${toId}["${row.toCollection}"]`;
  });
  return ["```mermaid", "graph LR", ...edges, "```"].join("\n");
}

function renderQueryPatternTable(queryPatterns) {
  if (queryPatterns.length === 0) {
    return "No query patterns were extracted.";
  }
  const lines = [
    "| Collection | Filters | Order By | Source Files |",
    "|---|---|---|---|",
    ...queryPatterns.map((pattern) =>
      `| ${markdownEscape(pattern.collection)} | ${markdownEscape(joinOrDash(pattern._filters))} | ${markdownEscape(joinOrDash(pattern._orderBy))} | ${markdownEscape(joinOrDash(pattern._sourceFiles))} |`
    ),
  ];
  return lines.join("\n");
}

function renderDatabaseCollectionSections(dbRows) {
  const sections = [];
  for (const row of dbRows) {
    const fields = row.fieldDefs ?? [];
    const foreignKeys = row.foreignKeyDefs ?? [];
    const fieldTable = [
      "| Field | Data Type | Nullable | Notes |",
      "|---|---|---|---|",
      ...fields.map((field) => {
        const nullable = /\|\s*null/.test(field.type) ? "Yes" : "No";
        return `| ${markdownEscape(field.name)} | ${markdownEscape(field.type)} | ${nullable} | ${markdownEscape(inferFieldNotes(field.name, field.type))} |`;
      }),
    ].join("\n");
    const fkList =
      foreignKeys.length === 0
        ? "- None detected"
        : foreignKeys.map((rel) => `- \`${rel.field}\` -> \`${rel.target}\``).join("\n");

    sections.push(`## Collection: ${row.collection}

- Source file: \`${row.sourceFile}\`
- Related source files: \`${row.relatedSourceFiles || row.sourceFile}\`
- Primary type: \`${row.primaryType || "N/A"}\`
- Primary key: \`id\` (Firestore document id pattern)

### Foreign Keys (Inferred/Explicit)
${fkList}

### Fields
${fields.length === 0 ? "No strongly-typed fields extracted." : fieldTable}
`);
  }
  return sections.join("\n");
}

function buildDatabaseDetailedMarkdown(params) {
  const { generatedAt, dbRows, relationshipRows, queryPatterns } = params;
  return `# Saudi Waqef Database Schema Documentation (Detailed)

Generated on: ${generatedAt}

## Datastore Model
- Backend datastore: Google Firestore (document collections, not SQL tables)
- Collections discovered: **${dbRows.length}**
- Relationship mappings discovered: **${relationshipRows.length}**
- Collections CSV: \`docs/developer/database-collections.csv\`
- Relationships CSV: \`docs/developer/database-relationships.csv\`

## Primary and Foreign Key Conventions
- Primary key convention: Firestore document id (represented as \`id\` in record models)
- Foreign key convention: fields ending with \`Id\` (for example \`companyId\`, \`customerId\`, \`invoiceId\`)
- Tenant partitioning convention: \`companyId\` is used broadly for data isolation

## ERD (Core Relationships)
${renderCoreErd(relationshipRows)}

## Indexing and Query Pattern Guidance
- Dedicated Firestore index specification is not versioned in this repository.
- Use extracted query patterns below to create/validate composite indexes in deployment.
- Query pattern table:

${renderQueryPatternTable(queryPatterns)}

## Constraints and Validation
- Data-level constraints are primarily enforced through:
  - Zod validators in \`src/lib/validators/*.ts\`
  - Route/business logic checks in \`src/app/api/**/route.ts\`
  - Type-level enums/unions in \`src/lib/data/*.ts\`
- Security constraints are enforced by session guards, system admin guards, and tenant scoping.

---

# Complete Collection Catalog

${renderDatabaseCollectionSections(dbRows)}
`;
}

async function main() {
  await ensureDocsDir();

  const generatedAt = new Date().toISOString();
  const scopes = await readApiScopes();
  const validatorSchemas = await buildValidatorSchemaFields();
  const { endpointRows, moduleSummary } = await buildEndpointInventory(validatorSchemas.map);
  const { rows: dbRows, relationshipRows, queryPatterns } = await buildDatabaseInventory();

  const endpointCsvPath = path.join(DOCS_DIR, "api-endpoints-inventory.csv");
  await writeCsv(
    endpointCsvPath,
    [
      "module",
      "method",
      "path",
      "purpose",
      "auth",
      "guards",
      "pathParams",
      "queryParams",
      "requestSchema",
      "requestFields",
      "statusCodes",
      "responseFormats",
      "sourceFile",
    ],
    endpointRows
  );

  const schemaCsvPath = path.join(DOCS_DIR, "api-schema-fields.csv");
  await writeCsv(schemaCsvPath, ["sourceFile", "schemaName", "fields"], validatorSchemas.rows);

  const dbCsvPath = path.join(DOCS_DIR, "database-collections.csv");
  await writeCsv(
    dbCsvPath,
    ["collection", "sourceFile", "primaryType", "fields", "foreignKeys", "relatedSourceFiles"],
    dbRows
  );

  const relCsvPath = path.join(DOCS_DIR, "database-relationships.csv");
  await writeCsv(
    relCsvPath,
    ["fromCollection", "foreignKeyField", "toCollection"],
    relationshipRows
  );

  const queryPatternCsvPath = path.join(DOCS_DIR, "database-query-patterns.csv");
  await writeCsv(
    queryPatternCsvPath,
    ["collection", "filters", "orderBy", "sourceFiles"],
    queryPatterns
  );

  const integrationMd = `# API Integration Reference

Generated on: ${generatedAt}

## 1. Available API Endpoints
- Full endpoint inventory (method + path + auth + schema reference): \`docs/developer/api-endpoints-inventory.csv\`
- Detailed route-by-route Markdown: \`docs/developer/api-integration-detailed.md\`
- Total operations discovered: **${endpointRows.length}**
- Total route files discovered: **${new Set(endpointRows.map((row) => row.path)).size}**

### Module coverage (operation count)
${moduleSummary.map((item) => `- ${item.module}: ${item.operations}`).join("\n")}

## 2. Authentication and Scopes
- Internal application APIs use authenticated sessions and role/system guards.
- API key (Bearer token) is currently implemented for: \`GET /api/developer/ping\`.
- API key scopes currently defined in code:
${scopes.map((scope) => `  - ${scope}`).join("\n")}
- API key storage and verification:
  - Token is generated once and only token hash is stored.
  - Revoked keys cannot authenticate.
  - Usage logs are captured in \`api_key_usage\`.

## 3. Data Formats and Field Definitions
- Response formats detected in routes:
  - JSON (default across API routes)
  - CSV exports (\`text/csv; charset=utf-8\`)
  - PDF exports (\`application/pdf\`)
- Request payload validation is implemented with Zod schemas.
- Endpoint-level schema references and request field hints are listed in \`docs/developer/api-endpoints-inventory.csv\` (\`requestSchema\`, \`requestFields\`).
- Schema-level field catalog is available in \`docs/developer/api-schema-fields.csv\`.
- Source validator definitions are in: \`src/lib/validators/*.ts\`.

## 4. Usage Examples
\`\`\`bash
curl -H "Authorization: Bearer <API_KEY>" https://<your-domain>/api/developer/ping
\`\`\`

\`\`\`json
{
  "ok": true,
  "companyId": "<company-id>",
  "scopes": ["read:accounting"]
}
\`\`\`

## 5. Rate Limits and Security Policies
- Documented API policy in \`docs/developer/api-overview.md\`:
  - Default: 300 requests/minute per key
  - Burst: 50 requests
- Security controls implemented in code include:
  - Session authentication (NextAuth JWT strategy)
  - Role/system authorization checks
  - Zod payload validation
  - Audit logging and telemetry events
  - API key hashing and revocation support
  - MFA endpoints and login throttling controls

## Notes for External Integrators
- The codebase currently exposes many internal application endpoints under \`/api/*\`.
- Treat internal routes as implementation-level APIs unless a stable integration contract is explicitly published.
- For stable external integrations, align first on the approved endpoint subset and versioning policy.
`;

  await fs.writeFile(path.join(DOCS_DIR, "api-integration-reference.md"), integrationMd, "utf8");

  const dbMd = `# Database Schema Reference

Generated on: ${generatedAt}

## Datastore
- Primary datastore: Google Firestore (document collections).

## Complete Collection List
- Full machine-readable list: \`docs/developer/database-collections.csv\`
- Detailed collection-by-collection Markdown: \`docs/developer/database-schema-detailed.md\`
- Total collections discovered: **${dbRows.length}**

## Relationships (Inferred)
- Full relationship list: \`docs/developer/database-relationships.csv\`
- Query/index pattern list: \`docs/developer/database-query-patterns.csv\`
- Relationships are inferred from \`*Id\` fields in primary record types and should be validated by the development team before external use.

## Primary and Foreign Keys
- Primary key pattern: Firestore document ID (commonly represented as \`id\` in record types).
- Foreign key pattern: fields ending with \`Id\` (for example: \`companyId\`, \`customerId\`, \`invoiceId\`, \`employeeId\`).

## Field Names and Data Types
- For each collection, \`database-collections.csv\` includes:
  - \`primaryType\` (selected primary TypeScript record type from source file)
  - \`fields\` (field:type pairs extracted from that type)
- Source of truth for field definitions: \`src/lib/data/*.ts\`.

## Constraints and Indexing
- Business and payload constraints are enforced mainly through:
  - Zod validators in \`src/lib/validators/*.ts\`
  - Route-level checks and guard functions
- Firestore indexing details are not explicitly versioned in this repository as a dedicated index specification file.
- Index requirements should be validated in deployment configuration for production workloads.

## Security and Access Notes
- Multi-tenant segregation is primarily enforced via \`companyId\` scoping and authorization guards.
- Sensitive operations are audited via \`audit_logs\`.
`;

  await fs.writeFile(path.join(DOCS_DIR, "database-schema-reference.md"), dbMd, "utf8");

  const apiDetailedMd = buildApiDetailedMarkdown({
    generatedAt,
    endpointRows,
    moduleSummary,
    scopes,
  });
  const apiDetailedPath = path.join(DOCS_DIR, "api-integration-detailed.md");
  await fs.writeFile(apiDetailedPath, apiDetailedMd, "utf8");

  const dbDetailedMd = buildDatabaseDetailedMarkdown({
    generatedAt,
    dbRows,
    relationshipRows,
    queryPatterns,
  });
  const dbDetailedPath = path.join(DOCS_DIR, "database-schema-detailed.md");
  await fs.writeFile(dbDetailedPath, dbDetailedMd, "utf8");

  console.log(`Generated:
- ${toPosix(path.relative(ROOT, endpointCsvPath))}
- ${toPosix(path.relative(ROOT, schemaCsvPath))}
- ${toPosix(path.relative(ROOT, dbCsvPath))}
- ${toPosix(path.relative(ROOT, relCsvPath))}
- ${toPosix(path.relative(ROOT, queryPatternCsvPath))}
- ${toPosix(path.relative(ROOT, path.join(DOCS_DIR, "api-integration-reference.md")))}
- ${toPosix(path.relative(ROOT, path.join(DOCS_DIR, "database-schema-reference.md")))}
- ${toPosix(path.relative(ROOT, apiDetailedPath))}
- ${toPosix(path.relative(ROOT, dbDetailedPath))}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
