const size = 8;
const candyTypes = 6;
let betPerSwap = 1;
const baseCandyValue = 0.05;
const feverTarget = 100;
const boardEventInterval = 10;
const maxCascadeSteps = 24;

const boardEl = document.querySelector("#board");
const balanceEl = document.querySelector("#balance");
const betEl = document.querySelector("#bet");
const winEl = document.querySelector("#win");
const eventCountdownEl = document.querySelector("#event-countdown");
const feverMeterEl = document.querySelector("#fever-meter");
const messageEl = document.querySelector("#message");
const cascadeLabelEl = document.querySelector("#cascade-label");
const restartEl = document.querySelector("#restart");
const shuffleEl = document.querySelector("#shuffle");
const shuffleCostEl = document.querySelector("#shuffle-cost");
const hintEl = document.querySelector("#hint");
const betDownEl = document.querySelector("#bet-down");
const betUpEl = document.querySelector("#bet-up");
const turboEl = document.querySelector("#turbo");

let board = [];
let selected = null;
let balance = 100;
let lastWin = 0;
let fever = 0;
let eventCountdown = boardEventInterval;
let locked = false;
let hintPair = null;
let audio = null;
let fallMap = new Map();

function candyValue() {
  return baseCandyValue * betPerSwap;
}

function initAudio() {
  if (audio) return audio;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  const context = new AudioContext();
  const master = context.createGain();
  const sfx = context.createGain();
  master.gain.value = 0.42;
  sfx.gain.value = 0.55;
  sfx.connect(master);
  master.connect(context.destination);

  audio = { context, sfx };
  return audio;
}

function resumeAudio() {
  const next = initAudio();
  if (next?.context.state === "suspended") next.context.resume();
  return next;
}

function playTone(frequency, duration = 0.08, type = "sine", volume = 0.18) {
  const next = resumeAudio();
  if (!next) return;
  const now = next.context.currentTime;
  const oscillator = next.context.createOscillator();
  const gain = next.context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(next.sfx);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playSound(name, level = 1) {
  if (name === "swap") playTone(360, 0.06, "triangle", 0.11);
  else if (name === "clear") [620, 780, 980].forEach((tone, index) => setTimeout(() => playTone(tone + level * 55, 0.075 + level * 0.008, "sine", Math.min(0.2, 0.1 + level * 0.018)), index * 35));
  else if (name === "special") [220, 440, 880, 1174].forEach((tone, index) => setTimeout(() => playTone(tone + level * 35, 0.11, "square", Math.min(0.18, 0.09 + level * 0.014)), index * 45));
  else if (name === "create") [520, 780, 1040].forEach((tone, index) => setTimeout(() => playTone(tone, 0.075, "triangle", 0.11), index * 42));
  else if (name === "rocket") [330, 660, 990].forEach((tone, index) => setTimeout(() => playTone(tone + level * 26, 0.095, "sawtooth", 0.09), index * 32));
  else if (name === "bomb") [180, 240, 360, 720].forEach((tone, index) => setTimeout(() => playTone(tone, 0.13, "square", 0.1), index * 38));
  else if (name === "wheel") [294, 370, 466, 587, 740].forEach((tone, index) => setTimeout(() => playTone(tone, 0.08, "triangle", 0.12), index * 90));
  else if (name === "fever") [659, 784, 988, 1318].forEach((tone, index) => setTimeout(() => playTone(tone, 0.11, "sine", 0.13), index * 70));
  else if (name === "rainbow") [392, 523, 659, 784, 1046].forEach((tone, index) => setTimeout(() => playTone(tone, 0.09, "triangle", 0.12), index * 38));
  else if (name === "invalid") playTone(150, 0.12, "sawtooth", 0.08);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, turboEl.checked ? Math.max(40, ms * 0.35) : ms));
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function keyOf(row, col) {
  return `${row},${col}`;
}

function parseKey(key) {
  const [row, col] = key.split(",").map(Number);
  return { row, col };
}

function makeCandy(type = randomInt(candyTypes)) {
  return {
    type,
    special: Math.random() < 0.055 ? ["rocket-h", "rocket-v", "bomb", "rainbow"][randomInt(4)] : null,
    feature: null,
    locked: false,
    plastic: false,
    crate: false,
  };
}

function maybeDecorate(tile, row) {
  const roll = Math.random();
  if (roll < 0.022 && row < size - 1) tile.feature = "spinner";
  return tile;
}

function newBoard() {
  const next = Array.from({ length: size }, () => Array(size).fill(null));

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      let type = randomInt(candyTypes);
      while (
        (col >= 2 && next[row][col - 1].type === type && next[row][col - 2].type === type) ||
        (row >= 2 && next[row - 1][col].type === type && next[row - 2][col].type === type)
      ) {
        type = randomInt(candyTypes);
      }
      next[row][col] = maybeDecorate(makeCandy(type), row);
    }
  }

  addFeatureRain(next, 2);
  return next;
}

function formatCredits(value) {
  return value.toFixed(2);
}

function setBet(nextBet) {
  betPerSwap = Math.max(0.25, Math.min(10, Number(nextBet.toFixed(2))));
  render();
}

function render() {
  boardEl.innerHTML = "";

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const tile = board[row][col];
      const cell = document.createElement("button");
      const candy = document.createElement("span");
      const isSelected = selected && selected.row === row && selected.col === col;
      const isHint =
        hintPair &&
        hintPair.some((point) => point.row === row && point.col === col);

      cell.type = "button";
      cell.className = [
        "cell",
        isSelected || isHint ? "selected" : "",
        fallMap.has(keyOf(row, col)) ? "falling" : "",
        tile.special ? `special-${tile.special}` : "",
        tile.feature ? `feature-${tile.feature}` : "",
        tile.locked ? "locked" : "",
        tile.plastic ? "plastic" : "",
        tile.crate ? "crate" : "",
      ]
        .filter(Boolean)
        .join(" ");
      cell.dataset.row = row;
      cell.dataset.col = col;
      if (fallMap.has(keyOf(row, col))) {
        cell.style.setProperty("--drop-start", `${fallMap.get(keyOf(row, col)) * -108}%`);
      }
      cell.setAttribute("aria-label", `row ${row + 1} column ${col + 1}`);

      candy.className = `candy type-${tile.type}`;
      cell.append(candy);
      boardEl.append(cell);
    }
  }

  balanceEl.textContent = formatCredits(balance);
  betEl.textContent = formatCredits(betPerSwap);
  shuffleCostEl.textContent = `Cost ${formatCredits(betPerSwap)} BET`;
  winEl.textContent = formatCredits(lastWin);
  eventCountdownEl.textContent = `${eventCountdown} Moves`;
  feverMeterEl.value = fever;
  if (fallMap.size) setTimeout(() => fallMap = new Map(), 0);
}

function isAdjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function canSwap(a, b) {
  return (
    isAdjacent(a, b) &&
    !board[a.row][a.col].feature &&
    !board[b.row][b.col].feature &&
    !board[a.row][a.col].locked &&
    !board[b.row][b.col].locked
  );
}

function swap(a, b) {
  [board[a.row][a.col], board[b.row][b.col]] = [board[b.row][b.col], board[a.row][a.col]];
}

function findMatches(source = board) {
  const groups = [];
  const matchType = (row, col) => {
    if (row < 0 || row >= size || col < 0 || col >= size) return null;
    const tile = source[row][col];
    if (!tile || tile.feature || tile.special === "rainbow") return null;
    return tile.type;
  };

  for (let row = 0; row < size; row += 1) {
    let start = 0;
    for (let col = 1; col <= size; col += 1) {
      const current = col < size ? matchType(row, col) : null;
      const previous = matchType(row, start);
      if (current !== previous) {
        if (previous !== null && col - start >= 3) {
          groups.push(Array.from({ length: col - start }, (_, index) => ({ row, col: start + index })));
        }
        start = col;
      }
    }
  }

  for (let col = 0; col < size; col += 1) {
    let start = 0;
    for (let row = 1; row <= size; row += 1) {
      const current = row < size ? matchType(row, col) : null;
      const previous = matchType(start, col);
      if (current !== previous) {
        if (previous !== null && row - start >= 3) {
          groups.push(Array.from({ length: row - start }, (_, index) => ({ row: start + index, col })));
        }
        start = row;
      }
    }
  }

  return groups;
}

function groupOrientation(group) {
  return group.every((point) => point.row === group[0].row) ? "h" : "v";
}

function groupType(group) {
  return board[group[0].row][group[0].col].type;
}

function pointInGroup(group, point) {
  return group.some((next) => next.row === point.row && next.col === point.col);
}

function groupsTouchPoints(groups, points) {
  return groups.some((group) => points.some((point) => pointInGroup(group, point)));
}

function centerPoint(group) {
  return group[Math.floor(group.length / 2)];
}

function isEndpoint(group, point) {
  const first = group[0];
  const last = group[group.length - 1];
  return pointEquals(first, point) || pointEquals(last, point);
}

function analyzeSpecialCreations(groups) {
  const creations = new Map();
  const horizontal = groups.filter((group) => groupOrientation(group) === "h");
  const vertical = groups.filter((group) => groupOrientation(group) === "v");

  for (const hGroup of horizontal) {
    for (const vGroup of vertical) {
      if (groupType(hGroup) !== groupType(vGroup)) continue;
      const intersection = hGroup.find((point) => pointInGroup(vGroup, point));
      if (!intersection) continue;
      const uniqueKeys = new Set([...hGroup, ...vGroup].map(({ row, col }) => keyOf(row, col)));
      if (uniqueKeys.size === 5 && hGroup.length === 3 && vGroup.length === 3 && isEndpoint(hGroup, intersection) && isEndpoint(vGroup, intersection)) {
        creations.set(keyOf(intersection.row, intersection.col), {
          row: intersection.row,
          col: intersection.col,
          special: "bomb",
          type: groupType(hGroup),
        });
      }
    }
  }

  for (const group of groups) {
    const orientation = groupOrientation(group);
    const point = centerPoint(group);
    const key = keyOf(point.row, point.col);
    if (creations.has(key)) continue;
    if (group.length >= 5) {
      creations.set(key, {
        row: point.row,
        col: point.col,
        special: "rainbow",
        type: groupType(group),
      });
    } else if (group.length === 4) {
      creations.set(key, {
        row: point.row,
        col: point.col,
        special: orientation === "h" ? "rocket-h" : "rocket-v",
        type: groupType(group),
      });
    }
  }

  return [...creations.values()];
}

function applySpecialCreations(groups, clearKeys) {
  const creations = analyzeSpecialCreations(groups).filter((creation) => clearKeys.has(keyOf(creation.row, creation.col)));
  creations.forEach((creation) => {
    const key = keyOf(creation.row, creation.col);
    clearKeys.delete(key);
    board[creation.row][creation.col] = {
      type: creation.type,
      special: creation.special,
      feature: null,
      locked: false,
      plastic: false,
      crate: false,
    };
  });
  return creations;
}

function findValidMove() {
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      for (const [rowStep, colStep] of [
        [0, 1],
        [1, 0],
      ]) {
        const a = { row, col };
        const b = { row: row + rowStep, col: col + colStep };
        if (b.row >= size || b.col >= size || !canSwap(a, b)) continue;
        if (getSwapAction(a, b)) return [a, b];
        swap(a, b);
        const valid = groupsTouchPoints(findMatches(), [a, b]);
        swap(a, b);
        if (valid) return [a, b];
      }
    }
  }
  return null;
}

function markMatches(keys) {
  keys.forEach((key) => {
    const { row, col } = parseKey(key);
    boardEl.children[row * size + col]?.classList.add("matching");
    createBurst(row, col, keys.size > 8);
  });
}

function markPreview(keys) {
  keys.forEach((key) => {
    const { row, col } = parseKey(key);
    boardEl.children[row * size + col]?.classList.add("previewing");
  });
}

function markTransform(keys) {
  keys.forEach((key) => {
    const { row, col } = parseKey(key);
    boardEl.children[row * size + col]?.classList.add("transforming");
  });
}

function createBurst(row, col, large = false) {
  const cell = boardEl.children[row * size + col];
  if (!cell) return;
  const boardRect = boardEl.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  const x = `${cellRect.left - boardRect.left + cellRect.width / 2}px`;
  const y = `${cellRect.top - boardRect.top + cellRect.height / 2}px`;
  const burst = document.createElement("span");
  burst.className = "burst";
  burst.style.setProperty("--x", x);
  burst.style.setProperty("--y", y);
  boardEl.append(burst);
  if (large) {
    const wave = document.createElement("span");
    wave.className = "shockwave";
    wave.style.setProperty("--x", x);
    wave.style.setProperty("--y", y);
    boardEl.append(wave);
    setTimeout(() => wave.remove(), 620);
  }
  setTimeout(() => burst.remove(), 620);
}

function pulseBoard() {
  document.querySelector(".board-wrap").classList.add("combo-flash");
  setTimeout(() => document.querySelector(".board-wrap").classList.remove("combo-flash"), 430);
}

function createSpecialEffect(kind, row, col) {
  const cell = boardEl.children[row * size + col];
  if (!cell) return;
  const boardRect = boardEl.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  const x = `${cellRect.left - boardRect.left + cellRect.width / 2}px`;
  const y = `${cellRect.top - boardRect.top + cellRect.height / 2}px`;
  const effect = document.createElement("span");
  effect.className =
    kind === "rocket-h" ? "rocket-line-h" :
    kind === "rocket-v" ? "rocket-line-v" :
    kind === "rainbow" ? "rainbow-wave" :
    "bomb-ring";
  effect.style.setProperty("--x", x);
  effect.style.setProperty("--y", y);
  boardEl.append(effect);
  setTimeout(() => effect.remove(), 950);
}

function createRainbowTransformEffect(row, col, keys) {
  createSpecialEffect("rainbow", row, col);
  const source = boardEl.children[row * size + col];
  if (!source) return;
  const boardRect = boardEl.getBoundingClientRect();
  const sourceRect = source.getBoundingClientRect();
  const startX = sourceRect.left - boardRect.left + sourceRect.width / 2;
  const startY = sourceRect.top - boardRect.top + sourceRect.height / 2;

  keys.forEach((key, index) => {
    const { row: targetRow, col: targetCol } = parseKey(key);
    const target = boardEl.children[targetRow * size + targetCol];
    if (!target) return;
    const targetRect = target.getBoundingClientRect();
    const endX = targetRect.left - boardRect.left + targetRect.width / 2;
    const endY = targetRect.top - boardRect.top + targetRect.height / 2;
    const beam = document.createElement("span");
    beam.className = "rainbow-beam";
    beam.style.setProperty("--x", `${startX}px`);
    beam.style.setProperty("--y", `${startY}px`);
    beam.style.setProperty("--tx", `${endX - startX}px`);
    beam.style.setProperty("--ty", `${endY - startY}px`);
    beam.style.setProperty("--delay", `${Math.min(index, 18) * 18}ms`);
    boardEl.append(beam);
    setTimeout(() => beam.remove(), 900);
  });
}

function createTileFlash(className, row, col, delay = 0) {
  const cell = boardEl.children[row * size + col];
  if (!cell) return;
  const boardRect = boardEl.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  const effect = document.createElement("span");
  effect.className = className;
  effect.style.setProperty("--x", `${cellRect.left - boardRect.left + cellRect.width / 2}px`);
  effect.style.setProperty("--y", `${cellRect.top - boardRect.top + cellRect.height / 2}px`);
  effect.style.setProperty("--delay", `${delay}ms`);
  boardEl.append(effect);
  setTimeout(() => effect.remove(), 900 + delay);
}

function createRocketRunEffect(kind, row, col) {
  const steps = [];
  if (kind === "rocket-h") {
    for (let nextCol = 0; nextCol < size; nextCol += 1) steps.push({ row, col: nextCol, distance: Math.abs(nextCol - col) });
  } else {
    for (let nextRow = 0; nextRow < size; nextRow += 1) steps.push({ row: nextRow, col, distance: Math.abs(nextRow - row) });
  }
  steps.forEach(({ row: nextRow, col: nextCol, distance }) => {
    if (!board[nextRow][nextCol]?.feature) createTileFlash("rocket-hit", nextRow, nextCol, distance * 34);
  });
}

function createBombBlastEffect(row, col, radius = 1) {
  for (let nextRow = row - radius; nextRow <= row + radius; nextRow += 1) {
    for (let nextCol = col - radius; nextCol <= col + radius; nextCol += 1) {
      if (nextRow < 0 || nextRow >= size || nextCol < 0 || nextCol >= size) continue;
      if (board[nextRow][nextCol]?.feature) continue;
      const distance = Math.abs(nextRow - row) + Math.abs(nextCol - col);
      createTileFlash("bomb-hit", nextRow, nextCol, distance * 38);
    }
  }
}

function specialPriority(special) {
  if (special === "rocket-h" || special === "rocket-v") return 1;
  if (special === "bomb") return 2;
  if (special === "rainbow") return 3;
  return 9;
}

function takeNextSpecialTrigger(queue) {
  let bestIndex = 0;
  let bestPriority = Infinity;
  for (let index = 0; index < queue.length; index += 1) {
    const { row, col } = queue[index];
    const priority = specialPriority(board[row]?.[col]?.special);
    if (priority < bestPriority) {
      bestPriority = priority;
      bestIndex = index;
    }
  }
  return queue.splice(bestIndex, 1)[0];
}

function addSpecialEffects(keys) {
  let specialCount = 0;
  const immuneFeatureKeys = [...keys].filter((key) => {
    const { row, col } = parseKey(key);
    return !board[row][col]?.feature;
  });
  const queue = immuneFeatureKeys.map((key) => ({ ...parseKey(key), triggerType: null }));
  const clearKeys = new Set(immuneFeatureKeys);

  while (queue.length) {
    const { row, col, triggerType } = takeNextSpecialTrigger(queue);
    const tile = board[row][col];
    if (!tile?.special) continue;

    specialCount += 1;
    const special = tile.special;
    const sourceType = tile.type;
    tile.special = null;

    const add = (nextRow, nextCol) => {
      if (nextRow < 0 || nextRow >= size || nextCol < 0 || nextCol >= size) return;
      if (board[nextRow][nextCol]?.feature) return;
      const nextKey = keyOf(nextRow, nextCol);
      if (!clearKeys.has(nextKey)) {
        clearKeys.add(nextKey);
        queue.push({ row: nextRow, col: nextCol, triggerType: sourceType });
      }
    };

    if (special === "rocket-h") {
      createSpecialEffect("rocket-h", row, col);
      createRocketRunEffect("rocket-h", row, col);
      playSound("rocket", specialCount);
      for (let nextCol = 0; nextCol < size; nextCol += 1) add(row, nextCol);
    } else if (special === "rocket-v") {
      createSpecialEffect("rocket-v", row, col);
      createRocketRunEffect("rocket-v", row, col);
      playSound("rocket", specialCount);
      for (let nextRow = 0; nextRow < size; nextRow += 1) add(nextRow, col);
    } else if (special === "bomb") {
      createSpecialEffect("bomb", row, col);
      createBombBlastEffect(row, col, 1);
      playSound("bomb", specialCount);
      for (let nextRow = row - 1; nextRow <= row + 1; nextRow += 1) {
        for (let nextCol = col - 1; nextCol <= col + 1; nextCol += 1) add(nextRow, nextCol);
      }
    } else if (special === "rainbow") {
      const targetType = triggerType;
      if (targetType === null) continue;
      createSpecialEffect("rainbow", row, col);
      for (let nextRow = 0; nextRow < size; nextRow += 1) {
        for (let nextCol = 0; nextCol < size; nextCol += 1) {
          if (board[nextRow][nextCol]?.type === targetType) add(nextRow, nextCol);
        }
      }
    }
  }

  return { clearKeys, specialCount };
}

async function clearResolvedKeys(initialKeys, initialSpecials = 0, firstLabel = "") {
  let totalCleared = 0;
  let totalSpecials = initialSpecials;
  let cascade = 0;
  let pendingKeys = new Set(initialKeys);

  while (pendingKeys.size && cascade < maxCascadeSteps) {
    cascade += 1;
    cascadeLabelEl.textContent = cascade > 1 ? `Cascade x${cascade}` : firstLabel;
    render();
    const { clearKeys, specialCount } = addSpecialEffects(pendingKeys);
    totalSpecials += specialCount;
    totalCleared += clearKeys.size;

    markPreview(clearKeys);
    await wait(620);
    markMatches(clearKeys);
    showPop(`+${(clearKeys.size * candyValue()).toFixed(2)}x`);
    playSound(specialCount > 0 || totalSpecials > initialSpecials ? "special" : "clear", cascade);
    if (specialCount > 0 || totalSpecials > initialSpecials) pulseBoard();
    addFever(clearKeys.size * 1.5 + specialCount * 8, "Clear", false);
    await wait(460);
    collapse(clearKeys);
    triggerBottomFeatures();
    render();
    await wait(260);

    const groups = findMatches();
    pendingKeys = groups.length
      ? new Set(groups.flat().map(({ row, col }) => keyOf(row, col)))
      : new Set();
  }

  if (pendingKeys.size) {
    pendingKeys = new Set();
    messageEl.textContent = "Cascade stabilized after a long chain.";
  }

  const multiplier = specialMultiplier(totalSpecials);
  const baseWin = totalCleared * candyValue();
  const cascadeBoost = Math.max(0, cascade - 1) * 0.08;
  const payoutMultiplier = multiplier + cascadeBoost;
  const cascadeWin = baseWin * payoutMultiplier;
  lastWin += cascadeWin;
  balance += cascadeWin;

  if (totalSpecials >= 5) {
    showPop("Super Cascade x5");
    triggerFeverMode();
  } else if (totalSpecials > 0) {
    showPop(`Special Trigger x${totalSpecials}`);
  }

  return {
    totalCleared,
    totalSpecials,
    multiplier: payoutMultiplier,
    specialBase: multiplier,
    cascadeBonus: cascadeBoost,
    baseWin,
    win: cascadeWin,
    cascade,
  };
}

function collapse(clearKeys) {
  const nextFallMap = new Map();

  clearKeys.forEach((key) => {
    const { row, col } = parseKey(key);
    if (!board[row]?.[col]) return;
    if (board[row][col].feature) return;
    if (board[row][col].plastic) {
      board[row][col].plastic = false;
      return;
    }
    if (board[row][col].crate) {
      board[row][col] = makeCandy(board[row][col].type);
      board[row][col].feature = "spinner";
      return;
    }
    board[row][col] = null;
  });

  for (let col = 0; col < size; col += 1) {
    const falling = [];
    for (let row = size - 1; row >= 0; row -= 1) {
      if (board[row][col]) falling.push({ tile: board[row][col], fromRow: row });
    }
    for (let row = size - 1; row >= 0; row -= 1) {
      const existing = falling[size - 1 - row];
      if (existing) {
        board[row][col] = existing.tile;
        if (existing.fromRow !== row) nextFallMap.set(keyOf(row, col), row - existing.fromRow);
      } else {
        board[row][col] = maybeDecorate(makeCandy(), row);
        nextFallMap.set(keyOf(row, col), row + 1);
      }
    }
  }

  fallMap = nextFallMap;
}

function specialMultiplier(count) {
  if (count >= 5) return 5;
  return [1, 1.2, 1.5, 2, 3][count] ?? 1;
}

function showPop(text) {
  const pop = document.createElement("span");
  pop.className = "pop";
  pop.textContent = text;
  document.querySelector(".board-wrap").append(pop);
  setTimeout(() => pop.remove(), 900);
}

function performFeatureShow(text, selector = ".meter-bar", detail = "") {
  const target = document.querySelector(selector);
  target?.classList.add("feature-flash");
  pulseBoard();
  showFeatureCard(text, detail);
  playSound("special");
  setTimeout(() => target?.classList.remove("feature-flash"), 650);
}

function showFeatureCard(title, detail = "") {
  const card = document.createElement("div");
  card.className = "feature-card";
  card.innerHTML = detail ? `${title}<small>${detail}</small>` : title;
  document.querySelector(".board-wrap").append(card);
  setTimeout(() => card.remove(), 1450);
}

function showSettlement(result) {
  if (!result.totalCleared) return;
  const card = document.createElement("div");
  card.className = "settlement-card";
  card.innerHTML = `
    <strong>Win ${result.win.toFixed(2)} BET</strong>
    <span>${result.totalCleared} candies x ${candyValue().toFixed(2)}</span>
    <span>Special x${result.specialBase.toFixed(2)} + Cascade ${result.cascadeBonus.toFixed(2)}</span>
  `;
  document.querySelector(".board-wrap").append(card);
  setTimeout(() => card.remove(), 1900);
}

function showWheelShow(title, finalText) {
  const card = document.createElement("div");
  card.className = "wheel-card";
  card.innerHTML = `
    <strong>${title}</strong>
    <span class="wheel-reel">
      <b>FEVER</b>
      <b>MINI</b>
      <b>MAJOR</b>
      <b>${finalText}</b>
    </span>
    <small>${finalText}</small>
  `;
  document.querySelector(".board-wrap").append(card);
  playSound(title.includes("Fever") ? "fever" : "wheel");
  setTimeout(() => card.remove(), 1900);
}

function createFeatureCollectEffect(row, col) {
  const cell = boardEl.children[row * size + col];
  if (!cell) return;
  const boardRect = boardEl.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  const x = `${cellRect.left - boardRect.left + cellRect.width / 2}px`;
  const y = `${cellRect.top - boardRect.top + cellRect.height / 2}px`;
  const effect = document.createElement("span");
  effect.className = "feature-collect";
  effect.style.setProperty("--x", x);
  effect.style.setProperty("--y", y);
  boardEl.append(effect);
  document.querySelector(".collection-tray")?.classList.add("collecting");
  setTimeout(() => document.querySelector(".collection-tray")?.classList.remove("collecting"), 1050);
  setTimeout(() => effect.remove(), 1050);
}

function addFever(amount, reason = "", autoTrigger = true) {
  const gain = Math.max(0, amount);
  fever = Math.min(feverTarget, fever + gain);
  if (gain > 0) {
    showPop(`Fever +${gain.toFixed(0)}%`);
    if (reason) messageEl.textContent = `${reason}: Candy Fever +${gain.toFixed(0)}%.`;
  }
  if (autoTrigger && fever >= feverTarget) triggerFeverMode();
}

function triggerSpinnerObject(tile) {
  const jackpot = Math.random() < 0.5;
  if (jackpot) {
    const award = (2 + randomInt(12)) * betPerSwap;
    lastWin += award;
    balance += award;
    messageEl.textContent = `Wheel Jackpot: +${award.toFixed(2)} BET.`;
    pulseBoard();
    playSound("special");
    showWheelShow("Wheel Jackpot", `+${award.toFixed(2)} BET`);
  } else {
    const gain = 12 + randomInt(29);
    addFever(gain, "Wheel Bonus");
    showWheelShow("Wheel Fever", `Fever +${gain}%`);
  }
  tile.feature = null;
  tile.special = null;
}

function triggerBottomFeatures() {
  let drops = 0;
  for (let col = 0; col < size; col += 1) {
    const tile = board[size - 1][col];
    if (tile.feature) {
      createFeatureCollectEffect(size - 1, col);
      triggerSpinnerObject(tile);
      board[size - 1][col] = null;
      drops += 1;
    }
  }
  if (drops > 0) collapse(new Set());
  if (drops >= 3 || fever >= feverTarget) triggerFeverMode();
  return drops;
}

function settleBottomFeatures(maxRounds = size) {
  let totalDrops = 0;
  for (let round = 0; round < maxRounds; round += 1) {
    const drops = triggerBottomFeatures();
    totalDrops += drops;
    if (!drops) break;
  }
  return totalDrops;
}

function triggerFeverMode() {
  fever = 0;
  const targetType = randomInt(candyTypes);
  let converted = 0;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!board[row][col].feature && board[row][col].type === targetType) {
        board[row][col].special = ["rocket-h", "rocket-v", "bomb"][randomInt(3)];
        converted += 1;
      }
    }
  }
  messageEl.textContent = `Candy Fever converted ${converted} candies into specials.`;
  performFeatureShow("Candy Fever", "#fever-meter", `Converted ${converted} candies into rocket/bomb specials`);
}

async function clearCascade() {
  const groups = findMatches();
  if (!groups.length) return { totalCleared: 0, totalSpecials: 0, multiplier: 1, cascade: 0 };
  let totalCleared = 0;
  let totalSpecials = 0;
  let cascade = 0;
  let pendingGroups = groups;

  while (pendingGroups.length && cascade < maxCascadeSteps) {
    cascade += 1;
    const baseKeys = new Set(pendingGroups.flat().map(({ row, col }) => keyOf(row, col)));
    const creations = applySpecialCreations(pendingGroups, baseKeys);
    cascadeLabelEl.textContent = cascade > 1 ? `Cascade x${cascade}` : "";
    render();
    if (creations.length) {
      markTransform(new Set(creations.map(({ row, col }) => keyOf(row, col))));
      await wait(300);
    }
    const { clearKeys, specialCount } = addSpecialEffects(baseKeys);
    totalSpecials += specialCount + creations.length;
    totalCleared += clearKeys.size;

    markPreview(clearKeys);
    await wait(620);
    markMatches(clearKeys);
    if (creations.length) {
      pulseBoard();
      showPop(`Created ${creations.length} special`);
      playSound("create", cascade);
    } else {
      playSound("clear", cascade);
    }
    addFever(clearKeys.size * 1.5 + (specialCount + creations.length) * 8, "Clear", false);
    await wait(460);
    collapse(clearKeys);
    triggerBottomFeatures();
    render();
    await wait(260);
    pendingGroups = findMatches();
  }

  if (pendingGroups.length) {
    pendingGroups = [];
    messageEl.textContent = "Cascade stabilized after a long chain.";
  }

  const multiplier = specialMultiplier(totalSpecials);
  const baseWin = totalCleared * candyValue();
  const cascadeBoost = Math.max(0, cascade - 1) * 0.08;
  const payoutMultiplier = multiplier + cascadeBoost;
  const cascadeWin = baseWin * payoutMultiplier;
  lastWin += cascadeWin;
  balance += cascadeWin;

  if (totalSpecials >= 5) {
    showPop("Super Cascade x5");
    triggerFeverMode();
  } else if (totalSpecials > 0) {
    showPop(`Special Trigger x${totalSpecials}`);
  }

  return {
    totalCleared,
    totalSpecials,
    multiplier: payoutMultiplier,
    specialBase: multiplier,
    cascadeBonus: cascadeBoost,
    baseWin,
    win: cascadeWin,
    cascade,
  };
}

function addRandomSpecials(count) {
  for (let index = 0; index < count; index += 1) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const row = randomInt(size);
      const col = randomInt(size);
      if (board[row][col].feature) continue;
      board[row][col].special = ["rocket-h", "rocket-v", "bomb", "rainbow"][randomInt(4)];
      break;
    }
  }
}

function addFeatureRain(targetBoard = board, count = 5) {
  for (let index = 0; index < count; index += 1) {
    const col = randomInt(size);
    const row = randomInt(Math.max(2, size - 2));
    targetBoard[row][col].feature = "spinner";
    targetBoard[row][col].special = null;
  }
}

function triggerBoardEvent() {
  const roll = Math.random();
  eventCountdown = boardEventInterval;

  if (roll < 0.5) {
    addFeatureRain(board, 3);
    messageEl.textContent = "Board Event: Feature Rain!";
    performFeatureShow("Board Event", "#event-countdown", "3 reward capsules dropped into the board");
  } else if (roll < 0.8) {
    addRandomSpecials(5);
    messageEl.textContent = "Board Event: Special candies appeared.";
    performFeatureShow("Board Event", "#event-countdown", "5 random special candies appeared");
  } else {
    addRandomSpecials(3);
    addFeatureRain(board, 2);
    messageEl.textContent = "Board Event: Sugar Burst!";
    performFeatureShow("Board Event", "#event-countdown", "3 specials + 2 reward capsules appeared");
  }
  showPop("Board Event");
  playSound("special");
  settleBottomFeatures();
}

function getRainbowSwap(a, b) {
  const first = board[a.row][a.col];
  const second = board[b.row][b.col];

  if (first.special === "rainbow") {
    return {
      rainbow: a,
      target: b,
      targetType: second.type,
    };
  }

  if (second.special === "rainbow") {
    return {
      rainbow: b,
      target: a,
      targetType: first.type,
    };
  }

  return null;
}

function getSwapAction(a, b) {
  const first = board[a.row][a.col];
  const second = board[b.row][b.col];

  if (first.special === "rainbow" && second.special === "rainbow") {
    return { kind: "rainbow-rainbow", first: a, second: b };
  }

  if (first.special === "rainbow") {
    if (!second.special) {
      return {
        kind: "rainbow-color",
        rainbow: a,
        target: b,
        targetType: second.type,
      };
    }
    return {
      kind: "rainbow-special",
      rainbow: a,
      target: b,
      targetType: second.type,
      targetSpecial: second.special,
    };
  }

  if (second.special === "rainbow") {
    if (!first.special) {
      return {
        kind: "rainbow-color",
        rainbow: b,
        target: a,
        targetType: first.type,
      };
    }
    return {
      kind: "rainbow-special",
      rainbow: b,
      target: a,
      targetType: first.type,
      targetSpecial: first.special,
    };
  }

  if (first.special && second.special) {
    return {
      kind: "special-combo",
      first: a,
      second: b,
      firstSpecial: first.special,
      secondSpecial: second.special,
    };
  }

  return null;
}

function isRainbowNormalSwap(a, b) {
  const first = board[a.row][a.col];
  const second = board[b.row][b.col];
  return (
    (first.special === "rainbow" && !second.special) ||
    (second.special === "rainbow" && !first.special)
  );
}

function pointEquals(a, b) {
  return a.row === b.row && a.col === b.col;
}

function positionAfterSwap(original, first, second) {
  if (pointEquals(original, first)) return second;
  if (pointEquals(original, second)) return first;
  return original;
}

function collectTypeKeys(targetType, extraKeys = []) {
  const keys = new Set(extraKeys);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!board[row][col].feature && board[row][col].type === targetType) {
        keys.add(keyOf(row, col));
      }
    }
  }
  return keys;
}

function addRows(keys, centerRow, radius = 0) {
  for (let row = Math.max(0, centerRow - radius); row <= Math.min(size - 1, centerRow + radius); row += 1) {
    for (let col = 0; col < size; col += 1) keys.add(keyOf(row, col));
  }
}

function addCols(keys, centerCol, radius = 0) {
  for (let col = Math.max(0, centerCol - radius); col <= Math.min(size - 1, centerCol + radius); col += 1) {
    for (let row = 0; row < size; row += 1) keys.add(keyOf(row, col));
  }
}

function addSquare(keys, center, radius) {
  for (let row = center.row - radius; row <= center.row + radius; row += 1) {
    for (let col = center.col - radius; col <= center.col + radius; col += 1) {
      if (row >= 0 && row < size && col >= 0 && col < size) keys.add(keyOf(row, col));
    }
  }
}

function collectSpecialComboKeys(action, first, second) {
  const firstAfter = positionAfterSwap(action.first, first, second);
  const secondAfter = positionAfterSwap(action.second, first, second);
  const keys = new Set([keyOf(firstAfter.row, firstAfter.col), keyOf(secondAfter.row, secondAfter.col)]);
  const specials = [action.firstSpecial, action.secondSpecial];

  if (specials.every((special) => special.startsWith("rocket"))) {
    addRows(keys, firstAfter.row, 0);
    addCols(keys, firstAfter.col, 0);
    return keys;
  }

  if (specials.every((special) => special === "bomb")) {
    addSquare(keys, firstAfter, 2);
    return keys;
  }

  const rocketIndex = specials.findIndex((special) => special.startsWith("rocket"));
  if (rocketIndex !== -1 && specials.includes("bomb")) {
    const rocketSpecial = specials[rocketIndex];
    const rocketPosition = rocketIndex === 0 ? firstAfter : secondAfter;
    if (rocketSpecial === "rocket-h") addRows(keys, rocketPosition.row, 1);
    else addCols(keys, rocketPosition.col, 1);
    return keys;
  }

  return keys;
}

function resolveSwapAction(action, first, second) {
  if (action.kind === "rainbow-rainbow") {
    const keys = new Set();
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (!board[row][col].feature) keys.add(keyOf(row, col));
      }
    }
    return { keys, specialCount: 2, label: "Rainbow x2", message: "Two Rainbow candies cleared the board." };
  }

  if (action.kind === "rainbow-special") {
    const rainbowAfter = positionAfterSwap(action.rainbow, first, second);
    const rainbowKey = keyOf(rainbowAfter.row, rainbowAfter.col);
    const convertedKeys = collectTypeKeys(action.targetType);
    convertedKeys.delete(rainbowKey);
    convertedKeys.forEach((key) => {
      const { row, col } = parseKey(key);
      board[row][col].special = action.targetSpecial;
    });
    board[rainbowAfter.row][rainbowAfter.col].special = null;
    const keys = new Set([...convertedKeys, rainbowKey]);
    return {
      keys,
      convertedKeys,
      rainbowAt: rainbowAfter,
      specialCount: 1,
      label: "Rainbow Transform",
      message: "Rainbow transformed that color into matching special candies.",
    };
  }

  if (action.kind === "rainbow-color") {
    const rainbowAfter = positionAfterSwap(action.rainbow, first, second);
    const rainbowKey = keyOf(rainbowAfter.row, rainbowAfter.col);
    const colorKeys = collectTypeKeys(action.targetType);
    const keys = new Set([...colorKeys, rainbowKey]);
    board[rainbowAfter.row][rainbowAfter.col].special = null;
    return {
      keys,
      colorKeys,
      rainbowAt: rainbowAfter,
      specialCount: 1,
      label: "Rainbow Clear",
      message: "Rainbow cleared every candy of that color.",
    };
  }

  if (action.kind === "special-combo") {
    return {
      keys: collectSpecialComboKeys(action, first, second),
      specialCount: 0,
      label: "Special Combo",
      message: "Special candies combined.",
    };
  }

  return null;
}

function shuffleGeneralCandies(cost = 0) {
  if (balance < cost) {
    messageEl.textContent = "Not enough Balance for Shuffle.";
    return false;
  }

  balance -= cost;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ordinary = [];
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const tile = board[row][col];
        if (!tile.feature && !tile.special && !tile.locked) {
          ordinary.push(tile.type);
        }
      }
    }
    ordinary.sort(() => Math.random() - 0.5);

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const tile = board[row][col];
        if (!tile.feature && !tile.special && !tile.locked) {
          tile.type = ordinary.pop() ?? randomInt(candyTypes);
        }
      }
    }

    if (!findMatches().length) break;
  }

  lastWin = 0;
  selected = null;
  hintPair = null;
  messageEl.textContent = cost ? "Shuffle used. Progress objects stayed in place." : "No legal move: free reshuffle.";
  settleBottomFeatures();
  render();
  return true;
}

function normalizeBoard() {
  for (let row = 0; row < size; row += 1) {
    if (!Array.isArray(board[row])) board[row] = Array(size).fill(null);
    for (let col = 0; col < size; col += 1) {
      const tile = board[row][col];
      if (!tile || typeof tile.type !== "number") {
        board[row][col] = maybeDecorate(makeCandy(), row);
      } else {
        tile.type = Math.max(0, Math.min(candyTypes - 1, tile.type));
        tile.special = ["rocket-h", "rocket-v", "bomb", "rainbow"].includes(tile.special) ? tile.special : null;
        tile.feature = tile.feature === "spinner" ? tile.feature : null;
        tile.locked = false;
        tile.plastic = false;
        tile.crate = false;
      }
    }
  }
}

async function handleCellClick(event) {
  resumeAudio();
  const cell = event.target.closest(".cell");
  if (!cell || locked) return;

  const current = {
    row: Number(cell.dataset.row),
    col: Number(cell.dataset.col),
  };

  if (!selected) {
    selected = current;
    hintPair = null;
    messageEl.textContent = "Pick a neighbor to swap.";
    render();
    return;
  }

  if (selected.row === current.row && selected.col === current.col) {
    selected = null;
    messageEl.textContent = "Selection cleared.";
    render();
    return;
  }

  if (!canSwap(selected, current)) {
    selected = current;
    messageEl.textContent = "Swap unlocked neighbors only.";
    render();
    return;
  }

  if (balance < betPerSwap) {
    messageEl.textContent = "Balance is empty. Restart to refill credits.";
    return;
  }

  const first = selected;
  const second = current;
  const rainbowNormalSwap = isRainbowNormalSwap(first, second);
  const swapAction = getSwapAction(first, second);
  locked = true;
  lastWin = 0;
  cascadeLabelEl.textContent = "";
  swap(first, second);
  selected = null;
  render();
  playSound("swap");

  try {
  if (swapAction) {
    const actionResult = resolveSwapAction(swapAction, first, second);
    balance -= betPerSwap;
    eventCountdown -= 1;
    messageEl.textContent = actionResult.message;
    showPop(actionResult.label);
    playSound(actionResult.label.includes("Rainbow") ? "rainbow" : "special");
    if (actionResult.convertedKeys) {
      render();
      markTransform(actionResult.convertedKeys);
      createRainbowTransformEffect(actionResult.rainbowAt.row, actionResult.rainbowAt.col, actionResult.convertedKeys);
      showFeatureCard("Rainbow Transform", `${actionResult.convertedKeys.size} candies became special candies`);
      await wait(900);
    } else if (actionResult.colorKeys) {
      render();
      markTransform(actionResult.colorKeys);
      createRainbowTransformEffect(actionResult.rainbowAt.row, actionResult.rainbowAt.col, actionResult.colorKeys);
      showFeatureCard("Rainbow Clear", `${actionResult.colorKeys.size} same-color candies cleared`);
      await wait(760);
    }
    const result = await clearResolvedKeys(actionResult.keys, actionResult.specialCount, actionResult.label);
    if (eventCountdown <= 0) triggerBoardEvent();
    if (!findValidMove()) shuffleGeneralCandies(0);
    settleBottomFeatures();

    messageEl.textContent = `${result.totalCleared} candies x ${candyValue().toFixed(2)} x special ${result.multiplier.toFixed(2)} = Win ${lastWin.toFixed(2)} BET.`;
    showSettlement(result);
    locked = false;
    render();
    return;
  }

  const swapGroups = findMatches();
  if (!groupsTouchPoints(swapGroups, [first, second])) {
    if (rainbowNormalSwap) {
      messageEl.textContent = "Rainbow moved. It does not clear by normal 3-match.";
      locked = false;
      render();
      return;
    }
    await wait(130);
    swap(first, second);
    messageEl.textContent = "Invalid swap. Make a 3-match.";
    playSound("invalid");
    locked = false;
    render();
    return;
  }

  balance -= betPerSwap;
  eventCountdown -= 1;
  const result = await clearCascade();
  if (eventCountdown <= 0) triggerBoardEvent();
  if (!findValidMove()) shuffleGeneralCandies(0);
  settleBottomFeatures();

  messageEl.textContent =
    `${result.totalCleared} candies x ${candyValue().toFixed(2)} x special ${result.multiplier.toFixed(2)} = Win ${lastWin.toFixed(2)} BET.`;
  showSettlement(result);
  locked = false;
  render();
  } catch (error) {
    console.error("Swap flow recovered", error);
    locked = false;
    selected = null;
    hintPair = null;
    cascadeLabelEl.textContent = "";
    messageEl.textContent = "Board recovered. Try the next swap.";
    normalizeBoard();
    settleBottomFeatures();
    render();
  }
}

function resetGame() {
  board = newBoard();
  selected = null;
  balance = 100;
  lastWin = 0;
  fever = 0;
  eventCountdown = boardEventInterval;
  locked = false;
  hintPair = null;
  cascadeLabelEl.textContent = "";
  messageEl.textContent = "Pick 2 adjacent candies. Valid match = 1 BET.";
  settleBottomFeatures();
  render();
}

boardEl.addEventListener("click", handleCellClick);
restartEl.addEventListener("click", resetGame);
shuffleEl.addEventListener("click", () => shuffleGeneralCandies(betPerSwap));
betDownEl.addEventListener("click", () => setBet(betPerSwap - 0.25));
betUpEl.addEventListener("click", () => setBet(betPerSwap + 0.25));
hintEl.addEventListener("click", () => {
  resumeAudio();
  hintPair = findValidMove();
  messageEl.textContent = hintPair ? "Hint highlighted. Try this legal swap." : "No legal swap found. Reshuffling.";
  if (!hintPair) shuffleGeneralCandies(0);
  render();
});

resetGame();
