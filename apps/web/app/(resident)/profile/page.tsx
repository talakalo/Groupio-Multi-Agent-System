'use client';

import type { Resident } from '@groupio/types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserCircle,
  Mail,
  Phone,
  Building2,
  Bell,
  BellOff,
  Globe,
  Shield,
  Save,
  Loader2,
  Check,
  LogOut,
  Camera,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useAuthStore } from '@/lib/stores/authStore';
import { cn } from '@/lib/utils/cn';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResidentProfile extends Resident {
  avatar?: string;
  avatarUrl?: string;
  fullName?: string;
  language: 'he' | 'en';
  preferredLanguage?: string;
  notifications: NotificationPreferences;
}

interface NotificationPreferences {
  newOffers: boolean;
  offerUpdates: boolean;
  neighborJoined: boolean;
  tierReached: boolean;
  contractorMessages: boolean;
  weeklyDigest: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Notification Toggle
// ---------------------------------------------------------------------------

function NotificationToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between py-3 cursor-pointer group">
      <div className="flex-1 pe-4">
        <p className="text-sm font-medium text-gray-900 group-hover:text-primary-600 transition-colors">
          {label}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0',
          checked ? 'bg-primary-500' : 'bg-gray-300'
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
            checked ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-1 rtl:-translate-x-1'
          )}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ResidentProfilePage() {
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const router = useRouter();
  const logoutAction = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    try {
      await logoutAction();
    } catch {
      // Ignore logout errors — always redirect to login
    }
    router.push('/login');
  };

  const [activeTab, setActiveTab] = useState<'personal' | 'notifications' | 'security'>('personal');

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    newPassword: '',
    confirm: '',
  });
  const [passwordStatus, setPasswordStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const accessToken = useAuthStore((s) => s.accessToken);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const handleAvatarUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setIsUploadingAvatar(true);
      const formData = new FormData();
      formData.append('file', file);

      try {
        const headers: Record<string, string> = {};
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

        const res = await fetch(`${apiBase}/api/v1/uploads/avatar`, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          setFormData((prev) => ({ ...prev, avatar: data.avatar_url, avatarUrl: data.avatar_url }));
          queryClient.invalidateQueries({ queryKey: ['resident', 'profile'] });
        }
      } catch (error) {
        console.error('Avatar upload failed:', error);
      } finally {
        setIsUploadingAvatar(false);
      }
    };
    input.click();
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.newPassword || passwordForm.newPassword !== passwordForm.confirm) return;
    setPasswordStatus('loading');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`${apiBase}/api/v1/auth/password-reset`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          current_password: passwordForm.current,
          new_password: passwordForm.newPassword,
        }),
      });

      if (res.ok) {
        setPasswordStatus('success');
        setPasswordForm({ current: '', newPassword: '', confirm: '' });
        setTimeout(() => setPasswordStatus('idle'), 3000);
      } else {
        setPasswordStatus('error');
        setTimeout(() => setPasswordStatus('idle'), 3000);
      }
    } catch {
      setPasswordStatus('error');
      setTimeout(() => setPasswordStatus('idle'), 3000);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(t('deleteAccountConfirm'));
    if (!confirmed) return;

    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      await fetch(`${apiBase}/api/v1/auth/me`, {
        method: 'DELETE',
        headers,
      });

      await logoutAction();
      router.push('/login');
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
  };

  const profileQuery = useQuery<ResidentProfile>({
    queryKey: ['resident', 'profile'],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const res = await fetch(`${apiBase}/api/v1/auth/me`, { headers });
      if (!res.ok) throw new Error('Failed to fetch profile');
      const data = await res.json();
      return {
        ...data,
        fullName: data.full_name ?? data.fullName ?? '',
        phone: data.phone ?? '',
        preferredLanguage: data.preferred_language ?? data.preferredLanguage ?? 'he',
        avatarUrl: data.avatar_url ?? data.avatarUrl ?? '',
        buildingName: data.building_name ?? data.buildingName ?? '',
        apartmentNumber: data.apartment_number ?? data.apartmentNumber ?? '',
      } as ResidentProfile;
    },
    enabled: !!accessToken,
  });

  const [formData, setFormData] = useState<Partial<ResidentProfile>>({});

  // Merge fetched data with local edits
  const profile: Partial<ResidentProfile> = {
    ...profileQuery.data,
    ...formData,
  };

  const [notifications, setNotifications] = useState<NotificationPreferences>({
    newOffers: true,
    offerUpdates: true,
    neighborJoined: true,
    tierReached: true,
    contractorMessages: true,
    weeklyDigest: false,
    pushEnabled: true,
    emailEnabled: true,
    whatsappEnabled: false,
    ...profileQuery.data?.notifications,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const userId = profileQuery.data?.id;
      if (!userId) throw new Error('No user ID');
      const res = await fetch(`${apiBase}/api/v1/auth/me`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          full_name: formData.fullName ?? formData.name,
          phone: formData.phone,
          preferred_language: formData.preferredLanguage ?? formData.language,
          avatar_url: formData.avatarUrl ?? formData.avatar,
        }),
      });
      if (!res.ok) throw new Error('Failed to save profile');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resident', 'profile'] });
    },
  });

  const updateField = (field: keyof ResidentProfile, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-500 text-sm mt-1">{t('subtitle')}</p>
      </div>

      {/* Avatar section */}
      <div className="card flex items-center gap-4">
        <div className="relative">
          <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center">
            {profile.avatar ? (
              <img
                src={profile.avatar}
                alt={profile.name ?? ''}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <UserCircle className="h-12 w-12 text-primary-400" />
            )}
          </div>
          <button
            type="button"
            onClick={handleAvatarUpload}
            disabled={isUploadingAvatar}
            className="absolute -bottom-1 -end-1 w-8 h-8 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-md hover:bg-primary-600 transition-colors disabled:opacity-50"
            title={t('changeAvatar')}
          >
            {isUploadingAvatar ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
          </button>
        </div>
        <div>
          <p className="font-bold text-gray-900 text-lg">{profile.name ?? '-'}</p>
          <p className="text-sm text-gray-500">{profile.email ?? '-'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(
          [
            { key: 'personal', icon: UserCircle, label: t('personalInfo') },
            { key: 'notifications', icon: Bell, label: t('notifications') },
            { key: 'security', icon: Shield, label: t('security') },
          ] as const
        ).map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px',
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <TabIcon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Personal info tab */}
      {activeTab === 'personal' && (
        <div className="card space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('fullName')}
            </label>
            <input
              id="name"
              type="text"
              value={profile.name ?? ''}
              onChange={(e) => updateField('name', e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('email')}
            </label>
            <div className="relative">
              <Mail className="absolute top-3.5 end-3 h-4 w-4 text-gray-400" />
              <input
                id="email"
                type="email"
                value={profile.email ?? ''}
                onChange={(e) => updateField('email', e.target.value)}
                className="input-field pe-10"
              />
            </div>
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('phone')}
            </label>
            <div className="relative">
              <Phone className="absolute top-3.5 end-3 h-4 w-4 text-gray-400" />
              <input
                id="phone"
                type="tel"
                value={profile.phone ?? ''}
                onChange={(e) => updateField('phone', e.target.value)}
                className="input-field pe-10"
              />
            </div>
          </div>

          <div>
            <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('language')}
            </label>
            <div className="relative">
              <Globe className="absolute top-3.5 end-3 h-4 w-4 text-gray-400" />
              <select
                id="language"
                value={profile.language ?? 'he'}
                onChange={(e) => updateField('language' as keyof ResidentProfile, e.target.value)}
                className="input-field pe-10"
              >
                <option value="he">{t('hebrew')}</option>
                <option value="en">{t('english')}</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-500 p-3 bg-gray-50 rounded-xl">
            <Building2 className="h-4 w-4" />
            <span>{t('building')}: {profile.buildingId ?? t('notAssigned')}</span>
          </div>
        </div>
      )}

      {/* Notifications tab */}
      {activeTab === 'notifications' && (
        <div className="card">
          <h3 className="text-sm font-bold text-gray-900 mb-1">{t('offerNotifications')}</h3>
          <p className="text-xs text-gray-500 mb-3">{t('offerNotificationsDescription')}</p>
          <div className="divide-y divide-gray-50">
            <NotificationToggle
              label={t('newOffers')}
              description={t('newOffersDescription')}
              checked={notifications.newOffers}
              onChange={(v) => setNotifications((prev) => ({ ...prev, newOffers: v }))}
            />
            <NotificationToggle
              label={t('offerUpdates')}
              description={t('offerUpdatesDescription')}
              checked={notifications.offerUpdates}
              onChange={(v) => setNotifications((prev) => ({ ...prev, offerUpdates: v }))}
            />
            <NotificationToggle
              label={t('neighborJoined')}
              description={t('neighborJoinedDescription')}
              checked={notifications.neighborJoined}
              onChange={(v) => setNotifications((prev) => ({ ...prev, neighborJoined: v }))}
            />
            <NotificationToggle
              label={t('tierReached')}
              description={t('tierReachedDescription')}
              checked={notifications.tierReached}
              onChange={(v) => setNotifications((prev) => ({ ...prev, tierReached: v }))}
            />
            <NotificationToggle
              label={t('contractorMessages')}
              description={t('contractorMessagesDescription')}
              checked={notifications.contractorMessages}
              onChange={(v) => setNotifications((prev) => ({ ...prev, contractorMessages: v }))}
            />
          </div>

          <div className="border-t border-gray-100 mt-4 pt-4">
            <h3 className="text-sm font-bold text-gray-900 mb-1">{t('channels')}</h3>
            <p className="text-xs text-gray-500 mb-3">{t('channelsDescription')}</p>
            <div className="divide-y divide-gray-50">
              <NotificationToggle
                label={t('pushNotifications')}
                description={t('pushNotificationsDescription')}
                checked={notifications.pushEnabled}
                onChange={(v) => setNotifications((prev) => ({ ...prev, pushEnabled: v }))}
              />
              <NotificationToggle
                label={t('emailNotifications')}
                description={t('emailNotificationsDescription')}
                checked={notifications.emailEnabled}
                onChange={(v) => setNotifications((prev) => ({ ...prev, emailEnabled: v }))}
              />
              <NotificationToggle
                label={t('whatsappNotifications')}
                description={t('whatsappNotificationsDescription')}
                checked={notifications.whatsappEnabled}
                onChange={(v) => setNotifications((prev) => ({ ...prev, whatsappEnabled: v }))}
              />
            </div>
          </div>

          <div className="border-t border-gray-100 mt-4 pt-4">
            <NotificationToggle
              label={t('weeklyDigest')}
              description={t('weeklyDigestDescription')}
              checked={notifications.weeklyDigest}
              onChange={(v) => setNotifications((prev) => ({ ...prev, weeklyDigest: v }))}
            />
          </div>
        </div>
      )}

      {/* Security tab */}
      {activeTab === 'security' && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <h3 className="text-sm font-bold text-gray-900">{t('changePassword')}</h3>
            <div>
              <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('currentPassword')}
              </label>
              <input
                id="currentPassword"
                type="password"
                className="input-field"
                value={passwordForm.current}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, current: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('newPassword')}
              </label>
              <input
                id="newPassword"
                type="password"
                className="input-field"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('confirmPassword')}
              </label>
              <input
                id="confirmPassword"
                type="password"
                className="input-field"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirm: e.target.value }))}
              />
              {passwordForm.confirm && passwordForm.newPassword !== passwordForm.confirm && (
                <p className="text-xs text-red-500 mt-1">{t('passwordMismatch')}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={handlePasswordChange}
                disabled={
                  passwordStatus === 'loading' ||
                  !passwordForm.current ||
                  !passwordForm.newPassword ||
                  passwordForm.newPassword !== passwordForm.confirm
                }
              >
                {passwordStatus === 'loading' ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('updating')}
                  </span>
                ) : (
                  t('updatePassword')
                )}
              </button>
              {passwordStatus === 'success' && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <Check className="h-4 w-4" />
                  {t('passwordUpdated')}
                </span>
              )}
              {passwordStatus === 'error' && (
                <span className="text-sm text-red-600">{t('passwordUpdateFailed')}</span>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-bold text-red-600 mb-2">{t('dangerZone')}</h3>
            <p className="text-xs text-gray-500 mb-4">{t('deleteAccountWarning')}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDeleteAccount}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors text-sm font-medium"
              >
                <Trash2 className="h-4 w-4" />
                {t('deleteAccount')}
              </button>
              <button type="button" onClick={handleLogout} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium">
                <LogOut className="h-4 w-4" />
                {t('logout')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save button (fixed at bottom) */}
      <div className="sticky bottom-4">
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="btn-primary w-full flex items-center justify-center gap-2 shadow-lg"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>{tCommon('loading')}</span>
            </>
          ) : saveMutation.isSuccess ? (
            <>
              <Check className="h-5 w-5" />
              <span>{t('saved')}</span>
            </>
          ) : (
            <>
              <Save className="h-5 w-5" />
              <span>{tCommon('save')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
