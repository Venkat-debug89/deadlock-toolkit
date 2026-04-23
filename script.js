const processInput = document.getElementById('processCount');
const resourceInput = document.getElementById('resourceCount');
const allocationHost = document.getElementById('allocationMatrix');
const requestHost = document.getElementById('requestMatrix');
const availableHost = document.getElementById('availableVector');
const errorBox = document.getElementById('errorBox');
const statusBadge = document.getElementById('statusBadge');
const messageText = document.getElementById('messageText');
const logList = document.getElementById('logList');
const graphSvg = document.getElementById('graphSvg');

let latestDetection = null;

const sampleState = {
  processes: 3,
  resources: 3,
  allocation: [
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 0]
  ],
  request: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1]
  ],
  available: [0, 0, 0]
};

function clampCount(value) {
  const number = Number(value);
  if (!Number.isInteger(number)) return 1;
  return Math.min(12, Math.max(1, number));
}

function createMatrixTable(host, idPrefix, rows, columns) {
  const table = document.createElement('table');
  table.className = 'matrix-table';

  const header = document.createElement('tr');
  header.appendChild(document.createElement('th'));
  for (let c = 0; c < columns; c += 1) {
    const th = document.createElement('th');
    th.textContent = `R${c + 1}`;
    header.appendChild(th);
  }
  table.appendChild(header);

  for (let r = 0; r < rows; r += 1) {
    const tr = document.createElement('tr');
    const label = document.createElement('th');
    label.textContent = `P${r + 1}`;
    tr.appendChild(label);

    for (let c = 0; c < columns; c += 1) {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '1';
      input.value = '0';
      input.dataset.matrix = idPrefix;
      input.dataset.row = String(r);
      input.dataset.column = String(c);
      td.appendChild(input);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }

  host.replaceChildren(table);
}

function createAvailableVector(columns) {
  const table = document.createElement('table');
  table.className = 'matrix-table';
  const tr = document.createElement('tr');

  for (let c = 0; c < columns; c += 1) {
    const td = document.createElement('td');
    const label = document.createElement('div');
    label.className = 'mb-1 text-center text-xs font-bold text-slate-400';
    label.textContent = `R${c + 1}`;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '1';
    input.value = '0';
    input.dataset.vector = 'available';
    input.dataset.column = String(c);
    td.appendChild(label);
    td.appendChild(input);
    tr.appendChild(td);
  }

  table.appendChild(tr);
  availableHost.replaceChildren(table);
}

function rebuildInputs() {
  const processes = clampCount(processInput.value);
  const resources = clampCount(resourceInput.value);
  processInput.value = processes;
  resourceInput.value = resources;
  createMatrixTable(allocationHost, 'allocation', processes, resources);
  createMatrixTable(requestHost, 'request', processes, resources);
  createAvailableVector(resources);
  latestDetection = null;
  renderGraph(buildState(), []);
}

function readNonNegativeInteger(input, label) {
  const value = Number(input.value);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}

function buildState() {
  const processes = clampCount(processInput.value);
  const resources = clampCount(resourceInput.value);
  const allocation = Array.from({ length: processes }, () => Array(resources).fill(0));
  const request = Array.from({ length: processes }, () => Array(resources).fill(0));
  const available = Array(resources).fill(0);

  document.querySelectorAll('[data-matrix]').forEach((input) => {
    const matrix = input.dataset.matrix === 'allocation' ? allocation : request;
    const row = Number(input.dataset.row);
    const column = Number(input.dataset.column);
    matrix[row][column] = readNonNegativeInteger(input, `${input.dataset.matrix} P${row + 1}, R${column + 1}`);
  });

  document.querySelectorAll('[data-vector="available"]').forEach((input) => {
    const column = Number(input.dataset.column);
    available[column] = readNonNegativeInteger(input, `available R${column + 1}`);
  });

  return { processes, resources, allocation, request, available };
}

function fillState(state) {
  processInput.value = state.processes;
  resourceInput.value = state.resources;
  rebuildInputs();

  state.allocation.forEach((row, r) => row.forEach((value, c) => {
    document.querySelector(`[data-matrix="allocation"][data-row="${r}"][data-column="${c}"]`).value = value;
  }));

  state.request.forEach((row, r) => row.forEach((value, c) => {
    document.querySelector(`[data-matrix="request"][data-row="${r}"][data-column="${c}"]`).value = value;
  }));

  state.available.forEach((value, c) => {
    document.querySelector(`[data-vector="available"][data-column="${c}"]`).value = value;
  });
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function clearError() {
  errorBox.textContent = '';
  errorBox.classList.add('hidden');
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }
  return data;
}

async function detect() {
  try {
    clearError();
    const result = await postJson('/detect', buildState());
    latestDetection = result;
    updateOutput(result);
    renderGraph(buildState(), result.processes);
  } catch (error) {
    showError(error.message);
  }
}

async function recover(strategy) {
  try {
    clearError();
    const result = await postJson('/recover', { ...buildState(), strategy });
    latestDetection = result.detection;
    updateOutput(result.detection, result.steps);
    renderGraph(result.finalState, result.detection.processes);
  } catch (error) {
    showError(error.message);
  }
}

function updateOutput(result, logs = []) {
  const deadlocked = result.deadlock;
  statusBadge.textContent = deadlocked ? 'Deadlock Detected' : 'No Deadlock';
  statusBadge.className = deadlocked
    ? 'mt-4 inline-flex rounded-full border border-rose-400/50 bg-rose-950 px-3 py-1 text-sm font-semibold text-rose-200'
    : 'mt-4 inline-flex rounded-full border border-emerald-400/50 bg-emerald-950 px-3 py-1 text-sm font-semibold text-emerald-200';

  messageText.textContent = result.message;
  logList.replaceChildren();

  const lines = logs.length ? logs : [
    deadlocked
      ? `Deadlocked processes: ${result.processes.join(', ')}`
      : 'The Wait-For Graph contains no directed cycle.'
  ];

  lines.forEach((line) => {
    const li = document.createElement('li');
    li.className = 'rounded-md border border-slate-800 bg-slate-950 px-3 py-2';
    li.textContent = line;
    logList.appendChild(li);
  });
}

function renderGraph(state, deadlockedProcesses = []) {
  const width = graphSvg.clientWidth || 900;
  const height = 520;
  graphSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  graphSvg.replaceChildren();

  const processNodes = [];
  const resourceNodes = [];
  const deadlockSet = new Set(deadlockedProcesses);

  for (let p = 0; p < state.processes; p += 1) {
    processNodes.push({
      id: `P${p + 1}`,
      type: 'process',
      x: width * 0.23,
      y: 70 + p * ((height - 140) / Math.max(1, state.processes - 1))
    });
  }

  for (let r = 0; r < state.resources; r += 1) {
    resourceNodes.push({
      id: `R${r + 1}`,
      type: 'resource',
      x: width * 0.72,
      y: 70 + r * ((height - 140) / Math.max(1, state.resources - 1))
    });
  }

  const nodes = [...processNodes, ...resourceNodes];
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  drawMarkers();

  for (let p = 0; p < state.processes; p += 1) {
    for (let r = 0; r < state.resources; r += 1) {
      if (state.request[p][r] > 0) {
        drawEdge(byId[`P${p + 1}`], byId[`R${r + 1}`], '#38bdf8', `${state.request[p][r]}`, false);
      }
      if (state.allocation[p][r] > 0) {
        const isDeadlockEdge = deadlockSet.has(`P${p + 1}`);
        drawEdge(byId[`R${r + 1}`], byId[`P${p + 1}`], isDeadlockEdge ? '#fb7185' : '#a78bfa', `${state.allocation[p][r]}`, isDeadlockEdge);
      }
    }
  }

  nodes.forEach((node) => drawNode(node, deadlockSet.has(node.id)));
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function drawMarkers() {
  const defs = svgElement('defs');
  [
    ['arrowBlue', '#38bdf8'],
    ['arrowPurple', '#a78bfa'],
    ['arrowRed', '#fb7185']
  ].forEach(([id, color]) => {
    const marker = svgElement('marker', {
      id,
      markerWidth: '10',
      markerHeight: '10',
      refX: '9',
      refY: '3',
      orient: 'auto',
      markerUnits: 'strokeWidth'
    });
    marker.appendChild(svgElement('path', { d: 'M0,0 L0,6 L9,3 z', fill: color }));
    defs.appendChild(marker);
  });
  graphSvg.appendChild(defs);
}

function drawEdge(from, to, color, label, emphasized) {
  const marker = color === '#fb7185' ? 'arrowRed' : color === '#a78bfa' ? 'arrowPurple' : 'arrowBlue';
  const line = svgElement('line', {
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    stroke: color,
    'stroke-width': emphasized ? '3.5' : '2',
    'stroke-opacity': emphasized ? '1' : '0.68',
    'marker-end': `url(#${marker})`,
    class: 'graph-edge'
  });
  graphSvg.appendChild(line);

  if (label !== '1') {
    const text = svgElement('text', {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2 - 8,
      fill: '#e2e8f0',
      'font-size': '12',
      'font-weight': '700',
      'text-anchor': 'middle'
    });
    text.textContent = label;
    graphSvg.appendChild(text);
  }
}

function drawNode(node, deadlocked) {
  if (node.type === 'process') {
    graphSvg.appendChild(svgElement('circle', {
      cx: node.x,
      cy: node.y,
      r: '25',
      fill: deadlocked ? '#be123c' : '#0891b2',
      stroke: deadlocked ? '#fecdd3' : '#67e8f9',
      'stroke-width': '2.5'
    }));
  } else {
    graphSvg.appendChild(svgElement('rect', {
      x: node.x - 25,
      y: node.y - 25,
      width: '50',
      height: '50',
      rx: '6',
      fill: '#6d28d9',
      stroke: '#ddd6fe',
      'stroke-width': '2.5'
    }));
  }

  const text = svgElement('text', {
    x: node.x,
    y: node.y + 5,
    fill: '#f8fafc',
    'font-size': '14',
    'font-weight': '800',
    'text-anchor': 'middle'
  });
  text.textContent = node.id;
  graphSvg.appendChild(text);
}

document.getElementById('detectBtn').addEventListener('click', detect);
document.getElementById('terminateBtn').addEventListener('click', () => recover('terminate'));
document.getElementById('preemptBtn').addEventListener('click', () => recover('preempt'));
document.getElementById('resetBtn').addEventListener('click', () => {
  processInput.value = '3';
  resourceInput.value = '3';
  rebuildInputs();
  statusBadge.textContent = 'Ready';
  statusBadge.className = 'mt-4 inline-flex rounded-full border border-slate-700 px-3 py-1 text-sm font-semibold text-slate-300';
  messageText.textContent = 'Enter a system state or load sample data to begin.';
  logList.replaceChildren();
  clearError();
});
document.getElementById('sampleBtn').addEventListener('click', () => {
  fillState(sampleState);
  clearError();
  renderGraph(sampleState, []);
});

processInput.addEventListener('change', rebuildInputs);
resourceInput.addEventListener('change', rebuildInputs);
window.addEventListener('resize', () => renderGraph(buildState(), latestDetection?.processes || []));

rebuildInputs();
