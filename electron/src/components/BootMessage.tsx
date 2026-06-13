import React, { useState, useEffect, useCallback } from "react";
import { ServerStatus } from "../types";
import logoUrl from "../assets/logo.png";

interface UpdateProgressData {
  componentName: string;
  progress: number;
  action: string;
  eta?: string;
}

interface BootMessageProps {
  message: string;
  showUpdateSteps: boolean;
  progressData: UpdateProgressData;
  status?: ServerStatus;
  errorMessage?: string;
  onRetry?: () => void;
  onOpenLogs?: () => void;
  onReinstall?: () => void;
}

interface Provider {
  name: string;
  description: string;
  signupUrl: string;
  capabilities: string[];
}

const PROVIDERS: Provider[] = [
  {
    name: "Kie.ai",
    description: "通过统一 API 访问视频生成、图像合成和音频等多类 AI 模型。",
    signupUrl: "https://kie.ai/",
    capabilities: ["视频生成", "图像生成", "音频"],
  },
  {
    name: "Fal.ai",
    description: "面向图像和视频生成模型的快速推理平台，性能经过优化。",
    signupUrl: "https://fal.ai/",
    capabilities: ["图像生成", "视频生成", "快速推理"],
  },
  {
    name: "Hugging Face",
    description: "访问 500,000+ 个面向文本、图像、音频等场景的开源模型。",
    signupUrl: "https://huggingface.co/settings/tokens",
    capabilities: ["文本生成", "图像模型", "语音", "嵌入"],
  },
  {
    name: "Replicate",
    description: "用简单 API 在云端运行开源机器学习模型。",
    signupUrl: "https://replicate.com/",
    capabilities: ["图像生成", "视频", "音频", "文本"],
  },
  {
    name: "OpenAI",
    description: "访问 OpenAI 的 GPT、图像、Whisper 等强大 AI 模型。",
    signupUrl: "https://platform.openai.com/api-keys",
    capabilities: ["聊天", "图像生成", "语音", "嵌入"],
  },
  {
    name: "OpenRouter",
    description: "通过统一 API 访问多个大语言模型服务商，并支持自动回退。",
    signupUrl: "https://openrouter.ai/",
    capabilities: ["聊天", "多模型", "成本优化"],
  },
  {
    name: "Anthropic",
    description: "访问 Claude 模型，用于高级推理、分析和代码生成。",
    signupUrl: "https://console.anthropic.com/",
    capabilities: ["聊天", "分析", "代码生成"],
  },
  {
    name: "Cerebras",
    description: "为大语言模型提供行业领先速度的超快推理。",
    signupUrl: "https://cloud.cerebras.ai/",
    capabilities: ["快速推理", "聊天", "文本生成"],
  },
  {
    name: "Gemini",
    description: "Google 的多模态 AI 模型，支持文本、图像、音频和视频理解。",
    signupUrl: "https://ai.google.dev/",
    capabilities: ["多模态", "聊天", "视觉", "视频"],
  },
  {
    name: "MiniMax",
    description: "用于视频生成和多模态内容创作的高级 AI 模型。",
    signupUrl: "https://www.minimax.io/",
    capabilities: ["视频生成", "聊天", "音频"],
  },
];

const ProviderCarousel: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % PROVIDERS.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + PROVIDERS.length) % PROVIDERS.length);
  }, []);

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index);
    setIsAutoPlaying(false);
    // Resume auto-play after 10 seconds of inactivity
    setTimeout(() => setIsAutoPlaying(true), 10000);
  }, []);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(nextSlide, 4000);
    return () => clearInterval(interval);
  }, [isAutoPlaying, nextSlide]);

  const handleOpenProvider = async (url: string) => {
    try {
      await window.api?.system?.openExternal?.(url);
    } catch (error) {
      console.error("Failed to open provider link:", error);
    }
  };

  const currentProvider = PROVIDERS[currentIndex];

  return (
    <div className="provider-carousel-container">
      <div className="provider-carousel-header">
        <h3 className="provider-carousel-title">支持的服务商</h3>
        <p className="provider-carousel-subtitle">
          NodeTool 已集成这些 AI 服务商。注册后即可获取 API 密钥。
        </p>
      </div>

      <div className="provider-carousel">
        <button 
          className="provider-carousel-nav provider-carousel-prev" 
          onClick={prevSlide}
          type="button"
          aria-label="上一个服务商"
        >
          ‹
        </button>
        
        <div className="provider-carousel-content">
          <div className="provider-carousel-card">
            <div className="provider-carousel-card-header">
              <h4 className="provider-carousel-name">{currentProvider.name}</h4>
            </div>
            <p className="provider-carousel-description">{currentProvider.description}</p>
            <div className="provider-carousel-capabilities">
              {currentProvider.capabilities.map((cap) => (
                <span key={cap} className="provider-carousel-tag">{cap}</span>
              ))}
            </div>
            <button
              className="provider-carousel-link"
              onClick={() => handleOpenProvider(currentProvider.signupUrl)}
              type="button"
            >
              获取 API 密钥 →
            </button>
          </div>
        </div>

        <button 
          className="provider-carousel-nav provider-carousel-next" 
          onClick={nextSlide}
          type="button"
          aria-label="下一个服务商"
        >
          ›
        </button>
      </div>

      <div className="provider-carousel-dots">
        {PROVIDERS.map((_, index) => (
          <button
            key={index}
            className={`provider-carousel-dot ${index === currentIndex ? 'active' : ''}`}
            onClick={() => goToSlide(index)}
            type="button"
            aria-label={`切换到 ${PROVIDERS[index].name}`}
          />
        ))}
      </div>
    </div>
  );
};

const BootMessage: React.FC<BootMessageProps> = ({
  message,
  showUpdateSteps,
  progressData,
  status,
  errorMessage,
  onRetry,
  onOpenLogs,
  onReinstall,
}) => {
  const isError = status === "error" || Boolean(errorMessage);
  const resolvedMessage = errorMessage ?? message;
  const isInstalling = showUpdateSteps && !isError;

  return (
    <div id="boot-message">
      <div className={`boot-panel ${isInstalling ? 'boot-panel-installing' : ''}`}>
        <div className="brand">NodeTool</div>
        <div className="brand-ring" aria-hidden="true" />

        {!isInstalling && (
          <div className="boot-logo-wrapper">
            <img src={logoUrl} className="boot-logo" alt="Nodetool" />
          </div>
        )}

        <div className="boot-text">{resolvedMessage}</div>

        {isError && (
          <div className="boot-error">
            <div className="boot-error-title">后端启动失败</div>
            <div className="boot-error-message">
              {resolvedMessage ||
                "启动后端服务器时发生意外错误。"}
            </div>
            <div className="boot-actions">
              {onRetry && (
                <button className="boot-action primary" onClick={onRetry}>
                  重试启动
                </button>
              )}
              {onOpenLogs && (
                <button className="boot-action" onClick={onOpenLogs}>
                  打开日志
                </button>
              )}
              {onReinstall && (
                <button className="boot-action" onClick={onReinstall}>
                  重新安装环境
                </button>
              )}
            </div>
          </div>
        )}

        {showUpdateSteps && (
          <div id="update-steps">
            <div className="progress-container">
              <div className="progress-label">
                <span className="action-label">
                  {progressData.action} {progressData.componentName}
                </span>
                <span>
                  <span className="progress-percentage">
                    {Math.round(progressData.progress)}%
                  </span>
                  <span className="progress-eta">
                    {progressData.eta ? ` (${progressData.eta})` : ''}
                  </span>
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress"
                  style={{ width: `${progressData.progress}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {isInstalling && <ProviderCarousel />}
      </div>
    </div>
  );
};

export default BootMessage;
