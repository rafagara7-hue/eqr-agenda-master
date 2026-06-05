import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await getSupabaseServiceClient();
    const { error } = await supabase.from('app_settings').select('key').limit(1);

    return NextResponse.json({
      status: error ? 'degraded' : 'ok',
      timestamp: new Date().toISOString(),
      supabase: error ? 'error' : 'ok',
    });
  } catch {
    return NextResponse.json({ status: 'error', timestamp: new Date().toISOString() }, { status: 500 });
  }
}
