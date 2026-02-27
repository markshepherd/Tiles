import assert from "node:assert/strict";
import {
    H, V, TL, TR, BR, BL, X, S, Z, __,
    TILE_TYPES, OPPOSITE, EDGE_DELTA, GRID, PRESETS,
    getExitEdge, createBoard, trySlide, checkWin, getNextCarState,
} from "./logic.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  PASS: ${name}`);
    } catch (e) {
        failed++;
        console.log(`  FAIL: ${name}`);
        console.log(`        ${e.message}`);
    }
}

function group(name) {
    console.log(`\n── ${name} ──`);
}

// ═══════════════════════════════════════════
// getExitEdge
// ═══════════════════════════════════════════
group("getExitEdge");

test("H: left→right", () => assert.equal(getExitEdge(H, "left"), "right"));
test("H: right→left", () => assert.equal(getExitEdge(H, "right"), "left"));
test("H: top→null",   () => assert.equal(getExitEdge(H, "top"), null));
test("H: bottom→null",() => assert.equal(getExitEdge(H, "bottom"), null));

test("V: top→bottom", () => assert.equal(getExitEdge(V, "top"), "bottom"));
test("V: bottom→top", () => assert.equal(getExitEdge(V, "bottom"), "top"));
test("V: left→null",  () => assert.equal(getExitEdge(V, "left"), null));

test("TL: top→left",  () => assert.equal(getExitEdge(TL, "top"), "left"));
test("TL: left→top",  () => assert.equal(getExitEdge(TL, "left"), "top"));
test("TL: right→null",() => assert.equal(getExitEdge(TL, "right"), null));

test("TR: top→right",  () => assert.equal(getExitEdge(TR, "top"), "right"));
test("TR: right→top",  () => assert.equal(getExitEdge(TR, "right"), "top"));

test("BR: bottom→right", () => assert.equal(getExitEdge(BR, "bottom"), "right"));
test("BR: right→bottom", () => assert.equal(getExitEdge(BR, "right"), "bottom"));

test("BL: bottom→left", () => assert.equal(getExitEdge(BL, "bottom"), "left"));
test("BL: left→bottom", () => assert.equal(getExitEdge(BL, "left"), "bottom"));

test("X: top→bottom",  () => assert.equal(getExitEdge(X, "top"), "bottom"));
test("X: bottom→top",  () => assert.equal(getExitEdge(X, "bottom"), "top"));
test("X: left→right",  () => assert.equal(getExitEdge(X, "left"), "right"));
test("X: right→left",  () => assert.equal(getExitEdge(X, "right"), "left"));

test("S: top→left",       () => assert.equal(getExitEdge(S, "top"), "left"));
test("S: left→top",       () => assert.equal(getExitEdge(S, "left"), "top"));
test("S: bottom→right",   () => assert.equal(getExitEdge(S, "bottom"), "right"));
test("S: right→bottom",   () => assert.equal(getExitEdge(S, "right"), "bottom"));

test("Z: top→right",      () => assert.equal(getExitEdge(Z, "top"), "right"));
test("Z: right→top",      () => assert.equal(getExitEdge(Z, "right"), "top"));
test("Z: bottom→left",    () => assert.equal(getExitEdge(Z, "bottom"), "left"));
test("Z: left→bottom",    () => assert.equal(getExitEdge(Z, "left"), "bottom"));

test("invalid tile type returns null", () => assert.equal(getExitEdge(99, "top"), null));

// ═══════════════════════════════════════════
// createBoard
// ═══════════════════════════════════════════
group("createBoard");

for (const preset of PRESETS) {
    test(`${preset.name}: 15 tiles + 1 null`, () => {
        const { board } = createBoard(preset);
        let tiles = 0, nulls = 0;
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                if (board[r][c]) tiles++;
                else nulls++;
            }
        }
        assert.equal(tiles, 15);
        assert.equal(nulls, 1);
    });

    test(`${preset.name}: empty position correct`, () => {
        const { board, emptyPos } = createBoard(preset);
        assert.equal(board[emptyPos.row][emptyPos.col], null);
        assert.equal(emptyPos.row, preset.empty.row);
        assert.equal(emptyPos.col, preset.empty.col);
    });

    test(`${preset.name}: all tiles start unvisited`, () => {
        const { board } = createBoard(preset);
        for (let r = 0; r < GRID; r++) {
            for (let c = 0; c < GRID; c++) {
                if (board[r][c]) {
                    assert.equal(board[r][c].visited, false);
                }
            }
        }
    });
}

// ═══════════════════════════════════════════
// trySlide
// ═══════════════════════════════════════════
group("trySlide");

test("slide adjacent tile into empty space", () => {
    const { board, emptyPos } = createBoard(PRESETS[0]);
    // Empty at (2,2). Tile at (2,1) is adjacent.
    const result = trySlide(board, emptyPos, 2, 1);
    assert.notEqual(result, null);
    assert.equal(result.board[2][2] !== null, true);
    assert.equal(result.board[2][1], null);
    assert.deepEqual(result.emptyPos, { row: 2, col: 1 });
});

test("slide tile from above empty space", () => {
    const { board, emptyPos } = createBoard(PRESETS[0]);
    const result = trySlide(board, emptyPos, 1, 2);
    assert.notEqual(result, null);
    assert.equal(result.board[2][2] !== null, true);
    assert.equal(result.board[1][2], null);
});

test("non-adjacent tile returns null", () => {
    const { board, emptyPos } = createBoard(PRESETS[0]);
    const result = trySlide(board, emptyPos, 0, 0);
    assert.equal(result, null);
});

test("diagonal tile returns null", () => {
    const { board, emptyPos } = createBoard(PRESETS[0]);
    const result = trySlide(board, emptyPos, 1, 1);
    assert.equal(result, null);
});

test("out-of-bounds returns null", () => {
    const { board, emptyPos } = createBoard(PRESETS[0]);
    assert.equal(trySlide(board, emptyPos, -1, 0), null);
    assert.equal(trySlide(board, emptyPos, 4, 0), null);
});

test("sliding empty cell returns null", () => {
    const { board, emptyPos } = createBoard(PRESETS[0]);
    assert.equal(trySlide(board, emptyPos, emptyPos.row, emptyPos.col), null);
});

test("original board is not mutated", () => {
    const { board, emptyPos } = createBoard(PRESETS[0]);
    const origTile = board[2][1];
    trySlide(board, emptyPos, 2, 1);
    assert.equal(board[2][1], origTile);
    assert.equal(board[2][2], null);
});

// ═══════════════════════════════════════════
// checkWin
// ═══════════════════════════════════════════
group("checkWin");

test("false when unvisited tiles exist", () => {
    const { board } = createBoard(PRESETS[0]);
    assert.equal(checkWin(board), false);
});

test("true when all tiles visited", () => {
    const { board } = createBoard(PRESETS[0]);
    for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
            if (board[r][c]) board[r][c].visited = true;
        }
    }
    assert.equal(checkWin(board), true);
});

test("true when some visited and rest are null", () => {
    // Board with only one tile, visited
    const board = [[null, null, null, null],
                   [null, null, null, null],
                   [null, null, null, null],
                   [null, null, null, { type: H, visited: true }]];
    assert.equal(checkWin(board), true);
});

// ═══════════════════════════════════════════
// getNextCarState
// ═══════════════════════════════════════════
group("getNextCarState");

test("car follows connected tiles", () => {
    // Level 1: car starts at (0,0) entering "bottom", tile is S (top→left, bottom→right)
    const { board } = createBoard(PRESETS[0]);
    const next = getNextCarState(board, { row: 0, col: 0, entering: "bottom" });
    assert.notEqual(next, null);
    // S-curve entering bottom exits right, so next tile is (0,1) entering left
    assert.deepEqual(next, { row: 0, col: 1, entering: "left" });
});

test("car returns null at board edge", () => {
    // Create a board where the car would exit off the grid
    const { board } = createBoard(PRESETS[0]);
    // S at (0,0): entering top exits left → off the board
    const result = getNextCarState(board, { row: 0, col: 0, entering: "top" });
    assert.equal(result, null);
});

test("car returns null on empty cell", () => {
    const { board } = createBoard(PRESETS[0]);
    const result = getNextCarState(board, { row: 2, col: 2, entering: "top" });
    assert.equal(result, null);
});

test("car returns null when next tile has no matching road", () => {
    // Build a custom board: H at (0,0), V at (0,1)
    // Car enters H from left, exits right into V. V has no "left" connection → crash.
    const board = [
        [{ type: H, visited: false }, { type: V, visited: false }, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
    ];
    const result = getNextCarState(board, { row: 0, col: 0, entering: "left" });
    assert.equal(result, null);
});

test("car traverses multiple tiles in sequence", () => {
    // Level 2: car starts at (0,3) entering "top", tile is V
    const { board } = createBoard(PRESETS[1]);
    let state = { row: 0, col: 3, entering: "top" };
    const next1 = getNextCarState(board, state);
    assert.notEqual(next1, null);
    // V entering top → exits bottom → goes to (1,3)
    assert.deepEqual(next1, { row: 1, col: 3, entering: "top" });

    const next2 = getNextCarState(board, next1);
    assert.notEqual(next2, null);
    // (1,3) is V → exits bottom → goes to (2,3)
    // But (2,3) is TL in level 2: connections top→left
    assert.deepEqual(next2, { row: 2, col: 3, entering: "top" });
});

// ═══════════════════════════════════════════
// Preset validation
// ═══════════════════════════════════════════
group("Preset validation");

for (const preset of PRESETS) {
    test(`${preset.name}: car start tile accepts entering edge`, () => {
        const { board } = createBoard(preset);
        const carStart = preset.car;
        const tile = board[carStart.row][carStart.col];
        assert.notEqual(tile, null, "Car start position must have a tile");
        const exit = getExitEdge(tile.type, carStart.entering);
        assert.notEqual(exit, null, `Tile at car start must accept entering edge "${carStart.entering}"`);
    });
}

// ═══════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════
console.log(`\n${"═".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
