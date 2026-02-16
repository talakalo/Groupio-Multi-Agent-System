'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PricingTiers } from '@/components/features/offers/PricingTiers';
import { apiClient, ApiError } from '@/lib/api/client';
import type { ServiceCategory, Region } from '@groupio/types';

const createOfferSchema = z.object({
  title: z.string().min(10, 'Title must be at least 10 characters'),
  description: z.string().min(50, 'Description must be at least 50 characters'),
  category: z.string().min(1, 'Category is required'),
  region: z.string().min(1, 'Region is required'),
  basePrice: z.number().min(100, 'Minimum price is ₪100'),
  minParticipants: z.number().min(3, 'Minimum 3 participants required'),
  maxParticipants: z.number().max(100, 'Maximum 100 participants'),
  validUntil: z.string().min(1, 'Expiration date is required'),
  buildingId: z.string().min(1, 'Building is required'),
  requirements: z.string().optional(),
  includedServices: z.array(z.string()).min(1, 'At least one service must be included'),
});

type CreateOfferForm = z.infer<typeof createOfferSchema>;

export default function CreateOfferPage() {
  const t = useTranslations('contractor.offers.create');
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewTiers, setPreviewTiers] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<CreateOfferForm>({
    resolver: zodResolver(createOfferSchema),
    defaultValues: {
      minParticipants: 5,
      maxParticipants: 20,
      includedServices: [],
      buildingId: '',
    },
  });

  const basePrice = watch('basePrice');
  const minParticipants = watch('minParticipants');

  const categories: { value: ServiceCategory; label: string }[] = [
    { value: 'ac_installation', label: t('categories.ac_installation') },
    { value: 'kitchen', label: t('categories.kitchen') },
    { value: 'electrical', label: t('categories.electrical') },
    { value: 'plumbing', label: t('categories.plumbing') },
    { value: 'painting', label: t('categories.painting') },
    { value: 'flooring', label: t('categories.flooring') },
    { value: 'windows', label: t('categories.windows') },
    { value: 'security', label: t('categories.security') },
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
      router.push(`/contractor/offers/${offer.id}`);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : t('errors.createFailed');
      alert(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl" dir="rtl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600 mt-2">{t('subtitle')}</p>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Basic Info */}
        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-4">{t('sections.basicInfo')}</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('fields.title')} *
              </label>
              <input
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('fields.description')} *
              </label>
              <textarea
                {...register('description')}
                rows={4}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                placeholder={t('placeholders.description')}
              />
              {errors.description && (
                <p className="text-red-500 text-sm mt-1">{errors.description.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('fields.category')} *
                </label>
                <select
                  {...register('category')}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
                >
                  <option value="">{t('placeholders.category')}</option>
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
                {errors.category && (
                  <p className="text-red-500 text-sm mt-1">{errors.category.message}</p>
                )}
              </div>

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
          </div>
        </section>

        {/* Pricing */}
        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-4">{t('sections.pricing')}</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('fields.basePrice')} *
              </label>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">₪</span>
                <input
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

            {basePrice > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setPreviewTiers(!previewTiers)}
                  className="text-sky-600 hover:text-sky-700 font-medium text-sm"
                >
                  {previewTiers ? t('hidePricingPreview') : t('showPricingPreview')}
                </button>
                {previewTiers && (
                  <div className="mt-4">
                    <PricingTiers basePrice={basePrice} currentParticipants={minParticipants} />
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Services & Requirements */}
        <section className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-semibold mb-4">{t('sections.services')}</h2>

          <div className="space-y-4">
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
          </div>
        </section>

        {/* Submit */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex-1 py-3 px-6 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {t('buttons.cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-3 px-6 bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white rounded-lg font-medium transition-colors"
          >
            {isSubmitting ? t('buttons.creating') : t('buttons.create')}
          </button>
        </div>
      </form>
    </div>
  );
}
