"use client";

import { CollectionWorkspaceRightPanel } from "../../(console)/collection/components/CollectionTestingPanel";

export default function CollectionWorkspaceRightPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 14,
        background: "linear-gradient(180deg, #eef2f6 0%, #f8fafc 100%)",
      }}
    >
      <CollectionWorkspaceRightPanel />
    </main>
  );
}
