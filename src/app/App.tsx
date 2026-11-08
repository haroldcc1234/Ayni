import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { AuthPage } from '../pages/AuthPage';
import { bootstrap } from './bootstrap';
import { Layout } from './Layout';
import { LoadingScreen } from '../components/ui';
import { HomePage } from '../pages/HomePage';
import { DirectoryPage } from '../pages/DirectoryPage';
import { ProviderDetailPage } from '../pages/ProviderDetailPage';
import { WallPage } from '../pages/WallPage';
import { ListingDetailPage } from '../pages/ListingDetailPage';
import { MapPage } from '../pages/MapPage';
import { EmergencyPage } from '../pages/EmergencyPage';
import { AlertsPage } from '../pages/AlertsPage';
import { AlertDetailPage } from '../pages/AlertDetailPage';
import { BrigadePage } from '../pages/BrigadePage';
import { BrigadeDetailPage } from '../pages/BrigadeDetailPage';
import { BrigadeProfilePage } from '../pages/BrigadeProfilePage';
import { ProfilePage } from '../pages/ProfilePage';
import { EditProfilePage } from '../pages/EditProfilePage';
import { MyTradesPage } from '../pages/MyTradesPage';
import { MyListingsPage } from '../pages/MyListingsPage';
import { MyRequestsPage } from '../pages/MyRequestsPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { CoordinatorPage } from '../pages/CoordinatorPage';
import { DemoPage } from '../pages/DemoPage';
import { DemoTour } from '../pages/DemoTour';
import { OnboardingPage } from '../pages/OnboardingPage';
import { RegisterPage } from '../pages/RegisterPage';
import { LoginPage } from '../pages/LoginPage';
import { WalletPage } from '../pages/WalletPage';
import { GovernancePage } from '../governance/GovernancePage';
import { sharedMode } from '../sync/mode';
import { NotFoundPage } from '../pages/NotFoundPage';
import { useAppStore } from '../store/useAppStore';

let bootstrapPromise: Promise<void> | null = null;

function PublishRoute() {
  const openPublish = useAppStore((state) => state.openPublish);
  const navigate = useNavigate();

  useEffect(() => {
    openPublish('auto');
    navigate('/', { replace: true });
  }, [navigate, openPublish]);

  return <HomePage />;
}

export function App() {
  const ready = useAppStore((state) => state.ready);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!bootstrapPromise) {
      bootstrapPromise = bootstrap();
    }
    bootstrapPromise.catch((reason: unknown) => {
      bootstrapPromise = null;
      setError(
        reason instanceof Error
          ? reason.message
          : 'No pudimos abrir la base local de Ayni.',
      );
    });
  }, []);

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-crisis-50 text-crisis-600">
          <AlertTriangle size={26} />
        </span>
        <h1 className="text-lg font-semibold text-slate-900">No pudimos iniciar Ayni</h1>
        <p className="max-w-sm text-xs leading-relaxed text-slate-500">{error}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 inline-flex h-11 items-center rounded-lg bg-slate-900 px-5 text-xs font-semibold text-white"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!ready) return <LoadingScreen />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/recuperar" element={sharedMode ? <AuthPage key="reset" mode="reset" /> : <Navigate replace to="/demo" />} />
        <Route path="/registro" element={sharedMode ? <RegisterPage /> : <Navigate replace to="/recorrido" />} />
        <Route path="/login" element={sharedMode ? <LoginPage /> : <Navigate replace to="/demo" />} />

        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          {!sharedMode && <Route path="recorrido" element={<DemoTour />} />}
          <Route path="login" element={sharedMode ? <LoginPage /> : <Navigate replace to="/demo" />} />
          <Route path="directorio" element={<DirectoryPage />} />
          <Route path="directorio/:id" element={<ProviderDetailPage />} />
          <Route path="muro" element={<WallPage />} />
          <Route path="muro/:id" element={<ListingDetailPage />} />
          <Route path="publicar" element={<PublishRoute />} />
          <Route path="mapa" element={<MapPage />} />
          <Route path="emergencia" element={<EmergencyPage />} />
          <Route path="alertas" element={<AlertsPage />} />
          <Route path="alertas/:id" element={<AlertDetailPage />} />
          <Route path="brigada" element={<BrigadePage />} />
          <Route path="brigada/:id" element={<BrigadeDetailPage />} />
          <Route path="perfil" element={<ProfilePage />} />
          <Route path="perfil/editar" element={<EditProfilePage />} />
          <Route path="perfil/oficios" element={<MyTradesPage />} />
          <Route path="perfil/brigada" element={<BrigadeProfilePage />} />
          <Route path="perfil/publicaciones" element={<MyListingsPage />} />
          <Route path="perfil/solicitudes" element={<MyRequestsPage />} />
          <Route path="notificaciones" element={<NotificationsPage />} />
          <Route path="configuracion" element={<SettingsPage />} />
          <Route path="coordinador" element={<CoordinatorPage />} />
          <Route path="junta" element={<GovernancePage />} />
          <Route path="billetera" element={<WalletPage />} />
          <Route path="demo" element={sharedMode ? <SettingsPage /> : <DemoPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
