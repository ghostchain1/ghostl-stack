'use client';

import { useState } from 'react';
import { SiweMessage } from 'siwe';
import { BrowserProvider } from 'ethers';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function LoginPage() {
  const [message] = useState('Sign in to GhostL Dashboard');
  const [token, setToken] = useState('');
  const [nonce, setNonce] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');

  const fetchNonce = async () => {
    setStatus('Requesting nonce...');
    const res = await fetch(`${API_URL}/auth/nonce`, { credentials: 'include' });
    const data = await res.json();
    setNonce(data.nonce);
    setStatus('Nonce received; ready to sign.');
  };

  const loginWallet = async () => {
    try {
      if (!nonce) {
        setStatus('Fetch nonce first');
        return;
      }
      setStatus('Preparing SIWE message...');
      const eth = (window as unknown as { ethereum?: unknown }).ethereum as { request: (args: unknown) => Promise<unknown> } | undefined;
      if (!eth) {
        setStatus('No injected wallet found');
        return;
      }
      const browserProvider = new BrowserProvider(eth);
      const [address] = await browserProvider.send('eth_requestAccounts', []);
      const chainId = await browserProvider.send('eth_chainId', []);
      const siwe = new SiweMessage({
        domain: window.location.host,
        address,
        statement: message,
        uri: window.location.origin,
        version: '1',
        chainId: parseInt(chainId, 16),
        nonce
      });
      const preparedMessage = siwe.prepareMessage();
      const sig = await browserProvider.send('personal_sign', [preparedMessage, address]);
      setStatus('Logging in...');
      const res = await fetch(`${API_URL}/auth/login/wallet`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: preparedMessage, signature: sig })
      });
      if (res.ok) {
        setStatus('Success. Reloading...');
        window.location.href = '/';
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(`Failed: ${err.error || res.status}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setStatus(msg);
    }
  };

  const loginSso = async () => {
    setStatus('Logging in with SSO...');
    const res = await fetch(`${API_URL}/auth/login/sso`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token })
    });
    if (res.ok) {
      setStatus('Success. Reloading...');
      window.location.href = '/';
    } else {
      const err = await res.json().catch(() => ({}));
      setStatus(`Failed: ${err.error || res.status}`);
    }
  };

  return (
    <div className="content">
      <div className="card" style={{ maxWidth: 460 }}>
        <h3>Login</h3>
        <div className="stack">
          <button className="button secondary" type="button" onClick={fetchNonce}>
            1) Get nonce
          </button>
          {nonce && <span className="muted">Nonce: {nonce}</span>}
          <button className="button" type="button" onClick={loginWallet}>
            2) Sign & login with wallet
          </button>
          <p className="muted">Uses SIWE. Connect wallet, sign, and establish session.</p>
          <hr />
          <label className="stack">
            <span className="muted">SSO JWT token</span>
            <input className="input" value={token} onChange={(e) => setToken(e.target.value)} placeholder="eyJhbGciOi..." />
          </label>
          <button className="button secondary" type="button" onClick={loginSso}>
            Login with SSO token
          </button>
          {status && <span className="muted">{status}</span>}
        </div>
      </div>
    </div>
  );
}
