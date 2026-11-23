import { renderBilingualEmail, renderEmail, type EmailLocale } from "@/lib/email/template";

/** Registration mails carry both languages because the reader's language is not known. */
const bilingualSubject = (first: EmailLocale, ar: string, en: string) =>
  first === "en" ? `${en} | ${ar}` : `${ar} | ${en}`;

const ROLE_LABELS: Record<string, Record<EmailLocale, string>> = {
  owner: { ar: "مالك", en: "owner" },
  admin: { ar: "مسؤول", en: "admin" },
  accountant: { ar: "محاسب", en: "accountant" },
  hr: { ar: "موارد بشرية", en: "HR" },
  employee: { ar: "موظف", en: "employee" },
  viewer: { ar: "مشاهد", en: "viewer" },
};

export const roleLabel = (role: string, locale: EmailLocale) =>
  ROLE_LABELS[role]?.[locale] ?? role;

type RequestInfo = {
  kind: "new" | "join";
  name: string;
  email: string;
  companyName: string;
  requestedRole: string;
  phone?: string | null;
  crNumber?: string | null;
  vatNumber?: string | null;
};

export function registrationReceivedMail(params: {
  locale: EmailLocale;
  request: RequestInfo;
  hasAccount: boolean;
  loginUrl: string;
  forgotUrl: string;
}) {
  const { request, hasAccount } = params;
  const isNew = request.kind === "new";
  return {
    subject: bilingualSubject(params.locale, "استلمنا طلبك", "We received your request"),
    body: renderBilingualEmail({
      first: params.locale,
      ar: {
        heading: "استلمنا طلبك",
        paragraphs: [
          `مرحبًا ${request.name}،`,
          isNew
            ? `وصلنا طلب فتح حساب جديد لشركة «${request.companyName}». يراجعه فريق سعودي واقف، وعند الموافقة يصلك بريد ببيانات الدخول وتكون أنت مالك الحساب.`
            : `وصلنا طلب انضمامك إلى «${request.companyName}» بدور ${roleLabel(request.requestedRole, "ar")}. يراجعه مالك الشركة، وستصلك النتيجة بالبريد.`,
          ...(hasAccount
            ? [
                `لديك حساب في سعودي واقف بهذا البريد. سجّل الدخول به، وإن نسيت كلمة المرور فأعد تعيينها من هنا: ${params.forgotUrl}`,
              ]
            : []),
        ],
        action: hasAccount ? { label: "تسجيل الدخول", url: params.loginUrl } : undefined,
      },
      en: {
        heading: "We received your request",
        paragraphs: [
          `Hello ${request.name},`,
          isNew
            ? `We received your request to open a new account for "${request.companyName}". The Saudi Waqef team reviews it. Once it is approved, you will get an email with your sign-in details and you will be the owner of the account.`
            : `We received your request to join "${request.companyName}" as ${roleLabel(request.requestedRole, "en")}. The company owner reviews it, and we will email you the decision.`,
          ...(hasAccount
            ? [
                `You already have a Saudi Waqef account with this email. Sign in with it, or reset the password here if you forgot it: ${params.forgotUrl}`,
              ]
            : []),
        ],
        action: hasAccount ? { label: "Sign in", url: params.loginUrl } : undefined,
      },
    }),
  };
}

const requestDetails = (request: RequestInfo, locale: EmailLocale): Array<[string, string]> => {
  const ar = locale === "ar";
  const rows: Array<[string, string | null | undefined]> = [
    [ar ? "الاسم" : "Name", request.name],
    [ar ? "البريد" : "Email", request.email],
    [ar ? "الجوال" : "Mobile", request.phone],
    [ar ? "الشركة" : "Company", request.companyName],
    [ar ? "الدور المطلوب" : "Requested role", roleLabel(request.requestedRole, locale)],
    [ar ? "السجل التجاري" : "CR number", request.crNumber],
    [ar ? "الرقم الضريبي" : "VAT number", request.vatNumber],
  ];
  return rows.filter((row): row is [string, string] => Boolean(row[1]));
};

/** To a company owner, in the company's language. */
export function ownerAccessRequestMail(params: {
  locale: EmailLocale;
  companyName: string;
  request: RequestInfo;
  reviewUrl: string;
}) {
  const ar = params.locale === "ar";
  return {
    subject: ar
      ? `طلب انضمام إلى ${params.companyName}`
      : `Request to join ${params.companyName}`,
    body: renderEmail({
      locale: params.locale,
      companyName: params.companyName,
      heading: ar ? "طلب انضمام جديد" : "New request to join",
      paragraphs: [
        ar
          ? "طلب الشخص التالي الانضمام إلى شركتك. لا يحصل على أي صلاحية قبل موافقتك."
          : "The person below asked to join your company. They get no access until you approve.",
      ],
      details: requestDetails(params.request, params.locale),
      action: { label: ar ? "مراجعة الطلب" : "Review request", url: params.reviewUrl },
    }),
  };
}

/** To the platform team. */
export function platformRequestMail(params: {
  locale: EmailLocale;
  request: RequestInfo;
  linked: boolean;
  reviewUrl: string;
}) {
  const note: Record<EmailLocale, string> =
    params.request.kind === "new"
      ? {
          ar: "طلب فتح حساب لشركة جديدة. الموافقة تنشئ الشركة وتجعل مقدم الطلب مالكها.",
          en: "A request to open a new company account. Approving it creates the company with the applicant as its owner.",
        }
      : params.linked
      ? {
          ar: "طلب انضمام إلى شركة مسجلة. أُبلغ مالكوها أيضًا.",
          en: "A request to join an existing company. Its owners were notified as well.",
        }
      : {
          ar: "طلب انضمام إلى شركة لم نجد اسمها بين الشركات المسجلة.",
          en: "A request to join a company whose name matches no registered company.",
        };
  return {
    subject: bilingualSubject(
      params.locale,
      `طلب جديد: ${params.request.companyName}`,
      `New request: ${params.request.companyName}`
    ),
    body: renderBilingualEmail({
      first: params.locale,
      ar: {
        heading: "طلب تسجيل جديد",
        paragraphs: [note.ar],
        details: requestDetails(params.request, "ar"),
        action: { label: "مراجعة الطلب", url: params.reviewUrl },
      },
      en: {
        heading: "New registration request",
        paragraphs: [note.en],
        details: requestDetails(params.request, "en"),
        action: { label: "Review request", url: params.reviewUrl },
      },
    }),
  };
}

export function registrationApprovedMail(params: {
  locale: EmailLocale;
  name: string;
  email: string;
  companyName: string;
  isNewCompany: boolean;
  role: string;
  /** Null when the person already had an account. */
  password: string | null;
  loginUrl: string;
}) {
  const { password } = params;
  return {
    subject: bilingualSubject(params.locale, "تمت الموافقة على طلبك", "Your request was approved"),
    body: renderBilingualEmail({
      first: params.locale,
      ar: {
        heading: "تمت الموافقة على طلبك",
        paragraphs: [
          `مرحبًا ${params.name}،`,
          params.isNewCompany
            ? `أصبح حساب «${params.companyName}» جاهزًا وأنت مالكه.`
            : `أصبحت عضوًا في «${params.companyName}» بدور ${roleLabel(params.role, "ar")}.`,
          password
            ? "ادخل بالبيانات التالية ثم غيّر كلمة المرور من صفحة «حسابي»."
            : "سجّل الدخول بحسابك الحالي، ثم اختر الشركة من القائمة أعلى الصفحة.",
        ],
        details: password
          ? [
              ["البريد", params.email],
              ["كلمة المرور المؤقتة", password],
            ]
          : undefined,
        action: { label: "تسجيل الدخول", url: params.loginUrl },
      },
      en: {
        heading: "Your request was approved",
        paragraphs: [
          `Hello ${params.name},`,
          params.isNewCompany
            ? `The account for "${params.companyName}" is ready and you are its owner.`
            : `You are now a member of "${params.companyName}" as ${roleLabel(params.role, "en")}.`,
          password
            ? 'Sign in with the details below, then change the password on the "My account" page.'
            : "Sign in with your existing account, then choose the company from the list at the top of the page.",
        ],
        details: password
          ? [
              ["Email", params.email],
              ["Temporary password", password],
            ]
          : undefined,
        action: { label: "Sign in", url: params.loginUrl },
      },
    }),
  };
}

export function registrationRejectedMail(params: {
  locale: EmailLocale;
  kind: "new" | "join";
  name: string;
  companyName: string;
  registerUrl: string;
}) {
  const isJoin = params.kind === "join";
  return {
    subject: bilingualSubject(params.locale, "بخصوص طلبك", "About your request"),
    body: renderBilingualEmail({
      first: params.locale,
      ar: {
        heading: "لم تتم الموافقة على طلبك",
        paragraphs: [
          `مرحبًا ${params.name}،`,
          `راجعنا طلبك الخاص بـ «${params.companyName}» ولم تتم الموافقة عليه.`,
          isJoin
            ? "إن كان هناك خطأ فتأكد من اسم الشركة كما هو مسجل، أو اطلب من مالكها أن يرسل لك دعوة."
            : "إن كانت بعض البيانات غير مكتملة فيمكنك إرسال الطلب من جديد.",
        ],
        action: { label: "إرسال طلب جديد", url: params.registerUrl },
      },
      en: {
        heading: "Your request was not approved",
        paragraphs: [
          `Hello ${params.name},`,
          `We reviewed your request for "${params.companyName}" and it was not approved.`,
          isJoin
            ? "If this is a mistake, check the company name exactly as registered, or ask its owner to send you an invite."
            : "If some details were missing, you can send the request again.",
        ],
        action: { label: "Send a new request", url: params.registerUrl },
      },
    }),
  };
}
