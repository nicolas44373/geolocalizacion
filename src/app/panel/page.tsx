'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import {
  Compass,
  MapPin,
  Activity,
  Calendar,
  WifiOff,
  LogOut,
  ChevronRight,
  X,
  Info,
  CalendarDays,
  Play,
  TrendingUp,
  Map as MapIcon,
  RefreshCw,
} from 'lucide-react';

// Cargar el mapa de Leaflet dinámicamente para evitar errores de renderizado en el servidor (SSR)
const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-slate-100 flex flex-col items-center justify-center text-slate-500 font-medium">
      <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mb-3" />
      Cargando mapa en tiempo real...
    </div>
  ),
});

interface FolleteroLive {
  folletero_id: string;
  nombre: string;
  lat: number | null;
  lng: number | null;
  precision_m: number | null;
  estado: 'activo' | 'pausado' | 'finalizado';
  distancia_hoy_m: number;
  created_at: string;
}

interface RutaPunto {
  id: number;
  lat: number;
  lng: number;
  precision_m: number | null;
  created_at: string;
}

// Fórmula Haversine en el cliente para cálculo en tiempo real
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Obtener fecha actual YYYY-MM-DD en Argentina (UTC-3)
function getArgentinaDateString(): string {
  const d = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

// Obtener fecha límite de 30 días atrás
function getMinDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

export default function PanelPage() {
  const router = useRouter();
  
  // Estados de datos
  const [folleteros, setFolleteros] = useState<FolleteroLive[]>([]);
  const [selectedFolleteroId, setSelectedFolleteroId] = useState<string | null>(null);
  const [rutaPuntos, setRutaPuntos] = useState<RutaPunto[]>([]);
  const [distanciaTotalM, setDistanciaTotalM] = useState(0);
  const [showRuta, setShowRuta] = useState(false);
  const [selectedDate, setSelectedDate] = useState(getArgentinaDateString());
  const [hoveredRutaPoint, setHoveredRutaPoint] = useState<number | null>(null);
  
  // Estados de carga e interfaz
  const [loadingList, setLoadingList] = useState(true);
  const [loadingRuta, setLoadingRuta] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Estados del mapa
  const [mapCenter, setMapCenter] = useState<[number, number]>([-34.6, -64.0]);
  const [mapZoom, setMapZoom] = useState(5);

  const selectedFolleteroIdRef = useRef<string | null>(null);
  selectedFolleteroIdRef.current = selectedFolleteroId;

  const selectedDateRef = useRef<string>(selectedDate);
  selectedDateRef.current = selectedDate;

  // Cargar lista de folleteros al montar
  useEffect(() => {
    fetchFolleteros();

    // Timer para evaluar el estado "sin señal" (>5 minutos) cada 30 segundos
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30000);

    let channelUbicaciones: any = null;
    let channelFolleteros: any = null;

    if (supabase) {
      // 1. Suscribirse a cambios en tiempo real en la tabla de ubicaciones
      channelUbicaciones = supabase
        .channel('ubicaciones-live')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'ubicaciones' },
          (payload) => {
            const newPoint = payload.new as {
              folletero_id: string;
              lat: number;
              lng: number;
              precision_m: number | null;
              created_at: string;
            };

            setFolleteros((prev) => {
              const index = prev.findIndex((f) => f.folletero_id === newPoint.folletero_id);
              if (index === -1) {
                // Si no está en la lista (posible nuevo folletero), recargar la lista
                fetchFolleteros();
                return prev;
              }

              return prev.map((f, i) => {
                if (i === index) {
                  // Calcular distancia incremental acumulada
                  let extraDistance = 0;
                  if (f.lat !== null && f.lng !== null) {
                    extraDistance = haversine(f.lat, f.lng, newPoint.lat, newPoint.lng);
                  }
                  
                  return {
                    ...f,
                    lat: newPoint.lat,
                    lng: newPoint.lng,
                    precision_m: newPoint.precision_m,
                    created_at: newPoint.created_at,
                    distancia_hoy_m: f.distancia_hoy_m + Math.round(extraDistance),
                  };
                }
                return f;
              });
            });

            // Si el punto corresponde al folletero seleccionado y estamos viendo el día de hoy,
            // agregamos el punto a la polyline y recalculamos la distancia en caliente
            if (
              selectedFolleteroIdRef.current === newPoint.folletero_id &&
              selectedDateRef.current === getArgentinaDateString()
            ) {
              setRutaPuntos((prev) => {
                const updated = [...prev, {
                  id: Date.now(), // ID temporal
                  lat: newPoint.lat,
                  lng: newPoint.lng,
                  precision_m: newPoint.precision_m,
                  created_at: newPoint.created_at
                }];

                // Recalcular distancia
                let dist = 0;
                for (let i = 1; i < updated.length; i++) {
                  dist += haversine(updated[i-1].lat, updated[i-1].lng, updated[i].lat, updated[i].lng);
                }
                setDistanciaTotalM(Math.round(dist));

                return updated;
              });
            }
          }
        )
        .subscribe();

      // 2. Suscribirse a cambios en la tabla 'folleteros' (por cambios de estado: activo, pausado, finalizado)
      channelFolleteros = supabase
        .channel('folleteros-live')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'folleteros' },
          (payload) => {
            const updated = payload.new as {
              id: string;
              nombre: string;
              activo: boolean;
              estado: 'activo' | 'pausado' | 'finalizado';
            };

            setFolleteros((prev) => {
              // Si el folletero fue desactivado de la empresa (activo = false), quitarlo de la lista
              if (!updated.activo) {
                return prev.filter((f) => f.folletero_id !== updated.id);
              }

              return prev.map((f) => {
                if (f.folletero_id === updated.id) {
                  return {
                    ...f,
                    nombre: updated.nombre,
                    estado: updated.estado,
                  };
                }
                return f;
              });
            });
          }
        )
        .subscribe();
    } else {
      console.warn('Supabase client no inicializado. No se suscribirá a eventos en tiempo real en el frontend.');
    }

    return () => {
      clearInterval(timer);
      if (supabase) {
        if (channelUbicaciones) supabase.removeChannel(channelUbicaciones);
        if (channelFolleteros) supabase.removeChannel(channelFolleteros);
      }
    };
  }, []);

  // Consultar folleteros
  const fetchFolleteros = async () => {
    try {
      setLoadingList(true);
      const res = await fetch('/api/folleteros');
      if (!res.ok) throw new Error('No autorizado o error del servidor');
      const data = await res.json();
      setFolleteros(data);
    } catch (err) {
      console.error(err);
      router.push('/panel/login');
    } finally {
      setLoadingList(false);
    }
  };

  // Consultar la ruta de un folletero en una fecha específica
  const fetchRuta = async (folleteroId: string, fecha: string) => {
    try {
      setLoadingRuta(true);
      const res = await fetch(`/api/ruta?folletero_id=${folleteroId}&fecha=${fecha}`);
      if (!res.ok) throw new Error('No se pudo cargar la ruta.');
      const data = await res.json();
      setRutaPuntos(data.puntos || []);
      setDistanciaTotalM(data.distancia_total_m || 0);
      setShowRuta(true);
    } catch (err) {
      console.error(err);
      alert('Error al cargar el historial del recorrido.');
    } finally {
      setLoadingRuta(false);
    }
  };

  // Cerrar sesión
  const handleLogout = async () => {
    if (!confirm('¿Desea cerrar sesión?')) return;
    try {
      await fetch('/api/logout', { method: 'POST' });
      router.push('/panel/login');
      router.refresh();
    } catch (err) {
      console.error('Error al desloguearse', err);
    }
  };

  // Procesar folleteros calculando en caliente el estado "sin señal"
  const folleterosProcesados = useMemo(() => {
    return folleteros.map((f) => {
      // Si lleva más de 5 minutos (300 segundos) sin reportar y estaba activo, se considera "sin señal"
      if (f.estado === 'activo' && f.created_at) {
        const diffMs = now - new Date(f.created_at).getTime();
        const diffMin = diffMs / 1000 / 60;
        if (diffMin > 5) {
          return { ...f, sin_senal: true };
        }
      }
      return { ...f, sin_senal: false };
    });
  }, [folleteros, now]);

  // Obtener los detalles del folletero seleccionado
  const selectedFolletero = useMemo(() => {
    return folleterosProcesados.find((f) => f.folletero_id === selectedFolleteroId) || null;
  }, [folleterosProcesados, selectedFolleteroId]);

  // Al seleccionar un folletero de la lista
  const handleSelectFolletero = (id: string) => {
    setSelectedFolleteroId(id);
    setIsDetailsOpen(true);
    
    const f = folleterosProcesados.find((x) => x.folletero_id === id);
    if (f && f.lat !== null && f.lng !== null) {
      setMapCenter([f.lat, f.lng]);
      setMapZoom(14);
    }

    // Por defecto, carga e ilustra la ruta de hoy
    const hoy = getArgentinaDateString();
    setSelectedDate(hoy);
    fetchRuta(id, hoy);
  };

  // Cambiar fecha histórica
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevaFecha = e.target.value;
    setSelectedDate(nuevaFecha);
    if (selectedFolleteroId) {
      fetchRuta(selectedFolleteroId, nuevaFecha);
    }
  };

  // Formatear distancias a kilómetros
  const formatKm = (metros: number) => {
    return (metros / 1000).toFixed(2) + ' km';
  };

  // Hora de inicio del primer punto del día
  const horaInicioJornada = useMemo(() => {
    if (rutaPuntos.length === 0) return 'Sin datos';
    return new Date(rutaPuntos[0].created_at).toLocaleTimeString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' hs';
  }, [rutaPuntos]);

  // Hora de la última actualización
  const horaUltimaActualizacion = useMemo(() => {
    if (!selectedFolletero) return 'Sin datos';
    return new Date(selectedFolletero.created_at).toLocaleTimeString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' hs';
  }, [selectedFolletero]);

  return (
    <div className="h-screen w-screen flex overflow-hidden font-sans bg-slate-50 text-slate-800">
      
      {/* 1. SIDEBAR IZQUIERDO — LISTADO DE FOLLETEROS (280px) */}
      <aside className="w-[280px] bg-white border-r border-slate-200 flex flex-col shrink-0 z-30 shadow-sm">
        {/* Cabecera del Sidebar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <Compass className="w-6 h-6 text-blue-400 animate-spin-slow" />
            <div>
              <h1 className="font-extrabold text-sm tracking-tight font-display">Tracker Panel</h1>
              <p className="text-[10px] text-slate-400">Empleador</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Lista de folleteros */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex justify-between items-center">
            <span>Folleteros Habilitados</span>
            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-sans">
              {folleterosProcesados.length}
            </span>
          </div>

          {loadingList ? (
            <div className="py-8 text-center text-xs text-slate-400 space-y-2">
              <RefreshCw className="w-5 h-5 text-blue-500 animate-spin mx-auto" />
              <p>Cargando personal...</p>
            </div>
          ) : folleterosProcesados.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No hay folleteros cargados.
            </div>
          ) : (
            folleterosProcesados.map((f) => {
              const isSelected = f.folletero_id === selectedFolleteroId;
              
              // Determinar el badge de estado
              let badgeColor = 'bg-slate-400';
              let badgeText = 'Inactivo';
              
              if (f.sin_senal) {
                badgeColor = 'bg-slate-700';
                badgeText = 'Sin señal';
              } else if (f.estado === 'activo') {
                badgeColor = 'bg-emerald-500';
                badgeText = 'Activo';
              } else if (f.estado === 'pausado') {
                badgeColor = 'bg-amber-400';
                badgeText = 'Pausado';
              } else if (f.estado === 'finalizado') {
                badgeColor = 'bg-blue-500';
                badgeText = 'Finalizado';
              }

              return (
                <button
                  key={f.folletero_id}
                  onClick={() => handleSelectFolletero(f.folletero_id)}
                  className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50/70 border-blue-200 shadow-sm'
                      : 'bg-white hover:bg-slate-50 border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-start gap-1">
                    <span className="font-bold text-slate-900 text-sm font-display truncate pr-1">
                      {f.nombre}
                    </span>
                    <span className="text-[9px] uppercase font-extrabold tracking-wider text-slate-400 shrink-0 mt-0.5">
                      {f.lat !== null ? 'GPS OK' : 'SIN GPS'}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${badgeColor} ${f.estado === 'activo' && !f.sin_senal ? 'animate-pulse' : ''}`} />
                      <span className="font-medium capitalize text-[11px]">{badgeText}</span>
                    </div>
                    <span className="font-bold font-display text-slate-700">
                      {formatKm(f.distancia_hoy_m)}
                    </span>
                  </div>

                  {f.lat !== null && (
                    <p className="mt-1.5 text-[9px] text-slate-400 text-right">
                      Act: Hace {Math.round((now - new Date(f.created_at).getTime()) / 1000 / 60)} min
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* 2. AREA CENTRAL — MAPA LEAFLET */}
      <main className="flex-1 h-full relative overflow-hidden flex flex-col">
        
        {/* Mapa ocupando 100% */}
        <div className="flex-1 w-full h-full relative">
          <MapComponent
            folleteros={folleterosProcesados.filter((f) => f.lat !== null) as any}
            selectedFolleteroId={selectedFolleteroId}
            onSelectFolletero={handleSelectFolletero}
            rutaPuntos={rutaPuntos}
            showRuta={showRuta}
            hoveredRutaPoint={hoveredRutaPoint}
            mapCenter={mapCenter}
            mapZoom={mapZoom}
          />

          {/* Botón flotante para restablecer vista general */}
          <button
            onClick={() => {
              setMapCenter([-34.6, -64.0]);
              setMapZoom(5);
            }}
            className="absolute top-4 right-4 z-[400] bg-white border border-slate-200 text-slate-700 px-3.5 py-2 rounded-xl shadow-lg font-bold text-xs flex items-center gap-1.5 hover:bg-slate-50 transition cursor-pointer"
          >
            <MapIcon className="w-4 h-4" /> Centrar Argentina
          </button>
        </div>

        {/* 3. TIMELINE DEL RECORRIDO (Aparece abajo del mapa si se visualiza una ruta) */}
        {showRuta && rutaPuntos.length > 0 && (
          <div className="absolute bottom-6 left-6 right-6 md:left-[20px] md:right-[20px] bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 p-4 z-[400] transition-all animate-slide-up max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-blue-600 fill-current" />
                <span className="text-xs font-bold text-slate-800">
                  Línea de Tiempo del Recorrido — {selectedDate === getArgentinaDateString() ? 'Hoy' : selectedDate}
                </span>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                {rutaPuntos.length} puntos registrados
              </span>
            </div>

            {/* Slider de reproducción / hover */}
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max={rutaPuntos.length - 1}
                value={hoveredRutaPoint !== null ? hoveredRutaPoint : 0}
                onMouseEnter={() => {
                  if (hoveredRutaPoint === null) setHoveredRutaPoint(0);
                }}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setHoveredRutaPoint(val);
                  
                  // Opcional: Centrar el mapa en la posición seleccionada de la línea de tiempo
                  const p = rutaPuntos[val];
                  if (p) {
                    setMapCenter([p.lat, p.lng]);
                  }
                }}
                onMouseLeave={() => setHoveredRutaPoint(null)}
                className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 outline-none"
              />

              {/* Información del punto seleccionado */}
              <div className="w-32 bg-slate-900 text-white rounded-lg py-1.5 px-2.5 text-center shrink-0">
                <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Hora Punto</p>
                <p className="text-sm font-bold font-display leading-tight">
                  {rutaPuntos[hoveredRutaPoint !== null ? hoveredRutaPoint : rutaPuntos.length - 1]
                    ? new Date(
                        rutaPuntos[hoveredRutaPoint !== null ? hoveredRutaPoint : rutaPuntos.length - 1].created_at
                      ).toLocaleTimeString('es-AR', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : '--:--'}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 4. PANEL LATERAL DERECHO — DETALLES DEL RECORRIDO (320px) */}
      <section
        className={`w-[320px] bg-white border-l border-slate-200 shadow-2xl flex flex-col shrink-0 transition-all duration-300 relative z-40 ${
          isDetailsOpen ? 'translate-x-0' : 'translate-x-full w-0 border-l-0 overflow-hidden'
        }`}
      >
        {selectedFolletero ? (
          <div className="flex flex-col h-full">
            {/* Cabecera del panel de detalles */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-950 text-white">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-red-400 shrink-0" />
                <h3 className="font-extrabold text-sm font-display truncate max-w-[200px]">
                  {selectedFolletero.nombre}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsDetailsOpen(false);
                  setShowRuta(false);
                  setRutaPuntos([]);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Cuerpo del panel de detalles */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              
              {/* Tarjeta de Estado Completo */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Estado del Día</h4>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500 font-medium">Conectividad</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full capitalize ${
                    selectedFolletero.sin_senal
                      ? 'bg-slate-900 text-white'
                      : selectedFolletero.estado === 'activo'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedFolletero.estado === 'pausado'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {selectedFolletero.sin_senal ? 'Sin señal' : selectedFolletero.estado}
                  </span>
                </div>

                <div className="mt-3 flex justify-between items-center pt-3 border-t border-slate-200/50">
                  <span className="text-xs text-slate-500 font-medium">Última reporte</span>
                  <span className="text-xs font-bold text-slate-900">{horaUltimaActualizacion}</span>
                </div>
              </div>

              {/* Estadísticas de la fecha seleccionada */}
              <div className="space-y-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  <span>Estadísticas de Jornada</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Inicio</p>
                    <p className="text-sm font-bold text-slate-800 font-display">
                      {horaInicioJornada}
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                    <p className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Distancia</p>
                    <p className="text-sm font-bold text-slate-800 font-display">
                      {formatKm(distanciaTotalM)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Selector de fecha histórica */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
                  <CalendarDays className="w-4 h-4 text-blue-500" />
                  <span>Selector de Fecha</span>
                </div>

                <div className="relative">
                  <input
                    type="date"
                    min={getMinDateString()}
                    max={getArgentinaDateString()}
                    value={selectedDate}
                    onChange={handleDateChange}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer text-sm"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Puede consultar recorridos históricos de hasta 30 días atrás.
                </p>
              </div>

              {/* Botón para forzar dibujado de ruta */}
              <div className="pt-2">
                <button
                  onClick={() => fetchRuta(selectedFolletero.folletero_id, selectedDate)}
                  disabled={loadingRuta}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-md hover:bg-blue-500 transition disabled:opacity-50 cursor-pointer"
                >
                  {loadingRuta ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" /> Cargando ruta...
                    </>
                  ) : (
                    <>
                      <Activity className="w-4 h-4" /> Recargar Ruta Completa
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400">
            <Info className="w-10 h-10 text-slate-300 mb-2" />
            <p className="text-sm font-medium">Selecciona un folletero para ver su ficha y recorrido completo.</p>
          </div>
        )}
      </section>
    </div>
  );
}
