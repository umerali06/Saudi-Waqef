export type Role =
  | "owner"
  | "admin"
  | "accountant"
  | "hr"
  | "employee"
  | "viewer";

export type CompanySummary = {
  id: string;
  name: string;
  role: Role;
};

export type InviteStatus = "pending" | "accepted" | "expired";

export type Invite = {
  id: string;
  token: string;
  email: string;
  companyId: string;
  role: Role;
  status: InviteStatus;
  expiresAt: Date;
  createdAt: Date;
  acceptedAt?: Date;
};
