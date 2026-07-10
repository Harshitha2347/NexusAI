import os
import secrets
import uuid
from datetime import datetime

from dotenv import load_dotenv
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, relationship, sessionmaker

load_dotenv()

engine=create_engine(os.getenv("DATABASE_URL",""),pool_pre_ping=True)
SessionLocal=sessionmaker(autocommit=False,autoflush=False,bind=engine)
Base=declarative_base()


class User(Base):
    __tablename__="users"

    id=Column(String,primary_key=True,default=lambda:str(uuid.uuid4()))
    email=Column(String,unique=True,index=True,nullable=False)
    name=Column(String,nullable=False)
    hashed_pw=Column(String,nullable=False)
    created_at=Column(DateTime,default=datetime.utcnow)

    convos=relationship(
        "Conversation",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Conversation(Base):
    __tablename__="conversations"

    id=Column(String,primary_key=True,default=lambda:str(uuid.uuid4()))
    user_id=Column(String,ForeignKey("users.id"),nullable=False)
    title=Column(String,default="New Chat")
    title_is_final=Column(Boolean,default=False)
    active_leaf_id=Column(
        String,
        ForeignKey("messages.id",use_alter=True),
        nullable=True,
    )
    share_token=Column(String,unique=True,index=True,nullable=True)
    is_shared=Column(Boolean,default=False)
    created_at=Column(DateTime,default=datetime.utcnow)
    updated_at=Column(DateTime,default=datetime.utcnow,onupdate=datetime.utcnow)

    user=relationship("User",back_populates="convos")
    messages=relationship(
        "Message",
        back_populates="convo",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
        foreign_keys="Message.convo_id",
    )


class Message(Base):
    __tablename__="messages"

    id=Column(String,primary_key=True,default=lambda:str(uuid.uuid4()))
    convo_id=Column(String,ForeignKey("conversations.id"),nullable=False)
    parent_id=Column(String,ForeignKey("messages.id"),nullable=True)
    role=Column(String,nullable=False)
    content=Column(Text,nullable=False)
    used_search=Column(Boolean,default=False)
    created_at=Column(DateTime,default=datetime.utcnow)

    convo=relationship(
        "Conversation",
        back_populates="messages",
        foreign_keys=[convo_id],
    )


def get_db():
    db=SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    _auto_migrate()


def _auto_migrate():
    from sqlalchemy import inspect, text

    inspector=inspect(engine)
    existing_tables=set(inspector.get_table_names())

    if "conversations" not in existing_tables or "messages" not in existing_tables:
        return

    convo_cols={c["name"] for c in inspector.get_columns("conversations")}
    message_cols={c["name"] for c in inspector.get_columns("messages")}

    statements=[]

    if "title_is_final" not in convo_cols:
        statements.append(
            "ALTER TABLE conversations ADD COLUMN title_is_final BOOLEAN DEFAULT FALSE"
        )
    if "active_leaf_id" not in convo_cols:
        statements.append(
            "ALTER TABLE conversations ADD COLUMN active_leaf_id VARCHAR"
        )
    if "share_token" not in convo_cols:
        statements.append(
            "ALTER TABLE conversations ADD COLUMN share_token VARCHAR"
        )
    if "is_shared" not in convo_cols:
        statements.append(
            "ALTER TABLE conversations ADD COLUMN is_shared BOOLEAN DEFAULT FALSE"
        )
    if "parent_id" not in message_cols:
        statements.append(
            "ALTER TABLE messages ADD COLUMN parent_id VARCHAR"
        )
    if "used_search" not in message_cols:
        statements.append(
            "ALTER TABLE messages ADD COLUMN used_search BOOLEAN DEFAULT FALSE"
        )

    if not statements:
        return

    with engine.begin() as conn:
        for stmt in statements:
            conn.execute(text(stmt))

    with engine.begin() as conn:
        convo_ids=[
            r[0]
            for r in conn.execute(
                text(
                    "SELECT id FROM conversations WHERE active_leaf_id IS NULL"
                )
            )
        ]

        for cid in convo_ids:
            rows=conn.execute(
                text(
                    "SELECT id FROM messages WHERE convo_id=:cid ORDER BY created_at ASC"
                ),
                {"cid":cid},
            ).fetchall()

            prev_id=None
            for (mid,) in rows:
                if prev_id is not None:
                    conn.execute(
                        text("UPDATE messages SET parent_id=:p WHERE id=:m"),
                        {"p":prev_id,"m":mid},
                    )
                prev_id=mid

            if prev_id is not None:
                conn.execute(
                    text(
                        "UPDATE conversations SET active_leaf_id=:leaf WHERE id=:cid"
                    ),
                    {"leaf":prev_id,"cid":cid},
                )


def get_active_path(convo:Conversation,db:Session):
    if not convo.active_leaf_id:
        return []

    path=[]
    node=db.query(Message).filter(Message.id==convo.active_leaf_id).first()
    seen=set()

    while node and node.id not in seen:
        seen.add(node.id)
        path.append(node)
        node=(
            db.query(Message).filter(Message.id==node.parent_id).first()
            if node.parent_id
            else None
        )

    path.reverse()
    return path


def get_siblings(msg:Message,db:Session):
    return (
        db.query(Message)
        .filter(
            Message.convo_id==msg.convo_id,
            Message.parent_id==msg.parent_id,
        )
        .order_by(Message.created_at.asc())
        .all()
    )


def deepest_leaf(msg:Message,db:Session):
    node=msg
    seen=set()

    while node.id not in seen:
        seen.add(node.id)

        child=(
            db.query(Message)
            .filter(Message.parent_id==node.id)
            .order_by(Message.created_at.desc())
            .first()
        )

        if not child:
            break

        node=child

    return node


def branch_info(msg:Message,db:Session):
    siblings=get_siblings(msg,db)
    ids=[s.id for s in siblings]

    try:
        idx=ids.index(msg.id)+1
    except ValueError:
        idx=1

    return idx,max(len(siblings),1)


def new_share_token()->str:
    return secrets.token_urlsafe(16)