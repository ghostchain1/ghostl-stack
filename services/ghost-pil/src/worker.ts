import { config } from './config';
import { startIngestLoop } from './ingest/runner';
import { evaluateValidatorScores } from './validator/evaluator';

if (!config.PIL_INGEST_ENABLED) {
  // eslint-disable-next-line no-console
  console.log('ghost-pil worker disabled (PIL_INGEST_ENABLED=false)');
  process.exit(0);
}

if (!config.PIL_ENABLED) {
  // eslint-disable-next-line no-console
  console.log('ghost-pil running in observe-only mode (PIL_ENABLED=false)');
}

startIngestLoop();

if (config.PIL_VALIDATOR_EVAL_ENABLED) {
  evaluateValidatorScores().catch(() => undefined);
  setInterval(
    () => evaluateValidatorScores().catch(() => undefined),
    config.PIL_VALIDATOR_EVAL_INTERVAL_SECONDS * 1000
  );
}
