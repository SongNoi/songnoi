import { afterEach, describe, expect, it } from "vitest"
import {
  createFieldRegistry,
  parseCellOptions,
  parseFormSchema,
  validateResponse,
} from "../../src/api"
import { dateField } from "../../src/fields/date"
import { dateAnswerCases, dateCellCases, secondsOffsetCases } from "../fixtures/date-cases"

// T023 — the process time zone never changes a date result (spec R1, R16, AC23 process-time-zone
// part; plan "Dates and UTC", Proof AC23). Node-only: it flips `process.env.TZ` mid-run, which a
// browser cannot do (Chromium runs the same case table under `Pacific/Kiritimati` and `th-TH`
// instead). Re-runs the whole shared date case table (`test/fixtures/date-cases.ts`: answers,
// cells, local-mean-time cells) under each zone and asserts the outputs are identical to the
// first run and to the written expectations. Each flip is checked to have really taken effect
// (local getters and the default `Intl` zone), so a no-op flip cannot pass silently.

const registry = createFieldRegistry([dateField])

const ZONES = [
  "Pacific/Pago_Pago", // UTC−11 (the Node project's own zone)
  "Pacific/Kiritimati", // UTC+14
  "Asia/Bangkok", // UTC+7
  "America/New_York", // daylight saving
  "Asia/Kathmandu", // +05:45
  "UTC",
] as const

/** Local wall time of 2026-01-15T12:00Z in each zone: proves the flip changed the process zone. */
const LOCAL_TIME_AT_NOON_UTC: Readonly<Record<(typeof ZONES)[number], string>> = {
  "Pacific/Pago_Pago": "01:00",
  "Pacific/Kiritimati": "02:00",
  "Asia/Bangkok": "19:00",
  "America/New_York": "07:00",
  "Asia/Kathmandu": "17:45",
  UTC: "12:00",
}

/** The process-local wall time of 2026-01-15T12:00Z (local getters on purpose: the tripwire). */
function localTimeAtNoonUtc(): string {
  const noonUtc = new Date(Date.UTC(2026, 0, 15, 12))
  const hh = String(noonUtc.getHours()).padStart(2, "0")
  const mm = String(noonUtc.getMinutes()).padStart(2, "0")
  return `${hh}:${mm}`
}

const originalTz = process.env.TZ

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

function schemaFor(includeTime: boolean) {
  const result = parseFormSchema(
    {
      schemaVersion: 1,
      meta: { title: "แบบฟอร์มนัดหมาย", language: "th" },
      fields: [{ fieldId: "when", type: "date", label: "วันที่", config: { includeTime } }],
    },
    registry,
  )
  if (!result.ok) return expect.fail(JSON.stringify(result.issues))
  return result.schema
}

/** Every output of the shared table, as plain JSON, in table order. */
function runTable(): unknown[] {
  const out: unknown[] = []
  const schemas = { false: schemaFor(false), true: schemaFor(true) }
  for (const row of dateAnswerCases) {
    out.push(validateResponse(schemas[`${row.includeTime}`], { when: row.input }, registry))
  }
  const config = (includeTime: boolean) => dateField.config.parse({ includeTime })
  for (const row of [
    ...dateCellCases,
    ...secondsOffsetCases.map((c) => ({ ...c, includeTime: true })),
  ]) {
    const options = parseCellOptions(row.timeZone === undefined ? {} : { timeZone: row.timeZone })
    if (!options.ok)
      return expect.fail(`${String(row.timeZone)}: ${JSON.stringify(options.issues)}`)
    out.push(dateField.toCell(row.answer, config(row.includeTime), options.options))
  }
  return out
}

/** The outputs the table itself writes out (local-mean-time rows have no written cell). */
function expectedFromTable(): unknown[] {
  return [
    ...dateAnswerCases.map(({ expected }) =>
      expected.ok
        ? { ok: true, answers: { when: expected.value } }
        : {
            ok: false,
            answerSet: [],
            fields: { when: [{ code: expected.code, params: {}, path: [] }] },
          },
    ),
    ...dateCellCases.map(({ cell }) => cell),
  ]
}

describe("AC23 date results do not depend on the process time zone (Node, TZ flipped)", () => {
  it("each flip of process.env.TZ really changes the process zone", () => {
    for (const zone of ZONES) {
      process.env.TZ = zone
      expect(localTimeAtNoonUtc(), zone).toBe(LOCAL_TIME_AT_NOON_UTC[zone])
      // The default Intl zone follows too (ICU may name a link, e.g. Asia/Katmandu).
      const defaultZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
      const offsetName = (timeZone: string) =>
        new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" }).format(
          Date.UTC(2026, 0, 15, 12),
        )
      expect(offsetName(defaultZone), zone).toBe(offsetName(zone))
    }
  })

  it("AC23 the shared date table gives identical outputs under every process zone", () => {
    process.env.TZ = ZONES[0]
    const baseline = runTable()
    expect(baseline.slice(0, expectedFromTable().length)).toStrictEqual(expectedFromTable())

    for (const zone of ZONES.slice(1)) {
      process.env.TZ = zone
      expect(localTimeAtNoonUtc(), zone).toBe(LOCAL_TIME_AT_NOON_UTC[zone])
      expect(runTable(), zone).toStrictEqual(baseline)
    }

    // And back again: nothing cached under one zone leaks into another.
    process.env.TZ = ZONES[0]
    expect(runTable()).toStrictEqual(baseline)
  })
})
