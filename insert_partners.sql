-- SQL script to insert the three partner accounts directly into Supabase Auth and Public Users schema.
-- Copy and run this script in your Supabase SQL Editor

-- Enable pgcrypto extension if not already enabled (for password hashing)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Insert Partner 1 (partner1@gmail.com, 9328021142)
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  role,
  phone
) 
SELECT
  '93a86c6b-9c3f-4271-9c6f-c1fdf4d7fca1',
  '00000000-0000-0000-0000-000000000000',
  'partner1@gmail.com',
  extensions.crypt('Subham@bhojani', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  'authenticated',
  '9328021142'
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'partner1@gmail.com' OR phone = '9328021142' OR id = '93a86c6b-9c3f-4271-9c6f-c1fdf4d7fca1'
);

INSERT INTO public.users (
  id,
  email,
  phone,
  role,
  created_at
) 
SELECT
  '93a86c6b-9c3f-4271-9c6f-c1fdf4d7fca1',
  'partner1@gmail.com',
  '9328021142',
  'partner',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.users WHERE email = 'partner1@gmail.com' OR phone = '9328021142' OR id = '93a86c6b-9c3f-4271-9c6f-c1fdf4d7fca1'
);


-- 2. Insert Partner 2 (partner2@gmail.com, 9426481232)
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  role,
  phone
) 
SELECT
  'ad9e5590-db0e-4001-8bf7-df427e1f6e2a',
  '00000000-0000-0000-0000-000000000000',
  'partner2@gmail.com',
  extensions.crypt('Yatin@navdiya', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  'authenticated',
  '9426481232'
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'partner2@gmail.com' OR phone = '9426481232' OR id = 'ad9e5590-db0e-4001-8bf7-df427e1f6e2a'
);

INSERT INTO public.users (
  id,
  email,
  phone,
  role,
  created_at
) 
SELECT
  'ad9e5590-db0e-4001-8bf7-df427e1f6e2a',
  'partner2@gmail.com',
  '9426481232',
  'partner',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.users WHERE email = 'partner2@gmail.com' OR phone = '9426481232' OR id = 'ad9e5590-db0e-4001-8bf7-df427e1f6e2a'
);


-- 3. Insert Partner 3 (partner3@gmail.com, 9499745268)
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  role,
  phone
) 
SELECT
  'a3f01ab3-27e1-4c6e-bfbf-2b7e0129cd8a',
  '00000000-0000-0000-0000-000000000000',
  'partner3@gmail.com',
  extensions.crypt('Subham@sivo', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  'authenticated',
  '9499745268'
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'partner3@gmail.com' OR phone = '9499745268' OR id = 'a3f01ab3-27e1-4c6e-bfbf-2b7e0129cd8a'
);

INSERT INTO public.users (
  id,
  email,
  phone,
  role,
  created_at
) 
SELECT
  'a3f01ab3-27e1-4c6e-bfbf-2b7e0129cd8a',
  'partner3@gmail.com',
  '9499745268',
  'partner',
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.users WHERE email = 'partner3@gmail.com' OR phone = '9499745268' OR id = 'a3f01ab3-27e1-4c6e-bfbf-2b7e0129cd8a'
);
