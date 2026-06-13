import * as path from "path";
import type { RuntimePackageId } from "../../types.d";
import { CondaRuntimePackage } from "./CondaRuntimePackage";
import { NpmRuntimePackage } from "./NpmRuntimePackage";
import { ElectronRuntimePackage } from "./ElectronRuntimePackage";
import type { RuntimePackage } from "./types";

/**
 * Concrete runtime package definitions. Replaces the previous
 * `RUNTIME_DEFINITIONS` map with instances of the typed base classes.
 */
export const RUNTIME_PACKAGES: Record<RuntimePackageId, RuntimePackage> = {
  python: new CondaRuntimePackage({
    id: "python",
    name: "Python",
    description:
      "Python 解释器和 uv 包管理器。AI 节点和数据处理节点需要此运行时。",
    category: "language",
    versionRange: ">=3.11 <3.12",
    condaPackages: ["python=3.11", "uv"],
    verifyBinary: "python",
    extraBinaries: { uv: "uv" },
    windowsBinSubdir: "Library\\bin",
    postInstall: async () => {
      const { installRequiredPythonPackages } = await import("../../python");
      await installRequiredPythonPackages();
    },
  }),

  nodejs: new ElectronRuntimePackage({
    id: "nodejs",
    name: "Node.js",
    description:
      "Electron 内置的 JavaScript 运行时。Node.js 节点和 npm 包需要此运行时。",
    category: "language",
    versionRange: "*",
    binaries: {
      node: (ctx) =>
        ctx.platform === "win32"
          ? path.join(ctx.condaEnvPath, "node.exe")
          : path.join(ctx.condaEnvPath, "bin", "node"),
    },
  }),

  bash: new CondaRuntimePackage({
    id: "bash",
    name: "Bash",
    description: "用于脚本执行节点的 Bash shell。",
    category: "language",
    versionRange: "*",
    condaPackages: ["bash"],
    verifyBinary: "bash",
  }),

  ruby: new CondaRuntimePackage({
    id: "ruby",
    name: "Ruby",
    description: "用于 Ruby 节点的 Ruby 解释器。",
    category: "language",
    versionRange: "*",
    condaPackages: ["ruby"],
    verifyBinary: "ruby",
  }),

  lua: new CondaRuntimePackage({
    id: "lua",
    name: "Lua",
    description: "用于 Lua 节点的 Lua 解释器。",
    category: "language",
    versionRange: "*",
    condaPackages: ["lua"],
    verifyBinary: "lua",
  }),

  ffmpeg: new CondaRuntimePackage({
    id: "ffmpeg",
    name: "FFmpeg & Codecs",
    description:
      "音频和视频处理工具集。视频节点和 FFmpeg 智能体需要此工具。",
    category: "tool",
    versionRange: ">=6 <7",
    condaPackages: [
      "ffmpeg>=6,<7",
      "x264",
      "x265",
      "aom",
      "libopus",
      "libvorbis",
      "libpng",
      "libjpeg-turbo",
      "libtiff",
      "openjpeg",
      "libwebp",
      "giflib",
      "lame",
    ],
    verifyBinary: "ffmpeg",
    extraBinaries: { ffprobe: "ffprobe" },
    windowsBinSubdir: "Library\\bin",
  }),

  pandoc: new CondaRuntimePackage({
    id: "pandoc",
    name: "Pandoc",
    description:
      "通用文档转换器，用于文本和文件格式转换。",
    category: "tool",
    versionRange: "*",
    condaPackages: ["pandoc"],
    verifyBinary: "pandoc",
  }),

  pdftotext: new CondaRuntimePackage({
    id: "pdftotext",
    name: "PDF Tools (Poppler)",
    description:
      "使用 Poppler 的 pdftotext 提取 PDF 文本。PDF 转文本需要此工具。",
    category: "tool",
    versionRange: "*",
    condaPackages: ["poppler"],
    verifyBinary: "pdftotext",
  }),

  "yt-dlp": new CondaRuntimePackage({
    id: "yt-dlp",
    name: "yt-dlp",
    description: "用于从 YouTube 和其他站点下载视频或音频。",
    category: "tool",
    versionRange: "*",
    condaPackages: ["yt-dlp"],
    verifyBinary: "yt-dlp",
  }),

  "transformers-js": new NpmRuntimePackage({
    id: "transformers-js",
    name: "Transformers.js",
    description:
      "本地 JavaScript AI 节点可选的 Hugging Face Transformers.js 运行时，包含 ONNX Runtime。",
    category: "library",
    versionRange: "4.x",
    npmPackages: ["@huggingface/transformers@4.2.0", "kokoro-js@1.2.1"],
    packageNames: ["@huggingface/transformers", "kokoro-js"],
  }),

  "tensorflow-js": new NpmRuntimePackage({
    id: "tensorflow-js",
    name: "TensorFlow.js Models",
    description:
      "图像分类、目标检测和问答节点可选的 TensorFlow.js 模型包。",
    category: "library",
    versionRange: "4.x",
    npmPackages: [
      "@tensorflow/tfjs@4.22.0",
      "@tensorflow-models/mobilenet@2.1.1",
      "@tensorflow-models/coco-ssd@2.2.3",
      "@tensorflow-models/qna@1.0.2",
    ],
    packageNames: [
      "@tensorflow/tfjs",
      "@tensorflow-models/mobilenet",
      "@tensorflow-models/coco-ssd",
      "@tensorflow-models/qna",
    ],
  }),
};
