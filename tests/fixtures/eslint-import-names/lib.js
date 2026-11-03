export function a() {}
export const { b, c: [d] } = { b: 1, c: [2] };
const e = 3;
export { e as renamed };
export default 4;
export * from "./more.js";
