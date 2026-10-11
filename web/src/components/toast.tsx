import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { ToastContext, type ToastType } from "@/hooks/use-toast";

interface ToastItem {
  id: number;
  lines: string[];
  type: ToastType;
}

const TOAST_DURATION_MS = 4000;

const colorMap: Record<ToastType, string> = {
  success: "bg-green-500",
  error: "bg-red-500",
  info: "bg-white border border-sky-200 text-slate-700 shadow-lg",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idCounter = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  // A message can span several lines; the first line is shown in bold.
  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++idCounter.current;
    const lines = message.split("\n").filter((line) => line.trim() !== "");
    setToasts((prev) => [...prev, { id, lines, type }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      timersRef.current.delete(id);
    }, TOAST_DURATION_MS);
    timersRef.current.set(id, timer);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed right-5 bottom-5 z-[9999] flex flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`${colorMap[toast.type]} pointer-events-auto max-w-xs rounded-xl px-5 py-3 text-sm text-white shadow-lg animate-in fade-in slide-in-from-bottom-2`}
          >
            {toast.lines.map((line, index) => (
              <p key={index} className={index === 0 ? "font-semibold" : "mt-0.5 text-white/80"}>
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
