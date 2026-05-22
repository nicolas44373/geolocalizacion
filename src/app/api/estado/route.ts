import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const token = request.headers.get('x-folletero-token');
    if (!token) {
      return NextResponse.json({ error: 'Token no provisto' }, { status: 401 });
    }

    const { estado } = await request.json();
    if (!estado || !['activo', 'pausado', 'finalizado'].includes(estado)) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    }

    // Buscar folletero y verificar que esté habilitado (activo = true)
    const { data: folletero, error: fetchError } = await supabaseAdmin
      .from('folleteros')
      .select('id, activo')
      .eq('token', token)
      .single();

    if (fetchError || !folletero) {
      return NextResponse.json({ error: 'Folletero no encontrado o token inválido' }, { status: 404 });
    }

    if (!folletero.activo) {
      return NextResponse.json({ error: 'Folletero inactivo (deshabilitado)' }, { status: 403 });
    }

    // Actualizar el estado
    const { error: updateError } = await supabaseAdmin
      .from('folleteros')
      .update({ estado })
      .eq('id', folletero.id);

    if (updateError) {
      return NextResponse.json({ error: 'Error al actualizar el estado' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 });
  }
}
