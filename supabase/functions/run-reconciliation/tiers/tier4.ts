import { logAudit } from '../utils.ts'
import stringSimilarity from 'https://esm.sh/string-similarity@4.0.4'

export async function runTier4(supabase: any, run_id: string, bankTxns: any[], processorPayouts: any[], ledgerEntries: any[], settings: any) {
  const matches = []
  const remainingBankTxns = []
  
  for (const bank of bankTxns) {
    let matched = false
    let bestScore = 0
    let bestPayout = null
    let bestLedger = null
    
    const payout = processorPayouts.find(p => !p._matched && p.currency === bank.currency && Math.abs(p.net_amount - bank.amount) <= settings.exact_amount_tolerance)
    
    if (payout) {
      for (const invoice_id of payout.included_invoice_ids) {
        const ledger = ledgerEntries.find(l => !l._matched && l.invoice_id === invoice_id)
        if (ledger) {
          const nameScore = stringSimilarity.compareTwoStrings(bank.counterparty_text?.toLowerCase() || '', ledger.customer_name?.toLowerCase() || '')
          const refScore = stringSimilarity.compareTwoStrings(bank.ref_code?.toLowerCase() || '', ledger.invoice_id?.toLowerCase() || '')
          
          const combinedScore = (nameScore * 0.4) + (refScore * 0.6)
          
          if (combinedScore > bestScore) {
            bestScore = combinedScore
            bestLedger = ledger
            bestPayout = payout
          }
        }
      }
    }
    
    if (bestScore >= (settings.tier4_confidence_threshold || 0.85)) {
        matches.push({
          run_id,
          bank_txn_id: bank.txn_id,
          processor_payout_id: bestPayout.payout_id,
          ledger_entry_ids: [bestLedger.entry_id],
          invoice_ids: [bestLedger.invoice_id],
          tier: 4,
          status: 'MATCHED',
          confidence: parseFloat(bestScore.toFixed(2)),
          amount_difference: Math.abs(bestLedger.amount - bank.amount),
          date_difference: Math.abs(new Date(bank.date).getTime() - new Date(bestLedger.date).getTime()) / (1000 * 3600 * 24),
          currency: bank.currency,
          discrepancy_type: 'GARBLED_REF',
          rationale: `Tier 4 — Narrative Match\nCounterparty name and invoice reference strongly agree despite abbreviated bank narrative.\nSimilarity score: ${(bestScore * 100).toFixed(1)}%`,
          matching_features: { counterparty_similarity: bestScore, fuzzy_match: true }
        })
        await logAudit(supabase, run_id, 'BANK', bank.txn_id, 'TIER_ATTEMPT', 4, 'MATCH', bestScore, 'Fuzzy match successful')
        
        bestPayout._matched = true
        bestLedger._matched = true
        matched = true
    }
    
    if (!matched) {
      await logAudit(supabase, run_id, 'BANK', bank.txn_id, 'TIER_ATTEMPT', 4, 'NO_MATCH', bestScore, 'No candidate met confidence threshold')
      remainingBankTxns.push(bank)
    }
  }
  
  return { matches, remainingBankTxns }
}
