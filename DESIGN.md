# Runtime panel design

## Authority and mode

Operate mode within the incumbent DSH UI. Follow the existing Role Team and
Cursor settings surfaces, using inherited type and `--dsw-alias-*` theme tokens.
No replacement brand, custom font, raster assets or decorative visualization.

## Structure

Create controls precede the session list and selected session details. A wide
viewport uses a narrow session column; at 640px and below the columns stack.
Native buttons, form labels, disclosure controls, focus outlines and status
messages support keyboard operation. Permissions retain offered choices;
AskUser preserves source question text and indexes.

The selected session exposes cancellation, reconnect, message composition,
usage, Mission task dependencies, artifacts and raw event disclosures. Unknown
provider events remain inspectable. Errors are alerts. Mission confirmation
stays in the host question flow rather than a client-side boolean.

## Verification

Standalone mounted React client in headless Chrome, 1440px and 520px viewport:
inspected desktop and narrow layouts with completed Mission task fixtures.
Fixed input width containment, then confirmed both layouts. Screenshots are
local temporary evidence, not product assets. This does not prove connection
to a running DSH host. SSR registration test and syntax checks also pass.
