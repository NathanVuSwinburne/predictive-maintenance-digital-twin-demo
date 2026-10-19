"use client";

import { MqttBrokerStatusCard } from "@/components/admin/mqtt-broker-status-card";
import { MqttHealthPanel } from "@/components/admin/mqtt-health-panel";
import { MqttSubscriptionsPanel } from "@/components/admin/mqtt-subscribe-dialog";
import { useMqttHealth } from "@/hooks/use-mqtt-health";
import { useMqttSubscriptions } from "@/hooks/use-mqtt-subscriptions";

export default function AdminMqttPage() {
  const mqttHealth = useMqttHealth();
  const mqttSubscriptions = useMqttSubscriptions();

  return (
    <div className="space-y-6">
      <MqttBrokerStatusCard
        health={mqttHealth.health}
        isLoading={mqttHealth.isLoading}
        error={mqttHealth.error}
        lastCheckedAt={mqttHealth.lastCheckedAt}
      />
      <MqttSubscriptionsPanel
        subscriptions={mqttSubscriptions.subscriptions}
        isLoading={mqttSubscriptions.isLoading}
        error={mqttSubscriptions.error}
        onCreate={mqttSubscriptions.create}
        onUpdate={mqttSubscriptions.update}
        onDelete={mqttSubscriptions.remove}
      />
      <MqttHealthPanel
        health={mqttHealth.health}
        isLoading={mqttHealth.isLoading}
        error={mqttHealth.error}
        lastCheckedAt={mqttHealth.lastCheckedAt}
      />
    </div>
  );
}
