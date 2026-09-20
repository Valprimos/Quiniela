import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import Quiniela from '@/components/Quiniela';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!(await getSession())) redirect('/login');
  return <Quiniela />;
}
