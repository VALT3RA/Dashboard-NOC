export type SeverityVisualConfig = {
  level: number;
  label: string;
  colorHex: string;
};

export type DailySeriesPoint = {
  day: string;
  total: number;
  breakdown: Record<number, number>;
};
