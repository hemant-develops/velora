// PHASE 7 -- Owner Earnings Export. A tiny, dependency-free CSV builder --
// deliberately NOT using expo-file-system/expo-sharing (neither is an
// existing dependency of this project; adding either would pull in a native
// module and force this feature into an `eas build`, not a plain JS
// `eas update` OTA push, unlike every other Phase 1-7 change so far). The
// export instead hands the CSV text straight to React Native's own built-in
// `Share` API (see OwnerDashboardScreen's onExportEarnings) -- Share ships
// as part of react-native itself, so this stays a pure JS/TS change.
const escapeCsvField = (value: string | number): string => {
  const s = String(value);
  // Only needs quoting when it contains a comma, a quote, or a newline --
  // quoting everything else would just make the file noisier to read.
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

export const rowsToCsv = (rows: (string | number)[][]): string =>
  rows.map((row) => row.map(escapeCsvField).join(',')).join('\n');
