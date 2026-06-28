---
wiki: sql-agent
type: reference
updated: 2026-06-01
---

# Schema Reference

## Core tables

### `machines`
| Column | Type | Notes |
|---|---|---|
| id | string | `"machine-a"`, `"machine-b"`, `"machine-c"` (lowercase, exact) |
| name | string | Human name, e.g. "Vibration Sensor Machine" |
| line | string | Production line |
| model | string | Dataset model name |
| status | string | `healthy` / `watch` / `risk` / `offline` |
| machine_type | string | `ai4i` / `synthetic` / `real-sensor` / `generic` |
| health_score | float | 0–100 |
| risk_score | float | 0–100 |
| last_service_date | string | ISO date |
| next_service_date | string | ISO date |
| uptime_percent | float | |
| location | string | |
| operating_hours | float | |
| primary_failure_modes | JSON array | |
| notes | text | |

### `personas`
| Column | Type | Notes |
|---|---|---|
| id | string | |
| name | string | Full name — **only place person names are stored** |
| role | string | Job title |
| shift | string | |
| plant | string | |

### `users`
| Column | Type | Notes |
|---|---|---|
| id | string | PK |
| email | string | Login email — NOT a person's name |
| persona_id | string | FK → personas.id |
| access_role | string | `admin` or `user` |

### `user_machine_access`
| Column | Type | Notes |
|---|---|---|
| id | integer | autoincrement PK |
| user_id | string | FK → users.id |
| machine_id | string | FK → machines.id |

This is the **canonical access table** — it defines which machines each user is authorised to see. Use this (not `history_events`) for person-to-machine queries.

### `history_events`
| Column | Type | Notes |
|---|---|---|
| id | string | |
| timestamp | datetime | |
| type | string | Event category |
| machine_id | string | FK → machines.id |
| user_id | string | FK → users.id |
| title | string | |
| description | text | |
| severity | string | |
| metadata | JSON | |

### `predictions`
| Column | Type | Notes |
|---|---|---|
| id | string | |
| machine_id | string | FK → machines.id |
| generated_at | datetime | |
| horizon_hours | int | Forecast horizon (meaningful for Machine C only) |
| failure_mode | string | |
| probability | float | 0.0–1.0 |
| confidence | float | 0.0–1.0 |
| severity | string | low / medium / high / critical |

### `recommendations`
| Column | Type | Notes |
|---|---|---|
| id | string | |
| machine_id | string | |
| title | string | |
| detail | text | |
| action_type | string | |
| priority | string | |
| eta_minutes | int | |
| estimated_downtime_hours | float | |

### `simulations`
| Column | Type | Notes |
|---|---|---|
| id | string | |
| machine_id | string | FK → machines.id |
| user_id | string | FK → users.id |
| created_at | datetime | |
| scenario_name | string | |
| projected_risk | float | |
| projected_downtime_hours | float | |
| summary | text | |
| recommendations | JSON array | List of recommended actions |
| result_payload | JSON | Full simulation output (nullable) |

## Telemetry tables

### `machine_a_telemetry` (Machine A — ai4i dataset)
| Column | Notes |
|---|---|
| udi | Row index — use for ordering (NO timestamp exists) |
| product_id | |
| product_type | `L` / `M` / `H` |
| air_temp_k | Temperature in Kelvin |
| process_temp_k | Process temperature in Kelvin |
| rotational_speed | RPM |
| torque | Nm |
| tool_wear | Minutes |
| machine_failure | bool |
| failure_twf | bool — tool wear failure |
| failure_hdf | bool — heat dissipation failure |
| failure_pwf | bool — power failure |
| failure_osf | bool — overstrain failure |
| failure_rnf | bool — random failure |

### `machine_b_telemetry` (Machine B — synthetic dataset)
| Column | Notes |
|---|---|
| timestamp | datetime — use for ordering |
| temperature | °C |
| pressure | bar |
| vibration_level | mm/s² |
| humidity | % |
| power_consumption | kW |
| failure_status | bool |

### `machine_c_telemetry` (Machine C — real client sensor data)
| Column | Notes |
|---|---|
| session_id | int — groups rows into sessions (~4-day gaps between sessions) |
| vibration_x | m/s² — X-axis accelerometer |
| vibration_y | m/s² — Y-axis accelerometer |
| vibration_z | m/s² — Z-axis accelerometer |
| temperature | °C |
| time_collected | datetime — use for ordering (column is `time_collected`, NOT `timestamp`) |
| risk_label | `low` / `medium` / `high` |
