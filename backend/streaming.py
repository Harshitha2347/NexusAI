import re
_SENTENCE_END=re.compile(
    r"((?<=[.!?])\s+(?=[A-Z0-9\"'`(\u2018\u201c])|(?<=[.!?])\n+)"
)


class SentenceBuffer:
    def __init__(self):
        self._buf=""

    def feed(self,delta:str)->list[str]:
        if not delta:
            return []

        self._buf+=delta

        if self._buf.count("```")%2==1:
            return []

        if self._buf.count("**")%2==1:
            return []

        parts=_SENTENCE_END.split(self._buf)
        if len(parts)<=1:
            return []

        chunks=[]
        i=0

        while i+1<len(parts):
            chunks.append(parts[i]+parts[i+1])
            i+=2

        self._buf=parts[i] if i<len(parts) else ""

        return [c for c in chunks if c]

    def flush_all(self)->str:
        rest,self._buf=self._buf,""
        return rest