'use client';

import type { Contractor, ServiceCategory, Region } from '@groupio/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAuthStore } from '@/lib/stores/authStore';

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
  const accessToken = useAuthStore((s) => s.accessToken);
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

  const [contractorId, setContractorId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<string | null>(null);

  async function handleDocumentUpload(docType: 'license' | 'insurance' | 'certifications') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setIsUploading(docType);
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const token = accessToken;
      const formData = new FormData();
      formData.append('file', file);

      try {
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${apiBase}/api/v1/uploads/contractor-docs`, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (res.ok) {
          alert(t('documents.uploadSuccess'));
          // Refresh profile to show updated documents
          window.location.reload();
        } else {
          alert(t('documents.uploadError'));
        }
      } catch (error) {
        console.error('Upload failed:', error);
        alert(t('documents.uploadError'));
      } finally {
        setIsUploading(null);
      }
    };
    input.click();
  }

  useEffect(() => {
    async function fetchProfile() {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const token = accessToken;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      try {
        const meRes = await fetch(`${apiBase}/api/v1/auth/me`, { headers });
        if (!meRes.ok) throw new Error('Not authenticated');
        const me = await meRes.json();
        const cid = me.contractor_id;
        setContractorId(cid);

        if (cid) {
          const res = await fetch(`${apiBase}/api/v1/contractors/${cid}`, { headers });
          if (res.ok) {
            const data = await res.json();
            setContractor(data);
            reset(data);
          }
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfile();
  }, [reset, accessToken]);

  async function onSubmit(data: ProfileForm) {
    if (!contractorId) return;
    setIsSaving(true);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch(`${apiBase}/api/v1/contractors/${contractorId}`, {
        method: 'PUT',
        headers,
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
              <button
                onClick={() => handleDocumentUpload('license')}
                disabled={isUploading === 'license'}
                className="text-sky-600 hover:text-sky-700 font-medium disabled:opacity-50"
              >
                {isUploading === 'license' ? t('documents.uploading') : t('documents.upload')}
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
              <button
                onClick={() => handleDocumentUpload('insurance')}
                disabled={isUploading === 'insurance'}
                className="text-sky-600 hover:text-sky-700 font-medium disabled:opacity-50"
              >
                {isUploading === 'insurance' ? t('documents.uploading') : t('documents.upload')}
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
              <button
                onClick={() => handleDocumentUpload('certifications')}
                disabled={isUploading === 'certifications'}
                className="text-sky-600 hover:text-sky-700 font-medium disabled:opacity-50"
              >
                {isUploading === 'certifications' ? t('documents.uploading') : t('documents.upload')}
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
