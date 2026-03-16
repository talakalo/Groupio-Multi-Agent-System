"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={clsx("flex items-center gap-1 text-body-sm text-gray-500", className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && (
              <ChevronLeft className="h-3.5 w-3.5 text-gray-400 rtl:hidden" />
            )}
            {index > 0 && (
              <ChevronRight className="h-3.5 w-3.5 text-gray-400 ltr:hidden" />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="hover:text-primary-600 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className={clsx(isLast && "text-gray-900 font-medium")}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
