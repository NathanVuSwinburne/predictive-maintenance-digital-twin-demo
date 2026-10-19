"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CpuIcon,
  KeyIcon,
  ShieldCheckIcon,
  UsersIcon,
  UserIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { ErrorNotice } from "@/components/feedback/error-notice";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDataProvider } from "@/hooks/use-data-provider";
import type {
  LlmConfiguration,
  LlmProvider,
  MachineSummary,
  UserPersona,
} from "@/lib/domain/types";
import {
  toUserFacingError,
  type UserFacingError,
} from "@/lib/errors/user-facing-error";

export default function AdminOverviewPage() {
  const provider = useDataProvider();

  const [users, setUsers] = useState<UserPersona[]>([]);
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<UserFacingError | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [llmConfiguration, setLlmConfiguration] =
    useState<LlmConfiguration | null>(null);
  const [llmProviderDraft, setLlmProviderDraft] =
    useState<LlmProvider>("openai");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [isSavingLlmConfiguration, setIsSavingLlmConfiguration] =
    useState(false);
  const [llmConfigurationError, setLlmConfigurationError] =
    useState<UserFacingError | null>(null);

  useEffect(() => {
    let active = true;

    async function loadOverview() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [loadedUsers, loadedMachines] = await Promise.all([
          provider.listUsers(),
          provider.listMachines({ sortBy: "name", sortDirection: "asc" }),
        ]);

        if (!active) {
          return;
        }

        setUsers(loadedUsers);
        setMachines(loadedMachines);
      } catch (error) {
        if (active)
          setLoadError(
            toUserFacingError(error, "data.load", {
              title: "Administration overview could not be loaded",
              message: "User and machine totals are unavailable.",
            }),
          );
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadOverview();

    return () => {
      active = false;
    };
  }, [loadAttempt, provider]);

  useEffect(() => {
    let active = true;

    async function loadLlmConfiguration() {
      try {
        const configuration = await provider.getLlmConfiguration();
        if (!active) return;
        setLlmConfiguration(configuration);
        setLlmProviderDraft(configuration.provider);
        setLlmConfigurationError(null);
      } catch (error) {
        if (active) {
          setLlmConfigurationError(
            toUserFacingError(error, "data.load", {
              title: "AI Assistant configuration could not be loaded",
            }),
          );
        }
      }
    }

    void loadLlmConfiguration();
    return () => {
      active = false;
    };
  }, [provider]);

  const adminCount = useMemo(
    () => users.filter((user) => user.role === "admin").length,
    [users],
  );
  const standardUserCount = users.length - adminCount;
  const hasConfiguredKeyForDraftProvider = Boolean(
    llmConfiguration?.hasApiKey &&
    llmConfiguration.provider === llmProviderDraft,
  );

  async function saveLlmSettings() {
    setIsSavingLlmConfiguration(true);
    try {
      const configuration = await provider.updateLlmConfiguration({
        provider: llmProviderDraft,
        apiKey: apiKeyDraft.trim() || undefined,
      });
      setLlmConfiguration(configuration);
      setApiKeyDraft("");
      setLlmConfigurationError(null);
      toast.success("AI Assistant configuration saved");
    } catch (error) {
      setLlmConfigurationError(
        toUserFacingError(error, "data.save", {
          title: "AI Assistant configuration could not be saved",
        }),
      );
    } finally {
      setIsSavingLlmConfiguration(false);
    }
  }

  async function clearApiKey() {
    setIsSavingLlmConfiguration(true);
    try {
      const configuration = await provider.updateLlmConfiguration({
        provider: llmProviderDraft,
        clearApiKey: true,
      });
      setLlmConfiguration(configuration);
      setApiKeyDraft("");
      setLlmConfigurationError(null);
      toast.success("AI Assistant API key cleared");
    } catch (error) {
      setLlmConfigurationError(
        toUserFacingError(error, "data.save", {
          title: "AI Assistant API key could not be cleared",
        }),
      );
    } finally {
      setIsSavingLlmConfiguration(false);
    }
  }

  const stats = [
    {
      label: "Total users",
      value: users.length,
      detail: "Accounts available",
      icon: UsersIcon,
    },
    {
      label: "Total machines",
      value: machines.length,
      detail: "Machines available to administrators",
      icon: CpuIcon,
    },
    {
      label: "Admins",
      value: adminCount,
      detail: "Users with full management access",
      icon: ShieldCheckIcon,
    },
    {
      label: "Standard users",
      value: standardUserCount,
      detail: "Users limited to assigned machines",
      icon: UserIcon,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {loadError ? (
        <ErrorNotice
          error={loadError}
          actionLabel="Try Again"
          onAction={() => setLoadAttempt((value) => value + 1)}
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardDescription className="text-sm">
                {stat.label}
              </CardDescription>
              {isLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <CardTitle className="text-lg">{stat.value}</CardTitle>
              )}
            </CardHeader>
            <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
              <stat.icon />
              {stat.detail}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <KeyIcon aria-hidden="true" />
              <CardTitle className="text-sm">
                AI Assistant Configuration
              </CardTitle>
            </div>
            <CardDescription className="max-w-3xl text-sm">
              Choose the shared language-model provider and API key used by all
              AI Assistant users. The key is encrypted before it is stored in
              the database.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)_auto] md:items-end">
            {llmConfigurationError && (
              <ErrorNotice
                className="md:col-span-3"
                error={llmConfigurationError}
              />
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-llm-provider">Provider</Label>
              <Select
                value={llmProviderDraft}
                onValueChange={(value) =>
                  setLlmProviderDraft(value as LlmProvider)
                }
              >
                <SelectTrigger id="admin-llm-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="gemini">Google Gemini</SelectItem>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="ollama">Ollama (Local)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {llmProviderDraft === "ollama" ? (
              <p className="pb-2 text-sm text-muted-foreground">
                Local Ollama does not require an API key.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="admin-llm-api-key">API Key</Label>
                <Input
                  id="admin-llm-api-key"
                  type="password"
                  value={apiKeyDraft}
                  onChange={(event) => setApiKeyDraft(event.target.value)}
                  placeholder={
                    hasConfiguredKeyForDraftProvider
                      ? "A key is configured — enter a new key to replace it"
                      : llmProviderDraft === "gemini"
                        ? "AIza…"
                        : llmProviderDraft === "deepseek"
                          ? "sk-… (DeepSeek key)"
                          : "sk-…"
                  }
                  className="font-mono"
                  autoComplete="off"
                />
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void saveLlmSettings()}
                disabled={isSavingLlmConfiguration}
              >
                {isSavingLlmConfiguration ? "Saving…" : "Save Configuration"}
              </Button>
              {hasConfiguredKeyForDraftProvider && (
                <Button
                  variant="outline"
                  onClick={() => void clearApiKey()}
                  disabled={isSavingLlmConfiguration}
                >
                  Clear Key
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Machine model approvals</CardTitle>
            <CardDescription className="text-sm">
              Compare candidate versions, approve @production, and roll back by
              selecting an older compatible version.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/models">Open model approvals</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Manage users</CardTitle>
            <CardDescription className="text-sm">
              Review user roles and assign machine access.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/admin/users">Open user management</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Inspect machine assignments
            </CardTitle>
            <CardDescription className="text-sm">
              View users assigned to each machine.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/machines">Open machine view</Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              MQTT Subscription management
            </CardTitle>
            <CardDescription className="text-sm">
              View subscribed MQTT topics for live data.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/managemqtt">Open subscription manager</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
