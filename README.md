# keel-demo-api

一个刻意做小的 **Bookmarks JSON API**，用来验证 [Keel](https://github.com/jionpz/keel)
的后端研发闭环：真实 Issue → 决策/实现/测试 → 真实 PR → 真实 CI。

它和 [`keel-demo-app`](https://github.com/jionpz/keel-demo-app) 互补：前者是零依赖
Todo 前端，本项目是零依赖 Node HTTP API，适合覆盖后端契约、错误处理、分页、过滤、
持久化与 OpenAPI 等任务。

## 运行

```bash
npm start        # http://127.0.0.1:3001
npm test         # Node 24 内置 node:test
```

端口可用 `PORT` 覆盖，监听地址可用 `HOST` 覆盖。

HTTP 集成测试默认在独立临时目录内通过 Unix socket 发送真实 HTTP 请求，
可在禁止 TCP 监听的执行沙箱中运行，不需要额外依赖。`TEST_TRANSPORT=tcp npm test`
使用临时 loopback TCP 端口运行同一组断言；CI 同时验证两种传输方式。

## 当前 API

```bash
curl http://127.0.0.1:3001/health
curl http://127.0.0.1:3001/api/bookmarks
curl -X POST http://127.0.0.1:3001/api/bookmarks \
  -H 'content-type: application/json' \
  -d '{"title":"Keel","url":"https://github.com/jionpz/keel","tags":["ai","workflow"]}'
curl http://127.0.0.1:3001/api/bookmarks/<id>
curl -X PATCH http://127.0.0.1:3001/api/bookmarks/<id> \
  -H 'content-type: application/json' \
  -d '{"status":"reading"}'
curl -X DELETE http://127.0.0.1:3001/api/bookmarks/<id>
curl http://127.0.0.1:3001/api/tags
```

完整字段、状态码与错误格式见 [`docs/API.md`](./docs/API.md)。

## 结构

```
src/bookmarks.js   内存 store、输入规范化、错误类型
src/http.js        请求解析、路由、JSON 错误映射
server.mjs         启动入口与示例 seed
test/              node:test 单元与 HTTP 集成测试
docs/API.md        API 契约
```

## 设计约束

- 零运行时依赖，方便 Keel 在任意 Linux/Node 24 环境执行。
- 内存 store 是刻意的；持久化、过滤、分页、CORS 等由 `keel` issue 逐步推进。
- 所有写操作先经过纯函数式校验；HTTP 层只做解析、状态码和错误映射。
- 不自动合并、不自动部署；Keel 的默认完成目标是 `branch_ready` / `pr_ready`。
