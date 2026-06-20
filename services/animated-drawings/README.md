# AnimatedDrawings Service

封装 Meta [AnimatedDrawings](https://github.com/facebookresearch/AnimatedDrawings) 项目的 HTTP 服务，供 Desk-Idoll Electron 应用调用。

## 功能

- 接收静态人物图片
- 使用 AI 姿态估计 + 骨骼绑定生成动画
- 输出 PixiJS 兼容的精灵图（spritesheet）和 JSON 配置
- 异步任务处理，支持进度查询和取消

## 系统要求

- Python 3.8+
- pip

## 安装

```bash
cd services/animated-drawings
pip install -r requirements.txt
```

如果需要真正的 AI 动画生成（而非示例输出），还需安装 AnimatedDrawings：

```bash
pip install git+https://github.com/facebookresearch/AnimatedDrawings.git
```

> 注意：AnimatedDrawings 依赖 PyTorch、mmpose 等大型库，安装过程较慢且需要较大磁盘空间。

## 启动

**Windows：**

```bash
start.bat
```

**Linux / macOS：**

```bash
chmod +x start.sh
./start.sh
```

**手动启动：**

```bash
python server.py
```

服务默认运行在 `http://127.0.0.1:5000`。

## API 接口

### 健康检查

```
GET /api/health
```

响应示例：

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "animated_drawings_available": false
}
```

### 提交处理任务

```
POST /api/process
Content-Type: application/json
```

请求体：

```json
{
  "image_path": "/absolute/path/to/image.png",
  "animation_style": "walk",
  "output_size": { "width": 128, "height": 128 }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `image_path` | string | 是 | 图片的绝对路径 |
| `animation_style` | string | 否 | `walk` / `run` / `dance` / `idle`，默认 `walk` |
| `output_size` | object | 否 | 输出帧尺寸，默认 `{width: 128, height: 128}` |

响应示例：

```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "processing"
}
```

### 查询任务状态

```
GET /api/status/<task_id>
```

响应示例（处理中）：

```json
{
  "task_id": "550e8400-...",
  "status": "processing",
  "progress": 60
}
```

响应示例（完成）：

```json
{
  "task_id": "550e8400-...",
  "status": "completed",
  "progress": 100,
  "result": {
    "spritesheet_path": "output/550e8400-.../spritesheet.png",
    "json_path": "output/550e8400-.../spritesheet.json"
  }
}
```

### 取消任务

```
POST /api/cancel/<task_id>
```

### 列出所有任务

```
GET /api/tasks
```

（调试用途，返回所有任务的状态摘要。）

## 与 Electron 集成

在 Electron 主进程中通过 HTTP 调用此服务：

```typescript
// 提交任务
const res = await fetch('http://127.0.0.1:5000/api/process', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image_path: '/path/to/image.png',
    animation_style: 'walk',
    output_size: { width: 128, height: 128 }
  })
});
const { task_id } = await res.json();

// 轮询状态
const poll = setInterval(async () => {
  const statusRes = await fetch(`http://127.0.0.1:5000/api/status/${task_id}`);
  const status = await statusRes.json();
  if (status.status === 'completed') {
    clearInterval(poll);
    console.log('Spritesheet:', status.result.spritesheet_path);
  }
}, 1000);
```

## 端口配置

默认端口为 `5000`。如需修改，编辑 `server.py` 最后一行：

```python
app.run(host="127.0.0.1", port=5000, debug=False)
```

## 目录结构

```
services/animated-drawings/
├── server.py         # Flask 服务主文件
├── requirements.txt  # Python 依赖
├── start.bat         # Windows 启动脚本
├── start.sh          # Linux/Mac 启动脚本
├── README.md         # 本文件
├── uploads/          # 上传的图片（自动创建）
└── output/           # 生成的输出（自动创建）
```
