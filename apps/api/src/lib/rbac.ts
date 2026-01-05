import { RequestHandler } from 'express';

export const attachPermissions = (permissions: string[]): RequestHandler => {
  return (_req, res, next) => {
    if (!res.locals) res.locals = {} as typeof res.locals;
    res.locals.permissions = permissions;
    next();
  };
};

export const requirePermission = (permission: string): RequestHandler => {
  return (req, res, next) => {
    const permissions = (req.session?.permissions || []) as string[];
    if (permissions.includes(permission)) {
      next();
      return;
    }
    res.status(403).json({ error: 'forbidden', permission });
  };
};
