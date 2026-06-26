-- SQL Script to enable public read/write access policies while keeping Row Level Security (RLS) enabled.

-- 1. Customers Table Policies
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select on customers" ON customers;
DROP POLICY IF EXISTS "Allow public insert on customers" ON customers;
DROP POLICY IF EXISTS "Allow public update on customers" ON customers;
DROP POLICY IF EXISTS "Allow public delete on customers" ON customers;
CREATE POLICY "Allow public select on customers" ON customers FOR SELECT USING (true);
CREATE POLICY "Allow public insert on customers" ON customers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on customers" ON customers FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on customers" ON customers FOR DELETE USING (true);

-- 2. Bookings Table Policies
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select on bookings" ON bookings;
DROP POLICY IF EXISTS "Allow public insert on bookings" ON bookings;
DROP POLICY IF EXISTS "Allow public update on bookings" ON bookings;
DROP POLICY IF EXISTS "Allow public delete on bookings" ON bookings;
CREATE POLICY "Allow public select on bookings" ON bookings FOR SELECT USING (true);
CREATE POLICY "Allow public insert on bookings" ON bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on bookings" ON bookings FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on bookings" ON bookings FOR DELETE USING (true);

-- 3. Payments Table Policies
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select on payments" ON payments;
DROP POLICY IF EXISTS "Allow public insert on payments" ON payments;
DROP POLICY IF EXISTS "Allow public update on payments" ON payments;
DROP POLICY IF EXISTS "Allow public delete on payments" ON payments;
CREATE POLICY "Allow public select on payments" ON payments FOR SELECT USING (true);
CREATE POLICY "Allow public insert on payments" ON payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on payments" ON payments FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on payments" ON payments FOR DELETE USING (true);

-- 4. Grounds Table Policies
ALTER TABLE grounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select on grounds" ON grounds;
DROP POLICY IF EXISTS "Allow public insert on grounds" ON grounds;
DROP POLICY IF EXISTS "Allow public update on grounds" ON grounds;
DROP POLICY IF EXISTS "Allow public delete on grounds" ON grounds;
CREATE POLICY "Allow public select on grounds" ON grounds FOR SELECT USING (true);
CREATE POLICY "Allow public insert on grounds" ON grounds FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on grounds" ON grounds FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on grounds" ON grounds FOR DELETE USING (true);

-- 5. Users Table Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select on users" ON users;
DROP POLICY IF EXISTS "Allow public insert on users" ON users;
DROP POLICY IF EXISTS "Allow public update on users" ON users;
DROP POLICY IF EXISTS "Allow public delete on users" ON users;
CREATE POLICY "Allow public select on users" ON users FOR SELECT USING (true);
CREATE POLICY "Allow public insert on users" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on users" ON users FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on users" ON users FOR DELETE USING (true);

-- 6. Activity Logs Table Policies
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select on activity_logs" ON activity_logs;
DROP POLICY IF EXISTS "Allow public insert on activity_logs" ON activity_logs;
DROP POLICY IF EXISTS "Allow public update on activity_logs" ON activity_logs;
DROP POLICY IF EXISTS "Allow public delete on activity_logs" ON activity_logs;
CREATE POLICY "Allow public select on activity_logs" ON activity_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert on activity_logs" ON activity_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on activity_logs" ON activity_logs FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on activity_logs" ON activity_logs FOR DELETE USING (true);
