import { z } from "zod";

export const VerifyReport = z.object({
  ok: z.boolean(),
  gates: z.record(z.string(), z.enum(["pass", "fail"])),
  notes: z.array(z.string()).default([])
});

export type VerifyReportT = z.infer<typeof VerifyReport>;
