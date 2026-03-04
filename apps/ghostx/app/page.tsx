/**
 * Ghost X – Main Trading Page
 *
 * Layout:
 *   [Order Book]  |  [Place Order]
 *                      [Recent Fills]
 */
"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const OrderBook   = dynamic(() => import("../components/OrderBook"),   { ssr: false });
const PlaceOrder  = dynamic(() => import("../components/PlaceOrder"),  { ssr: false });
const RecentFills = dynamic(() => import("../components/RecentFills"), { ssr: false });

// Default pair – can be made dynamic via query params.
const DEFAULT_BASE  = process.env.NEXT_PUBLIC_DEFAULT_BASE  ?? "0x0000000000000000000000000000000000000001";
const DEFAULT_QUOTE = process.env.NEXT_PUBLIC_DEFAULT_QUOTE ?? "0x0000000000000000000000000000000000000002";

export default function TradingPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_380px] gap-4">
      {/* Left column – order book */}
      <section className="space-y-4">
        <Suspense fallback={<Skeleton h="h-96" />}>
          <OrderBook baseToken={DEFAULT_BASE} quoteToken={DEFAULT_QUOTE} />
        </Suspense>
        <Suspense fallback={<Skeleton h="h-48" />}>
          <RecentFills />
        </Suspense>
      </section>

      {/* Right column – order placement */}
      <section>
        <Suspense fallback={<Skeleton h="h-80" />}>
          <PlaceOrder baseToken={DEFAULT_BASE} quoteToken={DEFAULT_QUOTE} />
        </Suspense>
      </section>
    </div>
  );
}

function Skeleton({ h }: { h: string }) {
  return <div className={`rounded-xl bg-gray-900 animate-pulse ${h}`} />;
}
