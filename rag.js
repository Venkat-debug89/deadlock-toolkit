/**
 * Helpers for building Resource Allocation Graph (RAG) and Wait-For Graph (WFG).
 *
 * RAG:
 * - Process -> Resource means the process is requesting that resource.
 * - Resource -> Process means the resource is allocated to that process.
 *
 * WFG:
 * - Process -> Process means one process is waiting for a resource held by another.
 */

function processName(index) {
  return `P${index + 1}`;
}

function resourceName(index) {
  return `R${index + 1}`;
}

function buildRag(state) {
  const edges = [];

  for (let p = 0; p < state.processes; p += 1) {
    for (let r = 0; r < state.resources; r += 1) {
      const allocated = state.allocation[p][r];
      const requested = state.request[p][r];

      if (allocated > 0) {
        edges.push({
          from: resourceName(r),
          to: processName(p),
          type: 'allocation',
          count: allocated
        });
      }

      if (requested > 0) {
        edges.push({
          from: processName(p),
          to: resourceName(r),
          type: 'request',
          count: requested
        });
      }
    }
  }

  return {
    processes: Array.from({ length: state.processes }, (_, index) => processName(index)),
    resources: Array.from({ length: state.resources }, (_, index) => resourceName(index)),
    edges
  };
}

function buildWaitForGraph(state) {
  const graph = {};
  const edges = [];

  for (let p = 0; p < state.processes; p += 1) {
    graph[processName(p)] = [];
  }

  for (let waiter = 0; waiter < state.processes; waiter += 1) {
    for (let resource = 0; resource < state.resources; resource += 1) {
      const requestedUnits = state.request[waiter][resource];
      if (requestedUnits <= 0) continue;

      // A process is only waiting when its request cannot be satisfied
      // immediately by the currently available units of that resource.
      if (state.available[resource] >= requestedUnits) continue;

      for (let holder = 0; holder < state.processes; holder += 1) {
        const holderHasResource = state.allocation[holder][resource] > 0;
        const notSelf = holder !== waiter;

        if (holderHasResource && notSelf) {
          const from = processName(waiter);
          const to = processName(holder);

          if (!graph[from].includes(to)) {
            graph[from].push(to);
            edges.push({
              from,
              to,
              resource: resourceName(resource)
            });
          }
        }
      }
    }
  }

  return { graph, edges };
}

module.exports = {
  buildRag,
  buildWaitForGraph,
  processName,
  resourceName
};
