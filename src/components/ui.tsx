import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary: 'bg-ember text-ink-950 hover:bg-ember-bright font-semibold shadow-[0_0_20px_-6px] shadow-ember/60',
  secondary: 'border border-ink-600 bg-ink-800 text-parchment hover:border-ember/60 hover:bg-ink-700',
  ghost: 'text-parchment-dim hover:text-parchment hover:bg-ink-800',
  danger: 'border border-blood/60 text-red-300 hover:bg-blood/20',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

const field = 'w-full rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-parchment placeholder:text-parchment-dim/50 focus:border-ember focus:outline-none focus:ring-1 focus:ring-ember/50';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${field} ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${field} ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${field} ${className}`} {...props} />;
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="mb-1 block text-sm text-parchment-dim">
      {children}
      {hint && <span className="ml-2 text-xs opacity-70">{hint}</span>}
    </span>
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-ink-700 bg-ink-900/80 p-5 shadow-lg shadow-black/30 ${className}`}>{children}</div>;
}

export function Tag({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'warn' | 'ember' }) {
  const tones = {
    default: 'border-ink-600 text-parchment-dim',
    warn: 'border-blood/50 text-red-300',
    ember: 'border-ember/50 text-ember',
  };
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="rounded-lg border border-blood/40 bg-blood/10 px-3 py-2 text-sm text-red-200">{children}</p>;
}
