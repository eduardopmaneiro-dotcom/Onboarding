"use client";

import { useState } from "react";

function mask(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function CpfInput({ name = "cpf", id = "cpf", required = true, defaultValue = "" }: { name?: string; id?: string; required?: boolean; defaultValue?: string }) {
  const [value, setValue] = useState(mask(defaultValue));
  return (
    <input
      id={id}
      name={name}
      required={required}
      inputMode="numeric"
      autoComplete="username"
      placeholder="000.000.000-00"
      className="input font-mono tracking-wide"
      value={value}
      onChange={(e) => setValue(mask(e.target.value))}
    />
  );
}
