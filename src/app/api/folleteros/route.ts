import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';

// Fórmula Haversine para calcular distancia en metros
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

// Obtener fecha actual en formato YYYY-MM-DD en la zona horaria de Argentina (UTC-3)
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

export async function GET(request: Request) {
  try {
    // 1. Autorización: cookie de sesión o header 'x-admin-key'
    const cookieStore = await cookies();
    const session = cookieStore.get('admin_session');
    const adminKey = request.headers.get('x-admin-key');
    const adminPassword = process.env.ADMIN_PASSWORD;

    const isAuthorized =
      (session && session.value === 'true') ||
      (adminKey && adminPassword && adminKey === adminPassword);

    if (!isAuthorized) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 2. Obtener la lista de todos los folleteros habilitados (activo = true)
    const { data: folleteros, error: folleterosError } = await supabaseAdmin
      .from('folleteros')
      .select('id, nombre, estado, created_at')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (folleterosError) {
      return NextResponse.json({ error: 'Error al obtener folleteros: ' + folleterosError.message }, { status: 500 });
    }

    // 3. Obtener todas las ubicaciones de hoy en Argentina (UTC-3)
    const today = getArgentinaDateString();
    const startStr = `${today}T00:00:00-03:00`;
    const endStr = `${today}T23:59:59.999-03:00`;

    const { data: ubicacionesHoy, error: ubiError } = await supabaseAdmin
      .from('ubicaciones')
      .select('folletero_id, lat, lng, precision_m, created_at')
      .gte('created_at', startStr)
      .lte('created_at', endStr)
      .order('created_at', { ascending: true });

    if (ubiError) {
      return NextResponse.json({ error: 'Error al obtener ubicaciones: ' + ubiError.message }, { status: 500 });
    }

    // 4. Calcular distancias recorridas hoy agrupando por folletero_id
    const distanciasHoy: Record<string, number> = {};
    const ubicacionesAgrupadas: Record<string, typeof ubicacionesHoy> = {};

    if (ubicacionesHoy) {
      for (const u of ubicacionesHoy) {
        if (!ubicacionesAgrupadas[u.folletero_id]) {
          ubicacionesAgrupadas[u.folletero_id] = [];
        }
        ubicacionesAgrupadas[u.folletero_id].push(u);
      }

      for (const fid in ubicacionesAgrupadas) {
        const puntos = ubicacionesAgrupadas[fid];
        let dist = 0;
        if (puntos.length > 1) {
          for (let i = 1; i < puntos.length; i++) {
            dist += haversine(puntos[i - 1].lat, puntos[i - 1].lng, puntos[i].lat, puntos[i].lng);
          }
        }
        distanciasHoy[fid] = Math.round(dist);
      }
    }

    // 5. Obtener la última posición registrada en general de cada folletero
    const { data: ultimasPosiciones, error: posError } = await supabaseAdmin
      .from('ultima_posicion')
      .select('*');

    if (posError) {
      return NextResponse.json({ error: 'Error al obtener última posición: ' + posError.message }, { status: 500 });
    }

    const ultimasPosMap: Record<string, typeof ultimasPosiciones[0]> = {};
    if (ultimasPosiciones) {
      for (const p of ultimasPosiciones) {
        ultimasPosMap[p.folletero_id] = p;
      }
    }

    // 6. Consolidar la información
    const resultado = folleteros.map((f) => {
      const ultimaPos = ultimasPosMap[f.id];
      return {
        folletero_id: f.id,
        nombre: f.nombre,
        estado: f.estado,
        distancia_hoy_m: distanciasHoy[f.id] || 0,
        // Coordenadas y precisión de su último punto registrado
        lat: ultimaPos ? ultimaPos.lat : null,
        lng: ultimaPos ? ultimaPos.lng : null,
        precision_m: ultimaPos ? ultimaPos.precision_m : null,
        created_at: ultimaPos ? ultimaPos.created_at : f.created_at, // Si no tiene puntos, fecha de alta
      };
    });

    return NextResponse.json(resultado);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 });
  }
}
