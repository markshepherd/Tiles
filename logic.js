// ── Tile type IDs ──
var H   = 1; // Horizontal
var V   = 2; // Vertical
var TL  = 3; // Curve Top-Left
var TR  = 4; // Curve Top-Right
var BR  = 5; // Curve Bottom-Right
var BL  = 6; // Curve Bottom-Left
var X   = 7; // Cross
var S   = 8; // S-curve
var Z   = 9; // Z-curve
var __  = 0; // Empty

// ── Tile type definitions ──
var TILE_TYPES = {
    1: { name: "Horizontal", connections: [["left", "right"]] },
    2: { name: "Vertical",   connections: [["top", "bottom"]] },
    3: { name: "Curve TL",   connections: [["top", "left"]] },
    4: { name: "Curve TR",   connections: [["top", "right"]] },
    5: { name: "Curve BR",   connections: [["bottom", "right"]] },
    6: { name: "Curve BL",   connections: [["bottom", "left"]] },
    7: { name: "Cross",      connections: [["top", "bottom"], ["left", "right"]] },
    8: { name: "S-curve",    connections: [["top", "left"], ["bottom", "right"]] },
    9: { name: "Z-curve",    connections: [["top", "right"], ["bottom", "left"]] },
};

// Opposite edges for entering the next tile
var OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" };

// Direction offsets: which adjacent cell does an exit edge lead to?
var EDGE_DELTA = {
    top:    { dr: -1, dc: 0 },
    bottom: { dr: 1,  dc: 0 },
    left:   { dr: 0,  dc: -1 },
    right:  { dr: 0,  dc: 1 },
};

var GRID = 4;

// ── Presets ──
var PRESETS = [
    {
        name: "Level 1",
        grid: [
            [S,  X,  X, Z],
            [X,  S,  Z, X],
            [X,  Z, __, X],
            [Z,  X,  X, S],
        ],
        empty: { row: 2, col: 2 },
        car: { row: 0, col: 0, entering: "bottom" },
    },
    {
        name: "Level 2",
        grid: [
            [BR,  H, BL,  V],
            [ V, BL,  V,  V],
            [ V, __,  TR, TL],
            [TR,  H,  H, TL],
        ],
        empty: { row: 2, col: 1 },
        car: { row: 0, col: 3, entering: "top" },
    },
    {
        name: "Level 3",
        grid: [
            [TL,  V,   V,   V],
            [ H, BR,   S,   V],
            [ V,  H,  __,   S],
            [BL, TR,   H,   V],
        ],
        empty: { row: 2, col: 2 },
        car: { row: 0, col: 3, entering: "top" },
    },
    {
        name: "Snake",
        grid: [
            [TR,  H,   H,   BL],
            [BR, H,   H,  TL],
            [TR, H,   H,  BL],
            [__, H,   H,   TL],
        ],
        empty: { row: 3, col: 0 },
        car: { row: 0, col: 0, entering: "top" },
    },
    {
        name: "Circles",
        grid: [
            [BR, BL,  BR,  BL],
            [TR, TL,  TR,  TL],
            [BR, BL,  BR,  BL],
            [TR, TL,  TR,  __],
        ],
        empty: { row: 3, col: 3 },
        car: { row: 0, col: 0, entering: "bottom" },
    },
];

// Given a tile type and the edge the car entered from, return the exit edge
function getExitEdge(tileType, enteringEdge) {
    const tileDef = TILE_TYPES[tileType];
    if (!tileDef) return null;
    const conns = tileDef.connections;
    for (const [a, b] of conns) {
        if (a === enteringEdge) return b;
        if (b === enteringEdge) return a;
    }
    return null;
}

// Create a board from a preset. Returns { board, emptyPos }.
function createBoard(preset) {
    const board = [];
    for (let r = 0; r < GRID; r++) {
        board[r] = [];
        for (let c = 0; c < GRID; c++) {
            const type = preset.grid[r][c];
            if (type === 0) {
                board[r][c] = null;
            } else {
                board[r][c] = { type, row: r, col: c, visited: false };
            }
        }
    }
    const emptyPos = { ...preset.empty };
    return { board, emptyPos };
}

// Try to slide a tile at (row, col) into the empty position.
// Returns new { board, emptyPos } or null if the move is invalid.
function trySlide(board, emptyPos, row, col) {
    if (row < 0 || row >= GRID || col < 0 || col >= GRID) return null;
    if (!board[row][col]) return null;

    const dr = Math.abs(row - emptyPos.row);
    const dc = Math.abs(col - emptyPos.col);
    if (!((dr === 1 && dc === 0) || (dr === 0 && dc === 1))) return null;

    // Deep-copy board
    const newBoard = board.map(r => r.map(cell => cell ? { ...cell } : null));
    const tile = newBoard[row][col];
    tile.row = emptyPos.row;
    tile.col = emptyPos.col;
    newBoard[emptyPos.row][emptyPos.col] = tile;
    newBoard[row][col] = null;

    return { board: newBoard, emptyPos: { row, col } };
}

// Check if all tiles on the board have been visited.
function checkWin(board) {
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            if (board[r][c] && !board[r][c].visited) return false;
        }
    }
    return true;
}

// Given board and car state {row, col, entering}, return the next car state
// after the car exits the current tile and enters the next one.
// Returns {row, col, entering} or null if the car crashes.
function getNextCarState(board, car) {
    const tile = board[car.row] && board[car.row][car.col];
    if (!tile) return null;

    const exitEdge = getExitEdge(tile.type, car.entering);
    if (!exitEdge) return null;

    const delta = EDGE_DELTA[exitEdge];
    const newRow = car.row + delta.dr;
    const newCol = car.col + delta.dc;

    if (newRow < 0 || newRow >= GRID || newCol < 0 || newCol >= GRID) return null;

    const nextTile = board[newRow][newCol];
    if (!nextTile) return null;

    const newEntering = OPPOSITE[exitEdge];
    if (!getExitEdge(nextTile.type, newEntering)) return null;

    return { row: newRow, col: newCol, entering: newEntering };
}
