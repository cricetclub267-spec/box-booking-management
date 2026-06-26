// Unified DB Service Layer
import { hasSupabaseCredentials, supabase } from './supabase';
import * as mockDb from './mock-db';
import { Ground, Customer, Booking, Payment, ActivityLog, PaymentStatus, User } from './types';

// Hardcoded partners defined as fallback/direct accounts (bypassing Supabase SMTP limits)
export const HARDCODED_PARTNERS: User[] = [
  {
    id: '93a86c6b-9c3f-4271-9c6f-c1fdf4d7fca1',
    email: 'partner1@example.com',
    phone: '9999999991',
    role: 'partner',
    created_at: '2026-06-26T06:00:00.000Z'
  },
  {
    id: 'ad9e5590-db0e-4001-8bf7-df427e1f6e2a',
    email: 'partner2@example.com',
    phone: '9999999992',
    role: 'partner',
    created_at: '2026-06-26T06:00:00.000Z'
  },
  {
    id: 'a3f01ab3-27e1-4c6e-bfbf-2b7e0129cd8a',
    email: 'partner3@example.com',
    phone: '9999999993',
    role: 'partner',
    created_at: '2026-06-26T06:00:00.000Z'
  }
];


const normalizeTime = (t: string): string => {
  if (!t) return '';
  return t.substring(0, 5);
};

// Helper to determine if we should use Supabase or fallback to mock local database
const useSupabase = (): boolean => {
  return hasSupabaseCredentials() && supabase !== null;
};

// Global database error handler to clean up expired Supabase sessions (401 errors)
const handleDbError = (error: any) => {
  if (!error) return;
  console.error('Database query error:', error);
  
  const status = error.status || (error.statusText === 'Unauthorized' ? 401 : null);
  const code = error.code;
  const message = error.message || '';
  
  if (status === 401 || code === 'PGRST301' || message.includes('JWT') || message.includes('invalid claim')) {
    console.warn('Session is invalid or expired. Logging out and clearing invalid tokens...');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('turf_session');
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          localStorage.removeItem(key);
        }
      }
      window.location.href = '/login?expired=true';
    }
  }
};

// 1. Grounds Services
export const getGrounds = async (): Promise<Ground[]> => {
  if (useSupabase() && supabase) {
    const { data, error } = await supabase
      .from('grounds')
      .select('*')
      .order('name');
    
    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }
    
    // Auto-seed grounds if table is empty and user is authenticated
    if (data && data.length === 0) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          console.log('Grounds table is empty. Seeding default grounds...');
          const defaultGrounds = [
            { name: 'Box 1 (Premium Turf)', hourly_rate: 1200.00 },
            { name: 'Box 2 (Premium Turf)', hourly_rate: 1200.00 }
          ];
          const { data: insertedData, error: insertError } = await supabase
            .from('grounds')
            .insert(defaultGrounds)
            .select();
          
          if (!insertError && insertedData) {
            console.log('Seeded grounds successfully:', insertedData);
            return insertedData;
          } else {
            console.error('Failed to seed grounds:', insertError);
          }
        }
      } catch (seedErr) {
        console.error('Error seeding grounds:', seedErr);
      }
      
      // Fallback to mock grounds if we couldn't seed, preventing an empty scheduler/selector
      return mockDb.getGrounds();
    }
    
    // Auto-migrate database grounds names/prices if needed
    if (data && data.length > 0) {
      const updatedData = [...data];
      for (let i = 0; i < updatedData.length; i++) {
        const g = updatedData[i];
        let newName = g.name;
        let newRate = Number(g.hourly_rate);
        let changed = false;

        if (g.name.includes('Standard Turf') || g.name.includes('Ground B')) {
          newName = 'Box 2 (Premium Turf)';
          newRate = 1200.00;
          changed = true;
        } else if (g.name.includes('Ground A')) {
          newName = 'Box 1 (Premium Turf)';
          newRate = 1200.00;
          changed = true;
        } else if (g.name === 'Box 1 (Premium Turf)' && Number(g.hourly_rate) !== 1200) {
          newRate = 1200.00;
          changed = true;
        } else if (g.name === 'Box 2 (Premium Turf)' && Number(g.hourly_rate) !== 1200) {
          newRate = 1200.00;
          changed = true;
        }

        if (changed) {
          try {
            await supabase
              .from('grounds')
              .update({ name: newName, hourly_rate: newRate })
              .eq('id', g.id);
            updatedData[i] = { ...g, name: newName, hourly_rate: newRate };
          } catch (updateErr) {
            console.error(`Failed to migrate Ground ${g.id} in Supabase:`, updateErr);
          }
        }
      }
      return updatedData;
    }
    
    return data && data.length > 0 ? data : mockDb.getGrounds();
  }
  return mockDb.getGrounds();
};

// 2. Customer Services
export const getCustomers = async (): Promise<Customer[]> => {
  if (useSupabase() && supabase) {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name');
    
    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }
    return data || [];
  }
  return mockDb.getCustomers();
};

export const createCustomer = async (name: string, phone: string): Promise<Customer> => {
  if (useSupabase() && supabase) {
    // Check if phone already exists
    const { data: existing, error: checkError } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (checkError) {
      handleDbError(checkError);
    }

    if (existing) {
      return existing;
    }

    const { data, error } = await supabase
      .from('customers')
      .insert([{ name, phone }])
      .select()
      .single();

    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }
    
    await logActivity(`Created customer: ${name} (${phone})`);
    return data;
  }
  return mockDb.createCustomer(name, phone);
};

// 3. Bookings Services
export const getBookings = async (): Promise<Booking[]> => {
  if (useSupabase() && supabase) {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        customer:customer_id (*),
        ground:ground_id (*)
      `)
      .is('deleted_at', null)
      .order('booking_date', { ascending: false });

    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }
    return data || [];
  }
  return mockDb.getBookings();
};

export const createBooking = async (
  bookingData: Omit<Booking, 'id' | 'created_at'>,
  userEmail: string = 'dhameliyaavadh592@gmail.com'
): Promise<Booking> => {
  if (useSupabase() && supabase) {
    // 1. Conflict Check
    const { data: conflicts, error: conflictError } = await supabase
      .from('bookings')
      .select('*')
      .eq('ground_id', bookingData.ground_id)
      .eq('booking_date', bookingData.booking_date)
      .neq('status', 'Cancelled')
      .is('deleted_at', null);

    if (conflictError) {
      handleDbError(conflictError);
      console.error('Conflict check query failed:', conflictError);
    } else if (conflicts && conflicts.length > 0) {
      const overlap = conflicts.some(b => {
        const bStart = normalizeTime(b.start_time);
        const bEnd = normalizeTime(b.end_time);
        const reqStart = normalizeTime(bookingData.start_time);
        const reqEnd = normalizeTime(bookingData.end_time);
        return reqStart < bEnd && reqEnd > bStart;
      });
      if (overlap) {
        throw new Error('This time slot is already booked for this ground. Double bookings are not allowed.');
      }
    }

    // 2. Insert Booking
    const { data, error } = await supabase
      .from('bookings')
      .insert([bookingData])
      .select()
      .single();

    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }

    // Get customer name for logging
    const { data: customer } = await supabase
      .from('customers')
      .select('name')
      .eq('id', bookingData.customer_id)
      .single();

    const custName = customer?.name || 'Unknown Customer';
    await logActivity(`Created booking for ${custName} on ${bookingData.booking_date} (${bookingData.start_time} - ${bookingData.end_time})`, userEmail);
    
    return data;
  }
  return mockDb.createBooking(bookingData, userEmail);
};

export const updateBooking = async (
  updatedBooking: Booking,
  userEmail: string = 'dhameliyaavadh592@gmail.com'
): Promise<Booking> => {
  if (useSupabase() && supabase && !updatedBooking.id.startsWith('book_')) {
    // 1. Conflict Check
    const { data: conflicts, error: conflictError } = await supabase
      .from('bookings')
      .select('*')
      .eq('ground_id', updatedBooking.ground_id)
      .eq('booking_date', updatedBooking.booking_date)
      .neq('status', 'Cancelled')
      .neq('id', updatedBooking.id)
      .is('deleted_at', null);

    if (conflicts && conflicts.length > 0) {
      const overlap = conflicts.some(b => {
        const bStart = normalizeTime(b.start_time);
        const bEnd = normalizeTime(b.end_time);
        const reqStart = normalizeTime(updatedBooking.start_time);
        const reqEnd = normalizeTime(updatedBooking.end_time);
        return reqStart < bEnd && reqEnd > bStart;
      });
      if (overlap) {
        throw new Error('This time slot is already booked for this ground. Double bookings are not allowed.');
      }
    }

    // 2. Update Booking
    const { customer, ground, ...bookingPayload } = updatedBooking as any; // Strip relational fields before sending to DB
    const { data, error } = await supabase
      .from('bookings')
      .update(bookingPayload)
      .eq('id', updatedBooking.id)
      .select()
      .single();

    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }

    await logActivity(`Updated booking ${updatedBooking.id} details`, userEmail);
    return data;
  }
  return mockDb.updateBooking(updatedBooking, userEmail);
};

export const softDeleteBooking = async (
  bookingId: string,
  userEmail: string = 'dhameliyaavadh592@gmail.com'
): Promise<void> => {
  if (useSupabase() && supabase && !bookingId.startsWith('book_')) {
    const { error } = await supabase
      .from('bookings')
      .update({ deleted_at: new Date().toISOString(), status: 'Cancelled' })
      .eq('id', bookingId);

    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }

    await logActivity(`Deleted booking ${bookingId} (Soft Delete)`, userEmail);
    return;
  }
  return mockDb.softDeleteBooking(bookingId, userEmail);
};

// 4. Payments Services
export const getPayments = async (): Promise<Payment[]> => {
  if (useSupabase() && supabase) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .order('payment_date', { ascending: false });

    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }
    return data || [];
  }
  return mockDb.getPayments();
};

export const getBookingPaymentSummary = async (bookingId: string) => {
  if (useSupabase() && supabase && !bookingId.startsWith('book_')) {
    const { data: payments, error } = await supabase
      .from('payments')
      .select('amount_paid')
      .eq('booking_id', bookingId);

    if (error) {
      handleDbError(error);
    }

    const totalPaid = payments ? payments.reduce((sum, p) => sum + Number(p.amount_paid), 0) : 0;

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('final_amount')
      .eq('id', bookingId)
      .single();

    if (bookingError) {
      handleDbError(bookingError);
    }

    const finalAmount = booking ? Number(booking.final_amount) : 0;
    const pendingAmount = Math.max(0, finalAmount - totalPaid);

    let status: PaymentStatus = 'Pending';
    if (totalPaid >= finalAmount && finalAmount > 0) {
      status = 'Paid';
    } else if (totalPaid > 0) {
      status = 'Partial';
    }

    return {
      totalPaid,
      pendingAmount,
      status
    };
  }
  return mockDb.getBookingPaymentSummary(bookingId);
};

export const addPayment = async (
  paymentData: Omit<Payment, 'id' | 'payment_date'>,
  userEmail: string = 'dhameliyaavadh592@gmail.com'
): Promise<Payment> => {
  if (useSupabase() && supabase && !paymentData.booking_id.startsWith('book_')) {
    const summary = await getBookingPaymentSummary(paymentData.booking_id);
    const newPending = summary.pendingAmount - paymentData.amount_paid;
    if (newPending < -0.01) {
      throw new Error(`Invalid payment amount. Amount paid exceeds the remaining balance of ₹${summary.pendingAmount}.`);
    }

    const { data, error } = await supabase
      .from('payments')
      .insert([paymentData])
      .select()
      .single();

    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }

    // Fetch booking details for logging
    const { data: booking, error: bookingLookupError } = await supabase
      .from('bookings')
      .select(`
        customer:customer_id (name)
      `)
      .eq('id', paymentData.booking_id)
      .single();

    if (bookingLookupError) {
      handleDbError(bookingLookupError);
    }

    const customerName = (booking as any)?.customer?.name || 'Customer';
    await logActivity(`Received payment of ₹${paymentData.amount_paid} via ${paymentData.payment_method} from ${customerName}`, userEmail);

    return data;
  }
  return mockDb.addPayment(paymentData, userEmail);
};

// 5. Activity Logs Services
export const getActivityLogs = async (): Promise<ActivityLog[]> => {
  if (useSupabase() && supabase) {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }
    return data || [];
  }
  return mockDb.getActivityLogs();
};

export const logActivity = async (action: string, userEmail: string = 'dhameliyaavadh592@gmail.com'): Promise<void> => {
  if (useSupabase() && supabase) {
    const { error } = await supabase
      .from('activity_logs')
      .insert([{ action, user_email: userEmail }]);

    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }
    return;
  }
  return mockDb.logActivity(action, userEmail);
};

// 6. User Profiles Services
export const getUserProfileByPhone = async (phone: string): Promise<User | null> => {
  // Check hardcoded partners
  const hcPartner = HARDCODED_PARTNERS.find(u => u.phone === phone);
  if (hcPartner) return hcPartner;

  // Check new admin
  if (phone === '9999999990') {
    return {
      id: 'c952ced9-32ab-4dd7-8bc8-607d5f3a5a67',
      email: 'admin@example.com',
      phone: '9999999990',
      role: 'admin',
      created_at: '2026-06-26T05:48:09.901189+00:00'
    };
  }

  if (useSupabase() && supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();
      
    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }
    return data;
  }
  const mockUsers = mockDb.getUsers();
  return mockUsers.find(u => u.phone === phone) || null;
};

export const getUserProfileByEmail = async (email: string): Promise<User | null> => {
  const normalizedEmail = email.toLowerCase().trim();
  const hcPartner = HARDCODED_PARTNERS.find(u => u.email.toLowerCase() === normalizedEmail);
  if (hcPartner) return hcPartner;

  if (normalizedEmail === 'admin@example.com') {
    return {
      id: 'c952ced9-32ab-4dd7-8bc8-607d5f3a5a67',
      email: 'admin@example.com',
      phone: '9999999990',
      role: 'admin',
      created_at: '2026-06-26T05:48:09.901189+00:00'
    };
  }

  if (useSupabase() && supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();
      
    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }
    return data;
  }
  const mockUsers = mockDb.getUsers();
  return mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
};

export const createUserProfile = async (
  profile: Omit<User, 'created_at'>
): Promise<User> => {
  if (useSupabase() && supabase) {
    const { data, error } = await supabase
      .from('users')
      .insert([profile])
      .select()
      .single();

    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }
    return data;
  }
  return mockDb.createUser(profile.email, profile.phone, profile.role, profile.id);
};

export const getPartners = async (): Promise<User[]> => {
  let dbPartners: User[] = [];
  if (useSupabase() && supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'partner')
      .order('created_at', { ascending: false });

    if (error) {
      handleDbError(error);
      throw new Error(`Database error: ${error.message}`);
    }
    dbPartners = data || [];
  } else {
    const mockUsers = mockDb.getUsers();
    dbPartners = mockUsers.filter(u => u.role === 'partner');
  }

  // Merge hardcoded partners and database partners, avoiding duplicates
  const allPartners = [...HARDCODED_PARTNERS];
  dbPartners.forEach(dbP => {
    if (!allPartners.some(hcP => hcP.email.toLowerCase() === dbP.email.toLowerCase() || hcP.phone === dbP.phone)) {
      allPartners.push(dbP);
    }
  });

  return allPartners;
};

export const getBookingStatus = (booking: Booking): 'Booked' | 'Running' | 'Completed' | 'Cancelled' => {
  if (booking.status === 'Cancelled') return 'Cancelled';
  
  const now = new Date();
  const [year, month, day] = booking.booking_date.split('-').map(Number);
  
  const [startHour, startMin] = booking.start_time.split(':').map(Number);
  const [endHour, endMin] = booking.end_time.split(':').map(Number);
  
  const startTime = new Date(year, month - 1, day, startHour, startMin, 0, 0);
  const endTime = new Date(year, month - 1, day, endHour, endMin, 0, 0);
  
  if (now < startTime) {
    return 'Booked';
  } else if (now >= startTime && now <= endTime) {
    return 'Running';
  } else {
    return 'Completed';
  }
};

export const updateGroundsRate = async (rate: number): Promise<void> => {
  if (useSupabase() && supabase) {
    try {
      const grounds = await getGrounds();
      for (const g of grounds) {
        const { error } = await supabase
          .from('grounds')
          .update({ hourly_rate: rate })
          .eq('id', g.id);
        if (error) {
          handleDbError(error);
          console.error('Supabase updateGroundsRate error for ground', g.id, error);
        }
      }
    } catch (e) {
      console.error('Failed to update grounds in Supabase:', e);
    }
  }
};


