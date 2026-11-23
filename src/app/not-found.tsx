import Link from "next/link";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, messages, type Locale } from "@/i18n/messages";

export default async function NotFound() {
  const locale = ((await cookies()).get("locale")?.value as Locale | undefined) ?? DEFAULT_LOCALE;
  const text = messages[locale] ?? messages[DEFAULT_LOCALE];
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="text-5xl font-semibold text-primary">404</p>
      <h1 className="mt-4 text-xl font-semibold">{text["notFound.title"]}</h1>
      <p className="mt-2 text-sm leading-6 text-muted">{text["notFound.body"]}</p>
      <div className="mt-5">
        <Link href="/" className="btn-primary">
          {text["pageError.home"]}
        </Link>
      </div>
    </main>
  );
}
