'use client';

// ==============================================================================
// Kumaran Chits — Staff Phone & Password Login Form
// Phone-only architecture (ADR-18), zero email fields, 2FA fork & inactivity notice.
// ==============================================================================

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, Phone, Eye, EyeOff, ShieldAlert, AlertCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { apiClient, unwrapApiResponse, KumaranApiError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

export function LoginForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();

  const setAuth = useAuthStore((state) => state.setAuth);
  const setTempToken = useAuthStore((state) => state.setTempToken);

  const [showPassword, setShowPassword] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  // Read URL query parameter for contextual notices (e.g., from inactivity guardian)
  const reason = searchParams.get('reason');
  const redirectUrl = searchParams.get('redirect') || '/dashboard';

  // ADR-18 Form Validation Schema: Strictly 10-digit Indian Mobile + min 6 char password
  const loginSchema = React.useMemo(
    () =>
      z.object({
        phone: z
          .string()
          .min(1, { message: t('phoneRequired') })
          .regex(/^[6-9]\d{9}$/, { message: t('phoneInvalid') }),
        password: z
          .string()
          .min(1, { message: t('passwordRequired') })
          .min(6, { message: t('passwordMinLength') }),
      }),
    [t],
  );

  type LoginFormValues = z.infer<typeof loginSchema>;

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      phone: '',
      password: '',
    },
  });

  // Handle phone input changes: enforce pure digits, max 10 characters
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10);
    setValue('phone', digitsOnly, { shouldValidate: true });
  };

  const onSubmit = async (values: LoginFormValues) => {
    setIsLoading(true);
    setServerError(null);

    try {
      // Call live backend: POST /api/v1/auth/web/login
      const response = await unwrapApiResponse<any>(
        apiClient.POST('/api/v1/auth/web/login', {
          body: {
            phone: values.phone,
            password: values.password,
          },
        }),
      );

      // Branch 1: Staff user requires Microsoft Authenticator 2FA
      if (response?.requireTotp && response?.tempToken) {
        setTempToken(response.tempToken);
        router.push('/2fa');
        return;
      }

      // Branch 2: Direct Authentication (Tokens issued)
      if (response?.accessToken && response?.user) {
        setAuth(response.user, {
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
        });
        router.push(redirectUrl);
        return;
      }

      // Unexpected payload fallback
      setServerError(t('invalidCredentials'));
    } catch (err: unknown) {
      if (err instanceof KumaranApiError) {
        if (err.statusCode === 401) {
          setServerError(t('invalidCredentials'));
        } else if (err.statusCode === 429) {
          setServerError(t('rateLimited'));
        } else {
          setServerError(err.message || t('invalidCredentials'));
        }
      } else {
        setServerError(t('invalidCredentials'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-slate-800 bg-slate-900/90 shadow-2xl backdrop-blur-md">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight text-slate-100">
          {t('loginTitle')}
        </CardTitle>
        <CardDescription className="text-xs text-slate-400">
          {t('loginSubtitle')}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Contextual Notice from Inactivity Guardian */}
        {reason === 'timeout' && (
          <Alert variant="destructive" className="border-amber-500/50 bg-amber-950/40 text-amber-300">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            <AlertTitle className="text-xs font-semibold">Session Expired</AlertTitle>
            <AlertDescription className="text-xs text-amber-200/90">
              {t('timeoutNotice')}
            </AlertDescription>
          </Alert>
        )}

        {reason === 'manual' && (
          <Alert className="border-slate-700 bg-slate-800/60 text-slate-300">
            <Info className="h-4 w-4 text-emerald-400" />
            <AlertDescription className="text-xs">
              {t('loggedOutNotice')}
            </AlertDescription>
          </Alert>
        )}

        {/* Server-Side Error Alert */}
        {serverError && (
          <Alert variant="destructive" className="border-red-500/50 bg-red-950/40 text-red-300">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-xs font-medium">
              {serverError}
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" data-testid="login-form">
          {/* Phone Input with +91 Visual Prefix (ADR-18 Phone-Only) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              {t('phoneLabel')}
            </label>
            <div className="relative flex rounded-md border border-slate-700 bg-slate-950 shadow-sm focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
              <div className="flex items-center border-r border-slate-800 px-3 text-xs font-semibold text-slate-400 select-none">
                <Phone className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                +91
              </div>
              <Input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder={t('phonePlaceholder')}
                {...register('phone')}
                onChange={handlePhoneChange}
                className="border-0 bg-transparent py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus-visible:ring-0"
                data-testid="phone-input"
              />
            </div>
            {errors.phone && (
              <p className="text-xs font-medium text-red-400">{errors.phone.message}</p>
            )}
          </div>

          {/* Password Input with Show/Hide Toggle */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              {t('passwordLabel')}
            </label>
            <div className="relative flex rounded-md border border-slate-700 bg-slate-950 shadow-sm focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500">
              <div className="flex items-center px-3 text-slate-500">
                <Lock className="h-4 w-4 text-slate-400" />
              </div>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder={t('passwordPlaceholder')}
                {...register('password')}
                className="border-0 bg-transparent py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus-visible:ring-0"
                data-testid="password-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="flex items-center px-3 text-slate-400 hover:text-slate-200"
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-xs font-medium text-red-400">{errors.password.message}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-emerald-500 disabled:opacity-50"
            data-testid="login-submit-button"
          >
            {isLoading ? t('signingIn') : t('loginButton')}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col border-t border-slate-800/80 pt-4 text-center">
        <p className="text-[11px] text-slate-500">
          {t('phoneOnlyNotice')}
        </p>
      </CardFooter>
    </Card>
  );
}
