---
wiki: sql-agent
type: reference
updated: 2026-06-01
---

# Machine Routing

## Which table for which machine

| Machine reference | machine_id (DB) | machine_type | Telemetry table | Order column |
|---|---|---|---|---|
| Machine A, AI4I, machine-a | `machine-a` | `ai4i` | `machine_a_telemetry` | `udi ASC/DESC` |
| Machine B, sensor, machine-b | `machine-b` | `synthetic` | `machine_b_telemetry` | `timestamp ASC/DESC` |
| Machine C, vibration, real sensor, machine-c | `machine-c` | `real-sensor` | `machine_c_telemetry` | `time_collected ASC/DESC` |

## Column routing — unique per table

These columns exist ONLY in their specific table. If a question mentions any of them, route to that table:

**Only in `machine_a_telemetry`:** `udi`, `product_id`, `product_type`, `air_temp_k`, `process_temp_k`, `rotational_speed`, `torque`, `tool_wear`, `machine_failure`, `failure_twf`, `failure_hdf`, `failure_pwf`, `failure_osf`, `failure_rnf`

**Only in `machine_b_telemetry`:** `vibration_level`, `humidity`, `power_consumption`, `failure_status` (plus `timestamp`)

**Only in `machine_c_telemetry`:** `vibration_x`, `vibration_y`, `vibration_z`, `time_collected`, `risk_label`, `session_id`

## Relationship map

```
machines ──── machine_a_telemetry  (machine_a_telemetry.machine_id = machines.id)
         ──── machine_b_telemetry  (machine_b_telemetry.machine_id = machines.id)
         ──── machine_c_telemetry  (machine_c_telemetry.machine_id = machines.id)
         ──── predictions          (predictions.machine_id = machines.id)
         ──── recommendations      (recommendations.machine_id = machines.id)
         ──── simulations          (simulations.machine_id = machines.id)
         ──── history_events       (history_events.machine_id = machines.id)

users ──── personas   (users.persona_id = personas.id)
      ──── history_events (history_events.user_id = users.id)

machine ↔ persona:  machines → user_machine_access → users → personas  (3 hops — no shortcut)
```

## Person-to-machine queries (3-hop join via user_machine_access)

To find which machines a person has access to:
```sql
SELECT m.id, m.name, m.status
FROM machines m
JOIN user_machine_access uma ON m.id = uma.machine_id
JOIN users u ON uma.user_id = u.id
JOIN personas p ON u.persona_id = p.id
WHERE p.name = 'Alex Chen'
```

To find who has access to a machine:
```sql
SELECT p.name, p.role, p.shift
FROM personas p
JOIN users u ON u.persona_id = p.id
JOIN user_machine_access uma ON uma.user_id = u.id
WHERE uma.machine_id = 'machine-c'
```
