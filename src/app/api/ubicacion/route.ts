import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Fórmula Haversine para calcular distancia en metros entre dos puntos
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

export async function POST(request: Request) {
  try {
    const token = request.headers.get('x-folletero-token');
    if (!token) {
      return NextResponse.json({ error: 'Token no provisto' }, { status: 401 });
    }

    const { lat, lng, precision_m } = await request.json();
    if (lat === undefined || lng === undefined) {
      return NextResponse.json({ error: 'Faltan coordenadas' }, { status: 400 });
    }

    // 1. Validar folletero
    const { data: folletero, error: fetchError } = await supabaseAdmin
      .from('folleteros')
      .select('id, activo, estado')
      .eq('token', token)
      .single();

    if (fetchError || !folletero) {
      return NextResponse.json({ error: 'Folletero no encontrado o token inválido' }, { status: 404 });
    }

    if (!folletero.activo) {
      return NextResponse.json({ error: 'Folletero inactivo' }, { status: 403 });
    }

    // 2. Obtener última ubicación insertada para comparar
    const { data: ultimaUbicacion, error: geoError } = await supabaseAdmin
      .from('ubicaciones')
      .select('lat, lng, created_at')
      .eq('folletero_id', folletero.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (geoError) {
      return NextResponse.json({ error: 'Error al obtener la última ubicación' }, { status: 500 });
    }

    if (ultimaUbicacion) {
      const distancia = haversine(ultimaUbicacion.lat, ultimaUbicacion.lng, lat, lng);
      const tiempoTranscurridoMs = new Date().getTime() - new Date(ultimaUbicacion.created_at).getTime();
      const tiempoTranscurridoS = tiempoTranscurridoMs / 1000;

      // Si la petición llega en el mismo segundo, la ignoramos para evitar duplicidad de red
      if (tiempoTranscurridoS < 1) {
        return NextResponse.json({ ok: true, status: 'ignored_duplicate' });
      }

      // Si la distancia es < 1 metro (quieto) y pasaron menos de 10 segundos
      // desde el último punto registrado, ignoramos la inserción para ahorrar datos
      if (distancia < 1 && tiempoTranscurridoS < 10) {
        return NextResponse.json({ ok: true, status: 'ignored_quiet' });
      }
    }

    // 3. Insertar ubicación
    const { error: insertError } = await supabaseAdmin.from('ubicaciones').insert({
      folletero_id: folletero.id,
      lat,
      lng,
      precision_m: precision_m || null,
    });

    if (insertError) {
      return NextResponse.json({ error: 'Error al registrar ubicación' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 });
  }
}
