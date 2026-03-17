'use client';

import { redirect } from 'next/navigation';

import { unwrapPageParams, PageParamsProps } from '@/lib/utils/unwrapPageParams';

/**
 * Admin shortcut to buildings-manager buildings.
 * Admin and super_admin use admin shell by default but can access
 * buildings-manager features. This redirects to the buildings-manager view.
 */
export default function AdminBuildingsPage(props: PageParamsProps) {
  unwrapPageParams(props);
  redirect('/buildings-manager/buildings');
}
