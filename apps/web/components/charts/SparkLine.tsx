"use client";
/**
 * SparkLine — minimal recharts trend line with no axes.
 * Renders a responsive line chart for use inside MetricCards.
 */

import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  ReferenceLine,
} from "recharts";

interface SparkLineProps {
  /** Array of numeric values (most-recent last). */
  data: number[];
  color?: string;
  height?: number;
  /** Show a dashed mean reference line */
  showMean?: boolean;
}

export function SparkLine({
  data,
  color = "#7c3aed",
  height = 48,
  showMean = false,
}: SparkLineProps) {
  const points = data.map((v, i) => ({ i, v }));
  const mean   = showMean && data.length > 0
    ? data.reduce((a, b) => a + b, 0) / data.length
    : undefined;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        {mean !== undefined && (
          <ReferenceLine
            y={mean}
            stroke={color}
            strokeDasharray="3 3"
            strokeOpacity={0.4}
          />
        )}
        <Tooltip
          contentStyle={{
            background: "#12141a",
            border: "1px solid #1e2230",
            borderRadius: 4,
            fontSize: 11,
            color: "#e2e8f0",
          }}
          formatter={(v: number) => [v.toLocaleString(), ""]}
          labelFormatter={() => ""}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
