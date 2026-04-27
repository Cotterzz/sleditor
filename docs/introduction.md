# Sleditor

Sleditor is a web-based shader editor application a bit like Shadertoy, and with an emphasis on shadertoy compatibility.

It also has:
WGSL compute support inc output to audio.
Better GLSL audio ouptut
AudioWorklet
Sandboxed JS
Basic AI assist via API and user provided keys
And several other features not found in Shadertoy.

It uses Supabase as a backend and is live and working


# Additional projects

SLUI - a UI library to replace Sleditors built in UI
V2 - the next version of the site, re-architected and refactroed with SLUI as a UI

Both SLUI and V2 are being developed alongside V1 in folders V2 and ui-system

For work pertaining to the live working version of Sleditor, ignore V2 and ui-system. Just know that significant development and changes/improvements will be delegated to V2

We still want to maintain and bugfix V1

There's also a few prototypes in Sleditor lab folder

examples is not connected directly to sleditor, it's just a folder for random/test glsl and the odd shader I want to build in cursor

media is the library of textures, video etc that is served with the live site

there are a lot of project docs in the docs folder, just be aware that much of this is out of date