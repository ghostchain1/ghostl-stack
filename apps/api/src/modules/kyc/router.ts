import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../../lib/rbac';
import type { KycService } from '../../services/kyc-store';
import { env } from '../../config/env';

export const buildKycRouter = (kyc: KycService) => {
  const router = Router();

  const applicantSchema = z.object({
    type: z.enum(['individual', 'business']),
    fullName: z.string().optional(),
    companyName: z.string().optional(),
    email: z.string().email().optional(),
    country: z.string().optional(),
    walletAddress: z.string().optional(),
    chainId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    source: z.string().optional(),
    screening: z
      .object({
        pep: z.boolean().optional(),
        sanctions: z.boolean().optional(),
        adverseMedia: z.boolean().optional(),
        watchlists: z.array(z.string()).optional()
      })
      .optional()
  });

  const docSchema = z.object({
    type: z.enum([
      'passport',
      'id_card',
      'driver_license',
      'proof_of_address',
      'selfie',
      'corporate_registry',
      'beneficial_ownership',
      'tax_certificate',
      'other'
    ]),
    filename: z.string().optional(),
    source: z.string().optional()
  });

  router.get('/summary', requirePermission('kyc:read'), async (_req, res) => {
    res.json(kyc.summary());
  });

  router.get('/policy', requirePermission('kyc:read'), async (_req, res) => {
    res.json(kyc.getPolicy());
  });

  router.patch('/policy', requirePermission('kyc:write'), async (req, res) => {
    const schema = z.object({
      autoApproveMax: z.number().int().min(0).max(100).optional(),
      autoRejectMin: z.number().int().min(0).max(100).optional(),
      pepRequiresReview: z.boolean().optional(),
      sanctionsAutoReject: z.boolean().optional(),
      highRiskCountries: z.array(z.string()).optional(),
      requiredDocs: z
        .object({
          individual: z.array(docSchema.shape.type).optional(),
          business: z.array(docSchema.shape.type).optional()
        })
        .optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const currentPolicy = kyc.getPolicy();
    const policyPatch = {
      ...parsed.data,
      requiredDocs: parsed.data.requiredDocs
        ? {
            individual: parsed.data.requiredDocs.individual ?? currentPolicy.requiredDocs.individual,
            business: parsed.data.requiredDocs.business ?? currentPolicy.requiredDocs.business
          }
        : undefined
    };
    const updated = kyc.updatePolicy(policyPatch);
    await kyc.save();
    res.json(updated);
  });

  router.get('/providers', requirePermission('kyc:read'), async (_req, res) => {
    const name = env.KYC_PROVIDER_NAME || 'KYC Corp';
    const url = env.KYC_PROVIDER_URL;
    const status = env.KYC_PROVIDER_STATUS || (url ? 'connected' : 'pending');
    res.json({
      providers: [{ name, url, status, lastCheckedAt: new Date().toISOString() }]
    });
  });

  router.get('/applicants', requirePermission('kyc:read'), async (req, res) => {
    const { status, risk, search, assignedTo, type } = req.query as Record<string, string | undefined>;
    const data = kyc.list({ status, risk, search, assignedTo, type });
    res.json(data);
  });

  router.post('/applicants', requirePermission('kyc:write'), async (req, res) => {
    const parsed = applicantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const created = kyc.createApplicant(parsed.data);
    await kyc.save();
    res.status(201).json(created);
  });

  router.get('/applicants/:id', requirePermission('kyc:read'), async (req, res) => {
    const applicantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const applicant = kyc.get(applicantId);
    if (!applicant) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(applicant);
  });

  router.patch('/applicants/:id', requirePermission('kyc:write'), async (req, res) => {
    const schema = z.object({
      status: z.enum(['pending', 'in_review', 'approved', 'rejected', 'needs_more_info', 'expired']).optional(),
      assignedTo: z.string().optional(),
      tags: z.array(z.string()).optional(),
      screening: z
        .object({
          pep: z.boolean().optional(),
          sanctions: z.boolean().optional(),
          adverseMedia: z.boolean().optional(),
          watchlists: z.array(z.string()).optional()
        })
        .optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const applicantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const screening = parsed.data.screening
      ? {
          pep: false,
          sanctions: false,
          adverseMedia: false,
          watchlists: [],
          ...parsed.data.screening
        }
      : undefined;
    const applicant = kyc.updateApplicant(applicantId, { ...parsed.data, screening }, req.session.userId);
    if (!applicant) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    await kyc.save();
    res.json(applicant);
  });

  router.post('/applicants/:id/assign', requirePermission('kyc:write'), async (req, res) => {
    const schema = z.object({ reviewerId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const applicantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const applicant = kyc.assignReviewer(applicantId, parsed.data.reviewerId, req.session.userId);
    if (!applicant) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    await kyc.save();
    res.json(applicant);
  });

  router.post('/applicants/:id/documents', requirePermission('kyc:write'), async (req, res) => {
    const parsed = docSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const applicantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const doc = kyc.addDocument(applicantId, parsed.data, req.session.userId);
    if (!doc) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    await kyc.save();
    res.status(201).json(doc);
  });

  router.post('/applicants/:id/documents/:docId/review', requirePermission('kyc:write'), async (req, res) => {
    const schema = z.object({
      status: z.enum(['pending', 'verified', 'rejected']),
      notes: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const reviewer = req.session.userId || 'system';
    const applicantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;
    const doc = kyc.reviewDocument(applicantId, docId, parsed.data, reviewer);
    if (!doc) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    await kyc.save();
    res.json(doc);
  });

  router.post('/applicants/:id/review', requirePermission('kyc:write'), async (req, res) => {
    const schema = z.object({
      decision: z.enum(['approve', 'reject', 'request_more_info', 'escalate']),
      reason: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const reviewer = req.session.userId || 'system';
    const applicantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const review = kyc.addReview(applicantId, parsed.data, reviewer);
    if (!review) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    await kyc.save();
    res.json(review);
  });

  router.post('/applicants/:id/risk', requirePermission('kyc:write'), async (req, res) => {
    const schema = z.object({
      score: z.number().int().min(0).max(100),
      level: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      reason: z.string().min(3)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const reviewer = req.session.userId || 'system';
    const applicantId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const applicant = kyc.setRiskOverride(applicantId, parsed.data, reviewer);
    if (!applicant) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    await kyc.save();
    res.json(applicant);
  });

  return router;
};
