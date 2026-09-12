import { supabase } from './supabase';

export async function testSupabaseConnection() {
  const { error } = await supabase
    .from('cars')
    .select('id')
    .limit(1);

  if (error) {
    throw new Error(`Supabase connection failed: ${error.message}`);
  }

  return true;
}