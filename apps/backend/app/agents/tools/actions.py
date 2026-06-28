"""Human-in-the-loop actions — proposal store for maintenance recommendations."""
from __future__ import annotations

import uuid
from typing import Optional

_pending_proposals: dict[str, dict] = {}


def propose_recommendation(
    machine_id: str,
    action: str,
    priority: str,
    eta_minutes: Optional[int] = None,
) -> dict:
    """Draft a maintenance recommendation for human approval.

    Does NOT write to the database. Returns a proposal object for the user to confirm or reject.
    A separate API endpoint handles confirmation and DB write.
    """
    proposal_id = str(uuid.uuid4())
    proposal = {
        "proposal_id": proposal_id,
        "machine_id": machine_id,
        "action": action,
        "priority": priority,
        "eta_minutes": eta_minutes,
        "status": "pending",
    }
    _pending_proposals[proposal_id] = proposal
    return proposal


def get_proposal(proposal_id: str) -> dict | None:
    return _pending_proposals.get(proposal_id)


def confirm_proposal(proposal_id: str) -> dict | None:
    proposal = _pending_proposals.pop(proposal_id, None)
    if proposal:
        proposal["status"] = "confirmed"
    return proposal


def reject_proposal(proposal_id: str) -> bool:
    return _pending_proposals.pop(proposal_id, None) is not None
