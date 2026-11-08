import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  BellRing,
  Check,
  CloudDownload,
  Database,
  Download,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Trash2,
  UserCog,
  Users,
  WifiOff,
  Zap,
} from 'lucide-react';
import { db } from '../db/db';
import { serverDb } from '../db/server-db';
import type { Role } from '../db/types';
import {
  clearConflicts,
  downloadBackup,
  notify,
  prepareOfflineDemo,
  reputationPoints,
  resetDemo,
  setCrisisMode,
  setSetting,
  simulateConflict,
  updateProfile,
} from '../db/repositories';
import { useCurrentProfile } from '../hooks';
import { isCoordinator } from '../lib/permissions';
import { ROLE_ICON, ROLE_LABEL, formatDateTime, relativeTime } from '../lib/utils';
import { kickSync, retryFailed } from '../sync/engine';
import { useAppStore } from '../store/useAppStore';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  SectionHeader,
  Toggle,
} from '../components/ui';
import { PageHeading, StatCard } from '../components/PageBits';

const ALL_ROLES: Role[] = ['vecino', 'prestador', 'brigadista', 'coordinador'];

const CHECKLIST = [
  'Editar el perfil y activar el GPS',
  'Dar un Visto Bueno a un prestador',
  'Publicar un préstamo en 3 pasos con audio',
  'Enviar una solicitud y aceptarla',
  'Activar el modo crisis con la coordinadora',
  'Simular offline y crear una alerta SOS',
  'Reconectar y ver la cola drenarse',
  'Exportar el respaldo JSON',
];

export function DemoPage() {
  const { profile } = useCurrentProfile();
  const currentProfileId = useAppStore((state) => state.currentProfileId);
  const setCurrentProfileId = useAppStore((state) => state.setCurrentProfileId);
  const simulatedOffline = useAppStore((state) => state.simulatedOffline);
  const setSimulatedOffline = useAppStore((state) => state.setSimulatedOffline);
  const pending = useAppStore((state) => state.syncPending);
  const conflicts = useAppStore((state) => state.syncConflicts);
  const lastSyncAt = useAppStore((state) => state.lastSyncAt);
  const emergency = useAppStore((state) => state.emergencyMode);
  const setEmergencyMode = useAppStore((state) => state.setEmergencyMode);
  const toast = useAppStore((state) => state.toast);

  const [busy, setBusy] = useState('');
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const people = useLiveQuery(async () => {
    const rows = await db.profiles.orderBy('createdAt').toArray();
    return Promise.all(
      rows.map(async (person) => ({
        profile: person,
        points: await reputationPoints(person.id),
      })),
    );
  }, []);

  const queue = useLiveQuery(
    () => db.syncQueue.orderBy('createdAt').reverse().limit(10).toArray(),
    [],
  );

  const serverCount = useLiveQuery(() => serverDb.records.count(), []);

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    try {
      await action();
    } catch (error) {
      toast({
        tone: 'error',
        title: 'La acción falló',
        description: error instanceof Error ? error.message : 'Intenta de nuevo.',
      });
    } finally {
      setBusy('');
    }
  };

  const switchProfile = (id: string) => {
    setCurrentProfileId(id);
    void setSetting('currentProfileId', id);
    const person = people?.find((item) => item.profile.id === id)?.profile;
    toast({
      tone: 'info',
      title: `Ahora eres ${person?.name ?? 'otro vecino'}`,
      description: person ? person.roles.map((role) => ROLE_LABEL[role]).join(' · ') : undefined,
    });
  };

  const toggleRole = async (role: Role) => {
    if (!profile) return;
    const has = profile.roles.includes(role);
    let roles = has ? profile.roles.filter((item) => item !== role) : [...profile.roles, role];
    if (roles.length === 0) roles = ['vecino'];
    roles = [...new Set(roles)];
    await updateProfile(profile.id, { roles });
    toast({
      tone: 'success',
      title: has ? `Rol ${ROLE_LABEL[role]} retirado` : `Rol ${ROLE_LABEL[role]} activado`,
      description: 'Los permisos se recalculan al instante.',
    });
  };

  const toggleOffline = async (enabled: boolean) => {
    setSimulatedOffline(enabled);
    await setSetting('simulatedOffline', enabled ? '1' : '0');
    if (enabled) {
      toast({ tone: 'warning', title: 'Sin conexión simulada', description: 'Crea una alerta o publicación para llenar la cola.' });
    } else {
      await kickSync();
      toast({ tone: 'success', title: 'Reconectado', description: 'La cola se está drenando hacia el servidor simulado.' });
    }
  };

  return (
    <div>
      <PageHeading
        title="Panel de demostración"
        subtitle="Controla personas, roles, conexión, sincronización y datos."
        back={{ to: '/perfil', label: 'Mi perfil' }}
        action={
          <Badge tone="brand">
            <Sparkles size={11} />
            Demo
          </Badge>
        }
      />

      <div className="mb-4 grid grid-cols-4 gap-2">
        <StatCard value={pending} label="En cola" tone={pending ? 'brand' : 'default'} />
        <StatCard value={conflicts} label="Conflictos" tone={conflicts ? 'crisis' : 'default'} />
        <StatCard value={queue?.length ?? 0} label="Visibles" />
        <StatCard value={serverCount ?? 0} label="Servidor" />
      </div>

      <SectionHeader
        title="Persona y rol"
        description="Cambia de perfil para probar cada vista sin cerrar sesión"
        action={
          <Link
            to="/recorrido"
            className="text-xs font-semibold text-slate-700 hover:underline"
          >
            Volver al recorrido →
          </Link>
        }
      />
      <Card className="mb-4 p-0">
        <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
          {(people ?? []).map(({ profile: person, points }) => {
            const active = person.id === currentProfileId;
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => switchProfile(person.id)}
                className={
                  active
                    ? 'flex w-full items-center gap-3 bg-slate-50 p-3.5 text-left'
                    : 'flex w-full items-center gap-3 p-3.5 text-left transition hover:bg-slate-50'
                }
              >
                <Avatar
                  name={person.name}
                  color={person.avatarColor}
                  size="sm"
                  verified={person.verified === 1}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-slate-900">{person.name}</span>
                    {active ? <Badge tone="brand">Activo</Badge> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                    {person.district} · {person.roles.map((role) => ROLE_LABEL[role]).join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs font-semibold text-amber-600">{points} pts</span>
                  <span className="block text-[9px] text-slate-400">reputación</span>
                </span>
              </button>
            );
          })}
          {people && people.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No hay perfiles" description="Reinicia la demo para cargar los datos." />
            </div>
          ) : null}
        </div>
      </Card>

      {profile ? (
        <Card className="mb-4">
          <div className="flex items-center gap-3">
            <Avatar name={profile.name} color={profile.avatarColor} size="md" verified={profile.verified === 1} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{profile.name}</p>
              <p className="truncate text-[11px] text-slate-500">
                {profile.phone} · {profile.district}
              </p>
            </div>
            <Link
              to="/perfil/editar"
              className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-600"
            >
              <UserCog size={13} />
              Editar
            </Link>
          </div>
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Roles de esta persona
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {ALL_ROLES.map((role) => (
              <Chip
                key={role}
                active={profile.roles.includes(role)}
                onClick={() => void toggleRole(role)}
              >
                {ROLE_ICON[role]} {ROLE_LABEL[role]}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
            El coordinador puede activar la crisis, verificar vecinos y moderar. El brigadista puede
            aceptar alertas y tener ficha de brigada.
          </p>
        </Card>
      ) : null}

      <SectionHeader title="Conexión y sincronización" description="La cola es real; el servidor es simulado" />
      <Card className="mb-4">
        <Toggle
          checked={simulatedOffline}
          onChange={(value) => void toggleOffline(value)}
          label="Simular modo avión"
          description="Bloquea la sincronización sin apagar el WiFi real."
        />
        <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
          <Button variant="secondary" loading={busy === 'sync'} onClick={() => void run('sync', kickSync)}>
            <RefreshCw size={15} />
            Sincronizar
          </Button>
          <Button
            variant="outline"
            loading={busy === 'retry'}
            onClick={() =>
              void run('retry', async () => {
                await retryFailed();
                toast({ tone: 'success', title: 'Reintentos disparados' });
              })
            }
          >
            <Zap size={15} />
            Reintentar
          </Button>
          <Button
            variant="outline"
            loading={busy === 'clear'}
            onClick={() =>
              void run('clear', async () => {
                await clearConflicts();
                toast({ tone: 'success', title: 'Conflictos limpiados' });
              })
            }
          >
            <Check size={15} />
            Limpiar conflictos
          </Button>
          <Button
            variant="outline"
            loading={busy === 'conflict'}
            onClick={() =>
              void run('conflict', async () => {
                await simulateConflict();
                await kickSync();
                toast({
                  tone: 'warning',
                  title: 'Conflicto simulado',
                  description: 'Ganó el servidor. Revisa la cola y la notificación.',
                });
              })
            }
          >
            <AlertTriangle size={15} />
            Simular conflicto
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Server size={13} className="text-slate-500" />
          Servidor simulado: {serverCount ?? 0} registros · Última sync:{' '}
          {lastSyncAt ? formatDateTime(lastSyncAt) : 'pendiente'}
        </p>
      </Card>

      <SectionHeader title="Cola de sincronización" description="Últimos movimientos locales" />
      <Card className="mb-4 p-0">
        {(queue ?? []).length === 0 ? (
          <p className="p-4 text-xs text-slate-500">
            La cola está vacía. Todo está sincronizado con el servidor simulado.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {(queue ?? []).map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3">
                <span
                  className={
                    item.status === 'conflict'
                      ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-crisis-50 text-crisis-600'
                      : item.status === 'error'
                        ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600'
                        : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500'
                  }
                >
                  <Database size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800">
                    {item.entity} · {item.operation}
                  </p>
                  <p className="truncate text-[10px] text-slate-400">
                    {item.entityId.slice(0, 8)}… · intentos {item.attempts} ·{' '}
                    {relativeTime(item.createdAt)}
                  </p>
                  {item.lastError ? (
                    <p className="truncate text-[10px] font-medium text-crisis-600">{item.lastError}</p>
                  ) : null}
                </div>
                <Badge
                  tone={
                    item.status === 'conflict'
                      ? 'danger'
                      : item.status === 'error'
                        ? 'warning'
                        : item.status === 'pending'
                          ? 'info'
                          : 'neutral'
                  }
                >
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SectionHeader title="Acciones de demo" description="Atajos para el guion de 15 minutos" />
      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          loading={busy === 'notify'}
          onClick={() =>
            void run('notify', async () => {
              await notify(currentProfileId, {
                type: 'system',
                title: 'Notificación de prueba',
                body: 'Esta notificación fue generada desde el panel demo.',
                link: '/notificaciones',
              });
              toast({ tone: 'success', title: 'Notificación enviada', description: 'Revisa la campana.' });
            })
          }
        >
          <BellRing size={15} />
          Notificar
        </Button>
        <Button
          variant="outline"
          loading={busy === 'prepare'}
          onClick={() =>
            void run('prepare', async () => {
              const count = await prepareOfflineDemo();
              toast(
                count > 0
                  ? { tone: 'success', title: `${count} mosaicos en caché` }
                  : { tone: 'warning', title: 'No se pudo precargar el mapa' },
              );
            })
          }
        >
          <CloudDownload size={15} />
          Mapa offline
        </Button>
        <Button variant="outline" loading={busy === 'export'} onClick={() => void run('export', downloadBackup)}>
          <Download size={15} />
          Exportar
        </Button>
        <Button
          variant={emergency ? 'outline' : 'crisis'}
          loading={busy === 'crisis'}
          onClick={() =>
            void run('crisis', async () => {
              if (!profile) return;
              if (isCoordinator(profile)) {
                await setCrisisMode(!emergency, profile);
                setEmergencyMode(!emergency);
                toast({
                  tone: emergency ? 'success' : 'warning',
                  title: emergency ? 'Crisis desactivada' : 'Crisis activada',
                });
              } else {
                toast({
                  tone: 'info',
                  title: 'Necesitas ser coordinadora',
                  description: 'Cambia a María Elena Rojas para activar el modo crisis.',
                });
              }
            })
          }
        >
          <ShieldAlert size={15} />
          {emergency ? 'Salir de crisis' : 'Activar crisis'}
        </Button>
      </div>

      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Users size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Atajo de guion</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              Coordinadora: María Elena Rojas. Vecino completo: Carlos Daniel Ricce. Brigadista:
              Andrés Campos.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link to="/coordinador" className="text-[11px] font-semibold text-slate-700">
                Panel coordinador
              </Link>
              <span className="text-slate-300">·</span>
              <Link to="/emergencia" className="text-[11px] font-semibold text-crisis-700">
                Home emergencia
              </Link>
              <span className="text-slate-300">·</span>
              <Link to="/configuracion" className="text-[11px] font-semibold text-slate-600">
                Configuración
              </Link>
            </div>
          </div>
        </div>
      </Card>

      <SectionHeader title="Checklist de demo" description="Marca mientras avanzas en la presentación" />
      <Card className="mb-4 space-y-1">
        {CHECKLIST.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setChecked((value) => ({ ...value, [item]: !value[item] }))}
            className="flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left"
          >
            <span
              className={
                checked[item]
                  ? 'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-community-600 text-white'
                  : 'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-transparent'
              }
            >
              <Check size={14} />
            </span>
            <span
              className={
                checked[item]
                  ? 'text-xs font-medium text-slate-400 line-through'
                  : 'text-xs font-medium text-slate-700'
              }
            >
              {item}
            </span>
          </button>
        ))}
        <p className="pt-1 text-[10px] text-slate-400">
          {Object.values(checked).filter(Boolean).length} de {CHECKLIST.length} completados
        </p>
      </Card>

      <SectionHeader title="Datos peligrosos" description="Solo para reiniciar la demo" />
      <Card className="border-crisis-200 bg-crisis-50/40">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-crisis-600">
            <Trash2 size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-crisis-900">Reiniciar datos de demo</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-crisis-700">
              Borra ambas bases IndexedDB y vuelve a cargar perfiles, publicaciones, alertas y la
              brigada. Exporta antes si quieres conservar algo.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                loading={busy === 'backup'}
                onClick={() => void run('backup', downloadBackup)}
              >
                <Download size={14} />
                Respaldo
              </Button>
              <Button
                size="sm"
                variant="danger"
                loading={busy === 'reset'}
                onClick={() =>
                  void run('reset', async () => {
                    if (!window.confirm('¿Borrar todos los datos locales y reiniciar la demo?')) return;
                    await resetDemo();
                    window.location.reload();
                  })
                }
              >
                <RotateCcw size={14} />
                Reiniciar demo
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-slate-400">
        <WifiOff size={12} />
        Offline-first · IndexedDB
        <span>·</span>
        <Smartphone size={12} />
        PWA Android
        <span>·</span>
        <RefreshCw size={12} />
        {pending} en cola
      </div>
    </div>
  );
}
