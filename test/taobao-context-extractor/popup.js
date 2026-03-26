const extractButton = document.querySelector("#extractButton");
const statusNode = document.querySelector("#status");

function setStatus(message, tone = "") {
  statusNode.textContent = message;
  statusNode.className = `status${tone ? ` is-${tone}` : ""}`;
}

async function handleExtract() {
  extractButton.disabled = true;
  setStatus("正在提取当前页面数据，请稍候...");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "extract-page-data",
    });

    if (!response?.ok) {
      throw new Error(response?.error || "提取失败。");
    }

    const fileLabel = response.filename || "target.json";
    setStatus(`提取完成，已开始下载 ${fileLabel}。`, "success");
  } catch (error) {
    setStatus(error.message || "提取失败。", "error");
  } finally {
    extractButton.disabled = false;
  }
}

extractButton.addEventListener("click", handleExtract);
