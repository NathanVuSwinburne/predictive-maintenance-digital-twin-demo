---
wiki: sql-agent
type: reference
updated: 2026-06-01
---

# Query Patterns

Worked examples — write SQL directly and call `execute_read_only_sql`.

## Latest telemetry

```
Q: Latest sensor readings for Machine B
→ SELECT timestamp, temperature, vibration_level, pressure, humidity, power_consumption, failure_status
  FROM machine_b_telemetry WHERE machine_id = 'machine-b' ORDER BY timestamp DESC LIMIT 1

Q: Latest vibration for Machine C
→ SELECT time_collected, session_id, vibration_x, vibration_y, vibration_z, temperature, risk_label
  FROM machine_c_telemetry WHERE machine_id = 'machine-c' ORDER BY time_collected DESC LIMIT 5

Q: Latest AI4I row for Machine A
→ SELECT udi, air_temp_k, process_temp_k, rotational_speed, torque, tool_wear, machine_failure
  FROM machine_a_telemetry WHERE machine_id = 'machine-a' ORDER BY udi DESC LIMIT 1
```

## High-risk sessions / failures

```
Q: Show high-risk readings for Machine C
→ SELECT session_id, vibration_x, vibration_y, vibration_z, temperature, time_collected, risk_label
  FROM machine_c_telemetry WHERE machine_id = 'machine-c' AND risk_label = 'high'
  ORDER BY time_collected DESC LIMIT 20

Q: How many tool wear failures in Machine A dataset?
→ SELECT COUNT(*) AS twf_count FROM machine_a_telemetry
  WHERE machine_id = 'machine-a' AND failure_twf = true

Q: Failure rate for Machine B
→ SELECT
    COUNT(*) AS total_rows,
    SUM(CASE WHEN failure_status = true THEN 1 ELSE 0 END) AS failure_count,
    ROUND(100.0 * SUM(CASE WHEN failure_status = true THEN 1 ELSE 0 END) / COUNT(*), 2) AS failure_rate_pct
  FROM machine_b_telemetry WHERE machine_id = 'machine-b'
```

## Machine attributes

```
Q: Status of all machines
→ SELECT id, name, status, health_score, risk_score FROM machines ORDER BY risk_score DESC

Q: Machine C details
→ SELECT notes, machine_type, status, health_score, risk_score FROM machines WHERE id = 'machine-c'
```

## Predictions and recommendations

```
Q: Recent predictions for Machine C
→ SELECT failure_mode, probability, confidence, severity, horizon_hours, generated_at
  FROM predictions WHERE machine_id = 'machine-c' ORDER BY generated_at DESC LIMIT 5

Q: High priority recommendations for Machine A
→ SELECT title, detail, priority, eta_minutes FROM recommendations
  WHERE machine_id = 'machine-a' AND priority = 'high'

Q: Which machine had the most predictions this month?
→ SELECT machine_id, COUNT(*) AS prediction_count FROM predictions
  WHERE generated_at >= DATE_TRUNC('month', NOW())
  GROUP BY machine_id ORDER BY prediction_count DESC LIMIT 5
```

## Person queries

```
Q: Alex Chen's shift and plant
→ SELECT shift, plant, role FROM personas WHERE name = 'Alex Chen'

Q: Machines Alex Chen has access to
→ SELECT m.id, m.name, m.status
  FROM machines m
  JOIN user_machine_access uma ON m.id = uma.machine_id
  JOIN users u ON uma.user_id = u.id
  JOIN personas p ON u.persona_id = p.id
  WHERE p.name = 'Alex Chen'

Q: Who has access to Machine C?
→ SELECT p.name, p.role, p.shift
  FROM personas p
  JOIN users u ON u.persona_id = p.id
  JOIN user_machine_access uma ON uma.user_id = u.id
  WHERE uma.machine_id = 'machine-c'
```

## Simulation runs

```
Q: Recent simulations for Machine C
→ SELECT scenario_name, projected_risk, projected_downtime_hours, summary, created_at
  FROM simulations WHERE machine_id = 'machine-c' ORDER BY created_at DESC LIMIT 5

Q: Highest risk simulation ever run
→ SELECT machine_id, scenario_name, projected_risk, created_at
  FROM simulations ORDER BY projected_risk DESC LIMIT 1
```
