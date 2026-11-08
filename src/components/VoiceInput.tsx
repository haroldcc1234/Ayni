import { useEffect, useRef, useState } from 'react';
import { Button } from './ui';

interface Recognition {
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  abort(): void;
}

export function VoiceInput({ onText }: { onText: (value: string) => void }) {
  const api = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Speech = api.SpeechRecognition ?? api.webkitSpeechRecognition;
  const active = useRef<Recognition>();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => {
    if (active.current) { active.current.onend = null; active.current.onerror = null; active.current.onresult = null; active.current.abort(); }
  }, []);
  if (!Speech) return null;
  return <div><Button size="sm" variant="outline" onClick={() => {
    if (listening) { active.current?.abort(); return; }
    const speech = new Speech();
    active.current = speech;
    speech.lang = 'es-PE';
    speech.onresult = e => onText(Array.from(e.results, result => result[0].transcript).join(' '));
    speech.onend = () => setListening(false);
    speech.onerror = () => { setListening(false); setError('El dictado se interrumpió. Puedes escribir o grabar una nota.'); };
    setError('');
    try { speech.start(); setListening(true); } catch { setError('El micrófono no está disponible.'); }
  }}>{listening ? 'Detener dictado' : 'Dictar descripción'}</Button>
  {error && <p role="status" className="mt-1 text-sm">{error}</p>}</div>;
}
