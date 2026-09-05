export async function calculateScores(supabase: any, run_id: string, matches: any[], exceptions: any[]) {
  const { data: groundTruths } = await supabase.from('ground_truth').select('*').eq('run_id', run_id)

  let TP = 0, FP = 0, FN = 0, TN = 0
  let correctNoMatch = 0
  let totalNoMatch = 0

  if (!groundTruths) return { precision: 0, recall: 0, f1: 0, exception_yield: 0 }

  for (const gt of groundTruths) {
    if (gt.expected_match) {
      const foundMatch = matches.find(m => 
        (m.bank_txn_id === gt.source_record_id || m.ledger_entry_ids.includes(gt.source_record_id))
      )
      if (foundMatch) {
        // Simplistic correctness check
        const correct = foundMatch.processor_payout_id === gt.processor_id || gt.ledger_ids.some((id: string) => foundMatch.ledger_entry_ids.includes(id))
        if (correct) {
          TP++
        } else {
          FP++ // Incorrect match
        }
      } else {
        FN++ // Missed match
      }
    } else {
      totalNoMatch++
      const foundException = exceptions.find(e => e.record_id === gt.source_record_id)
      if (foundException) {
        TN++
        correctNoMatch++
      } else {
        FP++
      }
    }
  }

  const precision = (TP + FP) === 0 ? 0 : TP / (TP + FP)
  const recall = (TP + FN) === 0 ? 0 : TP / (TP + FN)
  const f1 = (precision + recall) === 0 ? 0 : 2 * (precision * recall) / (precision + recall)
  const exception_yield = totalNoMatch === 0 ? 0 : correctNoMatch / totalNoMatch

  return { precision, recall, f1, exception_yield }
}
