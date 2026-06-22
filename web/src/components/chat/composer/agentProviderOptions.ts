import type { AgentProvider } from "../../../lib/agent/agentTypes";

const REMOTE_AGENT_PROVIDERS: AgentProvider[] = ["morpheus", "llm"];

export function getSelectableAgentProviders(
  piWorkspaceAvailable: boolean,
  hasPersistedWorkspace: boolean
): AgentProvider[] {
  if (piWorkspaceAvailable || hasPersistedWorkspace) {
    return [...REMOTE_AGENT_PROVIDERS, "pi"];
  }
  return [...REMOTE_AGENT_PROVIDERS];
}
