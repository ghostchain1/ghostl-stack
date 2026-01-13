// Placeholder job runner for alerts/indexers. Replace with BullMQ or a scheduler when wiring live jobs.
const main = async () => {
  // Example heartbeat entry; swap for health checks or queue processors.
  const now = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log(`[worker] heartbeat ${now}`);
};

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
