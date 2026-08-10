import { z } from 'zod';
import { ConventionCategory, ConventionStatus } from '@devdigest/shared';

/**
 * LLM structured-output schemas + HTTP route DTOs for the conventions module.
 */

// ---------------------------------------------------------------------------
// S4b — raw extraction from file bodies (schemaName: 'ConventionExtraction')
// ---------------------------------------------------------------------------

export const ConventionExtractionSchema = z.object({
  candidates: z
    .array(
      z.object({
        rule: z.string().min(1).max(300),
        category: ConventionCategory,
        evidence_path: z.string().min(1).max(500),
        evidence_start_line: z.number().int().positive(),
        evidence_end_line: z.number().int().positive(),
        evidence_snippet: z.string().min(1).max(1000),
        /** How this rule can be checked. The model must self-classify — a hint,
         *  not a contract: an uncompilable pattern still falls through to the
         *  semantic judge rather than being dropped. */
        verifiable: z.enum(['pattern', 'semantic']),
        /** ast-grep pattern matching code that FOLLOWS the rule. Required iff verifiable === 'pattern'. */
        support_pattern: z.string().max(200).nullish(),
        violation_pattern: z.string().max(200).nullish(),
      }),
    )
    .max(20),
});
export type ConventionExtraction = z.infer<typeof ConventionExtractionSchema>;

// ---------------------------------------------------------------------------
// S4a — phrase mined patterns (schemaName: 'ConventionPhrase')
// ---------------------------------------------------------------------------

export const ConventionPhraseSchema = z.object({
  /** One entry per input MinedPattern, in the SAME order — the model phrases,
   *  it does not invent or drop rows (the pattern is already proven). */
  rules: z.array(z.object({ rule: z.string().min(1).max(300) })).max(20),
});
export type ConventionPhrase = z.infer<typeof ConventionPhraseSchema>;

// ---------------------------------------------------------------------------
// S6b — LLM-as-judge (schemaName: 'ConventionJudgement')
// ---------------------------------------------------------------------------

export const ConventionJudgementSchema = z.object({
  verdicts: z.array(
    z.object({
      file: z.string(),
      verdict: z.enum(['follows', 'violates', 'not_applicable']),
      reason: z.string().max(200),
    }),
  ),
});
export type ConventionJudgement = z.infer<typeof ConventionJudgementSchema>;

// ---------------------------------------------------------------------------
// Route DTOs
// ---------------------------------------------------------------------------

export const UpdateConventionBody = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().min(1).max(2000).optional(),
  })
  .refine((v) => v.status !== undefined || v.rule !== undefined, {
    message: 'At least one of status or rule is required',
  });
export type UpdateConventionBody = z.infer<typeof UpdateConventionBody>;

export const BulkStatusBody = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  status: ConventionStatus,
});
export type BulkStatusBody = z.infer<typeof BulkStatusBody>;

export const SkillPreviewDto = z.object({
  name: z.string(),
  description: z.string(),
  type: z.literal('convention'),
  body: z.string(),
  candidate_count: z.number().int(),
});
export type SkillPreviewDto = z.infer<typeof SkillPreviewDto>;

export const ScanStatusFilter = z.enum(['pending', 'accepted', 'rejected', 'all']);
export type ScanStatusFilter = z.infer<typeof ScanStatusFilter>;
