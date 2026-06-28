"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis } from "recharts"
import {
  ArrowLeftIcon,
  ChartLineIcon,
  FlaskIcon,
  ThermometerSimpleIcon,
  ToolboxIcon,
  WrenchIcon,
} from "@phosphor-icons/react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDataProvider } from "@/hooks/use-data-provider"
import {
  badgeVariantForMachineStatus,
  badgeVariantForSeverity,
  formatDateTime,
} from "@/lib/domain/presentation"
import type {
  HistoryEvent,
  MachineDetail,
  MaintenanceRecommendation,
  Prediction,
  TelemetryPoint,
} from "@/lib/domain/types"

const telemetryConfig = {
  temperature: {
    label: "Temperature",
    color: "var(--chart-1)",
  },
  vibration: {
    label: "Vibration",
    color: "var(--chart-2)",
  },
  pressure: {
    label: "Pressure",
    color: "var(--chart-3)",
  },
  power: {
    label: "Power",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig

export function MachineDetailPage({ machineId }: { machineId: string }) {
  const provider = useDataProvider()

  const [machine, setMachine] = useState<MachineDetail | null>(null)
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([])
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [recommendations, setRecommendations] = useState<
    MaintenanceRecommendation[]
  >([])
  const [history, setHistory] = useState<HistoryEvent[]>([])

  useEffect(() => {
    let active = true

    async function loadMachine() {
      try {
        const [
          detail,
          telemetryData,
          predictionData,
          recommendationData,
          historyData,
        ] = await Promise.all([
          provider.getMachineDetail(machineId),
          provider.getMachineTelemetry(machineId),
          provider.getMachinePredictions(machineId),
          provider.getMaintenanceRecommendations(machineId),
          provider.listHistoryEvents({ machineId }),
        ])

        if (!active) {
          return
        }

        setMachine(detail)
        setTelemetry(telemetryData)
        setPredictions(predictionData)
        setRecommendations(recommendationData)
        setHistory(historyData.slice(0, 6))
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load machine detail"
        )
      }
    }

    void loadMachine()

    return () => {
      active = false
    }
  }, [machineId, provider])

  const compactTelemetry = useMemo(() => telemetry.slice(-14), [telemetry])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/machines">
              <ArrowLeftIcon data-icon="inline-start" />
              Back to machines
            </Link>
          </Button>
          {machine?.machineType === "real-sensor" ||
          machine?.machineType === "kaggle" ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/simulator?machineId=${machineId}`}>
                <FlaskIcon data-icon="inline-start" />
                Run simulation
              </Link>
            </Button>
          ) : null}
        </div>

        {machine && (
          <div className="flex items-center gap-2">
            <Badge variant={badgeVariantForMachineStatus(machine.status)}>
              {machine.status}
            </Badge>
            <Badge variant="outline">{machine.id}</Badge>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {machine ? `${machine.name} · ${machine.model}` : "Machine profile"}
          </CardTitle>
          <CardDescription className="text-sm">
            Telemetry, fault prediction and prescriptive maintenance for this
            machine.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="border border-border p-3 text-sm">
            <p className="text-muted-foreground">Line</p>
            <p className="font-medium">{machine?.line ?? "-"}</p>
          </div>
          <div className="border border-border p-3 text-sm">
            <p className="text-muted-foreground">Health score</p>
            <p className="font-medium">{machine?.healthScore ?? 0}%</p>
          </div>
          <div className="border border-border p-3 text-sm">
            <p className="text-muted-foreground">Risk score</p>
            <p className="font-medium">{machine?.riskScore ?? 0}%</p>
          </div>
          <div className="border border-border p-3 text-sm">
            <p className="text-muted-foreground">Operating hours</p>
            <p className="font-medium">{machine?.operatingHours ?? 0} h</p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="telemetry">
        <TabsList>
          <TabsTrigger value="telemetry">Telemetry</TabsTrigger>
          <TabsTrigger value="predictions">Predictions</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="telemetry" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Signal Telemetry</CardTitle>
              <CardDescription className="text-sm">
                Latest synthetic + historical trend window for machine sensors.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ChartContainer config={telemetryConfig} className="h-72 w-full">
                <LineChart data={compactTelemetry}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      new Date(value).toLocaleTimeString("en-AU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    }
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    dataKey="temperature"
                    stroke="var(--color-temperature)"
                    strokeWidth={2}
                  />
                  <Line
                    dataKey="vibration"
                    stroke="var(--color-vibration)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ChartContainer>

              <ChartContainer config={telemetryConfig} className="h-60 w-full">
                <AreaChart data={compactTelemetry}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="timestamp"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) =>
                      new Date(value).toLocaleTimeString("en-AU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    }
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    dataKey="pressure"
                    stroke="var(--color-pressure)"
                    fill="var(--color-pressure)"
                    fillOpacity={0.25}
                  />
                  <Area
                    dataKey="power"
                    stroke="var(--color-power)"
                    fill="var(--color-power)"
                    fillOpacity={0.25}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="predictions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Fault Predictions</CardTitle>
              <CardDescription className="text-sm">
                Current model output with confidence and failure horizon.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {predictions.map((prediction) => (
                <div
                  key={prediction.id}
                  className="border border-border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={badgeVariantForSeverity(prediction.severity)}>
                      {prediction.severity}
                    </Badge>
                    <span className="font-medium">{prediction.failureMode}</span>
                    <span className="text-muted-foreground">
                      {prediction.horizonHours}h horizon
                    </span>
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    Probability: {Math.round(prediction.probability * 100)}% ·
                    Confidence: {Math.round(prediction.confidence * 100)}%
                  </p>
                  <p className="text-muted-foreground">
                    Generated: {formatDateTime(prediction.generatedAt)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Prescriptive Actions</CardTitle>
              <CardDescription className="text-sm">
                Suggested interventions to reduce downtime and fault
                probability.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {recommendations.map((recommendation) => (
                <div
                  key={recommendation.id}
                  className="border border-border p-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={badgeVariantForSeverity(recommendation.priority)}>
                      {recommendation.priority}
                    </Badge>
                    <span className="font-medium">{recommendation.title}</span>
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    {recommendation.detail}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-muted-foreground">
                    <span>
                      <WrenchIcon data-icon="inline-start" />
                      {recommendation.actionType}
                    </span>
                    <span>
                      <ToolboxIcon data-icon="inline-start" />
                      ETA {recommendation.etaMinutes} min
                    </span>
                    <span>
                      <ChartLineIcon data-icon="inline-start" />
                      Downtime {recommendation.estimatedDowntimeHours}h
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Recent Activity</CardTitle>
          <CardDescription className="text-sm">
            Latest maintenance and AI events associated with this machine.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {history.map((event, index) => (
            <div key={event.id}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <ThermometerSimpleIcon />
                  <span className="font-medium">{event.title}</span>
                </div>
                <span className="text-muted-foreground">
                  {formatDateTime(event.timestamp)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {event.description}
              </p>
              {index < history.length - 1 && <Separator className="mt-3" />}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
