-- SQL script to remove the three hardcoded partner accounts from Supabase Auth and Public Users schema.
-- Copy and run this script in your Supabase SQL Editor to clean up database records.

DELETE FROM public.users 
WHERE email IN ('partner1@example.com', 'partner2@example.com', 'partner3@example.com')
   OR phone IN ('9999999991', '9999999992', '9999999993')
   OR id IN ('93a86c6b-9c3f-4271-9c6f-c1fdf4d7fca1', 'ad9e5590-db0e-4001-8bf7-df427e1f6e2a', 'a3f01ab3-27e1-4c6e-bfbf-2b7e0129cd8a');

DELETE FROM auth.users 
WHERE email IN ('partner1@example.com', 'partner2@example.com', 'partner3@example.com')
   OR phone IN ('9999999991', '9999999992', '9999999993')
   OR id IN ('93a86c6b-9c3f-4271-9c6f-c1fdf4d7fca1', 'ad9e5590-db0e-4001-8bf7-df427e1f6e2a', 'a3f01ab3-27e1-4c6e-bfbf-2b7e0129cd8a');
