import { mountIcons } from "./icons.js";

const id = location.pathname.split("/").filter(Boolean).at(-1);
const title = document.querySelector("#scan-title");
const note = document.querySelector("#scan-note");
const button = document.querySelector("#notify-button");
const status = document.querySelector("#scan-status");
const website = document.querySelector("#website");

mountIcons();
loadCard();
button.addEventListener("click", notifyOwner);

async function loadCard() {
  try {
    const response = await fetch(`/api/public/${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "挪车码无效");
    title.textContent = data.title;
    note.textContent = data.note;
    applyTheme(data.theme, data.style);
    button.disabled = false;
  } catch (error) {
    title.textContent = "无法使用这个挪车码";
    note.textContent = error.message;
    status.className = "scan-status error";
    status.textContent = "请直接查看车辆上是否留有其他联系方式。";
  }
}

async function notifyOwner() {
  button.disabled = true;
  const label = button.querySelector("span");
  label.textContent = "正在通知...";
  status.className = "scan-status";
  status.textContent = "正在通过 WxPusher 联系车主，请稍候。";
  try {
    const response = await fetch(`/api/cards/${encodeURIComponent(id)}/notify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ website: website.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "通知失败，请稍后重试");
    status.className = "scan-status success";
    status.textContent = "已通知车主，请稍候。感谢您的耐心等候。";
    label.textContent = "通知已发送";
  } catch (error) {
    status.className = "scan-status error";
    status.textContent = error.message;
    label.textContent = "重新通知车主";
    button.disabled = false;
  }
}

function applyTheme(theme, style) {
  const colors = {
    green: ["#16815a", "#e6f4ed"],
    blue: ["#2367a8", "#e7f0f8"],
    amber: ["#c56a19", "#faeee2"],
    mono: ["#232826", "#eceeed"],
  }[theme] || ["#16815a", "#e6f4ed"];
  document.documentElement.style.setProperty("--accent", colors[0]);
  document.documentElement.style.setProperty("--accent-dark", colors[0]);
  document.documentElement.style.setProperty("--accent-soft", colors[1]);
  if (style === "bold") document.querySelector("#scan-card").style.borderTop = `6px solid ${colors[0]}`;
}
