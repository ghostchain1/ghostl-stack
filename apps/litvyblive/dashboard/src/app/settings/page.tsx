"use client";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="card space-y-4 max-w-lg">
        <div>
          <label className="text-xs text-gray-500 uppercase block mb-1">Backend URL</label>
          <input
            readOnly
            defaultValue={process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:7001"}
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-gray-300 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase block mb-1">GhostBrain AI URL</label>
          <input
            readOnly
            defaultValue={process.env.NEXT_PUBLIC_GHOSTBRAIN_URL ?? "http://localhost:7002"}
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-gray-300 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase block mb-1">GhostL3 RPC</label>
          <input
            readOnly
            defaultValue="http://localhost:39545 (chain 903)"
            className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-gray-300 cursor-not-allowed"
          />
        </div>
        <p className="text-xs text-gray-600">
          Configuration is managed via environment variables. See <code>stack.env.example</code>.
        </p>
      </div>
    </div>
  );
}
