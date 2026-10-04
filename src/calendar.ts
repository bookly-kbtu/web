// Client-side .ics download: iOS/Android open it straight into the calendar.
export function addToCalendar(options: {
  title: string;
  start: string;
  end: string;
  location?: string | null;
  description?: string;
}) {
  const stamp = (iso: string) =>
    new Date(iso)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const escape = (value: string) =>
    value
      .replace(/\\/g, "\\\\")
      .replace(/[,;]/g, (m) => `\\${m}`)
      .replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bookly//RU",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@bookly`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(options.start)}`,
    `DTEND:${stamp(options.end)}`,
    `SUMMARY:${escape(options.title)}`,
    ...(options.location ? [`LOCATION:${escape(options.location)}`] : []),
    ...(options.description ? [`DESCRIPTION:${escape(options.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "bookly.ics";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
