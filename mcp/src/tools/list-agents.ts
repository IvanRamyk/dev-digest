/**
 * devdigest_list_agents — GET /agents.
 *
 * Read-only, no inputs. Returns the seeded/configured review agents so a client
 * can pick a valid `agent` name for devdigest_run_agent_on_pr. Agent metadata is
 * first-party (not PR content), so it is returned as plain JSON, not wrapped.
 */
import type { ApiClient } from '../api/client.js';
import { okJson, toolError, type ToolTextResult } from './_shared.js';
import { ApiUnreachableError } from '../api/errors.js';
import { unreachableMessage } from './errors-forward.js';

export function listAgentsHandler(client: ApiClient) {
  return async (): Promise<ToolTextResult> => {
    try {
      const agents = await client.getAgents();
      return okJson({
        agents: agents.map((a) => ({
          name: a.name,
          description: a.description,
          provider: a.provider,
          model: a.model,
          enabled: a.enabled,
        })),
      });
    } catch (err) {
      if (err instanceof ApiUnreachableError) return toolError(unreachableMessage(err));
      return toolError((err as Error).message);
    }
  };
}
