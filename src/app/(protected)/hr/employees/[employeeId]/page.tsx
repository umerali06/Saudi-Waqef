"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useCompany } from "@/components/company-provider";
import { SkeletonBlock } from "@/components/skeleton";
import { useTranslations } from "@/i18n/provider";
import { uploadToCloudinary } from "@/lib/cloudinary-client";

type Department = {
  id: string;
  nameAr: string;
  nameEn: string;
  status: "active" | "inactive";
};

type Position = {
  id: string;
  nameAr: string;
  nameEn: string;
  status: "active" | "inactive";
};

type Employee = {
  id: string;
  nameAr: string;
  nameEn: string;
  employeeNumber?: string | null;
  nationalId?: string | null;
  iqamaNumber?: string | null;
  passportNumber?: string | null;
  nationality?: string | null;
  dob?: string | null;
  gender?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  hireDate?: string | null;
  departmentId?: string | null;
  positionId?: string | null;
  managerId?: string | null;
  userId?: string | null;
  employmentType?: string | null;
  status: "active" | "suspended" | "terminated";
  terminationDate?: string | null;
  terminationCategory?: string | null;
  terminationReason?: string | null;
  notes?: string | null;
  onboarding?: OnboardingTask[];
};

type EmployeeOption = {
  id: string;
  nameAr: string;
  nameEn: string;
  status: "active" | "suspended" | "terminated";
};

type UserOption = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type EmployeeContract = {
  id: string;
  type: "full_time" | "part_time" | "temporary" | "contractor";
  status: "draft" | "active" | "ended";
  startDate?: string | null;
  endDate?: string | null;
  probationEndDate?: string | null;
  salary: {
    basic: number;
    housingAllowance: number;
    transportAllowance: number;
    otherAllowance: number;
    deductions: number;
    currency: string;
  };
  notes?: string | null;
};

type EmployeeDocument = {
  id: string;
  type: "id" | "contract" | "certificate" | "other";
  name: string;
  contentType: string;
  size: number;
  storage: "cloudinary" | "firestore";
  url?: string;
  content?: string;
  issuedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
};

type EmployeeTransfer = {
  id: string;
  fromDepartmentId?: string | null;
  toDepartmentId?: string | null;
  fromPositionId?: string | null;
  toPositionId?: string | null;
  effectiveDate?: string | null;
  reason?: string | null;
};

type EndOfServiceSummary = {
  eligible: boolean;
  basis: "actual" | "basic";
  monthlyWage: number;
  serviceDays: number;
  serviceYears: number;
  awardBeforeAdjustment: number;
  adjustmentFactor: number;
  awardAmount: number;
  terminationCategory: string;
};

type OnboardingTask = {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string | null;
  completedBy?: string | null;
};

type EmployeeForm = {
  employeeNumber: string;
  nameAr: string;
  nameEn: string;
  nationalId: string;
  iqamaNumber: string;
  passportNumber: string;
  nationality: string;
  dob: string;
  gender: string;
  email: string;
  phone: string;
  address: string;
  hireDate: string;
  departmentId: string;
  positionId: string;
  managerId: string;
  userId: string;
  employmentType: string;
  status: "active" | "suspended" | "terminated";
  terminationDate: string;
  terminationCategory: string;
  terminationReason: string;
  notes: string;
  transferEffectiveDate: string;
  transferReason: string;
  onboarding: OnboardingTask[];
};

const mapEmployeeError = (error?: string) => {
  switch (error) {
    case "Invalid department":
      return "hr.employees.invalidDepartment";
    case "Invalid position":
      return "hr.employees.invalidPosition";
    case "Invalid manager":
      return "hr.employees.invalidManager";
    case "Invalid user":
      return "hr.employees.invalidUser";
    case "Duplicate employee":
      return "hr.employees.duplicate";
    case "Invalid payload":
      return "hr.employees.invalidPayload";
    default:
      return "error.saveFailed";
  }
};

export default function EmployeeDetailPage() {
  const params = useParams();
  const employeeId = Array.isArray(params.employeeId)
    ? params.employeeId[0]
    : params.employeeId;
  const { activeCompanyId } = useCompany();
  const { t, locale } = useTranslations();
  const alignClass = locale === "ar" ? "text-right" : "text-left";
  const [form, setForm] = useState<EmployeeForm | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [contracts, setContracts] = useState<EmployeeContract[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [transfers, setTransfers] = useState<EmployeeTransfer[]>([]);
  const [endOfServiceSummary, setEndOfServiceSummary] = useState<EndOfServiceSummary | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [successKey, setSuccessKey] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [contractType, setContractType] = useState<EmployeeContract["type"]>("full_time");
  const [contractStatus, setContractStatus] = useState<EmployeeContract["status"]>("active");
  const [contractStartDate, setContractStartDate] = useState("");
  const [contractEndDate, setContractEndDate] = useState("");
  const [contractProbation, setContractProbation] = useState("");
  const [salaryBasic, setSalaryBasic] = useState("");
  const [salaryHousing, setSalaryHousing] = useState("");
  const [salaryTransport, setSalaryTransport] = useState("");
  const [salaryOther, setSalaryOther] = useState("");
  const [salaryDeductions, setSalaryDeductions] = useState("");
  const [salaryCurrency, setSalaryCurrency] = useState("SAR");
  const [contractNotes, setContractNotes] = useState("");
  const [documentType, setDocumentType] = useState<EmployeeDocument["type"]>("id");
  const [documentName, setDocumentName] = useState("");
  const [documentStorage, setDocumentStorage] = useState<"cloudinary" | "firestore">(
    "cloudinary"
  );
  const [documentIssuedAt, setDocumentIssuedAt] = useState("");
  const [documentExpiresAt, setDocumentExpiresAt] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentContent, setDocumentContent] = useState("");
  const [loadingEmployee, setLoadingEmployee] = useState(true);
  const [loadingLookups, setLoadingLookups] = useState(true);
  const [loadingRelated, setLoadingRelated] = useState(true);
  const [isPending, startTransition] = useTransition();

  const statusOptions = useMemo(
    () => [
      { value: "active", label: t("hr.employees.status.active") },
      { value: "suspended", label: t("hr.employees.status.suspended") },
      { value: "terminated", label: t("hr.employees.status.terminated") },
    ],
    [t]
  );

  const typeOptions = useMemo(
    () => [
      { value: "full_time", label: t("hr.employees.type.full_time") },
      { value: "part_time", label: t("hr.employees.type.part_time") },
      { value: "contractor", label: t("hr.employees.type.contractor") },
      { value: "temporary", label: t("hr.employees.type.temporary") },
    ],
    [t]
  );

  const contractTypeOptions = useMemo(
    () => [
      { value: "full_time", label: t("hr.contracts.type.full_time") },
      { value: "part_time", label: t("hr.contracts.type.part_time") },
      { value: "temporary", label: t("hr.contracts.type.temporary") },
      { value: "contractor", label: t("hr.contracts.type.contractor") },
    ],
    [t]
  );

  const contractStatusOptions = useMemo(
    () => [
      { value: "draft", label: t("hr.contracts.status.draft") },
      { value: "active", label: t("hr.contracts.status.active") },
      { value: "ended", label: t("hr.contracts.status.ended") },
    ],
    [t]
  );

  const terminationCategoryOptions = useMemo(
    () => [
      { value: "employer_termination", label: t("hr.employees.terminationCategory.employer_termination") },
      { value: "resignation", label: t("hr.employees.terminationCategory.resignation") },
      { value: "contract_end", label: t("hr.employees.terminationCategory.contract_end") },
      { value: "force_majeure", label: t("hr.employees.terminationCategory.force_majeure") },
      { value: "retirement", label: t("hr.employees.terminationCategory.retirement") },
      { value: "other", label: t("hr.employees.terminationCategory.other") },
    ],
    [t]
  );
  const displayEmployeeName = (item?: EmployeeOption | null) =>
    item ? (locale === "ar" ? item.nameAr : item.nameEn) : "-";

  const displayDepartmentName = (department?: Department | null) =>
    department ? (locale === "ar" ? department.nameAr : department.nameEn) : "-";

  const displayPositionName = (position?: Position | null) =>
    position ? (locale === "ar" ? position.nameAr : position.nameEn) : "-";

  const managerOptions = useMemo(
    () => employees.filter((entry) => entry.status !== "terminated"),
    [employees]
  );

  const loadEmployee = useCallback(() => {
    if (!employeeId) {
      return;
    }
    setLoadingEmployee(true);
    fetch(`/api/employees/${employeeId}`)
      .then((res) => res.json())
      .then((data) => {
        const record = data.employee as Employee | undefined;
        if (!record) {
          return;
        }
        setForm({
          employeeNumber: record.employeeNumber ?? "",
          nameAr: record.nameAr ?? "",
          nameEn: record.nameEn ?? "",
          nationalId: record.nationalId ?? "",
          iqamaNumber: record.iqamaNumber ?? "",
          passportNumber: record.passportNumber ?? "",
          nationality: record.nationality ?? "",
          dob: record.dob ?? "",
          gender: record.gender ?? "",
          email: record.email ?? "",
          phone: record.phone ?? "",
          address: record.address ?? "",
          hireDate: record.hireDate ?? "",
          departmentId: record.departmentId ?? "",
          positionId: record.positionId ?? "",
          managerId: record.managerId ?? "",
          userId: record.userId ?? "",
          employmentType: record.employmentType ?? "",
          status: record.status,
          terminationDate: record.terminationDate ?? "",
          terminationCategory: record.terminationCategory ?? "",
          terminationReason: record.terminationReason ?? "",
          notes: record.notes ?? "",
          transferEffectiveDate: "",
          transferReason: "",
          onboarding: record.onboarding ?? [],
        });
      })
      .catch(() => setForm(null))
      .finally(() => setLoadingEmployee(false));
  }, [employeeId]);

  const loadLookups = useCallback(() => {
    if (!activeCompanyId) {
      return;
    }
    setLoadingLookups(true);
    Promise.all([
      fetch(`/api/departments?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/positions?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/employees?companyId=${activeCompanyId}`).then((res) => res.json()),
      fetch(`/api/users?companyId=${activeCompanyId}`).then((res) => res.json()),
    ])
      .then(([departmentData, positionData, employeeData, userData]) => {
        setDepartments(departmentData.departments ?? []);
        setPositions(positionData.positions ?? []);
        setEmployees(employeeData.employees ?? []);
        setUsers(userData.users ?? []);
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingLookups(false));
  }, [activeCompanyId]);

  const loadRelated = useCallback(() => {
    if (!employeeId) {
      return;
    }
    setLoadingRelated(true);
    Promise.all([
      fetch(`/api/employees/${employeeId}/contracts`).then((res) => res.json()),
      fetch(`/api/employees/${employeeId}/documents`).then((res) => res.json()),
      fetch(`/api/employees/${employeeId}/transfers`).then((res) => res.json()),
      fetch(`/api/employees/${employeeId}/end-of-service`).then((res) => res.json()),
    ])
      .then(([contractData, documentData, transferData, eosData]) => {
        setContracts(contractData.contracts ?? []);
        setDocuments(documentData.documents ?? []);
        setTransfers(transferData.transfers ?? []);
        setEndOfServiceSummary(eosData.summary ?? null);
      })
      .catch(() => setErrorKey("error.loadFailed"))
      .finally(() => setLoadingRelated(false));
  }, [employeeId]);

  useEffect(() => {
    loadEmployee();
  }, [loadEmployee]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    loadRelated();
  }, [loadRelated]);

  const updateField = <K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleSave = () => {
    if (!employeeId || !activeCompanyId || !form) {
      return;
    }
    if (!form.nameAr.trim() || !form.nameEn.trim()) {
      setErrorKey("hr.employees.missingName");
      return;
    }
    if (!form.hireDate) {
      setErrorKey("hr.employees.missingHireDate");
      return;
    }
    if (form.status === "terminated" && !form.terminationDate) {
      setErrorKey("hr.employees.missingTerminationDate");
      return;
    }
    if (form.status === "terminated" && !form.terminationCategory) {
      setErrorKey("hr.employees.missingTerminationCategory");
      return;
    }

    setErrorKey(null);
    setSuccessKey(null);
    startTransition(async () => {
      const response = await fetch(`/api/employees/${employeeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          employeeNumber: form.employeeNumber.trim() || null,
          nameAr: form.nameAr.trim(),
          nameEn: form.nameEn.trim(),
          nationalId: form.nationalId.trim() || null,
          iqamaNumber: form.iqamaNumber.trim() || null,
          passportNumber: form.passportNumber.trim() || null,
          nationality: form.nationality.trim() || null,
          dob: form.dob || null,
          gender: form.gender || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          hireDate: form.hireDate || null,
          departmentId: form.departmentId || null,
          positionId: form.positionId || null,
          managerId: form.managerId || null,
          userId: form.userId || null,
          employmentType: form.employmentType || null,
          status: form.status,
          terminationDate: form.status === "terminated" ? form.terminationDate : null,
          terminationCategory:
            form.status === "terminated" ? form.terminationCategory : null,
          terminationReason:
            form.status === "terminated" ? form.terminationReason.trim() || null : null,
          notes: form.notes.trim() || null,
          onboarding: form.onboarding,
          transferEffectiveDate: form.transferEffectiveDate || null,
          transferReason: form.transferReason.trim() || null,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setErrorKey(mapEmployeeError(data?.error));
        return;
      }
      setSuccessKey("hr.employees.saved");
      updateField("transferEffectiveDate", "");
      updateField("transferReason", "");
      loadEmployee();
      loadRelated();
    });
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim() || !form) {
      return;
    }
    const nextTask: OnboardingTask = {
      id: crypto.randomUUID(),
      title: newTaskTitle.trim(),
      completed: false,
    };
    updateField("onboarding", [...form.onboarding, nextTask]);
    setNewTaskTitle("");
  };

  const handleToggleTask = (taskId: string) => {
    if (!form) {
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const next = form.onboarding.map((task) => {
      if (task.id !== taskId) {
        return task;
      }
      const completed = !task.completed;
      return {
        ...task,
        completed,
        completedAt: completed ? today : null,
      };
    });
    updateField("onboarding", next);
  };
  const handleCreateContract = () => {
    if (!activeCompanyId || !employeeId) {
      return;
    }

    const parseNumber = (value: string) => {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    startTransition(async () => {
      const response = await fetch(`/api/employees/${employeeId}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: activeCompanyId,
          type: contractType,
          status: contractStatus,
          startDate: contractStartDate || null,
          endDate: contractEndDate || null,
          probationEndDate: contractProbation || null,
          salary: {
            basic: parseNumber(salaryBasic),
            housingAllowance: parseNumber(salaryHousing),
            transportAllowance: parseNumber(salaryTransport),
            otherAllowance: parseNumber(salaryOther),
            deductions: parseNumber(salaryDeductions),
            currency: salaryCurrency || "SAR",
          },
          notes: contractNotes.trim() || null,
        }),
      });
      if (!response.ok) {
        setErrorKey("error.saveFailed");
        return;
      }
      setContractType("full_time");
      setContractStatus("active");
      setContractStartDate("");
      setContractEndDate("");
      setContractProbation("");
      setSalaryBasic("");
      setSalaryHousing("");
      setSalaryTransport("");
      setSalaryOther("");
      setSalaryDeductions("");
      setSalaryCurrency("SAR");
      setContractNotes("");
      loadRelated();
    });
  };

  const formatMoney = (value: number, currency = "SAR") => `${value.toFixed(2)} ${currency}`;

  const handleContractStatus = (contractId: string, status: EmployeeContract["status"]) => {
    if (!employeeId) {
      return;
    }
    startTransition(async () => {
      await fetch(`/api/employees/${employeeId}/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      loadRelated();
    });
  };

  const handleUploadDocument = () => {
    if (!activeCompanyId || !employeeId) {
      return;
    }
    if (!documentName.trim() && !documentFile && documentStorage === "cloudinary") {
      setErrorKey("hr.documents.missingName");
      return;
    }
    if (documentStorage === "cloudinary" && !documentFile) {
      setErrorKey("hr.documents.missingFile");
      return;
    }
    if (documentStorage === "firestore" && !documentContent.trim()) {
      setErrorKey("hr.documents.missingContent");
      return;
    }

    setErrorKey(null);
    startTransition(async () => {
      try {
        let payload: Record<string, unknown> = {
          companyId: activeCompanyId,
          type: documentType,
          name: documentName.trim() || documentFile?.name || "Document",
          issuedAt: documentIssuedAt || null,
          expiresAt: documentExpiresAt || null,
        };
        if (documentStorage === "cloudinary" && documentFile) {
          const url = await uploadToCloudinary(
            documentFile,
            `companies/${activeCompanyId}/employees/${employeeId}`
          );
          payload = {
            ...payload,
            contentType: documentFile.type || "application/octet-stream",
            size: documentFile.size,
            storage: "cloudinary",
            url,
          };
        } else {
          const content = documentContent.trim();
          payload = {
            ...payload,
            contentType: "text/plain",
            size: content.length,
            storage: "firestore",
            content,
          };
        }

        const response = await fetch(`/api/employees/${employeeId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          setErrorKey("hr.documents.uploadFailed");
          return;
        }
        setDocumentName("");
        setDocumentIssuedAt("");
        setDocumentExpiresAt("");
        setDocumentFile(null);
        setDocumentContent("");
        loadRelated();
      } catch {
        setErrorKey("hr.documents.uploadFailed");
      }
    });
  };

  const handleDeleteDocument = (documentId: string) => {
    if (!employeeId) {
      return;
    }
    startTransition(async () => {
      await fetch(`/api/employees/${employeeId}/documents/${documentId}`, {
        method: "DELETE",
      });
      loadRelated();
    });
  };

  const salaryTotal = useMemo(() => {
    const parseNumber = (value: string) => {
      const parsed = Number(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    return (
      parseNumber(salaryBasic) +
      parseNumber(salaryHousing) +
      parseNumber(salaryTransport) +
      parseNumber(salaryOther) -
      parseNumber(salaryDeductions)
    );
  }, [salaryBasic, salaryHousing, salaryTransport, salaryOther, salaryDeductions]);

  if (!employeeId) {
    return null;
  }

  return (
    <section className="space-y-6 page-shell">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold page-title">{t("hr.employees.detailsTitle")}</h1>
          <p className="text-sm text-muted page-subtitle">{t("hr.employees.detailsSubtitle")}</p>
        </div>
        <Link
          href="/hr/employees"
          className="text-sm font-semibold text-foreground underline decoration-dotted"
        >
          {t("hr.employees.backToList")}
        </Link>
      </div>

      {errorKey ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {t(errorKey)}
        </div>
      ) : null}
      {successKey ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {t(successKey)}
        </div>
      ) : null}

      {!form || loadingEmployee ? (
        <div className="app-panel space-y-3 p-4">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-8 w-56" />
          <SkeletonBlock className="h-4 w-48" />
          <div className="grid gap-3 md:grid-cols-3">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        </div>
      ) : (
        <>
          <div className="app-card p-6 card-modern">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{t("hr.employees.profileTitle")}</h2>
              <span className="text-xs text-muted">{t("common.optional")}</span>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.employees.employeeNumber")}
                </span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.employeeNumber}
                  onChange={(event) => updateField("employeeNumber", event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.employees.nameAr")}
                </span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.nameAr}
                  onChange={(event) => updateField("nameAr", event.target.value)}
                  required
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.employees.nameEn")}
                </span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.nameEn}
                  onChange={(event) => updateField("nameEn", event.target.value)}
                  required
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.employees.nationalId")}
                </span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.nationalId}
                  onChange={(event) => updateField("nationalId", event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.employees.iqamaNumber")}
                </span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.iqamaNumber}
                  onChange={(event) => updateField("iqamaNumber", event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.employees.passportNumber")}
                </span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.passportNumber}
                  onChange={(event) => updateField("passportNumber", event.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.employees.nationality")}
                </span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.nationality}
                  onChange={(event) => updateField("nationality", event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("hr.employees.dob")}</span>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.dob}
                  onChange={(event) => updateField("dob", event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("hr.employees.gender")}</span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.gender}
                  onChange={(event) => updateField("gender", event.target.value)}
                >
                  <option value="">{t("common.none")}</option>
                  <option value="male">{t("hr.employees.gender.male")}</option>
                  <option value="female">{t("hr.employees.gender.female")}</option>
                </select>
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("common.email")}</span>
                <input
                  type="email"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.email}
                  onChange={(event) => updateField("email", event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("common.phone")}</span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("hr.employees.address")}</span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.address}
                  onChange={(event) => updateField("address", event.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.employees.hireDate")}
                </span>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.hireDate}
                  onChange={(event) => updateField("hireDate", event.target.value)}
                  required
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.employees.employmentType")}
                </span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.employmentType}
                  onChange={(event) => updateField("employmentType", event.target.value)}
                >
                  <option value="">{t("common.none")}</option>
                  {typeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("common.status")}</span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.status}
                  onChange={(event) =>
                    updateField(
                      "status",
                      event.target.value as EmployeeForm["status"]
                    )
                  }
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.employees.department")}
                </span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.departmentId}
                  onChange={(event) => updateField("departmentId", event.target.value)}
                  disabled={loadingLookups}
                >
                  <option value="">{t("common.none")}</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {displayDepartmentName(department)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.employees.position")}
                </span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.positionId}
                  onChange={(event) => updateField("positionId", event.target.value)}
                  disabled={loadingLookups}
                >
                  <option value="">{t("common.none")}</option>
                  {positions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {displayPositionName(position)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.employees.manager")}
                </span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.managerId}
                  onChange={(event) => updateField("managerId", event.target.value)}
                  disabled={loadingLookups}
                >
                  <option value="">{t("common.none")}</option>
                  {managerOptions.map((employeeOption) => (
                    <option key={employeeOption.id} value={employeeOption.id}>
                      {displayEmployeeName(employeeOption)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {form.status === "terminated" ? (
                <div className="mt-4 grid gap-4 md:grid-cols-4">
                  <label className={`text-sm ${alignClass}`}>
                    <span className="mb-1 block text-xs text-muted">
                      {t("hr.employees.terminationDate")}
                  </span>
                  <input
                    type="date"
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={form.terminationDate}
                    onChange={(event) =>
                      updateField("terminationDate", event.target.value)
                    }
                  />
                </label>
                <label className={`text-sm ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">
                    {t("hr.employees.terminationCategory")}
                  </span>
                  <select
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={form.terminationCategory}
                    onChange={(event) =>
                      updateField("terminationCategory", event.target.value)
                    }
                  >
                    <option value="">{t("common.none")}</option>
                    {terminationCategoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`text-sm md:col-span-2 ${alignClass}`}>
                  <span className="mb-1 block text-xs text-muted">
                    {t("hr.employees.terminationReason")}
                  </span>
                  <input
                    className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    value={form.terminationReason}
                    onChange={(event) =>
                      updateField("terminationReason", event.target.value)
                    }
                    />
                  </label>
                </div>
              ) : null}

              <div className="mt-6 rounded-2xl border border-border bg-surface px-4 py-3">
                <h3 className="text-sm font-semibold">{t("hr.employees.eosbTitle")}</h3>
                <p className="mt-1 text-xs text-muted">{t("hr.employees.eosbSubtitle")}</p>
                {endOfServiceSummary?.eligible ? (
                  <div className="mt-3 grid gap-4 md:grid-cols-4">
                    <div>
                      <p className="text-xs text-muted">{t("hr.employees.eosbAward")}</p>
                      <p className="text-sm font-semibold">
                        {formatMoney(endOfServiceSummary.awardAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">{t("hr.employees.eosbServiceYears")}</p>
                      <p className="text-sm font-semibold">
                        {endOfServiceSummary.serviceYears.toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">{t("hr.employees.eosbMonthlyWage")}</p>
                      <p className="text-sm font-semibold">
                        {formatMoney(endOfServiceSummary.monthlyWage)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted">{t("hr.employees.terminationCategory")}</p>
                      <p className="text-sm font-semibold">
                        {t(`hr.employees.terminationCategory.${endOfServiceSummary.terminationCategory}`)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted">{t("hr.employees.eosbUnavailable")}</p>
                )}
              </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.employees.linkedUser")}
                </span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.userId}
                  onChange={(event) => updateField("userId", event.target.value)}
                  disabled={loadingLookups}
                >
                  <option value="">{t("common.none")}</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("common.notes")}</span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.notes}
                  onChange={(event) => updateField("notes", event.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.transfers.effectiveDate")}
                </span>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.transferEffectiveDate}
                  onChange={(event) =>
                    updateField("transferEffectiveDate", event.target.value)
                  }
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.transfers.reason")}
                </span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={form.transferReason}
                  onChange={(event) => updateField("transferReason", event.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="mt-4 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            >
              {t("common.save")}
            </button>
          </div>

          <div className="app-card p-6 card-modern">
            <h2 className="text-lg font-semibold">{t("hr.onboarding.title")}</h2>
            <p className="mt-1 text-sm text-muted page-subtitle">{t("hr.onboarding.subtitle")}</p>
            <div className="mt-4 space-y-2">
              {form.onboarding.length === 0 ? (
                <p className="text-sm text-muted page-subtitle">{t("hr.onboarding.empty")}</p>
              ) : (
                form.onboarding.map((task) => (
                  <label key={task.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => handleToggleTask(task.id)}
                    />
                    <span>{task.title}</span>
                  </label>
                ))
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <input
                className="flex-1 rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                value={newTaskTitle}
                onChange={(event) => setNewTaskTitle(event.target.value)}
                placeholder={t("hr.onboarding.addPlaceholder")}
              />
              <button
                type="button"
                onClick={handleAddTask}
                className="rounded-2xl border border-border px-4 py-2 text-sm font-semibold transition hover:border-primary"
              >
                {t("hr.onboarding.add")}
              </button>
            </div>
          </div>
          <div className="app-card p-6 card-modern">
            <h2 className="text-lg font-semibold">{t("hr.contracts.title")}</h2>
            <p className="mt-1 text-sm text-muted page-subtitle">{t("hr.contracts.subtitle")}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("hr.contracts.type")}</span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={contractType}
                  onChange={(event) =>
                    setContractType(event.target.value as EmployeeContract["type"])
                  }
                >
                  {contractTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("hr.contracts.status")}</span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={contractStatus}
                  onChange={(event) =>
                    setContractStatus(event.target.value as EmployeeContract["status"])
                  }
                >
                  {contractStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("hr.contracts.startDate")}</span>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={contractStartDate}
                  onChange={(event) => setContractStartDate(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("hr.contracts.endDate")}</span>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={contractEndDate}
                  onChange={(event) => setContractEndDate(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.contracts.probationEnd")}
                </span>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={contractProbation}
                  onChange={(event) => setContractProbation(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.contracts.currency")}
                </span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={salaryCurrency}
                  onChange={(event) => setSalaryCurrency(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.contracts.salaryBasic")}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={salaryBasic}
                  onChange={(event) => setSalaryBasic(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.contracts.salaryHousing")}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={salaryHousing}
                  onChange={(event) => setSalaryHousing(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.contracts.salaryTransport")}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={salaryTransport}
                  onChange={(event) => setSalaryTransport(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.contracts.salaryOther")}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={salaryOther}
                  onChange={(event) => setSalaryOther(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.contracts.salaryDeductions")}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={salaryDeductions}
                  onChange={(event) => setSalaryDeductions(event.target.value)}
                />
              </label>
              <div className="text-sm">
                <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
                  {t("hr.contracts.total")}
                </span>
                <div className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm">
                  {salaryTotal} {salaryCurrency || "SAR"}
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("common.notes")}</span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={contractNotes}
                  onChange={(event) => setContractNotes(event.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              onClick={handleCreateContract}
              className="mt-4 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            >
              {t("hr.contracts.create")}
            </button>

            <div className="mt-6">
              <h3 className="text-sm font-semibold">{t("hr.contracts.listTitle")}</h3>
              {loadingRelated ? (
                <div className="mt-3 space-y-2">
                  <SkeletonBlock className="h-4 w-40" />
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <SkeletonBlock key={idx} className="h-10 w-full" />
                  ))}
                </div>
              ) : contracts.length === 0 ? (
                <p className="mt-2 text-sm text-muted page-subtitle">{t("hr.contracts.empty")}</p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm table-modern">
                    <thead className="bg-surface-muted text-muted thead-modern">
                      <tr>
                        <th className={`px-3 py-2 ${alignClass}`}>
                          {t("hr.contracts.type")}
                        </th>
                        <th className={`px-3 py-2 ${alignClass}`}>
                          {t("hr.contracts.startDate")}
                        </th>
                        <th className={`px-3 py-2 ${alignClass}`}>
                          {t("hr.contracts.endDate")}
                        </th>
                        <th className={`px-3 py-2 ${alignClass}`}>
                          {t("hr.contracts.status")}
                        </th>
                        <th className={`px-3 py-2 ${alignClass}`}>
                          {t("common.actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {contracts.map((contract) => (
                        <tr key={contract.id}>
                          <td className="px-3 py-2">
                            {t(`hr.contracts.type.${contract.type}`)}
                          </td>
                          <td className="px-3 py-2">{contract.startDate ?? "-"}</td>
                          <td className="px-3 py-2">{contract.endDate ?? "-"}</td>
                          <td className="px-3 py-2">
                            {t(`hr.contracts.status.${contract.status}`)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-2 text-xs">
                              {contract.status !== "active" ? (
                                <button
                                  type="button"
                                  onClick={() => handleContractStatus(contract.id, "active")}
                                  className="font-semibold text-primary"
                                >
                                  {t("hr.contracts.activate")}
                                </button>
                              ) : null}
                              {contract.status === "active" ? (
                                <button
                                  type="button"
                                  onClick={() => handleContractStatus(contract.id, "ended")}
                                  className="font-semibold text-muted"
                                >
                                  {t("hr.contracts.end")}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <div className="app-card p-6 card-modern">
            <h2 className="text-lg font-semibold">{t("hr.documents.title")}</h2>
            <p className="mt-1 text-sm text-muted page-subtitle">{t("hr.documents.subtitle")}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("hr.documents.type")}</span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={documentType}
                  onChange={(event) =>
                    setDocumentType(event.target.value as EmployeeDocument["type"])
                  }
                >
                  <option value="id">{t("hr.documents.type.id")}</option>
                  <option value="contract">{t("hr.documents.type.contract")}</option>
                  <option value="certificate">{t("hr.documents.type.certificate")}</option>
                  <option value="other">{t("hr.documents.type.other")}</option>
                </select>
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">{t("hr.documents.name")}</span>
                <input
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={documentName}
                  onChange={(event) => setDocumentName(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.documents.storage")}
                </span>
                <select
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={documentStorage}
                  onChange={(event) =>
                    setDocumentStorage(event.target.value as "cloudinary" | "firestore")
                  }
                >
                  <option value="cloudinary">{t("hr.documents.storage.cloudinary")}</option>
                  <option value="firestore">{t("hr.documents.storage.firestore")}</option>
                </select>
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.documents.issuedAt")}
                </span>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={documentIssuedAt}
                  onChange={(event) => setDocumentIssuedAt(event.target.value)}
                />
              </label>
              <label className={`text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.documents.expiresAt")}
                </span>
                <input
                  type="date"
                  className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={documentExpiresAt}
                  onChange={(event) => setDocumentExpiresAt(event.target.value)}
                />
              </label>
            </div>
            {documentStorage === "cloudinary" ? (
              <label className="mt-4 block text-sm">
                <span className={`mb-1 block text-xs text-muted ${alignClass}`}>
                  {t("hr.documents.file")}
                </span>
                <input
                  type="file"
                  className="block w-full text-xs"
                  onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)}
                />
              </label>
            ) : (
              <label className={`mt-4 block text-sm ${alignClass}`}>
                <span className="mb-1 block text-xs text-muted">
                  {t("hr.documents.content")}
                </span>
                <textarea
                  className="min-h-[100px] w-full rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                  value={documentContent}
                  onChange={(event) => setDocumentContent(event.target.value)}
                />
              </label>
            )}
            <button
              type="button"
              onClick={handleUploadDocument}
              className="mt-4 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-contrast shadow-sm transition hover:brightness-110"
            >
              {t("hr.documents.upload")}
            </button>

            <div className="mt-6">
              <h3 className="text-sm font-semibold">{t("hr.documents.listTitle")}</h3>
              {loadingRelated ? (
                <div className="mt-3 space-y-2">
                  <SkeletonBlock className="h-4 w-40" />
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <SkeletonBlock key={idx} className="h-10 w-full" />
                  ))}
                </div>
              ) : documents.length === 0 ? (
                <p className="mt-2 text-sm text-muted page-subtitle">{t("hr.documents.empty")}</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {documents.map((document) => (
                    <div
                      key={document.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-semibold">{document.name}</p>
                        <p className="text-xs text-muted">
                          {t(`hr.documents.type.${document.type}`)} •{" "}
                          {document.storage === "cloudinary"
                            ? t("hr.documents.storage.cloudinary")
                            : t("hr.documents.storage.firestore")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs">
                        {document.url ? (
                          <a
                            href={document.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-primary underline"
                          >
                            {t("common.view")}
                          </a>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(document.id)}
                          className="font-semibold text-muted"
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="app-card p-6 card-modern">
            <h2 className="text-lg font-semibold">{t("hr.transfers.title")}</h2>
            <p className="mt-1 text-sm text-muted page-subtitle">{t("hr.transfers.subtitle")}</p>
            {loadingRelated ? (
              <div className="mt-3 space-y-2">
                <SkeletonBlock className="h-4 w-40" />
                {Array.from({ length: 4 }).map((_, idx) => (
                  <SkeletonBlock key={idx} className="h-10 w-full" />
                ))}
              </div>
            ) : transfers.length === 0 ? (
              <p className="mt-3 text-sm text-muted page-subtitle">{t("hr.transfers.empty")}</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm table-modern">
                  <thead className="bg-surface-muted text-muted thead-modern">
                    <tr>
                      <th className={`px-3 py-2 ${alignClass}`}>
                        {t("hr.transfers.effectiveDate")}
                      </th>
                      <th className={`px-3 py-2 ${alignClass}`}>
                        {t("hr.transfers.fromDepartment")}
                      </th>
                      <th className={`px-3 py-2 ${alignClass}`}>
                        {t("hr.transfers.toDepartment")}
                      </th>
                      <th className={`px-3 py-2 ${alignClass}`}>
                        {t("hr.transfers.fromPosition")}
                      </th>
                      <th className={`px-3 py-2 ${alignClass}`}>
                        {t("hr.transfers.toPosition")}
                      </th>
                      <th className={`px-3 py-2 ${alignClass}`}>
                        {t("hr.transfers.reason")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {transfers.map((transfer) => {
                      const fromDepartment = departments.find(
                        (entry) => entry.id === transfer.fromDepartmentId
                      );
                      const toDepartment = departments.find(
                        (entry) => entry.id === transfer.toDepartmentId
                      );
                      const fromPosition = positions.find(
                        (entry) => entry.id === transfer.fromPositionId
                      );
                      const toPosition = positions.find(
                        (entry) => entry.id === transfer.toPositionId
                      );
                      return (
                        <tr key={transfer.id}>
                          <td className="px-3 py-2">{transfer.effectiveDate ?? "-"}</td>
                          <td className="px-3 py-2">
                            {displayDepartmentName(fromDepartment)}
                          </td>
                          <td className="px-3 py-2">
                            {displayDepartmentName(toDepartment)}
                          </td>
                          <td className="px-3 py-2">
                            {displayPositionName(fromPosition)}
                          </td>
                          <td className="px-3 py-2">
                            {displayPositionName(toPosition)}
                          </td>
                          <td className="px-3 py-2">{transfer.reason ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
