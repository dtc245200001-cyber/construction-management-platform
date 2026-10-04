"use strict";

function findPath(adjList, start, target) {
  if (start === target) {
    return [start];
  }

  const queue = [start];
  let head = 0;

  const parent = new Map();
  parent.set(start, null);

  while (head < queue.length) {
    const current = queue[head++];
    const neighbors = adjList.get(current) || [];

    for (const next of neighbors) {
      if (parent.has(next)) {
        continue;
      }

      parent.set(next, current);

      if (next === target) {
        const path = [];
        let node = target;

        while (node !== null) {
          path.push(node);
          node = parent.get(node);
        }

        path.reverse();
        return path;
      }

      queue.push(next);
    }
  }

  return null;
}

function findCycleCreatedByEdge(
  nodeIds,
  existingEdges,
  predecessorId,
  successorId
) {
  const predecessor = Number(predecessorId);
  const successor = Number(successorId);

  if (predecessor === successor) {
    return [predecessor, predecessor];
  }

  const adjList = new Map();

  for (const id of nodeIds) {
    adjList.set(Number(id), []);
  }

  for (const edge of existingEdges) {
    const from = Number(edge.predecessor_id);
    const to = Number(edge.successor_id);

    if (adjList.has(from) && adjList.has(to)) {
      adjList.get(from).push(to);
    }
  }

  const reversePath = findPath(
    adjList,
    successor,
    predecessor
  );

  if (!reversePath) {
    return null;
  }

  return [
    predecessor,
    ...reversePath,
  ];
}

function buildCycleDescription(cycleIds, itemNames) {
  if (!cycleIds) {
    return null;
  }

  const names = cycleIds.map((id) => {
    return itemNames.get(Number(id)) || `#${id}`;
  });

  return {
    cycleIds,
    cycleNames: names,
    cyclePath: names.join(" → "),
  };
}

module.exports = {
  findPath,
  findCycleCreatedByEdge,
  buildCycleDescription,
};