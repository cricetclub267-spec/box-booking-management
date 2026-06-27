// Database Types for Box Cricket Turf Management System

export type UserRole = 'admin' | 'partner';

export interface User {
  id: string;
  email: string;
  phone: string;
  role: UserRole;
  created_at: string;
}

export interface Ground {
  id: string;
  name: string;
  hourly_rate: number;
  created_at: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  created_at: string;
}

export type BookingStatus = 'Confirmed' | 'Completed' | 'Cancelled';

export interface Booking {
  id: string;
  customer_id: string;
  ground_id: string;
  booking_date: string; // YYYY-MM-DD
  start_time: string;   // HH:MM (e.g. "06:00")
  end_time: string;     // HH:MM (e.g. "07:00")
  amount: number;       // Base amount based on hourly rate
  discount: number;     // Discount amount
  additional_amount?: number; // Additional amount / custom charges
  final_amount: number; // amount - discount + additional_amount
  status: BookingStatus;
  notes?: string;
  created_at: string;
  deleted_at?: string | null; // Soft delete
  
  // Relations (optional joined fields)
  customer?: Customer;
  ground?: Ground;
}

export type PaymentMethod = 'Cash' | 'UPI' | 'Card' | 'Bank Transfer';
export type PaymentStatus = 'Paid' | 'Partial' | 'Pending';

export interface Payment {
  id: string;
  booking_id: string;
  amount_paid: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_date: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  user_email: string;
  created_at: string;
}

export interface Expense {
  id: string;
  user_id?: string | null;
  user_phone: string;
  reason: string;
  amount: number;
  expense_date: string; // YYYY-MM-DD
  created_at: string;
}
