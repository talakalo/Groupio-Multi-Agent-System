'use client';

import type { ServiceCategory, Region, BuildingType } from '@groupio/types';
import { useMutation } from '@tanstack/react-query';
import {
  Building2,
  User,
  Wrench,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Check,
  MapPin,
  Briefcase,
  Shield,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useState, useCallback } from 'react';

import { LanguageToggle } from '@/components/shared/LanguageToggle';
import { apiClient } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UserRole = 'resident' | 'contractor';

interface ResidentInfo {
  buildingAddress: string;
  city: string;
  region: Region;
  apartmentNumber: string;
  buildingType: BuildingType;
  municipalityCode?: string;
  municipalityName?: string;
  addressNormalized?: string;
  enrichmentConfidence?: number;
  enrichmentSource?: string;
}

interface ContractorInfo {
  businessName: string;
  licenseNumber: string;
  yearsInBusiness: number;
  regions: Region[];
  description: string;
}

type OnboardingStep = 'role' | 'info' | 'preferences';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERVICE_CATEGORIES: { value: ServiceCategory; labelHe: string; labelEn: string }[] = [
  { value: 'ac_installation', labelHe: 'התקנת מזגנים', labelEn: 'AC Installation' },
  { value: 'ac_maintenance', labelHe: 'תחזוקת מזגנים', labelEn: 'AC Maintenance' },
  { value: 'kitchen', labelHe: 'מטבחים', labelEn: 'Kitchen' },
  { value: 'electrical', labelHe: 'חשמל', labelEn: 'Electrical' },
  { value: 'plumbing', labelHe: 'אינסטלציה', labelEn: 'Plumbing' },
  { value: 'heating', labelHe: 'חימום', labelEn: 'Heating' },
  { value: 'renovations', labelHe: 'שיפוצים', labelEn: 'Renovations' },
  { value: 'painting', labelHe: 'צביעה', labelEn: 'Painting' },
  { value: 'flooring', labelHe: 'ריצוף', labelEn: 'Flooring' },
  { value: 'windows', labelHe: 'חלונות', labelEn: 'Windows' },
];

const REGIONS: { value: Region; labelHe: string; labelEn: string }[] = [
  { value: 'center', labelHe: 'מרכז', labelEn: 'Center' },
  { value: 'tel_aviv', labelHe: 'תל אביב', labelEn: 'Tel Aviv' },
  { value: 'jerusalem', labelHe: 'ירושלים', labelEn: 'Jerusalem' },
  { value: 'haifa', labelHe: 'חיפה', labelEn: 'Haifa' },
  { value: 'north', labelHe: 'צפון', labelEn: 'North' },
  { value: 'south', labelHe: 'דרום', labelEn: 'South' },
  { value: 'sharon', labelHe: 'שרון', labelEn: 'Sharon' },
  { value: 'shfela', labelHe: 'שפלה', labelEn: 'Shfela' },
];

const BUILDING_TYPES: { value: BuildingType; labelHe: string; labelEn: string }[] = [
  { value: 'new_residential', labelHe: 'מגורים חדש', labelEn: 'New Residential' },
  { value: 'old_residential', labelHe: 'מגורים ישן', labelEn: 'Old Residential' },
  { value: 'commercial', labelHe: 'מסחרי', labelEn: 'Commercial' },
];

const STEPS: OnboardingStep[] = ['role', 'info', 'preferences'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const router = useRouter();
  const t = useTranslations('onboarding');
  const tCommon = useTranslations('common');
  const locale = useLocale();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>('role');
  const [role, setRole] = useState<UserRole | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<ServiceCategory[]>([]);

  // Resident-specific state
  const [residentInfo, setResidentInfo] = useState<ResidentInfo>({
    buildingAddress: '',
    city: '',
    region: 'center',
    apartmentNumber: '',
    buildingType: 'new_residential',
  });

  // Contractor-specific state
  const [contractorInfo, setContractorInfo] = useState<ContractorInfo>({
    businessName: '',
    licenseNumber: '',
    yearsInBusiness: 0,
    regions: [],
    description: '',
  });

  const stepIndex = STEPS.indexOf(currentStep);

  const [addressSuggestion, setAddressSuggestion] = useState<{
    address: string;
    city: string;
    municipality: string | null;
    confidence: number;
    source: string;
  } | null>(null);

  const normalizeMutation = useMutation({
    mutationFn: async () => {
      // Routed through apiClient so the 401-refresh + retry policy applies.
      return apiClient.normalizeAddress(
        residentInfo.buildingAddress.trim(),
        residentInfo.city.trim(),
      );
    },
    onSuccess: (data: { address: string; city: string; municipality: string | null; confidence: number; source: string }) => {
      if (data.confidence >= 0.5) {
        setAddressSuggestion({
          address: data.address,
          city: data.city,
          municipality: data.municipality ?? null,
          confidence: data.confidence,
          source: data.source,
        });
      } else {
        setAddressSuggestion(null);
      }
    },
    onError: () => setAddressSuggestion(null),
  });

  const applySuggestion = () => {
    if (!addressSuggestion) return;
    setResidentInfo((prev) => ({
      ...prev,
      buildingAddress: addressSuggestion.address,
      city: addressSuggestion.city,
      municipalityName: addressSuggestion.municipality ?? undefined,
      enrichmentConfidence: addressSuggestion.confidence,
      enrichmentSource: addressSuggestion.source,
      addressNormalized: addressSuggestion.address,
    }));
    setAddressSuggestion(null);
  };

  const dismissSuggestion = () => setAddressSuggestion(null);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const buildingPayload =
        role === 'resident'
          ? {
              buildingAddress: residentInfo.buildingAddress,
              city: residentInfo.city,
              region: residentInfo.region,
              apartmentNumber: residentInfo.apartmentNumber,
              buildingType: residentInfo.buildingType,
              ...(residentInfo.municipalityCode && {
                municipalityCode: residentInfo.municipalityCode,
              }),
              ...(residentInfo.municipalityName && {
                municipalityName: residentInfo.municipalityName,
              }),
              ...(residentInfo.addressNormalized && {
                addressNormalized: residentInfo.addressNormalized,
              }),
              ...(residentInfo.enrichmentConfidence != null && {
                enrichmentConfidence: residentInfo.enrichmentConfidence,
              }),
              ...(residentInfo.enrichmentSource && {
                enrichmentSource: residentInfo.enrichmentSource,
              }),
            }
          : undefined;
      const payload = {
        role,
        categories: selectedCategories,
        ...(role === 'resident' ? { building: buildingPayload } : { business: contractorInfo }),
      };
      return apiClient.submitOnboarding(payload);
    },
    onSuccess: () => {
      router.push(role === 'resident' ? '/dashboard' : '/contractor/dashboard');
    },
  });

  const goNext = useCallback(() => {
    const idx = STEPS.indexOf(currentStep);
    if (idx < STEPS.length - 1) {
      setCurrentStep(STEPS[idx + 1]);
    }
  }, [currentStep]);

  const goBack = useCallback(() => {
    const idx = STEPS.indexOf(currentStep);
    if (idx > 0) {
      setCurrentStep(STEPS[idx - 1]);
    }
  }, [currentStep]);

  const toggleCategory = (cat: ServiceCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const toggleContractorRegion = (region: Region) => {
    setContractorInfo((prev) => ({
      ...prev,
      regions: prev.regions.includes(region)
        ? prev.regions.filter((r) => r !== region)
        : [...prev.regions, region],
    }));
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 'role':
        return role !== null;
      case 'info':
        if (role === 'resident') {
          return residentInfo.buildingAddress.trim().length > 0 && residentInfo.city.trim().length > 0;
        }
        return (
          contractorInfo.businessName.trim().length > 0 &&
          contractorInfo.licenseNumber.trim().length > 0
        );
      case 'preferences':
        return selectedCategories.length > 0;
      default:
        return false;
    }
  };

  const handleFinish = () => {
    submitMutation.mutate();
  };

  // ---------------------------------------------------------------------------
  // Step renderers
  // ---------------------------------------------------------------------------

  const renderRoleStep = () => (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
        {t('selectRole')}
      </h2>
      <p className="text-gray-500 text-center text-sm mb-6">
        {t('selectRoleDescription')}
      </p>

      {/* Resident option */}
      <button
        type="button"
        onClick={() => setRole('resident')}
        className={cn(
          'w-full text-start card transition-all',
          role === 'resident'
            ? 'border-primary-500 ring-2 ring-primary-500/20'
            : 'hover:border-gray-300'
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
              role === 'resident' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-500'
            )}
          >
            <User className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{t('resident')}</h3>
              {role === 'resident' && <Check className="h-5 w-5 text-primary-500" />}
            </div>
            <p className="text-gray-600 text-sm mt-1">{t('residentDescription')}</p>
          </div>
        </div>
      </button>

      {/* Contractor option */}
      <button
        type="button"
        onClick={() => setRole('contractor')}
        className={cn(
          'w-full text-start card transition-all',
          role === 'contractor'
            ? 'border-primary-500 ring-2 ring-primary-500/20'
            : 'hover:border-gray-300'
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
              role === 'contractor' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-500'
            )}
          >
            <Wrench className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">{t('contractor')}</h3>
              {role === 'contractor' && <Check className="h-5 w-5 text-primary-500" />}
            </div>
            <p className="text-gray-600 text-sm mt-1">{t('contractorDescription')}</p>
          </div>
        </div>
      </button>
    </div>
  );

  const renderResidentInfoStep = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
        {t('buildingInfo')}
      </h2>
      <p className="text-gray-500 text-center text-sm mb-6">
        {t('buildingInfoDescription')}
      </p>

      <div>
        <label htmlFor="buildingAddress" className="block text-sm font-medium text-gray-700 mb-1.5">
          {t('buildingAddress')}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <MapPin className="absolute top-3.5 end-3 h-4 w-4 text-gray-400" />
            <input
              id="buildingAddress"
              type="text"
              value={residentInfo.buildingAddress}
              onChange={(e) => {
                setResidentInfo((prev) => ({ ...prev, buildingAddress: e.target.value }));
                setAddressSuggestion(null);
              }}
              placeholder={t('buildingAddressPlaceholder')}
              className="input-field pe-10 w-full"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (residentInfo.buildingAddress.trim() && residentInfo.city.trim()) {
                normalizeMutation.mutate();
              }
            }}
            disabled={
              !residentInfo.buildingAddress.trim() ||
              !residentInfo.city.trim() ||
              normalizeMutation.isPending
            }
            className="btn-secondary flex items-center gap-2 shrink-0"
            title={t('suggestAddress')}
            aria-label={t('suggestAddress')}
          >
            {normalizeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{t('suggestAddress')}</span>
          </button>
        </div>
        {addressSuggestion && (
          <div className="mt-3 p-3 rounded-xl bg-primary-50 border border-primary-200">
            <p className="text-sm font-medium text-primary-800 mb-1">{t('suggestedAddress')}</p>
            <p className="text-sm text-gray-700">
              {addressSuggestion.address}, {addressSuggestion.city}
              {addressSuggestion.municipality && ` (${addressSuggestion.municipality})`}
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={applySuggestion}
                className="btn-primary text-sm py-1.5 px-3"
              >
                {t('useSuggested')}
              </button>
              <button
                type="button"
                onClick={dismissSuggestion}
                className="btn-secondary text-sm py-1.5 px-3"
              >
                {t('keepOriginal')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('city')}
          </label>
          <input
            id="city"
            type="text"
            value={residentInfo.city}
            onChange={(e) => setResidentInfo((prev) => ({ ...prev, city: e.target.value }))}
            placeholder={t('cityPlaceholder')}
            className="input-field"
          />
        </div>
        <div>
          <label htmlFor="apartmentNumber" className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('apartmentNumber')}
          </label>
          <input
            id="apartmentNumber"
            type="text"
            value={residentInfo.apartmentNumber}
            onChange={(e) =>
              setResidentInfo((prev) => ({ ...prev, apartmentNumber: e.target.value }))
            }
            placeholder={t('apartmentNumberPlaceholder')}
            className="input-field"
          />
        </div>
      </div>

      <div>
        <label htmlFor="region" className="block text-sm font-medium text-gray-700 mb-1.5">
          {t('region')}
        </label>
        <select
          id="region"
          value={residentInfo.region}
          onChange={(e) =>
            setResidentInfo((prev) => ({ ...prev, region: e.target.value as Region }))
          }
          className="input-field"
        >
          {REGIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {locale === 'he' ? r.labelHe : r.labelEn}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('buildingType')}
        </label>
        <div className="grid grid-cols-3 gap-3">
          {BUILDING_TYPES.map((bt) => (
            <button
              key={bt.value}
              type="button"
              onClick={() => setResidentInfo((prev) => ({ ...prev, buildingType: bt.value }))}
              className={cn(
                'py-2.5 px-3 rounded-xl text-sm font-medium border transition-all text-center',
                residentInfo.buildingType === bt.value
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              )}
            >
              {locale === 'he' ? bt.labelHe : bt.labelEn}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderContractorInfoStep = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
        {t('businessInfo')}
      </h2>
      <p className="text-gray-500 text-center text-sm mb-6">
        {t('businessInfoDescription')}
      </p>

      <div>
        <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-1.5">
          {t('businessName')}
        </label>
        <div className="relative">
          <Briefcase className="absolute top-3.5 end-3 h-4 w-4 text-gray-400" />
          <input
            id="businessName"
            type="text"
            value={contractorInfo.businessName}
            onChange={(e) =>
              setContractorInfo((prev) => ({ ...prev, businessName: e.target.value }))
            }
            placeholder={t('businessNamePlaceholder')}
            className="input-field pe-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="licenseNumber" className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('licenseNumber')}
          </label>
          <div className="relative">
            <Shield className="absolute top-3.5 end-3 h-4 w-4 text-gray-400" />
            <input
              id="licenseNumber"
              type="text"
              value={contractorInfo.licenseNumber}
              onChange={(e) =>
                setContractorInfo((prev) => ({ ...prev, licenseNumber: e.target.value }))
              }
              placeholder={t('licenseNumberPlaceholder')}
              className="input-field pe-10"
            />
          </div>
        </div>
        <div>
          <label htmlFor="yearsInBusiness" className="block text-sm font-medium text-gray-700 mb-1.5">
            {t('yearsInBusiness')}
          </label>
          <input
            id="yearsInBusiness"
            type="number"
            min={0}
            max={60}
            value={contractorInfo.yearsInBusiness || ''}
            onChange={(e) =>
              setContractorInfo((prev) => ({
                ...prev,
                yearsInBusiness: parseInt(e.target.value, 10) || 0,
              }))
            }
            placeholder="0"
            className="input-field"
          />
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1.5">
          {t('businessDescription')}
        </label>
        <textarea
          id="description"
          rows={3}
          value={contractorInfo.description}
          onChange={(e) =>
            setContractorInfo((prev) => ({ ...prev, description: e.target.value }))
          }
          placeholder={t('businessDescriptionPlaceholder')}
          className="input-field resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {t('serviceRegions')}
        </label>
        <div className="flex flex-wrap gap-2">
          {REGIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => toggleContractorRegion(r.value)}
              className={cn(
                'py-2 px-4 rounded-full text-sm font-medium border transition-all',
                contractorInfo.regions.includes(r.value)
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              )}
            >
              {locale === 'he' ? r.labelHe : r.labelEn}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderPreferencesStep = () => (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-gray-900 text-center mb-2">
        {t('servicePreferences')}
      </h2>
      <p className="text-gray-500 text-center text-sm mb-6">
        {role === 'resident' ? t('residentPreferencesDescription') : t('contractorPreferencesDescription')}
      </p>

      <div className="grid grid-cols-2 gap-3">
        {SERVICE_CATEGORIES.map((cat) => {
          const isSelected = selectedCategories.includes(cat.value);
          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => toggleCategory(cat.value)}
              className={cn(
                'flex items-center gap-3 p-4 rounded-xl border transition-all text-start',
                isSelected
                  ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500/20'
                  : 'border-gray-200 hover:border-gray-300'
              )}
            >
              {isSelected ? (
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
              ) : (
                <div className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-gray-300" />
              )}
              <span
                className={cn(
                  'text-sm font-medium',
                  isSelected ? 'text-primary-700' : 'text-gray-700'
                )}
              >
                {locale === 'he' ? cat.labelHe : cat.labelEn}
              </span>
            </button>
          );
        })}
      </div>

      {selectedCategories.length > 0 && (
        <p className="text-center text-sm text-gray-500">
          {t('selectedCount', { count: selectedCategories.length })}
        </p>
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary-50 to-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg relative">
        {/* Language toggle */}
        <div className="absolute top-0 end-0">
          <LanguageToggle />
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2">
            <Building2 className="h-10 w-10 text-primary-500" />
            <span className="text-3xl font-bold text-primary-600">Groupio</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-6 mb-2">
            {t('title')}
          </h1>
          <p className="text-gray-600">{t('subtitle')}</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((step, idx) => (
            <div key={step} className="flex items-center gap-2">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                  idx < stepIndex
                    ? 'bg-primary-500 text-white'
                    : idx === stepIndex
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                )}
              >
                {idx < stepIndex ? <Check className="h-4 w-4" /> : idx + 1}
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    'w-12 h-0.5 transition-colors',
                    idx < stepIndex ? 'bg-primary-500' : 'bg-gray-200'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="card">
          {currentStep === 'role' && renderRoleStep()}
          {currentStep === 'info' &&
            (role === 'resident' ? renderResidentInfoStep() : renderContractorInfoStep())}
          {currentStep === 'preferences' && renderPreferencesStep()}

          {/* Error message */}
          {submitMutation.isError && (
            <div className="mt-4 bg-red-50 text-red-700 rounded-xl px-4 py-3 text-sm">
              {t('submitError')}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex gap-3 mt-8">
            {stepIndex > 0 && (
              <button type="button" onClick={goBack} className="btn-secondary flex items-center gap-2">
                <ArrowRight className="h-4 w-4 rtl-flip" />
                <span>{tCommon('back')}</span>
              </button>
            )}

            {currentStep === 'preferences' ? (
              <button
                type="button"
                onClick={handleFinish}
                disabled={!canProceed() || submitMutation.isPending}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>{tCommon('loading')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('finish')}</span>
                    <Check className="h-4 w-4" />
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                disabled={!canProceed()}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <span>{tCommon('next')}</span>
                <ArrowLeft className="h-4 w-4 rtl-flip" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
