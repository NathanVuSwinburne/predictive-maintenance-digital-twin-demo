"""V1 API router — includes all sub-routers."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import auth, chat, history, machines, simulations, users

router = APIRouter(prefix="/api/v1")

router.include_router(auth.router)
router.include_router(users.router)
router.include_router(machines.router)
router.include_router(history.router)
router.include_router(chat.router)
router.include_router(simulations.router)
