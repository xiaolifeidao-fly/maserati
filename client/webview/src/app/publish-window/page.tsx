"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProductPublishModal } from "@/app/(console)/product/components/ProductPublishModal";

/**
 * PublishWindowContent — 在 Electron BrowserView 内渲染发布弹窗。
 *
 * 此页面作为发布 BrowserWindow 的左侧视图加载，
 * 复用 ProductPublishModal 组件，以全屏弹出样式呈现。
 * onCancel 时关闭当前窗口（window.close()）。
 */
function PublishWindowContent() {
  const searchParams = useSearchParams();
  const batchId = Number(searchParams?.get("batchId") || 0);
  const entrySceneParam = searchParams?.get("entryScene");
  const entryScene = entrySceneParam === "collection" ? "collection" : "product";
  const initialViewParam = searchParams?.get("initialView");
  const initialView = initialViewParam === "progress" ? "progress" : "default";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      {mounted ? (
        <ProductPublishModal
          open={true}
          onCancel={() => {
            if (typeof window !== "undefined") {
              window.close();
            }
          }}
          initialBatchId={batchId}
          initialEntryScene={entryScene}
          initialView={initialView}
        />
      ) : null}
      <style jsx global>{`
        /* 让 Modal 充满整个 BrowserView 窗口 */
        body {
          margin: 0;
          overflow: hidden;
          background: var(--manager-bg, #f0f4ff);
        }
        /* 去掉遮罩 */
        .ant-modal-mask {
          display: none !important;
        }
        /* 弹窗铺满，去掉默认的居中定位 */
        .manager-publish-modal .ant-modal {
          top: 0 !important;
          padding-bottom: 0 !important;
          margin: 0 auto !important;
          max-width: 100vw !important;
        }
        .manager-publish-modal .ant-modal-content {
          min-height: 100vh;
          border-radius: 0;
        }
        /* 隐藏右上角关闭按钮（通过 onCancel 关闭窗口） */
        .manager-publish-modal .ant-modal-close {
          display: none;
        }
      `}</style>
    </>
  );
}

export default function PublishWindowPage() {
  return (
    <Suspense>
      <PublishWindowContent />
    </Suspense>
  );
}
