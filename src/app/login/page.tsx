import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';
import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

// /login?codigo=XXXX es el enlace de invitación: abre el registro con el código de la pandilla ya puesto
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ codigo?: string | string[] }> }) {
  if (await getSession()) redirect('/');

  const raw = (await searchParams).codigo;
  const code = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 30);
  if (!code) return <LoginForm />;

  const { data } = await db().from('groups').select('name').eq('invite_code', code).maybeSingle();
  // Un código que ya no existe no se rellena: registrarse con él crearía una pandilla nueva sin querer
  return data ? <LoginForm invite={{ code, groupName: data.name }} /> : <LoginForm inviteInvalid />;
}
