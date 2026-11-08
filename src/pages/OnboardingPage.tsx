import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  HandHeart,
  Radio,
  ShieldCheck,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { Button } from '../components/ui';
import { cn } from '../lib/utils';

const SLIDES = [
  {
    icon: Wrench,
    badge: 'Economía hiperlocal',
    title: 'Tu barrio tiene todo lo que necesitas',
    description:
      'Encuentra gasfiteros, electricistas, costureras y técnicos validados por tus propios vecinos. El Visto Bueno pesa según la cercanía real.',
    points: ['Directorio por distancia', 'Visto Bueno ponderado', 'Contacto directo'],
    tone: 'bg-slate-900',
  },
  {
    icon: HandHeart,
    badge: 'Red de apoyo',
    title: 'Presta, dona, comparte tiempo',
    description:
      'Un taladro, una caja de leche, dos horas de inglés o un cupo en tu auto. Cada intercambio fortalece la confianza del barrio.',
    points: ['Préstamos con devolución', 'Donaciones y favores', 'Banco de tiempo'],
    tone: 'bg-community-700',
  },
  {
    icon: Radio,
    badge: 'Resiliencia comunitaria',
    title: 'Cuando todo falla, el barrio responde',
    description:
      'Alertas con severidad, brigadistas con habilidades y recursos, coordinación vecinal. Funciona incluso sin internet.',
    points: ['SOS con ubicación', 'Brigada y coordinador', 'Offline-first real'],
    tone: 'bg-crisis-700',
  },
];

export function OnboardingPage() {
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const slide = SLIDES[index];
  const Icon = slide.icon;
  const last = index === SLIDES.length - 1;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-6 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-[10px] font-semibold tracking-tight text-white">
              360
            </span>
            <span className="text-[13px] font-semibold tracking-tight text-slate-900">Ayni</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-2 py-2 text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            Saltar
          </button>
        </div>

        <div className="mt-6 flex justify-center gap-1.5">
          {SLIDES.map((item, itemIndex) => (
            <span
              key={item.badge}
              className={cn(
                'h-1 rounded-full transition-all',
                itemIndex === index ? 'w-8 bg-slate-900' : 'w-2 bg-slate-300',
              )}
            />
          ))}
        </div>

        <div
          className={cn(
            'mt-6 flex flex-1 flex-col justify-center rounded-2xl p-6 text-white',
            slide.tone,
          )}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-white/20 bg-white/5">
            <Icon size={26} className="text-white" />
          </span>
          <p className="mt-5 text-[10px] font-medium uppercase tracking-[0.18em] text-white/60">
            {slide.badge}
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold leading-tight tracking-tight">{slide.title}</h1>
          <p className="mt-2 text-xs leading-relaxed text-white/70">{slide.description}</p>

          <ul className="mt-5 space-y-2">
            {slide.points.map((point) => (
              <li key={point} className="flex items-center gap-2 text-[11px] font-medium text-white/80">
                <ShieldCheck size={14} className="text-white/50" />
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-[10px] text-white/60">
            <WifiOff size={13} />
            Tus datos viven en tu dispositivo. La app funciona sin conexión.
          </div>
        </div>

        <div className="mt-5">
          {last ? (
            <div className="space-y-2">
              <Button full size="lg" onClick={() => navigate('/registro')}>
                Crear mi perfil
                <ArrowRight size={18} />
              </Button>
              <Button full variant="outline" onClick={() => navigate('/')}>
                Explorar el barrio
              </Button>
            </div>
          ) : (
            <Button full size="lg" onClick={() => setIndex((value) => value + 1)}>
              Siguiente
              <ArrowRight size={18} />
            </Button>
          )}
          <div className="mt-3 flex flex-col items-center gap-1.5 text-center">
            <Link
              to="/login"
              className="text-xs font-medium text-slate-700 hover:text-slate-900 hover:underline"
            >
              ¿Ya tienes cuenta o quieres probar un rol? Iniciar sesión →
            </Link>
            <Link
              to="/registro"
              className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
            >
              Crear perfil nuevo desde cero
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
