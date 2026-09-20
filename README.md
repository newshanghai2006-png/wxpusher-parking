# 挪车码

一个可部署到 Cloudflare Workers 的免费挪车二维码工具。车主填写自己的 WxPusher UID 和 AppToken 后生成二维码；访客扫码即可匿名向车主发送微信提醒。

## 功能

- 自定义标题、说明、主题色和海报版式
- 下载高清 PNG 或直接打印 A4 海报
- 二维码中只包含随机页面地址，不包含 UID、AppToken 或手机号
- AppToken 使用 AES-GCM 加密后存入 Cloudflare D1
- 独立管理链接可修改文案、查看提醒次数或让二维码失效
- D1 原子更新实现发送冷却，默认 60 秒内只允许成功触发一次
- Worker、静态页面和 D1 都可使用 Cloudflare 免费额度

## 本地运行

要求 Node.js 20 或更高版本。

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
# 编辑 .dev.vars，设置至少 16 个字符的 ENCRYPTION_KEY
npm run build
npm run db:local
npm run dev
```

Wrangler 默认会显示本地访问地址，通常是 `http://localhost:8787`。

## 通过 Cloudflare 网页控制台部署

本项目是“Worker API + Worker Static Assets + D1”的全栈 Worker，不是纯静态 Pages 项目。虽然入口名称是 **Workers & Pages**，创建时应选择 **Import a repository**，不要选择仅上传静态文件的 Pages Direct Upload，否则扫码通知 API 无法运行。

下面以 GitHub 为例，整个 Cloudflare 配置过程都可以在网页中完成。

开始前需要一个 Cloudflare 账户和一个 GitHub 或 GitLab 账户。Worker、静态资源和 D1 均可从免费套餐开始使用；实际免费额度以 Cloudflare 控制台显示的当前套餐为准。

### 1. 准备代码仓库

1. 登录 GitHub，新建一个仓库，例如 `wxpusher-parking`。私有仓库也可以。
2. 将本目录中的项目文件上传到仓库根目录，包括 `client`、`migrations`、`public`、`src`、`test`、`package.json`、`package-lock.json` 和 `wrangler.jsonc` 等。
3. 不要上传以下本地文件或目录：
   - `.dev.vars`：包含本地开发密钥
   - `node_modules`
   - `.wrangler`
   - `artifacts`
   - `__pycache__`
4. 确认在 GitHub 打开仓库时，可以直接看到 `package.json` 和 `wrangler.jsonc`。如果仓库根目录下还有一层 `wxpusher` 文件夹，后面需要把 Cloudflare 的 **Root directory** 设置为 `wxpusher`。

`.gitignore` 已排除上述本地文件。使用 GitHub 网页拖放文件时仍应人工确认，因为网页上传不一定遵循本地 `.gitignore`。

### 2. 在网页中创建 D1 数据库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 在左侧进入 **Storage & databases → D1 SQL database**。部分界面会直接显示为 **D1**。
3. 单击 **Create database**。
4. Database name 填写 `wxpusher-parking`。
5. Location 可保持自动选择，或选择距离主要用户较近的区域。
6. 单击 **Create**。
7. 进入刚创建的数据库，在 Overview 页面复制 **Database ID**。它是一串 UUID，例如 `12345678-abcd-...`。

### 3. 初始化数据库表

进入 D1 数据库的 **Console** 标签，将下面的 SQL 完整粘贴进去，然后单击 **Execute**：

```sql
CREATE TABLE IF NOT EXISTS parking_cards (
  id TEXT PRIMARY KEY,
  owner_secret_hash TEXT NOT NULL,
  uid TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'green',
  style TEXT NOT NULL DEFAULT 'clean',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_sent_at INTEGER,
  send_count INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_parking_cards_updated_at
  ON parking_cards(updated_at);
```

执行后打开 **Tables**，应能看到 `parking_cards` 表。此 SQL 与 [`migrations/0001_initial.sql`](migrations/0001_initial.sql) 相同，重复执行不会删除已有数据。

### 4. 在 GitHub 中填写 Database ID

1. 在 GitHub 仓库中打开 `wrangler.jsonc`，单击铅笔图标编辑。
2. 找到：

```json
"database_id": "REPLACE_WITH_YOUR_D1_DATABASE_ID"
```

3. 将占位内容替换为第 2 步复制的真实 Database ID，然后提交修改。
4. 不要修改绑定名称 `"binding": "DB"`，Worker 代码使用 `env.DB` 访问数据库。

如果没有替换占位值，Cloudflare 首次部署会在 D1 绑定阶段失败。

### 5. 从 Git 仓库创建 Worker

1. 在 Cloudflare 左侧进入 **Workers & Pages**。
2. 单击 **Create application**。
3. 在 **Import a repository** 旁单击 **Get started**。
4. 首次使用时，授权 Cloudflare 访问 GitHub 或 GitLab。可以只授权刚创建的仓库。
5. 选择代码仓库和生产分支，通常是 `main`。
6. 填写构建配置：

| 配置项 | 值 |
| --- | --- |
| Project/Worker name | `wxpusher-parking` |
| Production branch | `main` |
| Root directory | 仓库根目录部署时留空；如果代码位于仓库的 `wxpusher` 子目录则填 `wxpusher` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | 保持默认 `npx wrangler versions upload` |

7. Build variables 可以留空。**不要把 `ENCRYPTION_KEY` 填在 Build variables 中**，那里只在构建期间有效，Worker 运行时无法读取。
8. 单击 **Save and Deploy**。

Cloudflare 会执行依赖安装、前端打包和 Worker 部署。成功后会给出类似 `https://wxpusher-parking.<账户子域>.workers.dev` 的地址。第一次部署时尚未添加加密密钥，因此先不要创建正式二维码。

### 6. 添加运行时加密密钥

`ENCRYPTION_KEY` 用于加密 D1 中的 WxPusher AppToken。建议使用密码管理器生成至少 32 个随机字符，不要使用姓名、域名或常用密码，也不要使用 WxPusher AppToken 本身。

1. 进入 **Workers & Pages → wxpusher-parking → Settings**。
2. 找到 **Variables and Secrets**，单击 **Add**。
3. Type 选择 **Secret**，不要选择普通 Text variable。
4. Variable name 填写 `ENCRYPTION_KEY`。
5. Value 填写生成的随机密钥。
6. 单击 **Deploy** 使 Secret 生效。

Cloudflare 保存后不会再次显示 Secret 原文。请将它存入密码管理器并长期保留。更换或丢失该密钥后，已经保存到 D1 的 AppToken 将无法解密，旧二维码也就无法发送通知。

### 7. 检查 D1 绑定和运行变量

进入 Worker 的 **Settings → Bindings**，确认存在以下绑定：

| 类型 | Variable name | 目标/值 |
| --- | --- | --- |
| D1 database | `DB` | `wxpusher-parking` |
| Secret | `ENCRYPTION_KEY` | 显示为已加密/隐藏 |
| Environment variable | `SEND_COOLDOWN_SECONDS` | `60` |

正常情况下 `wrangler.jsonc` 会在部署时自动创建 D1 绑定和 `SEND_COOLDOWN_SECONDS`。如果 `DB` 不存在，可在 **Bindings → Add binding → D1 database** 中手动添加，Variable name 必须严格填写 `DB`，然后选择 `wxpusher-parking` 数据库并重新部署。

### 8. 开启 workers.dev 地址并验证

1. 进入 Worker 的 **Settings → Domains & Routes**。
2. 确认 `workers.dev` 路由已经启用；未启用时单击对应的启用按钮。
3. 打开 Worker 地址，首页应显示“做一张真正好用的挪车码”。
4. 使用自己的 WxPusher UID 和 AppToken 创建一个测试二维码。
5. 保存页面给出的管理链接。管理链接只显示一次，丢失后无法管理该二维码。
6. 用另一部手机扫描二维码，单击“通知车主挪车”，确认收到 WxPusher 提醒。
7. 打开管理链接，确认可以修改文案并看到累计提醒次数。

建议先完成上述验证，再下载和打印正式二维码。

### 9. 绑定自己的域名（可选）

域名需要已经接入同一个 Cloudflare 账户。

1. 进入 Worker 的 **Settings → Domains & Routes**。
2. 单击 **Add → Custom domain**。
3. 填写子域名，例如 `parking.example.com`。
4. 按提示确认。Cloudflare 会自动创建 DNS 记录和 HTTPS 证书。

绑定域名前生成的二维码仍指向原 `workers.dev` 地址。如果希望二维码使用自定义域名，应在域名生效后重新生成二维码。

### 10. 后续更新和数据库迁移

- 推送或在 GitHub 网页提交到 `main` 分支后，Workers Builds 会自动重新构建和部署。
- 可在 Worker 的 **Deployments/Builds** 页面查看日志、重新执行失败构建或回滚版本。
- 普通代码更新不会清空 D1 数据。
- 如果以后新增 `migrations/*.sql`，Git 自动部署不会替你执行数据库迁移。需要进入 **D1 → wxpusher-parking → Console**，按文件顺序手动执行新增 SQL。
- 不要在 `wrangler.jsonc` 中写入 `ENCRYPTION_KEY`，也不要将它提交到 GitHub。

### 常见部署问题

| 现象 | 原因与处理 |
| --- | --- |
| 构建提示 D1 database ID 无效 | `wrangler.jsonc` 仍是占位值，填写真实 Database ID 后重新部署 |
| 创建二维码时提示服务不可用 | 检查运行时 Secret `ENCRYPTION_KEY`，长度至少 16 个字符 |
| 日志出现 `DB is undefined` | D1 绑定不存在或名称不是大写的 `DB` |
| 日志出现 `no such table: parking_cards` | 尚未在 D1 Console 执行第 3 步 SQL |
| 页面能打开但通知发送失败 | 检查 UID、AppToken 是否正确，以及该 UID 是否订阅了对应的 WxPusher 应用 |
| GitHub 构建找不到 `package.json` | Root directory 设置不正确；指向实际包含 `package.json` 的目录 |
| 修改代码后线上没有变化 | 在 Builds 中确认最新提交是否构建成功，并检查 Production branch 是否为 `main` |

## 使用 Wrangler 命令行部署（备选）

如果更习惯命令行，可以使用以下流程。

1. 登录并创建 D1 数据库：

```powershell
npx wrangler login
npx wrangler d1 create wxpusher-parking
```

2. 将命令返回的 `database_id` 写入 `wrangler.jsonc`，替换 `REPLACE_WITH_YOUR_D1_DATABASE_ID`。

3. 生成并保存加密密钥。部署后不要随意更换，否则旧数据中的 AppToken 将无法解密：

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$secret = [Convert]::ToBase64String($bytes)
$secret | npx wrangler secret put ENCRYPTION_KEY
```

4. 执行远程迁移并部署：

```powershell
npm run db:remote
npm run deploy
```

部署完成后，Wrangler 会返回一个 `workers.dev` 地址。也可以在 Cloudflare 控制台为 Worker 绑定自定义域名。

## 配置

`wrangler.jsonc` 中的 `SEND_COOLDOWN_SECONDS` 控制同一个二维码两次成功提醒之间的最短时间，可设置为 30 到 3600 秒。

生产环境若公开给大量陌生用户使用，建议继续接入 Cloudflare Turnstile，并通过 WAF 对 `/api/cards` 和 `/api/cards/*/notify` 增加速率限制。当前实现已经有单二维码冷却，但它不能替代全站级反滥用策略。

## 安全说明

- 管理密钥只存在于 URL 的 hash 片段（`#key=...`），不会随页面请求发送，也不会存入 D1 明文。
- Worker 不记录 AppToken、UID 或管理密钥。
- 创建二维码时不会主动发送测试消息；建议打印前用另一部手机扫码验证一次。
- `.dev.vars` 已加入 `.gitignore`，不要将真实凭据提交到代码仓库。
- 旧版 `notice_wxpusher.py` 已改用 `WXPUSHER_APP_TOKEN` 和 `WXPUSHER_UID` 环境变量。
