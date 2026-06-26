'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToastStore } from '@/lib/store/toast-store';
import { sanitizeInput, checkRateLimit, resetRateLimit } from '@/lib/security';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as zod from 'zod';
import { LogIn, Key, Mail, ShieldAlert, UserCheck, Phone, ArrowLeft } from 'lucide-react';
import { logActivity, getUserProfileByPhone } from '@/lib/db/db-service';
import { supabase, hasSupabaseCredentials } from '@/lib/db/supabase';

const loginSchema = zod.object({
  phone: zod.string().regex(/^\d{10}$/, 'Please enter a valid 10-digit phone number'),
  password: zod.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormInputs = zod.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { user, login, initialize } = useAuthStore();
  const { showToast } = useToastStore();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Forgot Password State
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const raw = localStorage.getItem('rate_limit_login_attempts');
      if (raw) {
        try {
          const data = JSON.parse(raw);
          if (data.lockoutUntil > now) {
            setLockoutSeconds(Math.ceil((data.lockoutUntil - now) / 1000));
          } else {
            setLockoutSeconds(0);
          }
        } catch (e) {}
      } else {
        setLockoutSeconds(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);


  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    // If already logged in, redirect
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormInputs>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      phone: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormInputs) => {
    setErrorMsg(null);

    // Rate Limiting Check
    const rateCheck = checkRateLimit('login_attempts', 5, 60000, 60000);
    if (!rateCheck.allowed) {
      const errMsg = `Too many login attempts. Please try again in ${rateCheck.retryAfterSeconds} seconds.`;
      setErrorMsg(errMsg);
      showToast(errMsg, 'error');
      return;
    }

    setLoading(true);

    const sanitizedPhone = sanitizeInput(data.phone.trim());
    const sanitizedPassword = sanitizeInput(data.password.trim());

    try {
      // 1. Direct local admin check
      if (sanitizedPhone === '9909108527' && sanitizedPassword === 'Admin@123') {
        login('dhameliyaavadh592@gmail.com', 'admin');
        await logActivity('Admin logged in', 'dhameliyaavadh592@gmail.com');
        resetRateLimit('login_attempts');
        showToast('Welcome back, Admin!', 'success');
        router.push('/dashboard');
        return;
      }

      // 2. Fetch user profile from custom users table by phone number
      const profile = await getUserProfileByPhone(sanitizedPhone);
      if (!profile) {
        throw new Error('No user registered with this phone number.');
      }

      // 3. Attempt auth sign-in with Supabase using mapped email
      if (hasSupabaseCredentials() && supabase) {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: profile.email,
          password: sanitizedPassword,
        });

        if (authError) {
          throw new Error(authError.message);
        }

        login(profile.email, profile.role);
        await logActivity(`User logged in (${profile.role})`, profile.email);
        resetRateLimit('login_attempts');
        showToast(`Welcome back, ${profile.role === 'admin' ? 'Admin' : 'Partner'}!`, 'success');
        router.push('/dashboard');
      } else {
        // Fallback local mode (e.g. if offline/mocking and password is correct for admin/partner)
        // Check simple pass verification (for demo/testing purpose)
        if ((sanitizedPhone === '9909108527' && sanitizedPassword === 'Admin@123') || 
            (profile.role === 'partner' && sanitizedPassword === 'partner123')) {
          login(profile.email, profile.role);
          await logActivity(`User logged in (Local fallback: ${profile.role})`, profile.email);
          resetRateLimit('login_attempts');
          showToast(`Welcome back, ${profile.role === 'admin' ? 'Admin' : 'Partner'}!`, 'success');
          router.push('/dashboard');
        } else {
          throw new Error('Invalid phone number or password.');
        }
      }
    } catch (err: any) {
      const errMsg = err.message || 'An error occurred during sign in';
      setErrorMsg(errMsg);
      showToast(errMsg, 'error');
    } finally {
      setLoading(false);
    }
  };


  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetLoading(true);
    setResetSuccess(null);
    setResetError(null);

    try {
      if (!resetEmail.trim() || !resetEmail.includes('@')) {
        throw new Error('Please enter a valid email address');
      }

      if (hasSupabaseCredentials() && supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
          redirectTo: `${window.location.origin}/login/reset-password`,
        });

        if (error) {
          throw new Error(error.message);
        }

        setResetSuccess('Password reset link sent! Please check your email inbox.');
      } else {
        setResetSuccess('Mock Mode: Password reset link sent! Redirect target: /login/reset-password');
      }
    } catch (err: any) {
      setResetError(err.message || 'Failed to send password reset email');
    } finally {
      setResetLoading(false);
    }
  };

  const handleQuickLogin = (role: 'admin' | 'partner') => {
    if (role === 'admin') {
      setValue('phone', '9909108527');
      setValue('password', 'Admin@123');
    } else {
      setValue('phone', '9876543210'); // partner placeholder
      setValue('password', 'partner123');
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-accent/50 via-background to-background p-2 sm:p-4 font-sans">
      <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-border/80 overflow-hidden transition-all duration-300 hover:shadow-2xl">
        <div className="bg-primary p-5 sm:p-8 text-center relative overflow-hidden flex flex-col items-center">
          <div className="absolute top-0 right-0 w-24 h-24 bg-secondary/20 rounded-full blur-xl transform translate-x-8 -translate-y-8"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary/15 rounded-full blur-2xl transform -translate-x-12 translate-y-12"></div>
          
          {/* Logo element from public/logo.png */}
          <div className="z-10 mb-2 sm:mb-4 bg-white/10 p-2 sm:p-2.5 rounded-2xl backdrop-blur-sm border border-white/10">
            <img 
              src="/logo.png" 
              alt="360 Club Box Logo" 
              className="h-12 sm:h-16 w-auto object-contain max-w-[200px]"
              onError={(e) => {
                // If logo image fails, remove it so it doesn't show broken link icon
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight z-10">360 Club Box</h1>
          <p className="text-emerald-100 text-xs sm:text-sm mt-1 z-10">Booking & Management Dashboard</p>
        </div>

        <div className="p-5 sm:p-8 text-left">
          {forgotMode ? (
            /* FORGOT PASSWORD FORM */
            <div className="space-y-4 sm:space-y-5 animate-fade-in">
              <div>
                <h2 className="text-lg font-bold text-foreground">Forgot Password</h2>
                <p className="text-xs text-muted-foreground mt-1">Enter your registered email address to receive a recovery link from Supabase.</p>
              </div>

              {resetSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold">
                  {resetSuccess}
                </div>
              )}

              {resetError && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 text-xs">
                  <ShieldAlert className="h-4.5 w-4.5 shrink-0 text-red-600 mt-0.5" />
                  <span>{resetError}</span>
                </div>
              )}

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground/80 block" htmlFor="resetEmail">
                    Registered Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      id="resetEmail"
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 sm:py-2.5 rounded-xl border border-border bg-muted/30 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-[16px] sm:text-sm transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="w-full py-2.5 sm:py-3 px-4 bg-primary hover:bg-primary/95 active:bg-primary/90 text-white font-semibold rounded-xl text-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-75"
                >
                  {resetLoading ? (
                    <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setForgotMode(false);
                  setResetSuccess(null);
                  setResetError(null);
                }}
                className="w-full py-2 sm:py-2.5 px-4 border border-border hover:bg-muted text-foreground/80 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Sign In
              </button>
            </div>
          ) : (
            /* STANDARD PHONE LOGIN FORM */
            <div className="space-y-4 sm:space-y-5">
              {errorMsg && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 text-sm animate-shake">
                  <ShieldAlert className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 sm:space-y-5" autoComplete="off">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground/80 block" htmlFor="phone">
                    Phone Number
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                      <Phone className="h-4 w-4" />
                    </div>
                    <input
                      id="phone"
                      type="tel"
                      maxLength={10}
                      placeholder="Enter 10-digit mobile number"
                      className="w-full pl-10 pr-4 py-2 sm:py-2.5 rounded-xl border border-border bg-muted/30 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-[16px] sm:text-sm transition-all"
                      {...register('phone')}
                      autoComplete="new-phone"
                    />
                  </div>
                  {errors.phone && (
                    <p className="text-red-600 text-xs mt-1 pl-1">{errors.phone.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-semibold text-foreground/80 block" htmlFor="password">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setForgotMode(true)}
                      className="text-xs font-semibold text-primary hover:underline cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
                      <Key className="h-4 w-4" />
                    </div>
                    <input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-2 sm:py-2.5 rounded-xl border border-border bg-muted/30 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-[16px] sm:text-sm transition-all"
                      {...register('password')}
                      autoComplete="new-password"
                    />
                  </div>
                  {errors.password && (
                    <p className="text-red-600 text-xs mt-1 pl-1">{errors.password.message}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || lockoutSeconds > 0}
                  className="w-full py-2.5 sm:py-3 px-4 bg-primary hover:bg-primary/95 active:bg-primary/90 text-white font-semibold rounded-xl text-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-primary/10 disabled:opacity-75 disabled:cursor-not-allowed hover:scale-[1.01]"
                >
                  {lockoutSeconds > 0 ? (
                    `Locked out for ${lockoutSeconds}s`
                  ) : loading ? (
                    <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      Sign In
                    </>
                  )}
                </button>

              </form>

              <div className="mt-5 sm:mt-8 pt-4 sm:pt-6 border-t border-border/80">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-center mb-4">
                  Quick Access (Click to fill)
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('admin')}
                    className="py-2 sm:py-2.5 px-3 border border-primary/25 bg-accent/40 hover:bg-accent/80 text-primary rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer hover:border-primary/50"
                  >
                    <UserCheck className="h-3.5 w-3.5 text-primary" />
                    Owner Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickLogin('partner')}
                    className="py-2 sm:py-2.5 px-3 border border-border bg-card hover:bg-muted/40 text-foreground/80 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    Partner Staff
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
