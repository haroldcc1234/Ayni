import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLng } from '../lib/geo';

export type MapTone = 'me' | 'provider' | 'listing' | 'alert' | 'brigade' | 'need';

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  description?: string;
  tone: MapTone;
  link?: string;
}

const TONE_COLORS: Record<MapTone, string> = {
  me: '#1c1b19',
  provider: '#475569',
  listing: '#78716c',
  alert: '#9a3325',
  brigade: '#2f6647',
  need: '#b45309',
};

function AutoFit({ points, center }: { points: MapPoint[]; center: LatLng }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 0) {
      map.setView([center.lat, center.lng], 15);
      return;
    }
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 16);
      return;
    }
    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number]));
    bounds.extend([center.lat, center.lng]);
    map.fitBounds(bounds.pad(0.18), { maxZoom: 16, animate: false });
  }, [map, points, center.lat, center.lng]);

  return null;
}

export function MapView({
  center,
  points,
  radiusM = 800,
  height = '320px',
  fit = true,
  density = false,
}: {
  center: LatLng;
  points: MapPoint[];
  radiusM?: number;
  height?: string;
  fit?: boolean;
  density?: boolean;
}) {
  const memoPoints = useMemo(() => points, [points]);

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-200 "
      style={{ height }}
    >
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={15}
        scrollWheelZoom={false}
        zoomControl
        className="h-full w-full"
        attributionControl={false}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap"
        />
        <Circle
          center={[center.lat, center.lng]}
          radius={radiusM}
          pathOptions={{
            color: '#5f5b52',
            weight: 1,
            fillColor: '#8f8a7e',
            fillOpacity: 0.08,
            dashArray: '6 6',
          }}
        />
        <CircleMarker
          center={[center.lat, center.lng]}
          radius={9}
          pathOptions={{
            color: '#ffffff',
            weight: 3,
            fillColor: TONE_COLORS.me,
            fillOpacity: 1,
          }}
        >
          <Popup>
            <strong>Estás aquí</strong>
            <br />
            Tu sector de referencia
          </Popup>
        </CircleMarker>

        {density && memoPoints.filter(point=>point.tone==='alert').map(point=><Circle key={'risk-'+point.id} center={[point.lat,point.lng]} radius={180} pathOptions={{stroke:false,fillColor:'#A84A3A',fillOpacity:.18}}/>)}
        {memoPoints.map((point) => (
          <CircleMarker
            key={`${point.tone}-${point.id}`}
            center={[point.lat, point.lng]}
            radius={point.tone === 'alert' ? 10 : 8}
            pathOptions={{
              color: '#ffffff',
              weight: 2.5,
              fillColor: TONE_COLORS[point.tone],
              fillOpacity: 1,
            }}
          >
            <Popup>
              <strong>{point.label}</strong>
              {point.description ? (
                <>
                  <br />
                  <span>{point.description}</span>
                </>
              ) : null}
              {point.link ? (
                <>
                  <br />
                  <Link to={point.link} className="font-semibold text-slate-900">
                    Ver detalle →
                  </Link>
                </>
              ) : null}
            </Popup>
          </CircleMarker>
        ))}

        {fit ? <AutoFit points={memoPoints} center={center} /> : null}
      </MapContainer>

      <div className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-md border border-slate-200 bg-white/90 px-2 py-1 text-[10px] font-medium text-slate-500">
        Radio {radiusM} m · datos locales
      </div>
    </div>
  );
}
