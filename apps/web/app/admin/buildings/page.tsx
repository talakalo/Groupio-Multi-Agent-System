import { redirect } from 'next/navigation';

/** Kept for direct navigation; middleware also redirects /admin/buildings. */
export default function AdminBuildingsPage() {
  redirect('/buildings-manager/buildings');
}
