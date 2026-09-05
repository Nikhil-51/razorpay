"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"

export default function SettingsPage() {
  const [loading, setLoading] = useState(false)
  const [settings, setSettings] = useState({
    exact_amount_tolerance: 0.01,
    date_window_business_days: 3,
    amount_tolerance_percent: 2,
    fx_tolerance_percent: 0.5,
    tier4_confidence_threshold: 0.85,
    stale_threshold_days: 7
  })
  
  const supabase = createClient()

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    const { data: session } = await supabase.auth.getSession()
    if (!session?.session?.user) return

    const { data } = await supabase.from('reconciliation_settings')
      .select('*')
      .eq('user_id', session.session.user.id)
      .single()
      
    if (data) {
      setSettings(data)
    }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const user_id = session?.session?.user?.id
      
      if (!user_id) throw new Error("Must be logged in to save settings")

      const { error } = await supabase.from('reconciliation_settings')
        .upsert({ user_id, ...settings })
        
      if (error) throw error
      alert('Settings saved successfully.')
    } catch (e: any) {
      alert(`Error saving settings: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setSettings(prev => ({ ...prev, [name]: parseFloat(value) || value }))
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Reconciliation Settings</h1>
        <p className="text-zinc-400">Configure global parameters for the matching engine.</p>
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Matching Tolerances</CardTitle>
          <CardDescription className="text-zinc-400">Rules applied during Tier 2 and Tier 4 matching.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Exact Amount Tolerance ($)</label>
              <Input 
                name="exact_amount_tolerance"
                type="number" 
                step="0.01" 
                value={settings.exact_amount_tolerance} 
                onChange={handleChange}
                className="bg-zinc-950 border-zinc-800 text-zinc-100"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Date Window (Days)</label>
              <Input 
                name="date_window_business_days"
                type="number" 
                value={settings.date_window_business_days} 
                onChange={handleChange}
                className="bg-zinc-950 border-zinc-800 text-zinc-100"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Amount Variance Tolerance (%)</label>
              <Input 
                name="amount_tolerance_percent"
                type="number" 
                step="0.1" 
                value={settings.amount_tolerance_percent} 
                onChange={handleChange}
                className="bg-zinc-950 border-zinc-800 text-zinc-100"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Tier 4 Confidence Threshold (0-1)</label>
              <Input 
                name="tier4_confidence_threshold"
                type="number" 
                step="0.01" 
                max="1"
                value={settings.tier4_confidence_threshold} 
                onChange={handleChange}
                className="bg-zinc-950 border-zinc-800 text-zinc-100"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-800 flex justify-end">
             <Button onClick={handleSave} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white border-0">
               {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
               Save Changes
             </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
