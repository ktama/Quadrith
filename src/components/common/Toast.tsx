import { useToastStore } from "../../stores/toastStore";

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-2 rounded-lg shadow-lg text-sm text-white ${
            t.kind === "error" ? "bg-red-600" : "bg-slate-800"
          }`}
        >
          <span>{t.message}</span>
          {t.actionLabel && (
            <button
              className="font-bold text-blue-300 hover:text-blue-200 shrink-0"
              onClick={() => {
                t.onAction?.();
                dismiss(t.id);
              }}
            >
              {t.actionLabel}
            </button>
          )}
          <button
            className="text-slate-400 hover:text-white shrink-0"
            onClick={() => dismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
