export const randomRgbaColor = (alpha: number = 1) => {
  const r = Math.floor(Math.random() * 256);
  const g = Math.floor(Math.random() * 256);
  const b = Math.floor(Math.random() * 256);
  return `rgb(${r},${g},${b},${alpha})`;
};

export const disabledColor = (index: number) => {
  const idx = index % 3;
  const alpha = Math.floor(Math.random() * 3) + 6;
  const rgb = ["96,96,96", "144,153,153", "168,171,178"][idx];
  return `rgba(${rgb},0.${alpha})`;
};

export const activeColor = (index: number) => {
  const idx = index % 3;
  const alpha = Math.floor(Math.random()) + 8;
  const rgb = ["64,158,255", "51.2,126.4,204", "121.3,187.1,255"][idx];
  return `rgba(${rgb},0.${alpha})`;
};

export const fullColor = (index: number) => {
  const idx = index % 3;
  const alpha = Math.floor(Math.random()) + 8;
  const rgb = [
    "245, 108, 108", //#F56C6C rgb(245, 108, 108)
    "196, 86.4, 86.4", // rgb(196, 86.4, 86.4)
    "248, 152.1, 152.1", // rgb(248, 152.1, 152.1)
  ][idx];
  return `rgba(${rgb},0.${alpha})`;
};
