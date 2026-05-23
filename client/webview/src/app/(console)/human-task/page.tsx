import { HumanTaskWorkbench } from "./components/HumanTaskWorkbench";

export default function HumanTaskPage() {
  return (
    <div className="manager-shell-card" style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <strong style={{ fontSize: 16 }}>任务工作台</strong>
        <span style={{ marginLeft: 12, color: "var(--manager-text-soft)", fontSize: 13 }}>
          处理 AI 运营过程中产生的人工干预任务
        </span>
      </div>
      <HumanTaskWorkbench />
    </div>
  );
}
