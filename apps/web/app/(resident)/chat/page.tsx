'use client';

import { useTranslations } from 'next-intl';
import { AIChat } from '@/components/features/chat/AIChat';
import { useAuthStore } from '@/lib/stores/authStore';

export default function ChatPage() {
  const t = useTranslations('chat');
  const user = useAuthStore((s) => s.user);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('welcome')}</h1>
      </div>

      <AIChat
        context="resident"
        userId={user?.id}
        buildingId={user?.buildingId}
        placeholder={t('placeholder')}
        suggestions={[
          t('suggestions.findAC'),
          t('suggestions.pricing'),
          t('suggestions.orderStatus'),
          t('suggestions.help'),
        ]}
        className="h-[calc(100vh-220px)]"
      />
    </div>
  );
}
