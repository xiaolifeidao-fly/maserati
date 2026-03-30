"use client";

import { CollectionManagementSimplePanel } from "./components/CollectionManagementSimplePanel";
import { CollectionTestingPanel } from "./components/CollectionTestingPanel";

export default function CollectionPage() {
  return (
    <>
      <CollectionTestingPanel />
      <CollectionManagementSimplePanel />
    </>
  );
}
