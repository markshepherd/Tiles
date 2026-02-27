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

function getSecondsPerTile() {
    const val = parseInt(document.getElementById("speed-slider").value);
    return 0.5 + (10 - val) * 0.5;
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

function drawCar(offsetX = 0, offsetY = 0) {
    const pos = getCarPosition(car.row, car.col, car.entering, car.progress);
    if (!pos) return;

    const cx = pos.x + offsetX;
    const cy = pos.y + offsetY;
    const heading = getCarHeading();
    const s = tileSize / 6; // half-length of car body

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(heading);

    // Soft glow
    const glow = ctx.createRadialGradient(0, 0, s * 0.5, 0, 0, s * 2.5);
    glow.addColorStop(0, "rgba(233, 69, 96, 0.3)");
    glow.addColorStop(1, "rgba(233, 69, 96, 0)");
    ctx.beginPath();
    ctx.arc(0, 0, s * 2.5, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    const bw = s * 1.3; // body half-width
    const bh = s * 0.75; // body half-height
    const r = s * 0.2;   // corner radius

    // Wheels (dark rectangles behind the body)
    ctx.fillStyle = "#222";
    const wl = s * 0.4, ww = s * 0.25;
    // front wheels
    ctx.fillRect(bw * 0.35, -bh - ww * 0.5, wl, ww);
    ctx.fillRect(bw * 0.35,  bh - ww * 0.5, wl, ww);
    // rear wheels
    ctx.fillRect(-bw * 0.35 - wl, -bh - ww * 0.5, wl, ww);
    ctx.fillRect(-bw * 0.35 - wl,  bh - ww * 0.5, wl, ww);

    // Car body (rounded rectangle)
    const bodyGrad = ctx.createLinearGradient(0, -bh, 0, bh);
    bodyGrad.addColorStop(0, "#ff5a6e");
    bodyGrad.addColorStop(0.5, "#e94560");
    bodyGrad.addColorStop(1, "#c73050");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(-bw + r, -bh);
    ctx.lineTo(bw - r, -bh);
    ctx.quadraticCurveTo(bw, -bh, bw, -bh + r);
    ctx.lineTo(bw, bh - r);
    ctx.quadraticCurveTo(bw, bh, bw - r, bh);
    ctx.lineTo(-bw + r, bh);
    ctx.quadraticCurveTo(-bw, bh, -bw, bh - r);
    ctx.lineTo(-bw, -bh + r);
    ctx.quadraticCurveTo(-bw, -bh, -bw + r, -bh);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Windshield (front)
    ctx.fillStyle = "rgba(150, 220, 255, 0.6)";
    ctx.beginPath();
    const wx = bw * 0.3;
    ctx.moveTo(wx, -bh * 0.55);
    ctx.lineTo(bw * 0.75, -bh * 0.35);
    ctx.lineTo(bw * 0.75,  bh * 0.35);
    ctx.lineTo(wx,  bh * 0.55);
    ctx.closePath();
    ctx.fill();

    // Rear window
    ctx.fillStyle = "rgba(150, 220, 255, 0.35)";
    ctx.beginPath();
    ctx.moveTo(-wx, -bh * 0.45);
    ctx.lineTo(-bw * 0.7, -bh * 0.3);
    ctx.lineTo(-bw * 0.7,  bh * 0.3);
    ctx.lineTo(-wx,  bh * 0.45);
    ctx.closePath();
    ctx.fill();

    // Headlights
    ctx.fillStyle = "rgba(255, 255, 200, 0.9)";
    ctx.fillRect(bw - 1, -bh * 0.6, 2, bh * 0.3);
    ctx.fillRect(bw - 1,  bh * 0.3, 2, bh * 0.3);

    // Tail lights
    ctx.fillStyle = "rgba(255, 50, 50, 0.8)";
    ctx.fillRect(-bw - 1, -bh * 0.5, 2, bh * 0.25);
    ctx.fillRect(-bw - 1,  bh * 0.25, 2, bh * 0.25);

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
    car.progress = Math.min(car.progress, 1.0);
    drawBoard();
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

        if (checkWin(board)) {
            carRunning = false;
            drawBoard();
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
}

// ── Init ──
function startGame() {
    document.getElementById("home-screen").classList.add("hidden");
    document.getElementById("game-screen").classList.remove("hidden");
    document.getElementById("win-dialog").classList.add("hidden");
    document.getElementById("crash-dialog").classList.add("hidden");
    document.getElementById("pause-btn").textContent = "Pause";
    document.getElementById("game-title").textContent = currentPreset.name;
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
    let row = emptyPos.row, col = emptyPos.col;
    switch (e.key) {
        case "ArrowUp":    row += 1; break;
        case "ArrowDown":  row -= 1; break;
        case "ArrowLeft":  col += 1; break;
        case "ArrowRight": col -= 1; break;
        case " ":
            e.preventDefault();
            document.getElementById("pause-btn").click();
            return;
        default: return;
    }
    e.preventDefault();
    slideTile(row, col);
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
});

document.getElementById("reverse-btn").addEventListener("click", () => {
    document.getElementById("crash-dialog").classList.add("hidden");
    const tile = board[car.row][car.col];
    const exitEdge = getExitEdge(tile.type, car.entering);
    if (exitEdge) {
        car.entering = exitEdge;
    }
    car.progress = 0;
    carRunning = true;
    lastCarTime = 0;
    animFrameId = requestAnimationFrame(updateCar);
});

document.getElementById("retry-tile-btn").addEventListener("click", () => {
    document.getElementById("crash-dialog").classList.add("hidden");
    car.progress = 0;
    carRunning = true;
    lastCarTime = 0;
    animFrameId = requestAnimationFrame(updateCar);
});

// ── Game screen buttons ──
document.getElementById("pause-btn").addEventListener("click", () => {
    const btn = document.getElementById("pause-btn");
    if (carRunning) {
        carRunning = false;
        btn.textContent = "Resume";
    } else {
        carRunning = true;
        lastCarTime = 0;
        animFrameId = requestAnimationFrame(updateCar);
        btn.textContent = "Pause";
    }
});

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
});

// ── Build level buttons ──
const levelContainer = document.getElementById("level-buttons");
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

// ── Event listeners ──
window.addEventListener("keydown", handleKeyDown);

window.addEventListener("resize", () => {
    if (canvas) {
        sizeCanvas();
        drawBoard();
    }
});
