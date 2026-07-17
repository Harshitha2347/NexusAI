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
                "Search the live web. Use this when the user's question needs "
                "real-time, recent, or external information you would not reliably know "
                "(current events, prices, scores, releases, weather, facts about niche or "
                "very recent topics, etc)."
            ),
            "parameters":{
                "type":"object",
                "properties":{
                    "query":{
                        "type":"string",
                        "description":(
                            "The search query. Make it self-contained — resolve pronouns "
                            "and vague references using the conversation, and if the user's "
                            "location is known from the conversation, include it (e.g. "
                            "'weather in <city> today')."
                        ),
                    }
                },
                "required":["query"],
            },
        },
    },
    {
        "type":"function",
        "function":{
            "name":"no_search_needed",
            "description":(
                "Use this when the question does NOT need live web search — general "
                "knowledge, coding help, writing, math, or anything you can already "
                "answer confidently without current/external information."
            ),
            "parameters":{"type":"object","properties":{}},
        },
    },
]

_REALTIME_PATTERNS=re.compile(
    r"\b("
    r"today|tonight|yesterday|tomorrow|"
    r"latest|newest|current(ly)?|right now|up.?to.?date|"
    r"this (week|month|year)|"
    r"news|breaking|headline|happening|happenings|going on|"
    r"score|scores|standings|result[s]?\s+of\s+the|"
    r"weather|forecast|temperature\s+in|"
    r"stock\s+price|share\s+price|exchange\s+rate|crypto\s+price|"
    r"who (is|was|are)\s+the\s+(current|new|latest)|"
    r"release\s+date|when\s+(is|was|does|will)|"
    r"upcoming|recently|just\s+(released|announced|launched|happened)|"
    r"what'?s\s+new|"
    r"202[4-9]"
    r")\b",
    re.IGNORECASE,
)


def looks_realtime(text:str)->bool:
    return bool(_REALTIME_PATTERNS.search(text or ""))


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

    if last_user_text and looks_realtime(last_user_text):
        try:
            results=await web_search(last_user_text)
            if results and results[0].get("title")!="Search failed":
                return (
                    format_results_for_context(results),
                    True,
                    last_user_text,
                )
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
                    "role":"system",
                    "content":(
                        "You write short chat titles. Read the exchange below and reply with "
                        "ONLY a 3-6 word title capturing its specific topic — no quotes, no "
                        "trailing punctuation, no prefix like 'Title:', no generic titles like "
                        "'Chat about X' or 'Conversation'. Be concrete and specific.\n\n"
                        "If the user's message contains an ambiguous acronym or abbreviation that "
                        "has both a general/everyday meaning and a software/data-science/ML meaning "
                        "(e.g. CNN, GAN, NLP), title it using the software/data-science/ML meaning "
                        "by default — even if the assistant's reply answered using the other, more "
                        "general meaning. This only affects how you name the title, not anything else.\n\n"
                        "Example: user asks about fixing a Python KeyError -> `Fixing a Python KeyError Bug`\n"
                        "Example: user asks for pasta recipes -> `Quick Weeknight Pasta Recipes`\n"
                        "Example: user writes 'cnn' -> `Convolutional Neural Network Basics`"
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