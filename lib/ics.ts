/**
 * Generate an .ics calendar file string for an interview booking.
 */
export function generateICS({
  title,
  description,
  location,
  startTime,
  durationMinutes,
  organizerEmail,
  attendeeEmail,
}: {
  title: string;
  description: string;
  location?: string;
  startTime: Date;
  durationMinutes: number;
  organizerEmail?: string;
  attendeeEmail: string;
}): string {
  const pad = (n: number) => n.toString().padStart(2, "0");

  const formatDate = (d: Date) => {
    return (
      d.getUTCFullYear().toString() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) +
      "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) +
      "Z"
    );
  };

  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
  const now = new Date();
  const uid = `${now.getTime()}-${Math.random().toString(36).slice(2)}@patternix`;

  const escapeText = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Patternix//Interview Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatDate(now)}`,
    `DTSTART:${formatDate(startTime)}`,
    `DTEND:${formatDate(endTime)}`,
    `SUMMARY:${escapeText(title)}`,
    `DESCRIPTION:${escapeText(description)}`,
  ];

  if (location) {
    lines.push(`LOCATION:${escapeText(location)}`);
  }
  if (organizerEmail) {
    lines.push(`ORGANIZER;CN=Recruiting Team:mailto:${organizerEmail}`);
  }
  lines.push(`ATTENDEE;RSVP=TRUE:mailto:${attendeeEmail}`);
  lines.push("STATUS:CONFIRMED");
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}
