import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';

let sdk: NodeSDK | null = null;

export const startOtel = async (): Promise<void> => {
  if (process.env.OTEL_ENABLED === 'false') return;
  if (sdk) return;

  const exporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'
  });

  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'ghost-compliance'
    }),
    traceExporter: exporter,
    instrumentations: [new HttpInstrumentation(), new FastifyInstrumentation()]
  });

  await sdk.start();
};

export const stopOtel = async (): Promise<void> => {
  if (!sdk) return;
  await sdk.shutdown();
  sdk = null;
};
