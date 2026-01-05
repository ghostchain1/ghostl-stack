"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdminToken = void 0;
const requireAdminToken = (adminToken) => {
    return (req, res, next) => {
        if (!adminToken)
            return next();
        const header = req.headers['x-admin-token'];
        if (header === adminToken)
            return next();
        res.status(403).json({ error: 'admin_token_required' });
    };
};
exports.requireAdminToken = requireAdminToken;
