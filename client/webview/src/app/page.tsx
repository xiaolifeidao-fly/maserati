"use client";

import { Spin } from "antd";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { hasValidSession } from "@/utils/auth";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const authenticated = await hasValidSession();
      router.replace(authenticated ? "/workspace" : "/login");
    })();
  }, [router]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <Spin size="large" />
    </div>
  );
}
