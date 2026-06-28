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
    materiality_threshold: z.number().finite().nonnegative().optional(),
    include_citations: z.boolean().optional(),
    requested_actions: z.array(z.string().trim().min(1)).optional(),
    context: z.record(z.unknown()).optional()
  })
  .strict();

export const citationSchema = z
  .object({
    source_type: z.string().min(1),
    source_record_id: z.string().min(1)
  })
  .strict();

const driverSchema = z
  .object({
    rank: z.number().finite().int().positive(),
    driver_type: z.string().min(1),
    label: z.string().min(1),
    amount: z.number().finite().optional(),
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

const responseEnvelopeSchema = z
  .object({
    run_id: z.string().min(1),
    analysis_type: analysisTypeSchema,
    status: z.enum(["completed", "needs_review", "incomplete", "failed"]),
    summary: z.string().min(1),
    drivers: z.array(driverSchema),
    recommended_actions: z.array(recommendedActionSchema),
    confidence: z
      .object({
        overall: z.number().finite().min(0).max(1),
        reasons: z.array(z.string().min(1))
      })
      .strict(),
    citations: z.array(citationSchema),
    review_required: z.boolean(),
    audit: z
      .object({
        generated_at: z.string().datetime(),
        model_name: z.string().min(1),
        prompt_version: z.string().min(1)
      })
      .strict()
  });

export const analyzeModelOutputSchema = responseEnvelopeSchema.strict();

const analyzeModelContentDriverSchema = driverSchema
  .omit({
    citations: true
  })
  .strip();

export const analyzeModelContentSchema = responseEnvelopeSchema
  .omit({
    run_id: true,
    analysis_type: true,
    audit: true,
    citations: true,
    drivers: true
  })
  .extend({
    drivers: z.array(analyzeModelContentDriverSchema)
  })
  .strip();

export const analyzeResponseSchema = responseEnvelopeSchema
  .extend({
    validation: z
      .object({
        schema_valid: z.boolean(),
        grounding_records_found: z.number().finite().int().nonnegative(),
        numeric_reconciliation_passed: z.boolean()
      })
      .strict()
  })
  .strict();

export type AnalysisType = z.infer<typeof analysisTypeSchema>;
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type FinanceAnalyzerRequest = Omit<AnalyzeRequest, "include_citations">;
export type AnalyzeModelOutput = z.infer<typeof analyzeModelOutputSchema>;
export type AnalyzeModelContent = z.infer<typeof analyzeModelContentSchema>;
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;
