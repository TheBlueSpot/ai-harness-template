export type GridCell = {
  x: number;
  y: number;
};

export function gridKey(cell: GridCell) {
  return `${cell.x},${cell.y}`;
}

export function inBounds(cell: GridCell, width: number, height: number) {
  return cell.x >= 0 && cell.x < width && cell.y >= 0 && cell.y < height;
}

export function sameCell(a: GridCell, b: GridCell) {
  return a.x === b.x && a.y === b.y;
}

export function opposite(a: GridCell, b: GridCell) {
  return a.x === -b.x && a.y === -b.y;
}
