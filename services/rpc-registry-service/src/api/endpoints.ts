import type { Request, Response } from 'express';
import crypto from 'crypto';
import type { HealthChecker } from '../health/checker';

const jsonStringifyStable = (data: unknown) => JSON.stringify(data);

export const buildEndpointsHandler = (checker: HealthChecker) => {
  return (_req: Request, res: Response) => {
    const payload = checker.getRegistrySnapshot();
    const body = jsonStringifyStable(payload);
    const etag = crypto.createHash('sha256').update(body).digest('hex');

    res.setHeader('content-type', 'application/json');
    res.setHeader('etag', `"${etag}"`);
    res.setHeader('cache-control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');

    const ifNoneMatch = _req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch.replace(/W\//, '') === `"${etag}"`) {
      res.status(304).end();
      return;
    }

    res.status(200).send(body);
  };
};
