"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type {
  ChatNotificationChannel,
  ChatNotificationPreferences,
} from "@/lib/chat-notification-delivery";

const CHANNEL_LABELS: Record<ChatNotificationChannel, string> = {
  dm: "Direct messages",
  group: "Group threads",
  all_lab: "All-lab messages",
};

const HOUR_OPTIONS = [...Array(24)].map((_, hour) => ({
  value: hour,
  label: `${hour.toString().padStart(2, "0")}:00`,
}));

export function ChatNotificationPreferencesCard({
  initialPreferences,
  smsFeatureEnabled,
  smsProviderConfigured,
  saveAction,
}: {
  initialPreferences: ChatNotificationPreferences;
  smsFeatureEnabled: boolean;
  smsProviderConfigured: boolean;
  saveAction: (
    nextPreferences: ChatNotificationPreferences,
  ) => Promise<{ success?: boolean; error?: string }>;
}) {
  const [preferences, setPreferences] = useState<ChatNotificationPreferences>(initialPreferences);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setChannelPreference(
    channel: ChatNotificationChannel,
    key: "inApp" | "email" | "sms",
    value: boolean,
  ) {
    setPreferences((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channel]: {
          ...prev.channels[channel],
          [key]: value,
        },
      },
    }));
  }

  function save() {
    startTransition(async () => {
      setErrorMessage(null);
      setSuccessMessage(null);
      const result = await saveAction(preferences);
      if (result?.error) {
        setErrorMessage(result.error);
        return;
      }
      setSuccessMessage("Preferences saved.");
    });
  }

  return (
    <section className="section-card card-density-comfy">
      <div className="page-header">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Delivery preferences</h2>
          <p className="mt-1 text-sm text-slate-600">
            Choose how you want chat updates by channel.
          </p>
        </div>
        <Button type="button" size="sm" className="touch-target self-start" onClick={save} disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      <div className="mt-4 grid gap-3">
        {(Object.keys(CHANNEL_LABELS) as ChatNotificationChannel[]).map((channel) => (
          <div
            key={channel}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
          >
            <p className="text-sm font-medium text-slate-800">{CHANNEL_LABELS[channel]}</p>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              In-app
              <Switch
                checked={preferences.channels[channel].inApp}
                onCheckedChange={(checked) => setChannelPreference(channel, "inApp", checked)}
                disabled={isPending}
                aria-label={`${CHANNEL_LABELS[channel]} in-app notifications`}
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Email
              <Switch
                checked={preferences.channels[channel].email}
                onCheckedChange={(checked) => setChannelPreference(channel, "email", checked)}
                disabled={isPending}
                aria-label={`${CHANNEL_LABELS[channel]} email notifications`}
              />
            </label>
          </div>
        ))}
      </div>

      {smsFeatureEnabled ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-800">SMS (optional)</p>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Enabled
              <Switch
                checked={preferences.sms.enabled}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({ ...prev, sms: { ...prev.sms, enabled: checked } }))
                }
                disabled={isPending || !smsProviderConfigured}
                aria-label="Enable SMS notifications"
              />
            </label>
          </div>

          {!smsProviderConfigured ? (
            <p className="mb-3 text-xs text-amber-700">
              SMS provider is not configured yet. Save your settings now and enable SMS after setup.
            </p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs text-slate-600">
              Verified phone
              <input
                type="tel"
                value={preferences.sms.phone}
                onChange={(event) =>
                  setPreferences((prev) => ({
                    ...prev,
                    sms: { ...prev.sms, phone: event.target.value },
                  }))
                }
                placeholder="+15555555555"
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                disabled={isPending}
                aria-label="Verified phone number for SMS notifications"
              />
            </label>

            <label className="flex items-center gap-2 pt-5 text-xs text-slate-600">
              <Switch
                checked={preferences.sms.phoneVerified}
                onCheckedChange={(checked) =>
                  setPreferences((prev) => ({
                    ...prev,
                    sms: { ...prev.sms, phoneVerified: checked },
                  }))
                }
                disabled={isPending}
                aria-label="Phone is verified for SMS"
              />
              Phone verified
            </label>

            <label className="grid gap-1 text-xs text-slate-600">
              Quiet hours start
              <select
                value={String(preferences.sms.quietHoursStart)}
                onChange={(event) =>
                  setPreferences((prev) => ({
                    ...prev,
                    sms: { ...prev.sms, quietHoursStart: Number(event.target.value) || 0 },
                  }))
                }
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900"
                disabled={isPending}
                aria-label="Quiet hours start"
              >
                {HOUR_OPTIONS.map((option) => (
                  <option key={`quiet-start-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-xs text-slate-600">
              Quiet hours end
              <select
                value={String(preferences.sms.quietHoursEnd)}
                onChange={(event) =>
                  setPreferences((prev) => ({
                    ...prev,
                    sms: { ...prev.sms, quietHoursEnd: Number(event.target.value) || 0 },
                  }))
                }
                className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900"
                disabled={isPending}
                aria-label="Quiet hours end"
              >
                {HOUR_OPTIONS.map((option) => (
                  <option key={`quiet-end-${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-xs text-slate-600 md:col-span-2">
              Time zone
              <input
                type="text"
                value={preferences.sms.timezone}
                onChange={(event) =>
                  setPreferences((prev) => ({
                    ...prev,
                    sms: { ...prev.sms, timezone: event.target.value || "UTC" },
                  }))
                }
                placeholder="UTC"
                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
                disabled={isPending}
                aria-label="Time zone for SMS quiet hours"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-2">
            {(Object.keys(CHANNEL_LABELS) as ChatNotificationChannel[]).map((channel) => (
              <label key={`sms-${channel}`} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                <span>{CHANNEL_LABELS[channel]}</span>
                <Switch
                  checked={preferences.channels[channel].sms}
                  onCheckedChange={(checked) => setChannelPreference(channel, "sms", checked)}
                  disabled={isPending}
                  aria-label={`${CHANNEL_LABELS[channel]} SMS notifications`}
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {errorMessage ? <p className="mt-3 text-sm text-red-700">{errorMessage}</p> : null}
      {successMessage ? <p className="mt-3 text-sm text-emerald-700">{successMessage}</p> : null}
    </section>
  );
}
