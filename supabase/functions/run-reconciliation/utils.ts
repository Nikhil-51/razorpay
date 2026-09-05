export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export type BankTransaction = any
export type ProcessorPayout = any
export type LedgerEntry = any
export type Match = any
export type Exception = any
export type AuditLog = any

export async function logAudit(supabase: any, run_id: string, record_type: string, record_id: string, action: string, tier: number, decision: string, confidence: number, reason: string, metadata: any = {}) {
  await supabase.from('audit_logs').insert({
    run_id,
    record_type,
    record_id,
    action,
    tier,
    decision,
    confidence,
    reason,
    metadata
  })
}
