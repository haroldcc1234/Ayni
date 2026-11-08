import { api } from '../../sync/remote';
import { sharedMode } from '../../sync/mode';
import { distanceMeters } from '../../lib/geo';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Car,
  Check,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Gift,
  Handshake,
  MapPin,
  Mic,
  Package,
  Square,
  Timer,
  Trash2,
  Wrench,
  Siren,
  Store,
  MessagesSquare,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import type { AlertSeverity, ListingMeta, ListingType } from '../../db/types';
import {
  createAlert,
  createListing,
  updateProfile,
  upsertMyProvider,
} from '../../db/repositories';
import { DISTRICTS, getCurrentPosition } from '../../lib/geo';
import { LISTING_CATEGORIES, TRADES, addDaysIso, cn } from '../../lib/utils';
import { useAudioRecorder } from '../../hooks';
import { useAppStore } from '../../store/useAppStore';
import { COSTS, COST_LABEL } from '../../economy/points';
import { AudioPlayer } from '../../components/AudioPlayer';
import { VoiceInput } from '../../components/VoiceInput';
import { MapView } from '../../components/MapView';
import { Button, Input, Select, Textarea } from '../../components/ui';

type Kind = ListingType | 'alert';
type Step = 1 | 2 | 3;

const KIND_OPTIONS: Array<{
  kind: Kind;
  label: string;
  description: string;
  icon: typeof Wrench;
  tone: string;
  toneBg: string;
}> = [
  { kind: 'promotion', label: 'Promocionar un producto', description: 'Oferta del día o catálogo permanente',
    icon: Store, tone: 'text-emerald-700', toneBg: 'bg-emerald-50' },
  { kind: 'recommendation', label: 'Pedir recomendación', description: 'Encuentra un profesional de confianza',
    icon: MessagesSquare, tone: 'text-sky-700', toneBg: 'bg-sky-50' },
  {
    kind: 'loan',
    label: 'Prestar o alquilar',
    description: 'Herramientas, escaleras, proyector…',
    icon: Package,
    tone: 'text-violet-700',
    toneBg: 'bg-violet-50',
  },
  {
    kind: 'donation',
    label: 'Donar',
    description: 'Alimentos, ropa, útiles',
    icon: Gift,
    tone: 'text-rose-700',
    toneBg: 'bg-rose-50',
  },
  {
    kind: 'favor',
    label: 'Pedir un favor',
    description: 'Mudanza, mascotas, compras',
    icon: Handshake,
    tone: 'text-amber-700',
    toneBg: 'bg-amber-50',
  },
  {
    kind: 'time_bank',
    label: 'Banco de tiempo',
    description: 'Clases, reparaciones por horas',
    icon: Timer,
    tone: 'text-sky-700',
    toneBg: 'bg-sky-50',
  },
  {
    kind: 'mobility',
    label: 'Movilidad solidaria',
    description: 'Traslados y cupos en auto',
    icon: Car,
    tone: 'text-emerald-700',
    toneBg: 'bg-emerald-50',
  },
  {
    kind: 'service',
    label: 'Ofrecer mi oficio',
    description: 'Gasfitería, electricidad, costura…',
    icon: Wrench,
    tone: 'text-slate-700',
    toneBg: 'bg-slate-100',
  },
  {
    kind: 'alert',
    label: 'Reportar emergencia',
    description: 'SOS con severidad y ubicación',
    icon: Siren,
    tone: 'text-crisis-700',
    toneBg: 'bg-crisis-50',
  },
];

const ALERT_CATEGORIES = [
  'Rescate',
  'Gas',
  'Agua',
  'Estructura',
  'Salud',
  'Incendio',
  'Alimentos',
  'Otro',
];

const SEVERITIES: Array<{ value: AlertSeverity; label: string; description: string }> = [
  { value: 'critical', label: 'Crítica', description: 'Vida en riesgo inmediato' },
  { value: 'high', label: 'Alta', description: 'Requiere atención urgente' },
  { value: 'medium', label: 'Media', description: 'Necesidad importante' },
];

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function tomorrowLocal(): string {
  const date = new Date(Date.now() + 86_400_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function PublishForm({
  defaultKind,
  onDone,
  inline = false,
}: {
  defaultKind?: 'auto' | 'alert';
  onDone?: () => void;
  inline?: boolean;
}) {
  const currentProfileId = useAppStore((state) => state.currentProfileId);
  const currentProfile = useLiveQuery(
    () => db.profiles.get(currentProfileId),
    [currentProfileId],
  );
  const online = useAppStore((state) => state.online);
  const toast = useAppStore((state) => state.toast);

  const [step, setStep] = useState<Step>(defaultKind === 'alert' ? 2 : 1);
  const [kind, setKind] = useState<Kind | null>(defaultKind === 'alert' ? 'alert' : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [category, setCategory] = useState(LISTING_CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [trade, setTrade] = useState(TRADES[0]);
  const [schedule, setSchedule] = useState('Lun-Sáb 8am-7pm');
  const [coverageRadiusM, setCoverageRadiusM] = useState('800');
  const [condition, setCondition] = useState('Buen estado');
  const [pointsCost, setPointsCost] = useState<15|30|50>(15);
  const [price, setPrice] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [hourlyRate, setHourlyRate] = useState('0');
  const [returnBy, setReturnBy] = useState(tomorrowLocal());
  const [highValue, setHighValue] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [expiresAt, setExpiresAt] = useState('');
  const [deadline, setDeadline] = useState(tomorrowLocal());
  const [hours, setHours] = useState('1');
  const [skill, setSkill] = useState('');
  const [modality, setModality] = useState('Presencial');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [departureAt, setDepartureAt] = useState(tomorrowLocal());
  const [seats, setSeats] = useState('2');

  const [severity, setSeverity] = useState<AlertSeverity>('high');
  const [alertCategory, setAlertCategory] = useState(ALERT_CATEGORIES[0]);

  const [district, setDistrict] = useState(currentProfile?.district ?? DISTRICTS[0].name);
  const [coords, setCoords] = useState({
    lat: currentProfile?.lat ?? DISTRICTS[0].lat,
    lng: currentProfile?.lng ?? DISTRICTS[0].lng,
  });
  const [gpsState, setGpsState] = useState<'idle' | 'loading' | 'gps' | 'demo'>('idle');

  const recorder = useAudioRecorder(30);

  const activeKind = kind ? KIND_OPTIONS.find((option) => option.kind === kind) : null;

  const isEmergency = kind === 'alert';
  const isService = kind === 'service';

  const stepTitle = useMemo(() => {
    if (step === 1) return '¿Qué quieres publicar?';
    if (step === 2) return isEmergency ? 'Detalle de la emergencia' : 'Cuéntanos un poco más';
    return 'Ubicación y confirmación';
  }, [step, isEmergency]);

  const resetAll = () => {
    setStep(defaultKind === 'alert' ? 2 : 1);
    setKind(defaultKind === 'alert' ? 'alert' : null);
    setError('');
    setTitle('');
    setDescription('');
    setReturnBy(tomorrowLocal());
    setDeadline(tomorrowLocal());
    setDepartureAt(tomorrowLocal());
    setSkill('');
    setOrigin('');
    setDestination('');
    recorder.clear();
  };

  const finish = (message: string) => {
    toast({
      tone: online ? 'success' : 'warning',
      title: message,
      description: online
        ? 'Se sincronizará automáticamente.'
        : 'Guardado en este dispositivo. Se enviará al reconectar.',
    });
    resetAll();
    onDone?.();
  };

  const handleGps = async () => {
    if (!sharedMode && currentProfile) {
      setDistrict(currentProfile.district);
      setCoords({lat: currentProfile.lat, lng: currentProfile.lng});
      setGpsState('gps');
      setError('');
      return;
    }
    setGpsState('loading');
    const result = await getCurrentPosition();
    if(result.source!=='gps'){setGpsState('demo');return;}
    try {
      let detected = currentProfile?.district ?? '';
      if(sharedMode && online) detected=(await api<{district:string}>('/location/resolve','POST',result.coords)).district;
      else if(!currentProfile || distanceMeters(currentProfile,result.coords)>800) throw new Error('Conéctate para detectar esta nueva zona.');
      if(currentProfile && detected!==currentProfile.district) throw new Error('Actualiza la ubicación en tu perfil antes de publicar desde otro distrito.');
      setDistrict(detected);
      setCoords({lat:Math.round(result.coords.lat*1000)/1000,lng:Math.round(result.coords.lng*1000)/1000});
      setGpsState('gps');setError('');
    } catch(e){setError((e as Error).message);setGpsState('demo');}
  };

  const validateDetails = (): boolean => {
    if (kind === 'promotion' && (!price.trim() || !Number.isFinite(Number(price)) || Number(price) < 0)) {
      setError('Ingresa un precio válido en soles.'); return false;
    }
    if (kind === 'loan' && (!Number.isFinite(Number(hourlyRate)) || Number(hourlyRate) < 0)) {
      setError('La tarifa por hora debe ser cero o mayor.'); return false;
    }
    if (title.trim().length < 4) {
      setError('Escribe un título de al menos 4 caracteres.');
      return false;
    }
    if (description.trim().length < 10 && !recorder.blob) {
      setError('Agrega una descripción de al menos 10 caracteres.');
      return false;
    }
    if (isService && !currentProfile) {
      setError('Necesitas un perfil para ofrecer un oficio.');
      return false;
    }
    return true;
  };

  const buildMeta = (): ListingMeta => {
    if (kind === 'promotion') return { price: Number(price), durationHours: durationHours ? Number(durationHours) : undefined };
    if (kind === 'loan') {
      return {
        condition,
        hourlyRate: Number(hourlyRate),
        returnBy: toIso(returnBy),
        highValue,
      };
    }
    if (kind === 'donation') {
      return {
        quantity,
        condition,
        expiresAt: toIso(expiresAt) ?? addDaysIso(120),
      };
    }
    if (kind === 'favor') {
      return { deadline: toIso(deadline), pointsCost, coverageRadiusM: Number(coverageRadiusM) };
    }
    if (kind === 'time_bank') {
      return {
        pointsCost,
        hours: Math.max(1, Number(hours) || 1),
        skill: skill.trim() || 'Apoyo vecinal',
        modality,
      };
    }
    if (kind === 'mobility') {
      return {
        origin: origin.trim() || district,
        destination: destination.trim() || 'Destino por coordinar',
        departureAt: toIso(departureAt),
        seats: Math.max(1, Number(seats) || 1),
      };
    }
    if (kind === 'service') {
      return {
        trade,
        schedule,
        coverageRadiusM: Math.max(200, Number(coverageRadiusM) || 800),
      };
    }
    return {};
  };

  const submit = async () => {
    setError('');
    if (!currentProfile) {
      setError('No encontramos tu perfil local. Vuelve a registrarte.');
      return;
    }
    if (gpsState !== 'gps') {setError('Permite la ubicación y reintenta antes de publicar.');return;}
    if (!kind) {
      setError('Elige un tipo de publicación.');
      return;
    }
    if (title.trim().length < 4) {
      setError('El título es demasiado corto.');
      return;
    }
    if (description.trim().length < 10 && !recorder.blob) {
      setError('La descripción es demasiado corta.');
      return;
    }

    setBusy(true);
    try {
      if (kind === 'alert') {
        const alert = await createAlert({
          severity,
          category: alertCategory,
          title,
          description,
          author: currentProfile,
          district,
          lat: coords.lat,
          lng: coords.lng,
          audio: recorder.blob,
          audioMime: recorder.blob?.type,
          audioDuration: recorder.blob ? recorder.duration : undefined,
        });
        finish(online ? 'Alerta registrada para su envío' : 'Alerta guardada en este dispositivo');
        void alert;
      } else {
        if (kind === 'service') {
          if (!currentProfile.roles.includes('prestador')) {
            await updateProfile(currentProfile.id, {
              roles: [...new Set([...currentProfile.roles, 'prestador' as const])],
            });
          }
          await upsertMyProvider(currentProfile, {
            trade,
            description: description.trim(),
            district,
            lat: coords.lat,
            lng: coords.lng,
            coverageRadiusM: Math.max(200, Number(coverageRadiusM) || 800),
            schedule,
          });
        }

        await createListing({
          type: kind,
          category: isService ? trade : category,
          title,
          description,
          authorId: currentProfile.id,
          district,
          lat: coords.lat,
          lng: coords.lng,
          meta: buildMeta(),
          audio: recorder.blob,
          audioMime: recorder.blob?.type,
          audioDuration: recorder.blob ? recorder.duration : undefined,
        });
        finish(isService ? 'Oficio publicado en el directorio' : 'Publicación creada');
      }
    } catch (caught) {
      setBusy(false);
      setError(caught instanceof Error ? caught.message : 'No pudimos guardar la publicación.');
      return;
    }
    setBusy(false);
  };

  const body = (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((value) => (
          <div
            key={value}
            className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              step >= value ? (isEmergency ? 'bg-crisis-600' : 'bg-slate-900') : 'bg-slate-200',
            )}
          />
        ))}
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Paso {step} de 3
        </p>
        <h3 className="mt-0.5 text-lg font-semibold text-slate-900">{stepTitle}</h3>
      </div>

      {step === 1 ? (
        <div className="grid grid-cols-2 gap-2.5">
          {KIND_OPTIONS.map((option) => {
            const Icon = option.icon;
            const selected = kind === option.kind;
            return (
              <button
                key={option.kind}
                type="button"
                onClick={() => {
                  setKind(option.kind);
                  setStep(2);
                  setError('');
                  setCategory(
                    option.kind === 'mobility'
                      ? 'Transporte'
                      : option.kind === 'donation'
                        ? 'Alimentos'
                        : LISTING_CATEGORIES[0],
                  );
                }}
                className={cn(
                  'flex min-h-[120px] flex-col items-start rounded-lg border p-3 text-left transition',
                  selected
                    ? 'border-slate-900 bg-slate-50 ring-1 ring-slate-900'
                    : 'border-slate-200 bg-white hover:border-slate-200',
                  option.kind === 'alert' && selected && 'border-crisis-500 bg-crisis-50 ring-crisis-300',
                )}
              >
                <span
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl',
                    option.toneBg,
                    option.tone,
                  )}
                >
                  <Icon size={19} />
                </span>
                <span className="mt-2 block text-xs font-semibold leading-tight text-slate-900">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[10px] leading-tight text-slate-500">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-3.5">
          {isEmergency ? (
            <>
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Severidad
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {SEVERITIES.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setSeverity(item.value)}
                      className={cn(
                        'rounded-lg border p-2.5 text-left transition',
                        severity === item.value
                          ? item.value === 'critical'
                            ? 'border-crisis-500 bg-crisis-50'
                            : item.value === 'high'
                              ? 'border-amber-400 bg-amber-50'
                              : 'border-sky-400 bg-sky-50'
                          : 'border-slate-200 bg-white',
                      )}
                    >
                      <span className="block text-xs font-semibold text-slate-900">{item.label}</span>
                      <span className="mt-0.5 block text-[10px] leading-tight text-slate-500">
                        {item.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <Select
                label="Categoría"
                value={alertCategory}
                onChange={(event) => setAlertCategory(event.target.value)}
              >
                {ALERT_CATEGORIES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </>
          ) : (
            <>
              {isService ? (
                <>
                  <Select label="Oficio" value={trade} onChange={(event) => setTrade(event.target.value)}>
                    {TRADES.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </Select>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Horario"
                      value={schedule}
                      onChange={(event) => setSchedule(event.target.value)}
                    />
                    <Input
                      label="Cobertura (m)"
                      inputMode="numeric"
                      value={coverageRadiusM}
                      onChange={(event) => setCoverageRadiusM(event.target.value)}
                    />
                  </div>
                </>
              ) : (
                <Select
                  label="Categoría"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {LISTING_CATEGORIES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </Select>
              )}

              {kind === 'promotion' && <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Precio (S/)" type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} />
                <Select label="Duración de la oferta" value={durationHours} onChange={e => setDurationHours(e.target.value)}>
                  <option value="">Catálogo permanente</option>
                  {Array.from({length: 11}, (_, i) => i + 2).map(h => <option key={h} value={h}>{h} horas</option>)}
                </Select>
              </div>}
              {kind === 'loan' ? (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Condición"
                    value={condition}
                    onChange={(event) => setCondition(event.target.value)}
                  />
                  <Input label="Alquiler por hora (S/)" hint="0 para préstamo gratuito" type="number" min="0"
                    step="0.01" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} />
                  <Input
                    label="Devolver antes de"
                    type="datetime-local"
                    value={returnBy}
                    onChange={(event) => setReturnBy(event.target.value)}
                  />
                  <label className="col-span-2 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={highValue}
                      onChange={(event) => setHighValue(event.target.checked)}
                      className="h-4 w-4 accent-slate-900"
                    />
                    Bien de alto valor (requiere 5 puntos de reputación)
                  </label>
                </div>
              ) : null}

              {kind === 'donation' ? (
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Estado del bien" value={condition} onChange={event => setCondition(event.target.value)}>
                    {['Nuevo', 'Buen estado', 'Con señales de uso'].map(value => <option key={value}>{value}</option>)}
                  </Select>
                  <Input
                    label="Cantidad"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                  <Input
                    label="Vence el"
                    type="date"
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                  />
                </div>
              ) : null}

              {kind === 'favor' ? (
                <>
                <Input
                  label="Fecha límite"
                  type="datetime-local"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                />
                <Select label="Avisar a vecinos del sector en un radio de" value={coverageRadiusM} onChange={event => setCoverageRadiusM(event.target.value)}>
                  {[200, 500, 800, 1500, 3000].map(radius => <option key={radius} value={radius}>{radius} metros</option>)}
                </Select>
                </>
              ) : null}
              {kind === 'favor' || kind === 'time_bank' ? (
                <Select label={kind === 'favor' ? 'Puntos que se reservarán al publicar' : 'Puntos por el intercambio completo'} value={pointsCost}
                  onChange={event => setPointsCost(Number(event.target.value) as 15|30|50)}>
                  {COSTS.map(cost => <option key={cost} value={cost}>{COST_LABEL[cost]} · {cost} puntos</option>)}
                </Select>
              ) : null}

              {kind === 'time_bank' ? (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Horas"
                    type="number"
                    min={1}
                    value={hours}
                    onChange={(event) => setHours(event.target.value)}
                  />
                  <Select
                    label="Modalidad"
                    value={modality}
                    onChange={(event) => setModality(event.target.value)}
                  >
                    <option>Presencial</option>
                    <option>Virtual</option>
                    <option>A domicilio</option>
                  </Select>
                  <div className="col-span-2">
                    <Input
                      label="Habilidad"
                      placeholder="Inglés, mecánica, cocina…"
                      value={skill}
                      onChange={(event) => setSkill(event.target.value)}
                    />
                  </div>
                </div>
              ) : null}

              {kind === 'mobility' ? (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Origen"
                    placeholder={district}
                    value={origin}
                    onChange={(event) => setOrigin(event.target.value)}
                  />
                  <Input
                    label="Destino"
                    placeholder="Clínica, mercado…"
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                  />
                  <Input
                    label="Salida"
                    type="datetime-local"
                    value={departureAt}
                    onChange={(event) => setDepartureAt(event.target.value)}
                  />
                  <Input
                    label="Cupos"
                    type="number"
                    min={1}
                    max={6}
                    value={seats}
                    onChange={(event) => setSeats(event.target.value)}
                  />
                </div>
              ) : null}
            </>
          )}

          <Input
            label="Título"
            placeholder={
              isEmergency
                ? 'Ej. Persona atrapada en edificio'
                : isService
                  ? 'Ej. Instalación de luces LED'
                  : 'Ej. Taladro disponible para préstamo'
            }
            value={title}
            maxLength={80}
            onChange={(event) => setTitle(event.target.value)}
          />
          <Textarea
            label="Descripción"
            placeholder={
              isEmergency
                ? 'Describe qué pasó, quién necesita ayuda y qué se requiere.'
                : 'Detalla condiciones, horarios y cualquier dato útil para tus vecinos.'
            }
            value={description}
            maxLength={400}
            onChange={(event) => setDescription(event.target.value)}
          />
          <VoiceInput onText={text => setDescription(previous => (previous + ' ' + text).trim().slice(0, 400))} />

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <Mic size={14} /> Nota de voz (opcional)
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Hasta 30 segundos. Útil para adultos mayores o cuando escribir es difícil.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {!recorder.recording ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void recorder.start()}
                  disabled={!recorder.supported}
                >
                  <Mic size={15} />
                  {recorder.blob ? 'Grabar de nuevo' : 'Grabar audio'}
                </Button>
              ) : (
                <Button size="sm" variant="danger" onClick={recorder.stop}>
                  <Square size={14} />
                  Detener ({30 - recorder.elapsed}s)
                </Button>
              )}
              {recorder.blob ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={recorder.clear}
                  aria-label="Eliminar audio"
                >
                  <Trash2 size={15} />
                </Button>
              ) : null}
            </div>
            {recorder.error ? (
              <p className="mt-2 text-[11px] font-medium text-crisis-600">{recorder.error}</p>
            ) : null}
            {recorder.blob ? (
              <AudioPlayer
                blob={recorder.blob}
                duration={recorder.duration}
                className="mt-2 bg-white"
              />
            ) : null}
          </div>

          {error ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-crisis-50 px-3 py-2 text-xs font-medium text-crisis-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-3.5">
          <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <MapPin size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900">
                {step === 3 ? activeKind?.label : 'Publicación'}
              </p>
              <p className="truncate text-[11px] text-slate-500">{title || 'Sin título'}</p>
            </div>
          </div>

          <MapView
            center={coords}
            points={[
              {
                id: 'new',
                lat: coords.lat,
                lng: coords.lng,
                label: title || 'Tu publicación',
                tone: isEmergency ? 'alert' : 'listing',
              },
            ]}
            radiusM={800}
            height="190px"
          />

          <Button
            variant="secondary"
            full
            onClick={() => void handleGps()}
            loading={gpsState === 'loading'}
          >
            <Crosshair size={17} />
            {!sharedMode ? 'Ubicación del perfil de muestra' : gpsState === 'gps'
              ? 'Usar mi ubicación GPS actual'
              : gpsState === 'demo'
                ? 'GPS no disponible · reintentar'
                : 'Obtener mi ubicación'}
          </Button>
          {gpsState === 'demo' ? (
            <p className="text-[11px] text-amber-700">
              Activa la ubicación en los permisos del navegador y reintenta.
            </p>
          ) : null}

          <p>Zona detectada · {district}</p>


          <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5 text-[11px] leading-relaxed text-slate-800">
            <p className="font-semibold">
              {online ? 'Se guardará y sincronizará' : 'Se guardará sin conexión'}
            </p>
            <p className="mt-0.5">
              {online
                ? 'La publicación queda visible de inmediato y entra a la cola de sincronización.'
                : 'Quedará visible para tus vecinos en este dispositivo y se enviará al reconectar.'}
            </p>
          </div>

          {error ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-crisis-50 px-3 py-2 text-xs font-medium text-crisis-700">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="sticky bottom-0 -mx-1 flex items-center gap-2 bg-white/95 py-2 backdrop-blur">
        {step > 1 ? (
          <Button
            variant="outline"
            onClick={() => {
              setError('');
              setStep((value) => (value === 3 ? 2 : 1));
            }}
            className="shrink-0"
          >
            <ChevronLeft size={17} />
            Atrás
          </Button>
        ) : null}

        {step === 2 ? (
          <Button
            full
            variant={isEmergency ? 'crisis' : 'primary'}
            onClick={() => {
              if (!validateDetails()) return;
              setError('');
              setStep(3);
              void handleGps();
            }}
          >
            Continuar
            <ChevronRight size={17} />
          </Button>
        ) : null}

        {step === 3 ? (
          <Button
            full
            variant={isEmergency ? 'crisis' : 'primary'}
            loading={busy}
            onClick={() => void submit()}
          >
            <Check size={18} />
            {isEmergency ? 'Publicar SOS' : 'Publicar ahora'}
          </Button>
        ) : null}
      </div>

      {inline ? (
        <p className="pb-2 text-center text-[10px] text-slate-400">
          Publicación local · datos guardados en IndexedDB
        </p>
      ) : null}
    </div>
  );

  return body;
}
