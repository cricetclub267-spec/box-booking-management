-- SQL migration script to add expenses table to Box Cricket Turf Management System

-- 1. Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    user_phone VARCHAR(20) NOT NULL,
    reason TEXT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Disable Row Level Security to allow public read/write access (matching local MVP setup in setup-new-db.sql)
ALTER TABLE public.expenses DISABLE ROW LEVEL SECURITY;

-- 3. Grant API access (usage) on public schema and table privileges to client roles
GRANT ALL PRIVILEGES ON TABLE public.expenses TO anon, authenticated, service_role;
