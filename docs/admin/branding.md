---
title: Name and icon of the instance
summary: Set the name the instance calls itself and its icon, as the instance admin, without a rebuild
requires: instance-admin
topics: branding, name, icon, logo, favicon, instance admin, settings
order: 30
---

The instance has a **name** and an **icon**. By default they are Taskmanager's own: the name "Taskmanager" and the
built-in icons. The instance admin can change both under **Settings**, then **Branding**.

## Change the name

Type the name, up to 40 characters. The name is plain text: angle brackets and control characters are refused. The
browser tab, the sidebar logo and the pages titles show it on the next load. The texts the server writes use it too.

## Change the icon

Choose a PNG or an SVG file, up to 512 KB:

- a **PNG** must be square and at least 512 by 512 pixels;
- an **SVG** must have an `svg` root and no scripts or event handlers.

The **preview** shows the browser tab with the new name and icon before you save. **Save** stores both. The icon is
served for the tab and for the home-screen icon, and a new icon shows on the next load.

## Go back to the default

**Reset to default** brings back the name "Taskmanager" and the built-in icons. It asks for nothing else.

## Who can do this

Only the instance admin sees the Branding page and can change the name or the icon. Anyone else who opens the address
is sent back to Settings, and the server refuses the change too.

## What does not change

Some things stay the same whatever the name is: the key prefix `arn_`, the environment variable
`TASKMANAGER_API_KEY`, the MCP server key `taskmanager` in an agent's configuration, and the web addresses.
