import { redirect } from 'next/navigation';

export default function ExplorerIndexPage() {
  redirect('/explorer/txs');
}
