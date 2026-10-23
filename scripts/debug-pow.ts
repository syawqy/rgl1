import {
  POW_DEFENSE_FRACTION,
  POW_ACCURACY_FRACTION,
  POW_DAMAGE_FRACTION,
  FP_FACTOR,
  POW_TABLE_LAST_INDEX,
} from "../src/core/powerTables";
import { defenseFraction, accuracyFraction, damageFraction } from "../src/core/combat";

console.log("table length:", POW_DEFENSE_FRACTION.length, "lastIndex:", POW_TABLE_LAST_INDEX);
console.log("FP_FACTOR:", FP_FACTOR);

// Which index holds exactly 1.0 (65536)?
for (const [name, t] of [
  ["defense", POW_DEFENSE_FRACTION],
  ["accuracy", POW_ACCURACY_FRACTION],
  ["damage", POW_DAMAGE_FRACTION],
] as const) {
  const i = t.indexOf(65536);
  console.log(`${name}: index of 1.0 = ${i}`);
}

// Consecutive ratio -> exponent step
const r = POW_DEFENSE_FRACTION[81] / POW_DEFENSE_FRACTION[80];
console.log("defense consecutive ratio:", r, "=> 0.877^(1/4) =", Math.pow(0.877347265, 0.25));

// Check implementation against the table
for (const tenths of [0, 10, 20, 30, 40, 70, 110]) {
  const idx = Math.floor(tenths * 0.4) + 80;
  const expected = POW_DEFENSE_FRACTION[idx] / FP_FACTOR;
  const actual = defenseFraction(tenths);
  console.log(
    `defense ${tenths} tenths -> idx ${idx}: table=${expected.toFixed(6)} impl=${actual.toFixed(6)} ${expected === actual ? "OK" : "MISMATCH"}`
  );
}

for (const tenths of [0, 10, 20, 30]) {
  const idx = Math.floor(tenths * 4) + 80;
  const expected = POW_ACCURACY_FRACTION[idx] / FP_FACTOR;
  const actual = accuracyFraction(tenths);
  console.log(
    `accuracy ${tenths} tenths -> idx ${idx}: table=${expected.toFixed(6)} impl=${actual.toFixed(6)} ${expected === actual ? "OK" : "MISMATCH"}`
  );
  const dexp = POW_DAMAGE_FRACTION[idx] / FP_FACTOR;
  console.log(
    `damage   ${tenths} tenths -> idx ${idx}: table=${dexp.toFixed(6)} impl=${damageFraction(tenths).toFixed(6)} ${dexp === damageFraction(tenths) ? "OK" : "MISMATCH"}`
  );
}
