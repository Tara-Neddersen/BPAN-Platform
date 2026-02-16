"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Mail } from "lucide-react";

interface DigestToggleProps {
  enabled: boolean;
  updateAction: (formData: FormData) => Promise<void>;
}

export function DigestToggle({ enabled, updateAction }: DigestToggleProps) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [loading, setLoading] = useState(false);

  async function handleToggle(checked: boolean) {
    setIsEnabled(checked);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("digest_enabled", String(checked));
      await updateAction(formData);
    } catch {
      setIsEnabled(!checked);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <Mail className="h-5 w-5 text-muted-foreground" />
        <div>
          <Label htmlFor="digest-toggle" className="text-sm font-medium">
            Daily email digest
          </Label>
          <p className="text-xs text-muted-foreground">
            Get new papers from your watchlists emailed to you every morning.
          </p>
        </div>
      </div>
      <Switch
        id="digest-toggle"
        checked={isEnabled}
        onCheckedChange={handleToggle}
        disabled={loading}
      />
    </div>
  );
}
