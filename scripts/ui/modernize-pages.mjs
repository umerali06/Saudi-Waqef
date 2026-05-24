import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = [
  "src/app/(protected)",
  "src/app/(admin)",
];

const FILE_EXT = ".tsx";

const shouldProcess = (file) => file.endsWith(FILE_EXT);

const addClassToTag = (content, tag, shouldAdd, classToAdd) => {
  const patterns = [
    new RegExp(`<${tag} className="([^"]*?)">`, "g"),
    new RegExp(`<${tag} className='([^']*?)'>`, "g"),
  ];
  let updated = content;
  patterns.forEach((pattern) => {
    updated = updated.replace(pattern, (match, classes) => {
      if (classes.includes(classToAdd)) {
        return match;
      }
      if (shouldAdd && !shouldAdd(classes)) {
        return match;
      }
      return match.replace(classes, `${classes} ${classToAdd}`.trim());
    });
  });
  return updated;
};

const addClassByToken = (content, token, classToAdd) => {
  const patterns = [
    new RegExp(`className="([^"]*?\\b${token}\\b[^"]*?)"`, "g"),
    new RegExp(`className='([^']*?\\b${token}\\b[^']*?)'`, "g"),
  ];
  let updated = content;
  patterns.forEach((pattern) => {
    updated = updated.replace(pattern, (match, classes) => {
      if (classes.includes(classToAdd)) {
        return match;
      }
      return match.replace(classes, `${classes} ${classToAdd}`.trim());
    });
  });
  return updated;
};

const ICON_MAP = [
  { key: "revenue", labels: ["revenue", "الإيرادات"] },
  { key: "expenses", labels: ["expenses", "المصروفات"] },
  { key: "overdue", labels: ["overdue", "متأخر", "overdue invoices"] },
  { key: "cash", labels: ["cash", "النقد", "cash balance"] },
  { key: "profit", labels: ["net profit", "profit", "الربح"] },
  { key: "vat-output", labels: ["output vat", "ضريبة المخرجات"] },
  { key: "vat-input", labels: ["input vat", "ضريبة المدخلات"] },
  { key: "vat-net", labels: ["net vat", "صافي الضريبة"] },
  { key: "headcount", labels: ["headcount", "عدد الموظفين"] },
  { key: "active", labels: ["active employees", "الموظفين النشطين"] },
  { key: "absent", labels: ["absenteeism", "الغياب"] },
  { key: "payroll", labels: ["payroll", "الرواتب"] },
];

const detectIconKey = (label) => {
  const value = label.toLowerCase();
  for (const entry of ICON_MAP) {
    if (entry.labels.some((item) => value.includes(item))) {
      return entry.key;
    }
  }
  return "default";
};

const injectKpiIcon = (content) => {
  const cardPattern = /(<div\s+className="[^"]*\bkpi-card\b[^"]*">)([\s\S]*?)(<\/div>)/g;
  return content.replace(cardPattern, (match, open, body, close) => {
    const labelMatch = body.match(/className="[^"]*kpi-label[^"]*">([^<]+)/);
    const label = labelMatch ? labelMatch[1].trim() : "";
    const iconKey = detectIconKey(label);
    if (body.includes("stat-icon")) {
      return match.replace(
        /className="stat-icon"([^>]*)>/,
        (m, attrs) => `className="stat-icon" data-icon="${iconKey}"${attrs}>`
      );
    }
    return `${open}<span className="stat-icon" data-icon="${iconKey}" aria-hidden="true"></span>${body}${close}`;
  });
};

const injectPanelIcon = (content) => {
  const panelPattern = /(<div\s+className="[^"]*\bapp-panel\b[^"]*">)([\s\S]*?)(<\/div>)/g;
  return content.replace(panelPattern, (match, open, body, close) => {
    const hasKpiKey = body.includes("analytics.kpi") || body.includes("kpi.");
    if (!hasKpiKey) {
      return match;
    }
    if (body.includes("stat-icon")) {
      return match.replace(
        'className="app-panel',
        'className="app-panel kpi-panel stat-card'
      );
    }
    return `${open.replace('className="app-panel', 'className="app-panel kpi-panel stat-card')}` +
      `<span className="stat-icon" data-icon="default" aria-hidden="true"></span>` +
      `${body}${close}`;
  });
};
const replaceClassTokens = (content, replacements) => {
  let updated = content;
  replacements.forEach(([from, to]) => {
    updated = updated.replaceAll(from, to);
  });
  return updated;
};

const addPageShell = (content) => {
  const patterns = [
    /<section className="([^"]*?)">/g,
    /<section className='([^']*?)'>/g,
  ];

  let updated = content;
  patterns.forEach((pattern) => {
    updated = updated.replace(pattern, (match, classes) => {
      if (classes.includes("page-shell")) {
        return match;
      }
      if (!classes.trim()) {
        return match;
      }
      if (classes.includes("space-y-4")) {
        return match.replace(classes, `${classes.replace("space-y-4", "space-y-6")} page-shell`);
      }
      if (classes.includes("space-y-6")) {
        return match.replace(classes, `${classes.replace("space-y-6", "space-y-8")} page-shell`);
      }
      return match.replace(classes, `${classes} page-shell`);
    });
  });

  return updated;
};

const walk = async (dir, files = []) => {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) {
      await walk(full, files);
    } else if (info.isFile() && shouldProcess(full)) {
      files.push(full);
    }
  }
  return files;
};

const run = async () => {
  const targets = [];
  for (const dir of TARGET_DIRS) {
    const abs = join(ROOT, dir);
    targets.push(...(await walk(abs)));
  }

  let changed = 0;
  for (const file of targets) {
    const original = await readFile(file, "utf8");
    let updated = addPageShell(original);
    updated = addClassToTag(updated, "h1", null, "page-title");
    updated = addClassToTag(
      updated,
      "p",
      (classes) => classes.includes("text-sm") && classes.includes("text-muted"),
      "page-subtitle"
    );
    updated = addClassToTag(
      updated,
      "table",
      (classes) => classes.includes("min-w-full"),
      "table-modern"
    );
    updated = addClassToTag(
      updated,
      "thead",
      (classes) => classes.includes("bg-surface-muted"),
      "thead-modern"
    );
    updated = replaceClassTokens(updated, [
      ["app-card p-5", "app-card p-6"],
      ["app-card p-4", "app-card p-6"],
      ["app-card p-3", "app-card p-5"],
      ["rounded-xl", "rounded-2xl"],
    ]);
    updated = addClassByToken(updated, "app-card", "card-modern");
    updated = addClassByToken(updated, "kpi-card", "stat-card");
    updated = injectKpiIcon(updated);
    updated = injectPanelIcon(updated);
    if (updated !== original) {
      await writeFile(file, updated, "utf8");
      changed += 1;
    }
  }

  console.log(`Modernize script complete. Updated ${changed} files.`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
