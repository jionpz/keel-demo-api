# Bookmarks API 契约

Base URL：`http://127.0.0.1:3001`

所有请求与响应使用 JSON；成功响应 `content-type: application/json`。

## Bookmark

```json
{
  "id": "5f0c4f34-1c9c-4d4e-9f8c-6f0f6d8a0f01",
  "title": "Keel",
  "url": "https://github.com/jionpz/keel",
  "status": "unread",
  "tags": ["ai", "workflow"],
  "notes": "",
  "createdAt": "2026-11-11T00:00:00.000Z",
  "updatedAt": "2026-11-11T00:00:00.000Z"
}
```

字段规则：

- `title`：1–200 字符，必填。
- `url`：合法 `http` / `https` URL，最长 2048 字符，必填。
- `status`：`unread` | `reading` | `done`，创建时缺省 `unread`。
- `tags`：0–20 个，每个 1–40 字符；去重并按小写保存。
- `notes`：可选，最长 2000 字符。
- `id`、`createdAt`、`updatedAt` 由服务端生成，不接受客户端写入。

## 端点

### `GET /health`

返回 `{ "status": "ok", "version": "0.1.0", "uptimeSeconds": 0, "bookmarks": 3 }`。

### `GET /api`

返回当前端点索引。

### `GET /api/bookmarks`

当前返回全部书签。过滤、分页与搜索由后续 `keel` issue 扩展。

### `GET /api/tags`

返回当前所有实际存在的书签的标签计数，只读聚合：

```json
{
  "items": [
    { "tag": "workflow", "count": 2 },
    { "tag": "ai", "count": 1 },
    { "tag": "node", "count": 1 },
    { "tag": "testing", "count": 1 }
  ],
  "totalTags": 4
}
```

排序规则：先按 `count` 降序，同计数按 `tag` 升序（逐码点比较）。
`totalTags` 是不同标签的数量。空 store 返回 `{ "items": [], "totalTags": 0 }`。
不提供按标签删除或重命名。

### `POST /api/bookmarks`

请求体至少包含 `title` 与 `url`。成功返回 `201`、`Location` 头和完整 Bookmark。

### `GET /api/bookmarks/:id`

成功 `200`；不存在 `404`。

### `PATCH /api/bookmarks/:id`

只接受 `title`、`url`、`status`、`tags`、`notes` 中的至少一个字段。
成功 `200`；不存在 `404`。

### `DELETE /api/bookmarks/:id`

成功 `204`；不存在 `404`。

## 错误格式

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "field": "url",
    "message": "url 必须是 http(s) URL"
  }
}
```

当前错误码：

- `VALIDATION_ERROR` → `400`
- `NOT_FOUND` → `404`
- `PAYLOAD_TOO_LARGE` → `413`
- `INTERNAL_ERROR` → `500`

请求体上限为 64 KiB。CORS、结构化请求 ID、速率限制与 OpenAPI 文档尚未实现。
