"use client";

import { useCompany } from "@/components/company-provider";
import { RegistrationRequests } from "@/components/registration-requests";

export default function AdminRegistrationsPage() {
  const { activeCompany } = useCompany();

  if (!activeCompany) {
    return null;
  }
  return <RegistrationRequests key={activeCompany.id} company={activeCompany} />;
}
