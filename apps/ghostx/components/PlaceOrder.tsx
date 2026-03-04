"use client";

import { useState, FormEvent } from "react";
import { ethers } from "ethers";
import { placeOrder, ApiOrder } from "../lib/api";

interface Props {
  baseToken:  string;
  quoteToken: string;
}

type Side = "BUY" | "SELL";

export default function PlaceOrder({ baseToken, quoteToken }: Props) {
  const [side,       setSide]       = useState<Side>("BUY");
  const [priceStr,   setPriceStr]   = useState("");
  const [amountStr,  setAmountStr]  = useState("");
  const [traderAddr, setTraderAddr] = useState("");
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<ApiOrder | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  async function connectWallet() {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      setError("No EVM wallet detected");
      return;
    }
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer   = await provider.getSigner();
    setTraderAddr(await signer.getAddress());
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!traderAddr) { setError("Connect your wallet first"); return; }

    try {
      // Parse to 18-decimal bigint strings.
      const price18  = ethers.parseUnits(priceStr,  18).toString();
      const amount18 = ethers.parseUnits(amountStr, 18).toString();

      setLoading(true);
      const order = await placeOrder({
        trader: traderAddr,
        baseToken,
        quoteToken,
        side,
        price:      price18,
        baseAmount: amount18,
      });
      setResult(order);
      setPriceStr("");
      setAmountStr("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-5">
      <h2 className="font-semibold text-sm text-gray-200">Place Limit Order</h2>

      {/* Wallet */}
      <div>
        {traderAddr ? (
          <p className="text-xs text-emerald-400 truncate">
            {traderAddr.slice(0, 10)}…{traderAddr.slice(-8)}
          </p>
        ) : (
          <button
            type="button"
            onClick={connectWallet}
            className="w-full py-2 rounded-lg bg-violet-700 hover:bg-violet-600 text-sm font-medium transition-colors"
          >
            Connect Wallet
          </button>
        )}
      </div>

      {/* Side toggle */}
      <div className="flex rounded-lg overflow-hidden border border-gray-700">
        {(["BUY", "SELL"] as Side[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            className={`flex-1 py-2 text-sm font-semibold transition-colors ${
              side === s
                ? s === "BUY"
                  ? "bg-emerald-700 text-white"
                  : "bg-rose-700 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Price (GST)" value={priceStr} onChange={setPriceStr} placeholder="0.000000" />
        <Field label="Amount (base)" value={amountStr} onChange={setAmountStr} placeholder="0.000000" />

        {/* Total quote preview */}
        {priceStr && amountStr && (
          <p className="text-xs text-gray-500">
            Total ≈ {(parseFloat(priceStr) * parseFloat(amountStr)).toFixed(6)} GST
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            side === "BUY"
              ? "bg-emerald-700 hover:bg-emerald-600 disabled:bg-emerald-900"
              : "bg-rose-700 hover:bg-rose-600 disabled:bg-rose-900"
          }`}
        >
          {loading ? "Submitting…" : `${side} ${amountStr || "?"} @ ${priceStr || "?"}`}
        </button>
      </form>

      {error && (
        <div className="rounded-lg bg-red-900/20 border border-red-700 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg bg-emerald-900/20 border border-emerald-700 px-3 py-2 text-xs text-emerald-300 break-all">
          Order placed: <code>{result.orderId}</code>
          <br />
          Status: <strong>{result.status}</strong>
        </div>
      )}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input
        type="number"
        step="any"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-violet-500"
      />
    </div>
  );
}
