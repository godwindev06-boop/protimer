# ProTimer Templates

## Conference Rundown

[`conference-rundown.csv`](conference-rundown.csv) is a practical sample run of show.

1. Open the CSV in Excel, Numbers, or Google Sheets.
2. Edit the session names, durations, notes, and optional colors.
3. Save it as CSV, then in ProTimer use **Import CSV** under the rundown list. If a rundown already exists, choose **Replace** or **Add to end** (replacing is disabled while a rundown item is running).
4. Or copy the rows you want, click an empty part of the Rundown card and paste. The header can stay selected; ProTimer skips it because it has no valid duration.

**Export CSV** saves the current rundown as `protimer-rundown-YYYY-MM-DD.csv` (UTF-8, `;` separated, `HH:MM:SS` durations). The exported file imports back unchanged, so you can keep one file per service and reuse it.

Accepted column order:

```text
Name, Duration, Optional note, Optional #RRGGBB color
```

Accepted duration formats include minutes (`10`), `MM:SS` (`10:00`), and `HH:MM:SS` (`01:10:00`). Tab-separated rows copied directly from a spreadsheet work too.

## OBS Browser Source

Use [`OBS-BROWSER-SOURCE-CHECKLIST.md`](OBS-BROWSER-SOURCE-CHECKLIST.md) to set up and rehearse a transparent timer overlay, phone remote, and network connection.

## Bitfocus Companion

The dedicated [ProTimer Companion module package](https://github.com/srdjankotarlic/companion-module-protimer/releases/download/v1.1.0/protimer-1.1.0.tgz) includes starter presets for transport, GO, time adjustment, blackout, and speaker messages. In Companion 4, use **Modules → Import module package** and select the downloaded `.tgz`. Generic HTTP remains available as a zero-install fallback.
