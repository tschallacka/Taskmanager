---
title: Write in the editor
summary: Format a task description, paste Markdown and images, insert tables and dates, and know where pasted images end up
requires: staff
topics: editor, description, markdown, paste, images, attachments, tables, slash menu, formatting, dates, files
order: 80
---

A task's description is written in a rich text editor. It saves by itself a moment after you stop typing. This page is
about writing in it. For code, charts and diagrams see
[Code blocks, charts and diagrams](/help/basics/code-blocks-and-diagrams).

## The toolbar, the slash menu and the selection menu

- The **toolbar** at the top of the editor has undo and redo, a **Text style** menu (Text, Heading 1 to 3, quote, code
  block), **bold**, **italic**, **underline**, **strikethrough**, **inline code**, a **highlight** colour picker, a
  **link** button, the three lists (bullet, numbered and **Task list** with tick boxes), a **table** picker, an
  **image** button and a **+** menu with more.
- Type **/** for the **slash menu**: Ask AI, the text styles, lists, quote, code block, **Table**,
  **Image**, **Date**, **Divider**, **Chart** and **Mermaid diagram**. Keep typing to narrow the list.
- **Select** some text and a small menu appears next to it with formatting, links and AI actions.
- Hover over any block to get a handle on its left: add a block below, drag the block, or open its menu.
- **Ask AI** and the AI actions in the selection menu depend on your instance having AI set up. If they do nothing,
  ask whoever runs your instance.

Highlights come in six colours: yellow, green, blue, purple, pink and orange. They are stored by name, so they read well
in both the light and the dark theme.

## Markdown

You can write in Markdown and it turns into formatting. When you **paste** text that looks like Markdown (headings,
lists, quotes, tables, `**bold**`, links, fenced code) the editor converts it into what it describes. Copying out
works the other way: the plain-text side of a copy is Markdown, so a description pastes cleanly into a terminal, a
commit message or another tool.

Pasting behaves like this:

- A lone web address becomes a link. With text selected, pasting an address makes the selection a link.
- Formatted text from a web page or a document keeps its formatting; wrappers that office programs add are cleaned off.
- Several lines of code copied from VS Code land as a code block in the language VS Code reports. A single line
  pastes as ordinary text.
- Inside a code block, a paste goes in exactly as text, so nothing is reinterpreted.
- **Shift+paste** (Ctrl+Shift+V or Cmd+Shift+V) always pastes plain text and skips all of the above.

## Dates and tags

Type **@** and a date in words, such as *tomorrow*, *next Friday* or *in two weeks*, and pick from the list. The date
becomes a small chip in the text. An `@date` is not the task's due date, but when a task has no due date the soonest
`@date` in its description is shown on the card in its place.

Words written with a **#**, like `#launch`, are tinted where they stand. They are just coloured text. For labels you
can filter by, use the label box in the panel; see [Create and edit tasks](/help/basics/tasks).

## Tables

Use the table button, or **Table** in the slash menu, and drag across the grid to pick a size. A table has a header
row. When your cursor is in a table there are handles for rows and columns, **+** edges to add more, and you can drag a
column edge to resize it.

## Images

Paste a picture, drop an image file on the editor, or use the **Image** button or slash command to pick files. The
image is uploaded and shown in the description where you put it.

- Allowed: PNG, JPEG, GIF, WebP and SVG, up to **10 MB** each. At most **15 images** per task.
- An image is stored with its task and is deleted when the task is deleted for good.
- The first image in a description is shown as the **cover** at the top of the task's card.
- The board's **Files** tab lists the images that are in the descriptions of the board's tasks right now. Click one to enlarge it, or click the task's
  name to open the task. Only images are listed; the editor has no other file attachments.
- Anyone who may read a task may open its images: your team, the customer's contacts when the task is shared, and
  anyone at all when the task is shared and the board has a public link. A Team only task's images are private.
- An image you remove from the text is not removed from storage until the task goes. It still counts towards the 15.

If an upload fails you get an *Image upload failed* message and the reason, such as an unsupported type or a file that
is too big.
