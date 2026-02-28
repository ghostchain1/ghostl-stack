export type MetricLabels = Record<string, string | number | boolean>;

export interface MetricSample {
  name: string;
  help: string;
  type: "gauge" | "counter";
  value: number;
  labels?: MetricLabels;
}

const escapeLabel = (value: string | number | boolean): string =>
  String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const serializeLabels = (labels?: MetricLabels): string => {
  if (!labels || Object.keys(labels).length === 0) return "";
  const pairs = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${escapeLabel(v)}"`);
  return `{${pairs.join(",")}}`;
};

export function renderPrometheus(samples: MetricSample[]): string {
  const lines: string[] = [];
  const declared = new Set<string>();

  for (const sample of samples) {
    if (!declared.has(sample.name)) {
      lines.push(`# HELP ${sample.name} ${sample.help}`);
      lines.push(`# TYPE ${sample.name} ${sample.type}`);
      declared.add(sample.name);
    }
    lines.push(`${sample.name}${serializeLabels(sample.labels)} ${sample.value}`);
  }

  return `${lines.join("\n")}\n`;
}

