import { getPackageDescription, needsTorchPlatformDetection } from '../packageManager';

jest.mock('electron', () => ({
  app: {
    getVersion: () => '1.0.0',
    getPath: () => '/tmp',
  },
}));

jest.mock('../config', () => ({
  getProcessEnv: () => ({}),
  getPythonPath: () => '/usr/bin/python',
  getCondaEnvPath: () => '/test/conda',
}));

jest.mock('../logger', () => ({
  logMessage: jest.fn(),
}));

jest.mock('../events', () => ({
  emitServerLog: jest.fn(),
  emitBootMessage: jest.fn(),
}));

jest.mock('../utils', () => ({
  fileExists: jest.fn().mockResolvedValue(true),
}));

jest.mock('../torchPlatformCache', () => ({
  getSavedTorchPlatform: jest.fn().mockReturnValue(null),
  getTorchIndexUrl: jest.fn().mockReturnValue(null),
  saveTorchPlatform: jest.fn(),
}));

jest.mock('../torchruntime', () => ({
  detectTorchPlatform: jest.fn().mockResolvedValue({
    platform: 'cpu',
    indexUrl: 'https://download.pytorch.org/whl/cpu',
  }),
}));

describe('package descriptions', () => {
  test('overrides nunchaku description with user-focused guidance', () => {
    const description = getPackageDescription({
      repo_id: 'nunchaku-tech/nunchaku',
      description: 'Nunchaku quantization library for efficient inference',
    });

    expect(description).toContain('FLUX 和 Qwen 图像模型');
    expect(description).toContain('Nunchaku 优化的 HuggingFace 模型');
  });

  test('overrides nodetool core description with clearer text', () => {
    const description = getPackageDescription({
      repo_id: 'nodetool-ai/nodetool-core',
      description: 'Core system',
    });

    expect(description).toContain('NodeTool 核心节点');
  });

  test('keeps non-overridden registry descriptions trimmed', () => {
    const description = getPackageDescription({
      repo_id: 'nodetool-ai/nodetool-huggingface',
      description: '  Existing description  ',
    });

    expect(description).toBe('Existing description');
  });

  test('known torch-dependent packages require torch platform detection', () => {
    expect(needsTorchPlatformDetection('nodetool-huggingface')).toBe(true);
    expect(needsTorchPlatformDetection('NodeTool_HuggingFace')).toBe(true);
    expect(needsTorchPlatformDetection('nunchaku')).toBe(true);
    expect(needsTorchPlatformDetection('nodetool-core')).toBe(false);
  });

});
