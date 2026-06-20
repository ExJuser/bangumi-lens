# Bangumi Lens

Bangumi Lens 是一个面向 Bangumi 单集页面的评论区复盘工具。输入公开的 Bangumi 章节链接后，应用会抓取该章节页面中的公开评论、楼中楼回复、表情和点赞等信号，结合单集评分、条目评分和少量公开网页检索结果，调用 DeepSeek API 生成一份结构化中文报告。

它适合用来快速回顾一集动画播出后的讨论氛围：大家主要在聊什么、哪些细节被反复提到、哪些观点形成了共鸣、是否存在后续剧情或原作剧透风险。

## 主要功能

- 解析 Bangumi 公开章节页，提取章节标题、所属条目、集数、简介和公开评论。
- 聚合评论区信号，包括主评论、楼中楼回复、表情反应、点赞数和回复数。
- 计算评论权重：回复数偏向讨论热点，表情和点赞偏向共鸣，评论长度与分析性词汇偏向信息量。
- 获取单集评分分布，并在可用时补充整部作品的条目评分作为参照。
- 调用 DeepSeek 生成流式报告，页面会边生成边显示进度。
- 输出剧情简述、评论区观点总结、讨论热点、共鸣吐槽、本集小细节、场外制作信息和剧透风险提示。
- 保存生成的报告到本机 `data/reports/`，索引和完整报告分开存放，方便按动画标题和集数回看。
- 支持上一集、下一集的本地报告导航；如果本地没有对应报告，可以继续生成。
- 支持日间和夜间主题。

## 技术栈

- Next.js 14
- React 18
- TypeScript
- Cheerio
- OpenAI SDK，用于兼容 DeepSeek 的 Chat Completions API
- Zod，用于校验模型返回的 JSON 报告结构
- Node.js `node:test`，用于运行项目内测试

## 项目结构

```text
app/
  api/
    analyze/        # 抓取、加权、检索并流式生成报告
    history/        # 本地报告历史读写
    subject-info/   # 获取 Bangumi 条目信息
  components/       # 前端通用组件
  page.tsx          # 主页面和交互逻辑
lib/
  bangumi.ts        # Bangumi 页面和评分解析
  report.ts         # 模型调用和报告解析
  report-prompt.ts  # 提示词配置加载
  weights.ts        # 评论权重与摘要输入构建
  history-store.ts  # 本地历史存储
  proxy.ts          # 代理配置
  web-search.ts     # 公开网页检索辅助信息
config/             # 用户可调整的配置文件
test/               # 单元测试
data/               # 本地生成的报告历史
logs/               # 运行日志
```

## 本地运行

先安装依赖：

```bash
npm install
```

复制环境变量示例文件：

```bash
copy config\.env.example config\.env.local
```

在 `config/.env.local` 中填入 DeepSeek API Key：

```bash
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

启动开发服务器：

```bash
npm run dev
```

然后在浏览器中打开：

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

修改端口后需要重启开发服务器，并打开对应的新地址。

输入 Bangumi 章节链接，例如：

```text
https://bgm.tv/ep/123456
```

也可以用 URL 参数直接打开并自动分析：

```text
http://localhost:3000/home?url=https%3A%2F%2Fbgm.tv%2Fep%2F123456
```

## 从 Bangumi 页面打开

仓库提供了一个 Tampermonkey / Violentmonkey 用户脚本，用来在 Bangumi 单集页面添加“Bangumi Lens 分析”按钮：

```text
public/bangumi-lens.user.js
```

使用方式：

1. 先启动本地服务：`npm run dev`。
2. 在浏览器的用户脚本管理器中新建脚本，粘贴 `public/bangumi-lens.user.js` 的内容并保存。
3. 打开任意 Bangumi 章节页，例如 `https://bgm.tv/ep/123456`。
4. 点击页面标题旁的“Bangumi Lens 分析”按钮，会打开 `http://localhost:3000/home?url=...` 并自动进入分析流程。

如果你的应用部署在其他地址，修改脚本里的 `APP_URL` 即可。

如果你修改了 `config/app.json` 里的本地端口，也需要把 `public/bangumi-lens.user.js` 中的 `APP_URL` 同步改成相同地址。

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `DEEPSEEK_API_KEY` | 是 | 无 | DeepSeek API Key。代码中也兼容 `OPENAI_API_KEY` 作为兜底。 |
| `DEEPSEEK_MODEL` | 否 | `deepseek-v4-flash` | 用于生成报告的模型名称。 |
| `DEEPSEEK_BASE_URL` | 否 | `https://api.deepseek.com` | DeepSeek API 地址。 |
| `BANGUMI_LENS_PROXY` | 否 | 无 | 服务端请求 Bangumi、评分接口和模型 API 时使用的 HTTP/HTTPS 代理。 |

如果 Windows 浏览器可以访问外网，但应用生成时提示 `fetch failed`，通常是 Node.js 没有读取系统代理。可以在 `config/.env.local` 中加入：

```bash
BANGUMI_LENS_PROXY=http://127.0.0.1:7897
```

请按你本机代理软件的实际端口调整地址。

## 应用配置

本地开发服务器端口放在 `config/app.json`：

- `server.port`：`npm run dev`、`npm run start` 和 `run-dev.cmd` 使用的本地端口，默认 `3000`。

修改该文件后需要重启开发服务器。用户脚本 `public/bangumi-lens.user.js` 运行在浏览器页面里，不能直接读取本地配置文件；改端口后请同步修改脚本中的 `APP_URL`。

## 提示词配置

模型提示词放在 `config/report-prompt.json`：

- `system`：系统提示词。可以使用 `{{responseJsonSchema}}` 占位符，运行时会替换为报告 JSON 结构要求。
- `task`：发送给模型的分析任务说明。可以调整报告口吻、长度、栏目数量和引用规则。

修改该文件后需要重启开发服务器。建议保留返回合法 JSON、字段名和引用来源相关要求，否则模型输出可能无法通过结构校验。

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

## 使用流程

1. 打开应用首页。
2. 粘贴 Bangumi 章节链接。
3. 点击“生成”。
4. 应用会先抓取公开页面，解析评论和评分，再调用模型生成报告。
5. 报告生成后会自动保存到本机历史记录。
6. 左侧历史栏会按动画标题归档，点击即可回看旧报告。

如果是从 Bangumi 页面上的用户脚本按钮进入，应用会自动填入当前章节链接并开始分析；如果本地已经有同一章节报告，会提示查看旧报告或重新生成。

如果同一个章节已经生成过报告，应用会提示你查看旧报告或重新生成。重新生成会用当前公开页面内容重新分析，并覆盖旧记录。

## 报告内容说明

生成报告通常包含以下部分：

- 单集剧情简述：整理本集已经发生的主要事件和冲突推进。
- 评论区观点总结：归纳主流评价、争议点、少数但有信息量的看法，以及评分信号。
- 讨论热点：聚合被回复、被引用或被集中讨论的话题。
- 共鸣吐槽：整理表情、点赞和短评中反复出现的情绪点。
- 本集小细节：提取评论区提到的台词、演出、分镜、作画、背景物件等细节。
- 场外制作信息：结合公开网页检索结果，补充制作组、官方公告或访谈线索。
- 剧透风险：把可能涉及原作、后续剧情或未确认推测的信息单独列出。

模型输出会经过 JSON 结构校验。如果模型没有返回合法结构，应用会报错而不是展示不完整报告。

## 数据与隐私

- 应用只读取公开 Bangumi 页面，不需要 Bangumi 登录态。
- 应用不会读取你的 Bangumi 私有数据。
- 生成后的报告保存在本机项目目录下的 `data/reports/`：`index.json` 只保存历史列表需要的轻量索引，完整报告存放在 `items/*.json`。
- 运行日志保存在本机项目目录下的 `logs/`。
- 报告生成需要把解析后的公开评论摘要发送给你配置的模型 API 服务。

## 注意事项

- Bangumi 页面结构如果发生变化，评论解析可能需要更新。
- 部分章节公开评论较少时，报告的信息量会受限。
- 单集评分和条目评分来自公开接口或页面解析结果，可能因为接口不可用而缺失。
- 场外制作信息依赖公开网页检索结果，应用会要求模型标注不确定线索，但仍建议人工核对关键事实。
- 剧透风险由模型根据评论和上下文判断，不能保证完全覆盖所有潜在剧透。

## 常见问题

### 提示缺少 `DEEPSEEK_API_KEY`

请确认 `config/.env.local` 存在，并且已经配置：

```bash
DEEPSEEK_API_KEY=sk-your-deepseek-api-key
```

修改环境变量后需要重启开发服务器。

### 提示 `fetch failed`

这通常表示服务端请求 Bangumi、评分接口或模型 API 失败。请检查网络和代理配置，并确认 `BANGUMI_LENS_PROXY` 指向可用代理地址。

### 没有解析到公开评论

可能原因包括：

- 链接不是 Bangumi 章节页。
- 该章节没有公开评论。
- Bangumi 页面结构发生变化。
- 当前网络拿到的页面内容不完整。

### 报告生成到一半失败

可能是模型 API 限速、额度不足、返回内容不是合法 JSON，或网络连接中断。可以稍后重试，或检查 API Key 的余额、额度和账单设置。

## 开发说明

分析请求的主流程位于 `app/api/analyze/route.ts`：

1. 校验并规范化 Bangumi 章节链接。
2. 抓取章节页面和评分信息。
3. 给评论计算权重并构建模型输入摘要。
4. 获取公开网页检索辅助上下文。
5. 调用 DeepSeek 进行流式生成。
6. 校验并解析模型返回的 JSON。
7. 返回包含元数据、统计信息和报告内容的结构化结果。

本地历史由 `app/api/history/route.ts` 和 `lib/history-store.ts` 管理，不设置数量上限。历史列表读取 `data/reports/index.json`，打开单条历史时再读取对应的 `data/reports/items/*.json`；旧版 `data/reports.json` 会在首次读取时迁移到新结构。
