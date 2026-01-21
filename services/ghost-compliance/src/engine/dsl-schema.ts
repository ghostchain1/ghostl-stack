import { z } from 'zod';
import type { PolicyBundle, WhenExpr } from './types';

const ComparatorSchema = z.union([
  z.object({ eq: z.unknown() }).strict(),
  z.object({ ne: z.unknown() }).strict(),
  z.object({ gt: z.number() }).strict(),
  z.object({ gte: z.number() }).strict(),
  z.object({ lt: z.number() }).strict(),
  z.object({ lte: z.number() }).strict(),
  z.object({ in: z.array(z.unknown()) }).strict(),
  z.object({ contains: z.unknown() }).strict(),
  z.object({ matches: z.string().min(1) }).strict()
]);

const comparatorKeys = new Set(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'matches']);

const LeafSchema = z.record(z.unknown()).superRefine((value, ctx) => {
  for (const [field, comparator] of Object.entries(value)) {
    if (!comparator || typeof comparator !== 'object' || Array.isArray(comparator)) {
      continue;
    }
    const keys = Object.keys(comparator);
    if (keys.length !== 1 || !comparatorKeys.has(keys[0])) {
      continue;
    }
    const parsed = ComparatorSchema.safeParse(comparator);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid comparator for "${field}": ${parsed.error.message}`
      });
    }
  }
});

const WhenExprSchema: z.ZodType<WhenExpr> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(WhenExprSchema).min(1) }),
    z.object({ any: z.array(WhenExprSchema).min(1) }),
    z.object({ not: WhenExprSchema }),
    LeafSchema
  ])
);

const PolicyEffectSchema = z
  .object({
    deny: z
      .object({
        reason: z.string().min(1),
        message: z.string().optional()
      })
      .optional(),
    require: z
      .object({
        controls: z.array(z.string()).optional(),
        disclosures: z.array(z.string()).optional(),
        manualReview: z.boolean().optional()
      })
      .optional(),
    allow: z.boolean().optional(),
    reason: z.string().optional()
  })
  .refine((val) => [val.deny, val.require, val.allow].filter((v) => v !== undefined).length === 1, {
    message: 'Exactly one effect must be specified.'
  });

const PolicyRuleSchema = z.object({
  id: z.string().min(1),
  priority: z.number().int().nonnegative(),
  appliesTo: z.object({ actions: z.array(z.string().min(1)).min(1) }),
  when: WhenExprSchema,
  effect: PolicyEffectSchema
});

export const PolicyBundleSchema: z.ZodType<PolicyBundle> = z.object({
  apiVersion: z.string().min(1),
  kind: z.literal('PolicyBundle'),
  metadata: z.object({
    bundleId: z.string().min(1),
    version: z.string().min(1)
  }),
  defaults: z
    .object({
      conflictStrategy: z.literal('most_restrictive').optional(),
      decisionTTLSeconds: z.number().int().positive().optional()
    })
    .optional(),
  policies: z.array(PolicyRuleSchema).min(1)
});

export type PolicyBundleInput = z.input<typeof PolicyBundleSchema>;
export type PolicyBundleOutput = z.output<typeof PolicyBundleSchema>;
