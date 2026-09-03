import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  billDueDateForPaint,
  headerDueDateFromPaymentSchedule,
  planDueDateScheduleSync,
  headerDueDateDiffersFromSchedule,
  planPaymentScheduleMinRow,
  dueDateMultiInstallmentHint,
} from "../src/bill-payment-schedule.js";

describe("bill-payment-schedule", () => {
  it("headerDueDateFromPaymentSchedule uses last row", () => {
    assert.equal(
      headerDueDateFromPaymentSchedule({
        payment_schedule: [{ due_date: "2026-08-01" }, { due_date: "2026-08-30" }],
      }),
      "2026-08-30",
    );
  });

  it("planDueDateScheduleSync covers empty, single, and multi row", () => {
    assert.deepEqual(planDueDateScheduleSync({}, "2026-09-01"), {
      action: "create_row",
      due_date: "2026-09-01",
    });
    assert.deepEqual(
      planDueDateScheduleSync({ payment_schedule: [{ due_date: "2026-08-01" }] }, "2026-09-01"),
      { action: "update_row", index: 0, due_date: "2026-09-01" },
    );
    assert.deepEqual(
      planDueDateScheduleSync(
        { payment_schedule: [{ due_date: "a" }, { due_date: "b" }] },
        "2026-09-01",
      ),
      { action: "update_last_row", index: 1, due_date: "2026-09-01", multiInstallment: true },
    );
  });

  it("billDueDateForPaint prefers schedule over stale header", () => {
    assert.equal(
      billDueDateForPaint({
        due_date: "2026-08-01",
        payment_schedule: [{ due_date: "2026-08-30" }],
      }),
      "2026-08-30",
    );
    assert.equal(billDueDateForPaint({ due_date: "2026-08-15" }), "2026-08-15");
  });

  it("headerDueDateDiffersFromSchedule detects mismatch", () => {
    assert.equal(
      headerDueDateDiffersFromSchedule({
        due_date: "2026-08-01",
        payment_schedule: [{ due_date: "2026-08-30" }],
      }),
      true,
    );
    assert.equal(
      headerDueDateDiffersFromSchedule({
        due_date: "2026-08-30",
        payment_schedule: [{ due_date: "2026-08-30" }],
      }),
      false,
    );
  });

  it("planPaymentScheduleMinRow creates row when due_date without schedule", () => {
    assert.deepEqual(planPaymentScheduleMinRow({}), { action: "noop" });
    assert.deepEqual(planPaymentScheduleMinRow({ payment_schedule: [{ due_date: "x" }] }), {
      action: "noop",
    });
    assert.deepEqual(planPaymentScheduleMinRow({ due_date: "2026-09-01", grand_total: 100 }), {
      action: "need_row",
      due_date: "2026-09-01",
      payment_amount: 100,
    });
  });

  it("dueDateMultiInstallmentHint warns on multi-row Terms", () => {
    assert.match(
      dueDateMultiInstallmentHint({ multiInstallment: true }) || "",
      /last installment/i,
    );
    assert.equal(dueDateMultiInstallmentHint({ multiInstallment: false }), null);
  });
});
