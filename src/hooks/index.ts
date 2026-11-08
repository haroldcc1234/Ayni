import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { NotificationType, Profile } from '../db/types';
import { useAppStore } from '../store/useAppStore';

export function useCurrentProfile() {
  const currentProfileId = useAppStore((state) => state.currentProfileId);

  const profile = useLiveQuery<Profile | undefined>(
    () => db.profiles.get(currentProfileId),
    [currentProfileId],
  );

  const points = useLiveQuery(async () => {
    const events = await db.reputationEvents
      .where('profileId')
      .equals(currentProfileId)
      .toArray();
    return events.reduce((sum, event) => sum + event.points, 0);
  }, [currentProfileId]);

  const unread = useLiveQuery(
    () =>
      db.notifications
        .where('[profileId+read]')
        .equals([currentProfileId, 0])
        .count(),
    [currentProfileId],
  );

  return {
    profile,
    points: points ?? 0,
    unread: unread ?? 0,
    loading: profile === undefined,
  };
}

export function useUnreadNotifications(profileId: string | undefined) {
  return useLiveQuery(
    () =>
      profileId
        ? db.notifications.where('[profileId+read]').equals([profileId, 0]).count()
        : 0,
    [profileId],
  );
}

export function useSetting(key: string) {
  return useLiveQuery(async () => {
    const setting = await db.settings.get(key);
    return setting?.value ?? '';
  }, [key]);
}

export function useOnline() {
  return useAppStore((state) => state.online);
}

export function useEmergencyMode() {
  return useAppStore((state) => state.emergencyMode);
}

export function useUnreadByType(profileId: string | undefined, type: NotificationType) {
  return useLiveQuery(
    () =>
      profileId
        ? db.notifications
            .where('profileId')
            .equals(profileId)
            .filter((item) => item.type === type && item.read === 0)
            .count()
        : 0,
    [profileId, type],
  );
}

/* ------------------------------------------------------------------ */
/* Audio                                                               */
/* ------------------------------------------------------------------ */

export function useAudioRecorder(maxSeconds = 30) {
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | undefined>();
  const [duration, setDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const startedAtRef = useRef(0);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = undefined;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    setRecording(false);
  }, []);

  const start = useCallback(async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este navegador no permite grabar audio. Puedes escribir la descripción.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : undefined;
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        const seconds = Math.min(
          maxSeconds,
          Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
        );
        setBlob(recorded);
        setDuration(seconds);
        stopTracks();
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setRecording(true);
      setElapsed(0);
      setBlob(undefined);
      setDuration(0);

      timerRef.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsed(seconds);
        if (seconds >= maxSeconds) stop();
      }, 250);
    } catch {
      setError('No pudimos acceder al micrófono. Revisa los permisos o escribe la descripción.');
      stopTracks();
    }
  }, [maxSeconds, stop, stopTracks]);

  const clear = useCallback(() => {
    setBlob(undefined);
    setDuration(0);
    setElapsed(0);
    setError('');
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      stopTracks();
    },
    [stopTracks],
  );

  return {
    recording,
    blob,
    duration,
    elapsed,
    error,
    start,
    stop,
    clear,
    supported:
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== 'undefined',
  };
}

/* ------------------------------------------------------------------ */
/* PWA install prompt                                                  */
/* ------------------------------------------------------------------ */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setPromptEvent(null);
    return choice.outcome === 'accepted';
  }, [promptEvent]);

  return { canInstall: Boolean(promptEvent), installed, promptInstall };
}
