import { redirect } from 'next/navigation';
import { fetchServerSession } from '../../src/modules/identity-access/serverSession';
import { WalletClient } from './WalletClient';

export default async function WalletPage() {
  const session = await fetchServerSession();
  if (!session.user) {
    redirect('/login?returnTo=/wallet');
  }
  return <WalletClient />;
}
