import { logAudit } from '../utils.ts'

export async function runTier2(supabase: any, run_id: string, bankTxns: any[], processorPayouts: any[], ledgerEntries: any[], settings: any) {
  const matches = []
  const remainingBankTxns = []
  
  for (const bank of bankTxns) {
    let matched = false
    
    const payout = processorPayouts.find(p => {
      if (p._matched) return false
      const amountDiff = Math.abs(p.net_amount - bank.amount)
      const isAmountWithinTolerance = amountDiff <= settings.exact_amount_tolerance || (amountDiff / bank.amount) * 100 <= settings.amount_tolerance_percent
      const dateDiff = Math.abs(new Date(bank.date).getTime() - new Date(p.payout_date).getTime()) / (1000 * 3600 * 24)
      const isDateWithinTolerance = dateDiff <= settings.date_window_business_days
      return isAmountWithinTolerance && isDateWithinTolerance && p.currency === bank.currency
    })
    
    if (payout) {
      const ledger = ledgerEntries.find(l => !l._matched && payout.included_invoice_ids.includes(l.invoice_id))
      
      if (ledger) {
        let rationale = 'Tier 2 — Tolerance Match\n✓ Currency matched'
        let discrepancy_type = 'TOLERANCE'
        const amountDiff = Math.abs(ledger.amount - bank.amount)
        const dateDiff = Math.abs(new Date(bank.date).getTime() - new Date(ledger.date).getTime()) / (1000 * 3600 * 24)
        
        if (payout.fee_amount > 0 && Math.abs(payout.gross_amount - ledger.amount) <= settings.exact_amount_tolerance) {
          rationale += '\n✓ Processor fee explains variance\nRationale:\nProcessor gross amount differs from ledger amount because the processor fee was not separately booked.'
          discrepancy_type = 'FEE_MISMATCH'
        } else if (dateDiff > 0 && amountDiff <= settings.exact_amount_tolerance) {
          rationale += `\n✓ Settlement lag: ${dateDiff} days`
          discrepancy_type = 'SETTLEMENT_LAG'
        } else if (amountDiff > settings.exact_amount_tolerance) {
          rationale += `\n✓ Amount variance: ${((amountDiff / bank.amount) * 100).toFixed(2)}%`
          discrepancy_type = 'FX_ROUNDING'
        }

        matches.push({
          run_id,
          bank_txn_id: bank.txn_id,
          processor_payout_id: payout.payout_id,
          ledger_entry_ids: [ledger.entry_id],
          invoice_ids: [ledger.invoice_id],
          tier: 2,
          status: 'MATCHED',
          confidence: 0.96,
          amount_difference: amountDiff,
          date_difference: dateDiff,
          currency: bank.currency,
          discrepancy_type,
          rationale,
          matching_features: { amount_tolerance_passed: true, date_tolerance_passed: true }
        })
        await logAudit(supabase, run_id, 'BANK', bank.txn_id, 'TIER_ATTEMPT', 2, 'MATCH', 0.96, 'Candidate found, tolerance passed')
        
        payout._matched = true
        ledger._matched = true
        matched = true
      }
    }
    
    if (!matched) {
      await logAudit(supabase, run_id, 'BANK', bank.txn_id, 'TIER_ATTEMPT', 2, 'NO_MATCH', 0, 'No candidate within tolerance')
      remainingBankTxns.push(bank)
    }
  }
  
  return { matches, remainingBankTxns }
}
