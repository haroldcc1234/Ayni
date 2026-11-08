import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { db } from '../db/db';
import type { AppNotification } from '../db/types';
import { markAllNotificationsRead, markNotificationRead } from '../db/repositories';
import { useCurrentProfile } from '../hooks';
import { useAppStore } from '../store/useAppStore';
import { NotificationCard } from '../components/cards';
import { Button, Chip, EmptyState } from '../components/ui';
import { PageHeading } from '../components/PageBits';

type Filter = 'all' | 'unread' | 'alerts' | 'requests' | 'broadcast';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'unread', label: 'Sin leer' },
  { key: 'alerts', label: 'Alertas' },
  { key: 'requests', label: 'Solicitudes' },
  { key: 'broadcast', label: 'Comunicados' },
];

function matches(filter: Filter, item: AppNotification): boolean {
  if (filter === 'all') return true;
  if (filter === 'unread') return item.read === 0;
  if (filter === 'alerts') return item.type.startsWith('alert_');
  if (filter === 'requests') return item.type.startsWith('request_');
  if (filter === 'broadcast') return item.type === 'broadcast' || item.type === 'moderation';
  return true;
}

export function NotificationsPage() {
  const { profile, unread } = useCurrentProfile();
  const navigate = useNavigate();
  const toast = useAppStore((state) => state.toast);
  const [filter, setFilter] = useState<Filter>('all');

  const notifications = useLiveQuery(async () => {
    if (!profile) return [];
    const rows = await db.notifications.where('profileId').equals(profile.id).toArray();
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [profile?.id]);

  const filtered = useMemo(
    () => (notifications ?? []).filter((item) => matches(filter, item)),
    [notifications, filter],
  );

  const open = async (notification: AppNotification) => {
    if (notification.read === 0) {
      await markNotificationRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const markAll = async () => {
    if (!profile) return;
    await markAllNotificationsRead(profile.id);
    toast({ tone: 'success', title: 'Todo marcado como leído' });
  };

  return (
    <div>
      <PageHeading
        title="Notificaciones"
        subtitle="Avisos de solicitudes, alertas y comunicados del barrio."
        action={
          <Button size="sm" variant="outline" onClick={() => void markAll()} disabled={!unread}>
            <CheckCheck size={15} />
            Marcar todas
          </Button>
        }
      />

      <div className="hide-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((item) => (
          <Chip
            key={item.key}
            active={filter === item.key}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
            {item.key === 'unread' && unread ? ` (${unread})` : ''}
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={filter === 'unread' ? <BellOff size={34} /> : <Bell size={34} />}
          title={filter === 'unread' ? 'Estás al día' : 'Sin notificaciones todavía'}
          description={
            filter === 'unread'
              ? 'No tienes avisos pendientes. Te notificaremos cuando alguien solicite tu ayuda.'
              : 'Cuando ocurra algo importante en el barrio aparecerá aquí, incluso si estabas sin conexión.'
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <NotificationCard
              key={item.id}
              notification={item}
              onClick={() => void open(item)}
            />
          ))}
        </div>
      )}

      <p className="mt-4 text-center text-[10px] text-slate-400">
        Las notificaciones son locales: no se envían SMS ni push reales.
      </p>
    </div>
  );
}
