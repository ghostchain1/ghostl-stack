"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePermission = exports.attachPermissions = void 0;
const attachPermissions = (permissions) => {
    return (_req, res, next) => {
        if (!res.locals)
            res.locals = {};
        res.locals.permissions = permissions;
        next();
    };
};
exports.attachPermissions = attachPermissions;
const requirePermission = (permission) => {
    return (req, res, next) => {
        const permissions = (req.session?.permissions || []);
        if (permissions.includes(permission)) {
            next();
            return;
        }
        res.status(403).json({ error: 'forbidden', permission });
    };
};
exports.requirePermission = requirePermission;
