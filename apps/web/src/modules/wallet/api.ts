const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function bridgeTransfer(params: {
  fromRpc: string;
  toRpc: string;
  token?: string;
  to: string;
  amount: string;
  privateKey: string;
}) {
  const res = await fetch(`${API_URL}/wallet/bridge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Bridge failed: ${res.status}`);
  }
  return res.json();
}
