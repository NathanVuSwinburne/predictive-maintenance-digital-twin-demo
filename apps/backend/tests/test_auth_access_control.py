from __future__ import annotations

import pyotp


def _login(
    client, email: str, password: str, method: str = "totp", code: str = "123456"
) -> str:
    login_response = client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert login_response.status_code == 200

    login_result = login_response.json()
    if not login_result["requiresMfa"]:
        return login_result["session"]["token"]

    mfa_token = login_result["mfaToken"]
    verify_response = client.post(
        "/api/v1/auth/mfa/verify",
        json={"mfaToken": mfa_token, "method": method, "code": code},
    )
    assert verify_response.status_code == 200
    return verify_response.json()["token"]


def _auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_auth_session_and_me(client) -> None:
    token = _login(client, "test1@test.com", "password1")

    session_response = client.get("/api/v1/auth/session", params={"token": token})
    assert session_response.status_code == 200
    assert session_response.json()["activePersonaId"] == "persona-001"

    me_response = client.get("/api/v1/auth/me", headers=_auth_header(token))
    assert me_response.status_code == 200
    assert me_response.json() == {
        "id": "user-001",
        "name": "Alex Chen",
        "email": "test1@test.com",
        "role": "admin",
        "shift": "Day",
        "plant": "Plant 1",
    }


def test_login_returns_session_without_mfa_for_users_without_totp(client) -> None:
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "test2@test.com", "password": "password2"},
    )

    assert login_response.status_code == 200
    login_result = login_response.json()
    assert login_result["requiresMfa"] is False
    assert login_result["session"]["userId"] == "user-002"
    assert login_result["mfaToken"] is None
    assert login_result["availableMethods"] == []


def test_login_requires_mfa_for_users_with_totp(client) -> None:
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "test1@test.com", "password": "password1"},
    )

    assert login_response.status_code == 200
    login_result = login_response.json()
    assert login_result["requiresMfa"] is True
    assert login_result["session"] is None
    assert login_result["mfaToken"]
    assert login_result["availableMethods"] == ["totp", "backup-code"]


def test_totp_setup_confirm_backup_regenerate_and_disable(client) -> None:
    token = _login(client, "test2@test.com", "password2")

    initial_status_response = client.get(
        "/api/v1/auth/totp", headers=_auth_header(token)
    )
    assert initial_status_response.status_code == 200
    assert initial_status_response.json() == {
        "enabled": False,
        "backupCodeCount": 0,
        "unusedBackupCodeCount": 0,
    }

    invalid_setup_response = client.post(
        "/api/v1/auth/totp/setup",
        headers=_auth_header(token),
        json={"password": "wrong"},
    )
    assert invalid_setup_response.status_code == 401

    setup_response = client.post(
        "/api/v1/auth/totp/setup",
        headers=_auth_header(token),
        json={"password": "password2"},
    )
    assert setup_response.status_code == 200
    setup = setup_response.json()
    assert setup["setupToken"]
    assert setup["secret"]
    assert setup["otpauthUri"].startswith("otpauth://totp/")

    confirm_response = client.post(
        "/api/v1/auth/totp/confirm",
        headers=_auth_header(token),
        json={
            "setupToken": setup["setupToken"],
            "code": pyotp.TOTP(setup["secret"]).now(),
        },
    )
    assert confirm_response.status_code == 200
    backup_codes = confirm_response.json()["backupCodes"]
    assert len(backup_codes) == 10
    assert confirm_response.json()["unusedBackupCodeCount"] == 10

    backup_login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "test2@test.com", "password": "password2"},
    )
    assert backup_login_response.status_code == 200
    assert backup_login_response.json()["requiresMfa"] is True

    verify_backup_response = client.post(
        "/api/v1/auth/mfa/verify",
        json={
            "mfaToken": backup_login_response.json()["mfaToken"],
            "method": "backup-code",
            "code": backup_codes[0],
        },
    )
    assert verify_backup_response.status_code == 200

    consumed_status_response = client.get(
        "/api/v1/auth/totp", headers=_auth_header(token)
    )
    assert consumed_status_response.status_code == 200
    assert consumed_status_response.json()["unusedBackupCodeCount"] == 9

    regenerate_response = client.post(
        "/api/v1/auth/totp/backup-codes/regenerate",
        headers=_auth_header(token),
        json={"password": "password2"},
    )
    assert regenerate_response.status_code == 200
    regenerated_codes = regenerate_response.json()["backupCodes"]
    assert len(regenerated_codes) == 10
    assert backup_codes[0] not in regenerated_codes

    old_backup_login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "test2@test.com", "password": "password2"},
    )
    old_backup_verify_response = client.post(
        "/api/v1/auth/mfa/verify",
        json={
            "mfaToken": old_backup_login_response.json()["mfaToken"],
            "method": "backup-code",
            "code": backup_codes[1],
        },
    )
    assert old_backup_verify_response.status_code == 401

    disable_response = client.post(
        "/api/v1/auth/totp/disable",
        headers=_auth_header(token),
        json={"password": "password2"},
    )
    assert disable_response.status_code == 200
    assert disable_response.json() == {
        "enabled": False,
        "backupCodeCount": 0,
        "unusedBackupCodeCount": 0,
    }

    password_only_response = client.post(
        "/api/v1/auth/login",
        json={"email": "test2@test.com", "password": "password2"},
    )
    assert password_only_response.status_code == 200
    assert password_only_response.json()["requiresMfa"] is False


def test_users_endpoint_scopes_admin_and_standard_user(client) -> None:
    admin_token = _login(client, "test1@test.com", "password1")
    user_token = _login(client, "test2@test.com", "password2")

    admin_response = client.get("/api/v1/users", headers=_auth_header(admin_token))
    assert admin_response.status_code == 200
    assert [user["id"] for user in admin_response.json()] == [
        "user-001",
        "user-002",
        "user-003",
    ]

    user_response = client.get("/api/v1/users", headers=_auth_header(user_token))
    assert user_response.status_code == 200
    assert [user["id"] for user in user_response.json()] == ["user-002"]


def test_machine_access_can_be_read_by_self_or_admin_only(client) -> None:
    admin_token = _login(client, "test1@test.com", "password1")
    user_token = _login(client, "test2@test.com", "password2")
    other_user_token = _login(client, "test3@test.com", "password3")

    self_response = client.get(
        "/api/v1/users/user-002/machine-access",
        headers=_auth_header(user_token),
    )
    assert self_response.status_code == 200
    assert self_response.json()["machineIds"] == ["machine-b", "machine-c"]

    admin_response = client.get(
        "/api/v1/users/user-002/machine-access",
        headers=_auth_header(admin_token),
    )
    assert admin_response.status_code == 200
    assert admin_response.json() == self_response.json()

    forbidden_response = client.get(
        "/api/v1/users/user-002/machine-access",
        headers=_auth_header(other_user_token),
    )
    assert forbidden_response.status_code == 403


def test_admin_can_update_machine_access_and_role(client) -> None:
    admin_token = _login(client, "test1@test.com", "password1")

    update_access_response = client.put(
        "/api/v1/users/user-002/machine-access",
        headers=_auth_header(admin_token),
        json={"machineIds": ["machine-a", "machine-b", "machine-c", "machine-d"]},
    )
    assert update_access_response.status_code == 200
    assert update_access_response.json()["machineIds"] == [
        "machine-a",
        "machine-b",
        "machine-c",
    ]

    update_role_response = client.patch(
        "/api/v1/users/user-003/role",
        headers=_auth_header(admin_token),
        json={"role": "admin"},
    )
    assert update_role_response.status_code == 200
    assert update_role_response.json()["role"] == "admin"

    authorized_users_response = client.get(
        "/api/v1/machines/machine-c/users",
        headers=_auth_header(admin_token),
    )
    assert authorized_users_response.status_code == 200
    assert [user["id"] for user in authorized_users_response.json()] == [
        "user-002",
        "user-003",
    ]


def test_last_admin_cannot_be_demoted(client) -> None:
    admin_token = _login(client, "test1@test.com", "password1")

    response = client.patch(
        "/api/v1/users/user-001/role",
        headers=_auth_header(admin_token),
        json={"role": "user"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "At least one admin must remain in the system."


def test_machine_visibility_and_access_are_enforced(client) -> None:
    admin_token = _login(client, "test1@test.com", "password1")
    user_token = _login(client, "test2@test.com", "password2")
    limited_access_token = _login(client, "test3@test.com", "password3")

    admin_machine_response = client.get(
        "/api/v1/machines", headers=_auth_header(admin_token)
    )
    assert admin_machine_response.status_code == 200
    assert len(admin_machine_response.json()) == 3

    user_machine_response = client.get(
        "/api/v1/machines", headers=_auth_header(user_token)
    )
    assert user_machine_response.status_code == 200
    assert [machine["id"] for machine in user_machine_response.json()] == [
        "machine-b",
        "machine-c",
    ]

    limited_access_response = client.get(
        "/api/v1/machines", headers=_auth_header(limited_access_token)
    )
    assert limited_access_response.status_code == 200
    assert [machine["id"] for machine in limited_access_response.json()] == [
        "machine-c"
    ]

    forbidden_detail_response = client.get(
        "/api/v1/machines/machine-a",
        headers=_auth_header(user_token),
    )
    assert forbidden_detail_response.status_code == 403

    forbidden_metric_response = client.get(
        "/api/v1/machines/machine-a/recommendations",
        headers=_auth_header(limited_access_token),
    )
    assert forbidden_metric_response.status_code == 403


def test_history_is_clamped_for_standard_users(client) -> None:
    from app.db.database import SessionLocal
    from app.db.models import DBHistoryEvent

    admin_token = _login(client, "test1@test.com", "password1")
    user_token = _login(client, "test2@test.com", "password2")

    with SessionLocal() as db:
        db.add(
            DBHistoryEvent(
                id="history-nested-metadata",
                timestamp="2026-05-07T10:00:00Z",
                type="simulation-run",
                machine_id="machine-c",
                user_id="user-001",
                title="Simulation with rich metadata",
                description="Stores structured simulation details in history metadata.",
                severity="medium",
                event_metadata={
                    "generated_readings": [
                        {
                            "timestamp": "2026-05-07T10:01:00Z",
                            "values": {"temperature": 66.2, "vibrationX": 0.42},
                            "synthetic": True,
                        }
                    ],
                    "source_window": {
                        "start": "2026-05-07T09:40:00Z",
                        "end": "2026-05-07T10:00:00Z",
                        "points": 240,
                    },
                    "sensor_fields": ["temperature", "vibrationX"],
                },
            )
        )
        db.commit()

    admin_response = client.get(
        "/api/v1/history",
        headers=_auth_header(admin_token),
        params={"user_id": "user-001"},
    )
    assert admin_response.status_code == 200
    assert {event["userId"] for event in admin_response.json()} == {"user-001"}
    nested_event = next(
        event
        for event in admin_response.json()
        if event["id"] == "history-nested-metadata"
    )
    assert (
        nested_event["metadata"]["generated_readings"][0]["values"]["temperature"]
        == 66.2
    )
    assert nested_event["metadata"]["source_window"]["points"] == 240
    assert nested_event["metadata"]["sensor_fields"] == ["temperature", "vibrationX"]

    user_response = client.get(
        "/api/v1/history",
        headers=_auth_header(user_token),
        params={"user_id": "user-001"},
    )
    assert user_response.status_code == 200
    assert {event["userId"] for event in user_response.json()} == {"user-002"}
    assert {event["machineId"] for event in user_response.json()} <= {
        "machine-a",
        "machine-b",
        "machine-c",
    }


def test_simulation_run_uses_authenticated_user_and_checks_machine_access(
    client, monkeypatch
) -> None:
    user_token = _login(client, "test2@test.com", "password2")
    admin_token = _login(client, "test1@test.com", "password1")
    no_access_token = _login(client, "test3@test.com", "password3")
    expected_chart_groups = [
        {
            "id": "vibration",
            "label": "Vibration",
            "unit": "g",
            "fields": ["vibrationX", "vibrationY", "vibrationZ"],
        },
        {
            "id": "temperature",
            "label": "Temperature",
            "unit": "°C",
            "fields": ["temperature"],
        },
    ]

    def fake_get_simulation_config(machine_id, db):
        return {
            "machineId": machine_id,
            "machineType": "real-sensor",
            "title": "Machine C Session Simulation",
            "description": "Fake simulation config.",
            "contextWindowMinutes": 20,
            "contextWindowRows": 240,
            "forecastChunkMinutes": 10,
            "sampleIntervalMs": 500,
            "warnings": [],
            "sessions": [
                {
                    "sessionId": 68,
                    "start": "2026-05-07T00:00:00+00:00",
                    "end": "2026-05-07T01:00:00+00:00",
                    "totalRows": 240,
                    "realRows": 240,
                    "syntheticRows": 0,
                    "durationMinutes": 20,
                    "usesSyntheticContinuation": False,
                    "label": "medium",
                }
            ],
            "sensorChartGroups": expected_chart_groups,
        }

    def fake_run_session_simulation(body, db):
        if body.sessionId != 68:
            raise ValueError("Machine C session was not found.")

        return {
            "projected_risk": 42.5,
            "projected_downtime_hours": 1.25,
            "projected_label": "medium",
            "failure_probability": 0.425,
            "summary": "Fake Machine C simulation completed.",
            "recommendations": ["Inspect vibration trend."],
            "selected_session_id": body.sessionId,
            "synthetic_continuation_used": False,
            "generated_readings": [
                {
                    "timestamp": "2026-05-07T01:00:00+00:00",
                    "values": {
                        "temperature": 67.1,
                        "vibrationX": 0.12,
                        "vibrationY": 0.13,
                        "vibrationZ": 0.14,
                    },
                }
            ],
            "source_readings": [
                {
                    "timestamp": "2026-05-07T00:59:30+00:00",
                    "values": {
                        "temperature": 66.9,
                        "vibrationX": 0.11,
                        "vibrationY": 0.12,
                        "vibrationZ": 0.13,
                    },
                    "synthetic": False,
                }
            ],
            "source_window": {
                "start": "2026-05-07T00:40:00+00:00",
                "end": "2026-05-07T01:00:00+00:00",
                "points": 240,
                "sessionId": body.sessionId,
                "realPoints": 240,
                "syntheticPoints": 0,
            },
            "sensor_fields": [
                "temperature",
                "vibrationX",
                "vibrationY",
                "vibrationZ",
            ],
            "sensor_chart_groups": expected_chart_groups,
            "simulation_horizon_minutes": body.simulationHorizonMinutes,
            "simulation_status": "completed",
            "simulation_message": "The simulation context came entirely from observed Machine C telemetry.",
            "classification_windows": [
                {
                    "windowStart": "2026-05-07T01:00:00+00:00",
                    "windowEnd": "2026-05-07T01:10:00+00:00",
                    "predictedLabel": "medium",
                    "failureProbability": 0.425,
                    "confidence": 0.81,
                    "probabilities": {
                        "low": 0.25,
                        "medium": 0.55,
                        "high": 0.2,
                    },
                }
            ],
        }

    monkeypatch.setattr(
        "app.api.v1.simulations.run_session_simulation",
        fake_run_session_simulation,
    )
    monkeypatch.setattr(
        "app.api.v1.simulations.get_simulation_config",
        fake_get_simulation_config,
    )

    config_response = client.get(
        "/api/v1/simulations/config/machine-c",
        headers=_auth_header(user_token),
    )
    assert config_response.status_code == 200
    assert config_response.json()["sensorChartGroups"] == expected_chart_groups

    unsupported_response = client.post(
        "/api/v1/simulations/run",
        headers=_auth_header(user_token),
        json={
            "machineId": "machine-b",
            "scenarioName": "Unsupported run",
            "sessionId": 68,
        },
    )
    assert unsupported_response.status_code == 400
    assert (
        unsupported_response.json()["detail"]
        == "Simulation is currently available for Machine C only."
    )

    machine_c_response = client.post(
        "/api/v1/simulations/run",
        headers=_auth_header(user_token),
        json={
            "machineId": "machine-c",
            "scenarioName": "Vibration future run",
            "sessionId": 68,
            "simulationHorizonMinutes": 15,
        },
    )
    assert machine_c_response.status_code == 200
    machine_c_payload = machine_c_response.json()
    assert machine_c_payload["simulationStatus"] == "completed"
    assert machine_c_payload["simulationHorizonMinutes"] == 15
    assert machine_c_payload["sensorChartGroups"] == expected_chart_groups
    assert set(machine_c_payload["sensorFields"]) == {
        "temperature",
        "vibrationX",
        "vibrationY",
        "vibrationZ",
    }
    assert all(
        set(reading["values"])
        == {
            "temperature",
            "vibrationX",
            "vibrationY",
            "vibrationZ",
        }
        for reading in machine_c_payload["generatedReadings"]
    )

    listed_runs_response = client.get(
        "/api/v1/simulations",
        headers=_auth_header(user_token),
        params={"user_id": "user-002"},
    )
    assert listed_runs_response.status_code == 200
    listed_run = next(
        run
        for run in listed_runs_response.json()
        if run["id"] == machine_c_payload["id"]
    )
    assert listed_run["simulationStatus"] == "completed"
    assert listed_run["simulationHorizonMinutes"] == 15
    assert listed_run["sensorChartGroups"] == expected_chart_groups
    assert listed_run["sourceWindow"]["sessionId"] == 68
    assert listed_run["generatedReadings"][0]["values"].keys() == (
        machine_c_payload["generatedReadings"][0]["values"].keys()
    )
    assert listed_run["classificationWindows"]

    invalid_session_response = client.post(
        "/api/v1/simulations/run",
        headers=_auth_header(user_token),
        json={
            "machineId": "machine-c",
            "scenarioName": "Missing session run",
            "sessionId": 999999,
            "simulationHorizonMinutes": 15,
        },
    )
    assert invalid_session_response.status_code == 422

    machine_a_forbidden_for_sim = client.post(
        "/api/v1/simulations/run",
        headers=_auth_header(admin_token),
        json={
            "machineId": "machine-a",
            "scenarioName": "Admin machine-a run",
            "sessionId": 68,
        },
    )
    assert machine_a_forbidden_for_sim.status_code == 400

    forbidden_response = client.post(
        "/api/v1/simulations/run",
        headers=_auth_header(no_access_token),
        json={
            "machineId": "machine-a",
            "scenarioName": "Forbidden run",
            "sessionId": 68,
        },
    )
    assert forbidden_response.status_code == 403


def test_manual_prediction_endpoints_are_scoped_by_machine_type(client) -> None:
    admin_token = _login(client, "test1@test.com", "password1")
    user_token = _login(client, "test2@test.com", "password2")

    machine_a_config = client.get(
        "/api/v1/machines/machine-a/prediction-config",
        headers=_auth_header(admin_token),
    )
    assert machine_a_config.status_code == 200
    config_payload = machine_a_config.json()
    assert config_payload["machineType"] == "ai4i"
    assert any(field["key"] == "toolWear" for field in config_payload["fields"])
    assert any(field["key"] == "productType" for field in config_payload["fields"])

    machine_a_prediction = client.post(
        "/api/v1/machines/machine-a/predict",
        headers=_auth_header(admin_token),
        json={
            "values": {
                "airTempK": 300.0,
                "processTempK": 310.0,
                "rotationalSpeed": 1500.0,
                "torque": 40.0,
                "toolWear": 120.0,
                "productType": "M",
            }
        },
    )
    assert machine_a_prediction.status_code == 200
    machine_a_payload = machine_a_prediction.json()
    assert machine_a_payload["machineType"] == "ai4i"
    assert 0.0 <= machine_a_payload["failureProbability"] <= 1.0
    assert machine_a_payload["predictedLabel"] in {"Low Risk", "Failure Risk"}

    machine_c_prediction = client.post(
        "/api/v1/machines/machine-c/predict",
        headers=_auth_header(user_token),
        json={
            "values": {
                "vibrationX": 0.25,
                "vibrationY": 0.30,
                "vibrationZ": 0.28,
                "temperature": 33.5,
            }
        },
    )
    assert machine_c_prediction.status_code == 200
    machine_c_payload = machine_c_prediction.json()
    assert machine_c_payload["machineType"] == "real-sensor"
    assert machine_c_payload["predictedLabel"] in {"low", "medium", "high"}
    assert 0.0 <= machine_c_payload["confidence"] <= 1.0

    machine_b_config = client.get(
        "/api/v1/machines/machine-b/prediction-config",
        headers=_auth_header(user_token),
    )
    assert machine_b_config.status_code == 400


def test_chat_threads_are_scoped_to_the_authenticated_owner(client) -> None:
    admin_token = _login(client, "test1@test.com", "password1")
    user_token = _login(client, "test2@test.com", "password2")

    create_response = client.post(
        "/api/v1/chat/threads",
        headers=_auth_header(admin_token),
        json={"user_id": "user-002", "title": "Owner scoped thread"},
    )
    assert create_response.status_code == 200
    thread = create_response.json()
    assert thread["userId"] == "user-001"

    user_threads_response = client.get(
        "/api/v1/chat/threads",
        headers=_auth_header(user_token),
        params={"user_id": "user-001"},
    )
    assert user_threads_response.status_code == 200
    assert thread["id"] not in {item["id"] for item in user_threads_response.json()}

    forbidden_response = client.get(
        f"/api/v1/chat/threads/{thread['id']}",
        headers=_auth_header(user_token),
    )
    assert forbidden_response.status_code == 403


def test_protected_routes_require_authorization(client) -> None:
    response = client.get("/api/v1/machines")
    assert response.status_code == 401
