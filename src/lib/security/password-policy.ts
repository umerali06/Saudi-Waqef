export const PASSWORD_POLICY = {
  minLength: 10,
  maxLength: 128,
  minLowercase: 1,
  minUppercase: 1,
  minNumber: 1,
  minSymbol: 1,
};

const COMMON_PASSWORDS = [
  "password",
  "123456",
  "12345678",
  "qwerty",
  "admin",
  "letmein",
  "welcome",
  "saudi",
  "waqef",
];

export type PasswordIssue =
  | "minLength"
  | "maxLength"
  | "lowercase"
  | "uppercase"
  | "number"
  | "symbol"
  | "common"
  | "whitespace";

export function getPasswordIssues(password: string): PasswordIssue[] {
  const issues: PasswordIssue[] = [];
  const trimmed = password ?? "";

  if (trimmed.length < PASSWORD_POLICY.minLength) {
    issues.push("minLength");
  }
  if (trimmed.length > PASSWORD_POLICY.maxLength) {
    issues.push("maxLength");
  }
  if (!/[a-z]/.test(trimmed)) {
    issues.push("lowercase");
  }
  if (!/[A-Z]/.test(trimmed)) {
    issues.push("uppercase");
  }
  if (!/[0-9]/.test(trimmed)) {
    issues.push("number");
  }
  if (!/[^A-Za-z0-9]/.test(trimmed)) {
    issues.push("symbol");
  }
  if (/\s/.test(trimmed)) {
    issues.push("whitespace");
  }

  const normalized = trimmed.toLowerCase();
  if (COMMON_PASSWORDS.some((entry) => normalized.includes(entry))) {
    issues.push("common");
  }

  return issues;
}

export const PASSWORD_REQUIREMENTS: Array<{
  key: string;
  test: (password: string) => boolean;
  values?: Record<string, number>;
}> = [
  {
    key: "auth.password.rule.minLength",
    test: (password) => password.length >= PASSWORD_POLICY.minLength,
    values: { min: PASSWORD_POLICY.minLength },
  },
  {
    key: "auth.password.rule.maxLength",
    test: (password) => password.length <= PASSWORD_POLICY.maxLength,
    values: { max: PASSWORD_POLICY.maxLength },
  },
  {
    key: "auth.password.rule.uppercase",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    key: "auth.password.rule.lowercase",
    test: (password) => /[a-z]/.test(password),
  },
  {
    key: "auth.password.rule.number",
    test: (password) => /[0-9]/.test(password),
  },
  {
    key: "auth.password.rule.symbol",
    test: (password) => /[^A-Za-z0-9]/.test(password),
  },
  {
    key: "auth.password.rule.whitespace",
    test: (password) => !/\s/.test(password),
  },
  {
    key: "auth.password.rule.common",
    test: (password) => {
      const normalized = password.toLowerCase();
      return !COMMON_PASSWORDS.some((entry) => normalized.includes(entry));
    },
  },
];
