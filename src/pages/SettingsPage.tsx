import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CloudDownload,
  CloudUpload,
  Database,
  Download,
  HardDrive,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { db } from '../db/db';
import {
  downloadBackup,
  importBackup,
  prepareOfflineDemo,
  resetDemo,
  setSetting,
  storageEstimate,
} from '../db/repositories';
import { useInstallPrompt, useSetting } from '../hooks';
import { kickSync } from '../sync/engine';
import { applyUpdate, checkForUpdate, isUpdateReady, onUpdateReady } from '../pwa';
import { useAppStore } from '../store/useAppStore';
import { formatDateTime } from '../lib/utils';
import { Badge, Button, Card, ProgressBar, SectionHeader, Toggle } from '../components/ui';
import { AccessibilitySettings } from '../components/Accessibility';
import { sharedMode } from '../sync/mode';
import { PageHeading } from '../components/PageBits';

function formatBytes(value: number): string {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function SettingsPage() {
  const toast = useAppStore((state) => state.toast);
  const simulatedOffline = useAppStore((state) => state.simulatedOffline);
  const setSimulatedOffline = useAppStore((state) => state.setSimulatedOffline);
  const pending = useAppStore((state) => state.syncPending);
  const conflicts = useAppStore((state) => state.syncConflicts);
  const lastSyncAt = useAppStore((state) => state.lastSyncAt);
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const demoPrepared = useSetting('demoPrepared');

  const [storage, setStorage] = useState({ usage: 0, quota: 0 });
  const [busy, setBusy] = useState('');
  const [updateReady, setUpdateReady] = useState(isUpdateReady());
  const fileRef = useRef<HTMLInputElement>(null);

  const queued = useLiveQuery(() => db.syncQueue.count(), []);

  useEffect(() => {
    void storageEstimate().then(setStorage);
  }, [queued]);

  useEffect(() => onUpdateReady(setUpdateReady), []);

  const toggleOffline = async (enabled: boolean) => {
    setSimulatedOffline(enabled);
    await setSetting('simulatedOffline', enabled ? '1' : '0');
    if (!enabled) {
      await kickSync();
      toast({ tone: 'success', title: 'Conexión restaurada', description: 'Sincronizando cambios pendientes.' });
    } else {
      toast({
        tone: 'info',
        title: 'Modo offline simulado',
        description: 'Lo que crees ahora quedará en la cola local.',
      });
    }
  };

  const prepare = async () => {
    setBusy('prepare');
    try {
      const count = await prepareOfflineDemo();
      toast(
        count > 0
          ? {
              tone: 'success',
              title: `${count} mosaicos del mapa en caché`,
              description: 'Ya puedes abrir el radar sin conexión.',
            }
          : {
              tone: 'warning',
              title: 'No se pudo precargar el mapa',
              description: 'Revisa tu conexión. El resto de la app funciona sin internet.',
            },
      );
    } finally {
      setBusy('');
    }
  };

  const exportData = async () => {
    setBusy('export');
    try {
      await downloadBackup();
      toast({ tone: 'success', title: 'Respaldo descargado', description: 'Guarda el JSON en un lugar seguro.' });
    } finally {
      setBusy('');
    }
  };

  const importData = async (file: File) => {
    setBusy('import');
    try {
      await importBackup(await file.text());
      toast({ tone: 'success', title: 'Respaldo importado', description: 'Recargando la aplicación…' });
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      toast({
        tone: 'error',
        title: 'No se pudo importar',
        description: error instanceof Error ? error.message : 'Archivo inválido.',
      });
    } finally {
      setBusy('');
    }
  };

  const reset = async () => {
    if (!window.confirm('Esto borra todos los datos locales y restaura la demo. ¿Continuar?')) return;
    setBusy('reset');
    try {
      await resetDemo();
      window.location.reload();
    } finally {
      setBusy('');
    }
  };

  const refreshApp = async () => {
    if (updateReady) {
      await applyUpdate();
      return;
    }
    setBusy('update');
    await checkForUpdate();
    setBusy('');
    toast({
      tone: 'info',
      title: 'Buscando actualizaciones',
      description: 'Si hay una versión nueva, aparecerá aquí para instalarla.',
    });
  };

  return (
    <div>
      <PageHeading
        title="Configuración"
        subtitle="Instalación, modo offline, respaldo y datos locales."
        back={{ to: '/perfil', label: 'Mi perfil' }}
      />

      <AccessibilitySettings />
      <SectionHeader title="Aplicación" description="Instala Ayni como PWA en tu Android" />
      <Card className="mb-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <Smartphone size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              {installed ? 'Instalada en este dispositivo' : 'Instalar como aplicación'}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              {installed
                ? 'Abre Ayni desde el ícono para usarla en pantalla completa, incluso sin conexión.'
                : 'Agrega el ícono a tu pantalla de inicio. Funciona en standalone y sin internet.'}
            </p>
          </div>
          <Badge tone={installed ? 'success' : 'neutral'}>{installed ? 'Activa' : 'Pendiente'}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            full
            variant={canInstall ? 'primary' : 'outline'}
            disabled={!canInstall || installed}
            onClick={() => void promptInstall()}
          >
            <Download size={15} />
            {installed ? 'Ya instalada' : canInstall ? 'Instalar' : 'Usar menú'}
          </Button>
          <Button full variant="outline" loading={busy === 'update'} onClick={() => void refreshApp()}>
            <RefreshCw size={15} />
            {updateReady ? 'Actualizar' : 'Buscar update'}
          </Button>
        </div>
        {!canInstall && !installed ? (
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            En Chrome Android: menú ⋮ → “Agregar a la pantalla principal”. Si no aparece, la PWA debe
            servirse por HTTPS o localhost.
          </p>
        ) : null}
      </Card>

      {!sharedMode && <>
      <SectionHeader title="Modo offline" description="Demuestra que la app funciona sin red" />
      <Card className="mb-4">
        <Toggle
          checked={simulatedOffline}
          onChange={(value) => void toggleOffline(value)}
          label="Simular falta de conexión"
          description="Los cambios se guardan en IndexedDB y se encolan para sincronizar."
        />
        <div className="mt-2 border-t border-slate-100 pt-3">
          <Button
            full
            variant="secondary"
            loading={busy === 'prepare'}
            onClick={() => void prepare()}
          >
            <CloudDownload size={16} />
            Preparar mapa offline (demo)
          </Button>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            {demoPrepared === '1' ? (
              <>
                <ShieldCheck size={13} className="text-emerald-600" />
                Mosaicos del área demo guardados en caché.
              </>
            ) : (
              <>
                <WifiOff size={13} className="text-amber-500" />
                Aún no precargaste el radar. El resto de la app igual funciona.
              </>
            )}
          </p>
        </div>
      </Card>

      </>}
      <SectionHeader title="Sincronización" description={sharedMode ? "Operaciones pendientes con el servidor de tu comunidad" : "Cola local contra el servidor simulado"} />
      <Card className="mb-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-slate-50 px-2 py-3">
            <p className="text-lg font-semibold text-slate-900">{pending}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">En cola</p>
          </div>
          <div className={conflicts ? 'rounded-lg bg-crisis-50 px-2 py-3' : 'rounded-lg bg-slate-50 px-2 py-3'}>
            <p className={conflicts ? 'text-lg font-semibold text-crisis-700' : 'text-lg font-semibold text-slate-900'}>
              {conflicts}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Conflictos</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-2 py-3">
            <p className="text-lg font-semibold text-slate-900">{queued ?? 0}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Registros</p>
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
          <Wifi size={13} className={pending ? 'text-amber-500' : 'text-emerald-600'} />
          Última sincronización: {lastSyncAt ? formatDateTime(lastSyncAt) : 'pendiente'}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button full variant="outline" onClick={() => void kickSync()}>
            <RefreshCw size={15} />
            Sincronizar
          </Button>
          {!sharedMode && <Link
            to="/demo"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Panel demo
          </Link>}
        </div>
      </Card>

      <SectionHeader title="Almacenamiento local" />
      <Card className="mb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <HardDrive size={16} className="text-slate-700" />
            Almacenamiento
          </span>
          <span className="text-[11px] font-semibold text-slate-500">
            {formatBytes(storage.usage)} / {formatBytes(storage.quota)}
          </span>
        </div>
        <ProgressBar
          value={storage.quota ? Math.max(1, Math.round((storage.usage / storage.quota) * 100)) : 0}
          className="mt-2"
        />
        <p className="mt-1 text-[10px] text-slate-400">
          IndexedDB guarda perfiles, publicaciones, alertas, audios y la cola de sincronización.
        </p>

        {!sharedMode && <>
        <div className="mt-3 grid gap-2">
          <Button full variant="secondary" loading={busy === 'export'} onClick={() => void exportData()}>
            <CloudDownload size={16} />
            Exportar respaldo JSON
          </Button>
          <Button full variant="outline" onClick={() => fileRef.current?.click()}>
            <CloudUpload size={16} />
            Importar respaldo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importData(file);
              event.target.value = '';
            }}
          />
          <Button full variant="outline" loading={busy === 'reset'} onClick={() => void reset()}>
            <RotateCcw size={16} />
            Reiniciar datos de demo
          </Button>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          <Trash2 size={14} className="mt-0.5 shrink-0" />
          <span>
            Reiniciar borra los cambios locales y vuelve a los datos de demostración. Exporta antes si
            quieres conservar algo.
          </span>
        </div></>}
      </Card>

      <Card className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          <Database size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Privacidad por diseño</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            {sharedMode ? 'Tu sesión conecta este dispositivo con el servidor de la comunidad. La copia local permite trabajar al perder la red.' : 'Estás en la demostración. Los perfiles son ficticios y el servidor se simula en este navegador.'}
          </p>
          {!sharedMode && <Link to="/demo" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Upload size={13} />
            Ver el detalle en el panel demo
          </Link>}
        </div>
      </Card>

      <p className="mt-5 text-center text-[10px] text-slate-400">
        Ayni · {sharedMode ? 'red compartida' : 'demostración local'}
      </p>
    </div>
  );
}
