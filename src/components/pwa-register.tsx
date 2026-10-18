"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register(`/sw.js?build=${encodeURIComponent(process.env.NEXT_PUBLIC_OFFLINE_BUILD??'v4')}`,{updateViaCache:'none'}).catch(() => undefined);
    }
  }, []);
  return null;
}
