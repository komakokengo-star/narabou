// Single source of truth for the fee model.
// 基本料金 800円, 10分 200円, ピーク +300円, 手数料 20%.

// 本番料金
export const BASE_FEE = 800;
export const TIME_BLOCK_MINUTES = 10;
export const TIME_BLOCK_FEE = 200;
export const PEAK_FEE = 300;
export const PLATFORM_RATE = 0.2;

export interface FeeInput {
  waitMinutes: number;
  isPeak: boolean;
  extraFee?: number;
}

export interface FeeBreakdown {
  base: number;
  time: number;
  peak: number;
  extra: number;
  total: number;
  platformFee: number;
  workerPayout: number;
}

export function calcFee({ waitMinutes, isPeak, extraFee = 0 }: FeeInput): FeeBreakdown {
  const time = Math.ceil(Math.max(0, waitMinutes) / TIME_BLOCK_MINUTES) * TIME_BLOCK_FEE;
  const peak = isPeak ? PEAK_FEE : 0;
  const total = BASE_FEE + time + peak + extraFee;
  const platformFee = Math.round(total * PLATFORM_RATE);
  const workerPayout = total - platformFee;
  return { base: BASE_FEE, time, peak, extra: extraFee, total, platformFee, workerPayout };
}

export interface CancelInput {
  arrived: boolean;
  startedAt: Date | null;
  canceledAt: Date;
  isPeak: boolean;
  extraFee?: number;
  totalPaid: number;
}

// Returns the amount the customer KEEPS (charged amount), and refund.
export function calcCancelRefund(input: CancelInput): { charge: number; refund: number } {
  let charge: number;
  if (!input.arrived) {
    charge = 0;
  } else if (!input.startedAt) {
    // arrived but not yet started queueing
    charge = BASE_FEE + (input.isPeak ? PEAK_FEE : 0);
  } else {
    const minutes = Math.max(
      0,
      Math.ceil((input.canceledAt.getTime() - input.startedAt.getTime()) / 60000),
    );
    const fee = calcFee({ waitMinutes: minutes, isPeak: input.isPeak, extraFee: input.extraFee });
    charge = fee.total;
  }
  const refund = Math.max(0, input.totalPaid - charge);
  return { charge, refund };
}

export function formatYen(n: number): string {
  return `¥${n.toLocaleString("ja-JP")}`;
}
