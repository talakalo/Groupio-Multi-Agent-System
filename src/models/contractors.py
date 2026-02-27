"""Compatibility shim — all contractor model definitions now live in contractor.py.

This module re-exports for backward compatibility. New code should import
directly from src.models.contractor.
"""
from src.models.contractor import (
    AgentContractor as Contractor,
    AgentContractorBase as ContractorBase,
    AgentContractorCreate as ContractorCreate,
    ContractorDocument,
    ContractorMatch,
    ContractorProfile,
    VettingResult,
)

__all__ = [
    "Contractor",
    "ContractorBase",
    "ContractorCreate",
    "ContractorDocument",
    "ContractorMatch",
    "ContractorProfile",
    "VettingResult",
]
