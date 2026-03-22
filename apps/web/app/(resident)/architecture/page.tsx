'use client';

import {
  Upload,
  FileImage,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Home,
  Zap,
  Paintbrush,
  Wrench,
  Wind,
  LayoutGrid,
  Shield,
  Droplets,
  ArrowRight,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useCallback, useRef } from 'react';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';
import { unwrapPageParams, PageParamsProps } from '@/lib/utils/unwrapPageParams';

interface AnalysisSuggestion {
  category: string;
  confidence: number;
  description_he: string;
  description_en: string;
  estimated_sqm: number | null;
  estimated_units: number | null;
  priority: 'high' | 'medium' | 'low';
  matching_offers: string[];
}

interface AnalysisResult {
  rooms_detected: { name: string; estimated_sqm: number }[];
  total_area_sqm: number | null;
  suggestions: AnalysisSuggestion[];
  summary_he: string;
  summary_en: string;
}

interface UploadedFile {
  id: string;
  file_name: string;
  analysis_status: string;
  analysis?: AnalysisResult;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  ac_installation: Wind,
  kitchen: Home,
  electrical: Zap,
  plumbing: Droplets,
  painting: Paintbrush,
  flooring: LayoutGrid,
  windows: Home,
  security: Shield,
  cleaning: Home,
  renovation: Wrench,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-50 text-red-700 border-red-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-green-50 text-green-700 border-green-200',
};

export default function ArchitecturePage(props: PageParamsProps) {
  unwrapPageParams(props);
  const t = useTranslations('architecture');
  const user = useAuthStore((s) => s.user);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);
      setResult(null);
      setUploading(true);

      try {
        const uploaded = await apiClient.uploadArchitecturePlan(
          file,
          user?.buildingId ?? '',
        );
        setUploading(false);
        setAnalyzing(true);

        // Poll for analysis completion
        let attempts = 0;
        const maxAttempts = 30;
        const poll = async () => {
          attempts++;
          const data = await apiClient.getFileUpload(uploaded.id);
          if (data.analysis_status === 'completed' && data.analysis_result) {
            setResult(data.analysis_result as AnalysisResult);
            setAnalyzing(false);
            return;
          }
          if (data.analysis_status === 'failed') {
            setError(t('errors.analysisFailed'));
            setAnalyzing(false);
            return;
          }
          if (attempts < maxAttempts) {
            setTimeout(poll, 2000);
          } else {
            setError(t('errors.timeout'));
            setAnalyzing(false);
          }
        };
        await poll();
      } catch (err) {
        setUploading(false);
        setAnalyzing(false);
        setError(err instanceof Error ? err.message : t('errors.uploadFailed'));
      }
    },
    [t, user?.buildingId],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  return (
    <div className="max-w-4xl mx-auto" dir="rtl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
        <p className="text-gray-600 mt-2">{t('subtitle')}</p>
      </header>

      {/* Upload zone */}
      {!result && !analyzing && (
        <div
          className={`
            border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer
            ${dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-300 bg-white hover:border-gray-400'}
          `}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.heic,.webp"
            onChange={onFileChange}
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-12 w-12 text-primary-500 animate-spin" />
              <p className="text-gray-600 font-medium">{t('uploading')}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center">
                <Upload className="h-8 w-8 text-primary-500" />
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">{t('dropzone.title')}</p>
                <p className="text-sm text-gray-500 mt-1">{t('dropzone.subtitle')}</p>
              </div>
              <button
                type="button"
                className="px-6 py-2.5 rounded-xl bg-primary-500 text-white font-medium hover:bg-primary-600 transition-colors"
              >
                {t('dropzone.button')}
              </button>
              <p className="text-xs text-gray-400">{t('dropzone.formats')}</p>
            </div>
          )}
        </div>
      )}

      {/* Analyzing state */}
      {analyzing && (
        <div className="bg-white rounded-2xl shadow-sm border p-12 text-center">
          <Loader2 className="h-16 w-16 text-primary-500 animate-spin mx-auto" />
          <h2 className="text-xl font-semibold mt-6 text-gray-900">{t('analyzing.title')}</h2>
          <p className="text-gray-500 mt-2">{t('analyzing.subtitle')}</p>
          <div className="mt-6 flex justify-center gap-2">
            {['rooms', 'services', 'pricing'].map((step, i) => (
              <span
                key={step}
                className="px-3 py-1 rounded-full bg-gray-100 text-xs text-gray-600"
              >
                {t(`analyzing.steps.${step}`)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 mt-6">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-red-700 font-medium">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setResult(null);
              }}
              className="text-red-600 underline text-sm mt-1"
            >
              {t('tryAgain')}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-white rounded-2xl shadow-sm border p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-500 mt-0.5" />
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {t('results.title')}
                </h2>
                <p className="text-gray-600 mt-1">{result.summary_he}</p>
              </div>
            </div>

            {/* Rooms detected */}
            {result.rooms_detected.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-500 mb-3">{t('results.roomsDetected')}</h3>
                <div className="flex flex-wrap gap-2">
                  {result.rooms_detected.map((room, i) => (
                    <span
                      key={i}
                      className="px-3 py-1.5 rounded-lg bg-gray-50 border text-sm text-gray-700"
                    >
                      {room.name}
                      {room.estimated_sqm > 0 && (
                        <span className="text-gray-400 ms-1">
                          {room.estimated_sqm} {t('results.sqm')}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
                {result.total_area_sqm && (
                  <p className="text-sm text-gray-500 mt-2">
                    {t('results.totalArea')}: {result.total_area_sqm} {t('results.sqm')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Suggestions */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              {t('results.suggestions')}
            </h2>
            <div className="grid gap-4">
              {result.suggestions.map((s, i) => {
                const Icon = CATEGORY_ICONS[s.category] || Wrench;
                return (
                  <div
                    key={i}
                    className="bg-white rounded-xl shadow-sm border p-5 flex items-start gap-4"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-5 w-5 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">
                          {t(`categories.${s.category}`)}
                        </h3>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full border ${PRIORITY_COLORS[s.priority]}`}
                        >
                          {t(`priority.${s.priority}`)}
                        </span>
                      </div>
                      <p className="text-gray-600 text-sm">{s.description_he}</p>
                      {s.estimated_sqm && (
                        <p className="text-xs text-gray-400 mt-1">
                          ~{s.estimated_sqm} {t('results.sqm')}
                        </p>
                      )}
                      {s.matching_offers.length > 0 && (
                        <p className="text-xs text-green-600 mt-1">
                          {t('results.matchingOffers', { count: s.matching_offers.length })}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="flex items-center gap-1 px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors flex-shrink-0"
                    >
                      {s.matching_offers.length > 0 ? t('results.joinOffer') : t('results.findContractor')}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Upload another */}
          <div className="text-center pt-4">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setError(null);
              }}
              className="text-primary-600 underline text-sm"
            >
              {t('uploadAnother')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
