import { sharedIdentity, sharedMode } from '../sync/mode';
import { pullRemote } from '../sync/remote';
import { db } from '../db/db';
import { seedDatabase } from '../db/seed';
import { useAppStore } from '../store/useAppStore';
import { startSyncEngine } from '../sync/engine';

export async function bootstrap(): Promise<void> {
  if (!sharedMode) await seedDatabase();
  else if (sharedIdentity()) {
    try { await pullRemote(); }
    catch (e) {
      if (!(await db.profiles.get(sharedIdentity()))) throw e;
    }
  } else if (!['/login','/registro','/recuperar'].includes(window.location.pathname)) {
    window.location.replace('/login');
    return;
  }

  const settings = await db.settings.toArray();
  const setting = (key: string) => settings.find((item) => item.key === key)?.value ?? '';

  const storedProfileId = setting('currentProfileId');
  let profileId = sharedMode ? sharedIdentity() : storedProfileId;
  const profileExists = storedProfileId
    ? await db.profiles.get(storedProfileId)
    : undefined;

  if (!profileExists && !sharedMode) {
    const first = await db.profiles.orderBy('createdAt').first();
    profileId = first?.id ?? '';
    if (profileId) {
      await db.settings.put({ key: 'currentProfileId', value: profileId });
    }
  }

  const store = useAppStore.getState();
  store.setCurrentProfileId(profileId);
  store.setEmergencyMode(setting('emergencyMode') === '1');
  store.setSimulatedOffline(setting('simulatedOffline') === '1');
  store.setLastSyncAt(setting('lastSyncAt'));
  store.refreshOnline();

  const refresh = () => useAppStore.getState().refreshOnline();
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });

  startSyncEngine();

  if ('storage' in navigator && 'persist' in navigator.storage) {
    try {
      await navigator.storage.persist();
    } catch {
      /* el navegador puede rechazarlo */
    }
  }

  store.setReady(true);
}

