"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  alt?: string;
};

export function BrandLogo({
  className,
  imageClassName,
  fallbackClassName,
  alt = "BPAN Platform logo",
}: BrandLogoProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {!failed ? (
        <Image
          src="/illustrations/platform-logo.png"
          alt={alt}
          fill
          unoptimized
          sizes="64px"
          className={cn("object-contain", imageClassName)}
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full items-center justify-center rounded-xl bg-[linear-gradient(135deg,#62afc4,#3f8ea4)] text-white font-bold",
            fallbackClassName,
          )}
        >
          B
        </div>
      )}
    </div>
  );
}
