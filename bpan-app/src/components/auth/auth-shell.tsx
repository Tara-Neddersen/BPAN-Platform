"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

type AuthShellProps = {
  mode: "login" | "signup";
  children: ReactNode;
};

export function AuthShell({ mode, children }: AuthShellProps) {
  const isLogin = mode === "login";

  return (
    <div className="native-preview relative min-h-screen overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(64,112,126,0.08)_1px,transparent_1px)] [background-size:26px_26px]" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <section className="relative w-full max-w-xl rounded-3xl border border-white/75 bg-white/76 p-4 shadow-[0_26px_56px_-34px_rgba(15,23,42,0.38)] backdrop-blur-2xl sm:p-6">
          <div className="space-y-5">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-white/75 bg-white/84 px-4 py-2 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)]">
                <BrandLogo
                  className="h-10 w-10"
                  imageClassName="drop-shadow-[0_4px_8px_rgba(15,23,42,0.12)]"
                  fallbackClassName="shadow-lg shadow-slate-900/20"
                  alt="LabLynk logo"
                />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">LabLynk</p>
                  <p className="text-sm text-slate-700">Neuro care + research workspace</p>
                </div>
              </div>

              <div>
                <h1 className="text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
                  {isLogin ? "Welcome back to the lab." : "Create your LabLynk workspace."}
                </h1>
                <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
                  Track care workflows, monitor outcomes, and keep neuroplasticity insights in one place with a calmer, clearer interface.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-left">
                <div className="rounded-2xl border border-white/70 bg-white/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Workflow</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">Care + research aligned</p>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/70 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Signal</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">From EEG to insights</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/75 bg-white/84 p-2 shadow-[0_10px_28px_-24px_rgba(15,23,42,0.42)]">
              {children}
            </div>

            <div className="flex justify-end">
              <Link
                href={isLogin ? "/auth/signup" : "/auth/login"}
                className="rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-white"
              >
                {isLogin ? "Need an account?" : "Already signed up?"}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
