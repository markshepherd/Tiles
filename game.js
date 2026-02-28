function skipCarAnimation() {
    const container = document.querySelector(".car-animation");
    if (container) container.style.display = "none";
    document.querySelectorAll(".tagline").forEach(el => {
        el.style.animation = "none";
        el.style.opacity = "1";
    });
}

let currentPreset = PRESETS[0];

// ── Game state ──
let board = [];      // 4x4 array; null = empty
let emptyPos = null; // { row, col }
let canvas, ctx;
let tileSize;

// ── Slide animation state ──
const SLIDE_DURATION = 164; // ms
let sliding = null; // { tile, fromRow, fromCol, toRow, toCol, startTime }

// ── Car state ──
let car = null;      // { row, col, entering, progress }
let carRunning = false;
let lastCarTime = 0;
let animFrameId = null;

// ── Timer and counter state ──
let gameStartTime = 0;
let elapsedBeforePause = 0;
let tilesEntered = 0;

function updateStatus() {
    // Tile counter
    document.getElementById("tile-counter").textContent = tilesEntered;

    // Clock
    let totalSeconds;
    if (carRunning) {
        totalSeconds = Math.floor((elapsedBeforePause + (Date.now() - gameStartTime)) / 1000);
    } else {
        totalSeconds = Math.floor(elapsedBeforePause / 1000);
    }
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    document.getElementById("game-clock").textContent = mins + ":" + (secs < 10 ? "0" : "") + secs;
}

let fastMode = false;

function getSecondsPerTile() {
    const val = parseInt(document.getElementById("speed-slider").value);
    const base = 0.5 + (10 - val) * 0.5;
    return fastMode ? base / 5 : base;
}

// ── Edge midpoints (relative to tile origin) ──
function edgeMid(edge) {
    const half = tileSize / 2;
    switch (edge) {
        case "top":    return { x: half, y: 0 };
        case "bottom": return { x: half, y: tileSize };
        case "left":   return { x: 0,    y: half };
        case "right":  return { x: tileSize, y: half };
    }
}

// ── Drawing helpers ──
function traceRoadPath(ctx, ox, oy, edges, half) {
    if (edges === "left,right") {
        ctx.moveTo(ox, oy + half);
        ctx.lineTo(ox + tileSize, oy + half);
    } else if (edges === "bottom,top") {
        ctx.moveTo(ox + half, oy);
        ctx.lineTo(ox + half, oy + tileSize);
    } else {
        let cx, cy, startAngle, endAngle;
        if (edges === "left,top") {
            cx = ox; cy = oy;
            startAngle = 0; endAngle = Math.PI / 2;
        } else if (edges === "right,top") {
            cx = ox + tileSize; cy = oy;
            startAngle = Math.PI / 2; endAngle = Math.PI;
        } else if (edges === "bottom,right") {
            cx = ox + tileSize; cy = oy + tileSize;
            startAngle = Math.PI; endAngle = 1.5 * Math.PI;
        } else if (edges === "bottom,left") {
            cx = ox; cy = oy + tileSize;
            startAngle = 1.5 * Math.PI; endAngle = 2 * Math.PI;
        }
        ctx.arc(cx, cy, half, startAngle, endAngle);
    }
}

function drawRoadSegment(ctx, ox, oy, edgeA, edgeB) {
    const roadWidth = tileSize / 4;
    const half = tileSize / 2;
    const edges = [edgeA, edgeB].sort().join(",");

    // Layer 1: dark border stroke (widest)
    ctx.beginPath();
    traceRoadPath(ctx, ox, oy, edges, half);
    ctx.strokeStyle = "#2a2a2a";
    ctx.lineWidth = roadWidth + 4;
    ctx.lineCap = "butt";
    ctx.setLineDash([]);
    ctx.stroke();

    // Layer 2: asphalt fill (middle)
    ctx.beginPath();
    traceRoadPath(ctx, ox, oy, edges, half);
    ctx.strokeStyle = "#777";
    ctx.lineWidth = roadWidth;
    ctx.lineCap = "butt";
    ctx.setLineDash([]);
    ctx.stroke();

    // Layer 3: dashed center line (thinnest)
    ctx.beginPath();
    traceRoadPath(ctx, ox, oy, edges, half);
    ctx.strokeStyle = "#f0c040";
    ctx.lineWidth = 2;
    ctx.lineCap = "butt";
    ctx.setLineDash([tileSize / 10, tileSize / 14]);
    ctx.stroke();
    ctx.setLineDash([]);
}

function drawTile(tile, row, col) {
    const ox = col * tileSize;
    const oy = row * tileSize;
    const cx = ox + tileSize / 2;
    const cy = oy + tileSize / 2;

    // Radial gradient background
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, tileSize * 0.7);
    if (tile.visited) {
        grad.addColorStop(0, "#2a5a45");
        grad.addColorStop(1, "#132e22");
    } else {
        grad.addColorStop(0, "#3a6ab0");
        grad.addColorStop(1, "#1a3060");
    }
    ctx.fillStyle = grad;
    ctx.fillRect(ox, oy, tileSize, tileSize);

    // 3D raised effect: highlight on top/left, shadow on bottom/right
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox + 0.5, oy + tileSize - 0.5);
    ctx.lineTo(ox + 0.5, oy + 0.5);
    ctx.lineTo(ox + tileSize - 0.5, oy + 0.5);
    ctx.stroke();

    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.moveTo(ox + tileSize - 0.5, oy + 0.5);
    ctx.lineTo(ox + tileSize - 0.5, oy + tileSize - 0.5);
    ctx.lineTo(ox + 0.5, oy + tileSize - 0.5);
    ctx.stroke();

    // Draw roads
    const tileDef = TILE_TYPES[tile.type];
    for (const [a, b] of tileDef.connections) {
        drawRoadSegment(ctx, ox, oy, a, b);
    }

    // Visited tile green glow overlay
    if (tile.visited) {
        ctx.fillStyle = "rgba(50, 220, 100, 0.07)";
        ctx.fillRect(ox, oy, tileSize, tileSize);
    }
}

function drawBoard() {
    updateStatus();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw empty spaces with recessed effect
    const emptySlots = [{ col: emptyPos.col, row: emptyPos.row }];
    if (sliding) emptySlots.push({ col: sliding.fromCol, row: sliding.fromRow });

    for (const slot of emptySlots) {
        const ex = slot.col * tileSize;
        const ey = slot.row * tileSize;

        ctx.fillStyle = "#060610";
        ctx.fillRect(ex, ey, tileSize, tileSize);

        // Inset shadow: dark on top/left, light on bottom/right
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ex + 1, ey + tileSize - 1);
        ctx.lineTo(ex + 1, ey + 1);
        ctx.lineTo(ex + tileSize - 1, ey + 1);
        ctx.stroke();

        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ex + tileSize - 1, ey + 1);
        ctx.lineTo(ex + tileSize - 1, ey + tileSize - 1);
        ctx.lineTo(ex + 1, ey + tileSize - 1);
        ctx.stroke();
    }

    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            if (board[r][c]) {
                if (sliding && r === sliding.fromRow && c === sliding.fromCol) continue;
                drawTile(board[r][c], r, c);
            }
        }
    }

    if (sliding) {
        const t = sliding.progress;
        const drawRow = sliding.fromRow + (sliding.toRow - sliding.fromRow) * t;
        const drawCol = sliding.fromCol + (sliding.toCol - sliding.fromCol) * t;
        drawTile(sliding.tile, drawRow, drawCol);
    }

    if (car) {
        let carOffsetX = 0, carOffsetY = 0;
        if (sliding && car.row === sliding.fromRow && car.col === sliding.fromCol) {
            const t = sliding.progress;
            carOffsetX = (sliding.toCol - sliding.fromCol) * t * tileSize;
            carOffsetY = (sliding.toRow - sliding.fromRow) * t * tileSize;
        }
        drawCar(carOffsetX, carOffsetY);
    }
}

function getCarPosition(row, col, enteringEdge, progress) {
    const tileType = board[row] && board[row][col] ? board[row][col].type : null;
    if (!tileType) return null;

    const exitEdge = getExitEdge(tileType, enteringEdge);
    if (!exitEdge) return null;

    const ox = col * tileSize;
    const oy = row * tileSize;
    const half = tileSize / 2;
    const edges = [enteringEdge, exitEdge].sort().join(",");

    if (edges === "left,right") {
        const startX = enteringEdge === "left" ? 0 : tileSize;
        const endX = enteringEdge === "left" ? tileSize : 0;
        return { x: ox + startX + (endX - startX) * progress, y: oy + half };
    }
    if (edges === "bottom,top") {
        const startY = enteringEdge === "top" ? 0 : tileSize;
        const endY = enteringEdge === "top" ? tileSize : 0;
        return { x: ox + half, y: oy + startY + (endY - startY) * progress };
    }

    let cx, cy, startAngle, endAngle;
    if (edges === "left,top") {
        cx = ox; cy = oy;
        if (enteringEdge === "top") { startAngle = 0; endAngle = Math.PI / 2; }
        else { startAngle = Math.PI / 2; endAngle = 0; }
    } else if (edges === "right,top") {
        cx = ox + tileSize; cy = oy;
        if (enteringEdge === "top") { startAngle = Math.PI; endAngle = Math.PI / 2; }
        else { startAngle = Math.PI / 2; endAngle = Math.PI; }
    } else if (edges === "bottom,right") {
        cx = ox + tileSize; cy = oy + tileSize;
        if (enteringEdge === "bottom") { startAngle = Math.PI; endAngle = 1.5 * Math.PI; }
        else { startAngle = 1.5 * Math.PI; endAngle = Math.PI; }
    } else if (edges === "bottom,left") {
        cx = ox; cy = oy + tileSize;
        if (enteringEdge === "bottom") { startAngle = 2 * Math.PI; endAngle = 1.5 * Math.PI; }
        else { startAngle = 1.5 * Math.PI; endAngle = 2 * Math.PI; }
    }

    const angle = startAngle + (endAngle - startAngle) * progress;
    return {
        x: cx + Math.cos(angle) * half,
        y: cy + Math.sin(angle) * half,
    };
}

function getCarHeading() {
    // Compute heading by sampling two nearby positions
    const dt = 0.01;
    const p0 = getCarPosition(car.row, car.col, car.entering, Math.max(0, car.progress - dt));
    const p1 = getCarPosition(car.row, car.col, car.entering, Math.min(1, car.progress + dt));
    if (!p0 || !p1) return 0;
    return Math.atan2(p1.y - p0.y, p1.x - p0.x);
}

let carEmojiCanvas = null;
let carEmojiSize = 0;

function getCarEmojiCanvas(size) {
    if (carEmojiCanvas && carEmojiSize === size) return carEmojiCanvas;
    carEmojiSize = size;
    carEmojiCanvas = document.createElement("canvas");
    carEmojiCanvas.width = size * 2;
    carEmojiCanvas.height = size * 2;
    const offCtx = carEmojiCanvas.getContext("2d");
    offCtx.font = size + "px serif";
    offCtx.textAlign = "center";
    offCtx.textBaseline = "middle";
    offCtx.fillText("🚗", size, size);
    return carEmojiCanvas;
}

function drawCar(offsetX = 0, offsetY = 0) {
    const pos = getCarPosition(car.row, car.col, car.entering, car.progress);
    if (!pos) return;

    const cx = pos.x + offsetX;
    const cy = pos.y + offsetY;
    const heading = getCarHeading();
    const emojiSize = tileSize / 2.5;
    const emojiImg = getCarEmojiCanvas(Math.round(emojiSize));

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(heading);
    ctx.scale(-1, 1);
    ctx.drawImage(emojiImg, -emojiSize, -emojiSize, emojiSize * 2, emojiSize * 2);
    ctx.restore();
}

function animateSlide(timestamp) {
    if (!sliding) return;
    const elapsed = timestamp - sliding.startTime;
    sliding.progress = Math.min(elapsed / SLIDE_DURATION, 1);
    drawBoard();

    if (sliding.progress >= 1) {
        board[sliding.toRow][sliding.toCol] = sliding.tile;
        board[sliding.fromRow][sliding.fromCol] = null;
        emptyPos = { row: sliding.fromRow, col: sliding.fromCol };

        if (car && car.row === sliding.fromRow && car.col === sliding.fromCol) {
            car.row = sliding.toRow;
            car.col = sliding.toCol;
        }

        sliding = null;
        drawBoard();
    } else {
        requestAnimationFrame(animateSlide);
    }
}

// ── Crash handling ──
function crash() {
    carRunning = false;
    elapsedBeforePause += Date.now() - gameStartTime;
    car.progress = Math.min(car.progress, 1.0);
    drawBoard();
    const heading = document.querySelector("#crash-dialog h2");
    heading.style.animation = "none";
    heading.offsetHeight;
    heading.style.animation = "";
    document.getElementById("crash-dialog").classList.remove("hidden");
}

// ── Car animation loop ──
function updateCar(timestamp) {
    if (!carRunning) return;

    if (lastCarTime === 0) lastCarTime = timestamp;
    const dt = (timestamp - lastCarTime) / 1000;
    lastCarTime = timestamp;

    const spt = getSecondsPerTile();
    car.progress += dt / spt;

    if (car.progress >= 1.0) {
        car.progress = 0;

        const next = getNextCarState(board, car);
        if (!next) {
            crash();
            return;
        }

        car.row = next.row;
        car.col = next.col;
        car.entering = next.entering;
        board[car.row][car.col].visited = true;
        tilesEntered++;

        if (checkWin(board)) {
            carRunning = false;
            elapsedBeforePause += Date.now() - gameStartTime;
            drawBoard();
            const totalSeconds = Math.floor(elapsedBeforePause / 1000);
            const mins = Math.floor(totalSeconds / 60);
            const secs = totalSeconds % 60;
            const timeStr = mins + ":" + (secs < 10 ? "0" : "") + secs;
            document.getElementById("win-stats").textContent =
                tilesEntered + " tiles in " + timeStr;
            const winHeading = document.querySelector("#win-dialog h2");
            winHeading.style.animation = "none";
            winHeading.offsetHeight;
            winHeading.style.animation = "";
            document.getElementById("win-dialog").classList.remove("hidden");
            return;
        }
    }

    drawBoard();
    animFrameId = requestAnimationFrame(updateCar);
}

// ── Board setup ──
function initBoard() {
    const result = createBoard(currentPreset);
    board = result.board;
    emptyPos = result.emptyPos;
}

// ── Canvas sizing ──
function sizeCanvas() {
    const title = document.getElementById("game-title");
    const controls = document.querySelector(".game-controls");
    const titleH = title ? title.getBoundingClientRect().height + parseFloat(getComputedStyle(title).marginTop) + parseFloat(getComputedStyle(title).marginBottom) : 0;
    const controlsH = controls ? controls.getBoundingClientRect().height + parseFloat(getComputedStyle(controls).marginTop) + parseFloat(getComputedStyle(controls).marginBottom) : 0;
    const chrome = titleH + controlsH + 20;
    const maxDim = Math.min(window.innerWidth - 20, window.innerHeight - chrome);
    tileSize = Math.floor(maxDim / GRID);
    canvas.width = tileSize * GRID;
    canvas.height = tileSize * GRID;
    document.querySelector(".game-status").style.width = canvas.width + "px";
}

function requestFullscreen() {
    const el = document.documentElement;
    const rfs = el.requestFullscreen || el.webkitRequestFullscreen;
    if (rfs && !document.fullscreenElement && !document.webkitFullscreenElement) {
        rfs.call(el).catch(() => {});
    }
}

// ── Init ──
function startGame() {
    requestFullscreen();
    document.getElementById("home-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.remove("hidden");
    document.getElementById("win-dialog").classList.add("hidden");
    document.getElementById("crash-dialog").classList.add("hidden");
    document.getElementById("pause-btn").classList.remove("active");
    document.getElementById("game-title").textContent = currentPreset.name;
    const presetBtns = document.getElementById("preset-buttons");
    if (currentPreset._firebaseKey) {
        presetBtns.classList.remove("hidden");
    } else {
        presetBtns.classList.add("hidden");
    }
    fastMode = false;
    document.getElementById("fast-btn").classList.remove("active");
    gameStartTime = Date.now();
    elapsedBeforePause = 0;
    tilesEntered = 1;
    canvas = document.getElementById("game-canvas");
    ctx = canvas.getContext("2d");
    sizeCanvas();
    initBoard();

    car = {
        row: currentPreset.car.row,
        col: currentPreset.car.col,
        entering: currentPreset.car.entering,
        progress: 0,
    };
    board[car.row][car.col].visited = true;

    drawBoard();
    canvas.addEventListener("click", handleCanvasClick);

    carRunning = true;
    lastCarTime = 0;
    animFrameId = requestAnimationFrame(updateCar);
}

// ── Tile sliding ──
function slideTile(row, col) {
    if (sliding) return;
    if (row < 0 || row >= GRID || col < 0 || col >= GRID) return;
    if (!board[row][col]) return;

    sliding = {
        tile: board[row][col],
        fromRow: row,
        fromCol: col,
        toRow: emptyPos.row,
        toCol: emptyPos.col,
        startTime: performance.now(),
        progress: 0,
    };
    requestAnimationFrame(animateSlide);
}

function handleCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / tileSize);
    const row = Math.floor((e.clientY - rect.top) / tileSize);

    const dr = Math.abs(row - emptyPos.row);
    const dc = Math.abs(col - emptyPos.col);
    if ((dr === 1 && dc === 0) || (dr === 0 && dc === 1)) {
        slideTile(row, col);
    }
}

function handleKeyDown(e) {
    if (!canvas) return;
    if (e.key === "f" || e.key === "F" || e.key === " ") {
        e.preventDefault();
        fastMode = true;
        document.getElementById("fast-btn").classList.add("active");
        return;
    }
    if (e.key === ".") {
        e.preventDefault();
        if (e.repeat) return;
        const btn = document.getElementById("pause-btn");
        if (carRunning) {
            elapsedBeforePause += Date.now() - gameStartTime;
            carRunning = false;
            btn.classList.add("active");
        } else {
            gameStartTime = Date.now();
            carRunning = true;
            lastCarTime = 0;
            animFrameId = requestAnimationFrame(updateCar);
            btn.classList.remove("active");
        }
        return;
    }
    let row = emptyPos.row, col = emptyPos.col;
    switch (e.key) {
        case "ArrowUp":    row += 1; break;
        case "ArrowDown":  row -= 1; break;
        case "ArrowLeft":  col += 1; break;
        case "ArrowRight": col -= 1; break;
        default: return;
    }
    e.preventDefault();
    slideTile(row, col);
}

function handleKeyUp(e) {
    if (e.key === "f" || e.key === "F" || e.key === " ") {
        fastMode = false;
        document.getElementById("fast-btn").classList.remove("active");
    }
}

// ── Win dialog buttons ──
document.getElementById("win-play-again-btn").addEventListener("click", () => {
    document.getElementById("win-dialog").classList.add("hidden");
    startGame();
});

document.getElementById("win-home-btn").addEventListener("click", () => {
    document.getElementById("win-dialog").classList.add("hidden");
    document.getElementById("game-screen").classList.add("hidden");
    document.getElementById("home-screen").classList.remove("hidden");
    carRunning = false;
    car = null;
    skipCarAnimation();
});

// ── Crash dialog buttons ──
document.getElementById("start-over-btn").addEventListener("click", () => {
    document.getElementById("crash-dialog").classList.add("hidden");
    startGame();
});

document.getElementById("home-btn").addEventListener("click", () => {
    document.getElementById("crash-dialog").classList.add("hidden");
    document.getElementById("game-screen").classList.add("hidden");
    document.getElementById("home-screen").classList.remove("hidden");
    carRunning = false;
    car = null;
    skipCarAnimation();
});

document.getElementById("reverse-btn").addEventListener("click", () => {
    document.getElementById("crash-dialog").classList.add("hidden");
    const tile = board[car.row][car.col];
    const exitEdge = getExitEdge(tile.type, car.entering);
    if (exitEdge) {
        car.entering = exitEdge;
    }
    car.progress = 0;
    gameStartTime = Date.now();
    carRunning = true;
    lastCarTime = 0;
    animFrameId = requestAnimationFrame(updateCar);
});

document.getElementById("retry-tile-btn").addEventListener("click", () => {
    document.getElementById("crash-dialog").classList.add("hidden");
    car.progress = 0;
    gameStartTime = Date.now();
    carRunning = true;
    lastCarTime = 0;
    animFrameId = requestAnimationFrame(updateCar);
});

// ── Game screen buttons ──
(function() {
    const btn = document.getElementById("fast-btn");
    function startFast(e) { e.preventDefault(); fastMode = true;  btn.classList.add("active"); }
    function stopFast()            { fastMode = false; btn.classList.remove("active"); }
    btn.addEventListener("mousedown",  startFast);
    btn.addEventListener("touchstart", startFast, { passive: false });
    btn.addEventListener("mouseup",    stopFast);
    btn.addEventListener("mouseleave", stopFast);
    btn.addEventListener("touchend",   stopFast);
    btn.addEventListener("touchcancel",stopFast);
})();

(function() {
    const btn = document.getElementById("pause-btn");
    function togglePause(e) {
        e.preventDefault();
        if (carRunning) {
            elapsedBeforePause += Date.now() - gameStartTime;
            carRunning = false;
            btn.classList.add("active");
        } else {
            gameStartTime = Date.now();
            carRunning = true;
            lastCarTime = 0;
            animFrameId = requestAnimationFrame(updateCar);
            btn.classList.remove("active");
        }
    }
    btn.addEventListener("click", togglePause);
    btn.addEventListener("touchend", (e) => { e.preventDefault(); togglePause(e); });
})();

document.getElementById("game-start-over-btn").addEventListener("click", () => {
    startGame();
});

document.getElementById("game-home-btn").addEventListener("click", () => {
    document.getElementById("game-screen").classList.add("hidden");
    document.getElementById("win-dialog").classList.add("hidden");
    document.getElementById("crash-dialog").classList.add("hidden");
    document.getElementById("home-screen").classList.remove("hidden");
    carRunning = false;
    car = null;
    skipCarAnimation();
});

document.getElementById("remove-preset-btn").addEventListener("click", () => {
    if (!currentPreset._firebaseKey) return;
    // Remove from Firebase
    db.ref("presets/" + currentPreset._firebaseKey).remove().catch(function(err) {
        console.warn("Could not remove preset from Firebase:", err);
    });
    // Remove from local array
    const idx = PRESETS.indexOf(currentPreset);
    if (idx !== -1) PRESETS.splice(idx, 1);
    // Go home
    carRunning = false;
    car = null;
    buildLevelButtons();
    document.getElementById("game-screen").classList.add("hidden");
    document.getElementById("win-dialog").classList.add("hidden");
    document.getElementById("crash-dialog").classList.add("hidden");
    document.getElementById("home-screen").classList.remove("hidden");
    skipCarAnimation();
});

document.getElementById("edit-preset-btn").addEventListener("click", () => {
    carRunning = false;
    car = null;
    openCreateScreen(currentPreset);
});

// ── Build level buttons ──
function buildLevelButtons() {
    const levelContainer = document.getElementById("level-buttons");
    levelContainer.innerHTML = "";
    PRESETS.forEach((preset, i) => {
        const btn = document.createElement("button");
        btn.textContent = preset.name;
        btn.className = "level-btn";
        btn.addEventListener("click", () => {
            currentPreset = PRESETS[i];
            startGame();
        });
        levelContainer.appendChild(btn);
    });

    const createBtn = document.createElement("button");
    createBtn.textContent = "Create\u2026";
    createBtn.className = "level-btn";
    createBtn.addEventListener("click", () => {
        openCreateScreen();
    });
    levelContainer.appendChild(createBtn);
}
buildLevelButtons();

// ── Load cloud presets from Firebase ──
db.ref("presets").once("value").then(function(snapshot) {
    snapshot.forEach(function(child) {
        var preset = child.val();
        preset._firebaseKey = child.key;
        PRESETS.push(preset);
    });
    buildLevelButtons();
}).catch(function(err) {
    console.warn("Could not load cloud presets:", err);
});

// ── Create screen ──

// Tile type labels for the palette, in display order
const PALETTE_TYPES = [
    { id: H,  label: "H" },
    { id: V,  label: "V" },
    { id: TL, label: "TL" },
    { id: TR, label: "TR" },
    { id: BR, label: "BR" },
    { id: BL, label: "BL" },
    { id: X,  label: "X" },
    { id: S,  label: "S" },
    { id: Z,  label: "Z" },
];

let createGrid = []; // 4x4 array of tile type ids (0 = empty)
let createTileSize = 0;
let createCanvas, createCtx;
let createDrag = null; // { type, sourceRow, sourceCol, ghostEl }
let editingPreset = null; // non-null when editing an existing preset

function resetCreateGrid() {
    createGrid = [];
    for (let r = 0; r < GRID; r++) {
        createGrid[r] = [];
        for (let c = 0; c < GRID; c++) {
            createGrid[r][c] = 0;
        }
    }
}

function getCreateTileCount() {
    let count = 0;
    for (let r = 0; r < GRID; r++)
        for (let c = 0; c < GRID; c++)
            if (createGrid[r][c] !== 0) count++;
    return count;
}

function updateCreateButton() {
    const name = document.getElementById("preset-name-input").value.trim();
    const duplicate = name && PRESETS.some(p =>
        p.name.toLowerCase() === name.toLowerCase() && p !== editingPreset
    );
    const count = getCreateTileCount();
    document.getElementById("create-done-btn").disabled = !name || duplicate || count !== 15;
    document.getElementById("create-tile-count-num").textContent = count;
}

function sizeCreateCanvas() {
    const maxDim = Math.min(window.innerWidth - 40, 320);
    createTileSize = Math.floor(maxDim / GRID);
    createCanvas.width = createTileSize * GRID;
    createCanvas.height = createTileSize * GRID;
}

function drawCreateGrid() {
    const savedTileSize = tileSize;
    tileSize = createTileSize;

    createCtx.clearRect(0, 0, createCanvas.width, createCanvas.height);

    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            const ox = c * createTileSize;
            const oy = r * createTileSize;

            if (createGrid[r][c] === 0) {
                // Empty slot
                createCtx.fillStyle = "#060610";
                createCtx.fillRect(ox, oy, createTileSize, createTileSize);
                createCtx.strokeStyle = "rgba(255,255,255,0.08)";
                createCtx.lineWidth = 1;
                createCtx.strokeRect(ox + 0.5, oy + 0.5, createTileSize - 1, createTileSize - 1);
            } else {
                // Draw tile using the same style as game tiles
                const tileType = createGrid[r][c];
                const cx = ox + createTileSize / 2;
                const cy = oy + createTileSize / 2;

                const grad = createCtx.createRadialGradient(cx, cy, 0, cx, cy, createTileSize * 0.7);
                grad.addColorStop(0, "#3a6ab0");
                grad.addColorStop(1, "#1a3060");
                createCtx.fillStyle = grad;
                createCtx.fillRect(ox, oy, createTileSize, createTileSize);

                // 3D edges
                createCtx.strokeStyle = "rgba(255,255,255,0.15)";
                createCtx.lineWidth = 1;
                createCtx.beginPath();
                createCtx.moveTo(ox + 0.5, oy + createTileSize - 0.5);
                createCtx.lineTo(ox + 0.5, oy + 0.5);
                createCtx.lineTo(ox + createTileSize - 0.5, oy + 0.5);
                createCtx.stroke();

                createCtx.strokeStyle = "rgba(0,0,0,0.3)";
                createCtx.beginPath();
                createCtx.moveTo(ox + createTileSize - 0.5, oy + 0.5);
                createCtx.lineTo(ox + createTileSize - 0.5, oy + createTileSize - 0.5);
                createCtx.lineTo(ox + 0.5, oy + createTileSize - 0.5);
                createCtx.stroke();

                // Roads
                const tileDef = TILE_TYPES[tileType];
                for (const [a, b] of tileDef.connections) {
                    drawRoadSegment(createCtx, ox, oy, a, b);
                }
            }
        }
    }

    tileSize = savedTileSize;
}

function initPalette() {
    const container = document.getElementById("create-palette");
    container.innerHTML = "";
    const paletteTileSize = 40;

    PALETTE_TYPES.forEach(({ id }) => {
        const c = document.createElement("canvas");
        c.className = "palette-tile";
        c.width = paletteTileSize;
        c.height = paletteTileSize;
        c.dataset.tileType = id;

        // Draw tile on small canvas
        const savedTileSize = tileSize;
        tileSize = paletteTileSize;
        const pCtx = c.getContext("2d");

        const grad = pCtx.createRadialGradient(paletteTileSize / 2, paletteTileSize / 2, 0,
            paletteTileSize / 2, paletteTileSize / 2, paletteTileSize * 0.7);
        grad.addColorStop(0, "#3a6ab0");
        grad.addColorStop(1, "#1a3060");
        pCtx.fillStyle = grad;
        pCtx.fillRect(0, 0, paletteTileSize, paletteTileSize);

        const tileDef = TILE_TYPES[id];
        for (const [a, b] of tileDef.connections) {
            drawRoadSegment(pCtx, 0, 0, a, b);
        }

        tileSize = savedTileSize;

        // Drag start (mouse)
        c.addEventListener("mousedown", (e) => {
            e.preventDefault();
            startDrag(id, -1, -1, e.clientX, e.clientY, c);
        });

        // Drag start (touch)
        c.addEventListener("touchstart", (e) => {
            e.preventDefault();
            const t = e.touches[0];
            startDrag(id, -1, -1, t.clientX, t.clientY, c);
        });

        container.appendChild(c);
    });
}

function startDrag(tileType, sourceRow, sourceCol, clientX, clientY, sourceEl) {
    // Create ghost element
    const ghost = document.createElement("canvas");
    ghost.id = "create-drag-ghost";
    const ghostSize = createTileSize;
    ghost.width = ghostSize;
    ghost.height = ghostSize;

    const savedTileSize = tileSize;
    tileSize = ghostSize;
    const gCtx = ghost.getContext("2d");

    const grad = gCtx.createRadialGradient(ghostSize / 2, ghostSize / 2, 0,
        ghostSize / 2, ghostSize / 2, ghostSize * 0.7);
    grad.addColorStop(0, "#3a6ab0");
    grad.addColorStop(1, "#1a3060");
    gCtx.fillStyle = grad;
    gCtx.fillRect(0, 0, ghostSize, ghostSize);

    const tileDef = TILE_TYPES[tileType];
    for (const [a, b] of tileDef.connections) {
        drawRoadSegment(gCtx, 0, 0, a, b);
    }
    tileSize = savedTileSize;

    ghost.style.left = (clientX - ghostSize / 2) + "px";
    ghost.style.top = (clientY - ghostSize / 2) + "px";
    document.body.appendChild(ghost);

    // If dragging from grid, remove from source
    if (sourceRow >= 0) {
        createGrid[sourceRow][sourceCol] = 0;
        drawCreateGrid();
        updateCreateButton();
    }

    createDrag = { type: tileType, sourceRow, sourceCol, ghostEl: ghost };
}

function moveGhost(clientX, clientY) {
    if (!createDrag) return;
    const ghost = createDrag.ghostEl;
    const size = createTileSize;
    ghost.style.left = (clientX - size / 2) + "px";
    ghost.style.top = (clientY - size / 2) + "px";
}

function endDrag(clientX, clientY) {
    if (!createDrag) return;

    const rect = createCanvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const col = Math.floor(x / createTileSize);
    const row = Math.floor(y / createTileSize);

    if (row >= 0 && row < GRID && col >= 0 && col < GRID && createGrid[row][col] === 0) {
        createGrid[row][col] = createDrag.type;
    } else if (createDrag.sourceRow >= 0) {
        // Return to source if drop was invalid
        createGrid[createDrag.sourceRow][createDrag.sourceCol] = createDrag.type;
    }

    createDrag.ghostEl.remove();
    createDrag = null;
    drawCreateGrid();
    updateCreateButton();
}

function cancelDrag() {
    if (!createDrag) return;
    // Return tile to source if it came from grid
    if (createDrag.sourceRow >= 0) {
        createGrid[createDrag.sourceRow][createDrag.sourceCol] = createDrag.type;
    }
    createDrag.ghostEl.remove();
    createDrag = null;
    drawCreateGrid();
    updateCreateButton();
}

// Global mouse/touch move and up handlers for drag
document.addEventListener("mousemove", (e) => {
    if (createDrag) {
        e.preventDefault();
        moveGhost(e.clientX, e.clientY);
    }
});

document.addEventListener("mouseup", (e) => {
    if (createDrag) {
        endDrag(e.clientX, e.clientY);
    }
});

document.addEventListener("touchmove", (e) => {
    if (createDrag) {
        e.preventDefault();
        const t = e.touches[0];
        moveGhost(t.clientX, t.clientY);
    }
}, { passive: false });

document.addEventListener("touchend", (e) => {
    if (createDrag) {
        const t = e.changedTouches[0];
        endDrag(t.clientX, t.clientY);
    }
});

document.addEventListener("touchcancel", () => {
    if (createDrag) cancelDrag();
});

// Grid canvas: mousedown to start drag from grid cell
function initCreateGridHandlers() {
    createCanvas = document.getElementById("create-grid-canvas");
    createCtx = createCanvas.getContext("2d");

    createCanvas.addEventListener("mousedown", (e) => {
        const rect = createCanvas.getBoundingClientRect();
        const col = Math.floor((e.clientX - rect.left) / createTileSize);
        const row = Math.floor((e.clientY - rect.top) / createTileSize);
        if (row >= 0 && row < GRID && col >= 0 && col < GRID && createGrid[row][col] !== 0) {
            e.preventDefault();
            startDrag(createGrid[row][col], row, col, e.clientX, e.clientY, createCanvas);
        }
    });

    // Double-click to remove tile (mouse)
    createCanvas.addEventListener("dblclick", (e) => {
        const rect = createCanvas.getBoundingClientRect();
        const col = Math.floor((e.clientX - rect.left) / createTileSize);
        const row = Math.floor((e.clientY - rect.top) / createTileSize);
        if (row >= 0 && row < GRID && col >= 0 && col < GRID && createGrid[row][col] !== 0) {
            createGrid[row][col] = 0;
            drawCreateGrid();
            updateCreateButton();
        }
    });

    // Touch: drag start
    createCanvas.addEventListener("touchstart", (e) => {
        const rect = createCanvas.getBoundingClientRect();
        const t = e.touches[0];
        const col = Math.floor((t.clientX - rect.left) / createTileSize);
        const row = Math.floor((t.clientY - rect.top) / createTileSize);
        if (row >= 0 && row < GRID && col >= 0 && col < GRID && createGrid[row][col] !== 0) {
            e.preventDefault();
            startDrag(createGrid[row][col], row, col, t.clientX, t.clientY, createCanvas);
        }
    });

    // Touch: double-tap detection on touchend (fires before the global endDrag handler)
    let lastTapEnd = { time: 0, row: -1, col: -1 };

    createCanvas.addEventListener("touchend", (e) => {
        const rect = createCanvas.getBoundingClientRect();
        const t = e.changedTouches[0];
        const col = Math.floor((t.clientX - rect.left) / createTileSize);
        const row = Math.floor((t.clientY - rect.top) / createTileSize);
        const now = Date.now();

        if (row >= 0 && row < GRID && col >= 0 && col < GRID &&
            now - lastTapEnd.time < 300 && row === lastTapEnd.row && col === lastTapEnd.col) {
            // Double-tap: cancel any drag in progress and remove the tile
            if (createDrag) { createDrag.ghostEl.remove(); createDrag = null; }
            createGrid[row][col] = 0;
            drawCreateGrid();
            updateCreateButton();
            lastTapEnd = { time: 0, row: -1, col: -1 };
            e.stopPropagation(); // prevent global touchend from calling endDrag
        } else {
            lastTapEnd = { time: now, row, col };
        }
    });
}

function openCreateScreen(preset) {
    document.getElementById("home-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.add("hidden");
    document.getElementById("win-dialog").classList.add("hidden");
    document.getElementById("crash-dialog").classList.add("hidden");

    editingPreset = preset || null;

    if (preset) {
        document.getElementById("preset-name-input").value = preset.name;
        // Populate grid from preset
        for (let r = 0; r < GRID; r++) {
            createGrid[r] = [];
            for (let c = 0; c < GRID; c++) {
                createGrid[r][c] = preset.grid[r][c];
            }
        }
        document.getElementById("create-done-btn").textContent = "Save";
    } else {
        document.getElementById("preset-name-input").value = "";
        resetCreateGrid();
        document.getElementById("create-done-btn").textContent = "Add";
    }

    createCanvas = document.getElementById("create-grid-canvas");
    createCtx = createCanvas.getContext("2d");
    sizeCreateCanvas();
    initPalette();
    drawCreateGrid();
    updateCreateButton();

    document.getElementById("create-screen").classList.remove("hidden");
    document.getElementById("preset-name-input").focus();
}

document.getElementById("preset-name-input").addEventListener("input", () => {
    updateCreateButton();
});

document.getElementById("create-cancel-btn").addEventListener("click", () => {
    document.getElementById("create-screen").classList.add("hidden");
    if (editingPreset) {
        document.getElementById("game-screen").classList.remove("hidden");
    } else {
        document.getElementById("home-screen").classList.remove("hidden");
    }
    editingPreset = null;
});

document.getElementById("create-done-btn").addEventListener("click", () => {
    const name = document.getElementById("preset-name-input").value.trim();
    if (!name) return;
    if (getCreateTileCount() !== 15) return;

    // Find the empty cell
    let emptyRow = -1, emptyCol = -1;
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            if (createGrid[r][c] === 0) {
                emptyRow = r;
                emptyCol = c;
            }
        }
    }

    // Build grid array
    const grid = [];
    for (let r = 0; r < GRID; r++) {
        grid[r] = [];
        for (let c = 0; c < GRID; c++) {
            grid[r][c] = createGrid[r][c];
        }
    }

    // Determine car entering edge: first of top/left/bottom/right that is
    // a connection edge of the tile at [0][0]
    const startTile = createGrid[0][0];
    let entering = "top"; // default fallback
    if (startTile !== 0) {
        const tileDef = TILE_TYPES[startTile];
        const candidates = ["top", "left", "bottom", "right"];
        for (const edge of candidates) {
            let found = false;
            for (const [a, b] of tileDef.connections) {
                if (a === edge || b === edge) { found = true; break; }
            }
            if (found) { entering = edge; break; }
        }
    }

    if (editingPreset) {
        // Update existing preset in place
        editingPreset.name = name;
        editingPreset.grid = grid;
        editingPreset.empty = { row: emptyRow, col: emptyCol };
        editingPreset.car = { row: 0, col: 0, entering: entering };

        // Update in Firebase
        if (editingPreset._firebaseKey) {
            const saveData = { name: name, grid: grid, empty: { row: emptyRow, col: emptyCol }, car: { row: 0, col: 0, entering: entering } };
            db.ref("presets/" + editingPreset._firebaseKey).set(saveData).catch(function(err) {
                console.warn("Could not update preset in Firebase:", err);
            });
        }

        currentPreset = editingPreset;
        editingPreset = null;
        buildLevelButtons();
        document.getElementById("create-screen").classList.add("hidden");
        startGame();
    } else {
        const preset = {
            name: name,
            grid: grid,
            empty: { row: emptyRow, col: emptyCol },
            car: { row: 0, col: 0, entering: entering },
        };

        PRESETS.push(preset);

        // Save to Firebase
        var ref = db.ref("presets").push(preset);
        preset._firebaseKey = ref.key;
        ref.catch(function(err) {
            console.warn("Could not save preset to Firebase:", err);
        });

        buildLevelButtons();
        document.getElementById("create-screen").classList.add("hidden");
        document.getElementById("home-screen").classList.remove("hidden");
    }
});

initCreateGridHandlers();

// ── Event listeners ──
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);

window.addEventListener("resize", () => {
    if (canvas) {
        sizeCanvas();
        drawBoard();
    }
});
