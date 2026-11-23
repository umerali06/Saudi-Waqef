"use client";

import { PageError } from "@/components/page-error";

export default function ErrorPage(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError {...props} home="/dashboard" />;
}
