'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Contractor, ServiceCategory, Region } from '@groupio/types';

const profileSchema = z.object({
  businessName: z.string().min(2, 'Business name is required'),
  contactName: z.string().min(2, 'Contact name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().regex(/^0\d{8,9}$/, 'Invalid Israeli phone number'),
  description: z.string().min(50, 'Description must be at least 50 characters'),
  categories: z.array(z.string()).min(1, 'Select at least one category'),
  regions: z.array(z.string()).min(1, 'Select at least one region'),
  yearsExperience: z.number().min(0, 'Years must be positive'),
  employeeCount: z.number().min(1, 'At least 1 employee'),
  licenseNumber: z.string().optional(),
  insuranceExpiry: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
});

type ProfileForm = z.infer<typeof profileSchema>;

export default function ContractorProfilePage() {
  const t = useTranslations('contractor.profile');
  const [contractor, setContractor] = useState<Contractor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'documents' | 'settings'>('info');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
  });

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/contractor/profile');
        if (res.ok) {
          const data = await res.json();
          setContractor(data);
          reset(data);
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfile();
  }, [reset]);

  async function onSubmit(data: ProfileForm) {
    setIsSaving(true);
    try {
      const res = await fetch('/api/contractor/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const updated = await res.json();
        setContractor(updated);
        reset(updated);
        alert(t('saveSuccess'));
      } else {
        alert(t('saveError'));
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert(t('saveError'));
    } finally {
      setIsSaving(false);
    }
  }

  const categories: ServiceCategory[] = [
    'ac_installation',
    'kitchen',
    'electrical',
    'plumbing',
    'painting',
    'flooring',
    'windows',
    'security',
  ];

  const regions: Region[] = [
    'center',
    'tel_aviv',
    'jerusalem',
    'north',
    'south',
    'sharon',
    'shfela',
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl" dir="rtl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600 mt-2">{t('subtitle')}</p>
      </header>

      {/* Trust Score Banner */}
      <div className="bg-gradient-to-l from-sky-500 to-sky-600 rounded-xl p-6 mb-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{t('trustScore.title')}</h2>
            <p className="text-sky-100 mt-1">{t('trustScore.description')}</p>
          </div>
          <div className="text-center">
            <p className="text-5xl font-bold">{contractor?.trustScore ?? 0}</p>
            <p className="text-sky-100">/100</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        {(['info', 'documents', 'settings'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === tab
                ? 'text-sky-600 border-b-2 border-sky-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === 'info' && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Business Info */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-xl font-semibold mb-4">{t('sections.business')}</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('fields.businessName')} *
                </label>
                <input
                  type="text"
                  {...register('businessName')}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                />
                {errors.businessName && (
                  <p className="text-red-500 text-sm mt-1">{errors.businessName.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('fields.contactName')} *
                </label>
                <input
                  type="text"
                  {...register('contactName')}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                />
                {errors.contactName && (
                  <p className="text-red-500 text-sm mt-1">{errors.contactName.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('fields.email')} *
                </label>
                <input
                  type="email"
                  {...register('email')}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                />
                {errors.email && (
                  <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('fields.phone')} *
                </label>
                <input
                  type="tel"
                  {...register('phone')}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                  dir="ltr"
                />
                {errors.phone && (
                  <p className="text-red-500 text-sm mt-1">{errors.phone.message}</p>
                )}
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('fields.description')} *
              </label>
              <textarea
                {...register('description')}
                rows={4}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
              />
              {errors.description && (
                <p className="text-red-500 text-sm mt-1">{errors.description.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('fields.yearsExperience')} *
                </label>
                <input
                  type="number"
                  {...register('yearsExperience', { valueAsNumber: true })}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                  min={0}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('fields.employeeCount')} *
                </label>
                <input
                  type="number"
                  {...register('employeeCount', { valueAsNumber: true })}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                  min={1}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('fields.website')}
                </label>
                <input
                  type="url"
                  {...register('website')}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                  dir="ltr"
                  placeholder="https://"
                />
              </div>
            </div>
          </section>

          {/* Categories & Regions */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-xl font-semibold mb-4">{t('sections.services')}</h2>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('fields.categories')} *
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {categories.map((cat) => (
                  <label key={cat} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      value={cat}
                      {...register('categories')}
                      className="rounded border-gray-300 text-sky-500 focus:ring-sky-500"
                    />
                    <span className="text-sm text-gray-700">{t(`categories.${cat}`)}</span>
                  </label>
                ))}
              </div>
              {errors.categories && (
                <p className="text-red-500 text-sm mt-1">{errors.categories.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('fields.regions')} *
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {regions.map((reg) => (
                  <label key={reg} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      value={reg}
                      {...register('regions')}
                      className="rounded border-gray-300 text-sky-500 focus:ring-sky-500"
                    />
                    <span className="text-sm text-gray-700">{t(`regions.${reg}`)}</span>
                  </label>
                ))}
              </div>
              {errors.regions && (
                <p className="text-red-500 text-sm mt-1">{errors.regions.message}</p>
              )}
            </div>
          </section>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!isDirty || isSaving}
              className="px-8 py-3 bg-sky-500 hover:bg-sky-600 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors"
            >
              {isSaving ? t('saving') : t('save')}
            </button>
          </div>
        </form>
      )}

      {activeTab === 'documents' && (
        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-4">{t('sections.documents')}</h2>

          <div className="space-y-4">
            {/* Business License */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium">{t('documents.license')}</h3>
                <p className="text-sm text-gray-500">
                  {contractor?.licenseNumber
                    ? `${t('documents.licenseNumber')}: ${contractor.licenseNumber}`
                    : t('documents.notUploaded')}
                </p>
              </div>
              <button className="text-sky-600 hover:text-sky-700 font-medium">
                {t('documents.upload')}
              </button>
            </div>

            {/* Insurance */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium">{t('documents.insurance')}</h3>
                <p className="text-sm text-gray-500">
                  {contractor?.insuranceExpiry
                    ? `${t('documents.expiresAt')}: ${new Date(
                        contractor.insuranceExpiry
                      ).toLocaleDateString('he-IL')}`
                    : t('documents.notUploaded')}
                </p>
              </div>
              <button className="text-sky-600 hover:text-sky-700 font-medium">
                {t('documents.upload')}
              </button>
            </div>

            {/* Certifications */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium">{t('documents.certifications')}</h3>
                <p className="text-sm text-gray-500">
                  {contractor?.certifications?.length
                    ? `${contractor.certifications.length} ${t('documents.uploaded')}`
                    : t('documents.notUploaded')}
                </p>
              </div>
              <button className="text-sky-600 hover:text-sky-700 font-medium">
                {t('documents.upload')}
              </button>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'settings' && (
        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-4">{t('sections.settings')}</h2>

          <div className="space-y-6">
            {/* Notification Preferences */}
            <div>
              <h3 className="font-medium mb-3">{t('settings.notifications')}</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded border-gray-300 text-sky-500 focus:ring-sky-500"
                  />
                  <span className="text-gray-700">{t('settings.emailOffers')}</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded border-gray-300 text-sky-500 focus:ring-sky-500"
                  />
                  <span className="text-gray-700">{t('settings.smsOffers')}</span>
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    defaultChecked
                    className="rounded border-gray-300 text-sky-500 focus:ring-sky-500"
                  />
                  <span className="text-gray-700">{t('settings.whatsappOffers')}</span>
                </label>
              </div>
            </div>

            {/* Availability */}
            <div>
              <h3 className="font-medium mb-3">{t('settings.availability')}</h3>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  defaultChecked
                  className="rounded border-gray-300 text-sky-500 focus:ring-sky-500"
                />
                <span className="text-gray-700">{t('settings.acceptingOffers')}</span>
              </label>
            </div>

            {/* Danger Zone */}
            <div className="pt-6 border-t">
              <h3 className="font-medium text-red-600 mb-3">{t('settings.dangerZone')}</h3>
              <button className="text-red-600 hover:text-red-700 font-medium">
                {t('settings.deactivate')}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
