import { inScope, useVisibleSectors } from '../hooks/territory';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  Activity,
  Map,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Users,
  Zap,
} from 'lucide-react';
import { db } from '../db/db';
import { setCrisisMode } from '../db/repositories';
import { useCurrentProfile, useEmergencyMode, useSetting } from '../hooks';
import { isCoordinator } from '../lib/permissions';
import { useAppStore } from '../store/useAppStore';
import { AlertCard, BrigadeCard, QuickAction } from '../components/cards';
import { MapView } from '../components/MapView';
import { Badge, Button, Card, SectionHeader } from '../components/ui';
import { PageHeading, StatCard } from '../components/PageBits';
import { distanceMeters } from '../lib/geo';

export function EmergencyPage() {
  const { profile } = useCurrentProfile();
  const sectors=useVisibleSectors(profile);
  const emergency = useEmergencyMode();
  const crisisTitle = useSetting('crisisTitle');
  const openPublish = useAppStore((state) => state.openPublish);
  const toast = useAppStore((state) => state.toast);

  const alerts = useLiveQuery(async () => {
    const rows = (await db.alerts.toArray())
      .filter((alert) => inScope(sectors,alert) && ['pending', 'assigned', 'in_progress'].includes(alert.status))
      .sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2 };
        return order[a.severity] - order[b.severity] || b.createdAt.localeCompare(a.createdAt);
      });
    return Promise.all(
      rows.map(async (alert) => ({
        alert,
        author: await db.profiles.get(alert.authorId),
      })),
    );
  }, [sectors]);

  const brigade = useLiveQuery(async () => {
    const rows = (await db.brigadeProfiles.toArray())
      .filter((item) => inScope(sectors,item) && item.availability !== 'offline')
      .sort((a, b) => a.availability.localeCompare(b.availability))
      .slice(0, 3);
    return Promise.all(
      rows.map(async (item) => ({
        brigade: item,
        profile: await db.profiles.get(item.profileId),
      })),
    );
  }, [sectors]);

  const criticalCount = alerts?.filter(({ alert }) => alert.severity === 'critical').length ?? 0;
  const availableCount =
    brigade?.filter(({ brigade: item }) => item.availability === 'available').length ?? 0;
  const coords = { lat: profile?.lat ?? -12.083, lng: profile?.lng ?? -77.051 };
  const coordinator = isCoordinator(profile);

  const activate = async () => {
    if (!profile) return;
    await setCrisisMode(true, profile);
    useAppStore.getState().setEmergencyMode(true);
    toast({
      tone: 'warning',
      title: 'Modo emergencia activado',
      description: 'Se notificó a todo el barrio. La navegación cambia a respuesta de crisis.',
    });
  };

  const deactivate = async () => {
    if (!profile) return;
    await setCrisisMode(false, profile);
    useAppStore.getState().setEmergencyMode(false);
    toast({
      tone: 'success',
      title: 'Modo emergencia desactivado',
      description: 'El barrio vuelve a la operación cotidiana.',
    });
  };

  return (
    <div className="space-y-5">
      <PageHeading
        title={emergency ? 'Respuesta de crisis' : 'Emergencias'}
        subtitle={
          emergency
            ? crisisTitle || 'Protocolo vecinal activo'
            : 'Preparación, alertas y brigada de respuesta del barrio.'
        }
        action={
          <Button
            size="sm"
            variant={emergency ? 'outline' : 'crisis'}
            onClick={() => openPublish('alert')}
          >
            <Siren size={15} />
            SOS
          </Button>
        }
      />

      {!emergency ? (
        <Card className="overflow-hidden border-0 bg-slate-900 p-0 text-white">
          <div className="p-5">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-emerald-300">
              <ShieldCheck size={13} />
              Sistema en reposo
            </div>
            <h2 className="mt-1.5 text-xl font-semibold tracking-tight">El barrio está preparado</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-white/60">
              La red de brigadistas, alertas y coordinación está lista. En una crisis, el
              coordinador activa el protocolo y todos reciben la señal.
            </p>
            <div className="mt-4 grid grid-cols-3 divide-x divide-white/15 border-y border-white/15 text-center">
              <div className="px-2 py-2.5">
                <p className="text-base font-semibold">{availableCount}</p>
                <p className="text-[9px] uppercase tracking-[0.1em] text-white/50">Brigadistas</p>
              </div>
              <div className="px-2 py-2.5">
                <p className="text-base font-semibold">{alerts?.length ?? 0}</p>
                <p className="text-[9px] uppercase tracking-[0.1em] text-white/50">Alertas</p>
              </div>
              <div className="px-2 py-2.5">
                <p className="text-base font-semibold">800 m</p>
                <p className="text-[9px] uppercase tracking-[0.1em] text-white/50">Radio</p>
              </div>
            </div>
          </div>
          <div className="border-t border-white/15 p-4">
            {coordinator ? (
              <Button full variant="crisis" onClick={() => void activate()}>
                <Zap size={16} />
                Activar modo emergencia
              </Button>
            ) : (
              <p className="text-center text-[11px] text-white/60">
                Solo un coordinador puede activar la crisis.{' '}
                <Link to="/demo" className="font-semibold text-white underline">
                  Cambiar de rol en demo
                </Link>
              </p>
            )}
          </div>
        </Card>
      ) : (
        <section className="overflow-hidden rounded-2xl bg-crisis-700 p-5 text-white">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white/70">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
              </span>
              Crisis activa
            </div>
            <Badge tone="crisis" className="border-white/30 bg-white/10">
              <Radio size={11} />
              EN VIVO
            </Badge>
          </div>
          <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">{crisisTitle || 'Emergencia vecinal'}</h2>
          <p className="mt-1 text-[11px] text-white/70">
            Prioriza tu seguridad. Reporta alertas con ubicación y coordina por la brigada.
          </p>

          <div className="mt-4 grid grid-cols-3 divide-x divide-white/20 border-y border-white/20 text-center">
            <div className="px-2 py-2.5">
              <p className="text-lg font-semibold">{alerts?.length ?? 0}</p>
              <p className="text-[9px] uppercase tracking-[0.1em] text-white/60">Alertas activas</p>
            </div>
            <div className="px-2 py-2.5">
              <p className="text-lg font-semibold text-amber-200">{criticalCount}</p>
              <p className="text-[9px] uppercase tracking-[0.1em] text-white/60">Críticas</p>
            </div>
            <div className="px-2 py-2.5">
              <p className="text-lg font-semibold text-emerald-200">{availableCount}</p>
              <p className="text-[9px] uppercase tracking-[0.1em] text-white/60">Disponibles</p>
            </div>
          </div>

          <Button
            full
            className="mt-3 bg-white text-crisis-700 hover:bg-white/90"
            onClick={() => openPublish('alert')}
          >
            <Siren size={17} />
            Enviar SOS con ubicación
          </Button>

          {coordinator ? (
            <button
              type="button"
              onClick={() => void deactivate()}
              className="mt-2 w-full rounded-lg border border-white/30 py-2 text-[11px] font-medium text-white/90"
            >
              Desactivar modo emergencia
            </button>
          ) : null}
        </section>
      )}

      <div className="grid grid-cols-4 gap-2">
        <QuickAction icon={<Siren size={19} />} label="SOS" hint="Alerta" onClick={() => openPublish('alert')} tone="crisis" />
        <QuickAction icon={<ShieldAlert size={19} />} label="Alertas" hint="Todas" to="/alertas" />
        <QuickAction icon={<Users size={19} />} label="Brigada" hint="Apoyo" to="/brigada" tone="community" />
        <QuickAction icon={<Map size={19} />} label="Mapa" hint="Radar" to="/mapa" tone="amber" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard value={alerts?.length ?? 0} label="Alertas activas" tone="crisis" />
        <StatCard value={availableCount} label="Brigadistas" tone="brand" />
        <StatCard value={coordinator ? 'Sí' : 'No'} label="Coordinador" />
      </div>

      {emergency ? (
        <section>
          <SectionHeader
            title="Mapa de emergencia"
            description="Alertas y brigadistas disponibles"
            action={
              <Link to="/mapa" className="text-xs font-semibold text-slate-700">
                Ampliar
              </Link>
            }
          />
          <MapView
            center={coords}
            points={[
              ...(alerts ?? []).map(({ alert }) => ({
                id: alert.id,
                lat: alert.lat,
                lng: alert.lng,
                label: alert.title,
                description: alert.category,
                tone: 'alert' as const,
                link: `/alertas/${alert.id}`,
              })),
              ...(brigade ?? []).map(({ brigade: item }) => ({
                id: item.id,
                lat: item.lat,
                lng: item.lng,
                label: `Brigada · ${item.skills[0] ?? 'Apoyo'}`,
                description: item.certifications,
                tone: 'brigade' as const,
                link: `/brigada/${item.id}`,
              })),
            ]}
            radiusM={800}
            height="260px"
          />
        </section>
      ) : null}

      <section>
        <SectionHeader
          title="Alertas recientes"
          description={emergency ? 'Ordenadas por severidad' : 'Reportes del barrio'}
          action={
            <Link to="/alertas" className="text-xs font-semibold text-slate-700">
              Ver todas
            </Link>
          }
        />
        <div className="space-y-2.5">
          {(alerts ?? []).slice(0, 3).map(({ alert, author }) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              author={author}
              distance={distanceMeters(coords, { lat: alert.lat, lng: alert.lng })}
            />
          ))}
          {alerts && alerts.length === 0 ? (
            <Card className="text-center text-xs text-slate-500">
              No hay alertas activas. Mantén la calma y reporta cualquier riesgo.
            </Card>
          ) : null}
        </div>
      </section>

      <section>
        <SectionHeader
          title="Brigada disponible"
          description="Habilidades y recursos listos"
          action={
            <Link to="/brigada" className="text-xs font-semibold text-slate-700">
              Directorio
            </Link>
          }
        />
        <div className="space-y-2.5">
          {(brigade ?? []).map(({ brigade: item, profile: owner }) => (
            <BrigadeCard
              key={item.id}
              brigade={item}
              profile={owner}
              distance={distanceMeters(coords, { lat: item.lat, lng: item.lng })}
            />
          ))}
        </div>
      </section>

      {coordinator ? (
        <Link
          to="/coordinador"
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
            <Activity size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-900">Panel de coordinador</span>
            <span className="block text-[11px] text-slate-500">
              Crisis, comunicados, verificación y moderación.
            </span>
          </span>
          <ShieldCheck size={17} className="text-slate-400" />
        </Link>
      ) : null}

      <Card>
        <p className="text-xs font-semibold text-slate-900">Protocolo rápido</p>
        <ol className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-slate-500">
          <li>1. Si hay riesgo de vida, envía un SOS con ubicación exacta.</li>
          <li>2. La brigada asignada recibe la alerta y va en camino.</li>
          <li>3. Si no hay señal, todo queda guardado y se sincroniza al reconectar.</li>
          <li>4. El coordinador cierra la crisis cuando el barrio está a salvo.</li>
        </ol>
      </Card>
    </div>
  );
}
