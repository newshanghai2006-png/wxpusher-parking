import QRCode from "qrcode";
import { mountIcons } from "./icons.js";

const COLORS = {
  green: { accent: "#16815a", soft: "#e4f3ec" },
  blue: { accent: "#2367a8", soft: "#e7f0f8" },
  amber: { accent: "#c56a19", soft: "#faeee2" },
  mono: { accent: "#232826", soft: "#eceeed" },
};

const form = document.querySelector("#create-form");
const poster = document.querySelector("#poster");
const titleInput = document.querySelector("#title");
const noteInput = document.querySelector("#note");
const previewTitle = document.querySelector("#preview-title");
const previewNote = document.querySelector("#preview-note");
const tokenInput = document.querySelector("#app-token");
const toggleToken = document.querySelector("#toggle-token");
const errorBox = document.querySelector("#form-error");
const submitButton = document.querySelector("#create-button");
const result = document.querySelector("#result");
const qrFrame = document.querySelector("#qr-frame");
let publicUrl = "";

mountIcons();

form.addEventListener("input", updatePreview);
form.addEventListener("submit", createCard);
toggleToken.addEventListener("click", () => {
  tokenInput.type = tokenInput.type === "password" ? "text" : "password";
  toggleToken.innerHTML = `<i data-lucide="${tokenInput.type === "password" ? "eye" : "eye-off"}"></i>`;
  mountIcons();
});
document.querySelector("#download-button").addEventListener("click", downloadPoster);
document.querySelector("#print-button").addEventListener("click", () => window.print());

function values() {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

function updatePreview() {
  const data = values();
  previewTitle.textContent = data.title || "临时停车，请联系车主";
  previewNote.textContent = data.note || "给您带来不便，十分抱歉";
  poster.dataset.theme = data.theme || "green";
  poster.dataset.style = data.style || "clean";
  if (publicUrl) renderQr(publicUrl);
}

async function createCard(event) {
  event.preventDefault();
  errorBox.textContent = "";
  submitButton.disabled = true;
  submitButton.querySelector("span")?.remove();
  const original = submitButton.innerHTML;
  submitButton.textContent = "正在生成...";

  try {
    const response = await fetch("/api/cards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values()),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "生成失败，请稍后重试");

    publicUrl = `${location.origin}/p/${data.id}`;
    const manageUrl = `${location.origin}/manage/${data.id}#key=${encodeURIComponent(data.ownerSecret)}`;
    await renderQr(publicUrl);
    const link = document.querySelector("#manage-link");
    link.href = manageUrl;
    link.textContent = manageUrl;
    result.hidden = false;
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    errorBox.textContent = error.message;
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = original;
    mountIcons();
  }
}

async function renderQr(url) {
  const data = values();
  const colors = COLORS[data.theme] || COLORS.green;
  qrFrame.replaceChildren();
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, url, {
    width: 640,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: colors.accent, light: "#ffffff" },
  });
  qrFrame.append(canvas);
}

async function downloadPoster() {
  if (!publicUrl) return;
  const data = values();
  const colors = COLORS[data.theme] || COLORS.green;
  const bold = data.style === "bold";
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const context = canvas.getContext("2d");
  context.fillStyle = bold ? colors.accent : "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = bold ? "#ffffff" : colors.accent;
  roundRect(context, 558, 120, 124, 14, 7);
  context.fill();
  context.textAlign = "center";
  context.font = "700 28px Microsoft YaHei, sans-serif";
  context.fillText("PARKING NOTICE", 620, 205);

  context.fillStyle = bold ? "#ffffff" : "#17211d";
  context.font = "700 68px Microsoft YaHei, sans-serif";
  drawWrappedText(context, data.title, 620, 315, 990, 88, 2);

  context.fillStyle = bold ? "rgba(255,255,255,.8)" : "#69766f";
  context.font = "400 34px Microsoft YaHei, sans-serif";
  drawWrappedText(context, data.note, 620, 500, 940, 52, 2);

  context.fillStyle = "#ffffff";
  roundRect(context, 275, 655, 690, 690, 22);
  context.fill();
  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, publicUrl, {
    width: 620,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: colors.accent, light: "#ffffff" },
  });
  context.drawImage(qrCanvas, 310, 690, 620, 620);

  context.fillStyle = bold ? "#ffffff" : colors.accent;
  context.font = "700 38px Microsoft YaHei, sans-serif";
  context.fillText("手机浏览器或支付宝或者微信扫码，绝无恶意程序，一键提醒车主", 620, 1435);
  context.strokeStyle = bold ? "rgba(255,255,255,.3)" : "#dce4df";
  context.beginPath();
  context.moveTo(150, 1530);
  context.lineTo(1090, 1530);
  context.stroke();
  context.fillStyle = bold ? "rgba(255,255,255,.7)" : "#718078";
  context.font = "400 25px Microsoft YaHei, sans-serif";
  context.fillText("隐私联系 · 即时通知", 620, 1605);

  const link = document.createElement("a");
  link.download = "挪车二维码.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const characters = Array.from(text || "");
  const lines = [];
  let line = "";
  for (const character of characters) {
    if (context.measureText(line + character).width > maxWidth && line) {
      lines.push(line);
      line = character;
    } else {
      line += character;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}
