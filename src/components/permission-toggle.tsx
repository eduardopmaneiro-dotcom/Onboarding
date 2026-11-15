"use client";

import { useState, useTransition } from "react";
import type { ActionState } from "@/modules/shared/action";

export function PermissionToggle({ granted, locked, toggle, label }: { granted: boolean; locked?: boolean; label: string; toggle: (next: boolean) => Promise<ActionState> }) {
  const [value, setValue] = useState(granted);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-center">
      <input
        type="checkbox"
        aria-label={label}
        checked={value}
        disabled={pending || locked}
        title={locked ? "Obrigatória para o Administrador" : undefined}
        className="h-4 w-4 cursor-pointer rounded accent-riale-900 disabled:cursor-not-allowed"
        onChange={(e) => {
          const next = e.target.checked;
          setValue(next);
          start(async () => {
            const r = await toggle(next);
            if (!r?.ok) {
              setValue(!next);
              setErr(r?.message ?? "Erro");
            } else setErr(null);
          });
        }}
      />
      {err && <span className="mt-1 text-[10px] text-red-600">{err}</span>}
    </span>
  );
}
