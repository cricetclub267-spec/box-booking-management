'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/dashboard-layout';
import { getGrounds, logActivity, getPartners, createUserProfile, getUserProfileByPhone, updateGroundsRate } from '@/lib/db/db-service';
import { Ground, User } from '@/lib/db/types';
import { useAuthStore } from '@/lib/store/auth-store';
import { createClient } from '@supabase/supabase-js';
import { 
  Settings as SettingsIcon, 
  MapPin, 
  Clock, 
  Phone, 
  Shield, 
  Building,
  Save,
  Check,
  AlertCircle,
  Users as UsersIcon,
  Plus,
  Mail,
  Key
} from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [grounds, setGrounds] = useState<Ground[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Tab: 'facility' or 'partners'
  const [activeTab, setActiveTab] = useState<'facility' | 'partners'>('facility');

  // Facility Info Form States
  const [businessName, setBusinessName] = useState('360 Club Box');
  const [phone, setPhone] = useState('9876543210');
  const [address, setAddress] = useState('Sector 5, Sports Complex, Mumbai');
  const [opHours, setOpHours] = useState('06:00 AM - 09:00 PM');
  const [opStartHour, setOpStartHour] = useState('06:00');
  const [opEndHour, setOpEndHour] = useState('22:00');
  
  // Custom Grounds configuration (Edit prices)
  const [globalRate, setGlobalRate] = useState('1200');
  const [globalSlotPricing, setGlobalSlotPricing] = useState({
    weekday_daytime: '600',
    weekday_nighttime: '1000',
    weekend_daytime: '700',
    weekend_nighttime: '1200'
  });
  const [rates, setRates] = useState<Record<string, string>>({});
  const [slotPricing, setSlotPricing] = useState<Record<string, {
    weekday_daytime: string;
    weekday_nighttime: string;
    weekend_daytime: string;
    weekend_nighttime: string;
  }>>({});
  const [updating, setUpdating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Partner Management States
  const [partners, setPartners] = useState<User[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [partnerEmail, setPartnerEmail] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [partnerPassword, setPartnerPassword] = useState('');
  const [partnerAdding, setPartnerAdding] = useState(false);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  const [partnerSuccess, setPartnerSuccess] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const g = await getGrounds();
        setGrounds(g);
        
        // Map rate strings
        const initialRates: typeof rates = {};
        let initialGlobalRate = '1200';
        if (g.length > 0) {
          initialGlobalRate = g[0].hourly_rate.toString();
        }
        g.forEach(item => {
          initialRates[item.id] = item.hourly_rate.toString();
        });
        setRates(initialRates);
        setGlobalRate(initialGlobalRate);

        // Load custom slot rates pricing
        let initialSlotPricing: typeof slotPricing = {};
        if (typeof window !== 'undefined') {
          const storedSlotPricing = localStorage.getItem('turf_slot_pricing');
          if (storedSlotPricing) {
            try {
              initialSlotPricing = JSON.parse(storedSlotPricing);
            } catch (err) {
              console.error('Failed to parse turf_slot_pricing', err);
            }
          }
        }
        
        // Seed defaults if empty
        g.forEach(item => {
          if (!initialSlotPricing[item.id]) {
            initialSlotPricing[item.id] = {
              weekday_daytime: '600',
              weekday_nighttime: '1000',
              weekend_daytime: '700',
              weekend_nighttime: '1200'
            };
          }
        });
        setSlotPricing(initialSlotPricing);

        if (g.length > 0 && initialSlotPricing[g[0].id]) {
          setGlobalSlotPricing(initialSlotPricing[g[0].id]);
        }

        // Retrieve facility name from localStorage if saved
        if (typeof window !== 'undefined') {
          const storedName = localStorage.getItem('turf_facility_name');
          if (storedName) {
            setBusinessName(storedName);
          }
          const storedStart = localStorage.getItem('turf_operating_start');
          const storedEnd = localStorage.getItem('turf_operating_end');
          if (storedStart) setOpStartHour(storedStart);
          if (storedEnd) setOpEndHour(storedEnd);
        }

        // Fetch partners if logged-in user is admin
        if (user?.role === 'admin') {
          setPartnersLoading(true);
          const p = await getPartners();
          setPartners(p);
          setPartnersLoading(false);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.role !== 'admin') return;

    setUpdating(true);
    setSuccessMsg(null);

    // Update in Supabase
    try {
      await updateGroundsRate(Number(globalRate));
    } catch (dbErr) {
      console.error('Failed to update grounds in Supabase:', dbErr);
    }

    // Mock update: Write updated ground rates and slot rates to localstorage
    setTimeout(async () => {
      try {
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('turf_grounds');
          if (stored) {
            const currentGrounds: Ground[] = JSON.parse(stored);
            const updated = currentGrounds.map(g => ({
              ...g,
              hourly_rate: Number(globalRate)
            }));
            localStorage.setItem('turf_grounds', JSON.stringify(updated));
            setGrounds(updated);
          }
          
          // Save slot pricing rules globally for all grounds
          const newSlotPricing: typeof slotPricing = {};
          grounds.forEach(g => {
            newSlotPricing[g.id] = globalSlotPricing;
          });
          localStorage.setItem('turf_slot_pricing', JSON.stringify(newSlotPricing));
          setSlotPricing(newSlotPricing);

          // Save facility info
          localStorage.setItem('turf_facility_name', businessName);
          localStorage.setItem('turf_operating_start', opStartHour);
          localStorage.setItem('turf_operating_end', opEndHour);
        }

        await logActivity('Updated turf configuration & hourly rates', user?.email);
        setSuccessMsg('Turf configurations updated successfully');
      } catch (err) {
        console.error(err);
      } finally {
        setUpdating(false);
      }
    }, 600);
  };

  const handleAddPartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.role !== 'admin') return;

    setPartnerAdding(true);
    setPartnerError(null);
    setPartnerSuccess(null);

    try {
      if (!partnerEmail.trim() || !partnerPhone.trim() || !partnerPassword.trim()) {
        throw new Error('Please fill in all fields (Email, Phone, Password)');
      }
      if (!partnerPhone.match(/^\d{10}$/)) {
        throw new Error('Phone number must be exactly 10 digits');
      }
      if (partnerPassword.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      // Check if phone number already registered
      const existingProfile = await getUserProfileByPhone(partnerPhone);
      if (existingProfile) {
        throw new Error('A user profile with this phone number already exists.');
      }

      let newUserId = `partner_${Date.now()}`;

      // Sign up in Supabase using secondary client so we don't log out the admin
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (supabaseUrl && supabaseAnonKey) {
        const secondaryClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        });

        const { data: signUpData, error: signUpError } = await secondaryClient.auth.signUp({
          email: partnerEmail,
          password: partnerPassword,
        });

        if (signUpError) {
          throw new Error(signUpError.message);
        }
        if (signUpData.user) {
          newUserId = signUpData.user.id;
        }
      }

      // Save user profile in DB users table
      await createUserProfile({
        id: newUserId,
        email: partnerEmail,
        phone: partnerPhone,
        role: 'partner'
      });

      await logActivity(`Admin added partner account: ${partnerEmail} (${partnerPhone})`, user?.email);
      setPartnerSuccess('Partner user registered successfully!');
      setPartnerEmail('');
      setPartnerPhone('');
      setPartnerPassword('');

      // Reload partner list
      const p = await getPartners();
      setPartners(p);
    } catch (err: any) {
      setPartnerError(err.message || 'Failed to register partner account');
    } finally {
      setPartnerAdding(false);
    }
  };

  const handleRateChange = (groundId: string, value: string) => {
    setRates({
      ...rates,
      [groundId]: value.replace(/\D/g, '')
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl text-left">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Turf Settings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Configure operational hours, brand details, and manage team accounts</p>
        </div>

        {/* Tab Buttons */}
        {user?.role === 'admin' && (
          <div className="border-b border-border flex gap-4 shrink-0">
            <button
              onClick={() => setActiveTab('facility')}
              className={`pb-3 text-xs font-bold border-b-2 px-1 capitalize transition-all cursor-pointer ${
                activeTab === 'facility' 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              General & Rates
            </button>
            <button
              onClick={() => setActiveTab('partners')}
              className={`pb-3 text-xs font-bold border-b-2 px-1 capitalize transition-all cursor-pointer ${
                activeTab === 'partners' 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              Partner Accounts
            </button>
          </div>
        )}

        {/* TAB 1: FACILITY & RATES CONFIGURATION */}
        {activeTab === 'facility' && (
          <div className="space-y-6 animate-fade-in">
            {successMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-6">
              {/* Ground Rates Grid */}
              <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm space-y-4">
                <h2 className="font-bold text-sm text-foreground flex items-center gap-1.5 border-b border-border pb-3">
                  <Building className="h-4.5 w-4.5 text-primary" /> Turf Boxes & Rates
                </h2>

                {loading ? (
                  <div className="h-20 flex items-center justify-center">
                    <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-xs font-black text-foreground">Global Turf Pricing Configuration</h3>
                        <p className="text-[10px] text-muted-foreground font-semibold">Configure the pricing rules applied globally to all boxes based on day and time</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5 items-end">
                        {/* Base hourly rate */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Base Hourly Rate</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">₹</span>
                            <input
                              type="text"
                              disabled={user?.role !== 'admin'}
                              value={globalRate}
                              onChange={(e) => setGlobalRate(e.target.value.replace(/\D/g, ''))}
                              className="w-full pl-7 pr-3 py-2 bg-muted/20 border border-border rounded-xl text-xs font-bold text-foreground focus:bg-card focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Weekday Daytime */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Weekday Day (6am-6pm)</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">₹</span>
                            <input
                              type="text"
                              disabled={user?.role !== 'admin'}
                              value={globalSlotPricing.weekday_daytime}
                              onChange={(e) => {
                                setGlobalSlotPricing({
                                  ...globalSlotPricing,
                                  weekday_daytime: e.target.value.replace(/\D/g, '')
                                });
                              }}
                              className="w-full pl-7 pr-3 py-2 bg-muted/20 border border-border rounded-xl text-xs font-bold text-foreground focus:bg-card focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Weekday Nighttime */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Weekday Night (6pm-6am)</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">₹</span>
                            <input
                              type="text"
                              disabled={user?.role !== 'admin'}
                              value={globalSlotPricing.weekday_nighttime}
                              onChange={(e) => {
                                setGlobalSlotPricing({
                                  ...globalSlotPricing,
                                  weekday_nighttime: e.target.value.replace(/\D/g, '')
                                });
                              }}
                              className="w-full pl-7 pr-3 py-2 bg-muted/20 border border-border rounded-xl text-xs font-bold text-foreground focus:bg-card focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Weekend Daytime */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Weekend Day (6am-6pm)</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">₹</span>
                            <input
                              type="text"
                              disabled={user?.role !== 'admin'}
                              value={globalSlotPricing.weekend_daytime}
                              onChange={(e) => {
                                setGlobalSlotPricing({
                                  ...globalSlotPricing,
                                  weekend_daytime: e.target.value.replace(/\D/g, '')
                                });
                              }}
                              className="w-full pl-7 pr-3 py-2 bg-muted/20 border border-border rounded-xl text-xs font-bold text-foreground focus:bg-card focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Weekend Nighttime */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Weekend Night (6pm-6am)</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">₹</span>
                            <input
                              type="text"
                              disabled={user?.role !== 'admin'}
                              value={globalSlotPricing.weekend_nighttime}
                              onChange={(e) => {
                                setGlobalSlotPricing({
                                  ...globalSlotPricing,
                                  weekend_nighttime: e.target.value.replace(/\D/g, '')
                                });
                              }}
                              className="w-full pl-7 pr-3 py-2 bg-muted/20 border border-border rounded-xl text-xs font-bold text-foreground focus:bg-card focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Operational & Facility info */}
              <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm space-y-5">
                <h2 className="font-bold text-sm text-foreground flex items-center gap-1.5 border-b border-border pb-3">
                  <SettingsIcon className="h-4.5 w-4.5 text-primary" /> Facility Metadata
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Business Brand Name</label>
                    <input
                      type="text"
                      disabled={user?.role !== 'admin'}
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-muted/20 focus:bg-card focus:outline-none text-xs font-semibold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Support Hotline</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" /></span>
                      <input
                        type="text"
                        disabled={user?.role !== 'admin'}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-border bg-muted/20 focus:bg-card focus:outline-none text-xs font-semibold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 col-span-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-muted-foreground">Operating Time Range</label>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /></span>
                        <select
                          disabled={user?.role !== 'admin'}
                          value={opStartHour}
                          onChange={(e) => {
                            setOpStartHour(e.target.value);
                            // Ensure start < end
                            const startH = parseInt(e.target.value.split(':')[0]);
                            const endH = parseInt(opEndHour.split(':')[0]);
                            if (startH >= endH) {
                              const nextH = Math.min(24, startH + 1);
                              setOpEndHour(`${nextH.toString().padStart(2, '0')}:00`);
                            }
                          }}
                          className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-border bg-muted/20 focus:bg-card focus:outline-none text-xs font-semibold"
                        >
                          {Array.from({ length: 24 }, (_, i) => {
                            const val = `${i.toString().padStart(2, '0')}:00`;
                            const display = i === 0 ? '12:00 AM' : i === 12 ? '12:00 PM' : i > 12 ? `${i - 12}:00 PM` : `${i}:00 AM`;
                            return <option key={val} value={val}>{display} (Start)</option>;
                          })}
                        </select>
                      </div>
                      <span className="text-xs text-muted-foreground font-semibold">to</span>
                      <div className="relative flex-1">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" /></span>
                        <select
                          disabled={user?.role !== 'admin'}
                          value={opEndHour}
                          onChange={(e) => {
                            setOpEndHour(e.target.value);
                            // Ensure end > start
                            const endH = parseInt(e.target.value.split(':')[0]);
                            const startH = parseInt(opStartHour.split(':')[0]);
                            if (endH <= startH) {
                              const prevH = Math.max(0, endH - 1);
                              setOpStartHour(`${prevH.toString().padStart(2, '0')}:00`);
                            }
                          }}
                          className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-border bg-muted/20 focus:bg-card focus:outline-none text-xs font-semibold"
                        >
                          {Array.from({ length: 24 }, (_, i) => {
                            const hr = i + 1;
                            const val = `${hr.toString().padStart(2, '0')}:00`;
                            const display = hr === 12 ? '12:00 PM' : hr === 24 ? '12:00 AM' : hr > 12 ? `${hr - 12}:00 PM` : `${hr}:00 AM`;
                            return <option key={val} value={val}>{display} (End)</option>;
                          })}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">Physical Address</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /></span>
                      <input
                        type="text"
                        disabled={user?.role !== 'admin'}
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-border bg-muted/20 focus:bg-card focus:outline-none text-xs font-semibold"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Access Control Information */}
              <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm space-y-3.5 text-xs text-muted-foreground">
                <h3 className="font-bold text-xs text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                  <Shield className="h-4 w-4 text-primary" /> Role Permissions Scope
                </h3>
                <p>Your current session is authenticated as a <span className="font-bold text-primary">{user?.role === 'admin' ? 'Turf Owner (Admin)' : 'Staff Member (Partner)'}</span> account.</p>
                {user?.role === 'partner' ? (
                  <div className="p-3 bg-amber-50 border border-amber-250 text-amber-800 rounded-xl flex items-start gap-2">
                    <AlertCircle className="h-4.5 w-4.5 shrink-0 text-amber-600 mt-0.5" />
                    <span>Rate configurations and brand metadata edits are disabled for partner accounts. Please log in as Admin to save settings changes.</span>
                  </div>
                ) : (
                  <p>You have write permissions for all fields. Rate changes will automatically affect any new bookings generated inside the turf scheduler.</p>
                )}
              </div>

              {/* Action Footer */}
              {user?.role === 'admin' && (
                <button
                  type="submit"
                  disabled={updating}
                  className="py-3 px-5 bg-primary hover:bg-primary/95 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-primary/10 transition-transform active:scale-95 disabled:opacity-75"
                >
                  {updating ? (
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Settings Details
                    </>
                  )}
                </button>
              )}
            </form>
          </div>
        )}

        {/* TAB 2: PARTNER ACCOUNTS MANAGEMENT (Admin Only) */}
        {activeTab === 'partners' && user?.role === 'admin' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start animate-fade-in">
            {/* Form Column */}
            <div className="lg:col-span-1 bg-card border border-border/80 rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="font-bold text-sm text-foreground flex items-center gap-1.5 border-b border-border pb-3">
                <Plus className="h-4.5 w-4.5 text-primary" /> Register Partner
              </h2>

              {partnerSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" />
                  <span>{partnerSuccess}</span>
                </div>
              )}

              {partnerError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <AlertCircle className="h-4.5 w-4.5 text-red-600 shrink-0" />
                  <span>{partnerError}</span>
                </div>
              )}

              <form onSubmit={handleAddPartner} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Email Address</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" /></span>
                    <input
                      type="email"
                      required
                      placeholder="partner@example.com"
                      value={partnerEmail}
                      onChange={(e) => setPartnerEmail(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-border bg-muted/20 focus:bg-card focus:outline-none text-xs font-semibold"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Mobile Phone</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" /></span>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      placeholder="10-digit phone number"
                      value={partnerPhone}
                      onChange={(e) => setPartnerPhone(e.target.value.replace(/\D/g, ''))}
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-border bg-muted/20 focus:bg-card focus:outline-none text-xs font-semibold font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Login Password</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs text-muted-foreground"><Key className="h-3.5 w-3.5" /></span>
                    <input
                      type="password"
                      required
                      placeholder="Minimum 6 characters"
                      value={partnerPassword}
                      onChange={(e) => setPartnerPassword(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-border bg-muted/20 focus:bg-card focus:outline-none text-xs font-semibold"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={partnerAdding}
                  className="w-full py-2.5 px-4 bg-primary hover:bg-primary/95 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-primary/10 transition-transform active:scale-95 disabled:opacity-75"
                >
                  {partnerAdding ? (
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Add Partner Account
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* List Column */}
            <div className="lg:col-span-2 bg-card border border-border/80 rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="font-bold text-sm text-foreground flex items-center gap-1.5 border-b border-border pb-3">
                <UsersIcon className="h-4.5 w-4.5 text-primary" /> Active Partners ({partners.length})
              </h2>

              {partnersLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs text-muted-foreground">Loading accounts...</span>
                </div>
              ) : partners.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground italic border border-dashed border-border rounded-xl">
                  No partners registered yet. Use the form on the left to add your first partner.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-border bg-muted/10 text-[9px] font-bold text-muted-foreground uppercase tracking-wider text-left">
                        <th className="py-2.5 px-3">Email Account</th>
                        <th className="py-2.5 px-3">Phone Number</th>
                        <th className="py-2.5 px-3">Role Scope</th>
                        <th className="py-2.5 px-3">Created On</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-xs text-foreground font-semibold">
                      {partners.map(p => (
                        <tr key={p.id} className="hover:bg-muted/10">
                          <td className="py-3 px-3 font-medium text-foreground">{p.email}</td>
                          <td className="py-3 px-3 font-mono text-muted-foreground">{p.phone}</td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded-md border border-blue-150 text-[10px] font-extrabold uppercase">
                              {p.role}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-[10px] text-muted-foreground/80">
                            {new Date(p.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
