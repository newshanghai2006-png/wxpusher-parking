import { mountIcons } from "./icons.js";

const id = location.pathname.split("/").filter(Boolean).at(-1);
const secret = new URLSearchParams(location.hash.slice(1)).get("key") || "";
const loading = document.querySelector("#manage-loading");
const content = document.querySelector("#manage-content");
const form = document.querySelector("#manage-form");
const errorBox = document.querySelector("#manage-error");

mountIcons();
loadCard();
form.addEventListener("submit", updateCard);
document.querySelector("#delete-button").addEventListener("click", deleteCard);

async function loadCard() {
  if (!secret) return showFatal("管理链接缺少密钥，请使用创建时保存的完整链接。");
  try {
    const response = await api(`/api/cards/${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "管理链接无效");
    form.elements.title.value = data.title;
    form.elements.note.value = data.note;
    form.elements.style.value = data.style;
    form.elements.theme.value = data.theme;
    document.querySelector("#stat-count").textContent = data.sendCount;
    document.querySelector("#stat-last").textContent = data.lastSentAt
      ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(data.lastSentAt)
      : "尚未";
    document.querySelector("#stat-uid").textContent = data.uid;
    document.querySelector("#public-link").href = `/p/${id}`;
    loading.hidden = true;
    content.hidden = false;
  } catch (error) {
    showFatal(error.message);
  }
}

async function updateCard(event) {
  event.preventDefault();
  errorBox.textContent = "";
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const response = await api(`/api/cards/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "保存失败");
    errorBox.style.color = "#0f6747";
    errorBox.textContent = "修改已保存。二维码地址不变，无需重新打印。";
  } catch (error) {
    errorBox.style.color = "";
    errorBox.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
}

async function deleteCard() {
  if (!confirm("永久删除后，已经打印的二维码将立即失效。确定删除吗？")) return;
  const button = document.querySelector("#delete-button");
  button.disabled = true;
  try {
    const response = await api(`/api/cards/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "删除失败");
    location.replace("/");
  } catch (error) {
    errorBox.textContent = error.message;
    button.disabled = false;
  }
}

function api(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
      ...options.headers,
    },
  });
}

function showFatal(message) {
  loading.textContent = message;
  loading.style.color = "#a93232";
}
