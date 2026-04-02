"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PushSupportState = "unknown" | "unsupported" | "supported";
type PushStatus = "idle" | "enabling" | "enabled" | "disabled" | "error";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

async function registerServiceWorker() {
  return navigator.serviceWorker.register("/sw.js");
}

export function WebPushSettingsCard() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const [support, setSupport] = useState<PushSupportState>("unknown");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [status, setStatus] = useState<PushStatus>("idle");
  const [message, setMessage] = useState<string>("");

  const canEnable = useMemo(
    () => support === "supported" && permission !== "denied" && vapidPublicKey.length > 0,
    [support, permission, vapidPublicKey],
  );
  const canDisable = status === "enabled" || status === "enabling";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setSupport("unsupported");
      return;
    }

    setSupport("supported");
    setPermission(Notification.permission);

    void (async () => {
      try {
        const registration = await registerServiceWorker();
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          setStatus("enabled");
        }
      } catch {
        setStatus("error");
        setMessage("Could not initialize push notifications on this browser.");
      }
    })();
  }, []);

  async function enablePush() {
    if (!canEnable) return;
    setStatus("enabling");
    setMessage("");

    try {
      const registration = await registerServiceWorker();

      let currentPermission = Notification.permission;
      if (currentPermission !== "granted") {
        currentPermission = await Notification.requestPermission();
      }
      setPermission(currentPermission);

      if (currentPermission !== "granted") {
        setStatus("disabled");
        setMessage("Notification permission was not granted.");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Unable to save push subscription.");
      }

      setStatus("enabled");
      setMessage("Push notifications are enabled on this device.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Failed to enable push notifications.");
    }
  }

  async function disablePush() {
    setMessage("");
    try {
      const registration = await registerServiceWorker();
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
      }
      setStatus("disabled");
      setMessage("Push notifications are disabled on this device.");
    } catch {
      setStatus("error");
      setMessage("Could not disable push notifications.");
    }
  }

  async function sendTestPush() {
    setMessage("");
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const statusText = `HTTP ${response.status}`;
        throw new Error(payload.error ? `${payload.error}` : `Unable to send test push (${statusText}).`);
      }
      const delivered = typeof payload.delivered === "number" ? payload.delivered : null;
      setMessage(
        delivered && delivered > 0
          ? `Test notification sent to ${delivered} subscription${delivered === 1 ? "" : "s"}. Check your lock screen/notification center.`
          : "Test notification sent. Check your lock screen/notification center.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send test push.");
    }
  }

  return (
    <Card className="mb-5">
      <CardHeader>
        <CardTitle>iPhone Lock-Screen Push</CardTitle>
        <CardDescription>
          Enable push notifications for messages and reminders when this app is added to your iPhone Home Screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {support === "unsupported" ? (
          <p className="text-rose-700">This browser does not support Web Push. Use Safari on iPhone and Add to Home Screen.</p>
        ) : null}
        {support === "supported" && vapidPublicKey.length === 0 ? (
          <p className="text-rose-700">Push is not configured on the server yet (missing VAPID public key).</p>
        ) : null}

        <p className="text-slate-600">Permission: <span className="font-medium text-slate-900">{permission}</span></p>

        <div className="flex flex-wrap gap-2">
          <Button onClick={enablePush} disabled={!canEnable || status === "enabling"}>
            {status === "enabling" ? "Enabling..." : "Enable Push"}
          </Button>
          <Button variant="outline" onClick={disablePush} disabled={!canDisable}>
            Disable Push
          </Button>
          <Button variant="secondary" onClick={sendTestPush} disabled={status !== "enabled"}>
            Send Test Notification
          </Button>
        </div>

        {message ? <p className="text-slate-700">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
