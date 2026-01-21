import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/compliance/overview');
}
