import { Link } from 'react-router-dom';
import { Compass, Home, Map, Search } from 'lucide-react';
import { Card } from '../components/ui';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center py-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
        <Compass size={30} />
      </span>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Error 404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Esta calle no existe</h1>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
        La página que buscas pudo moverse o ya no está disponible. Vuelve al inicio y sigue
        conectando con tu barrio.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Link
          to="/"
          className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white"
        >
          <Home size={15} />
          Ir al inicio
        </Link>
        <Link
          to="/muro"
          className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700"
        >
          <Search size={15} />
          Muro solidario
        </Link>
        <Link
          to="/mapa"
          className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700"
        >
          <Map size={15} />
          Radar
        </Link>
      </div>
      <Card className="mt-6 max-w-sm bg-slate-50 text-[11px] leading-relaxed text-slate-500">
        Si estabas usando la app instalada y ves esta pantalla tras actualizar, cierra y vuelve a
        abrir Ayni. El service worker conserva el app shell offline.
      </Card>
    </div>
  );
}
