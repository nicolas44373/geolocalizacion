'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Compass,
  Map,
  User,
  PlusCircle,
  Copy,
  Check,
  ArrowRight,
  ExternalLink,
  Info,
  RefreshCw,
} from 'lucide-react';

export default function Home() {
  const [nombre, setNombre] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ nombre: string; token: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreateTestFolletero = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await fetch('/api/tracker/crear-prueba', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nombre: nombre.trim() || 'Folletero Demo' }),
      });

      if (!res.ok) throw new Error('Error al crear el folletero');
      const data = await res.json();
      setResult({
        nombre: data.folletero.nombre,
        token: data.folletero.token,
        link: data.trackingLink,
      });
      setNombre('');
    } catch (err) {
      alert('Error de conexión o de base de datos.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!result) return;
    const fullUrl = window.location.origin + result.link;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans text-slate-800">
      
      {/* Header */}
      <header className="bg-slate-900 text-white py-6 border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 flex items-center gap-3">
          <Compass className="w-8 h-8 text-blue-400 animate-spin-slow" />
          <div>
            <h1 className="text-xl font-black tracking-tight font-display">GEO-FOLLETO</h1>
            <p className="text-xs text-slate-400">Rastreo de Personal de Campo en Tiempo Real</p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 py-12 flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        
        {/* Columna Izquierda: Acceso al Panel e Instrucciones */}
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
              <Map className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 font-display">
                Panel del Empleador
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Visualiza el mapa en tiempo real, monitorea estados de conexión (activo, pausado, sin señal, finalizado) y revisa rutas históricas.
              </p>
            </div>
            
            <div className="pt-2">
              <Link
                href="/panel"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm hover:bg-slate-800 transition"
              >
                Abrir Panel Web <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          <div className="bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <Info className="w-4 h-4 text-blue-500" />
              <span>Instrucciones de Prueba</span>
            </div>
            <ol className="list-decimal list-inside text-sm text-slate-600 space-y-2.5">
              <li>
                Abre el <Link href="/panel" className="text-blue-600 font-semibold underline">Panel del Empleador</Link> e inicia sesión usando la contraseña de administrador (por defecto es <code className="bg-slate-100 px-1 py-0.5 rounded text-red-600 font-mono">admin123</code>).
              </li>
              <li>
                Genera un **Folletero de Prueba** usando el formulario a la derecha de esta pantalla.
              </li>
              <li>
                Abre el **Link de Rastreo** en tu teléfono móvil o en una ventana de navegador diferente (simulando al folletero).
              </li>
              <li>
                En la app del folletero, haz clic en **"Iniciar Jornada"** y concede los permisos de GPS cuando el navegador lo solicite.
              </li>
              <li>
                Verás aparecer el marcador en tiempo real en el **Panel del Empleador**. A medida que te desplaces, el recorrido irá dibujándose en vivo.
              </li>
            </ol>
          </div>
        </div>

        {/* Columna Derecha: Generador de Folleteros de Prueba */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
            <User className="w-6 h-6 text-emerald-600" />
          </div>
          
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900 font-display">
              Generador de Tracker
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Crea un folletero ficticio en la base de datos de Supabase para obtener un enlace de tracking exclusivo y probar la aplicación móvil.
            </p>
          </div>

          <form onSubmit={handleCreateTestFolletero} className="space-y-3">
            <div>
              <label htmlFor="nombre-folletero" className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Nombre del Folletero
              </label>
              <input
                id="nombre-folletero"
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Juan Pérez"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Registrando...
                </>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4" /> Crear y Generar Enlace
                </>
              )}
            </button>
          </form>

          {result && (
            <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-4 space-y-3 animate-fade-in">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Creado Exitosamente</p>
                  <p className="text-base font-bold text-slate-900 font-display mt-0.5">{result.nombre}</p>
                </div>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0">
                  Listo para GPS
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-slate-500 font-semibold">Enlace único de rastreo:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={window.location.origin + result.link}
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700 select-all outline-none"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-slate-600 hover:text-slate-900 transition flex items-center justify-center shrink-0 cursor-pointer"
                    title="Copiar enlace"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Link
                  href={result.link}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-600 transition"
                >
                  Abrir Tracker en Nueva Pestaña <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-500 py-6 border-t border-slate-800 text-center text-xs">
        <div className="max-w-5xl mx-auto px-4">
          <p>© 2026 Geo-Folleto. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
