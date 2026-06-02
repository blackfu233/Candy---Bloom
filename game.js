const size = 8;
const candyTypes = 6;
let betPerSwap = 1;
const baseCandyValue = 0.05;
const feverTarget = 100;
const boardEventInterval = 10;

const boardEl = document.querySelector("#board");
const balanceEl = document.querySelector("#balance");
const betEl = document.querySelector("#bet");
const winEl = document.querySelector("#win");
const scatterEl = document.querySelector("#scatter");
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
let scatterProgress = 0;
let fever = 0;
let eventCountdown = boardEventInterval;
let locked = false;
let hintPair = null;
let audio = null;

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

function playSound(name) {
  if (name === "swap") playTone(360, 0.06, "triangle", 0.11);
  else if (name === "clear") [620, 780, 980].forEach((tone, index) => setTimeout(() => playTone(tone, 0.075, "sine", 0.12), index * 35));
  else if (name === "special") [220, 440, 880].forEach((tone, index) => setTimeout(() => playTone(tone, 0.11, "square", 0.1), index * 45));
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
  if (roll < 0.018 && row < size - 1) tile.feature = "scatter";
  else if (roll < 0.031 && row < size - 1) tile.feature = "chest";
  else if (roll < 0.036 && row < size - 2) tile.feature = "jp";
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

  addFeatureRain(next, 4);
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
  scatterEl.textContent = `${scatterProgress} / 5`;
  eventCountdownEl.textContent = `${eventCountdown} Moves`;
  feverMeterEl.value = fever;
}

function isAdjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function canSwap(a, b) {
  return (
    isAdjacent(a, b) &&
    !board[a.row][a.col].locked &&
    !board[b.row][b.col].locked
  );
}

function swap(a, b) {
  [board[a.row][a.col], board[b.row][b.col]] = [board[b.row][b.col], board[a.row][a.col]];
}

function findMatches(source = board) {
  const groups = [];

  for (let row = 0; row < size; row += 1) {
    let start = 0;
    for (let col = 1; col <= size; col += 1) {
      const current = col < size ? source[row][col].type : null;
      const previous = source[row][start].type;
      if (current !== previous) {
        if (col - start >= 3) {
          groups.push(Array.from({ length: col - start }, (_, index) => ({ row, col: start + index })));
        }
        start = col;
      }
    }
  }

  for (let col = 0; col < size; col += 1) {
    let start = 0;
    for (let row = 1; row <= size; row += 1) {
      const current = row < size ? source[row][col].type : null;
      const previous = source[start][col].type;
      if (current !== previous) {
        if (row - start >= 3) {
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
        const valid = findMatches().length > 0;
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

function addSpecialEffects(keys) {
  let specialCount = 0;
  const queue = [...keys].map(parseKey);
  const clearKeys = new Set(keys);

  while (queue.length) {
    const { row, col } = queue.shift();
    const tile = board[row][col];
    if (!tile?.special) continue;

    specialCount += 1;
    const special = tile.special;
    tile.special = null;

    const add = (nextRow, nextCol) => {
      if (nextRow < 0 || nextRow >= size || nextCol < 0 || nextCol >= size) return;
      const nextKey = keyOf(nextRow, nextCol);
      if (!clearKeys.has(nextKey)) {
        clearKeys.add(nextKey);
        queue.push({ row: nextRow, col: nextCol });
      }
    };

    if (special === "rocket-h") {
      for (let nextCol = 0; nextCol < size; nextCol += 1) add(row, nextCol);
    } else if (special === "rocket-v") {
      for (let nextRow = 0; nextRow < size; nextRow += 1) add(nextRow, col);
    } else if (special === "bomb") {
      for (let nextRow = row - 1; nextRow <= row + 1; nextRow += 1) {
        for (let nextCol = col - 1; nextCol <= col + 1; nextCol += 1) add(nextRow, nextCol);
      }
    } else if (special === "rainbow") {
      const targetType = tile.type;
      for (let nextRow = 0; nextRow < size; nextRow += 1) {
        for (let nextCol = 0; nextCol < size; nextCol += 1) {
          if (board[nextRow][nextCol].type === targetType) add(nextRow, nextCol);
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

  while (pendingKeys.size) {
    cascade += 1;
    const { clearKeys, specialCount } = addSpecialEffects(pendingKeys);
    totalSpecials += specialCount;
    totalCleared += clearKeys.size;

    cascadeLabelEl.textContent = cascade > 1 ? `Cascade x${cascade}` : firstLabel;
    render();
    markPreview(clearKeys);
    await wait(620);
    markMatches(clearKeys);
    showPop(`+${(clearKeys.size * candyValue()).toFixed(2)}x`);
    playSound(specialCount > 0 || totalSpecials > initialSpecials ? "special" : "clear");
    if (specialCount > 0 || totalSpecials > initialSpecials) pulseBoard();
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

  const multiplier = specialMultiplier(totalSpecials);
  const baseWin = totalCleared * candyValue();
  const cascadeBoost = Math.max(0, cascade - 1) * 0.08;
  const cascadeWin = baseWin * (multiplier + cascadeBoost);
  lastWin += cascadeWin;
  balance += cascadeWin;
  fever = Math.min(feverTarget, fever + totalCleared * 1.5 + totalSpecials * 8);

  if (totalSpecials >= 5) {
    showPop("Super Cascade x5");
    triggerFeverMode();
  } else if (totalSpecials > 0) {
    showPop(`Special Trigger x${totalSpecials}`);
  }

  return { totalCleared, totalSpecials, multiplier, cascade };
}

function collapse(clearKeys) {
  clearKeys.forEach((key) => {
    const { row, col } = parseKey(key);
    if (board[row][col].plastic) {
      board[row][col].plastic = false;
      return;
    }
    if (board[row][col].crate) {
      board[row][col] = makeCandy(board[row][col].type);
      board[row][col].feature = ["scatter", "chest", "chest"][randomInt(3)];
      return;
    }
    board[row][col] = null;
  });

  for (let col = 0; col < size; col += 1) {
    const falling = [];
    for (let row = size - 1; row >= 0; row -= 1) {
      if (board[row][col]) falling.push(board[row][col]);
    }
    for (let row = size - 1; row >= 0; row -= 1) {
      board[row][col] = falling[size - 1 - row] ?? maybeDecorate(makeCandy(), row);
    }
  }
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

function performFeatureShow(text, selector = ".meter-bar") {
  const target = document.querySelector(selector);
  target?.classList.add("feature-flash");
  pulseBoard();
  showPop(text);
  playSound("special");
  setTimeout(() => target?.classList.remove("feature-flash"), 650);
}

function triggerFeature(tile) {
  if (tile.feature === "scatter") {
    scatterProgress += 1;
    fever = Math.min(feverTarget, fever + 18);
    messageEl.textContent = "Scatter dropped! Candy Fever is closer.";
    performFeatureShow("Scatter +1", "#scatter");
  } else if (tile.feature === "chest") {
    const award = [0.3, 0.5, 0.8, 1.2][randomInt(4)];
    const scaledAward = award * betPerSwap;
    lastWin += scaledAward;
    balance += scaledAward;
    fever = Math.min(feverTarget, fever + 10);
    addRandomSpecials(3);
    messageEl.textContent = `Chest opened: +${scaledAward.toFixed(2)} BET and special candies.`;
    performFeatureShow("Chest Bonus", ".board-wrap");
  } else if (tile.feature === "jp") {
    const award = (8 + randomInt(8)) * betPerSwap;
    lastWin += award;
    balance += award;
    messageEl.textContent = `JP Chance hit: +${award.toFixed(2)} BET!`;
    performFeatureShow("JP Hit", ".board-wrap");
  }
  tile.feature = null;
  tile.special = null;
}

function triggerBottomFeatures() {
  let drops = 0;
  for (let col = 0; col < size; col += 1) {
    const tile = board[size - 1][col];
    if (tile.feature) {
      triggerFeature(tile);
      drops += 1;
    }
  }
  if (scatterProgress >= 5 || drops >= 3 || fever >= feverTarget) {
    triggerFeverMode();
  }
  return drops;
}

function triggerFeverMode() {
  scatterProgress = 0;
  fever = 0;
  const targetType = randomInt(candyTypes);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (board[row][col].type === targetType) {
        board[row][col].special = ["rocket-h", "rocket-v", "bomb"][randomInt(3)];
      }
    }
  }
  messageEl.textContent = "Candy Fever! One candy color turned into specials.";
  performFeatureShow("Candy Fever", "#fever-meter");
}

async function clearCascade() {
  const groups = findMatches();
  if (!groups.length) return { totalCleared: 0, totalSpecials: 0, multiplier: 1, cascade: 0 };
  let totalCleared = 0;
  let totalSpecials = 0;
  let cascade = 0;
  let pendingGroups = groups;

  while (pendingGroups.length) {
    cascade += 1;
    const baseKeys = new Set(pendingGroups.flat().map(({ row, col }) => keyOf(row, col)));
    const creations = applySpecialCreations(pendingGroups, baseKeys);
    const { clearKeys, specialCount } = addSpecialEffects(baseKeys);
    totalSpecials += specialCount + creations.length;
    totalCleared += clearKeys.size;

    cascadeLabelEl.textContent = cascade > 1 ? `Cascade x${cascade}` : "";
    render();
    markPreview(clearKeys);
    await wait(620);
    markMatches(clearKeys);
    if (creations.length) {
      pulseBoard();
      showPop(`Created ${creations.length} special`);
      playSound("special");
    } else {
      playSound("clear");
    }
    await wait(460);
    collapse(clearKeys);
    triggerBottomFeatures();
    render();
    await wait(260);
    pendingGroups = findMatches();
  }

  const multiplier = specialMultiplier(totalSpecials);
  const baseWin = totalCleared * candyValue();
  const cascadeBoost = Math.max(0, cascade - 1) * 0.08;
  const cascadeWin = baseWin * (multiplier + cascadeBoost);
  lastWin += cascadeWin;
  balance += cascadeWin;
  fever = Math.min(feverTarget, fever + totalCleared * 1.5 + totalSpecials * 8);

  if (totalSpecials >= 5) {
    showPop("Super Cascade x5");
    triggerFeverMode();
  } else if (totalSpecials > 0) {
    showPop(`Special Trigger x${totalSpecials}`);
  }

  return { totalCleared, totalSpecials, multiplier, cascade };
}

function addRandomSpecials(count) {
  for (let index = 0; index < count; index += 1) {
    const row = randomInt(size);
    const col = randomInt(size);
    board[row][col].special = ["rocket-h", "rocket-v", "bomb", "rainbow"][randomInt(4)];
  }
}

function addFeatureRain(targetBoard = board, count = 5) {
  for (let index = 0; index < count; index += 1) {
    const col = randomInt(size);
    const row = randomInt(Math.max(2, size - 2));
    targetBoard[row][col].feature = ["scatter", "scatter", "chest", "jp"][randomInt(4)];
  }
}

function triggerBoardEvent() {
  const roll = Math.random();
  eventCountdown = boardEventInterval;

  if (roll < 0.5) {
    addFeatureRain(board, 6);
    messageEl.textContent = "Board Event: Feature Rain!";
  } else if (roll < 0.8) {
    addRandomSpecials(5);
    messageEl.textContent = "Board Event: Special candies appeared.";
  } else {
    addRandomSpecials(3);
    addFeatureRain(board, 3);
    messageEl.textContent = "Board Event: Sugar Burst!";
  }
  showPop("Board Event");
  playSound("special");
  performFeatureShow("Board Event", "#event-countdown");
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
    return {
      kind: second.special ? "rainbow-special" : "rainbow-color",
      rainbow: a,
      target: b,
      targetType: second.type,
      targetSpecial: second.special,
    };
  }

  if (second.special === "rainbow") {
    return {
      kind: first.special ? "rainbow-special" : "rainbow-color",
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
      if (board[row][col].type === targetType) {
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
      for (let col = 0; col < size; col += 1) keys.add(keyOf(row, col));
    }
    return { keys, specialCount: 2, label: "Rainbow x2", message: "Two Rainbow candies cleared the board." };
  }

  if (action.kind === "rainbow-color") {
    const rainbowAfter = positionAfterSwap(action.rainbow, first, second);
    board[rainbowAfter.row][rainbowAfter.col].special = null;
    const keys = collectTypeKeys(action.targetType, [keyOf(rainbowAfter.row, rainbowAfter.col)]);
    return { keys, specialCount: 1, label: "Rainbow", message: "Rainbow candy cleared the swapped color." };
  }

  if (action.kind === "rainbow-special") {
    const rainbowAfter = positionAfterSwap(action.rainbow, first, second);
    board[rainbowAfter.row][rainbowAfter.col].special = null;
    const keys = new Set([keyOf(rainbowAfter.row, rainbowAfter.col)]);
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (board[row][col].type === action.targetType) {
          board[row][col].special = action.targetSpecial;
          keys.add(keyOf(row, col));
        }
      }
    }
    return { keys, specialCount: 1, label: "Rainbow Combo", message: "Rainbow turned that color into specials." };
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
  render();
  return true;
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
  const swapAction = getSwapAction(first, second);
  locked = true;
  lastWin = 0;
  cascadeLabelEl.textContent = "";
  swap(first, second);
  selected = null;
  render();
  playSound("swap");

  if (swapAction) {
    const actionResult = resolveSwapAction(swapAction, first, second);
    balance -= betPerSwap;
    eventCountdown -= 1;
    messageEl.textContent = actionResult.message;
    showPop(actionResult.label);
    playSound(actionResult.label.includes("Rainbow") ? "rainbow" : "special");
    const result = await clearResolvedKeys(actionResult.keys, actionResult.specialCount, actionResult.label);
    if (eventCountdown <= 0) triggerBoardEvent();
    if (!findValidMove()) shuffleGeneralCandies(0);

    messageEl.textContent = `Win ${lastWin.toFixed(2)} BET. ${actionResult.label} cleared ${result.totalCleared} candies.`;
    locked = false;
    render();
    return;
  }

  if (!findMatches().length) {
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

  messageEl.textContent =
    result.totalSpecials > 0
      ? `Win ${lastWin.toFixed(2)} BET. Special multiplier x${result.multiplier}.`
      : `Win ${lastWin.toFixed(2)} BET from ${result.totalCleared} candies.`;
  locked = false;
  render();
}

function resetGame() {
  board = newBoard();
  selected = null;
  balance = 100;
  lastWin = 0;
  scatterProgress = 0;
  fever = 0;
  eventCountdown = boardEventInterval;
  locked = false;
  hintPair = null;
  cascadeLabelEl.textContent = "";
  messageEl.textContent = "Pick 2 adjacent candies. Valid match = 1 BET.";
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
