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

export async function GET(request: Request) {
  try {
    // 1. Autorización
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

    // 2. Parámetros de consulta
    const { searchParams } = new URL(request.url);
    const folleteroId = searchParams.get('folletero_id');
    const fecha = searchParams.get('fecha'); // Formato YYYY-MM-DD

    if (!folleteroId || !fecha) {
      return NextResponse.json({ error: 'Falta folletero_id o fecha' }, { status: 400 });
    }

    // Validar formato de fecha (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json({ error: 'Formato de fecha inválido. Debe ser YYYY-MM-DD' }, { status: 400 });
    }

    // 3. Convertir fecha al rango horario local de Argentina (UTC-3)
    const startStr = `${fecha}T00:00:00-03:00`;
    const endStr = `${fecha}T23:59:59.999-03:00`;

    // 4. Buscar ubicaciones en la base de datos
    const { data: ubicaciones, error } = await supabaseAdmin
      .from('ubicaciones')
      .select('id, lat, lng, precision_m, created_at')
      .eq('folletero_id', folleteroId)
      .gte('created_at', startStr)
      .lte('created_at', endStr)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: 'Error al consultar ruta: ' + error.message }, { status: 500 });
    }

    // 5. Calcular distancia total con Haversine
    let distanciaTotalM = 0;
    if (ubicaciones && ubicaciones.length > 1) {
      for (let i = 1; i < ubicaciones.length; i++) {
        distanciaTotalM += haversine(
          ubicaciones[i - 1].lat,
          ubicaciones[i - 1].lng,
          ubicaciones[i].lat,
          ubicaciones[i].lng
        );
      }
    }

    return NextResponse.json({
      folletero_id: folleteroId,
      fecha,
      puntos: ubicaciones || [],
      distancia_total_m: Math.round(distanciaTotalM),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 });
  }
}
