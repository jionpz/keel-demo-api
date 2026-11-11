# keel-demo-api 工程规则

这是一个刻意做小的 Bookmarks JSON API，用来给 [Keel](https://github.com/jionpz/keel)
提供真实的后端任务、测试与 PR 样本。

## 技术边界

- Node.js 24+、ESM、**零运行时依赖**；不要引入 Express、数据库或测试框架。
- 测试统一用 `node --test`，文件放在 `test/*.test.mjs`。
- 当前存储是进程内内存；不承诺重启持久化，也不能存放真实用户数据。
- API 契约以 `docs/API.md` 为准；改行为必须同步契约与测试。
- 提交前必须运行 `npm test`。

## 工作流

- 带 `keel` label 的 issue 是 Keel 自动化候选；其他 issue 默认人工处理。
- 有 jstack 插件时走 `/flow:route`；没有时按本文件与仓库文档执行。
- 保持 demo 可运行、可测试、可回滚，不引入生产凭据或外部服务。
