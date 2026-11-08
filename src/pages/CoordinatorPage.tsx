import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Flag,
  Megaphone,
  Radio,
  ShieldCheck,
  ShieldOff,
  Siren,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { db } from '../db/db';
import type { Report } from '../db/types';
import {
  hideListing,
  resolveReport,
  sendBroadcast,
  setCrisisMode,
  setSetting,
  verifyProfile,
} from '../db/repositories';
import { useCurrentProfile, useEmergencyMode, useSetting } from '../hooks';
import { isCoordinator } from '../lib/permissions';
import { ROLE_LABEL, formatDateTime, relativeTime } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  SectionHeader,
  Textarea,
} from '../components/ui';
import { AccessDenied, PageHeading, StatCard } from '../components/PageBits';

interface ReportView extends Report {
  label: string;
  link?: string;
  reporterName: string;
}

export function CoordinatorPage() {
  const { profile } = useCurrentProfile();
  const emergency = useEmergencyMode();
  const crisisTitleSetting = useSetting('crisisTitle');
  const setEmergencyMode = useAppStore((state) => state.setEmergencyMode);
  const toast = useAppStore((state) => state.toast);

  const [crisisTitle, setCrisisTitle] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (crisisTitleSetting) setCrisisTitle(crisisTitleSetting);
  }, [crisisTitleSetting]);

  const data = useLiveQuery(async () => {
    const [profiles, providers, listings, requests, alerts, reports] = await Promise.all([
      db.profiles.toArray(),
      db.providers.toArray(),
      db.listings.toArray(),
      db.requests.toArray(),
      db.alerts.toArray(),
      db.reports.toArray(),
    ]);

    const reportsView: ReportView[] = await Promise.all(
      reports
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(async (report) => {
          let label = 'Elemento';
          let link: string | undefined;
          if (report.targetType === 'listing') {
            const listing = listings.find((item) => item.id === report.targetId);
            label = listing?.title ?? 'Publicación eliminada';
            link = listing ? `/muro/${listing.id}` : undefined;
          } else if (report.targetType === 'provider') {
            const provider = providers.find((item) => item.id === report.targetId);
            label = provider?.trade ?? 'Prestador eliminado';
            link = provider ? `/directorio/${provider.id}` : undefined;
          } else if (report.targetType === 'alert') {
            const alert = alerts.find((item) => item.id === report.targetId);
            label = alert?.title ?? 'Alerta eliminada';
            link = alert ? `/alertas/${alert.id}` : undefined;
          } else {
            const target = profiles.find((item) => item.id === report.targetId);
            label = target?.name ?? 'Perfil eliminado';
            link = target ? `/perfil` : undefined;
          }
          return {
            ...report,
            label,
            link,
            reporterName: profiles.find((item) => item.id === report.reporterId)?.name ?? 'Vecino',
          };
        }),
    );

    return { profiles, providers, listings, requests, alerts, reports: reportsView };
  }, []);

  const openReports = (data?.reports ?? []).filter((item) => item.status === 'open');
  const resolvedReports = (data?.reports ?? []).filter((item) => item.status === 'resolved');
  const activeAlerts = (data?.alerts ?? []).filter((item) =>
    ['pending', 'assigned', 'in_progress'].includes(item.status),
  );
  const pendingRequests = (data?.requests ?? []).filter((item) => item.status === 'pending');
  const openListings = (data?.listings ?? []).filter(
    (item) => item.status === 'open' && item.hidden !== 1,
  );
  const activeProviders = (data?.providers ?? []).filter((item) => item.status === 'active');
  const unverified = (data?.profiles ?? []).filter((item) => item.verified === 0);
  const verified = (data?.profiles ?? []).filter((item) => item.verified === 1);

  const toggleCrisis = async () => {
    if (!profile) return;
    setBusy('crisis');
    try {
      const next = !emergency;
      if (crisisTitle.trim()) await setSetting('crisisTitle', crisisTitle.trim());
      await setCrisisMode(next, profile);
      setEmergencyMode(next);
      toast({
        tone: next ? 'warning' : 'success',
        title: next ? 'Modo emergencia activado' : 'Modo emergencia desactivado',
        description: next
          ? 'Todos los vecinos recibieron el aviso. La navegación cambia a crisis.'
          : 'La app vuelve a su navegación cotidiana.',
      });
    } finally {
      setBusy('');
    }
  };

  const broadcast = async () => {
    if (!profile) return;
    if (broadcastTitle.trim().length < 4 || broadcastBody.trim().length < 8) {
      toast({
        tone: 'warning',
        title: 'Comunicado incompleto',
        description: 'Escribe un título y un mensaje claro para el barrio.',
      });
      return;
    }
    setBusy('broadcast');
    try {
      await sendBroadcast(profile, broadcastTitle, broadcastBody);
      setBroadcastTitle('');
      setBroadcastBody('');
      toast({ tone: 'success', title: 'Comunicado enviado', description: 'Todos los perfiles lo verán en notificaciones.' });
    } finally {
      setBusy('');
    }
  };

  const moderate = async (report: ReportView, hide: boolean) => {
    setBusy(report.id);
    try {
      if (hide && report.targetType === 'listing' && profile) {
        await hideListing(report.targetId, profile.id);
      } else {
        await resolveReport(report.id, 'resolved');
      }
      toast({
        tone: 'success',
        title: hide ? 'Contenido oculto' : 'Reporte resuelto',
        description: report.label,
      });
    } finally {
      setBusy('');
    }
  };

  if (!profile) {
    return (
      <div>
        <PageHeading title="Panel de coordinador" back={{ to: '/perfil', label: 'Mi perfil' }} />
        <EmptyState title="No hay un perfil activo" />
      </div>
    );
  }

  if (!isCoordinator(profile)) {
    return (
      <div>
        <PageHeading title="Panel de coordinador" back={{ to: '/perfil', label: 'Mi perfil' }} />
        <AccessDenied
          title="Solo para coordinadores"
          description="Cambia a María Elena Rojas desde el panel demo para activar la crisis, moderar contenido y verificar vecinos."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeading
        title="Panel de coordinador"
        subtitle={`${profile.name} · ${profile.district}`}
        back={{ to: '/perfil', label: 'Mi perfil' }}
        action={
          <Badge tone={emergency ? 'crisis' : 'success'}>
            <Radio size={11} />
            {emergency ? 'Crisis activa' : 'Barrio en calma'}
          </Badge>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatCard value={data?.profiles.length ?? 0} label="Vecinos" tone="brand" />
        <StatCard value={activeProviders.length} label="Prestadores" />
        <StatCard value={openListings.length} label="Publicaciones" />
        <StatCard value={pendingRequests.length} label="Por aceptar" />
        <StatCard value={activeAlerts.length} label="Alertas" tone={activeAlerts.length ? 'crisis' : 'default'} />
        <StatCard value={openReports.length} label="Reportes" tone={openReports.length ? 'crisis' : 'default'} />
      </div>

      <SectionHeader title="Modo emergencia" description="Activa la respuesta de crisis para todo el barrio" />
      <Card
        className={
          emergency
            ? 'mb-4 border-crisis-200 bg-crisis-50'
            : 'mb-4'
        }
      >
        <div className="flex items-start gap-3">
          <span
            className={
              emergency
                ? 'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-crisis-600 text-white'
                : 'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500'
            }
          >
            <Siren size={22} className={emergency ? 'animate-pulse' : ''} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              {emergency ? 'La respuesta de crisis está activa' : 'Activar respuesta de crisis'}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              Cambia banner, navegación y home. Genera una notificación global. Úsalo solo ante una
              emergencia real o una demo controlada.
            </p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          <Input
            label="Título de la crisis"
            value={crisisTitle}
            onChange={(event) => setCrisisTitle(event.target.value)}
            placeholder="Ej. SISMO 6.8 · LIMA CENTRO"
          />
          <Button full variant={emergency ? 'outline' : 'crisis'} loading={busy === 'crisis'} onClick={() => void toggleCrisis()}>
            {emergency ? <ShieldOff size={16} /> : <Siren size={16} />}
            {emergency ? 'Desactivar crisis' : 'Activar crisis'}
          </Button>
        </div>
      </Card>

      <SectionHeader title="Comunicado vecinal" description="Llega a las notificaciones de todos los perfiles" />
      <Card className="mb-4 space-y-2">
        <Input
          label="Título"
          value={broadcastTitle}
          onChange={(event) => setBroadcastTitle(event.target.value)}
          placeholder="Ej. Corte de agua programado"
        />
        <Textarea
          label="Mensaje"
          value={broadcastBody}
          onChange={(event) => setBroadcastBody(event.target.value)}
          placeholder="Detalle, horario y recomendaciones…"
        />
        <Button full loading={busy === 'broadcast'} onClick={() => void broadcast()}>
          <Megaphone size={16} />
          Enviar comunicado
        </Button>
      </Card>

      <SectionHeader
        title="Moderación"
        description={`${openReports.length} reporte${openReports.length === 1 ? '' : 's'} abierto${openReports.length === 1 ? '' : 's'}`}
        action={
          <Link to="/muro" className="text-[11px] font-semibold text-slate-700">
            Ver muro
          </Link>
        }
      />
      <div className="mb-4 space-y-2.5">
        {openReports.length === 0 ? (
          <Card className="flex items-center gap-3 border-emerald-200 bg-emerald-50">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-emerald-700">
              <CheckCircle2 size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-900">Sin reportes pendientes</p>
              <p className="text-[11px] text-emerald-800">El barrio está tranquilo. Buen trabajo.</p>
            </div>
          </Card>
        ) : (
          openReports.map((report) => (
            <Card key={report.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-crisis-50 text-crisis-600">
                  <Flag size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="danger">Reporte abierto</Badge>
                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      {report.targetType}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{report.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{report.reason}</p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    Reportado por {report.reporterName} · {relativeTime(report.createdAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {report.link ? (
                      <Link
                        to={report.link}
                        className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700"
                      >
                        Revisar
                      </Link>
                    ) : null}
                    {report.targetType === 'listing' ? (
                      <Button
                        size="sm"
                        variant="danger"
                        loading={busy === report.id}
                        onClick={() => void moderate(report, true)}
                      >
                        <ShieldOff size={14} />
                        Ocultar
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === report.id}
                      onClick={() => void moderate(report, false)}
                    >
                      <CheckCircle2 size={14} />
                      Resolver
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
        {resolvedReports.length > 0 ? (
          <p className="px-1 text-[11px] text-slate-400">
            {resolvedReports.length} reporte{resolvedReports.length === 1 ? '' : 's'} ya resuelto
            {resolvedReports.length === 1 ? '' : 's'}.
          </p>
        ) : null}
      </div>

      <SectionHeader
        title="Verificación de vecinos"
        description="Valida identidad para dar más confianza al barrio"
        action={<Badge tone="success">{verified.length} verificados</Badge>}
      />
      <Card className="mb-4 divide-y divide-slate-100 p-0">
        {unverified.length === 0 ? (
          <p className="p-4 text-xs text-slate-500">Todos los vecinos registrados ya están verificados.</p>
        ) : (
          unverified.slice(0, 8).map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-3.5">
              <Avatar name={item.name} color={item.avatarColor} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {item.district} · {item.roles.map((role) => ROLE_LABEL[role]).join(' · ')}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  await verifyProfile(item.id, true);
                  toast({ tone: 'success', title: 'Vecino verificado', description: item.name });
                }}
              >
                <UserCheck size={14} />
                Verificar
              </Button>
            </div>
          ))
        )}
      </Card>

      <SectionHeader title="Alertas activas" description="Situaciones que requieren atención de la brigada" />
      <Card className="mb-4">
        {activeAlerts.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={15} className="text-emerald-600" />
            No hay alertas abiertas en este momento.
          </p>
        ) : (
          <div className="space-y-2">
            {activeAlerts.slice(0, 5).map((alert) => (
              <Link
                key={alert.id}
                to={`/alertas/${alert.id}`}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-slate-400"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-crisis-50 text-crisis-600">
                  <AlertTriangle size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-900">{alert.title}</span>
                  <span className="block text-[10px] text-slate-500">
                    {alert.category} · {formatDateTime(alert.createdAt)}
                  </span>
                </span>
                <Badge tone={alert.status === 'pending' ? 'warning' : 'info'}>{alert.status}</Badge>
              </Link>
            ))}
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link
            to="/alertas"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700"
          >
            <BellRing size={15} />
            Todas las alertas
          </Link>
          <Link
            to="/brigada"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700"
          >
            <Users size={15} />
            Brigada
          </Link>
        </div>
      </Card>

      <Card className="flex items-start gap-3 border-slate-200 bg-slate-50">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600">
          <Wrench size={18} />
        </span>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Los permisos de coordinación son locales. En esta demo, María Elena Rojas es la
          coordinadora. Puedes cambiar de persona en el panel demo.
        </p>
      </Card>
    </div>
  );
}
