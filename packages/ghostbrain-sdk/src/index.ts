/**
 * @ghostchain/ghostbrain-sdk
 *
 * Typed HTTP client for the GhostContractAI /v1/jobs API.
 * Uses Node.js built-in fetch (≥18). Zero runtime dependencies.
 *
 * Usage:
 *   import { GhostContractAIClient } from '@ghostchain/ghostbrain-sdk';
 *
 *   const client = new GhostContractAIClient({
 *     baseUrl: 'http://ghostcontract-ai:7610',
 *     sharedSecret: process.env.GHOSTBRAIN_SHARED_SECRET,
 *   });
 *
 *   const job = await client.createJob({
 *     type: 'CONTRACT_AUDIT',
 *     targetPaths: ['/home/ghost/ghostl-stack/contracts'],
 *     context: { contractNames: ['GhostGasTokens'] },
 *   });
 *
 *   const done = await client.waitForJob(job.id);
 *   const evidence = await client.getEvidence(job.id);
 */

export type { JobType, JobStatus, Job, CreateJobRequest, JobResult, JobEvidence } from "./types.js";
export { GhostContractAIClient } from "./ghostbrainClient.js";
