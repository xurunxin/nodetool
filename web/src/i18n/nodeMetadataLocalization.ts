import i18n from "./index";
import type { NodeMetadata } from "../stores/ApiTypes";

const CHINESE_LANGUAGE_PREFIX = "zh";

const EXACT_NODE_TITLES: Record<string, string> = {
  "preview": "预览",
  "workflow": "工作流",
  "subgraph": "子图",
  "group": "分组",
  "comment": "注释",
  "string input": "字符串输入",
  "integer input": "整数输入",
  "float input": "浮点数输入",
  "chat input": "聊天输入",
  "image input": "图像输入",
  "text input": "文本输入",
  "audio input": "音频输入",
  "video input": "视频输入",
  "run comfyui workflow": "运行 ComfyUI 工作流"
};

const EXACT_PROPERTY_NAMES: Record<string, string> = {
  acceleration: "加速",
  aspect_ratio: "宽高比",
  audio: "音频",
  audio_format: "音频格式",
  audio_strength: "音频强度",
  camera_fixed: "固定相机",
  camera_lora: "相机 LoRA",
  camera_lora_scale: "相机 LoRA 比例",
  cfg_scale: "CFG 比例",
  command: "命令",
  default_caption: "默认字幕",
  description: "描述",
  disable_safety_checker: "禁用安全检查器",
  document: "文档",
  duration: "时长",
  embeddings: "嵌入",
  enable_auto_downsample: "启用自动降采样",
  enable_output_safety_checker: "启用输出安全检查器",
  enable_prompt_expansion: "启用提示词扩展",
  enable_safety_checker: "启用安全检查器",
  end_image: "结束图像",
  end_image_strength: "结束图像强度",
  enhance_prompt: "增强提示词",
  expand_prompt: "扩展提示词",
  first_frame_url: "首帧 URL",
  folder: "文件夹",
  format: "格式",
  fps: "帧率",
  frame_rate: "帧率",
  frames_per_second: "每秒帧数",
  frequency_penalty: "频率惩罚",
  generate_audio: "生成音频",
  go_fast: "快速模式",
  guidance: "引导",
  guidance_scale: "引导强度",
  height: "高度",
  image: "图像",
  image_data: "图像数据",
  image_input: "图像输入",
  image_size: "图像尺寸",
  images: "图像",
  input_image: "输入图像",
  input_images: "输入图像",
  inputs: "输入",
  interpolator_model: "插帧模型",
  language: "语言",
  language_code: "语言代码",
  learning_rate: "学习率",
  lora_scale: "LoRA 比例",
  loras: "LoRA",
  mask: "遮罩",
  mask_image: "遮罩图像",
  match_input_fps: "匹配输入帧率",
  max: "最大值",
  max_completion_tokens: "最大补全 token 数",
  max_new_tokens: "最大新 token 数",
  max_output_chars: "最大输出字符数",
  max_tokens: "最大 token 数",
  min: "最小值",
  mode: "模式",
  model: "模型",
  multi_prompt: "多提示词",
  name: "名称",
  negative_prompt: "负面提示词",
  nsfw_checker: "NSFW 检查器",
  num_frames: "帧数",
  num_inference_steps: "推理步数",
  num_interpolated_frames: "插帧数量",
  output: "输出",
  output_format: "输出格式",
  output_quality: "输出质量",
  path: "路径",
  pattern: "模式",
  preprocess: "预处理",
  presence_penalty: "存在惩罚",
  prompt: "提示词",
  prompt_optimizer: "提示词优化器",
  prompt_strength: "提示词强度",
  quality: "质量",
  reference_image: "参考图像",
  reference_images: "参考图像",
  request_id: "请求 ID",
  resolution: "分辨率",
  return_frames_zip: "返回帧 ZIP",
  reverse_video: "反转视频",
  safety_checker_version: "安全检查器版本",
  safety_tolerance: "安全容忍度",
  sample_rate: "采样率",
  sampler: "采样器",
  scale: "比例",
  scheduler: "调度器",
  seed: "种子",
  shift: "偏移",
  shot_type: "镜头类型",
  size: "尺寸",
  speed: "速度",
  start_image: "起始图像",
  steps: "步数",
  strength: "强度",
  style: "风格",
  sync_mode: "同步模式",
  system_prompt: "系统提示词",
  temperature: "温度",
  text: "文本",
  timeout_seconds: "超时秒数",
  title: "标题",
  top_k: "Top K",
  top_p: "Top P",
  upscale_factor: "放大倍数",
  url: "URL",
  use_multiscale: "使用多尺度",
  value: "值",
  video: "视频",
  video_output_type: "视频输出类型",
  video_quality: "视频质量",
  video_size: "视频尺寸",
  video_write_mode: "视频写入模式",
  videos: "视频",
  voice: "声音",
  voice_id: "声音 ID",
  width: "宽度"
};

const WORD_TRANSLATIONS: Record<string, string> = {
  add: "添加",
  align: "对齐",
  amazon: "Amazon",
  api: "API",
  apply: "应用",
  asset: "资产",
  audio: "音频",
  avatar: "头像",
  background: "背景",
  batch: "批量",
  blend: "混合",
  body: "身体",
  caption: "字幕",
  chat: "聊天",
  checker: "检查器",
  clone: "克隆",
  code: "代码",
  color: "颜色",
  colorize: "上色",
  comfyui: "ComfyUI",
  compare: "比较",
  completion: "补全",
  constant: "常量",
  convert: "转换",
  create: "创建",
  crop: "裁剪",
  data: "数据",
  date: "日期",
  dewarp: "展平",
  dict: "字典",
  document: "文档",
  download: "下载",
  edit: "编辑",
  embedding: "嵌入",
  enhance: "增强",
  erase: "擦除",
  eraser: "橡皮擦",
  expand: "扩展",
  file: "文件",
  filter: "筛选",
  folder: "文件夹",
  frame: "帧",
  frames: "帧",
  generate: "生成",
  google: "Google",
  graph: "图",
  group: "分组",
  height: "高度",
  image: "图像",
  images: "图像",
  inpaint: "内补绘",
  input: "输入",
  inputs: "输入",
  isolation: "分离",
  json: "JSON",
  language: "语言",
  list: "列表",
  load: "加载",
  lora: "LoRA",
  mask: "遮罩",
  merge: "合并",
  model: "模型",
  models: "模型",
  multi: "多",
  multiview: "多视角",
  negative: "负面",
  node: "节点",
  object: "对象",
  objects: "对象",
  omni: "全模态",
  output: "输出",
  outputs: "输出",
  outpaint: "外补绘",
  part: "部件",
  preview: "预览",
  product: "产品",
  prompt: "提示词",
  read: "读取",
  reference: "参考",
  relight: "重打光",
  remove: "移除",
  remesh: "重建网格",
  replace: "替换",
  request: "请求",
  resize: "调整尺寸",
  resolution: "分辨率",
  restore: "修复",
  restyle: "重设风格",
  retexture: "重贴图",
  rewrite: "重写",
  save: "保存",
  scraper: "抓取器",
  search: "搜索",
  seed: "种子",
  separate: "分离",
  sketch: "草图",
  speech: "语音",
  stable: "Stable",
  string: "字符串",
  style: "风格",
  super: "超",
  text: "文本",
  timeline: "时间线",
  to: "转",
  transform: "变换",
  transcription: "转写",
  translate: "翻译",
  type: "类型",
  understanding: "理解",
  upscale: "放大",
  upscaler: "放大器",
  url: "URL",
  value: "值",
  vad: "语音活动检测",
  video: "视频",
  videos: "视频",
  voice: "声音",
  web: "网页",
  width: "宽度",
  workflow: "工作流",
  world: "世界",
  write: "写入",
  by: "按",
  from: "从",
  with: "使用",
  and: "和",
  or: "或",
  for: "用于"
};

const TITLE_PHRASES: Record<string, string> = {
  "3d to 3d": "3D 转 3D",
  "add object by text": "按文本添加对象",
  "audio to audio": "音频转音频",
  "audio to text": "音频转文本",
  "audio to video": "音频转视频",
  "background remove": "移除背景",
  "background replace": "替换背景",
  "by text": "按文本",
  "image audio to video": "图像音频转视频",
  "image edit": "图像编辑",
  "image to 3d": "图像转 3D",
  "image to image": "图像转图像",
  "image to text": "图像转文本",
  "image to video": "图像转视频",
  "multi image to 3d": "多图转 3D",
  "sketch to 3d": "草图转 3D",
  "speech to video": "语音转视频",
  "text to audio": "文本转音频",
  "text to image": "文本转图像",
  "text to speech": "文本转语音",
  "text to video": "文本转视频",
  "video to audio": "视频转音频",
  "video to text": "视频转文本",
  "video to video": "视频转视频",
  "voice changer": "变声器",
  "voice clone": "声音克隆",
  "web scraper": "网页抓取器",
  "you tube": "YouTube"
};

const DATA_TYPE_LABELS: Record<string, string> = {
  any: "任意",
  asset: "资产",
  audio: "音频",
  bool: "布尔值",
  boolean: "布尔值",
  bytes: "字节",
  chunk: "片段",
  collection: "集合",
  dataframe: "数据表",
  datetime: "日期时间",
  date: "日期",
  dict: "字典",
  document: "文档",
  embedding_model: "嵌入模型",
  enum: "枚举",
  file: "文件",
  float: "浮点数",
  folder: "文件夹",
  image: "图像",
  image_model: "图像模型",
  image_size: "图像尺寸",
  int: "整数",
  integer: "整数",
  json: "JSON",
  language_model: "语言模型",
  list: "列表",
  message: "消息",
  model_3d: "3D 模型",
  model_ref: "模型引用",
  none: "无",
  notype: "无类型",
  number: "数字",
  object: "对象",
  str: "字符串",
  string: "字符串",
  task: "任务",
  text: "文本",
  thread: "会话线程",
  union: "联合类型",
  video: "视频",
  workflow: "工作流"
};

const DESCRIPTION_TRANSLATIONS: Record<string, string> = {
  "No description available": "暂无描述",
  Preview: "预览",
  "Execute a sub-workflow. Select a workflow to populate its inputs and outputs dynamically.":
    "执行子工作流。选择工作流后会动态填充输入和输出。"
};

const DESCRIPTION_PHRASES: Record<string, string> = {
  "Accepts any data type": "接受任意数据类型",
  "Aspect ratio": "宽高比",
  "Audio data": "音频数据",
  "Enable safety checker": "启用安全检查器",
  "Guidance scale": "引导强度",
  "Image data": "图像数据",
  "Negative prompt": "负面提示词",
  "No output": "无输出",
  "Number of inference steps": "推理步数",
  "Output format": "输出格式",
  "Random seed": "随机种子",
  "Reference to": "引用",
  "Safety checker": "安全检查器",
  "The generated audio": "生成的音频",
  "The generated image": "生成的图像",
  "The generated video": "生成的视频",
  "The input image": "输入图像",
  "The negative prompt": "负面提示词",
  "The prompt": "提示词",
  "Video data": "视频数据"
};

const EXACT_OPTION_LABELS: Record<string, string> = {
  all: "全部",
  auto: "自动",
  balanced: "均衡",
  best: "最佳",
  center: "居中",
  default: "默认",
  disabled: "禁用",
  enabled: "启用",
  false: "否",
  fast: "快速",
  high: "高",
  image: "图像",
  jpeg: "JPEG",
  jpg: "JPG",
  large: "大",
  left: "左",
  low: "低",
  medium: "中",
  none: "无",
  normal: "普通",
  png: "PNG",
  right: "右",
  slow: "慢速",
  standard: "标准",
  text: "文本",
  true: "是",
  video: "视频",
  webp: "WebP"
};

const normalizeLookupKey = (value: string): string =>
  value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[\s.-]+/g, "_")
    .toLowerCase();

const normalizeTitleKey = (value: string): string =>
  value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();

const shouldLocalize = (): boolean =>
  i18n.language.toLowerCase().startsWith(CHINESE_LANGUAGE_PREFIX);

const hasChinese = (value: string): boolean => /[\u3400-\u9fff]/.test(value);

const tokenize = (value: string): string[] =>
  value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .split(/[\s_.\-/:]+/)
    .filter(Boolean);

const translateToken = (token: string): string => {
  const lower = token.toLowerCase();
  const exactType = DATA_TYPE_LABELS[lower];
  if (exactType) {
    return exactType;
  }
  return WORD_TRANSLATIONS[lower] ?? token;
};

const replacePhrases = (
  value: string,
  phrases: Record<string, string>
): string => {
  let result = value;
  Object.entries(phrases).forEach(([source, target]) => {
    result = result.replace(new RegExp(source, "gi"), target);
  });
  return result;
};

const translateTitleTokens = (value: string): string =>
  tokenize(value).map(translateToken).join(" ");

const translateIdentifierTokens = (value: string): string =>
  tokenize(value).map(translateToken).join("");

export const localizeNodeTitle = (title: string | null | undefined): string => {
  if (!title) {
    return "";
  }
  if (!shouldLocalize() || hasChinese(title)) {
    return title;
  }

  const key = normalizeTitleKey(title);
  const exact = EXACT_NODE_TITLES[key];
  if (exact) {
    return exact;
  }

  const phraseTranslated = replacePhrases(title, TITLE_PHRASES);
  if (phraseTranslated !== title) {
    return translateTitleTokens(phraseTranslated)
      .replace(/\s+(转|按)\s+/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  return translateTitleTokens(title);
};

export const localizePropertyName = (name: string | null | undefined): string => {
  if (!name) {
    return "";
  }
  if (!shouldLocalize() || hasChinese(name)) {
    return name;
  }

  const key = normalizeLookupKey(name);
  return EXACT_PROPERTY_NAMES[key] ?? translateIdentifierTokens(name);
};

export const localizeOutputName = (name: string | null | undefined): string =>
  localizePropertyName(name);

export const localizeDataTypeLabel = (
  typeName: string | null | undefined
): string => {
  if (!typeName) {
    return "";
  }
  if (!shouldLocalize() || hasChinese(typeName)) {
    return typeName;
  }
  const normalized = normalizeLookupKey(typeName.replace(/^nodetool[._]/, ""));
  return DATA_TYPE_LABELS[normalized] ?? translateTitleTokens(typeName);
};

export const localizeDescription = (
  description: string | null | undefined
): string => {
  if (!description) {
    return "";
  }
  if (!shouldLocalize() || hasChinese(description)) {
    return description;
  }

  const exact = DESCRIPTION_TRANSLATIONS[description];
  if (exact) {
    return exact;
  }

  const phraseTranslated = replacePhrases(description, DESCRIPTION_PHRASES);
  if (phraseTranslated !== description) {
    return phraseTranslated;
  }

  if (description.length <= 60 && !/[.!?]\s/.test(description)) {
    return localizeNodeTitle(description);
  }

  return description;
};

export const localizeOptionLabel = (label: string | number): string => {
  const value = String(label);
  if (!shouldLocalize() || hasChinese(value)) {
    return value;
  }
  const key = normalizeLookupKey(value);
  return EXACT_OPTION_LABELS[key] ?? localizePropertyName(value);
};

export const localizeNodeMetadata = (
  metadata: NodeMetadata
): NodeMetadata => ({
  ...metadata,
  title: localizeNodeTitle(metadata.title),
  description: localizeDescription(metadata.description),
  properties: metadata.properties.map((property) => ({
    ...property,
    title: property.title
      ? localizePropertyName(property.title)
      : localizePropertyName(property.name),
    description: localizeDescription(property.description)
  })),
  outputs: metadata.outputs.map((output) => ({
    ...output
  }))
});

export const localizeMetadataRecord = (
  metadataByType: Record<string, NodeMetadata>
): Record<string, NodeMetadata> => {
  if (!shouldLocalize()) {
    return metadataByType;
  }

  return Object.fromEntries(
    Object.entries(metadataByType).map(([nodeType, metadata]) => [
      nodeType,
      localizeNodeMetadata(metadata)
    ])
  );
};
