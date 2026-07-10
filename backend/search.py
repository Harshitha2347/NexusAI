import os

import httpx
from bs4 import BeautifulSoup

TAVILY_API_KEY=os.getenv("TAVILY_API_KEY","").strip()

_BROWSER_HEADERS={
    "User-Agent":(
        "Mozilla/5.0 (Windows NT 10.0; Win64; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language":"en-US,en;q=0.9",
    "Referer":"https://duckduckgo.com/",
}


async def web_search(query:str,max_results:int=6)->list[dict]:
    query=(query or "").strip()
    if not query:
        return []

    try:
        if TAVILY_API_KEY:
            return await _search_tavily(query,max_results)
    except Exception:
        pass

    try:
        results=await _search_duckduckgo_html(query,max_results)
        if results:
            return results
    except Exception:
        pass

    try:
        results=await _search_duckduckgo_lite(query,max_results)
        if results:
            return results
    except Exception:
        pass

    return [{
        "title":"Search failed",
        "url":"",
        "snippet":"All search providers were unreachable or blocked this request.",
    }]


async def _search_tavily(query:str,max_results:int)->list[dict]:
    async with httpx.AsyncClient(timeout=10) as client:
        resp=await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key":TAVILY_API_KEY,
                "query":query,
                "max_results":max_results,
                "search_depth":"basic",
                "include_answer":False,
            },
        )
        resp.raise_for_status()
        data=resp.json()

    results=[]
    for r in data.get("results",[])[:max_results]:
        results.append({
            "title":r.get("title",""),
            "url":r.get("url",""),
            "snippet":(r.get("content","") or "")[:600],
            "published":r.get("published_date","") or "",
        })

    return results


async def _search_duckduckgo_html(query:str,max_results:int)->list[dict]:
    async with httpx.AsyncClient(
        timeout=12,
        headers=_BROWSER_HEADERS,
        follow_redirects=True,
    ) as client:
        resp=await client.post(
            "https://html.duckduckgo.com/html/",
            data={"q":query,"kl":"us-en"},
        )
        resp.raise_for_status()
        html=resp.text

    soup=BeautifulSoup(html,"html.parser")
    results=[]

    for result in soup.select(".result")[:max_results]:
        title_el=result.select_one(".result__a")
        snippet_el=result.select_one(".result__snippet")

        if not title_el:
            continue

        results.append({
            "title":title_el.get_text(strip=True),
            "url":title_el.get("href",""),
            "snippet":snippet_el.get_text(strip=True) if snippet_el else "",
            "published":"",
        })

    return results


async def _search_duckduckgo_lite(query:str,max_results:int)->list[dict]:
    async with httpx.AsyncClient(
        timeout=12,
        headers=_BROWSER_HEADERS,
        follow_redirects=True,
    ) as client:
        resp=await client.post(
            "https://lite.duckduckgo.com/lite/",
            data={"q":query,"kl":"us-en"},
        )
        resp.raise_for_status()
        html=resp.text

    soup=BeautifulSoup(html,"html.parser")
    results=[]

    for a in soup.select("a.result-link")[:max_results]:
        title=a.get_text(strip=True)
        url=a.get("href","")
        snippet_el=a.find_parent("tr")
        snippet=""

        if snippet_el:
            next_row=snippet_el.find_next_sibling("tr")
            if next_row:
                snippet_td=next_row.select_one(".result-snippet")
                if snippet_td:
                    snippet=snippet_td.get_text(strip=True)

        if title:
            results.append({
                "title":title,
                "url":url,
                "snippet":snippet,
                "published":"",
            })

    return results


def format_results_for_context(results:list[dict])->str:
    if not results:
        return "No relevant results were found."

    lines=[]

    for i,r in enumerate(results,1):
        date=f" ({r['published']})" if r.get("published") else ""
        lines.append(
            f"[{i}] {r['title']}{date}\n"
            f"{r['url']}\n"
            f"{r['snippet']}"
        )

    return "\n\n".join(lines)