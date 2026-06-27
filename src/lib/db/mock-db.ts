// Mock Database Layer using LocalStorage (SSR-Safe)
import { Ground, Customer, Booking, Payment, ActivityLog, PaymentStatus, User, Expense } from './types';

// Helper to check if running in browser
const isBrowser = typeof window !== 'undefined';

// In-Memory fallback for SSR/server components
let memGrounds: Ground[] = [];
let memCustomers: Customer[] = [];
let memBookings: Booking[] = [];
let memPayments: Payment[] = [];
let memActivityLogs: ActivityLog[] = [];
let memUsers: User[] = [];
let memExpenses: Expense[] = [];

// Default Grounds
const DEFAULT_GROUNDS: Ground[] = [
  { id: 'g1', name: 'Box 1 (Premium Turf)', hourly_rate: 1200, created_at: new Date().toISOString() },
  { id: 'g2', name: 'Box 2 (Premium Turf)', hourly_rate: 1200, created_at: new Date().toISOString() }
];

// Default admin user fallback credentials
const DEFAULT_ADMIN: User = {
  id: 'admin_fallback_id',
  email: 'dhameliyaavadh592@gmail.com',
  phone: '9909108527',
  role: 'admin',
  created_at: new Date().toISOString()
};

// Seed initial data if store is empty
const initializeSeedData = () => {
  if (!isBrowser) return;

  const storedGrounds = localStorage.getItem('turf_grounds');
  if (!storedGrounds) {
    localStorage.setItem('turf_grounds', JSON.stringify(DEFAULT_GROUNDS));
    localStorage.setItem('turf_customers', JSON.stringify([]));
    localStorage.setItem('turf_bookings', JSON.stringify([]));
    localStorage.setItem('turf_payments', JSON.stringify([]));
    localStorage.setItem('turf_expenses', JSON.stringify([]));
    
    // Seed default admin in mock users
    localStorage.setItem('turf_users', JSON.stringify([DEFAULT_ADMIN]));

    const seedLogs: ActivityLog[] = [
      { id: 'l1', action: 'System Database Initialized', user_email: 'dhameliyaavadh592@gmail.com', created_at: new Date().toISOString() }
    ];
    localStorage.setItem('turf_logs', JSON.stringify(seedLogs));
  } else {
    // Ensure turf_users exists
    const storedUsers = localStorage.getItem('turf_users');
    if (!storedUsers) {
      localStorage.setItem('turf_users', JSON.stringify([DEFAULT_ADMIN]));
    }
    
    // Ensure turf_expenses exists
    const storedExpenses = localStorage.getItem('turf_expenses');
    if (!storedExpenses) {
      localStorage.setItem('turf_expenses', JSON.stringify([]));
    }
    
    // Migration: Update existing grounds with old names/prices
    try {
      const parsed: Ground[] = JSON.parse(storedGrounds);
      let updated = false;
      const newParsed = parsed.map(g => {
        if (g.id === 'g1' && (g.name.includes('Ground A') || g.hourly_rate !== 1200)) {
          updated = true;
          return { ...g, name: 'Box 1 (Premium Turf)', hourly_rate: 1200 };
        }
        if (g.id === 'g2' && (g.name.includes('Ground B') || g.name.includes('Standard Turf') || g.hourly_rate !== 1200)) {
          updated = true;
          return { ...g, name: 'Box 2 (Premium Turf)', hourly_rate: 1200 };
        }
        return g;
      });
      if (updated) {
        localStorage.setItem('turf_grounds', JSON.stringify(newParsed));
      }
    } catch (e) {
      console.error('Error migrating grounds names in localStorage:', e);
    }
  }
};

// Trigger initialization
if (isBrowser) {
  initializeSeedData();
}

// User accessors for mock DB
export const getUsers = (): User[] => {
  if (!isBrowser) return memUsers.length ? memUsers : [DEFAULT_ADMIN];
  const data = localStorage.getItem('turf_users');
  return data ? JSON.parse(data) : [DEFAULT_ADMIN];
};

export const setUsers = (users: User[]) => {
  if (isBrowser) localStorage.setItem('turf_users', JSON.stringify(users));
  else memUsers = users;
};

export const createUser = (email: string, phone: string, role: 'admin' | 'partner', id?: string): User => {
  const users = getUsers();
  const newUser: User = {
    id: id || `user_${Date.now()}`,
    email,
    phone,
    role,
    created_at: new Date().toISOString()
  };
  setUsers([...users, newUser]);
  return newUser;
};

// Accessors with localstorage sync
export const getGrounds = (): Ground[] => {
  if (!isBrowser) return memGrounds.length ? memGrounds : DEFAULT_GROUNDS;
  const data = localStorage.getItem('turf_grounds');
  return data ? JSON.parse(data) : DEFAULT_GROUNDS;
};

export const getCustomers = (): Customer[] => {
  if (!isBrowser) return memCustomers;
  const data = localStorage.getItem('turf_customers');
  return data ? JSON.parse(data) : [];
};

export const getBookings = (): Booking[] => {
  if (!isBrowser) return memBookings;
  const data = localStorage.getItem('turf_bookings');
  const bookings: Booking[] = data ? JSON.parse(data) : [];
  
  // Attach customer and ground profiles dynamically
  const grounds = getGrounds();
  const customers = getCustomers();
  
  return bookings.map(b => ({
    ...b,
    customer: customers.find(c => c.id === b.customer_id),
    ground: grounds.find(g => g.id === b.ground_id)
  })).filter(b => !b.deleted_at); // Exclude soft deleted bookings
};

export const getPayments = (): Payment[] => {
  if (!isBrowser) return memPayments;
  const data = localStorage.getItem('turf_payments');
  return data ? JSON.parse(data) : [];
};

export const getActivityLogs = (): ActivityLog[] => {
  if (!isBrowser) return memActivityLogs;
  const data = localStorage.getItem('turf_logs');
  const logs: ActivityLog[] = data ? JSON.parse(data) : [];
  return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};

// Writers
const setGrounds = (grounds: Ground[]) => {
  if (isBrowser) localStorage.setItem('turf_grounds', JSON.stringify(grounds));
  else memGrounds = grounds;
};

const setCustomers = (customers: Customer[]) => {
  if (isBrowser) localStorage.setItem('turf_customers', JSON.stringify(customers));
  else memCustomers = customers;
};

const setBookings = (bookings: Booking[]) => {
  if (isBrowser) localStorage.setItem('turf_bookings', JSON.stringify(bookings));
  else memBookings = bookings;
};

const setPayments = (payments: Payment[]) => {
  if (isBrowser) localStorage.setItem('turf_payments', JSON.stringify(payments));
  else memPayments = payments;
};

const setActivityLogs = (logs: ActivityLog[]) => {
  if (isBrowser) localStorage.setItem('turf_logs', JSON.stringify(logs));
  else memActivityLogs = logs;
};

// Logging helper
export const logActivity = (action: string, userEmail: string = 'admin@turf.com') => {
  const logs = getActivityLogs();
  const newLog: ActivityLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    action,
    user_email: userEmail,
    created_at: new Date().toISOString()
  };
  setActivityLogs([newLog, ...logs]);
};

// Customer functions
export const createCustomer = (name: string, phone: string): Customer => {
  const customers = getCustomers();
  
  // Check if phone number already exists
  const existing = customers.find(c => c.phone === phone);
  if (existing) return existing;

  const newCustomer: Customer = {
    id: `cust_${Date.now()}`,
    name,
    phone,
    created_at: new Date().toISOString()
  };
  
  setCustomers([...customers, newCustomer]);
  logActivity(`Added customer: ${name} (${phone})`);
  return newCustomer;
};

// Helper to normalize time format to HH:MM
const normalizeTime = (t: string): string => {
  if (!t) return '';
  return t.substring(0, 5);
};

// Time conflict verification
export const checkTimeConflict = (
  groundId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeBookingId?: string
): boolean => {
  const bookings = getBookings();
  
  // Filter bookings for same ground, same date, and not soft-deleted/cancelled
  const activeBookings = bookings.filter(b => 
    b.ground_id === groundId && 
    b.booking_date === date && 
    b.status !== 'Cancelled' && 
    b.id !== excludeBookingId
  );
  
  const reqStart = normalizeTime(startTime);
  const reqEnd = normalizeTime(endTime);
  
  // Overlap condition: startA < endB AND endA > startB
  const conflict = activeBookings.some(b => {
    const bStart = normalizeTime(b.start_time);
    const bEnd = normalizeTime(b.end_time);
    return reqStart < bEnd && reqEnd > bStart;
  });
  
  return conflict;
};

// Booking functions
export const createBooking = (bookingData: Omit<Booking, 'id' | 'created_at'>, userEmail: string = 'admin@turf.com'): Booking => {
  // Check conflict first
  const conflict = checkTimeConflict(
    bookingData.ground_id,
    bookingData.booking_date,
    bookingData.start_time,
    bookingData.end_time
  );

  if (conflict) {
    throw new Error('This time slot is already booked for this ground. Double bookings are not allowed.');
  }

  const bookings = getBookings();
  const newBooking: Booking = {
    ...bookingData,
    id: `book_${Date.now()}`,
    created_at: new Date().toISOString()
  };

  setBookings([...bookings, newBooking]);
  
  // Log activity
  const customers = getCustomers();
  const custName = customers.find(c => c.id === bookingData.customer_id)?.name || 'Unknown Customer';
  logActivity(`Created booking for ${custName} on ${bookingData.booking_date} (${bookingData.start_time} - ${bookingData.end_time})`, userEmail);
  
  return newBooking;
};

export const updateBooking = (updatedBooking: Booking, userEmail: string = 'admin@turf.com'): Booking => {
  // Check conflict first
  const conflict = checkTimeConflict(
    updatedBooking.ground_id,
    updatedBooking.booking_date,
    updatedBooking.start_time,
    updatedBooking.end_time,
    updatedBooking.id
  );

  if (conflict) {
    throw new Error('This time slot is already booked for this ground. Double bookings are not allowed.');
  }

  const bookings = getBookings();
  const index = bookings.findIndex(b => b.id === updatedBooking.id);
  if (index === -1) {
    throw new Error('Booking not found');
  }

  const originalBooking = bookings[index];
  const oldStatus = originalBooking.status;
  const newStatus = updatedBooking.status;

  bookings[index] = updatedBooking;
  setBookings(bookings);

  // If status changed, update payments accordingly
  if (oldStatus !== newStatus && newStatus === 'Cancelled') {
    // Zero out payments if cancelled, or leave as logs? Usually left, but update payment status.
    logActivity(`Cancelled booking ${updatedBooking.id} for customer`, userEmail);
  } else {
    logActivity(`Updated booking ${updatedBooking.id} details`, userEmail);
  }

  return updatedBooking;
};

// Soft delete booking
export const softDeleteBooking = (bookingId: string, userEmail: string = 'admin@turf.com') => {
  const bookings = getBookings();
  const index = bookings.findIndex(b => b.id === bookingId);
  if (index === -1) {
    throw new Error('Booking not found');
  }
  
  const booking = bookings[index];
  booking.deleted_at = new Date().toISOString();
  booking.status = 'Cancelled'; // Set status to Cancelled as well
  
  setBookings(bookings);
  logActivity(`Deleted booking ${bookingId} (Soft Delete)`, userEmail);
};

// Payments functions
export const getBookingPaymentSummary = (bookingId: string) => {
  const payments = getPayments().filter(p => p.booking_id === bookingId);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount_paid, 0);
  
  const bookings = getBookings();
  const booking = bookings.find(b => b.id === bookingId);
  const finalAmount = booking ? booking.final_amount : 0;
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
};

export const addPayment = (paymentData: Omit<Payment, 'id' | 'payment_date'>, userEmail: string = 'admin@turf.com'): Payment => {
  const payments = getPayments();
  const summary = getBookingPaymentSummary(paymentData.booking_id);
  
  // Validation: Pending amount cannot be negative
  const newPending = summary.pendingAmount - paymentData.amount_paid;
  if (newPending < -0.01) {
    throw new Error(`Invalid payment amount. Amount paid exceeds the remaining balance of ₹${summary.pendingAmount}.`);
  }

  const newPayment: Payment = {
    ...paymentData,
    id: `pay_${Date.now()}`,
    payment_date: new Date().toISOString()
  };

  setPayments([...payments, newPayment]);

  // Log activity
  const bookings = getBookings();
  const booking = bookings.find(b => b.id === paymentData.booking_id);
  const customerName = booking?.customer?.name || 'Customer';
  logActivity(`Received payment of ₹${paymentData.amount_paid} via ${paymentData.payment_method} from ${customerName}`, userEmail);

  return newPayment;
};

// Expenses functions
export const getExpenses = (): Expense[] => {
  if (!isBrowser) return memExpenses;
  const data = localStorage.getItem('turf_expenses');
  return data ? JSON.parse(data) : [];
};

const setExpenses = (expenses: Expense[]) => {
  if (isBrowser) localStorage.setItem('turf_expenses', JSON.stringify(expenses));
  else memExpenses = expenses;
};

export const createExpense = (
  expenseData: Omit<Expense, 'id' | 'created_at'>,
  userEmail: string = 'admin@turf.com'
): Expense => {
  const expenses = getExpenses();
  const newExpense: Expense = {
    ...expenseData,
    id: `exp_${Date.now()}`,
    created_at: new Date().toISOString()
  };
  setExpenses([...expenses, newExpense]);
  logActivity(`Added expense of ₹${expenseData.amount} for "${expenseData.reason}" by ${expenseData.user_phone}`, userEmail);
  return newExpense;
};

export const updateExpense = (
  updatedExpense: Expense,
  userEmail: string = 'admin@turf.com'
): Expense => {
  const expenses = getExpenses();
  const index = expenses.findIndex(e => e.id === updatedExpense.id);
  if (index === -1) {
    throw new Error('Expense not found');
  }
  expenses[index] = updatedExpense;
  setExpenses(expenses);
  logActivity(`Updated expense ${updatedExpense.id} details`, userEmail);
  return updatedExpense;
};

export const deleteExpense = (
  expenseId: string,
  userEmail: string = 'admin@turf.com'
): void => {
  const expenses = getExpenses();
  const expense = expenses.find(e => e.id === expenseId);
  if (!expense) {
    throw new Error('Expense not found');
  }
  const filtered = expenses.filter(e => e.id !== expenseId);
  setExpenses(filtered);
  logActivity(`Deleted expense of ₹${expense.amount} for "${expense.reason}"`, userEmail);
};
