"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  onClick?: () => void;
}

type ToastOptions = { durationMs?: number; onClick?: () => void };

interface ToastContextType {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info", options: ToastOptions = {}) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, onClick: options.onClick }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, options.durationMs ?? 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              item.onClick?.();
              setToasts((prev) => prev.filter((entry) => entry.id !== item.id));
            }}
            className={cn(
              "pointer-events-auto w-full max-w-sm rounded-lg border border-border border-s-4 bg-surface px-4 py-3 text-start text-sm text-foreground shadow-lg",
              item.type === "success" && "border-s-[#0f7a52]",
              item.type === "error" && "border-s-[#b3372f]",
              item.type === "info" && "border-s-primary"
            )}
          >
            {item.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
