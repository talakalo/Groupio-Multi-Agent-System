'use client';

import type { Contractor, ServiceCategory, Region } from '@groupio/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { Upload, FileText, CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Badge } from '@/components/ui/Badge';
import { VettingStatusTimeline } from '@/components/features/contractor/VettingStatusTimeline';
import { TrustScoreProgress } from '@/components/features/contractor/TrustScoreProgress';
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
  const [docRequest, setDocRequest] = useState<{ message: string; requested_at: string } | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, { name: string; uploadedAt: Date }>>({});

  const refetchContractorData = useCallback(
    async (cid: string) => {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const token = accessToken;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [contractorRes, docReqRes] = await Promise.all([
        fetch(`${apiBase}/api/v1/contractors/${cid}`, { headers, credentials: 'include' }),
        fetch(`${apiBase}/api/v1/contractors/me/doc-requests`, { headers, credentials: 'include' }),
      ]);
      if (contractorRes.ok) {
        const data = await contractorRes.json();
        setContractor(data);
        reset(data);
      }
      if (docReqRes.ok) {
        const dr = await docReqRes.json();
        if (dr.pending && dr.items?.[0]) {
          setDocRequest({ message: dr.items[0].message ?? '', requested_at: dr.items[0].requested_at ?? '' });
        } else {
          setDocRequest(null);
        }
      }
    },
    [accessToken, reset]
  );

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
          setUploadedFiles((prev) => ({
            ...prev,
            [docType]: { name: file.name, uploadedAt: new Date() },
          }));
          if (contractorId) refetchContractorData(contractorId);
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

  type DocStatus = 'uploaded' | 'pending_review' | 'approved' | 'rejected' | 'not_uploaded';

  function getDocStatus(docType: 'license' | 'insurance' | 'certifications'): DocStatus {
    if (docType === 'license' && contractor?.licenseNumber) return 'approved';
    if (docType === 'insurance' && contractor?.insuranceExpiry) return 'approved';
    if (docType === 'certifications' && contractor?.certifications?.length) return 'approved';
    if (uploadedFiles[docType]) return 'pending_review';
    return 'not_uploaded';
  }

  function getDocBadge(status: DocStatus) {
    switch (status) {
      case 'approved':
        return (
          <Badge variant="success" size="sm">
            <CheckCircle className="h-3 w-3 me-1" />
            {t('documents.approved')}
          </Badge>
        );
      case 'pending_review':
        return (
          <Badge variant="warning" size="sm">
            <Clock className="h-3 w-3 me-1" />
            {t('documents.pendingReview')}
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="error" size="sm">
            <XCircle className="h-3 w-3 me-1" />
            {t('documents.rejected')}
          </Badge>
        );
      case 'uploaded':
        return (
          <Badge variant="info" size="sm">
            <Upload className="h-3 w-3 me-1" />
            {t('documents.statusUploaded')}
          </Badge>
        );
      default:
        return (
          <Badge variant="default" size="sm">
            {t('documents.notUploaded')}
          </Badge>
        );
    }
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
          await refetchContractorData(cid);
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfile();
  }, [accessToken, refetchContractorData, reset]);

  async function onSubmit(data: ProfileForm) {
    if (!contractorId) return;
    setIsSaving(true);
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    // Access token lives only in Zustand memory — never in localStorage.
    const token = useAuthStore.getState().accessToken;
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

      {/* Document Request Banner */}
      {docRequest && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6" role="alert">
          <h3 className="font-semibold text-amber-900">{t('documents.requestBannerTitle')}</h3>
          <p className="text-amber-800 text-sm mt-1">{docRequest.message}</p>
          <p className="text-amber-600 text-xs mt-2">
            {docRequest.requested_at ? new Date(docRequest.requested_at).toLocaleDateString() : ''}
          </p>
        </div>
      )}

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
            {([
              {
                type: 'license' as const,
                title: t('documents.license'),
                detail: contractor?.licenseNumber
                  ? `${t('documents.licenseNumber')}: ${contractor.licenseNumber}`
                  : null,
              },
              {
                type: 'insurance' as const,
                title: t('documents.insurance'),
                detail: contractor?.insuranceExpiry
                  ? `${t('documents.expiresAt')}: ${new Date(contractor.insuranceExpiry).toLocaleDateString('he-IL')}`
                  : null,
              },
              {
                type: 'certifications' as const,
                title: t('documents.certifications'),
                detail: contractor?.certifications?.length
                  ? `${contractor.certifications.length} ${t('documents.uploaded')}`
                  : null,
              },
            ]).map((doc) => {
              const status = getDocStatus(doc.type);
              const uploaded = uploadedFiles[doc.type];

              return (
                <div
                  key={doc.type}
                  className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5 text-gray-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium text-gray-900">{doc.title}</h3>
                          {getDocBadge(status)}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {doc.detail ?? t('documents.notUploaded')}
                        </p>
                        {uploaded && (
                          <div className="mt-2 flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                            <FileText className="h-4 w-4 text-sky-500 shrink-0" />
                            <span className="text-gray-700 truncate">{uploaded.name}</span>
                            <span className="text-gray-400 text-xs shrink-0">
                              {uploaded.uploadedAt.toLocaleTimeString('he-IL', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDocumentUpload(doc.type)}
                      disabled={isUploading === doc.type}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 font-medium text-sm disabled:opacity-50 transition-colors shrink-0"
                    >
                      {isUploading === doc.type ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('documents.uploading')}
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          {status === 'not_uploaded' ? t('documents.upload') : t('update')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Vetting Timeline */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="text-lg font-semibold mb-4">{t('documents.vettingTimeline')}</h3>
            <VettingStatusTimeline
              steps={[
                {
                  id: 'document_submission',
                  label: t('vetting.documentSubmission'),
                  status: Object.keys(uploadedFiles).length > 0 || contractor?.licenseNumber ? 'complete' : 'pending',
                  description: t('vetting.documentSubmissionDesc'),
                  date: Object.values(uploadedFiles)[0]?.uploadedAt?.toISOString(),
                },
                {
                  id: 'license_check',
                  label: t('vetting.licenseCheck'),
                  status: contractor?.licenseNumber ? 'complete' : 'pending',
                  description: t('vetting.licenseCheckDesc'),
                },
                {
                  id: 'insurance_check',
                  label: t('vetting.insuranceCheck'),
                  status: contractor?.insuranceExpiry ? 'complete' : 'pending',
                  description: t('vetting.insuranceCheckDesc'),
                },
                {
                  id: 'final_verification',
                  label: t('vetting.finalVerification'),
                  status: contractor?.licenseNumber && contractor?.insuranceExpiry ? 'complete' : 'pending',
                  description: t('vetting.finalVerificationDesc'),
                },
              ]}
            />
          </div>

          {/* Trust Score Breakdown */}
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="text-lg font-semibold mb-4">{t('trustScore.breakdown')}</h3>
            <TrustScoreProgress
              score={contractor?.trustScore ?? 0}
              categories={[
                { label: t('trustScore.categories.documents'), score: contractor?.licenseNumber ? 25 : 0, maxScore: 30, icon: Upload },
                { label: t('trustScore.categories.insurance'), score: contractor?.insuranceExpiry ? 20 : 0, maxScore: 25, icon: FileText },
                { label: t('trustScore.categories.rating'), score: Math.min(Math.round((contractor?.trustScore ?? 0) * 0.25), 25), maxScore: 25, icon: CheckCircle },
                { label: t('trustScore.categories.responseTime'), score: Math.min(Math.round((contractor?.trustScore ?? 0) * 0.2), 20), maxScore: 20, icon: Clock },
              ]}
            />
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
              <button
                disabled
                title={t('comingSoon')}
                className="text-red-600 hover:text-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('settings.deactivate')}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
