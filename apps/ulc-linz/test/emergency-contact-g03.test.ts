import { describe, expect, it } from "vitest";
import { ULC_U12_SCRIPT, ULC_U12_CSS } from "../worker/u12-ui";
import {
  ULC_U14_SCRIPT, ULC_U14_CSS,
  ULC_KIDS_SCRIPT, ULC_KIDS_CSS,
} from "../worker/youth-attendance-ui";

const variants = [
  { id: "u12", script: ULC_U12_SCRIPT, css: ULC_U12_CSS },
  { id: "u14", script: ULC_U14_SCRIPT, css: ULC_U14_CSS },
  { id: "kids", script: ULC_KIDS_SCRIPT, css: ULC_KIDS_CSS },
] as const;

function dialer(script: string, prefix: string): (input: unknown) => string | null {
  const signature = "function " + prefix + "DialablePhone(rawPhone) {";
  const begin = script.indexOf(signature);
  const next = script.indexOf("\nfunction open", begin);
  expect(begin).toBeGreaterThanOrEqual(0);
  expect(next).toBeGreaterThan(begin);
  return new Function(
    script.slice(begin, next) + "\nreturn " + prefix + "DialablePhone;",
  )() as (input: unknown) => string | null;
}

describe("G-03.1 emergency-contact call safety and youth UI parity", () => {
  for (const area of variants) {
    it(area.id + ": normalizes only safe phone numbers before creating tel: links", () => {
      const normalize = dialer(area.script, area.id);
      expect(normalize("+43 664 123 45 67")).toBe("tel:+436641234567");
      expect(normalize("0732/123-45")).toBe("tel:073212345");
      expect(normalize("(0664) 99.88")).toBe("tel:06649988");
      for (const invalid of [
        null, "", "12", "123\n456", "123x456", "tel:+43664",
        "javascript:alert(1)", "+43;postd=123", "++431234", "123#45",
        "<img src=x onerror=alert(1)>", "0".repeat(16),
      ]) expect(normalize(invalid)).toBeNull();
    });

    it(area.id + ": preserves the existing details overlay and group-scoped snapshot", () => {
      expect(area.script).toContain("contacts.some((contact) => contact.isEmergency)");
      expect(area.script).toContain("info.dataset." + area.id + "InfoId = person.athleteId;");
      expect(area.script).toContain("info.textContent = hasEmergencyContact ? \"☎\" : \"ⓘ\";");
      expect(area.script).toContain("detailsDialog.showModal()");
      expect(area.script).toContain('call.href = href;');
      expect(area.script).toContain('call.textContent = "☎ Anrufen";');
      expect(area.script).toContain('heading.textContent = group.title;');
      expect(area.script).toContain('name.textContent = contact.contactName');
      expect(area.script).not.toMatch(/\.innerHTML\s*=/);
      expect(area.script).not.toContain("localStorage");
      expect(area.css).toContain(".u12-contact-call".replace("u12", area.id));
      expect(area.css).toContain("height:44px");
      expect(area.css).toContain("min-height:44px");
    });
  }
});
