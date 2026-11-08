import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ShieldAlert, Siren } from 'lucide-react';
import { inScope, useVisibleSectors } from '../hooks/territory';
import { db } from '../db/db';
import type { AlertSeverity } from '../db/types';
import { useCurrentProfile } from '../hooks';
import { useAppStore } from '../store/useAppStore';
import { distanceMeters } from '../lib/geo';
import { SEVERITY_LABEL, cn } from '../lib/utils';
import { AlertCard } from '../components/cards';
import { Button, Chip, EmptyState } from '../components/ui';
import { PageHeading, StatCard } from '../components/PageBits';

type StatusFilter = 'active' | 'resolved' | 'all';

export function AlertsPage() {
  const { profile } = useCurrentProfile();
  const sectors = useVisibleSectors(profile);
  const openPublish = useAppStore((state) => state.openPublish);
  const [status, setStatus] = useState<StatusFilter>('active');
  const [severity, setSeverity] = useState<AlertSeverity | 'all'>('all');

  const alerts = useLiveQuery(async () => {
    const rows = (await db.alerts.toArray()).sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2 };
      return order[a.severity] - order[b.severity] || b.createdAt.localeCompare(a.createdAt);
    });
    return Promise.all(
      rows.filter(item => inScope(sectors, item)).map(async (alert) => ({
        alert,
        author: await db.profiles.get(alert.authorId),
      })),
    );
  }, [sectors]);

  const filtered = useMemo(
    () =>
      (alerts ?? []).filter(({ alert }) => {
        if (severity !== 'all' && alert.severity !== severity) return false;
        if (status === 'active') {
          return ['pending', 'assigned', 'in_progress'].includes(alert.status);
        }
        if (status === 'resolved') return alert.status === 'resolved';
        return true;
      }),
    [alerts, status, severity],
  );

  const activeCount =
    alerts?.filter(({ alert }) => ['pending', 'assigned', 'in_progress'].includes(alert.status))
      .length ?? 0;
  const pendingCount =
    alerts?.filter(({ alert }) => alert.status === 'pending').length ?? 0;
  const resolvedCount =
    alerts?.filter(({ alert }) => alert.status === 'resolved').length ?? 0;
  const coords = { lat: profile?.lat ?? -12.083, lng: profile?.lng ?? -77.051 };

  return (
    <div>
      <PageHeading
        title="Alertas del barrio"
        subtitle="Reportes de emergencia con severidad, estado y respuesta de brigada."
        action={
          <Button size="sm" variant="crisis" onClick={() => openPublish('alert')}>
            <Siren size={15} />
            SOS
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatCard value={activeCount} label="Activas" tone="crisis" />
        <StatCard value={pendingCount} label="Sin atender" />
        <StatCard value={resolvedCount} label="Resueltas" />
      </div>

      <div className="mb-3 flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {(['active', 'resolved', 'all'] as StatusFilter[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setStatus(item)}
            className={cn(
              'h-9 flex-1 rounded-md text-xs font-semibold transition-colors',
              status === item ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900',
            )}
          >
            {item === 'active' ? 'Activas' : item === 'resolved' ? 'Resueltas' : 'Todas'}
          </button>
        ))}
      </div>

      <div className="hide-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
        <Chip active={severity === 'all'} onClick={() => setSeverity('all')}>
          Todas
        </Chip>
        {(['critical', 'high', 'medium'] as AlertSeverity[]).map((item) => (
          <Chip key={item} active={severity === item} onClick={() => setSeverity(item)}>
            {SEVERITY_LABEL[item]}
          </Chip>
        ))}
      </div>

      <div className="space-y-2.5">
        {filtered.map(({ alert, author }) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            author={author}
            distance={distanceMeters(coords, { lat: alert.lat, lng: alert.lng })}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert size={34} />}
          title="No hay alertas en este filtro"
          description="Si ves un riesgo, reporta una alerta con ubicación y severidad. Tu aviso puede salvar una vida."
          action={
            <Button variant="crisis" size="sm" onClick={() => openPublish('alert')}>
              <Siren size={15} />
              Reportar emergencia
            </Button>
          }
        />
      ) : null}

      <p className="mt-4 text-center text-[10px] text-slate-400">
        {filtered.length} alertas · respuesta hiperlocal en 800 m
      </p>
    </div>
  );
}
