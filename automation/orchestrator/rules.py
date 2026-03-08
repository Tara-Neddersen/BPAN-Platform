from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass(slots=True)
class RulesConfig:
    dependencies: list[tuple[int, tuple[int, ...]]]
    severity_priority: dict[str, int]
    defer_p2_when_p1_open: bool
    qa_agent_id: int
    migration_verifier_agent_id: int
    deploy_target_agent_id: int
    migration_clean_any_keywords: list[str]
    mode: str
    transport: str
    send_cmd_template: str
    approval_rules: dict[str, bool]
    retry_max_retries: int
    retry_base_delay_seconds: int
    retry_max_delay_seconds: int
    dedupe_window_seconds: int
    high_risk_keywords: list[str]
    qa_retest_followup_keywords: list[str]


DEFAULT_RULES: dict[str, Any] = {
    "dependencies": {
        "2": [1],
        "5": [1],
        "3": [2],
        "4": [2],
        "6": [1, 5],
        "7": [6],
        "8": [1],
        "9": [1],
    },
    "severity": {
        "priority": {
            "P1": 1,
            "P2": 2,
            "P3": 3,
            "NONE": 4,
        },
        "defer_p2_when_p1_open": True,
    },
    "deploy_gate": {
        "qa_agent_id": 10,
        "migration_verifier_agent_id": 8,
        "deploy_target_agent_id": 12,
        "migration_clean_any_keywords": [
            "latest migration pass",
            "applied cleanly",
            "without sql apply errors",
            "remote database is up to date",
            "migration parity",
        ],
    },
    "mode": "manual",
    "transport": "manual",
    "send_cmd_template": "",
    "approval_rules": {
        "deployment_prompts": True,
        "destructive_keywords": True,
        "cross_scope_reassignment": True,
    },
    "retry_policy": {
        "max_retries": 3,
        "base_delay_seconds": 10,
        "max_delay_seconds": 300,
    },
    "dedupe_window_seconds": 1800,
    "high_risk_keywords": ["delete", "drop", "reset", "truncate"],
    "qa_retest_followup_keywords": [
        "retest",
        "re-test",
        "fix attempt",
        "after fix",
        "post-fix",
        "verified",
    ],
}


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merged[key] = _deep_merge(base[key], value)
        else:
            merged[key] = value
    return merged


def load_rules(rules_file: Path) -> RulesConfig:
    data = dict(DEFAULT_RULES)
    if rules_file.exists():
        parsed = yaml.safe_load(rules_file.read_text(encoding="utf-8"))
        if isinstance(parsed, dict):
            data = _deep_merge(DEFAULT_RULES, parsed)

    dep_map = data.get("dependencies", {})
    dependencies: list[tuple[int, tuple[int, ...]]] = []
    if isinstance(dep_map, dict):
        for target, deps in dep_map.items():
            try:
                target_id = int(target)
            except Exception:
                continue
            dep_ids = tuple(int(d) for d in deps)
            dependencies.append((target_id, dep_ids))
    dependencies.sort(key=lambda item: item[0])

    severity_cfg = data.get("severity", {}) if isinstance(data.get("severity"), dict) else {}
    priority_map_raw = severity_cfg.get("priority", {}) if isinstance(severity_cfg.get("priority"), dict) else {}
    severity_priority = {
        str(key).upper(): int(value)
        for key, value in priority_map_raw.items()
        if str(value).isdigit()
    }
    if "NONE" not in severity_priority:
        severity_priority["NONE"] = 4

    deploy_cfg = data.get("deploy_gate", {}) if isinstance(data.get("deploy_gate"), dict) else {}
    approval_cfg = data.get("approval_rules", {}) if isinstance(data.get("approval_rules"), dict) else {}
    retry_cfg = data.get("retry_policy", {}) if isinstance(data.get("retry_policy"), dict) else {}

    mode = str(data.get("mode", "manual")).strip().lower()
    if mode not in {"manual", "auto"}:
        mode = "manual"

    transport = str(data.get("transport", "manual")).strip().lower()
    if transport not in {"manual", "command"}:
        transport = "manual"

    return RulesConfig(
        dependencies=dependencies,
        severity_priority=severity_priority,
        defer_p2_when_p1_open=bool(severity_cfg.get("defer_p2_when_p1_open", True)),
        qa_agent_id=int(deploy_cfg.get("qa_agent_id", 10)),
        migration_verifier_agent_id=int(deploy_cfg.get("migration_verifier_agent_id", 8)),
        deploy_target_agent_id=int(deploy_cfg.get("deploy_target_agent_id", 12)),
        migration_clean_any_keywords=[
            str(item).lower().strip() for item in deploy_cfg.get("migration_clean_any_keywords", [])
        ],
        mode=mode,
        transport=transport,
        send_cmd_template=str(data.get("send_cmd_template", "")),
        approval_rules={
            "deployment_prompts": bool(approval_cfg.get("deployment_prompts", True)),
            "destructive_keywords": bool(approval_cfg.get("destructive_keywords", True)),
            "cross_scope_reassignment": bool(approval_cfg.get("cross_scope_reassignment", True)),
        },
        retry_max_retries=int(retry_cfg.get("max_retries", 3)),
        retry_base_delay_seconds=int(retry_cfg.get("base_delay_seconds", 10)),
        retry_max_delay_seconds=int(retry_cfg.get("max_delay_seconds", 300)),
        dedupe_window_seconds=int(data.get("dedupe_window_seconds", 1800)),
        high_risk_keywords=[str(item).lower().strip() for item in data.get("high_risk_keywords", [])],
        qa_retest_followup_keywords=[
            str(item).lower().strip()
            for item in data.get("qa_retest_followup_keywords", [])
            if str(item).strip()
        ],
    )
