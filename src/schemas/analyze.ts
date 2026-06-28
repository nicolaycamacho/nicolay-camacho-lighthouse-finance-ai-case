import { z } from "zod";

export const analysisTypeSchema = z.enum(["variance", "expense_exception", "close_summary"]);

export const analyzeRequestSchema = z
  .object({
    query: z.string().trim().min(1, "query is required"),
    analysis_type: analysisTypeSchema,
    entity_id: z.string().trim().min(1).optional(),
    period: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "period must use YYYY-MM format")
      .optional(),
    account_ids: z.array(z.string().trim().min(1)).optional(),
    case_ids: z.array(z.string().trim().min(1)).optional(),
    materiality_threshold: z.number().nonnegative().optional(),
    include_citations: z.boolean().optional(),
    requested_actions: z.array(z.string().trim().min(1)).optional(),
    context: z.record(z.unknown()).optional()
  })
  .strict();

const citationSchema = z
  .object({
    source_type: z.string().min(1),
    source_record_id: z.string().min(1)
  })
  .strict();

const driverSchema = z
  .object({
    rank: z.number().int().positive(),
    driver_type: z.string().min(1),
    label: z.string().min(1),
    amount: z.number().optional(),
    currency: z.string().min(1).optional(),
    explanation: z.string().min(1),
    citations: z.array(citationSchema).optional()
  })
  .strict();

const recommendedActionSchema = z
  .object({
    action_type: z.string().min(1),
    priority: z.enum(["low", "medium", "high"]),
    owner_role: z.string().min(1).optional(),
    text: z.string().min(1)
  })
  .strict();

export const analyzeResponseSchema = z
  .object({
    run_id: z.string().min(1),
    analysis_type: analysisTypeSchema,
    status: z.enum(["completed", "needs_review", "incomplete", "failed"]),
    summary: z.string().min(1),
    drivers: z.array(driverSchema),
    recommended_actions: z.array(recommendedActionSchema),
    confidence: z
      .object({
        overall: z.number().min(0).max(1),
        reasons: z.array(z.string().min(1))
      })
      .strict(),
    citations: z.array(citationSchema),
    validation: z
      .object({
        schema_valid: z.boolean(),
        grounding_records_found: z.number().int().nonnegative(),
        numeric_reconciliation_passed: z.boolean()
      })
      .strict(),
    review_required: z.boolean(),
    audit: z
      .object({
        generated_at: z.string().datetime(),
        model_name: z.string().min(1),
        prompt_version: z.string().min(1)
      })
      .strict()
  })
  .strict();

export type AnalysisType = z.infer<typeof analysisTypeSchema>;
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;
