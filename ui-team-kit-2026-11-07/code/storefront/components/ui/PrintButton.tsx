"use client";

/** Opens the browser's print dialog — where «حفظ PDF» is one of the printers. */
export function PrintButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      {label}
    </button>
  );
}
