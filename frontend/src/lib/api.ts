import axios from "axios"

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

api.interceptors.request.use(config=>{
    const token=localStorage.getItem("token")

    if(token){
        config.headers.Authorization=`Bearer ${token}`
    }

    return config
})

api.interceptors.response.use(
    r=>r,
    err=>{
        if(err.response?.status===401){
            localStorage.removeItem("token")
            window.location.href="/login"
        }

        return Promise.reject(err)
    },
)

export default api

export interface User{
    id:string
    name:string
    email:string
}

export interface Convo{
    id:string
    title:string
    created_at:string
    updated_at:string
    is_shared?:boolean
    share_token?:string|null
}

export interface Message{
    id:string
    role:"user"|"assistant"
    content:string
    created_at:string
    used_search?:boolean
    branch_index?:number
    branch_count?:number
}

export interface AuthResult{
    token:string
    user:User
}

export type StreamEvent=
    |{
          type:"search"
          query:string
      }
    |{
          type:"branch"
          message_id:string
          branch_index:number
          branch_count:number
      }
    |{
          type:"delta"
          content:string
      }
    |{
          type:"done"
          message_id:string
          title?:string
          used_search?:boolean
      }
    |{
          type:"error"
          message:string
      }

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authAPI={
    register:(name:string,email:string,password:string)=>
        api
            .post<AuthResult>("/auth/register",{name,email,password})
            .then(r=>r.data),

    login:(email:string,password:string)=>
        api
            .post<AuthResult>("/auth/login",{email,password})
            .then(r=>r.data),

    me:()=>
        api
            .get<User>("/auth/me")
            .then(r=>r.data),
}

// ── Conversations ─────────────────────────────────────────────────────────────

export const convoAPI={
    list:()=>
        api.get<Convo[]>("/conversations").then(r=>r.data),

    create:()=>
        api.post<Convo>("/conversations").then(r=>r.data),

    rename:(id:string,title:string)=>
        api
            .patch<Convo>(`/conversations/${id}`,{title})
            .then(r=>r.data),

    delete:(id:string)=>
        api.delete(`/conversations/${id}`).then(r=>r.data),

    messages:(id:string)=>
        api
            .get<Message[]>(`/conversations/${id}/messages`)
            .then(r=>r.data),

    selectBranch:(id:string,messageId:string,direction:-1|1)=>
        api
            .patch<Message[]>(
                `/conversations/${id}/select-branch`,
                {
                    message_id:messageId,
                    direction,
                },
            )
            .then(r=>r.data),

    share:(id:string)=>
        api
            .post<{share_token:string;is_shared:boolean}>(
                `/conversations/${id}/share`,
            )
            .then(r=>r.data),

    unshare:(id:string)=>
        api
            .delete<{is_shared:boolean}>(`/conversations/${id}/share`)
            .then(r=>r.data),
}

export const sharedAPI={
    get:(token:string)=>
        api
            .get<{
                title:string
                created_at:string
                messages:Message[]
            }>(`/shared/${token}`)
            .then(r=>r.data),
}

// ── Streaming chat / edit / regenerate ────────────────────────────────────────
// These use raw fetch (not axios) because we need to read a text/event-stream
// body incrementally.

async function* readSSE(
    respPromise:Promise<Response>,
):AsyncGenerator<StreamEvent>{
    const resp=await respPromise

    if(!resp.ok){
        const err=await resp
            .json()
            .catch(()=>({detail:"Request failed"}))

        throw new Error(err.detail||"Request failed")
    }

    const reader=resp.body!.getReader()
    const decoder=new TextDecoder()
    let carry=""

    while(true){
        const {done,value}=await reader.read()

        if(done){
            break
        }

        carry+=decoder.decode(value,{stream:true})

        const lines=carry.split("\n")
        carry=lines.pop()??""

        for(const line of lines){
            if(!line.startsWith("data: ")){
                continue
            }

            try{
                yield JSON.parse(line.slice(6)) as StreamEvent
            }catch{
                // Ignore malformed chunk.
            }
        }
    }
}

function authHeaders(){
    const token=localStorage.getItem("token")

    return {
        "Content-Type":"application/json",
        Authorization:`Bearer ${token}`,
    }
}

export const streamAPI={
    send:(conversationId:string,message:string)=>
        readSSE(
            fetch(`${import.meta.env.VITE_API_URL}/chat/stream`,{
                method:"POST",
                headers:authHeaders(),
                body:JSON.stringify({
                    conversation_id:conversationId,
                    message,
                }),
            }),
        ),

    edit:(messageId:string,content:string)=>
        readSSE(
            fetch(`${import.meta.env.VITE_API_URL}/messages/${messageId}`,{
                method:"PUT",
                headers:authHeaders(),
                body:JSON.stringify({content}),
            }),
        ),

    regenerate:(messageId:string)=>
        readSSE(
            fetch(`${import.meta.env.VITE_API_URL}/messages/${messageId}/regenerate`,{
                method:"POST",
                headers:authHeaders(),
            }),
        ),
}