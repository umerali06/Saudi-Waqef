import type { Role } from "@/lib/types";

export type AppModule =
  | "dashboard"
  | "notifications"
  | "sales"
  | "purchases"
  | "payments"
  | "items"
  | "documents"
  | "hr"
  | "reports"
  | "settings"
  | "developers"
  | "admin"
  | "support"
  | "help";

const ROLE_MODULES: Record<Role, AppModule[]> = {
  owner: [
    "dashboard",
    "notifications",
    "sales",
    "purchases",
    "payments",
    "items",
    "documents",
    "hr",
    "reports",
    "settings",
    "developers",
    "admin",
    "support",
    "help",
  ],
  admin: [
    "dashboard",
    "notifications",
    "sales",
    "purchases",
    "payments",
    "items",
    "documents",
    "hr",
    "reports",
    "settings",
    "developers",
    "admin",
    "support",
    "help",
  ],
  accountant: [
    "dashboard",
    "notifications",
    "sales",
    "purchases",
    "payments",
    "items",
    "documents",
    "reports",
    "support",
    "help",
  ],
  hr: [
    "dashboard",
    "notifications",
    "documents",
    "hr",
    "reports",
    "support",
    "help",
  ],
  employee: ["dashboard", "notifications", "hr", "support", "help"],
  viewer: ["dashboard", "notifications", "documents", "reports", "support", "help"],
};

export function getAllowedModules(role: Role | null | undefined) {
  if (!role) {
    return ROLE_MODULES.viewer;
  }
  return ROLE_MODULES[role] ?? ROLE_MODULES.viewer;
}

export function isModuleAllowed(role: Role | null | undefined, module: AppModule) {
  return getAllowedModules(role).includes(module);
}

export function canAccessPath(role: Role | null | undefined, pathname: string) {
  const normalized = pathname.split("?")[0] ?? "/";
  if (normalized === "/" || normalized === "") {
    return isModuleAllowed(role, "dashboard");
  }
  if (normalized.startsWith("/notifications")) {
    return isModuleAllowed(role, "notifications");
  }
  if (normalized.startsWith("/sales")) {
    return isModuleAllowed(role, "sales");
  }
  if (normalized.startsWith("/purchases")) {
    return isModuleAllowed(role, "purchases");
  }
  if (normalized.startsWith("/payments")) {
    return isModuleAllowed(role, "payments");
  }
  if (normalized.startsWith("/items")) {
    return isModuleAllowed(role, "items");
  }
  if (normalized.startsWith("/documents")) {
    return isModuleAllowed(role, "documents");
  }
  if (normalized.startsWith("/reports")) {
    return isModuleAllowed(role, "reports");
  }
  if (normalized.startsWith("/settings")) {
    return isModuleAllowed(role, "settings");
  }
  if (normalized.startsWith("/developers")) {
    return isModuleAllowed(role, "developers");
  }
  if (normalized.startsWith("/admin")) {
    return isModuleAllowed(role, "admin");
  }
  if (normalized.startsWith("/support")) {
    return isModuleAllowed(role, "support");
  }
  if (normalized.startsWith("/help")) {
    return isModuleAllowed(role, "help");
  }
  if (normalized.startsWith("/hr")) {
    if (isModuleAllowed(role, "hr")) {
      if (role === "employee") {
        return (
          normalized.startsWith("/hr/my-profile") ||
          normalized.startsWith("/hr/leave") ||
          normalized.startsWith("/hr/attendance") ||
          normalized === "/hr"
        );
      }
      return true;
    }
    return false;
  }
  return true;
}
