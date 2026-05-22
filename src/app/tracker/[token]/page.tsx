'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Compass, Play, Pause, Square, Wifi, WifiOff, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

interface Folletero {
  id: string;
  nombre: string;
  activo: boolean;
  estado: 'activo' | 'pausado' | 'finalizado';
}

interface GPSPoint {
  lat: number;
  lng: number;
  precision_m: number;
  timestamp: number;
}

// Fórmula Haversine en el cliente
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function TrackerPage() {
  const params = useParams();
  const token = params.token as string;

  const [folletero, setFolletero] = useState<Folletero | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isOnline, setIsOnline] = useState(true);
  const [puntosEnviados, setPuntosEnviados] = useState(0);
  const [precisionGPS, setPrecisionGPS] = useState<number | null>(null);
  const [warningPrecision, setWarningPrecision] = useState(false);
  
  // Lista de puntos acumulados sin internet
  const [puntosOfflineCount, setPuntosOfflineCount] = useState(0);

  // Referencias para la geolocalización e intervalos
  const watchIdRef = useRef<number | null>(null);
  const currentPositionRef = useRef<GPSPoint | null>(null);
  const lastSentPointRef = useRef<GPSPoint | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);

  // Inicializar estado de conexión y cargar datos del folletero
  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      flushOfflineQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cargar cantidad de puntos enviados guardados en esta sesión
    const savedEnviados = localStorage.getItem(`enviados_${token}`);
    if (savedEnviados) {
      setPuntosEnviados(parseInt(savedEnviados, 10));
    }

    // Cargar puntos offline guardados
    const savedOffline = getOfflineQueue();
    setPuntosOfflineCount(savedOffline.length);

    fetchFolleteroInfo();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      stopGPSWatch();
    };
  }, [token]);

  // Obtener info del folletero por el token
  const fetchFolleteroInfo = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tracker/me', {
        headers: {
          'x-folletero-token': token,
        },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'No se pudo cargar la información.');
      }

      const data: Folletero = await res.json();
      setFolletero(data);

      // Si la base de datos dice que está activo, reanudar tracking automáticamente
      if (data.estado === 'activo') {
        startGPSWatch();
      }
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  // Obtener la cola de puntos offline de localStorage
  const getOfflineQueue = (): GPSPoint[] => {
    if (typeof window === 'undefined') return [];
    const queueStr = localStorage.getItem(`offline_queue_${token}`);
    return queueStr ? JSON.parse(queueStr) : [];
  };

  // Guardar la cola de puntos offline en localStorage
  const saveOfflineQueue = (queue: GPSPoint[]) => {
    localStorage.setItem(`offline_queue_${token}`, JSON.stringify(queue));
    setPuntosOfflineCount(queue.length);
  };

  // Iniciar la geolocalización
  const startGPSWatch = () => {
    if (watchIdRef.current) return; // Ya está activo

    if (!('geolocation' in navigator)) {
      alert('La geolocalización no está soportada por su navegador.');
      return;
    }

    // Activar geolocalización continua en alta precisión
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const currentPoint: GPSPoint = {
          lat: latitude,
          lng: longitude,
          precision_m: accuracy || 0,
          timestamp: Date.now(),
        };

        setPrecisionGPS(Math.round(accuracy || 0));
        setWarningPrecision((accuracy || 0) > 100);
        currentPositionRef.current = currentPoint;
      },
      (err) => {
        console.error('Error GPS:', err);
        setPrecisionGPS(null);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    // Intervalo de evaluación cada 5 segundos para decidir si enviar posición
    intervalIdRef.current = setInterval(evaluateAndSend, 5000);
  };

  // Detener la geolocalización
  const stopGPSWatch = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalIdRef.current !== null) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
    currentPositionRef.current = null;
    setPrecisionGPS(null);
  };

  // Evaluar si corresponde enviar la ubicación
  const evaluateAndSend = () => {
    const current = currentPositionRef.current;
    if (!current) return;

    const lastSent = lastSentPointRef.current;
    const now = Date.now();

    if (!lastSent) {
      // Si es el primer punto, se envía inmediatamente
      queueOrSendLocation(current);
      return;
    }

    const dist = haversine(lastSent.lat, lastSent.lng, current.lat, current.lng);
    const elapsedSeconds = (now - lastSent.timestamp) / 1000;

    // Frecuencia:
    // 1. En movimiento (> 10 metros): enviar cada 15 segundos
    // 2. En reposo (<= 10 metros): enviar cada 60 segundos
    if (dist > 10 && elapsedSeconds >= 15) {
      queueOrSendLocation(current);
    } else if (dist <= 10 && elapsedSeconds >= 60) {
      queueOrSendLocation(current);
    }
  };

  // Encolar offline o enviar la ubicación por API
  const queueOrSendLocation = async (point: GPSPoint) => {
    // Si no hay conexión a internet, encolar localmente
    if (!navigator.onLine) {
      addToOfflineQueue(point);
      return;
    }

    try {
      const res = await fetch('/api/ubicacion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-folletero-token': token,
        },
        body: JSON.stringify({
          lat: point.lat,
          lng: point.lng,
          precision_m: point.precision_m,
        }),
      });

      if (!res.ok) {
        throw new Error('Error al enviar al servidor');
      }

      const data = await res.json();
      
      // Si la API lo ignoró por estar quieto, igual lo consideramos exitoso
      if (data.ok) {
        lastSentPointRef.current = point;
        const nuevosEnviados = puntosEnviados + 1;
        setPuntosEnviados(nuevosEnviados);
        localStorage.setItem(`enviados_${token}`, nuevosEnviados.toString());
        
        // Intentar procesar cola offline acumulada
        flushOfflineQueue();
      }
    } catch (err) {
      console.warn('Fallo el envío por red, guardando offline:', err);
      addToOfflineQueue(point);
    }
  };

  // Agregar ubicación a la cola offline (máximo 50)
  const addToOfflineQueue = (point: GPSPoint) => {
    const queue = getOfflineQueue();
    if (queue.length >= 50) {
      queue.shift(); // Quitar el más viejo si supera el límite de 50
    }
    queue.push(point);
    saveOfflineQueue(queue);
    
    // Considerar el último punto como "enviado" a la cola local para no repetir envíos inmediatamente
    lastSentPointRef.current = point;
  };

  // Procesar y enviar los puntos acumulados offline
  const flushOfflineQueue = async () => {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    console.log(`Intentando enviar ${queue.length} puntos guardados offline...`);
    const remaining = [...queue];

    for (let i = 0; i < queue.length; i++) {
      const point = queue[i];
      try {
        const res = await fetch('/api/ubicacion', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-folletero-token': token,
          },
          body: JSON.stringify({
            lat: point.lat,
            lng: point.lng,
            precision_m: point.precision_m,
          }),
        });

        if (res.ok) {
          remaining.shift(); // Quitar de la cola temporal
          setPuntosEnviados((prev) => {
            const next = prev + 1;
            localStorage.setItem(`enviados_${token}`, next.toString());
            return next;
          });
        } else {
          // Si falla, detenemos el vaciado para reintentar después
          break;
        }
      } catch (err) {
        console.error('Error al vaciar cola offline:', err);
        break;
      }
    }

    saveOfflineQueue(remaining);
  };

  // Cambiar el estado en la base de datos y localmente
  const updateEstado = async (nuevoEstado: 'activo' | 'pausado' | 'finalizado') => {
    try {
      const res = await fetch('/api/estado', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-folletero-token': token,
        },
        body: JSON.stringify({ estado: nuevoEstado }),
      });

      if (!res.ok) {
        throw new Error('No se pudo actualizar el estado en el servidor.');
      }

      setFolletero((prev) => prev ? { ...prev, estado: nuevoEstado } : null);

      if (nuevoEstado === 'activo') {
        startGPSWatch();
      } else {
        stopGPSWatch();
      }
    } catch (err: any) {
      alert(err.message || 'Error al cambiar estado');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-slate-800">
        <RefreshCw className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-lg font-medium">Cargando aplicación de rastreo...</p>
      </div>
    );
  }

  if (error || !folletero) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center text-slate-800">
        <AlertTriangle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold font-display mb-2">Error de Acceso</h1>
        <p className="text-slate-600 max-w-sm mb-6">{error || 'El token ingresado no es válido o ha expirado.'}</p>
        <button
          onClick={fetchFolleteroInfo}
          className="px-6 py-2 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 transition"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const trackingActivo = folletero.estado === 'activo';
  const trackingPausado = folletero.estado === 'pausado';
  const trackingFinalizado = folletero.estado === 'finalizado';

  return (
    <div className="min-h-screen bg-white flex flex-col text-slate-900 justify-between select-none">
      {/* Barra superior de estado de red */}
      <div className={`py-2 px-4 text-center text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
        isOnline ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800 animate-pulse'
      }`}>
        {isOnline ? (
          <>
            <Wifi className="w-4 h-4 text-emerald-600" /> Conectado a Internet
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4 text-red-600" /> Sin conexión (Guardando en memoria)
          </>
        )}
      </div>

      {/* Contenedor Principal */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-md mx-auto w-full">
        {/* Info del Folletero */}
        <div className="text-center mb-8">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Folletero</p>
          <h1 className="text-3xl font-extrabold font-display text-slate-900 leading-tight">{folletero.nombre}</h1>
        </div>

        {/* Círculo de Estado Visual Grande */}
        <div className="relative flex items-center justify-center w-48 h-48 rounded-full border-4 border-slate-100 bg-slate-50 mb-10">
          {trackingActivo && (
            <div className="absolute inset-4 rounded-full bg-emerald-500 pulsing-green flex flex-col items-center justify-center text-white">
              <Compass className="w-10 h-10 animate-spin-slow mb-1" />
              <span className="text-sm font-bold uppercase tracking-wide">Rastreando</span>
            </div>
          )}
          {trackingPausado && (
            <div className="absolute inset-4 rounded-full bg-amber-400 flex flex-col items-center justify-center text-white">
              <Pause className="w-10 h-10 mb-1" />
              <span className="text-sm font-bold uppercase tracking-wide">Pausado</span>
            </div>
          )}
          {trackingFinalizado && (
            <div className="absolute inset-4 rounded-full bg-slate-400 flex flex-col items-center justify-center text-white">
              <CheckCircle className="w-10 h-10 mb-1" />
              <span className="text-sm font-bold uppercase tracking-wide">Finalizado</span>
            </div>
          )}
        </div>

        {/* Panel de Estadísticas GPS (Legible bajo el sol) */}
        <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4 mb-8">
          <div className="flex justify-between items-center pb-3 border-b border-slate-200">
            <span className="text-sm text-slate-600 font-medium">Precisión GPS</span>
            <span className={`text-lg font-bold font-display ${
              precisionGPS === null ? 'text-slate-500' : warningPrecision ? 'text-red-600' : 'text-slate-900'
            }`}>
              {precisionGPS !== null ? `${precisionGPS} metros` : 'Buscando señal...'}
            </span>
          </div>

          <div className="flex justify-between items-center pb-3 border-b border-slate-200">
            <span className="text-sm text-slate-600 font-medium">Ubicaciones enviadas</span>
            <span className="text-lg font-bold font-display text-slate-900">
              {puntosEnviados}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-600 font-medium">Guardadas sin internet</span>
            <span className={`text-lg font-bold font-display ${puntosOfflineCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {puntosOfflineCount} / 50
            </span>
          </div>
        </div>

        {/* Advertencia de GPS baja precisión */}
        {warningPrecision && trackingActivo && (
          <div className="w-full bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 text-red-800 text-sm mb-6">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Señal de GPS Débil:</span> La precisión es menor a 100m. Intente salir a un espacio abierto o asegúrese de que el GPS esté encendido en alta precisión.
            </div>
          </div>
        )}
      </div>

      {/* Botones de Control (Inferior, Grandes y Legibles) */}
      <div className="bg-slate-50 border-t border-slate-200 p-6 space-y-4 max-w-md mx-auto w-full">
        {trackingFinalizado && (
          <button
            onClick={() => updateEstado('activo')}
            className="w-full py-4 bg-emerald-600 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-emerald-500 active:bg-emerald-700 transition"
          >
            <Play className="w-5 h-5 fill-current" /> Iniciar Jornada
          </button>
        )}

        {trackingActivo && (
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => updateEstado('pausado')}
              className="py-4 bg-amber-400 text-slate-900 rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-amber-300 active:bg-amber-500 transition"
            >
              <Pause className="w-5 h-5 fill-current" /> Pausar
            </button>
            <button
              onClick={() => updateEstado('finalizado')}
              className="py-4 bg-red-600 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-red-500 active:bg-red-700 transition"
            >
              <Square className="w-4 h-4 fill-current" /> Finalizar
            </button>
          </div>
        )}

        {trackingPausado && (
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => updateEstado('activo')}
              className="py-4 bg-emerald-600 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-emerald-500 active:bg-emerald-700 transition"
            >
              <Play className="w-5 h-5 fill-current" /> Reanudar
            </button>
            <button
              onClick={() => updateEstado('finalizado')}
              className="py-4 bg-red-600 text-white rounded-xl font-bold text-lg flex items-center justify-center gap-2 hover:bg-red-500 active:bg-red-700 transition"
            >
              <Square className="w-4 h-4 fill-current" /> Finalizar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
