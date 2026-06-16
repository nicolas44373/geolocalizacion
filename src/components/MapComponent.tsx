'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fórmula Haversine para calcular distancia en metros en el cliente
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

// Función para cambiar de vista suavemente al seleccionar un folletero
function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

// Iconos personalizados con L.divIcon y estilos Tailwind
const getMarkerIcon = (estado: 'activo' | 'pausado' | 'finalizado' | 'sin_senal') => {
  if (estado === 'activo') {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div class="relative w-8 h-8 flex items-center justify-center">
          <div class="absolute inset-0 bg-[#2e9e44] rounded-full opacity-35 pulsing-green"></div>
          <div class="relative w-4 h-4 bg-[#2e9e44] border-2 border-white rounded-full shadow-lg"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  } else if (estado === 'pausado') {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div class="relative w-8 h-8 flex items-center justify-center">
          <div class="absolute inset-0 bg-amber-400 rounded-full opacity-20"></div>
          <div class="relative w-4 h-4 bg-amber-500 border-2 border-white rounded-full shadow-lg"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  } else if (estado === 'sin_senal') {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div class="relative w-8 h-8 flex items-center justify-center">
          <div class="w-4 h-4 bg-slate-400 border-2 border-white rounded-full shadow-lg flex items-center justify-center text-[10px] text-white font-bold">!</div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  } else {
    // Finalizado / Inactivo
    return L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div class="relative w-8 h-8 flex items-center justify-center">
          <div class="w-4 h-4 bg-slate-600 border-2 border-white rounded-full shadow-lg"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }
};

// Marcador del inicio de ruta (Verde)
const startIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `
    <div class="w-6 h-6 bg-emerald-600 border-2 border-white rounded-full shadow-md flex items-center justify-center text-white font-bold text-xs">
      I
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Marcador del fin de ruta (Rojo Pulsante)
const endIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `
    <div class="relative w-8 h-8 flex items-center justify-center">
      <div class="absolute inset-0 bg-red-600 rounded-full opacity-35 pulsing-red"></div>
      <div class="relative w-4 h-4 bg-red-600 border-2 border-white rounded-full shadow-lg"></div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// Marcadores intermedios pequeños
const intermediateIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div class="w-2.5 h-2.5 bg-blue-500 border border-white rounded-full shadow-sm"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

// Marcador al pasar el mouse por la barra de tiempo
const hoverIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `
    <div class="relative w-8 h-8 flex items-center justify-center z-50">
      <div class="w-5 h-5 bg-sky-500 border-2 border-white rounded-full shadow-xl flex items-center justify-center">
        <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
      </div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

interface FolleteroLive {
  folletero_id: string;
  nombre: string;
  lat: number;
  lng: number;
  precision_m: number | null;
  estado: 'activo' | 'pausado' | 'finalizado';
  created_at: string;
  sin_senal?: boolean;
}

interface RutaPunto {
  id: number;
  lat: number;
  lng: number;
  precision_m: number | null;
  created_at: string;
}

interface MapComponentProps {
  folleteros: FolleteroLive[];
  selectedFolleteroId: string | null;
  onSelectFolletero: (id: string) => void;
  rutaPuntos: RutaPunto[];
  showRuta: boolean;
  hoveredRutaPoint: number | null;
  mapCenter: [number, number];
  mapZoom: number;
}

export default function MapComponent({
  folleteros,
  selectedFolleteroId,
  onSelectFolletero,
  rutaPuntos,
  showRuta,
  hoveredRutaPoint,
  mapCenter,
  mapZoom,
}: MapComponentProps) {
  // Estado para las coordenadas ajustadas a las calles (snap-to-roads)
  const [snappedCoords, setSnappedCoords] = useState<[number, number][]>([]);
  const [isSnapping, setIsSnapping] = useState(false);

  // Polyline de coordenadas brutas (fallback)
  const polylineCoords = rutaPuntos.map((p) => [p.lat, p.lng] as [number, number]);

  // Hook para calcular el trazado por las calles utilizando OSRM Match API
  useEffect(() => {
    if (rutaPuntos.length < 2) {
      setSnappedCoords([]);
      return;
    }

    const fetchSnappedRoute = async () => {
      setIsSnapping(true);
      try {
        // 1. Filtrar puntos muy cercanos para reducir ruido y optimizar llamadas (downsampling)
        // Mantenemos un punto si dista más de 4 metros del anterior (o si es el primer/último punto)
        const downsampled: RutaPunto[] = [];
        downsampled.push(rutaPuntos[0]);
        for (let i = 1; i < rutaPuntos.length; i++) {
          const prev = downsampled[downsampled.length - 1];
          const curr = rutaPuntos[i];
          const dist = haversine(prev.lat, prev.lng, curr.lat, curr.lng);
          if (dist > 4 || i === rutaPuntos.length - 1) {
            downsampled.push(curr);
          }
        }

        const pointsToMatch = downsampled.length >= 2 ? downsampled : rutaPuntos;

        // 2. Dividir en chunks de 40 puntos para no exceder los límites de longitud de URL en OSRM
        // Usamos solapamiento de 1 punto para continuidad de la línea
        const chunkSize = 40;
        const chunks: RutaPunto[][] = [];
        for (let i = 0; i < pointsToMatch.length; i += chunkSize - 1) {
          const chunk = pointsToMatch.slice(i, i + chunkSize);
          if (chunk.length >= 2) {
            chunks.push(chunk);
          }
          if (i + chunkSize >= pointsToMatch.length) break;
        }

        if (chunks.length === 0) {
          setSnappedCoords(pointsToMatch.map(p => [p.lat, p.lng]));
          return;
        }

        const allSnapped: [number, number][] = [];

        // 3. Consultar OSRM para cada chunk de forma secuencial
        for (const chunk of chunks) {
          const coordString = chunk.map(p => `${p.lng},${p.lat}`).join(';');
          // Perfil "foot" es ideal para peatones / folleteros ya que mapea a veredas y peatonales
          const url = `https://router.project-osrm.org/match/v1/foot/${coordString}?geometries=geojson&overview=full`;
          
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`OSRM error: ${res.status}`);
            const data = await res.json();
            
            if (data.code === 'Ok' && data.matchings && data.matchings.length > 0) {
              const coords = data.matchings[0].geometry.coordinates.map(
                (c: [number, number]) => [c[1], c[0]] as [number, number]
              );
              allSnapped.push(...coords);
            } else {
              // Fallback para este chunk
              allSnapped.push(...chunk.map(p => [p.lat, p.lng] as [number, number]));
            }
          } catch (err) {
            console.warn('Error al ajustar ruta con OSRM para este segmento:', err);
            allSnapped.push(...chunk.map(p => [p.lat, p.lng] as [number, number]));
          }
        }

        // 4. Limpiar duplicados consecutivos del solapamiento
        const uniqueSnapped: [number, number][] = [];
        if (allSnapped.length > 0) {
          uniqueSnapped.push(allSnapped[0]);
          for (let i = 1; i < allSnapped.length; i++) {
            const prev = uniqueSnapped[uniqueSnapped.length - 1];
            const curr = allSnapped[i];
            if (prev[0] !== curr[0] || prev[1] !== curr[1]) {
              uniqueSnapped.push(curr);
            }
          }
        }

        setSnappedCoords(uniqueSnapped);
      } catch (error) {
        console.error('Error al procesar OSRM Match:', error);
        setSnappedCoords(rutaPuntos.map(p => [p.lat, p.lng]));
      } finally {
        setIsSnapping(false);
      }
    };

    fetchSnappedRoute();
  }, [rutaPuntos]);

  // Decidir qué marcadores intermedios mostrar para no saturar el mapa
  // Mostrar un marcador cada N puntos, dependiendo de la cantidad total de puntos
  const getStep = (total: number) => {
    if (total < 20) return 1;
    if (total < 100) return 5;
    if (total < 500) return 15;
    return 30;
  };
  const step = getStep(rutaPuntos.length);

  return (
    <MapContainer
      center={mapCenter}
      zoom={mapZoom}
      className="w-full h-full"
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <ChangeView center={mapCenter} zoom={mapZoom} />

      {/* 1. Dibujar ruta histórica si está activada */}
      {showRuta && rutaPuntos.length > 0 && (
        <>
          {/* Línea de ruta azul celeste ajustada a las calles (o fallback) */}
          <Polyline
            positions={snappedCoords.length > 0 ? snappedCoords : polylineCoords}
            pathOptions={{ color: '#0ea5e9', weight: 6, opacity: 0.85, lineJoin: 'round' }}
          />

          {/* Marcador del punto de inicio (Verde) */}
          <Marker position={[rutaPuntos[0].lat, rutaPuntos[0].lng]} icon={startIcon}>
            <Popup>
              <div className="font-sans text-xs">
                <p className="font-bold">Inicio de jornada</p>
                <p>Hora: {new Date(rutaPuntos[0].created_at).toLocaleTimeString('es-AR', {
                  timeZone: 'America/Argentina/Buenos_Aires',
                  hour: '2-digit',
                  minute: '2-digit',
                })} hs</p>
              </div>
            </Popup>
          </Marker>

          {/* Marcadores intermedios para dar contexto espacial */}
          {rutaPuntos.map((point, index) => {
            // No mostrar si es el primero o el último
            if (index === 0 || index === rutaPuntos.length - 1) return null;
            // Mostrar solo cada N puntos (step)
            if (index % step !== 0) return null;

            return (
              <Marker
                key={`inter-${point.id}`}
                position={[point.lat, point.lng]}
                icon={intermediateIcon}
              >
                <Popup>
                  <div className="font-sans text-xs">
                    <p className="font-bold">Punto intermedio #{index + 1}</p>
                    <p>Hora: {new Date(point.created_at).toLocaleTimeString('es-AR', {
                      timeZone: 'America/Argentina/Buenos_Aires',
                      hour: '2-digit',
                      minute: '2-digit',
                    })} hs</p>
                    {point.precision_m && <p>Precisión: {Math.round(point.precision_m)}m</p>}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Marcador del punto de fin/más reciente (Rojo) */}
          {rutaPuntos.length > 1 && (
            <Marker
              position={[rutaPuntos[rutaPuntos.length - 1].lat, rutaPuntos[rutaPuntos.length - 1].lng]}
              icon={endIcon}
            >
              <Popup>
                <div className="font-sans text-xs">
                  <p className="font-bold text-red-600">Punto más reciente</p>
                  <p>Hora: {new Date(rutaPuntos[rutaPuntos.length - 1].created_at).toLocaleTimeString('es-AR', {
                    timeZone: 'America/Argentina/Buenos_Aires',
                    hour: '2-digit',
                    minute: '2-digit',
                  })} hs</p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Círculos de imprecisión para puntos históricos que tengan precision > 50m */}
          {rutaPuntos.map((point) => {
            if (point.precision_m && point.precision_m > 50) {
              return (
                <Circle
                  key={`precision-${point.id}`}
                  center={[point.lat, point.lng]}
                  radius={point.precision_m}
                  pathOptions={{
                    color: '#f59e0b',
                    dashArray: '3, 6',
                    fillColor: '#f59e0b',
                    fillOpacity: 0.05,
                    weight: 1,
                  }}
                />
              );
            }
            return null;
          })}

          {/* Marcador destacado al pasar el mouse por la línea de tiempo */}
          {hoveredRutaPoint !== null && rutaPuntos[hoveredRutaPoint] && (
            <Marker
              position={[rutaPuntos[hoveredRutaPoint].lat, rutaPuntos[hoveredRutaPoint].lng]}
              icon={hoverIcon}
            >
              <Popup autoPan={false}>
                <div className="font-sans text-xs">
                  <p className="font-bold text-sky-600">Posición en la línea de tiempo</p>
                  <p>Hora: {new Date(rutaPuntos[hoveredRutaPoint].created_at).toLocaleTimeString('es-AR', {
                    timeZone: 'America/Argentina/Buenos_Aires',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })} hs</p>
                  {rutaPuntos[hoveredRutaPoint].precision_m && (
                    <p>Precisión: {Math.round(rutaPuntos[hoveredRutaPoint].precision_m!)}m</p>
                  )}
                </div>
              </Popup>
            </Marker>
          )}
        </>
      )}

      {/* 2. Marcadores en tiempo real de todos los folleteros */}
      {folleteros.map((f) => {
        const markerState = f.sin_senal ? 'sin_senal' : f.estado;
        const icon = getMarkerIcon(markerState);

        return (
          <React.Fragment key={f.folletero_id}>
            <Marker
              position={[f.lat, f.lng]}
              icon={icon}
              eventHandlers={{
                click: () => onSelectFolletero(f.folletero_id),
              }}
            >
              <Popup>
                <div className="font-sans">
                  <p className="font-bold text-sm text-slate-900">{f.nombre}</p>
                  <p className="text-xs text-slate-500 capitalize">Estado: {f.sin_senal ? 'Sin señal' : f.estado}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Última act: {new Date(f.created_at).toLocaleTimeString('es-AR', {
                      timeZone: 'America/Argentina/Buenos_Aires',
                      hour: '2-digit',
                      minute: '2-digit',
                    })} hs
                  </p>
                </div>
              </Popup>
            </Marker>

            {/* Círculo punteado de imprecisión si precision_m > 50m */}
            {f.precision_m && f.precision_m > 50 && (
              <Circle
                center={[f.lat, f.lng]}
                radius={f.precision_m}
                pathOptions={{
                  color: '#ef4444',
                  dashArray: '5, 8',
                  fillColor: '#ef4444',
                  fillOpacity: 0.05,
                  weight: 1.5,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </MapContainer>
  );
}
