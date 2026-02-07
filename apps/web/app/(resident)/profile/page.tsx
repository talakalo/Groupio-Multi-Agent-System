'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
import { cn } from '@/lib/utils/cn';
import type { Resident } from '@groupio/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResidentProfile extends Resident {
  avatar?: string;
  language: 'he' | 'en';
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
    <label className="flex items-start justify-between py-3 cursor-pointer group">
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
    </label>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ResidentProfilePage() {
  const t = useTranslations('profile');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'personal' | 'notifications' | 'security'>('personal');

  const profileQuery = useQuery<ResidentProfile>({
    queryKey: ['resident', 'profile'],
    queryFn: async () => {
      const res = await fetch('/api/v1/resident/profile');
      if (!res.ok) throw new Error('Failed to fetch profile');
      return res.json();
    },
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
      const res = await fetch('/api/v1/resident/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          notifications,
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
            className="absolute -bottom-1 -end-1 w-8 h-8 rounded-full bg-primary-500 text-white flex items-center justify-center shadow-md hover:bg-primary-600 transition-colors"
            title={t('changeAvatar')}
          >
            <Camera className="h-4 w-4" />
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
              <input id="currentPassword" type="password" className="input-field" />
            </div>
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('newPassword')}
              </label>
              <input id="newPassword" type="password" className="input-field" />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                {t('confirmPassword')}
              </label>
              <input id="confirmPassword" type="password" className="input-field" />
            </div>
            <button type="button" className="btn-primary text-sm">
              {t('updatePassword')}
            </button>
          </div>

          <div className="card">
            <h3 className="text-sm font-bold text-red-600 mb-2">{t('dangerZone')}</h3>
            <p className="text-xs text-gray-500 mb-4">{t('deleteAccountWarning')}</p>
            <div className="flex gap-3">
              <button type="button" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors text-sm font-medium">
                <Trash2 className="h-4 w-4" />
                {t('deleteAccount')}
              </button>
              <button type="button" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors text-sm font-medium">
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
