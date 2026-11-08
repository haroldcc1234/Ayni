import { sharedMode } from '../sync/mode';
import {mobileBridge,nativeRequest} from '../lib/native';
import {useState} from 'react';
import { remotePost,sharedLogout } from '../sync/remote';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Award,
  Bell,
  ChevronRight,
  Inbox,
  LogIn,
  LogOut,
  Package,
  Pencil,
  Settings,
  ShieldCheck,
  ShieldPlus,
  Sparkles,
  Star,
  TrendingUp,
  UserCog,
  Wrench,
} from 'lucide-react';
import { db } from '../db/db';
import { setSetting } from '../db/repositories';
import { useCurrentProfile, useEmergencyMode } from '../hooks';
import { isCoordinator } from '../lib/permissions';
import { levelFor, nextLevelFor } from '../lib/reputation';
import {
  REPUTATION_TYPE_LABEL,
  ROLE_ICON,
  ROLE_LABEL,
  formatPoints,
  relativeTime,
} from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { Avatar, Badge, Button, Card, ProgressBar, SectionHeader } from '../components/ui';
import { PageHeading, StatCard } from '../components/PageBits';

export function ProfilePage() {
  const navigate = useNavigate();
  const { profile, points } = useCurrentProfile();
  const [pushBusy,setPushBusy]=useState(false);
  const [pushToken,setPushToken]=useState(()=>sessionStorage.getItem('ayni-push') || '');
  async function togglePush(){
    setPushBusy(true);
    try{
      const token=pushToken || (await nativeRequest('push')).token;
      if(!token)throw Error('El teléfono no proporcionó el permiso.');
      await remotePost('/devices/push',{token,enabled:!pushToken});
      sessionStorage.setItem('ayni-push',pushToken?'':token);
      setPushToken(pushToken?'':token);
    }catch(e){toast({tone:'error',title:e instanceof Error?e.message:'Reintenta activar los avisos.'});}
    finally{setPushBusy(false);}
  }
  const emergency = useEmergencyMode();
  const setCurrentProfileId = useAppStore((state) => state.setCurrentProfileId);
  const toast = useAppStore((state) => state.toast);

  const handleLogout = async () => {
    if (sharedMode) {
      try { await sharedLogout(); sessionStorage.removeItem('ayni-push'); }
      catch { toast({tone:'error',title:'Conéctate para cerrar la sesión del servidor.'}); }
      return;
    }
    setCurrentProfileId('');
    await setSetting('currentProfileId', '');
    toast({
      tone: 'info',
      title: 'Sesión cerrada',
      description: 'Elige un usuario para volver a ingresar.',
    });
    navigate('/login');
  };

  const myListings = useLiveQuery(
    () => (profile ? db.listings.where('authorId').equals(profile.id).count() : 0),
    [profile?.id],
  );
  const incoming = useLiveQuery(
    () =>
      profile
        ? db.requests.where('ownerId').equals(profile.id).count()
        : 0,
    [profile?.id],
  );
  const outgoing = useLiveQuery(
    () =>
      profile
        ? db.requests.where('requesterId').equals(profile.id).count()
        : 0,
    [profile?.id],
  );
  const myProvider = useLiveQuery(
    () => (profile ? db.providers.where('profileId').equals(profile.id).first() : undefined),
    [profile?.id],
  );
  const myBrigade = useLiveQuery(
    () => (profile ? db.brigadeProfiles.where('profileId').equals(profile.id).first() : undefined),
    [profile?.id],
  );
  const events = useLiveQuery(
    async () => {
      if (!profile) return [];
      return (
        await db.reputationEvents.where('profileId').equals(profile.id).toArray()
      )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5);
    },
    [profile?.id],
  );

  const level = levelFor(points);
  const next = nextLevelFor(points);
  const progress = next
    ? Math.min(100, Math.round(((points - level.min) / (next.min - level.min)) * 100))
    : 100;

  if (!profile) {
    return (
      <div className="space-y-4">
        <PageHeading title="Mi perfil" />
        <Card className="p-6 text-center ">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <LogIn size={22} />
          </div>
          <h2 className="mt-3 text-base font-semibold tracking-tight text-slate-900">
            No has iniciado sesión
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Ingresa con un usuario de prueba por rol o regístrate como vecino.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button full size="lg" onClick={() => navigate('/login')}>
              <LogIn size={16} />
              Iniciar sesión / Ver roles de prueba
            </Button>
            <Button
              full
              variant="outline"
              onClick={() => navigate('/registro')}
            >
              Crear perfil nuevo
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeading title="Mi perfil" subtitle="Tu identidad, reputación y aportes al barrio." />

      <Card className="overflow-hidden p-0">
        <div className="bg-slate-900 p-5 text-white">
          <div className="flex items-start gap-3">
            {profile.photo ? <img src={profile.photo} alt="Tu foto" width={64} height={64} className="rounded-full"/> : <Avatar
              name={profile.name}
              color={profile.avatarColor}
              size="lg"
              verified={profile.verified === 1}
            />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h1 className="text-lg font-semibold leading-tight tracking-tight">{profile.name}</h1>
                {profile.verified === 1 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-community-50 px-2 text-xs text-community-700"><ShieldCheck size={15}/> {sharedMode && !profile.residencyVerifiedAt ? 'Presidencia de la junta' : 'Residencia validada'}</span>
                ) : null}
              </div>
              {profile.emailVerified && <p className="text-sm">Correo verificado{!profile.verified && ' · Residencia pendiente de revisión presencial'}</p>}
              {sharedMode && !profile.dniRegistered && <Link to="/perfil/editar" className="underline">Registrar DNI para la junta</Link>}
              <p className="text-[11px] text-white/60">
                {profile.zone || profile.district} · {profile.phone || 'sin teléfono'}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {profile.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white/80"
                  >
                    {ROLE_ICON[role]} {ROLE_LABEL[role]}
                  </span>
                ))}
              </div>
            </div>
            <Link
              to="/perfil/editar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/20 text-white"
              aria-label="Editar perfil"
            >
              <Pencil size={15} />
            </Link>
          </div>
          
        </div>

      </Card>
      <Card>
        <MenuRow to="/perfil/editar" icon={<Pencil size={17} />} label="Editar perfil" hint="Nombre, teléfono y ubicación" />
        <MenuRow to="/perfil/publicaciones" icon={<Package size={17} />} label="Mis publicaciones" hint={`${myListings ?? 0} en el muro`} />
        <MenuRow to="/perfil/solicitudes" icon={<Inbox size={17} />} label="Mis solicitudes" hint={`${incoming ?? 0} recibidas · ${outgoing ?? 0} enviadas`} />
        <MenuRow to="/billetera" icon={<Inbox size={17} />} label="Billetera solidaria" hint="Saldo, retenciones e historial" />
        <MenuRow to="/junta" icon={<ShieldCheck size={17} />} label="Mi junta vecinal" hint="Sector, asambleas y acuerdos" />
        <MenuRow to="/perfil/oficios" icon={<Wrench size={17} />} label="Mis oficios" hint={myProvider ? 'Gestionar ficha de prestador' : 'Ofrecer un oficio'} />
        <MenuRow to="/perfil/brigada" icon={<ShieldPlus size={17} />} label="Mi ficha de brigada" hint={myBrigade ? `Disponibilidad: ${myBrigade.availability}` : 'Unirme a la brigada'} />
        <MenuRow to="/notificaciones" icon={<Bell size={17} />} label="Notificaciones" hint="Avisos y recordatorios" />
        <MenuRow to="/configuracion" icon={<Settings size={17} />} label="Configuración" hint="PWA, datos y respaldo" />
        {!sharedMode && <MenuRow to="/demo" icon={<UserCog size={17} />} label="Panel de demostración" hint="Simulador de fallos, sync y roles" />}
        {isCoordinator(profile) ? (
          <MenuRow to="/coordinador" icon={<ShieldCheck size={17} />} label="Panel de coordinador" hint="Crisis, moderación y métricas" />
        ) : null}
      </Card>

      {sharedMode && mobileBridge() && !!profile.verified && <Button full disabled={pushBusy} onClick={togglePush}>{pushToken?'Desactivar avisos en este teléfono':'Activar avisos de emergencias en este teléfono'}</Button>}
      <div className="pt-1">
        <Button
          full
          variant="outline"
          onClick={() => void handleLogout()}
          className="border-slate-200 text-slate-600 hover:border-crisis-200 hover:bg-crisis-50 hover:text-crisis-700"
        >
          <LogOut size={16} />
          Cerrar sesión
        </Button>
      </div>

      {emergency ? (
        <Link
          to="/emergencia"
          className="flex items-center gap-3 rounded-xl border border-crisis-200 bg-crisis-50 p-4"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-crisis-600 text-white">
            <Star size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-crisis-900">Modo emergencia activo</span>
            <span className="block text-[11px] text-crisis-700">Revisa tu rol en la respuesta</span>
          </span>
          <ChevronRight size={17} className="text-crisis-500" />
        </Link>
      ) : null}

      <section>
        <SectionHeader
          title="Reputación reciente"
          description="Cada aporte suma puntos y confianza"
          action={
            <span className="text-[11px] font-semibold text-slate-400">{formatPoints(points)} total</span>
          }
        />
        <div className="space-y-2">
          {(events ?? []).map((event) => (
            <Card key={event.id} className="flex items-center gap-3 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Star size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800">
                  {REPUTATION_TYPE_LABEL[event.type]}
                </p>
                <p className="truncate text-[10px] text-slate-400">{event.description}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-emerald-700">+{event.points}</span>
            </Card>
          ))}
          {events && events.length === 0 ? (
            <Card className="text-center text-xs text-slate-500">
              Aún no tienes eventos. Publica, ayuda o valida a un vecino para empezar.
            </Card>
          ) : null}
        </div>
      </section>

      <p className="pb-2 text-center text-[10px] text-slate-400">
        Perfil local creado {relativeTime(profile.createdAt)} · sin cuenta remota
      </p>
    </div>
  );
}

function MenuRow({
  to,
  icon,
  label,
  hint,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link to={to} className="flex items-center gap-3 p-4 transition-colors hover:bg-slate-50">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-slate-900">{label}</span>
        <span className="block text-[11px] text-slate-500">{hint}</span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-slate-300" />
    </Link>
  );
}

