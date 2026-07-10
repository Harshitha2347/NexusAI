import {FormEvent,useState} from "react"
import {Eye,EyeOff,Sparkles} from "lucide-react"

import {useStore} from "../store"

export default function AuthPage(){
    const [mode,setMode]=useState<"login"|"register">("login")
    const [name,setName]=useState("")
    const [email,setEmail]=useState("")
    const [password,setPass]=useState("")
    const [showPw,setShowPw]=useState(false)

    const {login,register,authLoading,authError}=useStore()

    const submit=async(e:FormEvent)=>{
        e.preventDefault()

        if(mode==="login"){
            await login(email,password)
        }else{
            await register(name,email,password)
        }
    }

    return(
        <div className="min-h-screen flex items-center justify-center p-4 relative">
            {/* Aurora */}
            <div className="aurora-bg">
                <div className="aurora-blob"/>
                <div className="aurora-blob"/>
                <div className="aurora-blob"/>
            </div>

            <div className="relative z-10 w-full max-w-sm animate-slide-up">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div
                        className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
                        style={{background:"linear-gradient(135deg,#7c3aed,#06b6d4)"}}
                    >
                        <Sparkles size={28} className="text-white"/>
                    </div>

                    <h1
                        className="text-2xl font-bold"
                        style={{color:"var(--text-primary)"}}
                    >
                        NexusAI
                    </h1>

                    <p
                        className="text-base mt-1"
                        style={{color:"var(--text-secondary)"}}
                    >
                        {mode==="login"?"Welcome back":"Create your account"}
                    </p>
                </div>

                {/* Card */}
                <div className="glass rounded-2xl p-6">
                    {/* Toggle */}
                    <div
                        className="flex gap-1 mb-6 p-1 rounded-xl"
                        style={{background:"rgba(0,0,0,0.3)"}}
                    >
                        {(["login","register"] as const).map(m=>(
                            <button
                                key={m}
                                onClick={()=>setMode(m)}
                                className="flex-1 py-1.5 text-base font-medium rounded-lg transition-all duration-200"
                                style={
                                    mode===m
                                        ? {
                                              background:"linear-gradient(135deg,#7c3aed,#06b6d4)",
                                              color:"#fff",
                                          }
                                        : {
                                              color:"var(--text-secondary)",
                                          }
                                }
                            >
                                {m==="login"?"Sign In":"Sign Up"}
                            </button>
                        ))}
                    </div>

                    <form onSubmit={submit} className="space-y-4">
                        {mode==="register"&&(
                            <div>
                                <label
                                    className="block text-sm font-medium mb-1.5"
                                    style={{color:"var(--text-secondary)"}}
                                >
                                    Full Name
                                </label>

                                <input
                                    className="input-glass w-full px-3 py-2.5 rounded-lg text-base"
                                    placeholder="Jane Smith"
                                    value={name}
                                    onChange={e=>setName(e.target.value)}
                                    required
                                />
                            </div>
                        )}

                        <div>
                            <label
                                className="block text-sm font-medium mb-1.5"
                                style={{color:"var(--text-secondary)"}}
                            >
                                Email
                            </label>

                            <input
                                type="email"
                                className="input-glass w-full px-3 py-2.5 rounded-lg text-base"
                                placeholder="you@example.com"
                                value={email}
                                onChange={e=>setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div>
                            <label
                                className="block text-sm font-medium mb-1.5"
                                style={{color:"var(--text-secondary)"}}
                            >
                                Password
                            </label>

                            <div className="relative">
                                <input
                                    type={showPw?"text":"password"}
                                    className="input-glass w-full px-3 py-2.5 rounded-lg text-base pr-10"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e=>setPass(e.target.value)}
                                    required
                                    minLength={6}
                                />

                                <button
                                    type="button"
                                    onClick={()=>setShowPw(v=>!v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-opacity hover:opacity-100 opacity-50"
                                >
                                    {showPw?<EyeOff size={16}/>:<Eye size={16}/>}
                                </button>
                            </div>
                        </div>

                        {authError&&(
                            <p
                                className="text-sm px-3 py-2 rounded-lg"
                                style={{
                                    color:"#f87171",
                                    background:"rgba(239,68,68,0.1)",
                                    border:"1px solid rgba(239,68,68,0.2)",
                                }}
                            >
                                {authError}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={authLoading}
                            className="btn-gradient w-full py-2.5 rounded-lg text-base font-semibold text-white mt-2"
                        >
                            {authLoading
                                ?"Please wait…"
                                :mode==="login"
                                    ?"Sign In"
                                    :"Create Account"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}