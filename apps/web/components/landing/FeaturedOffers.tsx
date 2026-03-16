import { Droplets, ArrowUpDown, Wrench, BadgeCheck, ArrowLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

interface Offer {
  icon: LucideIcon;
  title: string;
  originalPrice: string;
  discountedPrice: string;
  savingsPercent: number;
  participants: number;
  totalSlots: number;
  contractor: string;
}

const OFFERS: Offer[] = [
  {
    icon: Droplets,
    title: "איטום גג מקצועי",
    originalPrice: "₪4,800",
    discountedPrice: "₪2,880",
    savingsPercent: 40,
    participants: 18,
    totalSlots: 24,
    contractor: "איטום פלוס בע״מ",
  },
  {
    icon: ArrowUpDown,
    title: "תחזוקת מעלית שנתית",
    originalPrice: "₪3,200",
    discountedPrice: "₪2,240",
    savingsPercent: 30,
    participants: 12,
    totalSlots: 20,
    contractor: "מעליות ישראל",
  },
  {
    icon: Wrench,
    title: "החלפת צנרת ראשית",
    originalPrice: "₪5,500",
    discountedPrice: "₪3,575",
    savingsPercent: 35,
    participants: 15,
    totalSlots: 22,
    contractor: "שרברב פרו",
  },
];

export default function FeaturedOffers() {
  return (
    <section className="py-16 sm:py-20 px-4 bg-surface-page">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-12">
          הצעות פופולריות עכשיו
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {OFFERS.map((offer) => {
            const Icon = offer.icon;
            const progress = Math.round(
              (offer.participants / offer.totalSlots) * 100
            );
            return (
              <Link
                key={offer.title}
                href="/offers"
                className="card group hover:border-primary-200 flex flex-col"
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100 transition-colors">
                    <Icon className="h-5 w-5 text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 mb-0.5">
                      {offer.title}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <BadgeCheck className="h-3.5 w-3.5 text-primary-500" />
                      <span>{offer.contractor}</span>
                    </div>
                  </div>
                </div>

                {/* Pricing */}
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-xl font-bold text-primary-600">
                    {offer.discountedPrice}
                  </span>
                  <span className="text-sm text-gray-400 line-through">
                    {offer.originalPrice}
                  </span>
                  <span className="badge-success text-xs mr-auto">
                    {offer.savingsPercent}%−
                  </span>
                </div>

                {/* Progress */}
                <div className="mt-auto">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>
                      {offer.participants} מתוך {offer.totalSlots} דיירים
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-primary-400 h-2 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="text-center mt-10">
          <Link
            href="/offers"
            className="inline-flex items-center gap-2 text-primary-600 font-medium hover:text-primary-700 transition-colors"
          >
            <span>ראו את כל ההצעות</span>
            <ArrowLeft className="h-4 w-4 rtl-flip" />
          </Link>
        </div>
      </div>
    </section>
  );
}
