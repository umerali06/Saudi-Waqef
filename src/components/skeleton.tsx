"use client";

import type { ReactNode } from "react";

export function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-muted ${className}`} />;
}

export function SkeletonCard({
  titleWidth = "w-24",
  lines = 2,
  className = "",
}: {
  titleWidth?: string;
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`app-panel space-y-3 p-4 ${className}`}>
      <SkeletonBlock className={`h-3 ${titleWidth}`} />
      <SkeletonBlock className="h-7 w-32" />
      {Array.from({ length: lines }).map((_, idx) => (
        <SkeletonBlock key={idx} className="h-3 w-full" />
      ))}
    </div>
  );
}

export function SkeletonSection({
  titleWidth = "w-40",
  children,
}: {
  titleWidth?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <SkeletonBlock className={`h-4 ${titleWidth}`} />
      {children}
    </div>
  );
}
