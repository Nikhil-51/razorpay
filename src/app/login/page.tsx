"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [isLogin, setIsLogin] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      alert(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }
  
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      alert(error.message)
    } else if (data.session) {
      router.push('/dashboard')
    } else {
      alert("Signed up successfully! Please check your email to verify your account, then log in.")
      setIsLogin(true)
    }
    setLoading(false)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-950 w-full absolute inset-0 z-50">
      <Card className="w-[400px] bg-zinc-900 border-zinc-800">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-white">AI Finance Controller</CardTitle>
          <CardDescription className="text-zinc-400">Sign in to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={isLogin ? handleLogin : handleSignUp} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Email</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="bg-zinc-950 border-zinc-800 text-white" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Password</label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="bg-zinc-950 border-zinc-800 text-white" />
            </div>
            <div className="pt-4">
               <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white border-0">
                 {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : isLogin ? 'Log In' : 'Sign Up'}
               </Button>
            </div>
            <div className="text-center text-sm text-zinc-400 mt-4">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
              <button type="button" onClick={() => setIsLogin(!isLogin)} className="text-blue-500 hover:underline">
                {isLogin ? "Sign Up" : "Log In"}
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
