import os
import json
import time
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

url = os.environ.get("SUPABASE_URL", "")
key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
gemini_key = os.environ.get("GEMINI_API_KEY", "")

def supabase_get(table, params):
    res = requests.get(f"{url}/rest/v1/{table}", headers={
        "apikey": key,
        "Authorization": f"Bearer {key}"
    }, params=params)
    res.raise_for_status()
    return res.json()

def supabase_post(table, data):
    res = requests.post(f"{url}/rest/v1/{table}", headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }, json=data)
    res.raise_for_status()
    return res

def supabase_patch(table, data, match_col, match_vals):
    # Simplistic batch patch if possible, but PostgREST supports updating by IN
    in_str = "(" + ",".join([f'"{v}"' for v in match_vals]) + ")"
    res = requests.patch(f"{url}/rest/v1/{table}?{match_col}=in.{in_str}", headers={
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }, json=data)
    res.raise_for_status()
    return res

def calculate_scores(run_id, matches, exceptions):
    try:
        ground_truths = supabase_get('ground_truth', {'run_id': f'eq.{run_id}'})
    except Exception as e:
        print("Error fetching ground truth:", e)
        ground_truths = []

    if not ground_truths:
        return {"precision": 0, "recall": 0, "f1": 0, "exception_yield": 0}

    TP, FP, FN, TN = 0, 0, 0, 0
    correctNoMatch = 0
    totalNoMatch = 0

    for gt in ground_truths:
        if gt.get('expected_match'):
            source_id = gt.get('source_record_id')
            found_match = next((m for m in matches if m.get('bank_txn_id') == source_id or source_id in m.get('ledger_entry_ids', [])), None)
            if found_match:
                ledger_ids = gt.get('ledger_ids', []) or []
                gt_processor = gt.get('processor_id')
                correct = (found_match.get('processor_payout_id') == gt_processor) or \
                          any(lid in found_match.get('ledger_entry_ids', []) for lid in ledger_ids)
                if correct:
                    TP += 1
                else:
                    FP += 1
            else:
                FN += 1
        else:
            totalNoMatch += 1
            source_id = gt.get('source_record_id')
            found_exception = next((e for e in exceptions if e.get('record_id') == source_id), None)
            if found_exception:
                TN += 1
                correctNoMatch += 1
            else:
                FP += 1

    precision = 0 if (TP + FP) == 0 else TP / (TP + FP)
    recall = 0 if (TP + FN) == 0 else TP / (TP + FN)
    f1 = 0 if (precision + recall) == 0 else 2 * (precision * recall) / (precision + recall)
    exception_yield = 0 if totalNoMatch == 0 else correctNoMatch / totalNoMatch

    return {"precision": precision, "recall": recall, "f1": f1, "exception_yield": exception_yield}


@app.route("/reconcile", methods=["POST"])
def reconcile_run():
    data = request.json
    run_id = data.get('run_id')
    if not run_id:
        return jsonify({"detail": "run_id is required"}), 400

    if not gemini_key:
        return jsonify({"detail": "GEMINI_API_KEY is missing. Please add it to your environment variables."}), 500

    try:
        start_time = time.time()
        
        # update run status
        requests.patch(f"{url}/rest/v1/reconciliation_runs?id=eq.{run_id}", headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        }, json={'status': 'RUNNING', 'started_at': datetime.utcnow().isoformat()}).raise_for_status()

        run = supabase_get('reconciliation_runs', {'id': f'eq.{run_id}'})[0]
        bank_txns = supabase_get('bank_transactions', {'run_id': f'eq.{run_id}'})
        processor_payouts = supabase_get('processor_payouts', {'run_id': f'eq.{run_id}'})
        ledger_entries = supabase_get('ledger_entries', {'run_id': f'eq.{run_id}'})

        bank_str = json.dumps([{"txn_id": b['txn_id'], "amount": b['amount'], "currency": b['currency'], "date": b['date'], "counterparty": b['counterparty_text'], "ref": b['ref_code']} for b in bank_txns])
        proc_str = json.dumps([{"payout_id": p['payout_id'], "net_amount": p['net_amount'], "gross_amount": p['gross_amount'], "fee": p['fee_amount'], "currency": p['currency'], "date": p['payout_date'], "invoice_ids": p['included_invoice_ids']} for p in processor_payouts])
        ledg_str = json.dumps([{"entry_id": l['entry_id'], "amount": l['amount'], "currency": l['currency'], "date": l['date'], "invoice_id": l['invoice_id'], "name": l['customer_name']} for l in ledger_entries])

        prompt = f"""You are an expert AI Finance-Ops Reconciliation Agent.
Your task is to reconcile these 3 datasets: Bank Transactions, Processor Payouts, and Ledger Entries.
Here are the rules for reconciliation:
1. Exact Match: Amounts and Dates match exactly.
2. Settlement Lag: Bank date is a few days after Ledger/Processor date.
3. Fee Mismatch: Bank amount = Processor gross - fee. Processor net might differ slightly due to rounding or missing tax. Ledger amount is usually gross.
4. FX Rounding: Bank amount is slightly off from Processor/Ledger due to exchange rate rounding.
5. Many-to-One: One Bank txn maps to ONE Processor payout which maps to MULTIPLE Ledger entries whose amounts sum up to the payout.
6. Garbled Reference: The bank counterparty text is garbled but string similarity strongly matches a ledger entry.

Datasets:
BANK TRANSACTIONS:
{bank_str}

PROCESSOR PAYOUTS:
{proc_str}

LEDGER ENTRIES:
{ledg_str}

Output STRICTLY valid JSON with the following schema:
{{
  "matches": [
    {{
      "bank_txn_id": "BNK-...",
      "processor_payout_id": "pout_...",
      "ledger_entry_ids": ["inv_..."],
      "discrepancy_type": "CLEAN" | "SETTLEMENT_LAG" | "FEE_MISMATCH" | "FX_ROUNDING" | "MANY_TO_ONE" | "GARBLED_REF",
      "rationale": "Explanation for the match"
    }}
  ],
  "exceptions": [
    {{
      "source_type": "BANK" | "LEDGER" | "PROCESSOR",
      "record_id": "BNK-...",
      "reason": "Detailed explanation of why it could not be matched"
    }}
  ]
}}

DO NOT output markdown, ONLY the raw JSON object."""

        gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={gemini_key}"
        gemini_res = requests.post(gemini_url, headers={"Content-Type": "application/json"}, json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json"
            }
        })
        gemini_res.raise_for_status()
        ai_data = gemini_res.json()
        ai_content = ai_data['candidates'][0]['content']['parts'][0]['text']
        
        try:
            parsed = json.loads(ai_content)
        except json.JSONDecodeError:
            return jsonify({"detail": f"Failed to parse AI response as JSON: {ai_content}"}), 500

        matches = parsed.get("matches", [])
        exceptions = parsed.get("exceptions", [])

        db_matches = []
        for m in matches:
            bank = next((b for b in bank_txns if b['txn_id'] == m.get('bank_txn_id')), None)
            ledgers = [l for l in ledger_entries if l['entry_id'] in m.get('ledger_entry_ids', [])]
            ledger_amount = sum(l['amount'] for l in ledgers)
            
            db_matches.append({
                "run_id": run_id,
                "bank_txn_id": m.get('bank_txn_id'),
                "processor_payout_id": m.get('processor_payout_id'),
                "ledger_entry_ids": m.get('ledger_entry_ids'),
                "invoice_ids": [l['invoice_id'] for l in ledgers],
                "tier": 5,
                "status": 'MATCHED',
                "confidence": 0.99,
                "amount_difference": abs(ledger_amount - bank['amount']) if bank else 0,
                "date_difference": 0,
                "currency": bank['currency'] if bank else 'INR',
                "discrepancy_type": m.get('discrepancy_type', 'AI_MATCH'),
                "rationale": f"Python AI Agent: {m.get('rationale')}",
                "matching_features": {"ai_matched": True}
            })

        db_exceptions = []
        for e in exceptions:
            amount = 0
            currency = 'INR'
            date = datetime.utcnow().strftime('%Y-%m-%d')
            stype = e.get('source_type')
            rec_id = e.get('record_id')
            
            if stype == 'BANK':
                b = next((x for x in bank_txns if x['txn_id'] == rec_id), None)
                if b: amount, currency, date = b['amount'], b['currency'], b['date']
            elif stype == 'LEDGER':
                l = next((x for x in ledger_entries if x['entry_id'] == rec_id), None)
                if l: amount, currency, date = l['amount'], l['currency'], l['date']
            elif stype == 'PROCESSOR':
                p = next((x for x in processor_payouts if x['payout_id'] == rec_id), None)
                if p: amount, currency, date = p['net_amount'], p['currency'], p['payout_date']
                
            db_exceptions.append({
                "run_id": run_id,
                "source_type": stype,
                "record_id": rec_id,
                "amount": amount,
                "currency": currency,
                "date": date,
                "status": 'UNRESOLVED',
                "reason": e.get('reason')
            })

        if db_matches:
            supabase_post('reconciliation_matches', db_matches)
        if db_exceptions:
            supabase_post('exceptions', db_exceptions)

        matched_ledger_ids = [lid for m in matches for lid in m.get('ledger_entry_ids', [])]
        if matched_ledger_ids:
            supabase_patch('ledger_entries', {'status': 'RECONCILED'}, 'entry_id', matched_ledger_ids)

        scores = calculate_scores(run_id, db_matches, db_exceptions)
        
        end_time = time.time()
        exec_time_ms = (end_time - start_time) * 1000
        throughput = run.get('total_records', 1) / ((end_time - start_time) or 1)

        match_rate = 0
        if run.get('total_records'):
             match_rate = (len(db_matches) / max(1, run.get('total_records'))) * 100

        requests.patch(f"{url}/rest/v1/reconciliation_runs?id=eq.{run_id}", headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        }, json={
            'status': 'COMPLETED',
            'completed_at': datetime.utcnow().isoformat(),
            'matched_records': len(db_matches),
            'exception_records': len(db_exceptions),
            'match_rate': match_rate,
            'precision': scores['precision'],
            'recall': scores['recall'],
            'f1': scores['f1'],
            'exception_yield': scores['exception_yield'],
            'execution_time_ms': exec_time_ms,
            'throughput': throughput
        }).raise_for_status()

        return jsonify({"success": True, "run_id": run_id, "matches": len(db_matches), "exceptions": len(db_exceptions)})

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"detail": str(e)}), 500

@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    messages = data.get('messages', [])
    
    if not gemini_key:
        return jsonify({"detail": "GEMINI_API_KEY is missing."}), 500

    if not messages:
        return jsonify({"detail": "No messages provided."}), 400

    system_prompt = "System Context: You are R3CON AI, a highly capable financial management assistant and AI reconciliation expert. You help users navigate the R3CON platform, answer questions about three-way reconciliation, and provide sound financial management tips. Always be professional, concise, and helpful.\n\n"

    formatted_messages = []
    for i, msg in enumerate(messages):
        role = "user" if msg['role'] == "user" else "model"
        text = msg['content']
        if i == 0 and role == "user":
            text = system_prompt + text
        
        formatted_messages.append({
            "role": role,
            "parts": [{"text": text}]
        })

    gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={gemini_key}"
    payload = {
        "contents": formatted_messages,
        "generationConfig": {
            "temperature": 0.7
        }
    }

    try:
        gemini_res = requests.post(gemini_url, headers={"Content-Type": "application/json"}, json=payload)
        gemini_res.raise_for_status()
        ai_data = gemini_res.json()
        ai_content = ai_data['candidates'][0]['content']['parts'][0]['text']
        return jsonify({"response": ai_content})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"detail": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
