import { logAudit } from './utils.ts'

export async function processExceptions(supabase: any, run_id: string, remainingBankTxns: any[], processorPayouts: any[], ledgerEntries: any[]) {
  const exceptions = []
  
  for (const bank of remainingBankTxns) {
    const age = Math.floor((new Date().getTime() - new Date(bank.date).getTime()) / (1000 * 3600 * 24))
    exceptions.push({
      run_id,
      exception_code: 'BANK_ONLY',
      source: 'BANK',
      record_id: bank.txn_id,
      amount: bank.amount,
      currency: bank.currency,
      date: bank.date,
      confidence: 1.0,
      suggested_action: 'Investigate unrecorded deposit/fee.',
      age_days: age,
      status: 'OPEN'
    })
    await logAudit(supabase, run_id, 'BANK', bank.txn_id, 'EXCEPTION_CREATED', 5, 'EXCEPTION', 1.0, 'No match found in any tier')
  }

  for (const ledger of ledgerEntries.filter(l => !l._matched)) {
    const age = Math.floor((new Date().getTime() - new Date(ledger.date).getTime()) / (1000 * 3600 * 24))
    
    const duplicate = ledgerEntries.find(l => l.entry_id !== ledger.entry_id && l.amount === ledger.amount && l.date === ledger.date && l._matched)
    
    let code = 'LEDGER_ONLY'
    let action = 'Check if payment was received in another account.'
    
    if (duplicate) {
      code = 'DUPLICATE_SUSPECT'
      action = 'Verify if this is a duplicate entry.'
    } else if (age > 7) {
      code = 'STALE_UNMATCHED'
      action = 'Follow up with processor or customer.'
    }

    exceptions.push({
      run_id,
      exception_code: code,
      source: 'LEDGER',
      record_id: ledger.entry_id,
      amount: ledger.amount,
      currency: ledger.currency,
      date: ledger.date,
      confidence: duplicate ? 0.9 : 1.0,
      suggested_action: action,
      age_days: age,
      status: 'OPEN',
      related_candidate_ids: duplicate ? [duplicate.entry_id] : []
    })
    await logAudit(supabase, run_id, 'LEDGER', ledger.entry_id, 'EXCEPTION_CREATED', 5, 'EXCEPTION', 1.0, code)
  }

  return exceptions
}
