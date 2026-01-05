import { RequestHandler } from 'express';

export const requireAdminToken = (adminToken?: string): RequestHandler => {
  return (req, res, next) => {
    if (!adminToken) return next();
    const header = req.headers['x-admin-token'];
    if (header === adminToken) return next();
    res.status(403).json({ error: 'admin_token_required' });
  };
};
