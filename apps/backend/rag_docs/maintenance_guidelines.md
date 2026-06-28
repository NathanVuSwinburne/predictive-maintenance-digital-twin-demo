# Industrial Predictive Maintenance Guidelines

## 1. General Principles

Predictive maintenance (PdM) aims to predict equipment failures before they occur using sensor data, historical trends, and statistical models. Key objectives:

- **Reduce unplanned downtime** by acting on early warning signals
- **Extend asset life** through condition-based rather than time-based servicing
- **Minimize costs** by avoiding over-maintenance and catastrophic failures

---

## 2. Temperature Monitoring

### Normal Operating Ranges
| Equipment Type | Normal Range (°C) | Warning Threshold | Critical Threshold |
|---------------|-------------------|-------------------|-------------------|
| CNC Spindle Motors | 60–75 | 85 | 95 |
| Hydraulic Systems | 40–60 | 70 | 80 |
| Compressors | 70–85 | 95 | 105 |
| Heat Exchangers | 50–80 | 90 | 100 |
| Conveyor Motors | 40–55 | 65 | 75 |

### Temperature-Related Failure Modes
- **Overheating**: Sustained operation >10% above nominal triggers lubricant degradation within 48 hours
- **Thermal Cycling**: Repeated heat/cool cycles cause metal fatigue in fasteners and seals
- **Coolant Fouling**: Heat exchangers with 20%+ fouling index show 15% efficiency loss

### Response Protocols
1. Temperature spike (single point) → Check coolant flow, inspect fans/fins
2. Sustained elevation (+5°C for >1h) → Reduce load, inspect thermal management
3. Critical threshold reached → Immediate shutdown, dispatch technician

---

## 3. Vibration Analysis

### Vibration Severity Standards (ISO 10816)
| Severity Zone | RMS Velocity (mm/s) | Action |
|--------------|---------------------|--------|
| A (Good) | 0–2.8 | Normal operation |
| B (Acceptable) | 2.8–7.1 | Monitor closely |
| C (Warning) | 7.1–18 | Plan maintenance |
| D (Danger) | >18 | Stop immediately |

### Vibration Frequency Signatures
- **1× RPM**: Unbalance — balance rotor
- **2× RPM**: Misalignment — check coupling alignment
- **3–5× RPM**: Looseness — tighten mounting bolts
- **Ball Pass Frequency (BPF)**: Bearing defect — replace bearing
- **High-frequency broadband**: Lubrication failure

### Bearing Failure Progression
1. Stage 1 (ultrasonic, 250–350 kHz): Initial micro-cracks — plan replacement in 30 days
2. Stage 2 (2–60 kHz): Crack growth — plan replacement in 7 days
3. Stage 3 (audible, 1–10 kHz): Visible wear — replace immediately
4. Stage 4 (visual/tactile, <1 kHz): Catastrophic — emergency shutdown

---

## 4. Pressure Systems

### Hydraulic System Guidelines
- **Normal operating pressure**: Verify against OEM spec (typically 100–300 bar)
- **Pressure fluctuations >10%**: Indicates seal wear or valve erosion
- **Pressure drop >20%**: Imminent seal failure — schedule within 24 hours
- **Fluid analysis interval**: Every 500 operating hours or 3 months

### Common Hydraulic Failure Causes
| Failure | Indicators | Action |
|---------|-----------|--------|
| Seal Failure | Pressure drop, external leaks | Replace seals (2–4h downtime) |
| Pump Cavitation | High noise, pressure oscillation | Check fluid level, inspect inlet |
| Valve Erosion | Sluggish response, pressure spikes | Inspect/replace control valve |
| Fluid Contamination | Discolored fluid, high heat | Flush system, replace filters |

---

## 5. Tool Wear (CNC Machines)

### Tool Wear Categories
- **Flank Wear (VB)**: Normal — replace at VB = 0.3 mm
- **Crater Wear**: High-speed cutting — reduce RPM by 10%
- **Thermal Cracking**: Coolant issues — check coolant concentration
- **Chipping**: Intermittent cutting — reduce feed rate

### Tool Life Model (Taylor's Equation)
- T × V^n = C (where T = tool life minutes, V = cutting speed, n ≈ 0.25)
- Doubling cutting speed reduces tool life by approximately 16×
- Optimal tool change interval: 80% of predicted tool life

### Condition Indicators
| Parameter | Normal | Warning | Replace |
|-----------|--------|---------|---------|
| Spindle Power | <90% of nominal | 90–105% | >105% |
| Surface Finish (Ra) | <1.6 μm | 1.6–3.2 μm | >3.2 μm |
| Dimensional Drift | <0.01 mm | 0.01–0.05 mm | >0.05 mm |

---

## 6. Compressed Air Systems

### Compressor Maintenance Schedule
| Task | Interval |
|------|----------|
| Inlet filter inspection | Monthly |
| Oil level check | Weekly |
| Oil/separator filter change | Every 2000 hours |
| Belt inspection | Every 500 hours |
| Valve inspection | Every 4000 hours |
| Full overhaul | Every 8000 hours |

### Failure Prevention
- **Overheating (>100°C outlet)**: Increase ventilation, check oil cooler
- **Excessive oil carry-over**: Replace separator element
- **Low pressure**: Leak detection survey, check inlet valve
- **High vibration**: Balance rotating elements, inspect mounts

---

## 7. Conveyor Systems

### Belt Conveyor Inspection Points
- **Belt tension**: Check with tension gauge; re-tension if >5% deviation
- **Tracking**: Belt should run centered ±25mm; adjust idlers if drifting
- **Splice condition**: Inspect monthly; replace at first sign of delamination
- **Idler/roller condition**: Check for seized rollers (vibration source)
- **Motor current**: Compare to nameplate; >10% increase indicates load issue

### Failure Modes
| Mode | Indicator | Prevention |
|------|-----------|-----------|
| Belt Slip | Low throughput, high motor temp | Adjust tension |
| Belt Tracking Off | Edge wear, material spillage | Align idlers |
| Motor Overload | High current, thermal trip | Reduce load or inspect obstruction |
| Roller Failure | Flat spot vibration | Weekly walkdown inspection |

---

## 8. Maintenance Priority Matrix

| Risk Score | Health Score | Priority | Response Time |
|-----------|-------------|----------|---------------|
| >70% | <50 | Critical | Immediate (<4h) |
| 50–70% | 50–70 | High | Same day (<8h) |
| 30–50% | 70–85 | Medium | Within 48 hours |
| <30% | >85 | Low | Next planned cycle |

---

## 9. Root Cause Analysis (RCA) Framework

For any failure event:
1. **Define** — Document exact failure mode and time
2. **Contain** — Implement temporary fix to restore production
3. **Analyse** — Use 5-Why or Fishbone diagram
4. **Correct** — Implement permanent fix
5. **Prevent** — Update maintenance schedule/procedure
6. **Verify** — Confirm fix effectiveness over 30-day monitoring window

---

## 10. Lubrication Guidelines

### Lubrication Intervals
| Component | Lubricant Type | Interval |
|-----------|---------------|----------|
| Rolling bearings (<3000 RPM) | NLGI #2 grease | Every 2000 hours |
| Rolling bearings (>3000 RPM) | NLGI #1 grease | Every 500 hours |
| Plain bearings | ISO VG 46 oil | Monthly |
| Gear boxes | ISO VG 220 oil | Every 4000 hours |
| Pneumatic actuators | Air line oil | Continuous (mist) |

### Lubrication Failure Signs
- **Over-greasing**: Elevated temperature, seal damage
- **Under-greasing**: Increased vibration, bearing noise
- **Contaminated lubricant**: Milky appearance (water), gritty feel (particles)

---

## 11. Electrical / Power Monitoring

### Power Factor and Energy Anomalies
- Power draw >10% above baseline: Mechanical friction increase or electrical fault
- Power factor <0.85: Capacitor compensation required
- Current imbalance >2%: Check winding resistance, inspect connections

### Motor Health Indicators
| Indicator | Normal | Action Required |
|-----------|--------|----------------|
| Winding insulation (MΩ) | >100 MΩ | Investigate if <1 MΩ |
| Temperature rise | <40°C above ambient | >60°C: reduce load |
| Vibration (bearing) | <2.8 mm/s RMS | Replace bearing >7.1 mm/s |
| Starting current | ≤6× FLA | Check starter if >7× |

---

## 12. Spare Parts Strategy

### Critical Spares (Always in Stock)
- Shaft seals and O-rings for all critical machines
- Bearing sets for motors >15 kW
- Filter elements (oil, air, hydraulic)
- Drive belts and couplings
- PLC I/O modules and fuses

### Consumable Stock Management
- Minimum stock = Lead time demand × 1.5 safety factor
- Review slow-movers quarterly
- Emergency supplier list: maintain contacts for <24h delivery
