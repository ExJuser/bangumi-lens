# Bangumi Lens

Bangumi Lens 是一个单集评论区报告生成器。输入公开 Bangumi 章节链接后，应用会抓取章节评论区，综合楼中楼、表情和点赞信号，并用 DeepSeek API 生成复盘报告。

## 本地运行

```bash
npm install
copy .env.example .env.local
npm run dev
```

在 `.env.local` 中填入 `DEEPSEEK_API_KEY`。可选的 `DEEPSEEK_MODEL` 默认是 `deepseek-v4-flash`，`DEEPSEEK_BASE_URL` 默认是 `https://api.deepseek.com`。

如果 Windows 浏览器可以访问外网，但应用生成时提示 `fetch failed`，通常是 Node 没有读取系统代理。可在 `.env.local` 中设置：

```bash
BANGUMI_LENS_PROXY=http://127.0.0.1:7897
```

## 功能

- 解析 Bangumi 公开章节页和评论区。
- 计算评论权重：回复数偏向讨论热点，表情/点赞偏向共鸣，评论内容长度和分析词偏向信息量。
- 输出剧情简述、评论区观点总结、讨论热点、共鸣吐槽和剧透风险提示。
- 不保存报告，不读取 Bangumi 登录态或用户私有数据。
