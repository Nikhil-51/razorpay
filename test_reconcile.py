import os
import requests
import json
import time
from dotenv import load_dotenv

load_dotenv('.env.local')
url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
key = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

print("Generating demo data...")
res = requests.post(f"{url}/functions/v1/generate-demo", headers={
    "Authorization": f"Bearer {key}",
    "Content-Type": "application/json"
}, json={"seed": 42, "user_id": "00000000-0000-0000-0000-000000000000"})
print("Demo response:", res.status_code, res.text)

time.sleep(2)

print("Fetching latest run...")
res = requests.get(f"{url}/rest/v1/reconciliation_runs?order=created_at.desc&limit=1", headers={
    "apikey": key,
    "Authorization": f"Bearer {key}"
})
runs = res.json()
if not runs:
    print("No runs found!")
    exit(1)

run_id = runs[0]['id']
print(f"Latest run_id: {run_id}")

print("Triggering Python AI Agent...")
res = requests.post("http://localhost:8000/reconcile", json={"run_id": run_id})
print("Agent response:", res.status_code, res.text)
