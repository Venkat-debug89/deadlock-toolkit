const { buildRag, buildWaitForGraph } = require('./rag');

/**
 * Validate shape and numeric content before running algorithms.
 * Beginner note: every matrix row must match the declared number of resources.
 */
function normalizeState(input) {
  const processes = Number(input.processes);
  const resources = Number(input.resources);

  if (!Number.isInteger(processes) || processes < 1 || processes > 12) {
    throw new Error('Number of processes must be an integer from 1 to 12.');
  }

  if (!Number.isInteger(resources) || resources < 1 || resources > 12) {
    throw new Error('Number of resources must be an integer from 1 to 12.');
  }

  const allocation = normalizeMatrix(input.allocation, processes, resources, 'allocation');
  const request = normalizeMatrix(input.request, processes, resources, 'request');
  const available = normalizeVector(input.available, resources, 'available');

  return { processes, resources, allocation, request, available };
}

function normalizeMatrix(matrix, rows, columns, name) {
  if (!Array.isArray(matrix) || matrix.length !== rows) {
    throw new Error(`${name} matrix must contain ${rows} rows.`);
  }

  return matrix.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== columns) {
      throw new Error(`${name} row ${rowIndex + 1} must contain ${columns} values.`);
    }

    return row.map((value, columnIndex) => {
      const number = Number(value);
      if (!Number.isInteger(number) || number < 0) {
        throw new Error(`${name}[${rowIndex + 1}][${columnIndex + 1}] must be a non-negative integer.`);
      }
      return number;
    });
  });
}

function normalizeVector(vector, size, name) {
  if (!Array.isArray(vector) || vector.length !== size) {
    throw new Error(`${name} vector must contain ${size} values.`);
  }

  return vector.map((value, index) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 0) {
      throw new Error(`${name}[${index + 1}] must be a non-negative integer.`);
    }
    return number;
  });
}

function detectDeadlock(rawState) {
  const state = normalizeState(rawState);
  const rag = buildRag(state);
  const wfg = buildWaitForGraph(state);
  const cycle = findCycle(wfg.graph);

  return {
    deadlock: cycle.length > 0,
    processes: cycle,
    message: cycle.length > 0
      ? `Deadlock detected among ${cycle.join(', ')}.`
      : 'No deadlock detected in the current resource allocation graph.',
    rag,
    wfg
  };
}

/**
 * DFS cycle detection for a directed graph.
 * visited: node is fully processed.
 * visiting: node is currently in the recursion stack.
 */
function findCycle(graph) {
  const visited = new Set();
  const visiting = new Set();
  const stack = [];

  function dfs(node) {
    visiting.add(node);
    stack.push(node);

    for (const neighbor of graph[node] || []) {
      if (!visited.has(neighbor) && !visiting.has(neighbor)) {
        const cycle = dfs(neighbor);
        if (cycle.length) return cycle;
      }

      if (visiting.has(neighbor)) {
        const cycleStart = stack.indexOf(neighbor);
        return stack.slice(cycleStart);
      }
    }

    visiting.delete(node);
    visited.add(node);
    stack.pop();
    return [];
  }

  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle.length) return cycle;
    }
  }

  return [];
}

module.exports = {
  detectDeadlock,
  findCycle,
  normalizeState
};
