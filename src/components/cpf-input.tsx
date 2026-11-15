"use client";

function mask(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/** Campo de CPF com máscara. Não controlado: preserva o valor em erros e limpa com form.reset(). */
export function CpfInput({ name = "cpf", id = "cpf", required = true, defaultValue = "" }: { name?: string; id?: string; required?: boolean; defaultValue?: string }) {
  return (
    <input
      id={id}
      name={name}
      required={required}
      inputMode="numeric"
      autoComplete="username"
      placeholder="000.000.000-00"
      className="input font-mono tracking-wide"
      defaultValue={mask(defaultValue)}
      onChange={(e) => {
        const masked = mask(e.target.value);
        if (masked !== e.target.value) e.target.value = masked;
      }}
    />
  );
}
