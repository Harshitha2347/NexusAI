import json
import re

from groq import AsyncGroq

from search import format_results_for_context, web_search

TOOLS=[
    {
        "type":"function",
        "function":{
            "name":"web_search",
            "description":(
                "Search the live web for information. Call this whenever the answer "
                "depends on anything that could have changed since your training data was "
                "collected, or that you are not fully certain is still accurate right now — "
                "this includes current events, prices, scores, schedules, recent releases, "
                "and who currently holds any position, role, or title. If there is any real "
                "chance your answer is stale, prefer calling this over guessing."
            ),
            "parameters":{
                "type":"object",
                "properties":{
                    "query":{
                        "type":"string",
                        "description":"The search query to look up.",
                    }
                },
                "required":["query"],
            },
        },
    },
    {
        "type":"function",
        "function":{
            "name":"answer_directly",
            "description":(
                "Use this when you can answer the question fully and confidently from what "
                "you already know, with no meaningful risk that the answer has changed or "
                "gone stale since your training data was collected."
            ),
            "parameters":{"type":"object","properties":{}},
        },
    },
]


async def decide_and_search(
    groq:AsyncGroq,
    model:str,
    system_prompt:str,
    history:list[dict],
):
    last_user_text=""

    for m in reversed(history):
        if m["role"]=="user":
            last_user_text=m["content"]
            break

    try:
        decision=await groq.chat.completions.create(
            model=model,
            messages=[
                {"role":"system","content":system_prompt},
                *history,
            ],
            tools=TOOLS,
            tool_choice="required",
            max_tokens=300,
            temperature=0.3,
        )

        msg=decision.choices[0].message
        tool_calls=getattr(msg,"tool_calls",None)

        if tool_calls:
            call=tool_calls[0]

            if call.function.name=="web_search":
                try:
                    args=json.loads(call.function.arguments or "{}")
                except Exception:
                    args={}

                query=args.get("query") or last_user_text

                if query:
                    results=await web_search(query)
                    if results and results[0].get("title")!="Search failed":
                        return format_results_for_context(results),True,query

    except Exception:
        pass

    return None,False,None


async def generate_title(
    groq:AsyncGroq,
    model:str,
    user_message:str,
    assistant_reply:str,
)->str|None:
    """Best-effort AI-generated 3-6 word contextual title. Returns None on failure."""
    try:
        resp=await groq.chat.completions.create(
            model=model,
            messages=[
                {
    "role": "system",
    "content": (
        "You generate concise, descriptive titles for conversations. Read the "
        "conversation below and reply with ONLY a 3-6 word title that best "
        "captures its primary topic.\n\n"
        "Requirements:\n"
        "- Output ONLY the title.\n"
        "- Do not use quotes, markdown, emojis, numbering, prefixes (such as "
        "'Title:'), or explanations.\n"
        "- Do not end the title with punctuation.\n"
        "- Make the title specific, descriptive, and informative rather than generic.\n"
        "- Base the title primarily on the user's intent. If that is unclear, "
        "use the main topic of the conversation.\n"
        "- If multiple topics are discussed, choose the most significant or "
        "most recent one.\n"
        "- When a term has multiple possible meanings, infer the most likely technology related "
        "meaning from the conversation. If there is insufficient context to "
        "disambiguate, prefer the more domain-specific interpretation.\n"
        "- Preserve important names, products, technologies, or concepts when "
        "they are central to the conversation.\n"
        "- Avoid unnecessary filler words or overly broad titles.\n"
        "- Ensure the title is natural, readable, and suitable as a chat history label."
    ),
},
                {
                    "role":"user",
                    "content":(
                        f"User: {user_message[:500]}\n\n"
                        f"Assistant: {assistant_reply[:500]}"
                    ),
                },
            ],
            max_tokens=20,
            temperature=0.4,
        )

        title=(
            (resp.choices[0].message.content or "")
            .strip()
            .strip('"')
            .strip("`")
            .strip()
        )

        title=title.splitlines()[0] if title else ""
        title=re.sub(
            r"^(title:|chat title:)\s*",
            "",
            title,
            flags=re.IGNORECASE,
        ).strip()

        return title[:60] if title else None

    except Exception:
        return None