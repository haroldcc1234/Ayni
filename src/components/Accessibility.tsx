import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentProfile, useSetting } from '../hooks';
import { setSetting } from '../db/repositories';
import { useAppStore } from '../store/useAppStore';
import { Card, Select, Toggle } from './ui';

function usePreferences() {
  const { profile } = useCurrentProfile();
  const prefix = 'a11y.' + (profile?.id ?? 'guest') + '.';
  const savedScale = useSetting(prefix + 'scale');
  const savedContrast = useSetting(prefix + 'contrast');
  const shortcut = useSetting(prefix + 'shortcut') || '';
  const scale = savedScale || (profile?.protectionSince ? '150' : '100');
  const contrast = savedContrast ? savedContrast === '1' : Boolean(profile?.protectionSince);
  return { prefix, scale, contrast, shortcut };
}

export function AccessibilityBehavior() {
  const { scale, contrast, shortcut } = usePreferences();
  const navigate = useNavigate();
  const openPublish = useAppStore(state => state.openPublish);
  useEffect(() => {
    const html = document.documentElement;
    html.style.fontSize = Math.min(200, Math.max(100, Number(scale) || 100)) + '%';
    html.classList.toggle('strong-contrast', contrast);
    return () => { html.style.removeProperty('font-size'); html.classList.remove('strong-contrast'); };
  }, [scale, contrast]);
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey || event.repeat || document.querySelector('[aria-modal="true"]')) return;
      if (event.code === 'Key' + shortcut) { event.preventDefault(); openPublish('auto'); }
      if (event.code === 'KeyM') { event.preventDefault(); navigate('/mapa'); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate, openPublish, shortcut]);
  return null;
}

export function AccessibilitySettings() {
  const { prefix, scale, contrast, shortcut } = usePreferences();
  return <Card className="mb-4 space-y-3">
    <h2 className="font-semibold">Accesibilidad</h2>
    <Select label="Tamaño de texto" value={scale} onChange={e => void setSetting(prefix + 'scale', e.target.value)}>
      {[100, 125, 150, 175, 200].map(n => <option value={n} key={n}>{n} %</option>)}
    </Select>
    <Toggle label="Alto contraste" checked={contrast} onChange={v => void setSetting(prefix + 'contrast', v ? '1' : '0')} />
    <Select label="Atajos de teclado" value={shortcut} onChange={e => void setSetting(prefix + 'shortcut', e.target.value)}>
      <option value="">Desactivados</option>
      {['P', 'N'].map(key => <option key={key} value={key}>Publicar con Alt + Mayús + {key}</option>)}
    </Select>
    {shortcut && <p className="text-sm">Abrir mapa con Alt + Mayús + M.</p>}
  </Card>;
}
