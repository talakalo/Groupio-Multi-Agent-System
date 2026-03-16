'use client';

import type { ServiceCategory, Region } from '@groupio/types';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Eye,
  Users,
  Clock,
  Tag,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';

import { CategoryChips } from '@/components/shared/CategoryChips';
import { StepIndicator } from '@/components/shared/StepIndicator';
import { apiClient, ApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils/cn';

const pricingTierSchema = z.object({
  minResidents: z.number().min(1, 'מינימום 1 דייר'),
  pricePerUnit: z.number().min(1, 'מחיר חייב להיות חיובי'),
});

const createOfferSchema = z.object({
  title: z.string().min(10, 'כותרת חייבת להכיל לפחות 10 תווים'),
  description: z.string().min(50, 'תיאור חייב להכיל לפחות 50 תווים'),
  category: z.string().min(1, 'יש לבחור קטגוריה'),
  timeline: z.string().min(1, 'לוח זמנים נדרש'),
  basePrice: z.number().min(100, 'מחיר מינימלי ₪100'),
  pricingTiers: z.array(pricingTierSchema).optional(),
  buildingId: z.string().min(1, 'יש לבחור בניין'),
  region: z.string().min(1, 'אזור נדרש'),
  minParticipants: z.number().min(3, 'מינימום 3 משתתפים'),
  maxParticipants: z.number().max(100, 'מקסימום 100 משתתפים'),
  validUntil: z.string().min(1, 'תאריך תפוגה נדרש'),
  requirements: z.string().optional(),
  includedServices: z.array(z.string()).min(1, 'יש לבחור לפחות שירות אחד'),
});

type CreateOfferForm = z.infer<typeof createOfferSchema>;

const WIZARD_STEPS = [
  { label: 'פרטים', description: 'קטגוריה, כותרת ותיאור' },
  { label: 'תמחור', description: 'מחיר בסיס ודרגות מחיר' },
  { label: 'יעד', description: 'בניין וקהל יעד' },
  { label: 'תצוגה מקדימה', description: 'בדיקה לפני פרסום' },
];

const STEP_FIELDS: Record<number, (keyof CreateOfferForm)[]> = {
  0: ['category', 'title', 'description', 'timeline'],
  1: ['basePrice'],
  2: ['buildingId', 'region', 'minParticipants', 'maxParticipants', 'validUntil', 'includedServices'],
  3: [],
};

export default function CreateOfferPage() {
  const t = useTranslations('contractor.offers.create');
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    setValue,
    formState: { errors },
    control,
  } = useForm<CreateOfferForm>({
    resolver: zodResolver(createOfferSchema),
    defaultValues: {
      minParticipants: 5,
      maxParticipants: 20,
      includedServices: [],
      buildingId: '',
      category: '',
      pricingTiers: [{ minResidents: 10, pricePerUnit: 0 }],
    },
  });

  const { fields: tierFields, append: addTier, remove: removeTier } = useFieldArray({
    control,
    name: 'pricingTiers',
  });

  const watchAll = watch();

  const categories: { id: ServiceCategory; label: string }[] = [
    { id: 'ac_installation', label: t('categories.ac_installation') },
    { id: 'kitchen', label: t('categories.kitchen') },
    { id: 'electrical', label: t('categories.electrical') },
    { id: 'plumbing', label: t('categories.plumbing') },
    { id: 'painting', label: t('categories.painting') },
    { id: 'flooring', label: t('categories.flooring') },
    { id: 'windows', label: t('categories.windows') },
    { id: 'security', label: t('categories.security') },
  ];

  const regions: { value: Region; label: string }[] = [
    { value: 'center', label: t('regions.center') },
    { value: 'tel_aviv', label: t('regions.tel_aviv') },
    { value: 'jerusalem', label: t('regions.jerusalem') },
    { value: 'north', label: t('regions.north') },
    { value: 'south', label: t('regions.south') },
    { value: 'sharon', label: t('regions.sharon') },
    { value: 'shfela', label: t('regions.shfela') },
  ];

  const serviceOptions = [
    'installation',
    'materials',
    'warranty',
    'removal',
    'cleanup',
    'inspection',
    'maintenance',
  ];

  async function goToNextStep() {
    const fieldsToValidate = STEP_FIELDS[currentStep];
    if (fieldsToValidate.length > 0) {
      const valid = await trigger(fieldsToValidate);
      if (!valid) return;
    }
    setCurrentStep((s) => Math.min(s + 1, 3));
  }

  function goToPrevStep() {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }

  async function onSubmit(data: CreateOfferForm) {
    setIsSubmitting(true);
    try {
      const deadline = data.validUntil ? new Date(data.validUntil).toISOString() : null;
      const offer = await apiClient.createOffer({
        title: data.title,
        description: data.description,
        category: data.category,
        base_price: data.basePrice,
        min_participants: data.minParticipants,
        max_participants: data.maxParticipants,
        deadline,
        building_id: data.buildingId,
      });
      router.push(`/contractor/projects/${offer.id}`);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : t('errors.createFailed');
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const CATEGORY_LABELS: Record<string, string> = {
    ac_installation: 'התקנת מזגנים',
    kitchen: 'מטבחים',
    electrical: 'חשמל',
    plumbing: 'אינסטלציה',
    painting: 'צביעה',
    flooring: 'ריצוף',
    windows: 'חלונות',
    security: 'אבטחה',
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl" dir="rtl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600 mt-1">{t('subtitle')}</p>
      </header>

      <StepIndicator steps={WIZARD_STEPS} currentStep={currentStep} className="mb-8" />

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Step 1: Details */}
        {currentStep === 0 && (
          <section className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
            <h2 className="text-xl font-semibold">פרטי ההצעה</h2>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              <span className="block mb-2">קטגוריה *</span>
              <CategoryChips
                categories={categories}
                selected={watchAll.category}
                onSelect={(id) => setValue('category', id, { shouldValidate: true })}
              />
              {errors.category && (
                <p className="text-red-500 text-sm mt-1">{errors.category.message}</p>
              )}
            </label>

            <div>
              <label htmlFor="create-title" className="block text-sm font-medium text-gray-700 mb-1">
                {t('fields.title')} *
              </label>
              <input
                id="create-title"
                type="text"
                {...register('title')}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                placeholder={t('placeholders.title')}
              />
              {errors.title && (
                <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="create-description" className="block text-sm font-medium text-gray-700 mb-1">
                {t('fields.description')} *
              </label>
              <textarea
                id="create-description"
                {...register('description')}
                rows={4}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                placeholder={t('placeholders.description')}
              />
              {errors.description && (
                <p className="text-red-500 text-sm mt-1">{errors.description.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="create-timeline" className="block text-sm font-medium text-gray-700 mb-1">
                לוח זמנים *
              </label>
              <input
                id="create-timeline"
                type="text"
                {...register('timeline')}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                placeholder="למשל: 2-3 שבועות עבודה"
              />
              {errors.timeline && (
                <p className="text-red-500 text-sm mt-1">{errors.timeline.message}</p>
              )}
            </div>
          </section>
        )}

        {/* Step 2: Pricing */}
        {currentStep === 1 && (
          <section className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
            <h2 className="text-xl font-semibold">תמחור</h2>

            <div>
              <label htmlFor="create-basePrice" className="block text-sm font-medium text-gray-700 mb-1">
                {t('fields.basePrice')} *
              </label>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">₪</span>
                <input
                  id="create-basePrice"
                  type="number"
                  {...register('basePrice', { valueAsNumber: true })}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 pr-8"
                  placeholder="0"
                />
              </div>
              {errors.basePrice && (
                <p className="text-red-500 text-sm mt-1">{errors.basePrice.message}</p>
              )}
              <p className="text-gray-500 text-sm mt-1">{t('hints.basePrice')}</p>
            </div>

            {/* Pricing Tiers */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="block text-sm font-medium text-gray-700">
                  דרגות מחיר (אופציונלי)
                </span>
                <button
                  type="button"
                  onClick={() => addTier({ minResidents: 0, pricePerUnit: 0 })}
                  className="flex items-center gap-1.5 text-sm text-sky-600 hover:text-sky-700 font-medium"
                >
                  <Plus className="h-4 w-4" />
                  הוסף דרגה
                </button>
              </div>

              <div className="space-y-3">
                {tierFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <label htmlFor={`create-tier-min-${index}`} className="block text-xs text-gray-500 mb-1">
                        החל מ-X דיירים
                      </label>
                      <input
                        id={`create-tier-min-${index}`}
                        type="number"
                        {...register(`pricingTiers.${index}.minResidents`, { valueAsNumber: true })}
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 text-sm"
                        placeholder="10"
                      />
                    </div>
                    <div className="flex-1">
                      <label htmlFor={`create-tier-price-${index}`} className="block text-xs text-gray-500 mb-1">
                        מחיר ליחידה (₪)
                      </label>
                      <input
                        id={`create-tier-price-${index}`}
                        type="number"
                        {...register(`pricingTiers.${index}.pricePerUnit`, { valueAsNumber: true })}
                        className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 text-sm"
                        placeholder="0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTier(index)}
                      className="p-2 text-red-400 hover:text-red-600 mt-4"
                      aria-label="הסר דרגה"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              {tierFields.length === 0 && (
                <p className="text-gray-400 text-sm">
                  ניתן להוסיף דרגות מחיר כדי לתמרץ יותר דיירים להצטרף.
                </p>
              )}
            </div>
          </section>
        )}

        {/* Step 3: Target */}
        {currentStep === 2 && (
          <section className="bg-white rounded-xl shadow-sm border p-6 space-y-6">
            <h2 className="text-xl font-semibold">יעד ופרטים נוספים</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('fields.buildingId')} *
                </label>
                <input
                  type="text"
                  {...register('buildingId')}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                  placeholder={t('placeholders.buildingId')}
                />
                {errors.buildingId && (
                  <p className="text-red-500 text-sm mt-1">{errors.buildingId.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('fields.region')} *
                </label>
                <select
                  {...register('region')}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                >
                  <option value="">{t('placeholders.region')}</option>
                  {regions.map((reg) => (
                    <option key={reg.value} value={reg.value}>
                      {reg.label}
                    </option>
                  ))}
                </select>
                {errors.region && (
                  <p className="text-red-500 text-sm mt-1">{errors.region.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('fields.minParticipants')} *
                </label>
                <input
                  type="number"
                  {...register('minParticipants', { valueAsNumber: true })}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                  min={3}
                />
                {errors.minParticipants && (
                  <p className="text-red-500 text-sm mt-1">{errors.minParticipants.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('fields.maxParticipants')} *
                </label>
                <input
                  type="number"
                  {...register('maxParticipants', { valueAsNumber: true })}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                  max={100}
                />
                {errors.maxParticipants && (
                  <p className="text-red-500 text-sm mt-1">{errors.maxParticipants.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('fields.includedServices')} *
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {serviceOptions.map((service) => (
                  <label key={service} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      value={service}
                      {...register('includedServices')}
                      className="rounded border-gray-300 text-sky-500 focus:ring-sky-500"
                    />
                    <span className="text-sm text-gray-700">{t(`services.${service}`)}</span>
                  </label>
                ))}
              </div>
              {errors.includedServices && (
                <p className="text-red-500 text-sm mt-1">{errors.includedServices.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('fields.requirements')}
              </label>
              <textarea
                {...register('requirements')}
                rows={3}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                placeholder={t('placeholders.requirements')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('fields.validUntil')} *
              </label>
              <input
                type="date"
                {...register('validUntil')}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                min={new Date().toISOString().split('T')[0]}
              />
              {errors.validUntil && (
                <p className="text-red-500 text-sm mt-1">{errors.validUntil.message}</p>
              )}
            </div>
          </section>
        )}

        {/* Step 4: Preview */}
        {currentStep === 3 && (
          <section className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="bg-gradient-to-l from-sky-500 to-sky-600 p-6 text-white">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="h-5 w-5" />
                  <span className="text-sm font-medium opacity-80">תצוגה מקדימה</span>
                </div>
                <h2 className="text-2xl font-bold">{watchAll.title || 'כותרת ההצעה'}</h2>
                <div className="flex items-center gap-3 mt-2 text-sm opacity-90">
                  {watchAll.category && (
                    <span className="bg-white/20 rounded-full px-3 py-0.5">
                      {CATEGORY_LABELS[watchAll.category] ?? watchAll.category}
                    </span>
                  )}
                  {watchAll.timeline && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {watchAll.timeline}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Description */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 mb-1">תיאור</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    {watchAll.description || 'לא הוזן תיאור'}
                  </p>
                </div>

                {/* Price + Participants */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">מחיר בסיס</p>
                    <p className="text-lg font-bold text-gray-900">
                      ₪{(watchAll.basePrice || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">מינ׳ משתתפים</p>
                    <p className="text-lg font-bold text-gray-900">
                      {watchAll.minParticipants || 0}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">מקס׳ משתתפים</p>
                    <p className="text-lg font-bold text-gray-900">
                      {watchAll.maxParticipants || 0}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">תוקף</p>
                    <p className="text-sm font-bold text-gray-900">
                      {watchAll.validUntil
                        ? new Date(watchAll.validUntil).toLocaleDateString('he-IL')
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Pricing Tiers */}
                {watchAll.pricingTiers && watchAll.pricingTiers.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 mb-2">דרגות מחיר</h3>
                    <div className="flex flex-wrap gap-2">
                      {watchAll.pricingTiers.map((tier, idx) => (
                        <div
                          key={idx}
                          className="bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 text-sm"
                        >
                          <span className="font-medium text-sky-700">
                            מ-{tier.minResidents} דיירים
                          </span>
                          <span className="text-gray-500 mx-1">→</span>
                          <span className="font-bold text-gray-900">
                            ₪{(tier.pricePerUnit || 0).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Included Services */}
                {watchAll.includedServices && watchAll.includedServices.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 mb-2">שירותים כלולים</h3>
                    <div className="flex flex-wrap gap-2">
                      {watchAll.includedServices.map((service) => (
                        <span
                          key={service}
                          className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 rounded-full px-3 py-1 text-xs font-medium"
                        >
                          <Tag className="h-3 w-3" />
                          {t(`services.${service}`)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Target */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 mb-1">בניין</h3>
                    <p className="text-sm text-gray-700">
                      {watchAll.buildingId || '—'}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 mb-1">אזור</h3>
                    <p className="text-sm text-gray-700">
                      {regions.find((r) => r.value === watchAll.region)?.label ?? '—'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-4 mt-8">
          {currentStep > 0 && (
            <button
              type="button"
              onClick={goToPrevStep}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-6 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <ArrowRight className="h-4 w-4" />
              חזרה
            </button>
          )}

          {currentStep === 0 && (
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 py-3 px-6 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('buttons.cancel')}
            </button>
          )}

          {currentStep < 3 ? (
            <button
              type="button"
              onClick={goToNextStep}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-6 bg-sky-500 hover:bg-sky-600 text-white rounded-xl font-medium transition-colors"
            >
              הבא
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-6 bg-accent-500 hover:bg-accent-600 disabled:bg-accent-300 text-white rounded-xl font-bold transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('buttons.creating')}
                </>
              ) : (
                'פרסום הצעה'
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
