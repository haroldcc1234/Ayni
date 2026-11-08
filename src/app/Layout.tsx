import { Logo } from '../pages/AuthPage';
import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  CloudOff,
  Home,
  Plus,
  RefreshCw,
  Siren,
  User,
  Users,
  Wrench,
  HeartHandshake,
  Bell,
  ShieldAlert,
  Radio,
  LogIn,
} from 'lucide-react';
import { getSectorDisaster, isSectorInDisaster } from '../governance/territory';
import { inScope, useVisibleSectors } from '../hooks/territory';
import { db } from '../db/db';
import { useCurrentProfile } from '../hooks';
import { cn, firstName } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { Avatar, ToastHost } from '../components/ui';
import { PublishSheet } from '../features/publish/PublishSheet';
import { AccessibilityBehavior } from '../components/Accessibility';
import { sharedMode } from '../sync/mode';

function useEmergencySettingSync() {
  const { profile } = useCurrentProfile();
  const setting = useLiveQuery(() => profile ? isSectorInDisaster(profile) : false, [profile]);
  const setEmergencyMode = useAppStore((state) => state.setEmergencyMode);

  useEffect(() => {
    setEmergencyMode(Boolean(setting));
  }, [setting, setEmergencyMode]);
}

function CrisisBanner() {
  const emergency = useAppStore((state) => state.emergencyMode);
  const { profile } = useCurrentProfile();
  const sectors = useVisibleSectors(profile);
  const disaster = useLiveQuery(() => profile ? getSectorDisaster(profile) : undefined, [profile]);
  const crisisTitle = disaster?.title;
  const openAlerts = useLiveQuery(
    () =>
      db.alerts
        .filter((alert) => inScope(sectors, alert) && alert.status !== 'resolved' && alert.status !== 'cancelled')
        .count(),
    [sectors],
  );

  if (!emergency) return null;

  return (
    <Link
      to="/emergencia"
      className="block border-b border-crisis-800 bg-crisis-700 px-4 py-2.5 text-white"
    >
      <div className="mx-auto flex max-w-2xl items-center gap-3">
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/25">
          <Radio size={16} className="animate-pulse" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-white/70">
            Modo emergencia activo
          </p>
          <p className="truncate text-xs font-semibold">{crisisTitle || 'Respuesta de crisis del barrio'}</p>
        </div>
        <span className="shrink-0 rounded-md border border-white/25 px-2 py-0.5 text-[10px] font-semibold">
          {openAlerts ?? 0} activas
        </span>
      </div>
    </Link>
  );
}

function Header() {
  const { profile, unread } = useCurrentProfile();
  const online = useAppStore((state) => state.online);
  const pending = useAppStore((state) => state.syncPending);
  const conflicts = useAppStore((state) => state.syncConflicts);
  const emergency = useAppStore((state) => state.emergencyMode);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-canvas/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
        <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label="Ayni, inicio">
          <Logo small />
        </Link>

        <div className="ml-auto flex items-center gap-1.5">
          <button aria-label="Reportar emergencia" title="Reportar emergencia" className="grid place-items-center text-crisis-700" onClick={()=>useAppStore.getState().openPublish('alert')}><Siren size={20}/></button>
          {conflicts > 0 ? (
            <Link
              to="/demo"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-crisis-200 bg-crisis-50 px-2 text-[10px] font-semibold text-crisis-700"
              title="Conflictos de sincronización"
            >
              <AlertTriangle size={12} />
              {conflicts}
            </Link>
          ) : pending > 0 ? (
            <Link
              to="/demo"
              className="inline-flex h-8 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 text-[10px] font-semibold text-amber-800"
              title="Cambios pendientes de sincronizar"
            >
              <RefreshCw size={12} className="animate-spin" />
              {pending}
            </Link>
          ) : null}

          <Link
            to="/notificaciones"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900"
            aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`}
          >
            <Bell size={16} />
            {unread > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-crisis-600 px-1 text-[9px] font-semibold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            ) : null}
          </Link>

          {profile ? (
            <Link to="/perfil" aria-label="Mi perfil">
              <Avatar
                name={profile.name}
                color={profile.avatarColor}
                size="sm"
                verified={profile.verified === 1}
              />
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-700"
            >
              <LogIn size={13} />
              <span>Entrar</span>
            </Link>
          )}
        </div>
      </div>
      {!online ? (
        <div className="flex items-center justify-center gap-1.5 border-t border-amber-200 bg-amber-50 px-4 py-1 text-[10px] font-medium text-amber-900">
          <CloudOff size={13} />
          Sin conexión · tus cambios se guardan en este dispositivo
          {pending > 0 ? ` (${pending} en cola)` : ''}
        </div>
      ) : null}
    </header>
  );
}

function BottomNav() {
  const emergency = useAppStore((state) => state.emergencyMode);
  const openPublish = useAppStore((state) => state.openPublish);
  const location = useLocation();

  const normalItems = [
    { to: '/', label: 'Inicio', icon: Home },
    { to: '/directorio', label: 'Buscar', icon: Wrench },
    { to: '/notificaciones', label: 'Avisos', icon: Bell },
    { to: '/perfil', label: 'Perfil', icon: User },
  ];

  const emergencyItems = [
    { to: '/emergencia', label: 'Crisis', icon: Siren },
    { to: '/alertas', label: 'Alertas', icon: ShieldAlert },
    { to: '/brigada', label: 'Brigada', icon: Users },
    { to: '/perfil', label: 'Perfil', icon: User },
  ];

  const items = normalItems;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-canvas/95 backdrop-blur-sm">
      <div className="safe-bottom mx-auto grid h-16 max-w-2xl grid-cols-5 items-center px-2">
        {items.slice(0, 2).map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <div className="relative flex h-full items-center justify-center">
          <button
            type="button"
            onClick={() => openPublish('auto')}
            className={cn(
              'absolute -top-5 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-float transition active:scale-95',
              'ayni-publish',
            )}
            aria-label="Publicar"
          >
            <Plus size={25} />
            <span className="absolute -bottom-4 whitespace-nowrap text-[9px] font-medium uppercase tracking-[0.14em] text-slate-500">
              Publicar
            </span>
          </button>
        </div>

        {items.slice(2).map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </div>
    </nav>
  );
}

function NavItem({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof Home;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'relative flex min-h-[48px] flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors',
          isActive ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'absolute top-0 h-0.5 w-6 rounded-full',
              isActive ? 'bg-slate-900' : 'bg-transparent',
            )}
          />
          <Icon size={19} strokeWidth={isActive ? 2.2 : 1.8} />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  );
}

export function Layout() {
  const emergency = useAppStore((state) => state.emergencyMode);
  useEmergencySettingSync();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  return (
    <div className={cn('min-h-dvh', emergency ? 'bg-crisis-50/40' : 'bg-canvas')}>
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <Header />
      {!sharedMode && <Link className="block bg-community-50 py-2 text-center text-sm text-community-700 underline" to="/recorrido">Demo de Ayni · Volver al recorrido</Link>}
      <AccessibilityBehavior />
      <CrisisBanner />
      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-2xl px-4 pb-32 pt-4">
        <Outlet />
      </main>
      <BottomNav />
      <PublishSheet />
      <ToastHost />
    </div>
  );
}
