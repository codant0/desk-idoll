"""
AnimatedDrawings HTTP Service
封装 Meta AnimatedDrawings 项目，提供 REST API

Endpoints:
  GET  /api/health          - 健康检查
  POST /api/process         - 提交图片生成动画任务
  GET  /api/status/<task_id> - 查询任务状态
  POST /api/cancel/<task_id> - 取消任务
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import threading
import uuid
import os
import json
import time
import math
from pathlib import Path
from typing import Dict, Any, Optional

from PIL import Image

app = Flask(__name__)
CORS(app)

# ---------------------------------------------------------------------------
# 配置
# ---------------------------------------------------------------------------
UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("output")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# 任务存储（内存）
tasks: Dict[str, Dict[str, Any]] = {}
_tasks_lock = threading.Lock()

# AnimatedDrawings 可用性缓存
_ad_available: Optional[bool] = None


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------
def check_animated_drawings() -> bool:
    """检查 AnimatedDrawings 是否已安装可用，结果会被缓存。"""
    global _ad_available
    if _ad_available is not None:
        return _ad_available
    try:
        import animated_drawings  # noqa: F401
        _ad_available = True
    except ImportError:
        _ad_available = False
    return _ad_available


def _update_task(task_id: str, **kwargs: Any) -> None:
    """线程安全地更新任务字段。"""
    with _tasks_lock:
        if task_id in tasks:
            tasks[task_id].update(kwargs)


# ---------------------------------------------------------------------------
# API 路由
# ---------------------------------------------------------------------------
@app.route("/api/health", methods=["GET"])
def health_check():
    """健康检查端点"""
    return jsonify(
        {
            "status": "healthy",
            "version": "1.0.0",
            "animated_drawings_available": check_animated_drawings(),
        }
    )


@app.route("/api/process", methods=["POST"])
def process_image():
    """
    处理图片生成动画

    Request Body::

        {
            "image_path": "path/to/image.png",
            "animation_style": "walk|run|dance|idle",
            "output_size": {"width": 128, "height": 128}
        }

    Response::

        {
            "task_id": "uuid",
            "status": "processing"
        }
    """
    data = request.json
    if not data or "image_path" not in data:
        return jsonify({"error": "Missing required field: image_path"}), 400

    image_path = data["image_path"]
    animation_style = data.get("animation_style", "walk")
    output_size = data.get("output_size", {"width": 128, "height": 128})

    # 验证 animation_style
    valid_styles = {"walk", "run", "dance", "idle"}
    if animation_style not in valid_styles:
        return (
            jsonify(
                {
                    "error": f"Invalid animation_style. Must be one of: {', '.join(sorted(valid_styles))}"
                }
            ),
            400,
        )

    # 验证图片存在
    if not os.path.exists(image_path):
        return jsonify({"error": f"Image not found: {image_path}"}), 404

    # 生成任务 ID
    task_id = str(uuid.uuid4())

    # 初始化任务状态
    with _tasks_lock:
        tasks[task_id] = {
            "status": "processing",
            "image_path": image_path,
            "animation_style": animation_style,
            "output_size": output_size,
            "created_at": time.time(),
            "progress": 0,
            "result": None,
            "error": None,
        }

    # 启动异步处理线程
    thread = threading.Thread(target=process_task, args=(task_id,), daemon=True)
    thread.start()

    return jsonify({"task_id": task_id, "status": "processing"})


@app.route("/api/status/<task_id>", methods=["GET"])
def get_status(task_id: str):
    """
    查询任务状态

    Response::

        {
            "task_id": "uuid",
            "status": "processing|completed|error|cancelled",
            "progress": 0-100,
            "result": {
                "spritesheet_path": "path/to/spritesheet.png",
                "json_path": "path/to/spritesheet.json"
            },
            "error": "error message if failed"
        }
    """
    with _tasks_lock:
        task = tasks.get(task_id)

    if task is None:
        return jsonify({"error": "Task not found"}), 404

    response: Dict[str, Any] = {
        "task_id": task_id,
        "status": task["status"],
        "progress": task.get("progress", 0),
    }

    if task["status"] == "completed":
        response["result"] = task["result"]
    elif task["status"] == "error":
        response["error"] = task.get("error", "Unknown error")

    return jsonify(response)


@app.route("/api/cancel/<task_id>", methods=["POST"])
def cancel_task(task_id: str):
    """取消一个正在处理的任务。"""
    with _tasks_lock:
        task = tasks.get(task_id)

    if task is None:
        return jsonify({"error": "Task not found"}), 404

    if task["status"] == "processing":
        _update_task(task_id, status="cancelled")
        return jsonify({"task_id": task_id, "status": "cancelled"})

    return jsonify({"error": "Task is not in a cancellable state"}), 400


@app.route("/api/tasks", methods=["GET"])
def list_tasks():
    """列出所有任务（调试用）。"""
    with _tasks_lock:
        summary = {
            tid: {"status": t["status"], "progress": t.get("progress", 0)}
            for tid, t in tasks.items()
        }
    return jsonify(summary)


# ---------------------------------------------------------------------------
# 后台处理
# ---------------------------------------------------------------------------
def process_task(task_id: str) -> None:
    """在后台线程中处理动画生成任务。"""
    with _tasks_lock:
        task = tasks.get(task_id)
    if task is None:
        return

    try:
        _update_task(task_id, progress=10)

        # 准备工作目录
        image_path = task["image_path"]
        animation_style = task["animation_style"]
        output_size = task["output_size"]
        work_dir = OUTPUT_DIR / task_id
        work_dir.mkdir(exist_ok=True)

        _update_task(task_id, progress=20)

        # ------------------------------------------------------------------
        # _run_animated_drawings 内部会尝试使用 AnimatedDrawings 真实库；
        # 若不可用则自动降级为基于图像变换的动画生成。
        # ------------------------------------------------------------------
        _run_animated_drawings(task_id, image_path, animation_style, output_size, work_dir)

    except Exception as e:
        _update_task(task_id, status="error", error=str(e))
        print(f"[ERROR] Task {task_id} failed: {e}")


def _run_animated_drawings(
    task_id: str,
    image_path: str,
    animation_style: str,
    output_size: dict,
    work_dir: Path,
) -> None:
    """
    使用 AnimatedDrawings 库处理图片生成动画。

    处理流程：
      1. 尝试导入 AnimatedDrawings 真实库
      2. 若可用：姿态估计 -> 骨骼绑定 -> 动画应用 -> 渲染输出
      3. 若不可用：降级为基于 Pillow 图像变换的简单动画生成
    """
    try:
        _update_task(task_id, progress=30)

        # 检查 AnimatedDrawings 是否可用
        ad_available = False
        try:
            from animated_drawings.config import Config  # type: ignore
            from animated_drawings.char_import import Character  # type: ignore
            from animated_drawings.motion_import import Motion  # type: ignore
            from animated_drawings.controller import Controller  # type: ignore
            ad_available = True
        except ImportError:
            ad_available = False

        if not ad_available:
            # 降级方案：基于图像变换生成简单动画
            _generate_transform_based_animation(
                task_id, image_path, animation_style, output_size, work_dir
            )
            return

        _update_task(task_id, progress=40)

        # 步骤1: 准备配置
        config = _prepare_config(image_path, animation_style, output_size, work_dir)

        _update_task(task_id, progress=50)

        # 步骤2: 角色检测和骨骼绑定
        character = Character(config)
        character.detect_pose()
        character.rig_skeleton()

        _update_task(task_id, progress=60)

        # 步骤3: 加载动画
        motion = Motion(config)
        motion.load_animation(animation_style)

        _update_task(task_id, progress=70)

        # 步骤4: 应用动画并渲染
        controller = Controller(character, motion, config)
        output_frames = controller.render_to_frames()

        _update_task(task_id, progress=80)

        # 步骤5: 转换为精灵图格式
        spritesheet_path = str(work_dir / "spritesheet.png")
        json_path = str(work_dir / "spritesheet.json")

        _convert_to_spritesheet(
            output_frames,
            spritesheet_path,
            json_path,
            output_size,
        )

        _update_task(task_id, progress=90)

        _update_task(
            task_id,
            status="completed",
            progress=100,
            result={
                "spritesheet_path": spritesheet_path,
                "json_path": json_path,
            },
        )

    except Exception as e:
        raise RuntimeError(f"AnimatedDrawings processing failed: {e}") from e


def _prepare_config(
    image_path: str,
    animation_style: str,
    output_size: dict,
    work_dir: Path,
) -> dict:
    """准备 AnimatedDrawings 配置。"""
    return {
        "input_image": image_path,
        "output_dir": str(work_dir),
        "animation_style": animation_style,
        "output_size": output_size,
        "use_gpu": False,  # 默认使用 CPU
    }


def _convert_to_spritesheet(
    frames: list,
    spritesheet_path: str,
    json_path: str,
    output_size: dict,
) -> None:
    """
    将动画帧序列转换为 PixiJS 兼容的精灵图格式。

    输出格式与 sprite-adapter.ts 期望的 JSON spritesheet 一致，
    包含 frames 字典、animations 分组和 meta 信息。
    """
    from PIL import Image

    frame_width = output_size.get("width", 128)
    frame_height = output_size.get("height", 128)
    frames_per_row = 4
    total_rows = (len(frames) + frames_per_row - 1) // frames_per_row

    # 创建精灵图画布
    spritesheet = Image.new(
        "RGBA",
        (frame_width * frames_per_row, frame_height * total_rows),
        (0, 0, 0, 0),
    )

    # 帧定义
    frames_data: Dict[str, Any] = {}
    animations: Dict[str, list] = {
        "idle": [],
        "walk": [],
        "drag": [],
        "fall": [],
        "click": [],
    }

    for i, frame in enumerate(frames):
        row = i // frames_per_row
        col = i % frames_per_row

        # 打开或直接使用帧图像
        frame_img = Image.open(frame) if isinstance(frame, str) else frame
        frame_img = frame_img.resize(
            (frame_width, frame_height), Image.Resampling.LANCZOS
        )
        spritesheet.paste(frame_img, (col * frame_width, row * frame_height))

        frame_name = f"frame_{i}"
        frames_data[frame_name] = {
            "frame": {
                "x": col * frame_width,
                "y": row * frame_height,
                "w": frame_width,
                "h": frame_height,
            },
            "rotated": False,
            "trimmed": False,
            "spriteSourceSize": {
                "x": 0,
                "y": 0,
                "w": frame_width,
                "h": frame_height,
            },
            "sourceSize": {"w": frame_width, "h": frame_height},
        }

        # 将帧分配到对应的动画状态（每 4 帧一个状态）
        if i < 4:
            animations["idle"].append(frame_name)
        elif i < 8:
            animations["walk"].append(frame_name)
        elif i < 12:
            animations["drag"].append(frame_name)
        elif i < 16:
            animations["fall"].append(frame_name)
        else:
            animations["click"].append(frame_name)

    # 保存精灵图
    spritesheet.save(spritesheet_path)

    # 生成 PixiJS 兼容的 JSON
    json_config: Dict[str, Any] = {
        "frames": frames_data,
        "animations": animations,
        "meta": {
            "size": {
                "w": frame_width * frames_per_row,
                "h": frame_height * total_rows,
            },
            "scale": "1",
        },
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(json_config, f, indent=2, ensure_ascii=False)


def _generate_transform_based_animation(
    task_id: str,
    image_path: str,
    animation_style: str,
    output_size: dict,
    work_dir: Path,
) -> None:
    """
    降级方案：基于 Pillow 图像变换生成简单动画。

    当 AnimatedDrawings 库不可用时，通过缩放、位移、旋转等变换
    为原始图片生成 5 种动画状态（idle/walk/drag/fall/click）各 4 帧。
    """
    from PIL import Image

    _update_task(task_id, progress=40)

    # 读取源图片并调整到目标尺寸
    source_img = Image.open(image_path).convert("RGBA")
    source_img = source_img.resize(
        (output_size.get("width", 128), output_size.get("height", 128)),
        Image.Resampling.LANCZOS,
    )

    frames = []
    frame_count = 20  # 5 种状态 x 4 帧

    _update_task(task_id, progress=50)

    # 为每种动画状态生成对应的帧
    for i in range(frame_count):
        # 计算在当前状态内的局部进度 (0.0 ~ 1.0)
        local_progress = (i % 4) / 3.0

        if i < 4:
            # idle: 轻微浮动 + 呼吸缩放
            frame = _transform_idle(source_img, local_progress, output_size)
        elif i < 8:
            # walk: 左右位移 + 弹跳
            frame = _transform_walk(source_img, local_progress, output_size)
        elif i < 12:
            # drag: 旋转摇晃
            frame = _transform_drag(source_img, local_progress, output_size)
        elif i < 16:
            # fall: 旋转下落
            frame = _transform_fall(source_img, local_progress, output_size)
        else:
            # click: 缩放脉冲
            frame = _transform_click(source_img, local_progress, output_size)

        frames.append(frame)

        # 保存单帧到磁盘（用于调试，也供 _convert_to_spritesheet 读取）
        frame_path = work_dir / f"frame_{i:03d}.png"
        frame.save(frame_path)

    _update_task(task_id, progress=80)

    # 转换为精灵图
    spritesheet_path = str(work_dir / "spritesheet.png")
    json_path = str(work_dir / "spritesheet.json")

    _convert_to_spritesheet(
        [str(work_dir / f"frame_{i:03d}.png") for i in range(frame_count)],
        spritesheet_path,
        json_path,
        output_size,
    )

    _update_task(task_id, progress=90)

    _update_task(
        task_id,
        status="completed",
        progress=100,
        result={
            "spritesheet_path": spritesheet_path,
            "json_path": json_path,
        },
    )


# ---------------------------------------------------------------------------
# 图像变换函数 —— 每种动画状态对应一种变换效果
# ---------------------------------------------------------------------------
def _transform_idle(img: Image.Image, progress: float, size: dict) -> Image.Image:
    """idle: 轻微浮动 + 呼吸缩放。"""
    scale = 1.0 + math.sin(progress * math.pi * 2) * 0.05
    new_size = (int(size.get("width", 128) * scale), int(size.get("height", 128) * scale))
    transformed = img.resize(new_size, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (size.get("width", 128), size.get("height", 128)), (0, 0, 0, 0))
    offset_x = (size.get("width", 128) - new_size[0]) // 2
    offset_y = (size.get("height", 128) - new_size[1]) // 2
    canvas.paste(transformed, (offset_x, offset_y))

    return canvas


def _transform_walk(img: Image.Image, progress: float, size: dict) -> Image.Image:
    """walk: 左右位移 + 弹跳。"""
    w = size.get("width", 128)
    h = size.get("height", 128)
    x_offset = int(math.sin(progress * math.pi * 2) * 10)
    y_offset = int(abs(math.sin(progress * math.pi * 2)) * 15)

    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    canvas.paste(img, (x_offset, y_offset))

    return canvas


def _transform_drag(img: Image.Image, progress: float, size: dict) -> Image.Image:
    """drag: 旋转摇晃。"""
    angle = math.sin(progress * math.pi * 2) * 15
    return img.rotate(
        angle,
        resample=Image.Resampling.BICUBIC,
        expand=False,
        fillcolor=(0, 0, 0, 0),
    )


def _transform_fall(img: Image.Image, progress: float, size: dict) -> Image.Image:
    """fall: 旋转下落。"""
    angle = progress * 360
    return img.rotate(
        angle,
        resample=Image.Resampling.BICUBIC,
        expand=False,
        fillcolor=(0, 0, 0, 0),
    )


def _transform_click(img: Image.Image, progress: float, size: dict) -> Image.Image:
    """click: 缩放脉冲。"""
    w = size.get("width", 128)
    h = size.get("height", 128)
    scale = 1.0 + math.sin(progress * math.pi) * 0.3
    new_size = (int(w * scale), int(h * scale))
    transformed = img.resize(new_size, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    offset_x = (w - new_size[0]) // 2
    offset_y = (h - new_size[1]) // 2
    canvas.paste(transformed, (offset_x, offset_y))

    return canvas


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 50)
    print("  AnimatedDrawings Service v1.0.0")
    print(f"  AnimatedDrawings installed: {check_animated_drawings()}")
    print("  Starting on http://127.0.0.1:5000")
    print("=" * 50)
    app.run(host="127.0.0.1", port=5000, debug=False)
