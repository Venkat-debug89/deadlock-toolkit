const { detectDeadlock, normalizeState } = require('./detection');

function cloneState(state) {
  return {
    processes: state.processes,
    resources: state.resources,
    allocation: state.allocation.map((row) => [...row]),
    request: state.request.map((row) => [...row]),
    available: [...state.available]
  };
}

function processIndex(name) {
  return Number(name.replace('P', '')) - 1;
}

function releaseProcessResources(state, index) {
  const released = [];

  for (let r = 0; r < state.resources; r += 1) {
    const amount = state.allocation[index][r];
    if (amount > 0) {
      state.available[r] += amount;
      released.push(`R${r + 1}:${amount}`);
    }
    state.allocation[index][r] = 0;
    state.request[index][r] = 0;
  }

  return released;
}

function recover(rawInput) {
  const { strategy } = rawInput;

  if (strategy !== 'terminate' && strategy !== 'preempt') {
    throw new Error('Recovery strategy must be "terminate" or "preempt".');
  }

  const state = cloneState(normalizeState(rawInput));
  return strategy === 'terminate'
    ? terminateRecovery(state)
    : preemptRecovery(state);
}

function terminateRecovery(state) {
  const steps = [];
  let detection = detectDeadlock(state);

  if (!detection.deadlock) {
    return {
      success: true,
      steps: ['No recovery needed because the system is not deadlocked.'],
      finalState: state,
      detection
    };
  }

  while (detection.deadlock) {
    const victimName = detection.processes[0];
    const victimIndex = processIndex(victimName);
    const released = releaseProcessResources(state, victimIndex);

    steps.push(
      `Terminated ${victimName}; released ${released.length ? released.join(', ') : 'no allocated resources'}.`
    );

    detection = detectDeadlock(state);
    steps.push(detection.deadlock
      ? `Deadlock still exists among ${detection.processes.join(', ')}.`
      : 'Deadlock resolved after termination.'
    );
  }

  return {
    success: true,
    steps,
    finalState: state,
    detection
  };
}

function preemptRecovery(state) {
  const steps = [];
  let detection = detectDeadlock(state);

  if (!detection.deadlock) {
    return {
      success: true,
      steps: ['No recovery needed because the system is not deadlocked.'],
      finalState: state,
      detection
    };
  }

  while (detection.deadlock) {
    const victimIndex = choosePreemptionVictim(state, detection.processes);
    const victimName = `P${victimIndex + 1}`;
    const released = releaseOneResourceFromVictim(state, victimIndex);

    if (!released) {
      releaseProcessResources(state, victimIndex);
      steps.push(`${victimName} had no resources → forced release.`);
    } else {
      steps.push(`Preempted ${released.amount} unit of ${released.resource} from ${victimName}.`);
    }

    detection = detectDeadlock(state);
    steps.push(detection.deadlock
      ? `Deadlock still exists among ${detection.processes.join(', ')}.`
      : 'Deadlock resolved after resource preemption.'
    );
  }

  return {
    success: true,
    steps,
    finalState: state,
    detection
  };
}

function choosePreemptionVictim(state, deadlockedProcesses) {
  const indexes = deadlockedProcesses.map(processIndex);

  return indexes
    .map((index) => ({
      index,
      totalAllocated: state.allocation[index].reduce((sum, value) => sum + value, 0)
    }))
    .sort((a, b) => b.totalAllocated - a.totalAllocated || a.index - b.index)[0].index;
}

function releaseOneResourceFromVictim(state, victimIndex) {
  let bestResource = -1;
  let bestAmount = 0;

  for (let r = 0; r < state.resources; r += 1) {
    if (state.allocation[victimIndex][r] > bestAmount) {
      bestAmount = state.allocation[victimIndex][r];
      bestResource = r;
    }
  }

  if (bestResource === -1) return null;

  state.allocation[victimIndex][bestResource] -= 1;
  state.available[bestResource] += 1;

  if (state.allocation[victimIndex][bestResource] === 0) {
    state.request[victimIndex][bestResource] = 0;
  }

  return {
    resource: `R${bestResource + 1}`,
    amount: 1
  };
}

module.exports = {
  recover
};
