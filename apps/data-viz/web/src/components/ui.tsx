import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'quiet';
}

export function Button({ variant = 'quiet', className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        variant === 'primary' ? 'primary' : 'pill',
        'inline-flex min-h-9 items-center justify-center gap-1.5 px-4 text-[13px] font-medium transition',
        className,
      )}
      {...props}
    />
  );
}

export function Chips({
  children,
  className,
  wrap = false,
}: {
  children: ReactNode;
  className?: string;
  wrap?: boolean;
}) {
  return (
    <div
      className={cn(
        'chips dv-scroll flex gap-2 pb-1',
        wrap ? 'flex-wrap' : 'overflow-x-auto',
        className,
      )}
      role="group"
    >
      {children}
    </div>
  );
}

export function Chip({
  active,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn('chip shrink-0 px-3 py-1.5 text-[13px] font-medium', className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function Segmented({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('seg', className)}>{children}</div>;
}

export function SegButton({
  active,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn('min-h-8 px-3 text-[12px] font-medium', className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
  ...props
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card rounded-[var(--radius-card)]', className)} {...props}>
      {children}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('badge inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium', className)}>
      {children}
    </span>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'dv-field h-8 w-full px-2 text-[13px] outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'dv-field min-h-28 w-full resize-y p-3 text-[14px] leading-relaxed outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Spinner({ label = '载入中…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-16 text-sm text-[var(--muted)]">
      <span className="dv-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
