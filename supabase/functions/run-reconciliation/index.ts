import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { corsHeaders } from './utils.ts'
import { runTier1 } from './tiers/tier1.ts'
import { runTier2 } from './tiers/tier2.ts'
import { runTier3 } from './tiers/tier3.ts'
import { runTier4 } from './tiers/tier4.ts'
import { processExceptions } from './exceptions.ts'
import { calculateScores } from './scoring.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { run_id } = await req.json()
    if (!run_id) throw new Error('run_id is required')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const startTime = performance.now()
    await supabase.from('reconciliation_runs').update({ status: 'RUNNING', started_at: new Date().toISOString() }).eq('id', run_id)

    const { data: run } = await supabase.from('reconciliation_runs').select('*').eq('id', run_id).single()
    const { data: bankTxns } = await supabase.from('bank_transactions').select('*').eq('run_id', run_id)
    const { data: processorPayouts } = await supabase.from('processor_payouts').select('*').eq('run_id', run_id)
    const { data: ledgerEntries } = await supabase.from('ledger_entries').select('*').eq('run_id', run_id)
    const { data: settings } = await supabase.from('reconciliation_settings').select('*').eq('user_id', run.user_id).single()

    const currentSettings = settings || {
      exact_amount_tolerance: 0.01,
      date_window_business_days: 3,
      amount_tolerance_percent: 2,
      fx_tolerance_percent: 0.5,
      tier4_confidence_threshold: 0.85
    }

    const mutablePayouts = (processorPayouts || []).map((p: any) => ({ ...p, _matched: false }))
    const mutableLedgers = (ledgerEntries || []).map((l: any) => ({ ...l, _matched: false }))
    
    let allMatches: any[] = []
    let remainingBank = bankTxns || []

    const tier1 = await runTier1(supabase, run_id, remainingBank, mutablePayouts, mutableLedgers, currentSettings)
    allMatches.push(...tier1.matches)
    remainingBank = tier1.remainingBankTxns

    const tier2 = await runTier2(supabase, run_id, remainingBank, mutablePayouts, mutableLedgers, currentSettings)
    allMatches.push(...tier2.matches)
    remainingBank = tier2.remainingBankTxns

    const tier3 = await runTier3(supabase, run_id, remainingBank, mutablePayouts, mutableLedgers, currentSettings)
    allMatches.push(...tier3.matches)
    remainingBank = tier3.remainingBankTxns

    const tier4 = await runTier4(supabase, run_id, remainingBank, mutablePayouts, mutableLedgers, currentSettings)
    allMatches.push(...tier4.matches)
    remainingBank = tier4.remainingBankTxns

    const exceptions = await processExceptions(supabase, run_id, remainingBank, mutablePayouts, mutableLedgers)

    // Bulk inserts - edge functions have 2MB payload limits, but ~70 records is tiny
    if (allMatches.length > 0) {
      await supabase.from('reconciliation_matches').insert(allMatches)
    }
    
    if (exceptions.length > 0) {
      await supabase.from('exceptions').insert(exceptions)
    }

    const matchedLedgerIds = mutableLedgers.filter((l: any) => l._matched).map((l: any) => l.entry_id)
    if (matchedLedgerIds.length > 0) {
      await supabase.from('ledger_entries').update({ status: 'RECONCILED' }).in('entry_id', matchedLedgerIds)
    }

    const scores = await calculateScores(supabase, run_id, allMatches, exceptions)
    
    const endTime = performance.now()
    const executionTimeMs = endTime - startTime
    const throughput = (run.total_records || 1) / (executionTimeMs / 1000)

    await supabase.from('reconciliation_runs').update({
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      matched_records: allMatches.length,
      exception_records: exceptions.length,
      match_rate: ((allMatches.length / Math.max(1, (run.total_records || 1))) * 100),
      precision: scores.precision,
      recall: scores.recall,
      f1: scores.f1,
      exception_yield: scores.exception_yield,
      execution_time_ms: executionTimeMs,
      throughput: throughput
    }).eq('id', run_id)

    return new Response(JSON.stringify({ success: true, run_id, matches: allMatches.length, exceptions: exceptions.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
