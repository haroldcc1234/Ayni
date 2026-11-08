import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Lock } from 'lucide-react';
import { Card } from './ui';

export function BackLink({ to = '/', label = 'Volver' }: { to?: string; label?: string }) {
  return (
    <Link
      to={to}
      className="mb-2 inline-flex h-8 items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900"
    >
      <ChevronLeft size={14} />
      {label}
    </Link>
  );
}

export function PageHeading({
  title,
  subtitle,
  action,
  back,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  back?: { to: string; label?: string };
}) {
  return (
    <div className="mb-5">
      {back ? <BackLink to={back.to} label={back.label} /> : null}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-900">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 max-w-prose text-[11px] leading-relaxed text-slate-500">{subtitle}</p>
          ) : null}
        </div>
        {action}
      </div>
    </div>
  );
}

export function AccessDenied({
  title = 'Acceso reservado',
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card className="py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
        <Lock size={22} />
      </div>
      <h2 className="mt-3 text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-xs text-[11px] leading-relaxed text-slate-500">
        {description ??
          'Tu perfil actual no tiene permisos para esta sección. Cambia de persona o rol en el panel demo.'}
      </p>
      <Link
        to="/demo"
        className="mt-4 inline-flex h-9 items-center rounded-lg bg-slate-900 px-3.5 text-xs font-semibold text-white"
      >
        Abrir panel demo
      </Link>
    </Card>
  );
}

export function StatCard({
  value,
  label,
  tone = 'default',
}: {
  value: ReactNode;
  label: string;
  tone?: 'default' | 'crisis' | 'brand';
}) {
  return (
    <div
      className={
        tone === 'crisis'
          ? 'rounded-xl bg-crisis-700 p-3 text-white'
          : tone === 'brand'
            ? 'rounded-xl bg-slate-900 p-3 text-white'
            : 'rounded-xl border border-slate-200 bg-white p-3'
      }
    >
      <p className="text-lg font-semibold leading-none tracking-tight">{value}</p>
      <p
        className={
          tone === 'default'
            ? 'mt-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-slate-400'
            : 'mt-1.5 text-[9px] font-medium uppercase tracking-[0.12em] text-white/60'
        }
      >
        {label}
      </p>
    </div>
  );
}
