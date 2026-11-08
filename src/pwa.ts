import { registerSW } from 'virtual:pwa-register';

type Listener = (available: boolean) => void;

let updateReady = false;
const listeners = new Set<Listener>();

const swRegistration = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateReady = true;
    listeners.forEach((listener) => listener(true));
    window.dispatchEvent(new Event('vecino360:update-ready'));
  },
  onOfflineReady() {
    window.dispatchEvent(new Event('vecino360:offline-ready'));
  },
});

export function onUpdateReady(listener: Listener): () => void {
  listeners.add(listener);
  listener(updateReady);
  return () => {
    listeners.delete(listener);
  };
}

export function isUpdateReady(): boolean {
  return updateReady;
}

export async function applyUpdate(): Promise<void> {
  if (swRegistration) {
    await swRegistration(true);
  } else {
    window.location.reload();
  }
}

export async function checkForUpdate(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  await registration?.update();
}
