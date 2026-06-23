# Bangumi Lens

Bangumi Lens 是一个面向 Bangumi 动画章节的评论区复盘工具。它可以解析公开的 Bangumi 单集页面，聚合评论、楼中楼回复、单集评分、条目评分和少量公开网页线索，并调用兼容 OpenAI Chat Completions 的 DeepSeek API 生成结构化中文报告。

适合在看完一集动画后快速回顾讨论氛围：大家主要在聊什么、哪些细节被反复提到、哪些观点形成共鸣、是否存在原作或后续剧情剧透风险，以及本集在整部作品中的观感走势。

## 主要功能

- 支持直接粘贴 Bangumi 章节链接，例如 `https://bgm.tv/ep/123456`。
- 支持输入作品名搜索 Bangumi 动画条目，再选择具体话数生成报告。
- 解析公开章节页，提取章节标题、所属条目、集数、简介、评论和楼中楼内容。
- 获取单集评分分布，并在可用时补充整部作品的条目评分作为背景参照。
- 根据评论长度、信息量词汇和讨论上下文计算评论权重。
- 结合公开网页检索结果，为场外制作信息提供辅助线索。
- 通过 DeepSeek API 流式生成结构化中文报告，前端会展示实时生成进度。
- 报告包含剧情简述、评论区观点总结、讨论热点、共鸣吐槽、本集小细节、场外制作信息和剧透风险。
- 自动保存本地报告历史，支持按作品归档回看、收藏、删除、清空本地数据。
- 支持上一集、下一集和缺失报告生成入口，便于连续补齐同一作品的报告。
- 基于本地历史生成作品观感趋势，并可调用模型进一步精炼整季趋势总结。
- 支持章节标题和作品标题的中文补全：优先使用 Bangumi 官方中文名，缺失时可确认后调用模型翻译。
- 提供 Tampermonkey / Violentmonkey 用户脚本，可从 Bangumi 单集页面一键打开本地分析。
- 支持日间和夜间主题。

## 技术栈

- Next.js 14
- React 18
- TypeScript
- Cheerio
- OpenAI SDK，用于兼容 DeepSeek 的 Chat Completions API
- Zod，用于校验模型返回的 JSON 报告结构
- lucide-react，用于前端图标
- Node.js `node:test`，用于项目内测试

## 项目结构

```text
app/
  api/
    analyze/                 # 抓取、加权、检索并流式生成单集报告
    episode-translation/     # 章节标题中文补全
    history/                 # 本地报告历史读写、收藏、删除、清空
    history/status/          # 检查章节是否已有本地报告
    search/                  # Bangumi 动画条目搜索
    season-trends/           # 基于本地报告生成作品趋势数据
    season-trends/summary/   # 调用模型精炼作品趋势总结
    subject-info/            # 获取 Bangumi 条目和话数信息
    subject-translation/     # 作品标题中文补全
  components/
    bangumi-lens-app.tsx     # 主应用界面和交互逻辑
    confirm-dialog.tsx       # 通用确认弹窗
  home/page.tsx              # 首页路由占位，实际界面由根布局挂载
  reports/[id]/page.tsx      # 本地报告详情路由占位
  summary/[id]/page.tsx      # 摘要路由占位
  globals.css                # 全局样式和主题
  layout.tsx                 # 应用布局和元数据
lib/
  bangumi.ts                 # Bangumi 页面、条目、话数和评分解析
  episode-availability.ts    # 话数可用性判断
  history-store.ts           # 本地报告历史存储
  logger.ts                  # 本地运行日志
  proxy.ts                   # 服务端代理配置
  report.ts                  # 模型调用、报告解析、标题翻译、趋势总结
  report-prompt.ts           # 提示词配置加载
  report-stats.ts            # 报告统计信息
  season-trends.ts           # 整季趋势数据构建
  server-cache.ts            # 本地磁盘缓存
  subject-info-cache.ts      # 条目信息缓存规则
  types.ts                   # 共享类型
  url.ts                     # Bangumi 链接规范化
  web-search.ts              # 公开网页检索辅助上下文
  weights.ts                 # 评论权重计算
config/
  app.json                   # 本地服务端口
  report-prompt.json         # 报告生成提示词
  .env.example               # 环境变量示例
public/
  bangumi-lens.user.js       # Bangumi 页面入口用户脚本
scripts/
  dev-server.mjs             # 读取本地配置后启动 Next.js
test/                        # node:test 测试
data/                        # 本地报告和缓存，运行后生成
logs/                        # 本地运行日志，运行后生成
```

## 本地运行

安装依赖：

```bash
npm install
```

复制环境变量示例文件：

```bash
copy config\.env.example config\.env.local
```

在 `config/.env.local` 中填写 DeepSeek API Key：

```bash
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
BANGUMI_USER_AGENT=your-bangumi-id/bangumi-lens/0.1.0 (https://github.com/local/bangumi-lens)
BANGUMI_ACCESS_TOKEN=your-bangumi-access-token
```

启动开发服务器：

```bash
npm run dev
```

如需用图形界面统一启动、重启、停止本地服务并查看端口、进程号和日志，请使用上级目录的全局服务管理器：

```bash
cd ..\service-manager
npm run desktop
```

打开：

```text
http://localhost:3000/home
```

默认端口配置在 `config/app.json`：

```json
{
  "server": {
    "port": 3000
  }
}
```

修改端口后需要重启开发服务器。

## 使用方式

### 直接分析章节链接

在首页输入 Bangumi 章节链接：

```text
https://bgm.tv/ep/123456
```

点击生成后，应用会抓取公开页面、解析评论和评分、补充公开网页线索，再流式生成报告。报告生成完成后会自动保存到本地历史。

也可以通过 URL 参数直接打开并自动进入分析流程：

```text
http://localhost:3000/home?url=https%3A%2F%2Fbgm.tv%2Fep%2F123456
```

### 搜索作品并选择话数

输入作品名时，应用会调用 Bangumi 搜索动画条目。选择作品后，可以查看主线话数列表，选择单集生成报告。对于已有本地报告的话数，应用会提示查看旧报告或重新生成。

### 批量补齐报告

在作品话数列表和趋势视图中，应用会根据本地历史识别缺失报告。确认后可以串行生成选中话数或缺失话数报告，用于补齐同一作品的观感记录。

### 查看历史和趋势

左侧历史会按作品归档本地报告。报告详情页支持收藏、删除、上一集和下一集导航。对于同一作品的多集报告，应用可以生成趋势数据，并可调用模型输出一段更自然的中文趋势总结。

## 从 Bangumi 页面打开

仓库提供了一个 Tampermonkey / Violentmonkey 用户脚本：

```text
public/bangumi-lens.user.js
```

使用方式：

1. 启动本地服务：`npm run dev`。
2. 在浏览器用户脚本管理器中新建脚本，粘贴 `public/bangumi-lens.user.js` 的内容并保存。
3. 打开任意 Bangumi 章节页，例如 `https://bgm.tv/ep/123456`。
4. 点击页面标题旁的 `Bangumi Lens 分析` 按钮，脚本会打开 `http://localhost:3000/home?url=...`。

如果应用部署在其他地址，修改脚本中的 `APP_URL`。如果修改了 `config/app.json` 里的本地端口，也需要同步修改用户脚本中的 `APP_URL`。

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | 是 | 无 | DeepSeek API Key。代码中也兼容 `OPENAI_API_KEY` 作为兜底。 |
| `DEEPSEEK_MODEL` | 否 | `deepseek-v4-flash` | 用于生成报告、标题翻译和趋势总结的模型名。 |
| `DEEPSEEK_BASE_URL` | 否 | `https://api.deepseek.com` | DeepSeek API 地址。 |
| `BANGUMI_USER_AGENT` | 否 | `local/bangumi-lens/0.1.0 (https://github.com/local/bangumi-lens)` | 服务端外部请求使用的 User Agent。Bangumi 建议非浏览器 API 使用者指定开发者个人 ID 和应用名；建议把 `local` 替换为你的 Bangumi 开发者/用户 ID，并保留应用名、版本号和项目主页。 |
| `BANGUMI_ACCESS_TOKEN` | 否 | 无 | Bangumi access token。配置后，服务端请求 `api.bgm.tv` 时会附带 `Authorization: Bearer ...`，用于获取账号可见的受限/NSFW API 数据。不会用于 Bangumi HTML 页面抓取。 |
| `BANGUMI_LENS_PROXY` | 否 | 无 | 服务端请求 Bangumi、评分接口、网页检索和模型 API 时使用的 HTTP/HTTPS 代理。 |

如果浏览器可以访问外网，但应用生成时提示 `fetch failed`，通常是 Node.js 没有读取系统代理。可以在 `config/.env.local` 中加入：

```bash
BANGUMI_LENS_PROXY=http://127.0.0.1:7897
```

请按本机代理软件的实际端口调整地址。

## 应用配置

`scripts/dev-server.mjs` 会在启动 Next.js 前读取：

- `config/app.json`：读取 `server.port`，供 `npm run dev` 和 `npm run start` 使用。
- `config/.env.local`：加载本地环境变量，不需要放到系统环境变量里。

提示词配置放在 `config/report-prompt.json`：

- `system`：系统提示词，可使用 `{{responseJsonSchema}}` 占位符，运行时会替换为报告 JSON 结构要求。
- `task`：发送给模型的分析任务说明，可调整报告口吻、长度、栏目数量和引用规则。

修改配置后需要重启开发服务器。建议保留合法 JSON、字段名和引用来源相关要求，否则模型输出可能无法通过结构校验。

## 可用脚本

```bash
npm run dev
```

启动 Next.js 开发服务器。


```bash
npm run build
```

构建生产版本。

```bash
npm run start
```

启动已构建的生产版本。

```bash
npm test
```

运行项目测试。

```bash
npm run lint
```

运行 Next.js ESLint 检查。

## 报告内容

生成报告通常包含：

- 单集剧情简述：整理本集已经发生的主要事件、角色行动和冲突推进。
- 评论区观点总结：归纳主流评价、争议点、少数但有信息量的看法，并结合评分信号判断整体接受度。
- 讨论热点：聚合被回复、被引用或被集中讨论的话题。
- 共鸣吐槽：整理短评中反复出现的情绪点。
- 本集小细节：提取评论区提到的台词、演出、分镜、作画、背景物件等细节。
- 场外制作信息：结合公开网页检索结果，补充制作组、官方公告、访谈或制作说明线索。
- 剧透风险：把可能涉及原作、后续剧情或未确认推测的信息单独列出。

模型输出会经过 JSON 结构校验。如果模型没有返回合法结构，应用会报错，而不是展示不完整报告。

## 本地数据

- 报告历史保存在 `data/reports/`。
- `data/reports/index.json` 保存轻量历史索引。
- `data/reports/items/*.json` 保存完整报告内容。
- 搜索结果、条目信息和标题翻译缓存保存在 `data/cache/`。
- 运行日志保存在 `logs/`。
- 旧版 `data/reports.json` 会在首次读取时迁移到新的 `data/reports/` 结构。

这些文件都是本地运行数据，不需要提交到仓库。

## 数据与隐私

- 应用的 Bangumi 官方 API 请求可以通过 `BANGUMI_ACCESS_TOKEN` 携带 access token，以获取该账号可见的受限/NSFW API 数据。
- 应用会通过 `BANGUMI_USER_AGENT` 为服务端请求设置明确 User Agent，避免使用请求库默认 UA。
- 应用抓取章节评论时仍是服务端请求 Bangumi HTML 页面，不会模拟登录浏览器，也不会读取浏览器 Cookie。
- 报告生成需要把解析后的公开评论摘要、评分信号和网页检索摘要发送给你配置的模型 API 服务。
- 标题翻译和整季趋势总结只有在需要模型能力并经前端确认或触发后才会调用模型 API。
- 清空本地数据会删除本机保存的报告历史和缓存，不会影响 Bangumi 上的任何内容。

## 注意事项

- Bangumi 页面结构如果发生变化，评论解析可能需要更新。
- 部分章节公开评论较少时，报告的信息量会受限。
- 单集评分和条目评分来自公开接口或页面解析结果，可能因为接口不可用而缺失。
- 场外制作信息依赖公开网页检索结果，应用会要求模型标注不确定线索，但关键事实仍建议人工核对。
- 剧透风险由模型根据评论和上下文判断，不能保证覆盖所有潜在剧透。

## 常见问题

### 提示缺少 `DEEPSEEK_API_KEY`

确认 `config/.env.local` 存在，并且包含：

```bash
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
```

修改环境变量后需要重启开发服务器。

### 提示 `fetch failed`

通常表示服务端请求 Bangumi、评分接口、网页检索或模型 API 失败。请检查网络和代理配置，并确认 `BANGUMI_LENS_PROXY` 指向可用代理地址。

### 搜索不到作品

可能原因包括：

- 搜索词少于 2 个字符。
- Bangumi 搜索接口暂时不可用。
- 作品标题需要更完整的中文名、日文名或别名。
- 当前网络或代理无法访问 `api.bgm.tv`。

### 没有解析到公开评论

可能原因包括：

- 链接不是 Bangumi 章节页。
- 该章节没有公开评论。
- Bangumi 页面结构发生变化。
- 当前网络拿到的页面内容不完整。

### 报告生成到一半失败

可能是模型 API 限速、额度不足、返回内容不是合法 JSON，或网络连接中断。可以稍后重试，或检查 API Key 的余额、额度和账单设置。

## 开发说明

单集分析主流程位于 `app/api/analyze/route.ts`：

1. 校验并规范化 Bangumi 章节链接。
2. 抓取章节页面、条目信息、话数导航和评分信息。
3. 给评论计算权重并构建模型输入摘要。
4. 获取公开网页检索辅助上下文。
5. 调用 DeepSeek 进行流式生成。
6. 校验并解析模型返回的 JSON。
7. 返回包含元数据、统计信息和报告内容的结构化结果。

本地历史由 `app/api/history/route.ts` 和 `lib/history-store.ts` 管理。历史列表读取 `data/reports/index.json`，打开单条历史时再读取对应的 `data/reports/items/*.json`。搜索、条目信息和翻译缓存由 `lib/server-cache.ts` 管理。
