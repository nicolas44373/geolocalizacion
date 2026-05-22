import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const token = request.headers.get('x-folletero-token');
    if (!token) {
      return NextResponse.json({ error: 'Token no provisto' }, { status: 401 });
    }

    const { data: folletero, error } = await supabaseAdmin
      .from('folleteros')
      .select('id, nombre, activo, estado')
      .eq('token', token)
      .single();

    if (error || !folletero) {
      return NextResponse.json({ error: 'Token inválido o folletero no encontrado' }, { status: 404 });
    }

    return NextResponse.json(folletero);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Error del servidor' }, { status: 500 });
  }
}
