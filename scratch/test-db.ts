import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://inzbwssnreyoltjadlrl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImluemJ3c3NucmV5b2x0amFkbHJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NTI4NDEsImV4cCI6MjA5ODAyODg0MX0.KtTEesK5CcgfJ4uDIPOBIpzRWrn9uYwJA_Y1o2UzEGU';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data: users, error: err } = await supabase.from('users').select('*');
  console.log('USERS DATA:', users);
  console.log('ERROR:', err);
}

test();
