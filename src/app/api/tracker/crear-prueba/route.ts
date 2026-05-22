import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const { nombre } = await request.json();
    const finalNombre = nombre || 'Folletero de Prueba';

    // Insertar un nuevo folletero con estado 'finalizado' y activo = true
    const { data: folletero, error } = await supabaseAdmin
      .from('folleteros')
      .insert({
        nombre: finalNombre,
        activo: true,
        estado: 'finalizado',
      })
      .select('id, nombre, token')
      .single();

    if (error || !folletero) {
      return NextResponse.json({ error: 'Error al crear folletero de prueba: ' + error.message }, { status: 500 });
    }

    const trackingLink = `/tracker/${folletero.token}`;

    return NextResponse.json({
      success: true,
      folletero,
      trackingLink,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 });
  }
}
