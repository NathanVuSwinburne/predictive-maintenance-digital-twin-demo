"use client";

import { type FormEvent, useState } from "react";

import { ErrorNotice } from "@/components/feedback/error-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  MqttSubscription,
  MqttSubscriptionInput,
} from "@/lib/domain/types";
import { toUserFacingError, type UserFacingError } from "@/lib/errors/user-facing-error";

type Props = {
  subscriptions: MqttSubscription[];
  isLoading?: boolean;
  error?: UserFacingError | null;
  onCreate: (input: MqttSubscriptionInput) => Promise<void>;
  onUpdate: (id: string, input: MqttSubscriptionInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

const emptyInput: MqttSubscriptionInput = {
  name: "",
  brokerHost: "",
  port: 8883,
  topic: "",
  qos: 1,
  enabled: false,
};

export function MqttSubscriptionsPanel({
  subscriptions,
  isLoading = false,
  error,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState<MqttSubscription | null>(null);
  const [form, setForm] = useState<MqttSubscriptionInput>(emptyInput);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<MqttSubscription | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<UserFacingError | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(emptyInput);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(subscription: MqttSubscription) {
    setEditing(subscription);
    setForm({
      name: subscription.name,
      brokerHost: subscription.brokerHost,
      port: subscription.port,
      topic: subscription.topic,
      qos: subscription.qos,
      enabled: subscription.enabled,
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setFormError(null);
    try {
      if (editing) await onUpdate(editing.id, form);
      else await onCreate(form);
      setFormOpen(false);
    } catch (caught) {
      setFormError(toUserFacingError(caught, "data.save", {
        title: "Subscription could not be saved",
        message: "The broker subscription settings were not changed.",
      }));
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setIsSaving(true);
    setFormError(null);
    try {
      await onDelete(deleting.id);
      setDeleting(null);
    } catch (caught) {
      setFormError(toUserFacingError(caught, "data.delete", {
        title: "Subscription could not be removed",
        message: "The broker subscription remains saved.",
      }));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Subscription definitions</h2>
        </CardTitle>
        <CardAction>
          <Button onClick={openCreate}>Add subscription</Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          These are saved definitions. Enabling one records the intent to subscribe and
          does not mean the broker is connected — the MQTT pipeline health panel is
          where live connectivity is reported.
        </p>

        {error ? <ErrorNotice error={error} /> : null}

        {isLoading ? (
          <p className="text-muted-foreground">
            Loading subscription definitions…
          </p>
        ) : subscriptions.length === 0 ? (
          <div className="border border-dashed p-6 text-center text-muted-foreground">
            No subscription definitions have been saved.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Broker</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>QoS</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell className="font-medium">
                    {subscription.name}
                  </TableCell>
                  <TableCell>
                    {subscription.brokerHost}:{subscription.port}
                  </TableCell>
                  <TableCell>{subscription.topic}</TableCell>
                  <TableCell>{subscription.qos}</TableCell>
                  <TableCell>
                    <Badge
                      variant={subscription.enabled ? "default" : "outline"}
                    >
                      {subscription.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Edit ${subscription.name}`}
                        onClick={() => openEdit(subscription)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        aria-label={`Delete ${subscription.name}`}
                        onClick={() => setDeleting(subscription)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit MQTT subscription" : "Add MQTT subscription"}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="mqtt-name">Name</Label>
              <Input
                id="mqtt-name"
                required
                maxLength={100}
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <div className="space-y-2">
                <Label htmlFor="mqtt-host">Broker host</Label>
                <Input
                  id="mqtt-host"
                  required
                  maxLength={253}
                  placeholder="mqtt.example.internal"
                  value={form.brokerHost}
                  onChange={(event) =>
                    setForm({ ...form, brokerHost: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mqtt-port">Port</Label>
                <Input
                  id="mqtt-port"
                  type="number"
                  min={1}
                  max={65535}
                  required
                  value={form.port}
                  onChange={(event) =>
                    setForm({ ...form, port: Number(event.target.value) })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mqtt-topic">Topic</Label>
              <Input
                id="mqtt-topic"
                required
                maxLength={256}
                placeholder="plant/machine-c/telemetry"
                value={form.topic}
                onChange={(event) =>
                  setForm({ ...form, topic: event.target.value })
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mqtt-qos">QoS</Label>
                <select
                  id="mqtt-qos"
                  className="h-8 w-full border border-input bg-background px-2 text-xs"
                  value={form.qos}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      qos: Number(event.target.value) as 0 | 1 | 2,
                    })
                  }
                >
                  <option value={0}>0 — At most once</option>
                  <option value={1}>1 — At least once</option>
                  <option value={2}>2 — Exactly once</option>
                </select>
              </div>
              <label className="flex items-end gap-2 pb-1">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) =>
                    setForm({ ...form, enabled: event.target.checked })
                  }
                />
                Enable this definition
              </label>
            </div>
            {formError ? <ErrorNotice error={formError} /> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : "Save subscription"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete MQTT subscription?</DialogTitle>
            <DialogDescription>
              This removes the saved definition for {deleting?.name}. It does
              not change the process-local health history.
            </DialogDescription>
          </DialogHeader>
          {formError ? <ErrorNotice error={formError} /> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleting(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isSaving}
              onClick={confirmDelete}
            >
              Delete subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
