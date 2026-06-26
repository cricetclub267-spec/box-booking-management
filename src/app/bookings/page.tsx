'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/dashboard-layout';
import dynamic from 'next/dynamic';

const DotLottieReact = dynamic(
  () => import('@lottiefiles/dotlottie-react').then((mod) => mod.DotLottieReact),
  { ssr: false }
);
import { 
  getGrounds, 
  getCustomers, 
  getBookings, 
  createBooking, 
  updateBooking, 
  softDeleteBooking,
  addPayment,
  getBookingPaymentSummary,
  createCustomer,
  getBookingStatus
} from '@/lib/db/db-service';
import { Ground, Customer, Booking, BookingStatus, PaymentMethod, PaymentStatus } from '@/lib/db/types';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToastStore } from '@/lib/store/toast-store';
import { sanitizeInput, checkRateLimit } from '@/lib/security';
import { motion, AnimatePresence } from 'framer-motion';
import { hasSupabaseCredentials, supabase } from '@/lib/db/supabase';

import { 
  Plus, 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  Phone, 
  FileText, 
  Tag, 
  Check, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  CalendarDays, 
  Info, 
  Trash2, 
  DollarSign, 
  IndianRupee,
  Activity,
  AlertCircle,
  ChevronDown
} from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuTrigger, 
  DropdownMenuContent, 
  DropdownMenuItem 
} from '@/components/ui/dropdown-menu';

const TIME_SLOTS = [
  '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '24:00'
];

function BookingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const { showToast } = useToastStore();


  // Master Data
  const [grounds, setGrounds] = useState<Ground[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [paymentSummaries, setPaymentSummaries] = useState<Record<string, { totalPaid: number; pendingAmount: number; status: string }>>({});
  const [loading, setLoading] = useState(true);

  // Calendar State
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day');
  const [selectedGroundFilter, setSelectedGroundFilter] = useState<string>('all');
  
  // Modals & Active Selections
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  
  // Payment Form States
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [collectPaymentMode, setCollectPaymentMode] = useState<'UPI' | 'Cash' | 'Split'>('UPI');
  const [collectUpiSplit, setCollectUpiSplit] = useState<string>('0');
  const [collectCashSplit, setCollectCashSplit] = useState<string>('0');

  // Booking Form States
  const [formGroundId, setFormGroundId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('06:00');
  const [formEndTime, setFormEndTime] = useState('07:00');
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formCustName, setFormCustName] = useState('');
  const [formCustPhone, setFormCustPhone] = useState('');
  const [formDiscount, setFormDiscount] = useState<string>('0');
  const [formNotes, setFormNotes] = useState('');
  const [formInitialPayment, setFormInitialPayment] = useState<string>('0');
  const [formInitialPaymentMethod, setFormInitialPaymentMethod] = useState<PaymentMethod>('UPI');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Operating Time Range
  const [opStartHour, setOpStartHour] = useState('06:00');
  const [opEndHour, setOpEndHour] = useState('22:00');

  // Dynamic time slots generation
  const getVisibleTimeSlots = () => {
    const startH = parseInt(opStartHour.split(':')[0]);
    const endH = parseInt(opEndHour.split(':')[0]);
    const slots: string[] = [];
    for (let h = startH; h <= endH; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`);
    }
    return slots;
  };
  const visibleTimeSlots = getVisibleTimeSlots();

  // Onboarding Wizard States
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [paymentMode, setPaymentMode] = useState<'UPI' | 'Cash' | 'Split'>('UPI');
  const [paymentType, setPaymentType] = useState<'Advance' | 'Full' | 'Due'>('Full');
  const [advanceAmount, setAdvanceAmount] = useState<string>('0');
  const [advancePaymentMethod, setAdvancePaymentMethod] = useState<'UPI' | 'Cash'>('UPI');
  const [upiSplitAmount, setUpiSplitAmount] = useState<string>('0');
  const [cashSplitAmount, setCashSplitAmount] = useState<string>('0');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  
  const todayDateObj = new Date();
  const [calendarYear, setCalendarYear] = useState(todayDateObj.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(todayDateObj.getMonth());
  const [bookingSuccessData, setBookingSuccessData] = useState<{
    customerName: string;
    customerPhone: string;
    groundName: string;
    date: string;
    slots: string[];
    totalPaid: number;
    paymentSummary: string;
    bookingIds: string[];
  } | null>(null);

  // Editing Mode
  const [isEditing, setIsEditing] = useState(false);
  const [editBookingId, setEditBookingId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<BookingStatus>('Confirmed');

  // Timezone-safe local date formatting helper
  const getLocalFormattedDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const isSlotInPast = (dateStr: string, slotStart: string): boolean => {
    const todayObj = new Date();
    const todayLocalStr = getLocalFormattedDate(todayObj);
    const todayUtcStr = getFormattedDate(todayObj);
    const isToday = dateStr === todayLocalStr || dateStr === todayUtcStr;
    const isBeforeToday = dateStr < todayLocalStr && dateStr < todayUtcStr;
    
    if (isBeforeToday) return true;
    if (isToday) {
      const currentHour = todayObj.getHours();
      const slotHour = parseInt(slotStart.split(':')[0]);
      return slotHour < currentHour;
    }
    return false;
  };

  // Pricing helper for slot
  const getSlotPrice = (groundId: string, dateStr: string, slot: string): number => {
    if (!dateStr) return 0;
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday, 1-5 = Mon-Fri
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const hour = parseInt(slot.split(':')[0]);
    const isDaytime = hour >= 6 && hour < 18; // 6:00 AM to 6:00 PM
    
    // Check if custom time slot rates are stored in localStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('turf_slot_pricing');
        if (stored) {
          const customRates = JSON.parse(stored);
          if (customRates) {
            const rules = customRates[groundId] || Object.values(customRates)[0];
            if (rules) {
              if (isWeekend) {
                return isDaytime ? (Number(rules.weekend_daytime) || 700) : (Number(rules.weekend_nighttime) || 1200);
              } else {
                return isDaytime ? (Number(rules.weekday_daytime) || 600) : (Number(rules.weekday_nighttime) || 1000);
              }
            }
          }
        }
      } catch (e) {
        console.error('Error reading custom slot rates:', e);
      }
    }
    
    // Fallbacks
    if (isWeekend) {
      return isDaytime ? 700 : 1200;
    } else {
      return isDaytime ? 600 : 1000;
    }
  };

  // Convert slot to 12-hour AM/PM display string
  const formatSlotDisplay = (slot: string): string => {
    const hour = parseInt(slot.split(':')[0]);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    
    const endHour = hour + 1;
    const endAmpm = endHour >= 12 ? (endHour >= 24 ? 'AM' : 'PM') : 'AM';
    const displayEndHour = endHour % 12 === 0 ? 12 : endHour % 12;
    
    return `${displayHour} ${ampm} - ${displayEndHour} ${endAmpm}`;
  };

  // Single slot formatted AM/PM (e.g. 7 PM)
  const formatSingleHourAMPM = (slot: string): string => {
    const hour = parseInt(slot.split(':')[0]);
    if (hour === 0 || hour === 24) return '12 AM';
    if (hour === 12) return '12 PM';
    const ampm = hour >= 12 && hour < 24 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour} ${ampm}`;
  };

  // Format start and end time range in 12-hour format
  const formatTimeRangeAMPM = (start: string, end: string): string => {
    return `${formatSingleHourAMPM(start)} - ${formatSingleHourAMPM(end)}`;
  };

  // Convert slot to 12-hour AM/PM format (e.g. 06:00 PM)
  const formatSlotTimeOnly = (slot: string): string => {
    const hour = parseInt(slot.split(':')[0]);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour.toString().padStart(2, '0')}:00 ${ampm}`;
  };

  // Format date for summary (e.g. Thursday, June 12)
  const formatSummaryDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    return dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  // Get formatted summary of selected slots
  const getSelectedSlotsSummary = () => {
    if (selectedSlots.length === 0) return '';
    const groups = groupSlots(selectedSlots);
    return groups.map(g => formatTimeRangeAMPM(g.startTime, g.endTime)).join(', ');
  };


  // Calendar Days Calculation for Step 2
  const renderWizardCalendar = () => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    // First day of current month
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    
    const blanks = Array.from({ length: firstDayIndex }, (_, i) => (
      <div key={`blank-${i}`} className="p-2"></div>
    ));
    
    const dayButtons = [];
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const maxDate = new Date(today);
    maxDate.setMonth(today.getMonth() + 6);
    maxDate.setHours(23,59,59,999);
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dDate = new Date(calendarYear, calendarMonth, d);
      const dateStr = getLocalFormattedDate(dDate);
      const isSelected = formDate === dateStr;
      const isToday = dDate.toDateString() === today.toDateString();
      const isDisabled = dDate < today || dDate > maxDate;
      
      dayButtons.push(
        <button
          key={`day-${d}`}
          type="button"
          disabled={isDisabled}
          onClick={() => {
            setFormDate(dateStr);
            setFormError(null);
            setSelectedSlots([]);
          }}
          className={`h-9 w-9 mx-auto rounded-lg text-xs font-bold flex items-center justify-center transition-all ${
            isDisabled
              ? 'text-emerald-950/30 cursor-not-allowed bg-transparent'
              : isSelected
                ? 'bg-white text-[#0c4a28] scale-110 shadow-md shadow-emerald-500/10 font-extrabold'
                : isToday
                  ? 'border border-emerald-500 text-emerald-400 font-extrabold hover:bg-emerald-900/30'
                  : 'text-emerald-100 hover:bg-emerald-900/40 bg-emerald-950/20'
          }`}
        >
          {d}
        </button>
      );
    }
    
    const totalCells = [...blanks, ...dayButtons];
    
    // Navigation states
    const disablePrev = calendarYear === today.getFullYear() && calendarMonth === today.getMonth();
    
    const maxYear = maxDate.getFullYear();
    const maxMonth = maxDate.getMonth();
    const disableNext = calendarYear === maxYear && calendarMonth === maxMonth;
    
    return (
      <div className="space-y-4">
        {/* Month Navigation */}
        <div className="flex items-center justify-between">
          <span className="font-extrabold text-sm text-white">
            {months[calendarMonth]} {calendarYear}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={disablePrev}
              onClick={() => {
                if (calendarMonth === 0) {
                  setCalendarMonth(11);
                  setCalendarYear(calendarYear - 1);
                } else {
                  setCalendarMonth(calendarMonth - 1);
                }
              }}
              className="p-1.5 rounded-lg border border-emerald-900/60 bg-emerald-950/40 text-emerald-400 hover:text-emerald-300 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={disableNext}
              onClick={() => {
                if (calendarMonth === 11) {
                  setCalendarMonth(0);
                  setCalendarYear(calendarYear + 1);
                } else {
                  setCalendarMonth(calendarMonth + 1);
                }
              }}
              className="p-1.5 rounded-lg border border-emerald-900/60 bg-emerald-950/40 text-emerald-400 hover:text-emerald-300 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        {/* Days of Week Header */}
        <div className="grid grid-cols-7 text-center text-[10px] font-extrabold text-emerald-500/70 tracking-wider uppercase">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>
        
        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-y-2 text-center">
          {totalCells}
        </div>
      </div>
    );
  };


  // Check if slot is already booked for date and ground
  const isSlotBooked = (groundId: string, dateStr: string, slotStart: string) => {
    const [hour] = slotStart.split(':').map(Number);
    const nextHourStr = `${(hour + 1).toString().padStart(2, '0')}:00`;
    const slotEnd = nextHourStr;
    
    const reqStart = normalizeTime(slotStart);
    const reqEnd = normalizeTime(slotEnd);
    
    return bookings.some(b => 
      b.ground_id === groundId && 
      b.booking_date === dateStr && 
      b.status !== 'Cancelled' && 
      b.id !== editBookingId &&
      reqStart < normalizeTime(b.end_time) && 
      reqEnd > normalizeTime(b.start_time)
    );
  };

  // Group sorted selected slots into contiguous time groups
  const groupSlots = (slots: string[]): { startTime: string; endTime: string; hours: number }[] => {
    if (slots.length === 0) return [];
    const sorted = [...slots].sort();
    const groups: { startTime: string; endTime: string; hours: number }[] = [];
    
    let currentGroup: string[] = [sorted[0]];
    
    for (let i = 1; i < sorted.length; i++) {
      const prevHour = parseInt(sorted[i - 1].split(':')[0]);
      const currHour = parseInt(sorted[i].split(':')[0]);
      
      if (currHour === prevHour + 1) {
        currentGroup.push(sorted[i]);
      } else {
        const start = currentGroup[0];
        const last = currentGroup[currentGroup.length - 1];
        const endHour = parseInt(last.split(':')[0]) + 1;
        const end = `${endHour.toString().padStart(2, '0')}:00`;
        groups.push({ startTime: start, endTime: end, hours: currentGroup.length });
        currentGroup = [sorted[i]];
      }
    }
    
    const start = currentGroup[0];
    const last = currentGroup[currentGroup.length - 1];
    const endHour = parseInt(last.split(':')[0]) + 1;
    const end = `${endHour.toString().padStart(2, '0')}:00`;
    groups.push({ startTime: start, endTime: end, hours: currentGroup.length });
    
    return groups;
  };

  // Helper to expand range to 1-hour slot list
  const expandBookingToSlots = (start: string, end: string): string[] => {
    const startHour = parseInt(start.split(':')[0]);
    const endHour = parseInt(end.split(':')[0]);
    const slots: string[] = [];
    for (let h = startHour; h < endHour; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`);
    }
    return slots;
  };

  // Helpers to calculate prices
  const calculateTotalPrice = () => {
    return selectedSlots.reduce((sum, slot) => sum + getSlotPrice(formGroundId, formDate, slot), 0);
  };

  const calculateFinalAmount = () => {
    const total = calculateTotalPrice();
    const discount = Number(formDiscount) || 0;
    return Math.max(0, total - discount);
  };

  // Handles split payment input sync
  const handleUpiSplitChange = (val: string) => {
    const numVal = Number(val) || 0;
    const total = calculateFinalAmount();
    if (numVal > total) {
      setUpiSplitAmount(total.toString());
      setCashSplitAmount('0');
    } else {
      setUpiSplitAmount(val);
      setCashSplitAmount((total - numVal).toString());
    }
  };

  const handleCashSplitChange = (val: string) => {
    const numVal = Number(val) || 0;
    const total = calculateFinalAmount();
    if (numVal > total) {
      setCashSplitAmount(total.toString());
      setUpiSplitAmount('0');
    } else {
      setCashSplitAmount(val);
      setUpiSplitAmount((total - numVal).toString());
    }
  };

  // Load everything
  const loadAllData = async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      if (typeof window !== 'undefined') {
        const storedStart = localStorage.getItem('turf_operating_start');
        const storedEnd = localStorage.getItem('turf_operating_end');
        if (storedStart) setOpStartHour(storedStart);
        if (storedEnd) setOpEndHour(storedEnd);
      }
      
      const g = await getGrounds();
      const c = await getCustomers();
      const b = await getBookings();
      setGrounds(g);
      setCustomers(c);
      setBookings(b);

      // Fetch payment summaries
      const summaries: Record<string, { totalPaid: number; pendingAmount: number; status: string }> = {};
      for (const booking of b) {
        summaries[booking.id] = await getBookingPaymentSummary(booking.id);
      }
      setPaymentSummaries(summaries);

      // Prepopulate form ground if grounds exist
      if (g.length > 0 && !formGroundId) {
        setFormGroundId(g[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();

    // 1. Tab visibility/focus listener
    const handleFocus = () => {
      loadAllData(true);
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    // 2. Realtime listener (if Supabase is active)
    let channel: any = null;
    if (hasSupabaseCredentials() && supabase) {
      channel = supabase
        .channel('bookings-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings' },
          () => {
            loadAllData(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'payments' },
          () => {
            loadAllData(true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'customers' },
          () => {
            loadAllData(true);
          }
        )
        .subscribe();
    }

    // 3. Fallback polling (every 10 seconds)
    const interval = setInterval(() => {
      loadAllData(true);
    }, 10000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      clearInterval(interval);
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  // Handle auto-opening of booking via URL params
  useEffect(() => {
    const bookingIdParam = searchParams.get('id');
    if (bookingIdParam && bookings.length > 0) {
      const found = bookings.find(b => b.id === bookingIdParam);
      if (found) {
        setSelectedBooking(found);
      }
      // Remove query param to clean URL
      router.replace('/bookings');
    }
  }, [searchParams, bookings, router]);

  // Helper to normalize time format to HH:MM
  const normalizeTime = (t: string): string => {
    if (!t) return '';
    return t.substring(0, 5);
  };

  // Format Date helpers
  const getFormattedDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const handlePrevDate = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') newDate.setDate(currentDate.getDate() - 1);
    else if (viewMode === 'week') newDate.setDate(currentDate.getDate() - 7);
    else if (viewMode === 'month') newDate.setMonth(currentDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  const handleNextDate = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') newDate.setDate(currentDate.getDate() + 1);
    else if (viewMode === 'week') newDate.setDate(currentDate.getDate() + 7);
    else if (viewMode === 'month') newDate.setMonth(currentDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Create or Update Booking submit
  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Rate Limiting Check
    const rateCheck = checkRateLimit('booking_submit', 5, 10000, 5000);
    if (!rateCheck.allowed) {
      const errMsg = `Too many booking actions. Please wait ${rateCheck.retryAfterSeconds} seconds.`;
      setFormError(errMsg);
      showToast(errMsg, 'error');
      return;
    }

    // Validations
    if (!formGroundId || !formDate || selectedSlots.length === 0) {
      const errMsg = 'Please select customer, date, turf box, and at least one time slot';
      setFormError(errMsg);
      showToast(errMsg, 'error');
      return;
    }

    // Sanitize input fields to prevent XSS
    const sanitizedCustName = sanitizeInput(formCustName.trim());
    const sanitizedNotes = sanitizeInput(formNotes.trim());

    // Customer resolution
    let finalCustId = formCustomerId;
    if (!finalCustId) {
      if (!sanitizedCustName || !formCustPhone.trim()) {
        const errMsg = 'Please select a customer or provide name and phone for a new customer';
        setFormError(errMsg);
        showToast(errMsg, 'error');
        return;
      }
      if (!formCustPhone.match(/^\d{10}$/)) {
        const errMsg = 'Mobile number must be exactly 10 digits';
        setFormError(errMsg);
        showToast(errMsg, 'error');
        return;
      }
      setFormSubmitting(true);
      try {
        const newCust = await createCustomer(sanitizedCustName, formCustPhone.trim());
        finalCustId = newCust.id;
      } catch (err: any) {
        const errMsg = err.message || 'Failed to auto-create customer';
        setFormError(errMsg);
        showToast(errMsg, 'error');
        setFormSubmitting(false);
        return;
      }
    }
    // Validate advance amount if paymentType is Advance
    if (paymentType === 'Advance') {
      const adv = Number(advanceAmount) || 0;
      const finalAmt = calculateFinalAmount();
      if (adv <= 0) {
        setFormError('Advance amount must be greater than 0');
        showToast('Advance amount must be greater than 0', 'error');
        return;
      }
      if (adv >= finalAmt) {
        setFormError('Advance amount must be less than the total final amount. Choose "Full" payment type for full payments.');
        showToast('Advance amount must be less than the total final amount', 'error');
        return;
      }
    }

    setFormSubmitting(true);

    try {
      const calculatedAmount = calculateTotalPrice();
      const calculatedFinalAmount = calculateFinalAmount();
      const discountVal = Number(formDiscount) || 0;

      const groundObj = grounds.find(g => g.id === formGroundId);
      const groundName = groundObj ? groundObj.name : 'Selected Turf';
      const custObj = customers.find(c => c.id === finalCustId) || { name: sanitizedCustName, phone: formCustPhone };

      if (isEditing && editBookingId) {
        // Edit mode: update single booking with min start and max end of selected slots
        const sorted = [...selectedSlots].sort();
        const minStart = sorted[0];
        const maxStart = sorted[sorted.length - 1];
        const maxHour = parseInt(maxStart.split(':')[0]) + 1;
        const maxEnd = `${maxHour.toString().padStart(2, '0')}:00`;

        const bookingPayload = {
          id: editBookingId,
          customer_id: finalCustId,
          ground_id: formGroundId,
          booking_date: formDate,
          start_time: minStart,
          end_time: maxEnd,
          amount: calculatedAmount,
          discount: discountVal,
          final_amount: calculatedFinalAmount,
          status: editStatus,
          notes: sanitizedNotes,
          created_at: bookings.find(b => b.id === editBookingId)?.created_at || new Date().toISOString()
        };

        await updateBooking(bookingPayload, user?.email);
        
        // Show success screen details
        setBookingSuccessData({
          customerName: custObj.name,
          customerPhone: custObj.phone,
          groundName: groundName,
          date: formDate,
          slots: selectedSlots,
          totalPaid: calculatedFinalAmount,
          paymentSummary: 'Updated booking details (no new payment recorded)',
          bookingIds: [editBookingId]
        });
        
        showToast('Booking updated successfully!', 'success');
        setWizardStep(6); // Success step
      } else {
        // Create mode: group contiguous slots
        const groups = groupSlots(selectedSlots);
        const createdBookingIds: string[] = [];

        // Save bookings
        const bookingsToCreate = groups.map(group => {
          const slotList: string[] = [];
          const startHour = parseInt(group.startTime.split(':')[0]);
          const endHour = parseInt(group.endTime.split(':')[0]);
          for (let h = startHour; h < endHour; h++) {
            slotList.push(`${h.toString().padStart(2, '0')}:00`);
          }
          const groupBaseAmount = slotList.reduce((sum, s) => sum + getSlotPrice(formGroundId, formDate, s), 0);
          const shareOfDiscount = Math.round((groupBaseAmount / calculatedAmount) * discountVal);
          const finalAmount = Math.max(0, groupBaseAmount - shareOfDiscount);

          return {
            customer_id: finalCustId,
            ground_id: formGroundId,
            booking_date: formDate,
            start_time: group.startTime,
            end_time: group.endTime,
            amount: groupBaseAmount,
            discount: shareOfDiscount,
            final_amount: finalAmount,
            status: 'Confirmed' as BookingStatus,
            notes: sanitizedNotes
          };
        });

        // Loop to insert bookings
        const createdBookings: Booking[] = [];
        for (const bPayload of bookingsToCreate) {
          const newB = await createBooking(bPayload, user?.email);
          createdBookings.push(newB);
          createdBookingIds.push(newB.id);
        }

        // Add Payments
        let paymentSummaryText = '';
        let totalPaidVal = 0;

        if (paymentType === 'Full') {
          if (paymentMode === 'Split') {
            const upiVal = Number(upiSplitAmount) || 0;
            const cashVal = Number(cashSplitAmount) || 0;
            totalPaidVal = upiVal + cashVal;

            let upiRemaining = upiVal;
            let cashRemaining = cashVal;

            for (const newB of createdBookings) {
              const bFinalAmount = newB.final_amount;
              const bPaidUpi = Math.min(upiRemaining, bFinalAmount);
              upiRemaining -= bPaidUpi;

              const bPaidCash = Math.min(cashRemaining, bFinalAmount - bPaidUpi);
              cashRemaining -= bPaidCash;

              if (bPaidUpi > 0) {
                await addPayment({
                  booking_id: newB.id,
                  amount_paid: bPaidUpi,
                  payment_method: 'UPI',
                  payment_status: (bPaidUpi + bPaidCash) >= bFinalAmount ? 'Paid' : 'Partial'
                }, user?.email);
              }
              if (bPaidCash > 0) {
                await addPayment({
                  booking_id: newB.id,
                  amount_paid: bPaidCash,
                  payment_method: 'Cash',
                  payment_status: (bPaidUpi + bPaidCash) >= bFinalAmount ? 'Paid' : 'Partial'
                }, user?.email);
              }
            }
            paymentSummaryText = `Full (Split): ₹${upiVal} via UPI, ₹${cashVal} via Cash`;
          } else {
            // Single payment mode (UPI or Cash)
            totalPaidVal = calculatedFinalAmount;
            let remainingPayment = calculatedFinalAmount;
            const method = paymentMode === 'Cash' ? 'Cash' : 'UPI';

            for (const newB of createdBookings) {
              const bFinalAmount = newB.final_amount;
              const bPaid = Math.min(remainingPayment, bFinalAmount);
              remainingPayment -= bPaid;

              if (bPaid > 0) {
                await addPayment({
                  booking_id: newB.id,
                  amount_paid: bPaid,
                  payment_method: method,
                  payment_status: bPaid >= bFinalAmount ? 'Paid' : 'Partial'
                }, user?.email);
              }
            }
            paymentSummaryText = `Full: ${method} (₹${totalPaidVal})`;
          }
        } else if (paymentType === 'Advance') {
          const advVal = Number(advanceAmount) || 0;
          totalPaidVal = advVal;
          let remainingPayment = advVal;

          for (const newB of createdBookings) {
            const bFinalAmount = newB.final_amount;
            const bPaid = Math.min(remainingPayment, bFinalAmount);
            remainingPayment -= bPaid;

            if (bPaid > 0) {
              await addPayment({
                booking_id: newB.id,
                amount_paid: bPaid,
                payment_method: advancePaymentMethod,
                payment_status: bPaid >= bFinalAmount ? 'Paid' : 'Partial'
              }, user?.email);
            }
          }
          const outstandingDue = calculatedFinalAmount - advVal;
          paymentSummaryText = `Advance: ${advancePaymentMethod} (₹${advVal}), Due: ₹${outstandingDue}`;
        } else {
          // Due payment type (no payment recorded)
          totalPaidVal = 0;
          paymentSummaryText = `Due (₹${calculatedFinalAmount})`;
        }

        await loadAllData(true);
        setBookingSuccessData({
          customerName: custObj.name,
          customerPhone: custObj.phone,
          groundName: groundName,
          date: formDate,
          slots: selectedSlots,
          totalPaid: totalPaidVal,
          paymentSummary: paymentSummaryText,
          bookingIds: createdBookingIds
        });
        setWizardStep(6);
        showToast('Booking created successfully!', 'success');
      }
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'Failed to create booking');
      showToast(err.message || 'Failed to create booking', 'error');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Reset Form
  const resetBookingForm = () => {
    setFormGroundId(grounds[0]?.id || '');
    setFormDate(getFormattedDate(new Date()));
    setSelectedSlots([]);
    setFormCustName('');
    setFormCustPhone('');
    setFormCustomerId('');
    setFormDiscount('0');
    setFormNotes('');
    setPaymentMode('UPI');
    setPaymentAmount('');
    setUpiSplitAmount('0');
    setCashSplitAmount('0');
    setPaymentType('Full');
    setAdvanceAmount('0');
    setAdvancePaymentMethod('UPI');
    setCustomerSearchQuery('');
    setBookingSuccessData(null);
    setFormError(null);
    setWizardStep(1);
    setIsEditing(false);
    setEditBookingId(null);
    
    const today = new Date();
    setCalendarYear(today.getFullYear());
    setCalendarMonth(today.getMonth());
  };

  // Open booking edit
  const handleOpenEdit = (booking: Booking) => {
    setIsEditing(true);
    setEditBookingId(booking.id);
    setFormGroundId(booking.ground_id);
    setFormDate(booking.booking_date);
    setFormCustomerId(booking.customer_id);
    setFormCustName(booking.customer?.name || '');
    setFormCustPhone(booking.customer?.phone || '');
    
    const slots = expandBookingToSlots(booking.start_time, booking.end_time);
    setSelectedSlots(slots);
    
    setFormDiscount(booking.discount.toString());
    setFormNotes(booking.notes || '');
    setEditStatus(booking.status);
    
    setWizardStep(1); // Start customer registration, prefilling slot/date
    setSelectedBooking(null); // Close detail modal
    setShowAddModal(true);
  };

  // Soft delete booking
  const handleDeleteBooking = async (bookingId: string) => {
    if (!window.confirm('Are you sure you want to cancel this booking? This is a soft-delete.')) return;
    try {
      await softDeleteBooking(bookingId, user?.email);
      setSelectedBooking(null);
      await loadAllData(true);
      showToast('Booking cancelled successfully', 'success');
    } catch (err: any) {
      const errMsg = err.message || 'Failed to cancel booking';
      showToast(errMsg, 'error');
    }
  };

  // Helper handlers for split inputs change in Log Payment modal
  const handleCollectUpiChange = (val: string) => {
    const total = Number(paymentAmount) || 0;
    const numVal = Number(val) || 0;
    if (numVal > total) {
      setCollectUpiSplit(total.toString());
      setCollectCashSplit('0');
    } else {
      setCollectUpiSplit(val);
      setCollectCashSplit((total - numVal).toString());
    }
  };

  const handleCollectCashChange = (val: string) => {
    const total = Number(paymentAmount) || 0;
    const numVal = Number(val) || 0;
    if (numVal > total) {
      setCollectCashSplit(total.toString());
      setCollectUpiSplit('0');
    } else {
      setCollectCashSplit(val);
      setCollectUpiSplit((total - numVal).toString());
    }
  };

  const handleCollectTotalChange = (val: string) => {
    setPaymentAmount(val);
    const total = Number(val) || 0;
    if (collectPaymentMode === 'Split') {
      setCollectUpiSplit(Math.round(total / 2).toString());
      setCollectCashSplit((total - Math.round(total / 2)).toString());
    }
  };

  // Add payment action
  const handleLogPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentError(null);
    if (!selectedBooking) return;

    // Rate Limiting Check
    const rateCheck = checkRateLimit('payment_submit', 5, 10000, 5000);
    if (!rateCheck.allowed) {
      const errMsg = `Too many payment actions. Please wait ${rateCheck.retryAfterSeconds} seconds.`;
      setPaymentError(errMsg);
      showToast(errMsg, 'error');
      return;
    }

    const outstanding = (paymentSummaries[selectedBooking.id]?.pendingAmount || 0);

    try {
      if (collectPaymentMode === 'Split') {
        const upiVal = Number(collectUpiSplit) || 0;
        const cashVal = Number(collectCashSplit) || 0;
        const total = upiVal + cashVal;

        if (total <= 0) {
          throw new Error('Total payment amount must be greater than 0');
        }
        if (total > outstanding) {
          throw new Error(`Total payment amount (₹${total}) exceeds outstanding balance (₹${outstanding})`);
        }

        // Add separate payments for UPI and Cash
        if (upiVal > 0) {
          await addPayment({
            booking_id: selectedBooking.id,
            amount_paid: upiVal,
            payment_method: 'UPI',
            payment_status: total >= outstanding ? 'Paid' : 'Partial'
          }, user?.email);
        }

        if (cashVal > 0) {
          await addPayment({
            booking_id: selectedBooking.id,
            amount_paid: cashVal,
            payment_method: 'Cash',
            payment_status: total >= outstanding ? 'Paid' : 'Partial'
          }, user?.email);
        }

        showToast(`Logged split payment of ₹${total} (UPI: ₹${upiVal}, Cash: ₹${cashVal}) successfully!`, 'success');

      } else {
        const amt = Number(paymentAmount) || 0;
        if (amt <= 0) {
          throw new Error('Payment amount must be greater than 0');
        }
        if (amt > outstanding) {
          throw new Error(`Payment amount (₹${amt}) exceeds outstanding balance (₹${outstanding})`);
        }

        await addPayment({
          booking_id: selectedBooking.id,
          amount_paid: amt,
          payment_method: collectPaymentMode,
          payment_status: amt >= outstanding ? 'Paid' : 'Partial'
        }, user?.email);

        showToast(`Logged payment of ₹${amt} via ${collectPaymentMode} successfully!`, 'success');
      }

      setPaymentAmount('');
      setShowPaymentModal(false);
      
      // Reload booking detail and all data
      await loadAllData(true);
      const refreshedBookings = await getBookings();
      setBookings(refreshedBookings);
      const updatedB = refreshedBookings.find(b => b.id === selectedBooking.id);
      if (updatedB) setSelectedBooking(updatedB);

    } catch (err: any) {
      const errMsg = err.message || 'Failed to log payment';
      setPaymentError(errMsg);
      showToast(errMsg, 'error');
    }
  };

  // Quick select time slots from cell click
  const handleCellClick = (groundId: string, date: string, hourSlot: string) => {
    if (user?.role === 'partner') return; // Read-only
    resetBookingForm();
    setFormGroundId(groundId);
    setFormDate(date);
    setSelectedSlots([hourSlot]);
    setWizardStep(1); // Start customer registration, prefilling slot/date
    setShowAddModal(true);
  };

  // Helper: Find booking for date, ground, and slot
  const getBookingForSlot = (groundId: string, date: string, slotTime: string) => {
    const normSlot = normalizeTime(slotTime);
    return bookings.find(b => 
      b.ground_id === groundId && 
      b.booking_date === date && 
      b.status !== 'Cancelled' && 
      normSlot >= normalizeTime(b.start_time) && 
      normSlot < normalizeTime(b.end_time)
    );
  };

  // Day View Render
  const renderDayView = () => {
    const dateStr = getFormattedDate(currentDate);
    const activeGrounds = selectedGroundFilter === 'all' 
      ? grounds 
      : grounds.filter(g => g.id === selectedGroundFilter);

    return (
      <div className="w-full overflow-x-auto rounded-2xl border border-border/85 bg-card shadow-sm text-left">
        <div className="min-w-max">
          {/* Header Row */}
          <div 
            className="grid bg-muted/20 border-b border-border/80 text-[10px] font-bold text-muted-foreground uppercase tracking-widest"
            style={{ gridTemplateColumns: `100px repeat(${activeGrounds.length}, 140px)` }}
          >
            <div className="p-4 border-r border-border/80">Time</div>
            {activeGrounds.map(g => (
              <div key={g.id} className="p-4 text-center border-r border-border/80 last:border-r-0 font-bold">
                {g.name} <span className="text-primary text-[9px] lowercase bg-accent px-1.5 py-0.5 rounded-md ml-1">₹{g.hourly_rate}/hr</span>
              </div>
            ))}
          </div>

          {/* Time Slots Grid */}
          <div className="divide-y divide-border/60">
            {visibleTimeSlots.slice(0, -1).map((slot, index) => {
              return (
                <div 
                  key={slot} 
                  className="grid min-h-[140px] group"
                  style={{ gridTemplateColumns: `100px repeat(${activeGrounds.length}, 140px)` }}
                >
                  {/* Time Label */}
                  <div className="py-4 px-5 border-r border-border/80 flex items-center text-xs font-semibold text-muted-foreground bg-muted/5">
                    {formatSingleHourAMPM(slot)}
                  </div>
                  
                  {/* Grounds Grid Cells */}
                  {activeGrounds.map(ground => {
                    const booking = getBookingForSlot(ground.id, dateStr, slot);
                    const isStart = booking && normalizeTime(booking.start_time) === normalizeTime(slot);
                    const isPast = isSlotInPast(dateStr, slot);

                    let cardClass = '';
                    let dotClass = '';
                    let derivedStatus = 'Booked';

                    if (booking) {
                      derivedStatus = getBookingStatus(booking);
                      if (derivedStatus === 'Completed') {
                        cardClass = 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:border-emerald-300';
                        dotClass = 'bg-emerald-600';
                      } else if (derivedStatus === 'Running') {
                        cardClass = 'bg-amber-50 text-amber-800 border-amber-200 hover:border-amber-300 animate-pulse';
                        dotClass = 'bg-amber-600';
                      } else if (derivedStatus === 'Cancelled') {
                        cardClass = 'bg-red-50 text-red-800 border-red-200 hover:border-red-300';
                        dotClass = 'bg-red-600';
                      } else {
                        cardClass = 'bg-blue-50 text-blue-800 border-blue-200 hover:border-blue-300';
                        dotClass = 'bg-blue-600';
                      }
                    }

                    return (
                      <div 
                        key={ground.id} 
                        onClick={() => !booking && !isPast && handleCellClick(ground.id, dateStr, slot)}
                        className={`p-1.5 border-r border-border/80 last:border-r-0 flex flex-col relative transition-all duration-150 ${
                          booking 
                            ? 'cursor-default' 
                            : isPast 
                              ? 'cursor-not-allowed bg-muted/20 opacity-60' 
                              : 'cursor-pointer hover:bg-accent/40 bg-card'
                        }`}
                      >
                        {booking ? (
                          isStart ? (
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBooking(booking);
                              }}
                              className={`absolute inset-x-1.5 top-1.5 bottom-1.5 rounded-xl border p-3 flex flex-col justify-between shadow-sm cursor-pointer hover:scale-[1.01] transition-transform z-10 text-left ${cardClass}`}
                              style={{ 
                                // Dynamic height calculations for slot stretching
                                height: `calc(${
                                  (parseInt(booking.end_time.split(':')[0]) - parseInt(booking.start_time.split(':')[0])) * 140
                                }px - 12px)`
                              }}
                            >
                              <div className="min-w-0">
                                <p className="font-bold text-xs truncate flex items-center gap-1.5 leading-tight">
                                  <span className={`h-1.5 w-1.5 rounded-full ${dotClass} ${derivedStatus === 'Running' ? 'animate-pulse' : ''}`}></span>
                                  {booking.customer?.name}
                                </p>
                                <p className="text-[10px] opacity-75 font-semibold mt-0.5">{formatTimeRangeAMPM(booking.start_time, booking.end_time)}</p>
                              </div>
                              <div className="flex items-center justify-between text-[9px] opacity-80 font-bold border-t border-current/10 pt-1 mt-1">
                                <span>₹{booking.final_amount}</span>
                                <span className="uppercase flex items-center gap-1">
                                  {derivedStatus === 'Running' && (
                                    <span className="h-1 w-1 rounded-full bg-amber-600 animate-ping"></span>
                                  )}
                                  {derivedStatus}
                                </span>
                              </div>
                            </div>
                          ) : null
                        ) : isPast ? (
                          <div className="h-full w-full flex items-center justify-center text-[10px] font-bold text-muted-foreground/40 select-none">
                            Past Slot
                          </div>
                        ) : (
                          <div className="h-full w-full flex items-center justify-center opacity-0 group-hover:opacity-100 text-[10px] font-bold text-primary transition-opacity gap-1">
                            <Plus className="h-3 w-3" /> Book slot
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Week View Render
  const renderWeekView = () => {
    // Generate dates of current week
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    startOfWeek.setDate(diff);

    const weekDates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      weekDates.push(d);
    }

    const groundId = selectedGroundFilter === 'all' ? (grounds[0]?.id || '') : selectedGroundFilter;
    const groundName = grounds.find(g => g.id === groundId)?.name || 'Ground';

    return (
      <div className="w-full overflow-x-auto rounded-2xl border border-border/85 bg-card shadow-sm text-left">
        <div className="min-w-max">
          <div className="bg-muted/10 p-3.5 border-b border-border text-center text-xs font-bold text-primary bg-accent/20">
            Showing schedule for <span className="font-extrabold">{groundName}</span>
          </div>
          <div 
            className="grid bg-muted/20 border-b border-border/80 text-[9px] font-bold text-muted-foreground uppercase tracking-widest text-center"
            style={{ gridTemplateColumns: `80px repeat(7, 140px)` }}
          >
            <div className="p-3 border-r border-border/80">Time</div>
            {weekDates.map(date => {
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <div key={date.toISOString()} className={`p-3 text-center border-r border-border/80 last:border-r-0 ${isToday ? 'bg-primary/5 text-primary font-extrabold' : ''}`}>
                  <p>{date.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                  <p className="text-xs font-bold mt-0.5">{date.getDate()}</p>
                </div>
              );
            })}
          </div>

          <div className="divide-y divide-border/60">
            {visibleTimeSlots.slice(0, -1).map((slot) => (
              <div 
                key={slot} 
                className="grid min-h-[140px] group"
                style={{ gridTemplateColumns: `80px repeat(7, 140px)` }}
              >
                <div className="py-3 px-4 border-r border-border/80 flex items-center text-xs font-semibold text-muted-foreground bg-muted/5">
                  {formatSingleHourAMPM(slot)}
                </div>
                {weekDates.map(date => {
                  const dateStr = getFormattedDate(date);
                  const booking = getBookingForSlot(groundId, dateStr, slot);
                  const isStart = booking && normalizeTime(booking.start_time) === normalizeTime(slot);
                  const isPast = isSlotInPast(dateStr, slot);

                  let cardClass = '';
                  let derivedStatus = 'Booked';

                  if (booking) {
                    derivedStatus = getBookingStatus(booking);
                    if (derivedStatus === 'Completed') {
                      cardClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                    } else if (derivedStatus === 'Running') {
                      cardClass = 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse';
                    } else if (derivedStatus === 'Cancelled') {
                      cardClass = 'bg-red-50 text-red-800 border-red-200';
                    } else {
                      cardClass = 'bg-blue-50 text-blue-800 border-blue-200';
                    }
                  }

                  return (
                    <div 
                      key={dateStr}
                      onClick={() => !booking && !isPast && handleCellClick(groundId, dateStr, slot)}
                      className={`p-1 border-r border-border/80 last:border-r-0 relative ${
                        booking 
                          ? '' 
                          : isPast 
                            ? 'cursor-not-allowed bg-muted/20 opacity-60' 
                            : 'cursor-pointer hover:bg-accent/40 bg-card'
                      }`}
                    >
                      {booking ? (
                        isStart ? (
                          <div 
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedBooking(booking);
                            }}
                            className={`absolute inset-1 rounded-lg border p-2.5 flex flex-col justify-between shadow-sm cursor-pointer text-left overflow-hidden ${cardClass}`}
                            style={{ 
                              height: `calc(${
                                (parseInt(booking.end_time.split(':')[0]) - parseInt(booking.start_time.split(':')[0])) * 140
                              }px - 8px)`,
                              zIndex: 10
                            }}
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-[10px] truncate leading-tight">{booking.customer?.name}</p>
                              <p className="text-[8px] opacity-75 font-semibold leading-none mt-1">{formatSingleHourAMPM(booking.start_time)}</p>
                            </div>
                            <div className="flex items-center justify-between text-[8px] opacity-80 font-bold border-t border-current/10 pt-1 mt-1">
                              <span>₹{booking.final_amount}</span>
                            </div>
                          </div>
                        ) : null
                      ) : isPast ? (
                        <div className="h-full w-full flex items-center justify-center text-[10px] font-bold text-muted-foreground/30 text-center select-none py-4">
                          Past
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Month View Render
  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: (Date | null)[] = [];
    // Pad previous month days
    const prevDaysCount = firstDayIndex === 0 ? 6 : firstDayIndex - 1; // Align to Mon
    for (let i = 0; i < prevDaysCount; i++) {
      days.push(null);
    }
    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(year, month, i));
    }

    const getBookingsCountForDate = (dateStr: string) => {
      return bookings.filter(b => b.booking_date === dateStr && b.status !== 'Cancelled').length;
    };

    return (
      <div className="border border-border/85 rounded-2xl bg-card overflow-hidden shadow-sm text-left">
        <div className="grid grid-cols-7 bg-muted/20 border-b border-border/80 text-[10px] font-bold text-muted-foreground uppercase tracking-widest text-center">
          <div className="p-3">Mon</div>
          <div className="p-3">Tue</div>
          <div className="p-3">Wed</div>
          <div className="p-3">Thu</div>
          <div className="p-3">Fri</div>
          <div className="p-3">Sat</div>
          <div className="p-3">Sun</div>
        </div>

        <div className="grid grid-cols-7 divide-y divide-x divide-border/60">
          {days.map((date, idx) => {
            if (!date) return <div key={`empty-${idx}`} className="bg-muted/10 min-h-[96px]"></div>;
            
            const dateStr = getFormattedDate(date);
            const count = getBookingsCountForDate(dateStr);
            const isToday = date.toDateString() === new Date().toDateString();

            return (
              <div 
                key={dateStr}
                onClick={() => {
                  setCurrentDate(date);
                  setViewMode('day');
                }}
                className={`p-3 min-h-[96px] bg-card hover:bg-accent/25 transition-colors cursor-pointer flex flex-col justify-between text-left ${
                  isToday ? 'bg-primary/5' : ''
                }`}
              >
                <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  isToday ? 'bg-primary text-white shadow-sm' : 'text-foreground'
                }`}>
                  {date.getDate()}
                </span>
                
                {count > 0 && (
                  <div className="mt-2 py-1 px-2 bg-primary/10 text-primary border border-primary/20 rounded-lg text-[9px] font-bold flex items-center justify-between">
                    <span>Bookings</span>
                    <span>{count}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const currentViewTitle = () => {
    if (viewMode === 'day') {
      return currentDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } else if (viewMode === 'week') {
      const startOfWeek = new Date(currentDate);
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } else {
      return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Calendar Navigation and Toggles Header */}
      <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Turf Scheduler</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Check time slot overlaps and configure new bookings</p>
        </div>

        {/* View Selection & Ground Filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Day / Week / Month Mode Selector */}
          <div className="bg-card border border-border/80 rounded-xl p-1 flex shadow-sm">
            {(['day', 'week', 'month'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                  viewMode === mode
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Ground Filters Dropdown Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger>
              <button className="flex items-center gap-1.5 px-3 py-2 bg-card border border-border/85 rounded-xl text-xs font-semibold focus:outline-none cursor-pointer select-none shadow-sm">
                {selectedGroundFilter === 'all' 
                  ? 'All Boxes (Day View)' 
                  : grounds.find(g => g.id === selectedGroundFilter)?.name || 'Select Box'}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end">
              <DropdownMenuItem onClick={() => setSelectedGroundFilter('all')}>
                All Boxes (Day View)
              </DropdownMenuItem>
              {grounds.map(g => (
                <DropdownMenuItem key={g.id} onClick={() => setSelectedGroundFilter(g.id)}>
                  {g.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Add Booking trigger */}
          {user?.role === 'admin' && (
            <button
              onClick={() => {
                resetBookingForm();
                // Set default date to calendar selected date
                setFormDate(getFormattedDate(currentDate));
                setShowAddModal(true);
              }}
              className="py-2 px-4 bg-primary hover:bg-primary/95 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-primary/10 transition-all active:scale-95"
            >
              <Plus className="h-4 w-4" />
              Add Booking
            </button>
          )}
        </div>
      </div>

      {/* Date Navigation Bar */}
      <div className="bg-card border border-border/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button 
            onClick={handlePrevDate}
            className="p-2 hover:bg-muted border border-border rounded-xl text-muted-foreground hover:text-foreground cursor-pointer shadow-sm"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button 
            onClick={handleNextDate}
            className="p-2 hover:bg-muted border border-border rounded-xl text-muted-foreground hover:text-foreground cursor-pointer shadow-sm"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button 
            onClick={handleToday}
            className="px-3.5 py-2 hover:bg-muted border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer shadow-sm"
          >
            Today
          </button>
        </div>

        <h2 className="font-extrabold text-sm sm:text-md text-foreground flex items-center gap-2">
          <CalendarIcon className="h-4.5 w-4.5 text-primary" />
          {currentViewTitle()}
        </h2>

        <div className="w-[100px] hidden sm:block"></div> {/* Spacer */}
      </div>

      {/* Calendar Render */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-muted-foreground font-semibold">Generating schedule grid...</p>
        </div>
      ) : (
        <div>
          {viewMode === 'day' && renderDayView()}
          {viewMode === 'week' && renderWeekView()}
          {viewMode === 'month' && renderMonthView()}
        </div>
      )}

      {/* 1. VIEW BOOKING DETAILS DRAWER/MODAL */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-xl rounded-2xl shadow-xl border border-border overflow-hidden animate-scale-in text-left">
            <div className="bg-primary p-6 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-md leading-tight">Booking Details</h3>
                <p className="text-[10px] text-emerald-100 font-mono mt-0.5">Reference: {selectedBooking.id}</p>
              </div>
              <button 
                onClick={() => setSelectedBooking(null)}
                className="p-1 hover:bg-white/10 rounded-lg text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Customer Contact */}
              <div className="bg-accent/40 rounded-xl p-4 border border-primary/10 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-primary/10 text-primary border border-primary/25 rounded-xl flex items-center justify-center font-bold text-sm">
                    {selectedBooking.customer?.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-foreground">{selectedBooking.customer?.name}</h4>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone className="h-3.5 w-3.5" /> {selectedBooking.customer?.phone}
                    </p>
                  </div>
                </div>
                <Link 
                  href={`/customers/${selectedBooking.customer_id}`}
                  className="py-1.5 px-3 border border-border bg-card hover:bg-muted text-foreground/80 font-bold rounded-xl text-[10px] transition-all"
                >
                  Profile
                </Link>
              </div>

              {/* Slot Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Ground / Turf</span>
                  <span className="text-xs font-bold text-foreground block">{selectedBooking.ground?.name}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Booking Date</span>
                  <span className="text-xs font-bold text-foreground block">
                    {new Date(selectedBooking.booking_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Scheduled Time</span>
                  <span className="text-xs font-bold text-foreground block flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-primary" /> {selectedBooking.start_time} - {selectedBooking.end_time}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Booking Status</span>
                  {(() => {
                    const derivedStatus = getBookingStatus(selectedBooking);
                    let badgeStyle = 'bg-blue-50 text-blue-800 border-blue-200';
                    if (derivedStatus === 'Completed') badgeStyle = 'bg-emerald-50 text-emerald-800 border-emerald-200';
                    else if (derivedStatus === 'Running') badgeStyle = 'bg-amber-50 text-amber-800 border-amber-200 animate-pulse';
                    else if (derivedStatus === 'Cancelled') badgeStyle = 'bg-red-50 text-red-800 border-red-200';
                    return (
                      <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[10px] font-bold mt-0.5 ${badgeStyle}`}>
                        {derivedStatus}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Notes */}
              {selectedBooking.notes && (
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Booking Notes</span>
                  <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-xl border border-border/50">{selectedBooking.notes}</p>
                </div>
              )}

              {/* Payment Summary */}
              <div className="border-t border-border/80 pt-4 space-y-3.5">
                <h4 className="font-extrabold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <IndianRupee className="h-4 w-4 text-primary" /> Payment Ledger
                </h4>
                
                {/* Ledger Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/30 rounded-xl p-3 border border-border/50 text-center">
                    <span className="text-[9px] font-bold text-muted-foreground block">Final Bill</span>
                    <span className="text-sm font-bold text-foreground block mt-1">₹{selectedBooking.final_amount}</span>
                  </div>
                  <div className="bg-emerald-50/20 rounded-xl p-3 border border-emerald-100 text-center">
                    <span className="text-[9px] font-bold text-emerald-800 block">Total Collected</span>
                    <span className="text-sm font-bold text-emerald-700 block mt-1">
                      ₹{selectedBooking.id ? (paymentSummaries[selectedBooking.id]?.totalPaid || 0) : 0}
                    </span>
                  </div>
                  <div className="bg-amber-50/20 rounded-xl p-3 border border-amber-100 text-center">
                    <span className="text-[9px] font-bold text-amber-800 block">Remaining Due</span>
                    <span className="text-sm font-bold text-amber-700 block mt-1">
                      ₹{selectedBooking.id ? (paymentSummaries[selectedBooking.id]?.pendingAmount || 0) : 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center gap-2 pt-4 border-t border-border/80 justify-between">
                {user?.role === 'admin' ? (
                  <div className="flex items-center gap-2 w-full">
                    {/* Log Payment Trigger */}
                    {selectedBooking.id && (paymentSummaries[selectedBooking.id]?.pendingAmount || 0) > 0 && (
                      <button
                        onClick={() => {
                          const pending = paymentSummaries[selectedBooking.id]?.pendingAmount || 0;
                          setPaymentAmount(pending.toString());
                          setCollectPaymentMode('UPI');
                          setCollectUpiSplit(pending.toString());
                          setCollectCashSplit('0');
                          setPaymentError(null);
                          setShowPaymentModal(true);
                        }}
                        className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-650 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/10 transition-transform active:scale-95"
                      >
                        Log Payment
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleOpenEdit(selectedBooking)}
                      className="py-2.5 px-4 border border-border bg-card hover:bg-muted text-foreground/80 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      Edit Booking
                    </button>
                    
                    <button
                      onClick={() => handleDeleteBooking(selectedBooking.id)}
                      className="py-2.5 px-3 border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 ml-auto cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground italic w-full text-center">Staff Member: View Only Account</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preload Lottie library and animation JSON in the background while user fills the booking form */}
      {showAddModal && (
        <div className="sr-only pointer-events-none absolute -left-[9999px] -top-[9999px]" aria-hidden="true">
          <DotLottieReact
            src="https://lottie.host/a4743664-bf1a-4e8b-bffb-e7aa229e12be/TK33CGxBKq.lottie"
            autoplay={false}
          />
        </div>
      )}

      {/* 2. ADD / EDIT BOOKING FORM DRAWER */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-5xl rounded-2xl shadow-xl border border-border overflow-hidden animate-scale-in text-left flex flex-col h-[600px] max-h-[95vh] md:h-[650px] md:max-h-[90vh]">
            {/* Header */}
            <div className="bg-primary p-5 text-white flex items-center justify-between shrink-0">
              <h3 className="font-bold text-md flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                {isEditing ? 'Modify Turf Booking' : 'Book a Turf Slot'}
              </h3>
              <button 
                onClick={() => {
                  setShowAddModal(false);
                  resetBookingForm();
                }}
                className="p-1 hover:bg-white/10 rounded-lg text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Wizard Steps Tracker */}
            {wizardStep < 6 && (
              <div className="bg-muted/30 px-6 py-4 border-b border-border/80 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-1 w-full justify-between max-w-xl mx-auto">
                  {[
                    { s: 1, label: 'Customer' },
                    { s: 2, label: 'Turf & Date' },
                    { s: 3, label: 'Slots' },
                    { s: 4, label: 'Review' },
                    { s: 5, label: 'Payment' }
                  ].map((step, idx, arr) => (
                    <React.Fragment key={step.s}>
                      <div className="flex flex-col items-center gap-1 relative">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                          wizardStep === step.s
                            ? 'bg-primary text-white scale-110 shadow-md shadow-primary/20 ring-4 ring-primary/10'
                            : wizardStep > step.s
                              ? 'bg-emerald-600 text-white'
                              : 'bg-muted border border-border text-muted-foreground'
                        }`}>
                          {wizardStep > step.s ? <Check className="h-4 w-4" /> : step.s}
                        </div>
                        <span className={`text-[9px] font-bold tracking-tight uppercase ${
                          wizardStep === step.s ? 'text-primary' : 'text-muted-foreground/80'
                        }`}>
                          {step.label}
                        </span>
                      </div>
                      {idx < arr.length - 1 && (
                        <div className={`flex-1 h-0.5 mx-2 -mt-4 transition-all duration-300 ${
                          wizardStep > step.s ? 'bg-emerald-500' : 'bg-border'
                        }`} />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {/* Error banner */}
            {formError && (
              <div className="px-6 pt-4 shrink-0 animate-fade-in">
                <div className="p-3 bg-red-50 border border-red-200 text-red-855 text-xs font-semibold rounded-xl flex items-start justify-between gap-2 shadow-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setFormError(null)}
                    className="p-0.5 hover:bg-red-100 rounded text-red-600 transition-colors cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Wizard Content Body */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 flex flex-col">
              
              {/* STEP 1: CUSTOMER PROFILE DETAILS */}
              {wizardStep === 1 && (
                <div className="space-y-5 flex flex-col justify-between flex-1">
                  <div className="space-y-5">
                    <div>
                      <h4 className="font-bold text-sm text-foreground">Customer Profile Details</h4>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Select an existing customer profile or enter details to register a new customer.</p>
                    </div>

                    {/* Customer search query */}
                    {!formCustomerId && (
                      <div className="space-y-1.5 relative">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Search Existing Customer</label>
                        <input
                          type="text"
                          placeholder="Search by name or mobile number..."
                          value={customerSearchQuery}
                          onChange={(e) => setCustomerSearchQuery(e.target.value)}
                          className="w-full px-3.5 py-2.5 bg-muted/20 border border-border rounded-xl text-[16px] sm:text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        
                        {/* Dropdown list of filtered customers with Framer Motion Animation */}
                        <AnimatePresence>
                          {customerSearchQuery.trim() !== '' && (
                            <motion.div
                              initial={{ opacity: 0, y: -4, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -4, scale: 0.95 }}
                              transition={{ duration: 0.12, ease: [0, 0, 0.2, 1] }}
                              className="absolute z-50 w-full mt-1.5 bg-card border border-border rounded-xl shadow-2xl max-h-48 overflow-y-auto p-1.5 space-y-0.5"
                            >
                              {customers.filter(c => 
                                c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                                c.phone.includes(customerSearchQuery)
                              ).length > 0 ? (
                                customers.filter(c => 
                                  c.name.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
                                  c.phone.includes(customerSearchQuery)
                                ).map(c => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                      setFormCustomerId(c.id);
                                      setFormCustName(c.name);
                                      setFormCustPhone(c.phone);
                                      setCustomerSearchQuery('');
                                      setFormError(null);
                                    }}
                                    className="w-full text-left px-3 py-2.5 hover:bg-[#eef7f2] hover:text-[#0c4a28] rounded-lg transition-colors text-xs font-bold flex items-center justify-between cursor-pointer focus:outline-none focus:bg-[#eef7f2] focus:text-[#0c4a28]"
                                  >
                                    <span>{c.name}</span>
                                    <span className="text-[10px] text-muted-foreground font-mono">{c.phone}</span>
                                  </button>
                                ))
                              ) : (
                                <div className="px-4 py-3 text-xs text-muted-foreground text-center font-bold">
                                  No matching customers found. Register as a new customer below.
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* Customer details display */}
                    {formCustomerId ? (
                      <div className="bg-accent/40 rounded-xl p-4 border border-primary/10 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-primary/10 text-primary border border-primary/20 rounded-xl flex items-center justify-center font-bold text-sm">
                            {formCustName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                              {formCustName}
                              <span className="text-[9px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded-md uppercase">Saved Profile</span>
                            </h4>
                            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{formCustPhone}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFormCustomerId('');
                            setFormCustName('');
                            setFormCustPhone('');
                          }}
                          className="py-1.5 px-3 border border-border bg-card hover:bg-muted text-red-650 font-bold rounded-xl text-[10px] transition-all cursor-pointer"
                        >
                          Change Customer
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-muted/10 p-4 border border-border/80 rounded-2xl space-y-4">
                          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-1 rounded-md uppercase">New Customer Details</span>
                          <div className="grid grid-cols-2 gap-4 pt-1">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Customer Name</label>
                              <input
                                type="text"
                                placeholder="Sachin Tendulkar"
                                value={formCustName}
                                onChange={(e) => setFormCustName(e.target.value)}
                                className="w-full px-3 py-2 bg-card border border-border rounded-xl text-[16px] sm:text-xs font-semibold focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Mobile Phone</label>
                              <input
                                type="text"
                                maxLength={10}
                                placeholder="9876543210"
                                value={formCustPhone}
                                onChange={(e) => setFormCustPhone(e.target.value.replace(/\D/g, ''))}
                                className="w-full px-3 py-2 bg-card border border-border rounded-xl text-[16px] sm:text-xs font-semibold font-mono focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Wizard Step 1 Footer */}
                  <div className="flex items-center gap-3 pt-4 border-t border-border/60 justify-end shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddModal(false);
                        resetBookingForm();
                      }}
                      className="py-2.5 px-6 border border-border bg-card hover:bg-muted rounded-xl text-xs font-bold text-muted-foreground cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!formCustName.trim() || !formCustPhone.trim()) {
                          setFormError('Please select a customer or provide name and phone for a new customer');
                          return;
                        }
                        if (!formCustPhone.match(/^\d{10}$/)) {
                          setFormError('Mobile number must be exactly 10 digits');
                          return;
                        }
                        setFormError(null);
                        setWizardStep(2);
                      }}
                      className="py-2.5 px-6 bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-bold cursor-pointer transition-all hover:translate-x-0.5"
                    >
                      Next: Turf & Date
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: SELECT TURF BOX & DATE */}
              {wizardStep === 2 && (
                <div className="space-y-4 flex flex-col justify-between flex-1 max-w-md mx-auto w-full">
                  <div className="space-y-4">
                    {/* Turf Selector Box */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-wider block">1. Select Box</label>
                      <div className="grid grid-cols-2 gap-4">
                        {grounds.map((g, idx) => {
                          const isSelected = formGroundId === g.id;
                          const boxName = idx === 0 ? 'Box 1 (Premium Turf)' : 'Box 2 (Premium Turf)';
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => {
                                setFormGroundId(g.id);
                                setFormError(null);
                                setSelectedSlots([]);
                              }}
                              className={`p-3.5 border rounded-2xl cursor-pointer text-left transition-all flex flex-col items-start ${
                                isSelected
                                  ? 'bg-[#0c4a28]/10 border-[#0c4a28] shadow-md ring-2 ring-[#0c4a28]/25'
                                  : 'bg-card border-border hover:bg-muted/40'
                              }`}
                            >
                              <span className="font-bold text-xs text-foreground">{boxName}</span>
                              <span className="text-[10px] text-primary font-black mt-1">
                                {(() => {
                                  // Load weekday daytime rate from custom rates if set
                                  if (typeof window !== 'undefined') {
                                    try {
                                      const stored = localStorage.getItem('turf_slot_pricing');
                                      if (stored) {
                                        const customRates = JSON.parse(stored);
                                        if (customRates && customRates[g.id]) {
                                          return `₹${customRates[g.id].weekday_daytime}/hr`;
                                        }
                                      }
                                    } catch (e) {}
                                  }
                                  return `₹${g.hourly_rate.toString().split('.')[0]}/hr`;
                                })()}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Unified dark panel for calendar only */}
                    <div className="bg-[#0d1e15] border border-emerald-950/60 rounded-3xl p-4 sm:p-5 shadow-2xl">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block">2. Select Date</label>
                        {renderWizardCalendar()}
                      </div>
                    </div>
                  </div>

                  {/* Wizard Step 2 Footer */}
                  <div className="flex items-center gap-3 pt-4 border-t border-border/60 justify-between shrink-0">
                    <div className="text-left text-xs font-bold text-muted-foreground">
                      {formDate ? (
                        <span>
                          Selected Date: <span className="text-primary font-extrabold">{formatSummaryDate(formDate)}</span>
                        </span>
                      ) : (
                        <span className="italic">Please select a date</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFormError(null);
                          setWizardStep(1);
                        }}
                        className="py-2.5 px-6 border border-border bg-card hover:bg-muted rounded-xl text-xs font-bold text-muted-foreground cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={!formGroundId || !formDate}
                        onClick={() => {
                          setFormError(null);
                          setWizardStep(3);
                        }}
                        className={`py-2.5 px-6 rounded-xl text-xs font-bold transition-all ${
                          formGroundId && formDate
                            ? 'bg-primary hover:bg-primary/95 text-white shadow-md cursor-pointer'
                            : 'bg-muted text-muted-foreground/50 cursor-not-allowed border-none'
                        }`}
                      >
                        Next: Select Slots
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: SELECT TIME SLOTS */}
              {wizardStep === 3 && (
                <div className="space-y-4 flex flex-col justify-between flex-1">
                  <div className="space-y-4">
                    {/* Header summary info */}
                    <div className="bg-[#0c4a28]/10 border border-[#0c4a28]/20 rounded-2xl p-4 flex justify-between items-center text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase block">Selected Turf</span>
                        <span className="font-extrabold text-foreground">{formGroundId === grounds[0]?.id ? 'Box 1 (Premium Turf)' : 'Box 2 (Premium Turf)'}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase block">Selected Date</span>
                        <span className="font-extrabold text-foreground font-mono">{formatSummaryDate(formDate)}</span>
                      </div>
                    </div>

                    {/* Dark Unified panel for time slots */}
                    <div className="bg-[#0d1e15] border border-emerald-950/60 rounded-3xl p-4 sm:p-5 shadow-2xl flex flex-col gap-4">
                      <div>
                        <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block">3. Select Time Slots</label>
                        <p className="text-[10px] text-emerald-250/70 mt-0.5">Click slots to add or remove them from this booking.</p>
                      </div>

                      {/* Time slots grid: 2 columns on mobile, 3/4 on larger screens */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 overflow-y-auto max-h-[240px] pr-1.5 font-mono">
                        {visibleTimeSlots.slice(0, -1).map((slot) => {
                          const isBooked = isSlotBooked(formGroundId, formDate, slot);
                          const isPast = isSlotInPast(formDate, slot);
                          const isSelected = selectedSlots.includes(slot);
                          const price = getSlotPrice(formGroundId, formDate, slot);
                          const displayTime = formatSlotTimeOnly(slot);

                          if (isBooked) {
                            return (
                              <button
                                key={slot}
                                type="button"
                                disabled
                                className="w-full py-2 px-2 border border-red-950/60 bg-red-950/40 text-red-400 font-extrabold rounded-xl text-[11px] flex flex-col items-center justify-center gap-1 cursor-not-allowed opacity-75 shrink-0"
                              >
                                <span>{displayTime}</span>
                                <span className="bg-red-950/80 border border-red-800 text-red-500 text-[8px] font-black uppercase px-1 py-0.5 rounded-md flex items-center gap-0.5">
                                  <Check className="h-3 w-3 stroke-[3]" />
                                  Booked
                                </span>
                              </button>
                            );
                          }

                          if (isPast) {
                            return (
                              <button
                                key={slot}
                                type="button"
                                disabled
                                className="w-full py-2 px-2 border border-emerald-950/20 bg-emerald-950/10 text-emerald-650/40 font-bold rounded-xl text-[11px] flex flex-col items-center justify-center gap-1 cursor-not-allowed opacity-50 shrink-0"
                              >
                                <span>{displayTime}</span>
                                <span className="bg-emerald-950/30 border border-emerald-900/20 text-emerald-650/50 text-[8px] font-bold uppercase px-1 py-0.5 rounded-md">
                                  Past
                                </span>
                              </button>
                            );
                          }

                          return (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedSlots(selectedSlots.filter(s => s !== slot));
                                } else {
                                  setSelectedSlots([...selectedSlots, slot].sort());
                                }
                                setFormError(null);
                              }}
                              className={`w-full py-2 px-2 border rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer shadow-sm shrink-0 ${
                                isSelected
                                  ? 'bg-white text-[#0c4a28] border-white font-extrabold shadow-md'
                                  : 'bg-emerald-950/30 border border-emerald-900/60 text-emerald-100 hover:bg-emerald-900/20'
                              }`}
                            >
                              <span>{displayTime}</span>
                              <span className={isSelected ? 'text-[#0c4a28] font-black' : 'text-emerald-400 font-semibold'}>₹{price}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Wizard Step 3 Footer */}
                  <div className="flex items-center gap-3 pt-4 border-t border-border/60 justify-between shrink-0">
                    <div className="text-left text-xs font-bold text-muted-foreground truncate max-w-[50%]">
                      {selectedSlots.length > 0 ? (
                        <span>
                          Selected: <span className="text-primary font-extrabold">{selectedSlots.length} slot(s)</span>
                        </span>
                      ) : (
                        <span className="italic">No slots selected</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFormError(null);
                          setWizardStep(2);
                        }}
                        className="py-2.5 px-6 border border-border bg-card hover:bg-muted rounded-xl text-xs font-bold text-muted-foreground cursor-pointer"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={selectedSlots.length === 0}
                        onClick={() => {
                          setFormError(null);
                          setWizardStep(4);
                        }}
                        className={`py-2.5 px-6 rounded-xl text-xs font-bold transition-all ${
                          selectedSlots.length > 0
                            ? 'bg-primary hover:bg-primary/95 text-white shadow-md cursor-pointer'
                            : 'bg-muted text-muted-foreground/50 cursor-not-allowed border-none'
                        }`}
                      >
                        Next: Review
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: REVIEW BOOKING DETAILS */}
              {wizardStep === 4 && (
                <div className="space-y-4 flex flex-col justify-between flex-1">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-bold text-sm text-foreground">Review Booking Details</h4>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Please review the details and configure discount or notes if needed.</p>
                    </div>

                    {/* Details Summary Card */}
                    <div className="grid grid-cols-2 gap-4 bg-muted/20 border border-border/60 p-3 sm:p-4 rounded-2xl">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Customer Profile</span>
                        <span className="text-xs font-bold text-foreground block">{formCustName} ({formCustPhone})</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Turf Box / Ground</span>
                        <span className="text-xs font-bold text-foreground block">{formGroundId === grounds[0]?.id ? 'Box 1 (Premium Turf)' : 'Box 2 (Premium Turf)'}</span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Booking Date</span>
                        <span className="text-xs font-bold text-foreground block font-mono">
                          {new Date(formDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Booking Slots</span>
                        <span className="text-[10px] font-bold text-foreground block max-h-12 overflow-y-auto font-mono">
                          {selectedSlots.map(s => formatSlotDisplay(s)).join(', ')}
                        </span>
                      </div>
                    </div>

                    {/* Discount and Notes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Discount (₹)</label>
                        <input
                          type="number"
                          min={0}
                          max={calculateTotalPrice()}
                          value={formDiscount}
                          onChange={(e) => setFormDiscount(e.target.value)}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="w-full px-3 py-2 bg-muted/25 border border-border rounded-xl text-[16px] sm:text-xs font-bold focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Additional Notes</label>
                        <textarea
                          placeholder="E.g., extra stumps, regular customer, etc."
                          value={formNotes}
                          onChange={(e) => setFormNotes(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-1.5 bg-muted/25 border border-border rounded-xl text-[16px] sm:text-xs font-semibold focus:outline-none"
                        ></textarea>
                      </div>
                    </div>

                    {/* Billing Card */}
                    <div className="bg-accent/40 rounded-xl p-3 sm:p-4 border border-primary/10 space-y-1 text-xs">
                      <div className="flex justify-between font-semibold text-muted-foreground">
                        <span>Total Booked Rate:</span>
                        <span>₹{calculateTotalPrice()}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-red-650">
                        <span>Discount:</span>
                        <span>-₹{Number(formDiscount) || 0}</span>
                      </div>
                      <div className="h-px bg-border/80 my-1"></div>
                      <div className="flex justify-between font-black text-sm text-primary">
                        <span>Net Total Payable Bill:</span>
                        <span>₹{calculateFinalAmount()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Wizard Step 4 Footer */}
                  <div className="flex items-center gap-3 pt-4 border-t border-border/60 justify-between shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setFormError(null);
                        setWizardStep(3);
                      }}
                      className="py-2.5 px-6 border border-border bg-card hover:bg-muted rounded-xl text-xs font-bold text-muted-foreground cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const total = calculateFinalAmount();
                        setUpiSplitAmount(total.toString());
                        setCashSplitAmount('0');
                        setWizardStep(5);
                      }}
                      className="py-2.5 px-6 bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-bold cursor-pointer transition-all hover:translate-x-0.5"
                    >
                      Next: Choose Payment
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 5: SELECT PAYMENT METHOD */}
              {wizardStep === 5 && (
                <div className="space-y-4 flex flex-col justify-between flex-1">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-bold text-sm text-foreground">Select Payment Config</h4>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Select Full, Advance, or Due payment options.</p>
                    </div>

                    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 text-center space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Final Amount Due</span>
                      <span className="text-xl font-black text-primary block">₹{calculateFinalAmount()}</span>
                    </div>

                    {/* Payment Type Selector */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Payment Type</label>
                      <div className="grid grid-cols-3 gap-3">
                        {(['Full', 'Advance', 'Due'] as const).map(type => {
                          const isSelected = paymentType === type;
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => {
                                setPaymentType(type);
                                setFormError(null);
                                if (type === 'Full') {
                                  setPaymentMode('UPI');
                                  const total = calculateFinalAmount();
                                  setUpiSplitAmount(total.toString());
                                  setCashSplitAmount('0');
                                } else if (type === 'Advance') {
                                  setAdvancePaymentMethod('UPI');
                                  const suggestedAdv = Math.round((calculateFinalAmount() / 2) / 100) * 100 || 500;
                                  setAdvanceAmount(suggestedAdv.toString());
                                }
                              }}
                              className={`py-3 px-3 border rounded-xl text-xs font-bold cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-primary text-white border-primary shadow-sm shadow-primary/10 font-black'
                                  : 'bg-card border-border hover:bg-muted text-muted-foreground'
                              }`}
                            >
                              {type}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Conditional rendering based on paymentType */}
                    {paymentType === 'Full' && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Payment Mode</label>
                          <div className="grid grid-cols-3 gap-3">
                            {(['UPI', 'Cash', 'Split'] as const).map(mode => {
                              const isSelected = paymentMode === mode;
                              return (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => {
                                    setPaymentMode(mode);
                                    const total = calculateFinalAmount();
                                    if (mode === 'Split') {
                                      setUpiSplitAmount(Math.round(total / 2).toString());
                                      setCashSplitAmount((total - Math.round(total / 2)).toString());
                                    } else {
                                      setUpiSplitAmount(mode === 'UPI' ? total.toString() : '0');
                                      setCashSplitAmount(mode === 'Cash' ? total.toString() : '0');
                                    }
                                  }}
                                  className={`py-3 px-3 border rounded-xl text-xs font-bold cursor-pointer transition-all ${
                                    isSelected
                                      ? 'bg-primary text-white border-primary shadow-sm shadow-primary/10 font-black'
                                      : 'bg-card border-border hover:bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {mode}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {paymentMode === 'Split' ? (
                          <div className="grid grid-cols-2 gap-4 bg-muted/20 rounded-xl p-4 border border-border/50">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">UPI Split Amount (₹)</label>
                              <input
                                type="number"
                                min={0}
                                max={calculateFinalAmount()}
                                value={upiSplitAmount}
                                onChange={(e) => handleUpiSplitChange(e.target.value)}
                                onWheel={(e) => e.currentTarget.blur()}
                                className="w-full px-3 py-2 bg-card border border-border rounded-xl text-[16px] sm:text-xs font-bold text-foreground focus:outline-none"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cash Split Amount (₹)</label>
                              <input
                                type="number"
                                min={0}
                                max={calculateFinalAmount()}
                                value={cashSplitAmount}
                                onChange={(e) => handleCashSplitChange(e.target.value)}
                                onWheel={(e) => e.currentTarget.blur()}
                                className="w-full px-3 py-2 bg-card border border-border rounded-xl text-[16px] sm:text-xs font-bold text-foreground focus:outline-none"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="bg-muted/10 p-4 border border-border/40 rounded-xl text-xs font-semibold text-muted-foreground text-center">
                            Full payment of <strong className="text-primary font-black">₹{calculateFinalAmount()}</strong> will be logged via <strong className="uppercase">{paymentMode}</strong>.
                          </div>
                        )}

                        {paymentMode === 'Split' && (
                          <div className="p-3 bg-emerald-50 border border-emerald-150 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-1.5 justify-center">
                            <Check className="h-4 w-4 text-emerald-600" />
                            <span>Split matches bill: ₹{upiSplitAmount} + ₹{cashSplitAmount} = ₹{calculateFinalAmount()}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {paymentType === 'Advance' && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Payment Mode</label>
                          <div className="grid grid-cols-2 gap-3">
                            {(['UPI', 'Cash'] as const).map(mode => {
                              const isSelected = advancePaymentMethod === mode;
                              return (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => setAdvancePaymentMethod(mode)}
                                  className={`py-3 px-3 border rounded-xl text-xs font-bold cursor-pointer transition-all ${
                                    isSelected
                                      ? 'bg-primary text-white border-primary shadow-sm shadow-primary/10 font-black'
                                      : 'bg-card border-border hover:bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {mode}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-1.5 text-left">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Advance Amount (₹)</label>
                          <input
                            type="number"
                            min={1}
                            max={calculateFinalAmount() - 1}
                            value={advanceAmount}
                            onChange={(e) => {
                              setAdvanceAmount(e.target.value);
                              setFormError(null);
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                            className="w-full px-3 py-2 bg-card border border-border rounded-xl text-[16px] sm:text-xs font-bold text-foreground focus:outline-none"
                          />
                          <span className="text-[10px] text-muted-foreground block mt-1">
                            Remaining Due: <strong className="text-amber-600">₹{Math.max(0, calculateFinalAmount() - (Number(advanceAmount) || 0))}</strong>
                          </span>
                        </div>
                      </div>
                    )}

                    {paymentType === 'Due' && (
                      <div className="bg-amber-50/20 border border-amber-250/30 p-4 rounded-xl text-xs font-semibold text-amber-800 text-center">
                        No immediate payment will be logged. The full bill of <strong className="font-black text-amber-700">₹{calculateFinalAmount()}</strong> will be marked as outstanding Due (Pending).
                      </div>
                    )}
                  </div>

                  {/* Wizard Step 5 Footer */}
                  <div className="flex items-center gap-3 pt-4 border-t border-border/60 justify-between shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setFormError(null);
                        setWizardStep(4);
                      }}
                      className="py-2.5 px-6 border border-border bg-card hover:bg-muted rounded-xl text-xs font-bold text-muted-foreground cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleBookingSubmit}
                      disabled={formSubmitting}
                      className="py-2.5 px-6 bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-2 disabled:opacity-75"
                    >
                      {formSubmitting ? (
                        <>
                          <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Processing...
                        </>
                      ) : (
                        'Confirm Booking'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 6: BOOKING SUCCESS SCREEN */}
              {wizardStep === 6 && bookingSuccessData && (
                <div className="space-y-5 py-2 flex flex-col items-center justify-between flex-1 h-full">
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="w-24 h-24 sm:w-32 sm:h-32 flex items-center justify-center">
                      <DotLottieReact
                        src="https://lottie.host/a4743664-bf1a-4e8b-bffb-e7aa229e12be/TK33CGxBKq.lottie"
                        loop
                        autoplay
                      />
                    </div>
                    
                    <div className="space-y-1">
                      <h3 className="font-extrabold text-sm sm:text-base text-emerald-800 tracking-tight">Booking Confirmed Successfully!</h3>
                      <p className="text-[9px] sm:text-[10px] text-muted-foreground font-semibold">The slots are locked and payments are successfully registered.</p>
                    </div>
                  </div>

                  {/* Confirmation details */}
                  <div className="bg-muted/15 border border-border/80 p-3 sm:p-4 rounded-xl text-left w-full space-y-2 max-w-md mx-auto">
                    <div className="flex justify-between border-b border-border/40 pb-1.5">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase">Customer</span>
                      <span className="text-xs font-bold text-foreground">{bookingSuccessData.customerName} ({bookingSuccessData.customerPhone})</span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 pb-1.5">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase">Turf Box</span>
                      <span className="text-xs font-bold text-foreground">{bookingSuccessData.groundName}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 pb-1.5">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase">Date</span>
                      <span className="text-xs font-bold text-foreground font-mono">{bookingSuccessData.date}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 pb-1.5">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase">Booked Slots</span>
                      <span className="text-[10px] font-bold text-foreground font-mono max-w-[200px] text-right truncate">
                        {bookingSuccessData.slots.map(s => formatSingleHourAMPM(s)).join(', ')}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 pb-1.5">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase">Payment Details</span>
                      <span className="text-xs font-bold text-primary font-sans">{bookingSuccessData.paymentSummary}</span>
                    </div>
                    <div className="flex justify-between pt-0.5">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase">Reference ID(s)</span>
                      <span className="text-[8px] font-bold font-mono text-muted-foreground truncate max-w-[180px]">
                        {bookingSuccessData.bookingIds.join(', ')}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      setShowAddModal(false);
                      resetBookingForm();
                      await loadAllData(true);
                      router.refresh();
                    }}
                    className="py-2.5 px-10 bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-extrabold cursor-pointer transition-all active:scale-95 shadow-md shadow-primary/10"
                  >
                    Done & Return
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* 3. LOG NEW PAYMENT DRAWER */}
      {showPaymentModal && selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-xl border border-border overflow-hidden animate-scale-in text-left">
            <div className="bg-primary p-6 text-white flex items-center justify-between">
              <h3 className="font-bold text-md flex items-center gap-2">
                <DollarSign className="h-5 w-5" /> Collect Booking Payment
              </h3>
              <button 
                onClick={() => setShowPaymentModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleLogPaymentSubmit} className="p-6 space-y-4">
              {paymentError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-850 text-xs font-semibold rounded-xl">
                  {paymentError}
                </div>
              )}

              <div className="bg-accent/40 rounded-xl p-3 border border-primary/10 space-y-1.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Outstanding Balance</p>
                <p className="text-lg font-extrabold text-primary">
                  ₹{selectedBooking.id ? (paymentSummaries[selectedBooking.id]?.pendingAmount || 0) : 0}
                </p>
              </div>

              {/* Payment Mode Selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Payment Mode</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['UPI', 'Cash', 'Split'] as const).map(mode => {
                    const isSelected = collectPaymentMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setCollectPaymentMode(mode);
                          setPaymentError(null);
                          const total = Number(paymentSummaries[selectedBooking.id]?.pendingAmount || 0);
                          if (mode === 'Split') {
                            setCollectUpiSplit(Math.round(total / 2).toString());
                            setCollectCashSplit((total - Math.round(total / 2)).toString());
                            setPaymentAmount(total.toString());
                          } else {
                            setPaymentAmount(total.toString());
                          }
                        }}
                        className={`py-2.5 px-1 rounded-xl text-xs font-bold cursor-pointer transition-all text-center ${
                          isSelected
                            ? 'bg-primary text-white border-primary shadow-sm shadow-primary/10 font-black'
                            : 'bg-card border-border hover:bg-muted text-muted-foreground'
                        }`}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Conditional inputs */}
              {collectPaymentMode === 'Split' ? (
                <div className="grid grid-cols-2 gap-4 bg-muted/20 rounded-xl p-4 border border-border/50">
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">UPI Amount (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={collectUpiSplit}
                      onChange={(e) => handleCollectUpiChange(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full px-3 py-2 bg-card border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5 text-left">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cash Amount (₹)</label>
                    <input
                      type="number"
                      min={0}
                      value={collectCashSplit}
                      onChange={(e) => handleCollectCashChange(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full px-3 py-2 bg-card border border-border rounded-xl text-xs font-bold text-foreground focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2 text-[10px] font-bold text-muted-foreground text-center pt-1 border-t border-border/40">
                    Total Collected: <strong className="text-primary font-black">₹{paymentAmount}</strong>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5 text-left">
                    <label className="text-xs font-semibold text-muted-foreground">Amount Received (₹)</label>
                    <input
                      type="number"
                      min={0.01}
                      step="any"
                      value={paymentAmount}
                      onChange={(e) => handleCollectTotalChange(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-muted/20 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-xs transition-all font-bold"
                    />
                  </div>

                  <div className="bg-muted/10 p-3 border border-border/40 rounded-xl text-xs font-semibold text-muted-foreground text-center">
                    Payment of <strong className="text-primary font-black">₹{paymentAmount}</strong> will be logged via <strong className="uppercase">{collectPaymentMode}</strong>.
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 py-2.5 bg-muted text-foreground/80 hover:bg-muted/80 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-primary text-white hover:bg-primary/95 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Save Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BookingsPage() {
  return (
    <DashboardLayout>
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="h-8 w-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-muted-foreground font-medium">Loading Calendar Page...</p>
        </div>
      }>
        <BookingsContent />
      </Suspense>
    </DashboardLayout>
  );
}
