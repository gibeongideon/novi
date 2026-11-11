import { describe, expect, it } from "vitest";

import { createFormatter, type FormatSettings, groupDigits } from "../src/index.js";

// lang_parameters exactly as Odoo 20 returns them for en_US (verified live)
const enUS: FormatSettings = {
  lang: {
    code: "en_US",
    direction: "ltr",
    date_format: "%m/%d/%Y",
    time_format: "%I:%M:%S %p",
    grouping: "[3,0]",
    decimal_point: ".",
    thousands_sep: ",",
  },
  currencies: {
    1: { symbol: "$", position: "before", digits: [69, 2] },
    2: { symbol: "€", position: "after", digits: [69, 2] },
    3: { symbol: "KSh", position: "before", digits: [69, 2] },
    4: { symbol: "¥", position: "before", digits: [69, 0] },
  },
  tz: "Africa/Nairobi",
};
const deDE: FormatSettings = {
  ...enUS,
  lang: {
    ...enUS.lang,
    code: "de_DE",
    date_format: "%d.%m.%Y",
    time_format: "%H:%M:%S",
    decimal_point: ",",
    thousands_sep: ".",
  },
  tz: "Europe/Berlin",
};
const enIN: FormatSettings = { ...enUS, lang: { ...enUS.lang, code: "en_IN", grouping: "[3,2,0]" } };

const nbsp = "\u00a0";

describe("numbers", () => {
  const f = createFormatter(enUS);
  it("groups and rounds with the user's separators", () => {
    expect(f.integer(1234567)).toBe("1,234,567");
    expect(f.float(1234.567)).toBe("1,234.57");
    expect(f.float(-0.004)).toBe("0.00");
    expect(f.float(-1234.5, { digits: 1 })).toBe("-1,234.5");
    expect(createFormatter(deDE).float(1234567.891)).toBe("1.234.567,89");
    expect(createFormatter(enIN).integer(1234567)).toBe("12,34,567");
  });
  it("renders false/null as empty (Odoo sends false for unset)", () => {
    expect(f.float(false)).toBe("");
    expect(f.monetary(null, 1)).toBe("");
  });
  it("groupDigits follows Python grouping semantics", () => {
    expect(groupDigits("123", [3, 0], ",")).toBe("123");
    expect(groupDigits("1234567", [3, -1], ",")).toBe("1234,567");
  });
});

describe("monetary", () => {
  const f = createFormatter(enUS);
  it("uses the currency's symbol, position and digits", () => {
    expect(f.monetary(1234.5, 1)).toBe(`$${nbsp}1,234.50`);
    expect(f.monetary(1234.5, 2)).toBe(`1,234.50${nbsp}€`);
    expect(f.monetary(1500, 3)).toBe(`KSh${nbsp}1,500.00`);
    expect(f.monetary(1500.6, 4)).toBe(`¥${nbsp}1,501`);
    expect(f.monetary(10, 999)).toBe("10.00"); // unknown currency: amount only
  });
});

describe("percentage and float_time", () => {
  const f = createFormatter(enUS);
  it("percentage multiplies by 100", () => {
    expect(f.percentage(0.15)).toBe("15%");
    expect(f.percentage(0.1234, { digits: 1 })).toBe("12.3%");
  });
  it("float_time renders hours:minutes", () => {
    expect(f.floatTime(1.5)).toBe("01:30");
    expect(f.floatTime(8.0166667)).toBe("08:01");
    expect(f.floatTime(-0.25)).toBe("-00:15");
    expect(f.floatTime(0)).toBe("00:00");
  });
});

describe("dates", () => {
  it("date uses the user's format and never shifts by timezone", () => {
    expect(createFormatter(enUS).date("2026-11-11")).toBe("11/11/2026");
    expect(createFormatter(deDE).date("2026-03-01")).toBe("01.03.2026");
  });
  it("datetime converts Odoo UTC to the user's timezone", () => {
    // 21:30 UTC = 00:30 next day in Nairobi (UTC+3)
    expect(createFormatter(enUS).datetime("2026-11-11 21:30:00")).toBe("11/12/2026 12:30:00 AM");
    // Berlin is UTC+1 in November
    expect(createFormatter(deDE).datetime("2026-11-11 21:30:00", { seconds: false })).toBe(
      "11.11.2026 22:30",
    );
  });
  it("month and weekday names come from the user's language", () => {
    const f = createFormatter({ ...deDE, lang: { ...deDE.lang, date_format: "%A, %d. %B %Y" } });
    expect(f.date("2026-11-11")).toBe("Mittwoch, 11. November 2026");
  });
});

describe("parseNumber", () => {
  it("reads user-typed numbers with the user's separators", () => {
    expect(createFormatter(enUS).parseNumber("1,234.5")).toBe(1234.5);
    expect(createFormatter(deDE).parseNumber("1.234,5")).toBe(1234.5);
    expect(createFormatter(deDE).parseNumber(" -12,75 ")).toBe(-12.75);
    expect(createFormatter(enUS).parseNumber("12abc")).toBeNaN();
    expect(createFormatter(enUS).parseNumber("")).toBeNaN();
  });
});
