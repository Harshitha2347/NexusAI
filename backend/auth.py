import os
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import User, get_db

SECRET_KEY=os.getenv("SECRET_KEY","changeme-super-secret")
ALGORITHM="HS256"
TTL_DAYS=7

pwd_ctx=CryptContext(schemes=["bcrypt"],deprecated="auto")
bearer=HTTPBearer()


def hash_pw(pw:str)->str:
    return pwd_ctx.hash(pw)


def verify_pw(pw:str,hashed:str)->bool:
    return pwd_ctx.verify(pw,hashed)


def create_token(user_id:str)->str:
    exp=datetime.utcnow()+timedelta(days=TTL_DAYS)
    return jwt.encode({"sub":user_id,"exp":exp},SECRET_KEY,algorithm=ALGORITHM)


def get_current_user(
    creds:HTTPAuthorizationCredentials=Depends(bearer),
    db:Session=Depends(get_db),
)->User:
    try:
        payload=jwt.decode(creds.credentials,SECRET_KEY,algorithms=[ALGORITHM])
        uid:str=payload.get("sub","")
    except JWTError:
        raise HTTPException(status_code=401,detail="Invalid token")

    user=db.query(User).filter(User.id==uid).first()
    if not user:
        raise HTTPException(status_code=401,detail="User not found")

    return user