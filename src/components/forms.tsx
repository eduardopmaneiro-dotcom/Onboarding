"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/modules/shared/action";
import { CpfInput } from "@/components/cpf-input";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const Ctx = createContext<ActionState>(null);
const PendingCtx = createContext(false);

/**
 * Formulário ligado a uma server action, com mensagens e erros por campo.
 * Após a hidratação, envia via onSubmit (preventDefault faz o React ignorar a prop `action`),
 * para que os campos NÃO sejam limpos quando há erro de validação. Limpa só no sucesso.
 * Antes da hidratação, a prop `action` garante envio por POST (nunca dados na URL).
 */
export function ActionForm({ action, children, className = "", resetOnSuccess = false }: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean }) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <Ctx.Provider value={state}>
      <form
        ref={ref}
        action={formAction /* antes da hidratação: envio seguro via POST para a server action */}
        className={className}
        noValidate
        aria-busy={pending}
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          const fd = new FormData(e.currentTarget);
          startTransition(() => formAction(fd));
        }}
      >
        <PendingCtx.Provider value={pending}>
          <FormMessage />
          {children}
        </PendingCtx.Provider>
      </form>
    </Ctx.Provider>
  );
}

export function FormMessage() {
  const state = useContext(Ctx);
  if (!state?.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`mb-4 rounded-md px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
      {state.message}
    </p>
  );
}

function FieldError({ name }: { name: string }) {
  const state = useContext(Ctx);
  const errs = state?.fieldErrors?.[name];
  if (!errs?.length) return null;
  return <p className="mt-1 text-xs text-red-600">{errs.join("; ")}</p>;
}

type FieldProps = { name: string; label: string; hint?: string; className?: string };

export function Field({ name, label, hint, className = "", ...input }: FieldProps & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <input id={name} name={name} className="input" {...input} />
      {hint && <p className="mt-1 text-xs text-stone-400">{hint}</p>}
      <FieldError name={name} />
    </div>
  );
}

export function SelectField({ name, label, options, placeholder, className = "", ...rest }: FieldProps & { options: Array<{ value: string; label: string }>; placeholder?: string } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <select id={name} name={name} className="input" {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError name={name} />
    </div>
  );
}

export function TextAreaField({ name, label, className = "", ...rest }: FieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className={className}>
      <label htmlFor={name} className="label">
        {label}
      </label>
      <textarea id={name} name={name} className="input min-h-20" {...rest} />
      <FieldError name={name} />
    </div>
  );
}

export function CheckboxField({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-stone-700">
      <input type="hidden" name={name} value="false" />
      <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="h-4 w-4 rounded border-stone-300 accent-riale-900" />
      {label}
    </label>
  );
}

export function Submit({ children, className = "btn-primary", pendingText = "Salvando…" }: { children: ReactNode; className?: string; pendingText?: string }) {
  const status = useFormStatus();
  const pending = useContext(PendingCtx) || status.pending;
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingText : children}
    </button>
  );
}

export function CpfField({ label = "CPF", hint, required = true }: { label?: string; hint?: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor="cpf" className="label">
        {label}
      </label>
      <CpfInput required={required} />
      {hint && <p className="mt-1 text-[11px] text-stone-400">{hint}</p>}
      <FieldError name="cpf" />
    </div>
  );
}
