"use client";

import { CollectionWorkspaceRightPanelPage } from "../../(console)/collection/components/CollectionTestingPanel";

export default function CollectionWorkspaceRightPage() {
  return (
    <main
      style={{
        height: "100vh",
        padding: "12px 10px",
        background: "linear-gradient(160deg, #f0f4ff 0%, #f8fafc 60%, #eef2f8 100%)",
        display: "flex",
        flexDirection: "column",
        // overflow: "hidden",
      }}
    >
      <CollectionWorkspaceRightPanelPage />
    </main>
  );
}
