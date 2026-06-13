import React, { useEffect, useRef } from 'react';

interface LogContainerProps {
  logs: string[];
  isExpanded: boolean;
  onToggle: () => void;
}

const LogContainer: React.FC<LogContainerProps> = ({ logs, isExpanded, onToggle }) => {
  const logElementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logElementRef.current) {
      logElementRef.current.scrollTop = logElementRef.current.scrollHeight;
    }
  }, [logs]);

  const handleOpenLogFile = async () => {
    await window.api.system.openLogFile();
  };

  return (
    <div id="log-container" className={isExpanded ? 'expanded' : 'collapsed'}>
      <div id="log-controls">
        <button id="log-toggle" className="log-button" onClick={onToggle}>
          <span>{isExpanded ? '▼ 隐藏日志' : '▲ 显示日志'}</span>
        </button>
        <button id="open-log-file" className="log-button" onClick={handleOpenLogFile}>
          <span aria-label="打开日志文件">📁</span>
        </button>
      </div>
      <div id="log" ref={logElementRef}>
        {logs.map((log, index) => (
          <p key={index} className="log-line">
            {log}
          </p>
        ))}
      </div>
    </div>
  );
};

export default LogContainer;
